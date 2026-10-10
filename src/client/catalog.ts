/**
 * The plugin's editable command catalog.
 *
 * Rows are derived from the live product catalog published by `ctx.shortcuts`,
 * so ids, localized labels, aliases, and defaults always come from the product
 * itself rather than from a copy that can drift. The names below are the shipped
 * product's own command ids, kept in one place only to fix the display order and
 * to document which feature owns each action.
 */
import { bindingIssue, normalizeBinding, overlappingBindings, presentBinding } from './bindings.ts'
import type { KeyBinding, KeyIssue, KeyPlatform, KeyRuntime, NormalizedKeyBinding } from './bindings.ts'
import { COMPOSER_GESTURES, composerDefaults, composerOverrides, isComposerCommand } from './gestures.ts'

/** Read-only product catalog row, structurally compatible with the product's own entry. */
export interface ProductCatalogRow {
  readonly id: string
  readonly label: string
  readonly aliases: readonly string[]
  readonly keys: readonly string[]
  readonly aria: string | undefined
  readonly binding: NormalizedKeyBinding | null
}

/** Read-only fixed action row; its combinations are reserved and never editable. */
export interface ProductFixedRow {
  readonly id: string
  readonly label: string
  readonly keys: readonly string[]
  readonly bindings: readonly NormalizedKeyBinding[]
  readonly group: 'application' | 'input' | 'menus' | 'approval'
}

/** Display groups, in the order the reference renders them. */
export const GROUP_ORDER = ['application', 'input', 'menus', 'approval'] as const

/** One display group key. */
export type GroupKey = (typeof GROUP_ORDER)[number]

/** Product command ordering inside the application group. */
const CORE_ACTION_ORDER = [
  'shortcuts.open',
  'session.new',
  'sidebar.left.toggle',
  'session.search',
  'workspace.add',
  'session.rename',
  'session.fork',
  'session.archive',
  'settings.open',
  'workspace.openLocal',
  'sidebar.right.toggle',
  'workspace.files',
  'browser.new',
  'terminal.new',
  'pane.split',
  'pane.fullscreen.toggle',
  'page.refresh',
  'page.close',
].reduce((order, id, index) => order.set(id, index), new Map<string, number>())

/** One editable row with the plugin's own arbitration already applied. */
export interface OwnedRow {
  readonly kind: 'owned'
  readonly id: string
  readonly label: string
  readonly group: 'application'
  readonly binding: NormalizedKeyBinding | null
  readonly keys: readonly string[]
  readonly aria: string | undefined
  /** True when the plugin document carries an explicit override for this command. */
  readonly customized: boolean
  /** Editable commands this binding collides with under the plugin's own arbitration. */
  readonly conflicts: readonly string[]
  /** Fixed actions this binding collides with; these cannot be cleared. */
  readonly reservedBy: readonly string[]
  readonly issue: KeyIssue | null
  /** Search terms, mirroring the shipped reference's matching inputs. */
  readonly names: readonly string[]
}

/** One row the reference renders under a group heading. */
export interface FixedRow {
  readonly kind: 'fixed'
  readonly id: string
  readonly label: string
  readonly group: Exclude<GroupKey, 'application'>
  readonly keys: readonly string[]
  readonly names: readonly string[]
  /**
   * True when the plugin rebinds this fixed action rather than merely showing
   * it: the reference renders the row as editable and the interception layer
   * enforces the user's key.
   */
  readonly composer: boolean
}

/**
 * One editable row, whichever kind it came from.
 *
 * The reference and the recorder work on this shape alone, so a product command
 * and a rebindable composer gesture are edited by exactly the same controls.
 */
export interface EditableRow {
  readonly id: string
  readonly label: string
  readonly group: GroupKey
  /** True when the plugin document carries an explicit override for this row. */
  readonly customized: boolean
  /** True when the row is a composer gesture rather than a product command. */
  readonly composer: boolean
  /** The combination this row performs; null when it is unbound. */
  readonly binding: NormalizedKeyBinding | null
  readonly keys: readonly string[]
}

/** Any row the reference renders. */
export type CatalogRow = OwnedRow | FixedRow

/** The complete display model derived in one pass. */
export interface Catalog {
  readonly rows: readonly CatalogRow[]
  /**
   * Every rebindable row, product commands first.
   *
   * The three composer gestures appear here as well as in `rows`: that is what
   * lets the reference render them in the input group while the recorder edits
   * them like any other row.
   */
  readonly editable: readonly EditableRow[]
  /**
   * Every combination an editable row currently answers to, product commands
   * and composer gestures alike, resolved against the plugin document.
   *
   * Arbitration reads this rather than the product catalog, because the
   * product's own `binding` is only the default: once the user moves a command,
   * its override is what the window dispatches and what a later assignment has
   * to displace.
   */
  readonly editables: readonly { readonly id: string; readonly binding: NormalizedKeyBinding }[]
  /** Combinations held by fixed actions the plugin does not rebind. */
  readonly frozen: readonly { readonly id: string; readonly binding: NormalizedKeyBinding }[]
}

/**
 * An empty model, used as the controller's placeholder before the first publish.
 * @returns a model with no rows and no occupancy.
 */
export function emptyCatalog(): Catalog {
  return { rows: [], editable: [], editables: [], frozen: [] }
}

/**
 * Sort key for one editable command, reproducing the shipped reference order.
 * @param id - product command id.
 * @returns the ordering rank.
 */
function rowRank(id: string): number {
  return CORE_ACTION_ORDER.get(id) ?? CORE_ACTION_ORDER.size
}

/**
 * Build search terms exactly as the shipped reference does.
 * @param row - product catalog row.
 * @returns every name the fuzzy matcher searches.
 */
function ownedNames(row: ProductCatalogRow): readonly string[] {
  const joined = row.keys.filter(key => key !== '+').join('+')
  return [
    ...row.aliases,
    joined,
    row.keys.filter(key => key !== '+').join(''),
    row.aria ?? '',
    row.aria?.replace('Meta', 'Cmd') ?? '',
  ]
}

/**
 * Resolve every combination one composer gesture holds for arbitration.
 *
 * A gesture the user has not touched still answers to the combinations it
 * performs, which is what makes moving onto one of them displace it. A cleared
 * gesture occupies nothing, so it can neither displace nor be displaced.
 *
 * The decision comes from the translation layer's own resolver, not from a
 * second opinion here, so the model and the layer always agree about the same
 * document: an override the layer cannot carry holds nothing, and a combination
 * two actions were both assigned belongs to the one the layer awarded it to.
 * @param id - the fixed row's command id.
 * @param resolved - the layer's resolution of this profile's overrides.
 * @param platform - receiving device.
 * @returns one entry per combination the gesture holds.
 */
function composerBindings(
  id: string,
  resolved: Readonly<Record<string, KeyBinding | null | undefined>>,
  platform: KeyPlatform,
): readonly NormalizedKeyBinding[] {
  if (!isComposerCommand(id)) return []
  const chosen = resolved[id]
  if (chosen === undefined) return composerDefaults(id, platform)
  return chosen === null ? [] : [normalizeBinding(chosen, platform)]
}

/**
 * Resolve the combination a composer gesture displays.
 *
 * Unlike {@link composerBindings}, an untouched gesture shows the combination it
 * performs: that is the product's own key, and it is what the reference must
 * show before the user changes anything. An override the translation layer
 * cannot carry is not shown either, because the row must never name a key that
 * does nothing.
 * @param id - the fixed row's command id.
 * @param resolved - the layer's resolution of this profile's overrides.
 * @param platform - receiving device.
 * @returns the displayed combination, or null when nothing is in force.
 */
function composerDisplay(
  id: string,
  resolved: Readonly<Record<string, KeyBinding | null | undefined>>,
  platform: KeyPlatform,
): NormalizedKeyBinding | null {
  const gesture = COMPOSER_GESTURES[id as keyof typeof COMPOSER_GESTURES]
  if (gesture === undefined) return null
  const chosen = resolved[id]
  if (chosen === undefined) return normalizeBinding(gesture.performs, platform)
  return chosen === null ? null : normalizeBinding(chosen, platform)
}

/**
 * Resolve every combination an editable row currently answers to, product
 * commands and composer gestures alike.
 *
 * The product's own `binding` is only a default: once the user overrides a
 * command, that override is what the window dispatches. Arbitration therefore
 * reads the plugin document, or a later assignment would both miss the real
 * holder and wrongly refuse a key the user already moved away from.
 * @param catalog - live product catalog rows.
 * @param fixed - live product fixed rows.
 * @param overrides - the plugin's explicit overrides for the current profile.
 * @param composer - the translation layer's resolution of the composer subset.
 * @param platform - receiving device.
 * @returns one entry per held combination, so a row may contribute several.
 */
function editableBindings(
  catalog: readonly ProductCatalogRow[],
  fixed: readonly ProductFixedRow[],
  overrides: Readonly<Record<string, KeyBinding | null>>,
  composer: Readonly<Record<string, KeyBinding | null | undefined>>,
  platform: KeyPlatform,
): { id: string; binding: NormalizedKeyBinding }[] {
  const entries: { id: string; binding: NormalizedKeyBinding }[] = []
  for (const row of catalog) {
    const candidate = Object.hasOwn(overrides, row.id) ? overrides[row.id] : row.binding
    if (candidate === null) continue
    entries.push({ id: row.id, binding: normalizeBinding(candidate, platform) })
  }
  for (const row of fixed) {
    for (const binding of composerBindings(row.id, composer, platform)) {
      entries.push({ id: row.id, binding })
    }
  }
  return entries
}

/**
 * Fixed actions that belong to a dialog or a menu rather than to the window.
 *
 * These own the bare keys a dialog navigates with: Enter picks the highlighted
 * item, Escape dismisses the layer. Their whole point is that the *focused
 * layer* decides, so a gesture living in the composer is a different use of the
 * same key and must not be refused because one of them exists. Every other
 * fixed action genuinely reserves its combination window-wide.
 */
const DIALOG_SCOPED_ACTIONS = new Set([
  'fixed.move',
  'fixed.select',
  'fixed.dismiss',
  'approval.allow',
  'approval.reject',
])

/**
 * List the combinations no editable row may take without asking.
 *
 * Two kinds of fixed action are deliberately absent:
 *
 * - a composer gesture, because the plugin rebinds it and it therefore yields
 *   to a later assignment instead of refusing it;
 * - a dialog-scoped action, because its bare key is resolved by the focused
 *   layer, so it never contends with the composer for the same press.
 * @param fixed - live product fixed rows.
 * @param platform - receiving device.
 * @returns every combination a window-wide fixed action reserves.
 */
function frozenBindings(
  fixed: readonly ProductFixedRow[],
  platform: KeyPlatform,
): { id: string; binding: NormalizedKeyBinding }[] {
  return fixed
    .filter(row => COMPOSER_GESTURES[row.id as keyof typeof COMPOSER_GESTURES] === undefined)
    .filter(row => !DIALOG_SCOPED_ACTIONS.has(row.id))
    .flatMap(row => row.bindings.map(binding => ({ id: row.id, binding: normalizeBinding(binding, platform) })))
}

/**
 * Derive the full display model from live product catalogs plus the plugin document.
 *
 * Effective bindings resolve in this order: an explicit override in the plugin
 * document (`null` meaning cleared), otherwise the product's own resolved
 * binding. That is what makes a fresh install behave exactly like Harness, and
 * an absent product default stay unbound.
 * @param catalog - live product catalog rows.
 * @param fixed - live product fixed rows.
 * @param overrides - the plugin's explicit overrides for the current profile.
 * @param runtime - receiving shell.
 * @param platform - receiving device.
 * @returns rows, effective bindings, and the fixed reservation index.
 */
export function buildCatalog(
  catalog: readonly ProductCatalogRow[],
  fixed: readonly ProductFixedRow[],
  overrides: Readonly<Record<string, KeyBinding | null>>,
  runtime: KeyRuntime,
  platform: KeyPlatform,
): Catalog {
  const effective = new Map<string, NormalizedKeyBinding | null>()
  for (const row of catalog) {
    const candidate = Object.hasOwn(overrides, row.id) ? overrides[row.id] : row.binding
    effective.set(row.id, candidate === null ? null : normalizeBinding(candidate, platform))
  }
  const usable = catalog.flatMap(row => {
    const binding = effective.get(row.id) ?? null
    if (binding === null) return []
    return [{ id: row.id, binding, issue: bindingIssue(binding, runtime, platform) }]
  })
  // Arbitration reads the plugin document, not the product's defaults; see
  // `Catalog.editables`. A composer gesture that is cleared holds nothing, so it
  // blocks no key and can be displaced by nothing.
  //
  // Every composer decision below reads this one resolution, so the rows, the
  // arbitration and the translation layer cannot disagree about one document.
  const composer = composerOverrides(overrides, platform)
  const editables = editableBindings(catalog, fixed, overrides, composer, platform)
  const frozen = frozenBindings(fixed, platform)
  const rows: CatalogRow[] = []
  for (const row of catalog) {
    const binding = effective.get(row.id) ?? null
    const customized = Object.hasOwn(overrides, row.id)
    rows.push({
      kind: 'owned',
      id: row.id,
      label: row.label,
      group: 'application',
      binding,
      names: ownedNames(row),
      ...arbitration(row, binding, customized, usable, frozen, runtime, platform),
    })
  }
  rows.sort((left, right) => rowRank(left.id) - rowRank(right.id) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  for (const row of fixed) {
    // A composer action is rebindable whether or not the user has changed it;
    // `composer` marks it editable and the key shown is whatever is in force.
    const gesture = COMPOSER_GESTURES[row.id as keyof typeof COMPOSER_GESTURES]
    const shown = gesture === undefined ? null : composerDisplay(row.id, composer, platform)
    rows.push({
      kind: 'fixed',
      id: row.id,
      label: row.label,
      group: row.group === 'application' ? 'input' : row.group,
      keys: gesture === undefined ? row.keys : presentBinding(shown, platform).keys,
      // Search terms follow what the row shows, so searching the key the user
      // just set finds the action they set it on; the product's own spelling
      // stays as well, because `恢复默认` will bring it back.
      names: gesture === undefined
        ? [row.id, row.keys.join(' ')]
        : [row.id, ...presentBinding(shown, platform).keys.filter(key => key !== '+'), row.keys.join(' ')],
      composer: gesture !== undefined,
    })
  }
  return {
    rows,
    editable: buildEditable(catalog, fixed, overrides, composer, effective, usable, frozen, runtime, platform),
    editables,
    frozen,
  }
}

/**
 * Build the unified editable view over product commands and composer gestures.
 *
 * Product commands come first in product order, then the composer gestures in
 * the order the product lists them. Both carry the same arbitration fields, so
 * one recorder serves both.
 * @param catalog - live product catalog rows.
 * @param fixed - live product fixed rows.
 * @param overrides - the plugin's explicit overrides for the current profile.
 * @param composer - the translation layer's resolution of the composer subset.
 * @param effective - resolved binding per product command.
 * @param usable - product commands whose own binding is deliverable.
 * @param frozen - every combination a fixed action the plugin cannot rebind reserves.
 * @param runtime - receiving shell.
 * @param platform - receiving device.
 * @returns the unified editable rows.
 */
function buildEditable(
  catalog: readonly ProductCatalogRow[],
  fixed: readonly ProductFixedRow[],
  overrides: Readonly<Record<string, KeyBinding | null>>,
  composer: Readonly<Record<string, KeyBinding | null | undefined>>,
  effective: ReadonlyMap<string, NormalizedKeyBinding | null>,
  usable: readonly { id: string; binding: NormalizedKeyBinding; issue: KeyIssue | null }[],
  frozen: readonly { id: string; binding: NormalizedKeyBinding }[],
  runtime: KeyRuntime,
  platform: KeyPlatform,
): readonly EditableRow[] {
  const rows: EditableRow[] = []
  for (const row of catalog) {
    const binding = effective.get(row.id) ?? null
    const customized = Object.hasOwn(overrides, row.id)
    rows.push({
      id: row.id,
      label: row.label,
      group: 'application',
      customized,
      composer: false,
      binding,
      ...arbitration(row, binding, customized, usable, frozen, runtime, platform),
    })
  }
  for (const row of fixed) {
    const gesture = COMPOSER_GESTURES[row.id as keyof typeof COMPOSER_GESTURES]
    if (gesture === undefined) continue
    // A gesture is rebindable whether or not the user has changed it: the row is
    // editable either way, and `customized` is what distinguishes the two. An
    // override the translation layer rejected is not a customization, because it
    // changed nothing.
    const chosen = composer[row.id]
    const customized = chosen !== undefined
    const binding = chosen === undefined
      ? normalizeBinding(gesture.performs, platform)
      : composerDisplay(row.id, composer, platform)
    rows.push({
      id: row.id,
      label: row.label,
      group: row.group === 'application' ? 'input' : row.group,
      customized,
      composer: true,
      binding,
      keys: presentBinding(binding, platform).keys,
    })
  }
  return rows
}

/**
 * Build the shared arbitration fields of one product command row.
 * @param row - the product catalog row.
 * @param binding - its effective binding.
 * @param customized - whether the plugin document overrides it.
 * @param usable - product commands whose own binding is deliverable.
 * @param frozen - every combination a fixed action the plugin cannot rebind reserves.
 * @param runtime - receiving shell.
 * @param platform - receiving device.
 * @returns the keycaps plus the conflict and issue fields.
 */
function arbitration(
  row: ProductCatalogRow,
  binding: NormalizedKeyBinding | null,
  customized: boolean,
  usable: readonly { id: string; binding: NormalizedKeyBinding; issue: KeyIssue | null }[],
  frozen: readonly { id: string; binding: NormalizedKeyBinding }[],
  runtime: KeyRuntime,
  platform: KeyPlatform,
): {
  keys: readonly string[]
  aria: string | undefined
  customized: boolean
  conflicts: readonly string[]
  reservedBy: readonly string[]
  issue: KeyIssue | null
} {
  const present = presentBinding(binding, platform)
  return {
    keys: present.keys,
    aria: present.aria,
    customized,
    conflicts: binding === null ? [] : usable
      .filter(other => other.id !== row.id && other.issue === null && overlappingBindings(other.binding, binding))
      .map(other => other.id),
    reservedBy: binding === null ? [] : frozen
      .filter(other => overlappingBindings(other.binding, binding))
      .map(other => other.id),
    issue: binding === null ? null : bindingIssue(binding, runtime, platform),
  }
}

/**
 * Find every editable row that currently occupies a candidate combination.
 *
 * Unlike the row-level `conflicts` field, this deliberately ignores whether a
 * holder is itself usable: a row whose own binding is refused still holds the
 * combination in the document, and taking the combination has to clear it.
 * Composer gestures are included, so a key the user moves onto one of them is
 * taken from it and reported like any other displacement.
 * @param catalog - derived display model.
 * @param binding - the candidate combination.
 * @param exceptId - the row being assigned, which cannot displace itself.
 * @returns the displaced rows, in catalog order.
 */
export function displacedBindings(catalog: Catalog, binding: NormalizedKeyBinding,
  exceptId: string): readonly { id: string; binding: NormalizedKeyBinding }[] {
  return catalog.editables.filter(other => other.id !== exceptId && overlappingBindings(other.binding, binding))
}

/**
 * Find every frozen fixed action that holds a candidate combination.
 *
 * A non-empty result is a refusal: `applySet` and `applyComposer` both reject the
 * assignment and report these ids through `KeymapSaveResult.conflicts`, which the
 * reference renders as 「…为固定操作，无法被覆盖」. The frozen set is exactly the
 * actions that cannot yield, so there is nothing to displace and no `issue` to
 * carry — the ids themselves are the reason.
 *
 * Composer gestures are excluded: the plugin rebinds them, so they yield to a
 * later assignment and appear in `displacedBindings` instead.
 * @param catalog - derived display model.
 * @param binding - the candidate combination.
 * @returns the fixed command ids blocking this combination.
 */
export function reservedByFixed(catalog: Catalog, binding: NormalizedKeyBinding): readonly string[] {
  return catalog.frozen
    .filter(other => overlappingBindings(other.binding, binding))
    .map(other => other.id)
}

/**
 * Resolve a label for a command id, falling back to the raw id when the command
 * is not currently registered (a plugin that unmounted after a binding was saved).
 * @param catalog - derived display model.
 * @param id - command id to name.
 * @returns the localized label or the id.
 */
export function labelOf(catalog: Catalog, id: string): string {
  return catalog.rows.find(row => row.id === id)?.label ?? id
}
