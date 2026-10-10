/**
 * The plugin's arbitration core.
 *
 * It owns the authoritative document, answers the same questions the product's
 * shortcut service answers for its reference UI, and mirrors every accepted
 * change into the product's own keybinding document so the product keeps
 * dispatching the bindings the user sees here.
 *
 * Mirroring detail worth stating once: the product rejects an edit that would
 * disable another command, so a later assignment is written in two steps —
 * first the displaced commands are cleared, then the new binding is set. Only
 * after both steps does the plugin's own document change, which is why the
 * displacement list survives long enough to be reported to the user.
 *
 * The three composer gestures are the one exception to that write path. They are
 * fixed input actions, not product commands, so the product has no row for their
 * own id and their chosen key is enforced locally by the translation layer this
 * module keeps in step with the document. The product commands they displace are
 * still released through the product.
 */
import { bindingKey, normalizeBinding, presentBinding, sameBinding } from './bindings.ts'
import type { KeyBinding, KeyIssue, KeyPlatform, KeyRuntime, NormalizedKeyBinding } from './bindings.ts'
import { buildCatalog, displacedBindings, emptyCatalog, labelOf, reservedByFixed } from './catalog.ts'
import type { Catalog, ProductCatalogRow, ProductFixedRow } from './catalog.ts'
import { installComposerRemap, isComposerCommand, reservedBindingIssue } from './compositor.ts'
import type { ComposerRemap } from './compositor.ts'
import {
  browserKeymapStorage, emptyDocument, memoryKeymapStorage, overrideCount, parseKeymapDocument, partitionOverrides,
  profileOverrides, serializeKeymapDocument, withOverride, withoutOverride, withProfile,
} from './document.ts'
import type { KeymapDocument, KeymapStorage, ProfileOverrides } from './document.ts'

/** The product's edit operations, mirroring the shipped protocol. */
export type KeymapEdit =
  | { readonly type: 'set'; readonly id: string; readonly binding: KeyBinding | null }
  | { readonly type: 'reset'; readonly id: string }
  | { readonly type: 'reset-all' }

/** The product's save outcomes, plus the plugin's own classification. */
export type KeymapSaveStatus = 'saved' | 'stale' | 'unreadable' | 'write-failed' | 'not-ready' | 'conflict'

/** One displacement the user must be told about. */
export interface Displacement {
  readonly id: string
  readonly label: string
  readonly keys: readonly string[]
}

/** The product's answer to one write, with the catalog it published with it. */
interface WriteResult {
  readonly status: KeymapSaveStatus
  /**
   * Present only on success. A failed release has to be undone from the
   * *pre-operation* bindings, and the catalog returned alongside a successful
   * write is the most recent statement of them the plugin holds.
   */
  readonly snapshot?: { readonly catalog: readonly ProductCatalogRow[] }
}

/** Result of one reviewed edit. */
export interface KeymapSaveResult {
  readonly status: KeymapSaveStatus
  /** Commands whose bindings this edit cleared so the new binding could take the combination. */
  readonly displaced: readonly Displacement[]
  readonly issue?: KeyIssue
  readonly conflicts?: readonly string[]
  /**
   * An already-localized reason, set only by the recorder's own preview when it
   * resolves the problem before reaching the controller. It takes precedence
   * over the status-derived sentence, which cannot know which key was refused.
   */
  readonly message?: string
}

/** The narrow product surface the plugin drives. */
export interface ProductShortcuts {
  readonly runtime: KeyRuntime
  readonly platform: KeyPlatform
  readonly catalog: { getSnapshot(): readonly ProductCatalogRow[] }
  readonly fixedCatalog: { getSnapshot(): readonly ProductFixedRow[] }
  readonly config: { getSnapshot(): { readonly revision: string; readonly status: 'loading' | 'ready' | 'unreadable' } }
  edit(edit: KeymapEdit, revision: string): Promise<{
    readonly status: KeymapSaveStatus
    /**
     * The product's catalog after this write. The plugin uses it to undo a
     * release that a later write in the same operation failed to complete.
     */
    readonly snapshot?: { readonly catalog: readonly ProductCatalogRow[] }
  }>
  recording(active: boolean): Promise<void>
  /**
   * The product's own candidate description. The plugin defers to it for
   * normalization and rejection, because whether a combination is deliverable
   * is a property of the receiving shell and device that the product already
   * resolves — including its per-runtime exceptions, which a second
   * implementation here would get wrong.
   */
  describeBinding(binding: KeyBinding | null): {
    readonly binding: NormalizedKeyBinding | null
    readonly keys: readonly string[]
    readonly issue: KeyIssue | null
  }
}

/** Observable snapshot of the plugin's own state, shaped like the product's config channel. */
export interface KeymapSnapshot {
  readonly document: KeymapDocument
  readonly status: 'loading' | 'ready' | 'unreadable'
  /** Derived display model for the current profile; identity changes only on a real change. */
  readonly model: Catalog
  /** How many commands the current profile customizes. */
  readonly customized: number
}

/** Subscriber of the plugin's state channel. */
export type KeymapListener = () => void

/**
 * Owns the document and reconciles it into the product.
 */
export class KeymapController {
  private document: KeymapDocument = emptyDocument()
  private status: KeymapSnapshot['status'] = 'loading'
  private syncing = false
  /** Model published in the most recent snapshot; rebuilt by every `publish`. */
  private modelCache: Catalog = emptyCatalog()
  private snapshot: KeymapSnapshot = {
    document: this.document, status: 'loading', model: this.modelCache, customized: 0,
  }
  private readonly listeners = new Set<KeymapListener>()
  private readonly storage: KeymapStorage
  private readonly product: ProductShortcuts
  /** Key translation for the three composer gestures, kept in step on every publish. */
  private composer: ComposerRemap | undefined
  /** Set by `persist` when the accepted document did not reach durable storage. */
  private persistFailed = false
  /** Profiles whose stored bytes could not be decoded; editing stays disabled for them. */
  private readonly unreadable = new Set<string>()

  /**
   * @param product - live product shortcuts service.
   * @param storage - preference port; omitted to use the page's own storage, or
   * an in-memory one when the page denies access.
   */
  constructor(product: ProductShortcuts, storage?: KeymapStorage) {
    this.product = product
    this.storage = storage ?? browserKeymapStorage() ?? memoryKeymapStorage()
  }

  /**
   * Install the composer translation layer.
   *
   * Separate from the constructor because it touches the document, and a
   * controller built for a test may have no document at all.
   * @returns nothing; the layer is released by detachComposerRemap.
   */
  attachComposerRemap(): void {
    this.composer ??= installComposerRemap(this.product.platform)
    this.pushComposer()
  }

  /**
   * Hand the translation layer the current profile's assignments.
   *
   * Two sets go over: the composer actions' own overrides, and every other
   * combination this profile writes. The second is what tells the layer to leave
   * a key alone once a product command has taken it from an input gesture;
   * without it the layer would keep swallowing that key inside the input box,
   * and the command would never fire there.
   */
  private pushComposer(): void {
    if (this.composer === undefined) return
    const { composer, product } = partitionOverrides(profileOverrides(this.document, this.profile), isComposerCommand)
    this.composer.update(composer, Object.values(product).filter(binding => binding !== null))
  }

  /**
   * Release the composer translation layer.
   * @returns nothing; the layer is forgotten and must be re-attached to be used.
   */
  detachComposerRemap(): void {
    this.composer?.dispose()
    this.composer = undefined
  }

  /** Current runtime and platform profile key. */
  get profile(): `${KeyRuntime}:${KeyPlatform}` {
    return `${this.product.runtime}:${this.product.platform}`
  }

  /** Receiving device, selecting the `primary` expansion and keycap symbols. */
  get platform(): KeyPlatform {
    return this.product.platform
  }

  /** Receiving shell, selecting the default profile and browser-key admissions. */
  get runtime(): KeyRuntime {
    return this.product.runtime
  }

  /**
   * Read stored preferences and reconcile product bindings.
   * @returns after the first accepted snapshot is published.
   */
  async start(): Promise<void> {
    const raw = this.storage.read()
    const parsed = parseKeymapDocument(raw)
    if (parsed.status === 'invalid') {
      this.status = 'unreadable'
      this.unreadable.add(this.profile)
    } else {
      this.document = parsed.document
      this.status = 'ready'
    }
    this.publish()
    await this.reconcile()
  }

  /**
   * Observe the plugin's state channel.
   * @param listener - callback invoked after every accepted change.
   * @returns disposer releasing the listener.
   */
  subscribe(listener: KeymapListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Read the current snapshot; the reference is stable between changes.
   * @returns the plugin's state.
   */
  getSnapshot(): KeymapSnapshot {
    return this.snapshot
  }

  /** Live product catalog rows. */
  get catalog(): readonly ProductCatalogRow[] {
    return this.product.catalog.getSnapshot()
  }

  /** Live product fixed rows. */
  get fixedCatalog(): readonly ProductFixedRow[] {
    return this.product.fixedCatalog.getSnapshot()
  }

  /**
   * Derive the full display model for the current profile.
   * @returns rows, the editable set, the held combinations, and the reservations.
   */
  model(): ReturnType<typeof buildCatalog> {
    return buildCatalog(this.catalog, this.fixedCatalog, profileOverrides(this.document, this.profile),
      this.product.runtime, this.product.platform)
  }

  /**
   * Describe a candidate combination for the recorder, under the plugin's rules.
   *
   * The order of the checks matches `applySet` and `applyComposer` exactly, so
   * the recorder can never show a combination as acceptable and then have the
   * commit refuse it: the promise the user reads before releasing the keys is
   * the outcome they get.
   *
   * The two paths reach the same verdicts in a different order — the commits ask
   * the plugin's own reservation rules first and the product second, while this
   * asks the product first because it must normalize the candidate before it can
   * test anything about it. What matters is that no combination is accepted here
   * and refused there.
   * @param binding - candidate combination, or null for an unbound command.
   * @param exceptId - command being recorded, excluded from its own displacement list.
   * @returns the normalized binding, its keycaps, any hard rejection, and the
   * editable commands it would displace.
   */
  describeBinding(binding: KeyBinding | null, exceptId = ''): {
    binding: NormalizedKeyBinding | null
    keys: readonly string[]
    issue: KeyIssue | null
    conflicts: readonly string[]
    reserved: readonly string[]
  } {
    const composer = isComposerCommand(exceptId)
    const described = this.product.describeBinding(binding)
    if (described.binding === null) {
      return { binding: null, keys: described.keys, issue: described.issue, conflicts: [], reserved: [] }
    }
    // The reservation rule, then the translation layer's own limits. Both are
    // answered here so the recorder reports the same reason a commit would. A
    // non-null candidate is guaranteed at this point: a null one resolves to a
    // null binding above, which already returned.
    if (binding === null) {
      return { binding: described.binding, keys: described.keys, issue: described.issue, conflicts: [], reserved: [] }
    }
    const reserved = reservedBindingIssue(binding, composer)
    if (reserved !== null) {
      return { binding: described.binding, keys: described.keys, issue: reserved, conflicts: [], reserved: [] }
    }
    if (composer) {
      const problem = composerKeyProblem(binding)
      if (problem !== null) {
        return { binding: described.binding, keys: described.keys, issue: problem, conflicts: [], reserved: [] }
      }
    }
    const model = this.model()
    return {
      binding: described.binding,
      keys: described.keys,
      issue: described.issue,
      conflicts: displacedBindings(model, described.binding, exceptId).map(entry => entry.id),
      reserved: [...reservedByFixed(model, described.binding)],
    }
  }

  /**
   * Forward desktop recording protection to the product bridge.
   * @param active - whether a recorder currently owns keyboard input.
   */
  recording(active: boolean): Promise<void> {
    return this.product.recording(active)
  }

  /**
   * Apply one reviewed edit under the plugin's arbitration.
   *
   * Setting a combination clears every editable row that currently holds it,
   * then writes the new binding. A combination a frozen fixed action holds is
   * refused instead, and the refusal names those actions.
   *
   * `applyComposer` below is the same algorithm for the three input gestures.
   * The two stay separate because their middle steps genuinely differ: a gesture
   * is validated against the translation layer's own limits and never reaches
   * the product, while a command is validated by the product and is written
   * through it. Sharing the tail would hide that difference rather than remove
   * it.
   * @param edit - the requested operation.
   * @param id - command the operation targets, absent for `reset-all`.
   * @returns the outcome plus every displacement the user must be told about.
   */
  async apply(edit: KeymapEdit, id?: string): Promise<KeymapSaveResult> {
    if (this.status !== 'ready' || this.unreadable.has(this.profile)) return { status: 'unreadable', displaced: [] }
    this.persistFailed = false
    const result = await this.dispatch(edit)
    // The product accepted the change but the preference did not reach durable
    // storage, so the choice will not survive a reload. Reporting `saved` here
    // would tell the user something the plugin cannot keep.
    return this.persistFailed && result.status === 'saved' ? { ...result, status: 'write-failed' } : result
  }

  private async dispatch(edit: KeymapEdit): Promise<KeymapSaveResult> {
    switch (edit.type) {
      case 'set': return await this.applySet(edit.id, edit.binding)
      case 'reset': return await this.applyReset(edit.id)
      case 'reset-all': return await this.applyResetAll()
    }
  }

  /**
   * Bind one composer gesture.
   *
   * The gesture's own id is never written to the product: it has no editable
   * command there, so its key is enforced by the translation layer instead. The
   * rows it displaces *are* written, because a product command that loses the
   * combination has to be released through the product like any other. A cleared
   * gesture keeps its row and simply dispatches nothing.
   */
  private async applyComposer(target: string, binding: KeyBinding | null): Promise<KeymapSaveResult> {
    if (binding === null) {
      this.document = withOverride(this.document, this.profile, target, null)
      this.persist()
      return { status: 'saved', displaced: [] }
    }
    // The reservation rule comes first, so the user always gets the one message
    // that names the real reason.
    const reservedComposer = reservedBindingIssue(binding, true)
    if (reservedComposer !== null) return { status: 'conflict', displaced: [], issue: reservedComposer }
    const described = this.product.describeBinding(binding)
    if (described.binding === null) return { status: 'conflict', displaced: [] }
    if (described.issue !== null) return { status: 'conflict', displaced: [], issue: described.issue }
    // A composer gesture needs a plain key of its own: a two-key chord has no
    // single press to translate, and a bare modifier would fire on the modifier
    // itself.
    const problem = composerKeyProblem(binding)
    if (problem !== null) return { status: 'conflict', displaced: [], issue: problem }
    const model = this.model()
    const frozen = reservedByFixed(model, described.binding)
    if (frozen.length > 0) {
      return { status: 'conflict', displaced: [], conflicts: frozen.map(other => labelOf(model, other)) }
    }
    // Every other editable row holding this key yields, exactly as it does for a
    // product command. A gesture the user has not touched still holds the
    // combination it performs, which is why moving onto it displaces it.
    const holders = displacedBindings(model, described.binding, target)
    const displaced: Displacement[] = holders.map(other => ({
      id: other.id,
      label: labelOf(model, other.id),
      keys: presentBinding(other.binding, this.product.platform).keys,
    }))
    // A product command must be released through the product; a composer
    // gesture is released in the plugin's own document alone, because the
    // product has no command row for it. The gesture's own id is never written
    // to the product either — only the rows it displaces are.
    const released = await this.release(holders.filter(other => !isComposerCommand(other.id)))
    if ('failed' in released) return { status: released.failed, displaced: [] }
    let next = this.document
    for (const other of holders) next = withOverride(next, this.profile, other.id, null)
    next = withOverride(next, this.profile, target, normalizeBinding(binding, this.product.platform))
    this.document = next
    this.persist()
    return { status: 'saved', displaced }
  }

  private async applySet(target: string, binding: KeyBinding | null): Promise<KeymapSaveResult> {
    if (isComposerCommand(target)) return await this.applyComposer(target, binding)
    if (binding === null) {
      // Clearing is unconditional: it may never be refused for a conflict.
      const product = await this.write({ type: 'set', id: target, binding: null })
      if (product.status !== 'saved') return { status: product.status, displaced: [] }
      this.document = withOverride(this.document, this.profile, target, null)
      this.persist()
      return { status: 'saved', displaced: [] }
    }
    // The reservation rule comes first: the bare keys and the Enter combinations
    // the product's fixed input actions own can never be dispatched to an
    // editable command, so accepting one would give the user a binding that
    // silently does nothing.
    const reservedCommand = reservedBindingIssue(binding, false)
    if (reservedCommand !== null) return { status: 'conflict', displaced: [], issue: reservedCommand }
    // Deliverability is the product's call, not a second implementation here.
    const described = this.product.describeBinding(binding)
    if (described.binding === null) return { status: 'conflict', displaced: [] }
    if (described.issue !== null) return { status: 'conflict', displaced: [], issue: described.issue }
    const normalized = described.binding
    const model = this.model()
    const reserved = reservedByFixed(model, normalized)
    if (reserved.length > 0) {
      return { status: 'conflict', displaced: [], conflicts: reserved.map(other => labelOf(model, other)) }
    }
    const holders = displacedBindings(model, normalized, target)
    const displaced: Displacement[] = holders.map(other => ({
      id: other.id,
      label: labelOf(model, other.id),
      keys: presentBinding(other.binding, this.product.platform).keys,
    }))
    // Every holder is recorded as cleared, including the composer gestures that
    // needed no product write — the user still has to be told about all of them.
    const outcome = await this.writeWithRelease(target, normalized, holders.filter(other => !isComposerCommand(other.id)))
    if (outcome !== 'saved') return { status: outcome, displaced: [] }
    let next = this.document
    for (const other of holders) next = withOverride(next, this.profile, other.id, null)
    next = withOverride(next, this.profile, target, normalized)
    this.document = next
    this.persist()
    return { status: 'saved', displaced }
  }

  private async applyReset(target: string): Promise<KeymapSaveResult> {
    // A composer gesture has no product command to reset, so only the plugin's
    // own override is dropped — the product's default gesture takes over again.
    if (isComposerCommand(target)) {
      this.document = withoutOverride(this.document, this.profile, target)
      this.persist()
      return { status: 'saved', displaced: [] }
    }
    const written = await this.write({ type: 'reset', id: target })
    if (written.status !== 'saved') return { status: written.status, displaced: [] }
    this.document = withoutOverride(this.document, this.profile, target)
    this.persist()
    return { status: 'saved', displaced: [] }
  }

  private async applyResetAll(): Promise<KeymapSaveResult> {
    // The product's restore-all covers the commands it owns; composer gestures
    // are the plugin's own, so both are dropped together once the write lands.
    const written = await this.write({ type: 'reset-all' })
    if (written.status !== 'saved') return { status: written.status, displaced: [] }
    this.document = withProfile(this.document, this.profile, {})
    this.persist()
    return { status: 'saved', displaced: [] }
  }

  /**
   * Reconcile the product's bindings with the plugin document.
   *
   * Runs after a change from outside the plugin (another install, a restored
   * file, or a command that mounted later). Only differing commands are
   * written, so an already-matching product document is left untouched.
   * @returns after every differing command has been written, or after the first
   * failure to write one.
   */
  async reconcile(): Promise<void> {
    if (this.status !== 'ready' || this.unreadable.has(this.profile)) return
    const overrides = profileOverrides(this.document, this.profile)
    if (Object.keys(overrides).length === 0) return
    this.syncing = true
    this.publish()
    try {
      const model = this.model()
      for (const row of model.rows) {
        if (row.kind !== 'owned' || !row.customized) continue
        const product = this.catalog.find(entry => entry.id === row.id)
        if (product === undefined) continue
        if (sameBinding(product.binding, row.binding)) continue
        await this.write({ type: 'set', id: row.id, binding: row.binding })
      }
    } finally {
      this.syncing = false
      this.publish()
    }
  }

  private async write(edit: KeymapEdit): Promise<WriteResult> {
    const revision = this.product.config.getSnapshot().revision
    return await this.product.edit(edit, revision)
  }

  /**
   * Release every holder, undoing the releases if any of them fails.
   *
   * A failure part-way through would otherwise leave the product with a holder
   * cleared while the plugin document still records it — a divergence the user
   * sees as a binding that came back, and that `reconcile` would write back over
   * whatever the product holds on the next start. So every release is undone
   * before the failure is reported: either the operation lands, or nothing about
   * it does.
   * @param holders - the product commands currently holding the combination.
   * @returns the first failure, or the pre-operation catalog when every holder
   * was released.
   */
  private async release(holders: readonly { readonly id: string }[]): Promise<
    { readonly failed: KeymapSaveStatus } | { readonly before: readonly ProductCatalogRow[] }> {
    // Read once, before any write. The product's snapshot is live: a write
    // mutates the very rows this list holds, so a later read would report the
    // cleared value and "restore" it as if the user had chosen it.
    const before = this.catalog.map(row => ({ ...row }))
    const released: string[] = []
    for (const holder of holders) {
      const cleared = await this.write({ type: 'set', id: holder.id, binding: null })
      if (cleared.status !== 'saved') {
        await this.restore(released, before)
        return { failed: cleared.status }
      }
      released.push(holder.id)
    }
    return { before }
  }

  /**
   * Release every holder through the product, then take the combination.
   * @param target - the command taking the combination.
   * @param binding - the combination to take.
   * @param holders - the product commands currently holding it.
   * @returns the outcome of the release or of the assignment.
   */
  private async writeWithRelease(target: string, binding: NormalizedKeyBinding,
    holders: readonly { readonly id: string }[]): Promise<KeymapSaveStatus> {
    const outcome = await this.release(holders)
    if ('failed' in outcome) return outcome.failed
    const taken = await this.write({ type: 'set', id: target, binding })
    if (taken.status !== 'saved') {
      await this.restore(holders.map(holder => holder.id), outcome.before)
      return taken.status
    }
    return 'saved'
  }

  /**
   * Put released bindings back, best effort.
   *
   * The plugin's document still holds the pre-operation state at this point, so
   * `before` — read before the first write — is the authority for what to
   * restore. A restore that fails is logged rather than reported: the user
   * already has the failure of the operation itself, and `reconcile` will settle
   * the difference on the next start.
   * @param released - command ids already cleared in the product.
   * @param before - the product catalog as it was before the operation began.
   * @returns after every restore has been attempted.
   */
  private async restore(released: readonly string[], before: readonly ProductCatalogRow[]): Promise<void> {
    for (const id of released) {
      const previous = before.find(row => row.id === id)?.binding ?? null
      const result = await this.write({ type: 'set', id, binding: previous })
      if (result.status !== 'saved') {
        console.error(`dsh-better-keymap: could not restore ${id} after a failed assignment`)
      }
    }
  }

  /**
   * Persist the accepted document.
   * @returns whether the document reached durable storage.
   */
  private persist(): boolean {
    let stored = true
    try {
      this.storage.write(serializeKeymapDocument(this.document))
    } catch (error) {
      // The document stays authoritative for this session, but the user has to
      // know their choice will not survive a reload.
      console.warn('dsh-better-keymap: preference write failed', error)
      stored = false
    }
    if (!stored) this.persistFailed = true
    this.publish()
    return stored
  }

  /**
   * Rebuild the snapshot after the product catalog, locale, or command roster
   * changed. The reference calls this from its own subscriptions.
   * @returns nothing; subscribers are notified as part of it.
   */
  refresh(): void {
    this.publish()
  }

  private publish(): void {
    const overrides = profileOverrides(this.document, this.profile)
    this.modelCache = buildCatalog(this.catalog, this.fixedCatalog,
      overrides, this.product.runtime, this.product.platform)
    // The translation layer reads the same document, so it can never disagree
    // with what the reference shows.
    this.pushComposer()
    this.snapshot = {
      document: this.document,
      status: this.status,
      model: this.modelCache,
      customized: overrideCount(this.document, this.profile),
    }
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch (error) {
        console.error('dsh-better-keymap: subscriber failed', error)
      }
    }
  }
}

/**
 * Reject a combination this layer cannot translate.
 *
 * A composer gesture is synthesized from the chosen key, so the key has to be a
 * plain one: a two-key chord has no single physical press to substitute, and
 * `Tab` belongs to the shell's focus traversal. Everything else — including a
 * bare letter or punctuation key — is the user's call; which combinations stay
 * out of reach is decided once, by `reservedBindingIssue`.
 * @param binding - the candidate combination.
 * @returns the rejection reason, or null when the combination is usable.
 */
function composerKeyProblem(binding: KeyBinding): KeyIssue | null {
  if (binding.secondCode !== undefined) return 'unsupported-key'
  if (binding.code === 'Tab') return 'reserved'
  return null
}
