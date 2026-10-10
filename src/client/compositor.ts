/**
 * Virtual remapping for the composer's three Enter gestures.
 *
 * `发送消息`, `换行`, and `使用互补的 Queue／Steer 方式` are not product
 * commands: the product declares them as *fixed* input actions, which by
 * design cannot be rebound. They are the composer's own Lexical key handling,
 * so the only way to give them a user-chosen key is to translate the physical
 * gesture before that handling sees it.
 *
 * The mechanism is a physical-to-physical translation. When the user presses a
 * key that the plugin document maps to one of the three gestures, the real
 * event is suppressed and an equivalent gesture for the product's own binding
 * is dispatched in its place:
 *
 * - `发送消息` resolves to a bare Enter.
 * - `换行` resolves to Shift+Enter.
 * - `使用互补的 Queue／Steer 方式` resolves to Control+Enter (Meta+Enter on
 *   macOS), which is the product's own "accelerated delivery" gesture.
 *
 * A cleared gesture dispatches nothing, so its default key does nothing: the
 * plugin hides the real event and never substitutes one.
 *
 * Three properties make this work against the shipped composer:
 *
 * 1. Lexical never inspects `event.isTrusted`, so a dispatched event drives its
 *    root keydown handling exactly like a physical one.
 * 2. Lexical's root listeners are attached on the bubble phase, while this
 *    interception runs at the document capture phase — earlier, which is what
 *    lets `stopPropagation()` keep the original gesture from reaching the
 *    composer or a global shortcut bound to the same key.
 * 3. Lexical recognizes the Enter gesture by `event.key`, not by `event.code`,
 *    so the synthesized event carries `key: 'Enter'` whatever the source key
 *    was.
 *
 * Scope is deliberately narrow: only events originating inside the composer
 * input (`[data-composer-input]`) are translated, so every other shortcut in
 * the window keeps its normal behavior.
 *
 * @module
 */
import { bindingKey, normalizeBinding } from './bindings.ts'
import type { KeyBinding, KeyPlatform, NormalizedKeyBinding, PhysicalModifier } from './bindings.ts'
import { COMPOSER_COMMANDS, composerAccepts, composerDefaults, composerOverrides, gestureFor } from './gestures.ts'
import type { ComposerCommand } from './gestures.ts'

/**
 * Re-exported so callers that already work with the translation layer do not
 * need a second import from `gestures.ts`; both definitions stay there.
 *
 * - `isComposerCommand` answers whether an id names one of the three actions.
 * - `reservedBindingIssue` is the reservation rule this layer's commit path and
 *   the recorder both consult.
 */
export { isComposerCommand, reservedBindingIssue } from './gestures.ts'

/**
 * One user-chosen combination and the gesture it stands for.
 *
 * A cleared or untranslatable action reaches this table as nothing at all, so
 * every entry carries a real gesture: there is no "active but with no effect"
 * state to encode.
 */
interface Mapping {
  readonly binding: KeyBinding
  /** Physical modifiers the substituted event carries. */
  readonly gesture: readonly PhysicalModifier[]
}

/** The installed translation layer. */
export interface ComposerRemap {
  /**
   * Replace the translation table.
   *
   * The record is one profile's composer overrides, so `null` clears an action
   * and an absent key leaves it performing the combination it performs.
   * @param bindings - resolved combination per composer action.
   * @param residue - every other combination this profile writes, so a key the
   * profile gave to another row is left entirely alone here. The composer's own
   * record cannot carry this: a product command's override is not its business,
   * but the key it took must stop being swallowed.
   */
  update(bindings: Readonly<Record<string, KeyBinding | null>>, residue?: readonly KeyBinding[]): void
  /** Release the listener and forget every mapping. */
  dispose(): void
}

/**
 * Install the composer translation layer on one document.
 * @param platform - receiving device, selecting the `primary` expansion.
 * @returns the translation layer.
 */
export function installComposerRemap(platform: KeyPlatform): ComposerRemap {
  /** Physical combination key (see `bindingKey`) to its mapping. */
  let byCombination = new Map<string, Mapping>()
  /** Physical combination key to the command whose chosen key swallows it. */
  let swallowed = new Map<string, ComposerCommand>()
  const synthesized = new WeakSet<Event>()

  const rebuild = (bindings: Readonly<Record<string, KeyBinding | null>>, residue: readonly KeyBinding[] = []): void => {
    const combinations = new Map<string, Mapping>()
    const hidden = new Map<string, ComposerCommand>()
    /** Every combination this profile writes, whichever row wrote it. */
    const resolvedKeys = new Set(residue.map(binding => bindingKey(normalizeBinding(binding, platform))))
    /** Actions the user rebound, by command. */
    const rebound = new Map<ComposerCommand, KeyBinding>()
    /** Actions the user cleared outright. */
    const cleared = new Set<ComposerCommand>()
    // Read through the shared resolver, so the table built here is exactly the
    // table the reference's arbitration sees: an untranslatable override is
    // ignored by both, and a combination assigned to two actions is awarded to
    // the same one on both sides.
    const resolved = composerOverrides(bindings, platform)
    for (const command of COMPOSER_COMMANDS) {
      const chosen = resolved[command]
      if (chosen === undefined) continue
      if (chosen === null) { cleared.add(command); continue }
      rebound.set(command, chosen)
      combinations.set(bindingKey(normalizeBinding(chosen, platform)), {
        binding: chosen, gesture: gestureFor(command, platform),
      })
    }
    // A combination this profile assigns to *any* row is that row's: the
    // composer must leave it entirely alone, whatever it used to reach.
    //
    // Both sources are needed. `bindings` carries the composer actions' own
    // assignments; `resolvedKeys` carries every combination this profile writes,
    // which is what tells the layer that a product command has taken a key a
    // gesture used to perform — the composer only sees events inside the input
    // box, so leaving that key alone is what lets the product's own dispatcher
    // act on it there.
    const claimed = new Set([...combinations.keys(), ...resolvedKeys])
    // One of an action's own combinations is withdrawn exactly while it no
    // longer reaches that action *and* nothing else has taken it: the action was
    // cleared, or it moved to a combination outside the set it answers to.
    //
    // An action the user left alone keeps every combination it performs, and a
    // combination another action has claimed is withdrawn by the pass below.
    // Together those two rules are what make an untouched install behave exactly
    // like the product, a rebound one behave like a move, and a combination the
    // user gave to a command behave like that command's.
    for (const command of COMPOSER_COMMANDS) {
      const replacement = rebound.get(command)
      // An action the user left alone is handled by the pass below: it keeps
      // every combination it performs unless another action has taken one.
      if (replacement === undefined && !cleared.has(command)) continue
      if (replacement !== undefined && composerAccepts(command, replacement, platform)) continue
      for (const binding of composerDefaults(command, platform)) {
        const key = bindingKey(binding)
        if (claimed.has(key)) continue
        hidden.set(key, command)
      }
    }
    // An action the user left alone yields a combination that another action has
    // taken over, so the product does not also act on a key that is now a
    // gesture's own trigger.
    for (const [key, mapping] of combinations) {
      const owner = COMPOSER_COMMANDS.find(command => composerAccepts(command, mapping.binding, platform))
      if (owner === undefined || rebound.has(owner) || cleared.has(owner)) continue
      if (claimed.has(key)) continue
      hidden.set(key, owner)
    }
    byCombination = combinations
    swallowed = hidden
  }

  rebuild({})

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.repeat || synthesized.has(event)) return
    const target = event.target
    // Node-type test rather than `instanceof Element`: the realm a page's
    // element belongs to is not always the one this module was loaded in, and
    // the type check only needs to prove the node can be searched.
    if (target === null || (target as Node).nodeType !== 1) return
    const composer = (target as Element).closest('[data-composer-input]')
    if (composer === null) return
    const combination = combinationOf(event)
    if (combination === null) return
    const mapping = byCombination.get(combination)
    if (mapping === undefined) {
      if (swallowed.has(combination)) suppress(event)
      return
    }
    // The real gesture is withdrawn first: without this the composer would act
    // on the original key as well as on the substituted one.
    suppress(event)
    // Built from the element's own window: a plugin bundle can outlive a realm
    // (a rebuilt frame, a test harness), and the constructor must belong to the
    // document the event is dispatched into.
    const view = composer.ownerDocument?.defaultView
    const SubstitutedEvent = view?.KeyboardEvent ?? KeyboardEvent
    const substituted = new SubstitutedEvent('keydown', {
      key: 'Enter',
      code: mapping.binding.code,
      bubbles: true,
      cancelable: true,
      ...modifierFlags(mapping.gesture),
    })
    synthesized.add(substituted)
    composer.dispatchEvent(substituted)
  }

  document.addEventListener('keydown', onKeyDown, true)
  return {
    update: (bindings, residue) => { rebuild(bindings, residue) },
    dispose: () => { document.removeEventListener('keydown', onKeyDown, true) },
  }
}

/**
 * Read the physical combination a keyboard event carries.
 * @param event - the live event.
 * @returns the combination key, or null when the event cannot be matched.
 */
function combinationOf(event: KeyboardEvent): string | null {
  if (event.code === '') return null
  const modifiers: PhysicalModifier[] = []
  if (event.ctrlKey) modifiers.push('control')
  if (event.altKey) modifiers.push('alt')
  if (event.shiftKey) modifiers.push('shift')
  if (event.metaKey) modifiers.push('meta')
  const ordered = (['control', 'alt', 'shift', 'meta'] as const).filter(value => modifiers.includes(value))
  return [...ordered, event.code].join('+')
}

/**
 * Build the modifier flags for a synthesized gesture.
 * @param gesture - the physical modifiers the gesture performs.
 * @returns the KeyboardEvent init flags.
 */
function modifierFlags(gesture: readonly PhysicalModifier[]): {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
} {
  return {
    ctrlKey: gesture.includes('control'),
    altKey: gesture.includes('alt'),
    shiftKey: gesture.includes('shift'),
    metaKey: gesture.includes('meta'),
  }
}

/**
 * Withdraw one gesture from every other listener.
 * @param event - the live event to suppress.
 */
function suppress(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}
