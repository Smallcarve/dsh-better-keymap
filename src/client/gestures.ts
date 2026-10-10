/**
 * What the composer's three rebindable actions are.
 *
 * This module holds the plugin's whole description of those actions and nothing
 * else: their ids, the gesture each one performs on each device, and every
 * combination the shipped composer lets reach them. Two consumers read it, and
 * neither may hold a private copy:
 *
 * - `catalog.ts` derives the reference rows and, more importantly, which
 *   combinations each action currently *holds*, so a later assignment displaces
 *   the action instead of silently sharing the key with it;
 * - `compositor.ts` performs the physical-to-physical translation.
 *
 * Keeping it here also keeps the dependency graph acyclic: the translation layer
 * imports the gesture facts, and the catalog imports them too, but neither
 * imports the other.
 *
 * @module
 */
import { bindingKey, normalizeBinding } from './bindings.ts'
import type { KeyBinding, KeyPlatform, NormalizedKeyBinding, PhysicalModifier } from './bindings.ts'

/** The composer's three rebindable actions, in the product's own catalog order. */
export const COMPOSER_COMMANDS = ['fixed.send', 'fixed.newline', 'fixed.complementary'] as const

/** One of the composer actions the plugin rebinds. */
export type ComposerCommand = (typeof COMPOSER_COMMANDS)[number]

/**
 * Whether an id names one of the composer actions.
 * @param id - a command id from the product catalog or a plugin document.
 * @returns whether the id is one of the three.
 */
export function isComposerCommand(id: string): id is ComposerCommand {
  return COMPOSER_COMMANDS.includes(id as ComposerCommand)
}

/**
 * The three actions the plugin rebinds, and the combination each one performs.
 *
 * The performed combination is fixed product behavior; only the key that
 * triggers it is the user's. Only `performs` is declared here — the *displayed*
 * key for an untouched action comes from this same combination, resolved by
 * `catalog.ts`, so there is no second table to drift.
 */
export const COMPOSER_GESTURES = {
  'fixed.send': {
    performs: { code: 'Enter', modifiers: [] },
  },
  'fixed.newline': {
    performs: { code: 'Enter', modifiers: ['shift'] },
  },
  'fixed.complementary': {
    performs: { code: 'Enter', modifiers: ['primary'] },
  },
} as const satisfies Readonly<Record<string, { performs: KeyBinding }>>

/**
 * The physical modifiers the shipped composer reads for each action.
 *
 * `compositor.ts` synthesizes exactly these on the substituted event, and
 * `composerDefaults` below turns them into the combinations the action answers
 * to. One table, so a gesture can never be translated as one thing and
 * registered as another.
 */
const ACTION_GESTURE: Readonly<Record<ComposerCommand, readonly PhysicalModifier[]>> = {
  'fixed.send': [],
  'fixed.newline': ['shift'],
  'fixed.complementary': ['control'],
}

/** The Meta spelling of the accelerated gesture, which macOS also accepts. */
const ACCELERATED_GESTURE: readonly PhysicalModifier[] = ['meta']

/** The key every composer action uses; only the modifiers distinguish them. */
const COMPOSER_CODE = 'Enter'

/** Keys the translation layer can never turn into a gesture. */
const UNSUPPORTED_CODES = new Set(['Tab', 'CapsLock', 'Fn', 'FnLock', 'NumLock', 'ScrollLock'])

/**
 * Resolve the gesture one action performs on a device.
 * @param command - the composer action.
 * @param platform - receiving device.
 * @returns the modifiers the substituted event carries.
 */
export function gestureFor(command: ComposerCommand, platform: KeyPlatform): readonly PhysicalModifier[] {
  if (command === 'fixed.complementary' && platform === 'macos') return ACCELERATED_GESTURE
  return ACTION_GESTURE[command]
}

/**
 * List every combination one action answers to on a device.
 *
 * On macOS the shipped composer accepts both Control+Enter and Meta+Enter for
 * the accelerated action, so the action holds two combinations there. On every
 * other device `primary` expands to Control, so the two spellings coincide and
 * listing both would double-count one combination.
 * @param command - the composer action.
 * @param platform - receiving device.
 * @returns one resolved combination per combination the action answers to.
 */
export function composerDefaults(command: ComposerCommand, platform: KeyPlatform): readonly NormalizedKeyBinding[] {
  const gestures = command === 'fixed.complementary' && platform === 'macos'
    ? [ACCELERATED_GESTURE, ACTION_GESTURE[command]]
    : [gestureFor(command, platform)]
  return gestures.map(modifiers => normalizeBinding({ code: COMPOSER_CODE, modifiers: [...modifiers] }, platform))
}

/**
 * Whether one combination reaches an action on a device.
 * @param command - the composer action.
 * @param binding - the candidate combination.
 * @param platform - receiving device.
 * @returns whether the action answers to this combination.
 */
export function composerAccepts(command: ComposerCommand, binding: KeyBinding, platform: KeyPlatform): boolean {
  const chosen = bindingKey(normalizeBinding(binding, platform))
  return composerDefaults(command, platform).some(entry => bindingKey(entry) === chosen)
}

/**
 * Whether the translation layer can carry one chosen combination.
 *
 * A chord has no single physical press to substitute, and the shell owns a
 * handful of modifier and lock keys. Which combinations stay out of reach is a
 * separate rule, `reservedBindingIssue`, because that one is about what the
 * window can deliver while this one is about what this layer can translate.
 * @param binding - the candidate combination.
 * @returns whether the layer can translate this combination.
 */
export function isTranslatable(binding: KeyBinding): boolean {
  if (binding.secondCode !== undefined) return false
  return !UNSUPPORTED_CODES.has(binding.code)
}

/**
 * Single keys no editable shortcut may take.
 *
 * These are the product's own fixed input gestures: Enter sends, Escape stops
 * and dismisses, `/` and `@` open the composer's menus, and the arrows walk a
 * menu. Assigning one of them bare would either shadow a gesture the user cannot
 * give up, or fire during ordinary typing. Modifier combinations of the same
 * keys stay available, because those are deliberate.
 */
const RESERVED_SINGLE_CODES = new Set(['Enter', 'Escape', 'Slash', 'Digit2', 'ArrowUp', 'ArrowDown'])

/**
 * The subset the three composer actions may still use.
 *
 * `Enter` is the product's own send key, so an action in the input box may take
 * it; the rest stay out of reach there too.
 */
const COMPOSER_RESERVED_SINGLE_CODES = new Set(['Escape', 'Slash', 'Digit2', 'ArrowUp', 'ArrowDown'])

/**
 * Enter combinations the input box's fixed actions own on every device.
 *
 * The product registers these as *fixed* reservations, and it folds a fixed
 * reservation into every editable row's conflicts unconditionally
 * (`configuration.ts`). A row with conflicts never enters the dispatch table, so
 * an editable command that claims one of them is consumed but never runs: the
 * key does nothing, silently, in the input box and everywhere else.
 *
 * The plugin therefore refuses them for editable commands instead of accepting a
 * binding the window cannot deliver. It cannot lift the reservation either:
 * that would mean replacing the owning plugin's `registerFixed` row, and
 * re-registering a duplicate id throws, which would take that plugin's mount
 * down with it.
 *
 * The three composer actions still take these combinations, because their keys
 * are translated locally and never mirrored into the product.
 */
const RESERVED_COMBINATIONS: readonly (readonly PhysicalModifier[])[] = [['shift'], ['control']]

/**
 * Whether an editable shortcut may take one combination.
 *
 * One rule, one home: the bare keys the product's input gestures own, plus the
 * Enter combinations its fixed reservations lock window-wide. A caller uses this
 * in place of a private copy, so the recorder and the commit can never disagree.
 * @param binding - the candidate combination.
 * @param composer - whether the target is one of the three composer actions.
 * @returns the rejection reason, or null when the combination is available.
 */
export function reservedBindingIssue(
  binding: KeyBinding,
  composer: boolean,
): 'reserved-key' | 'reserved-combination' | null {
  if (binding.secondCode !== undefined) return null
  const single = composer ? COMPOSER_RESERVED_SINGLE_CODES : RESERVED_SINGLE_CODES
  if (binding.modifiers.length === 0) return single.has(binding.code) ? 'reserved-key' : null
  if (composer || binding.code !== COMPOSER_CODE) return null
  return RESERVED_COMBINATIONS.some(modifiers => modifiers.length === binding.modifiers.length
    && modifiers.every(modifier => binding.modifiers.includes(modifier)))
    ? 'reserved-combination'
    : null
}

/**
 * Resolve the combinations one profile's overrides give the composer actions.
 *
 * This is the single answer both consumers read, so the reference's arbitration
 * and the translation layer cannot disagree about the same stored document:
 *
 * - an override the layer cannot carry is ignored, exactly as the layer ignores
 *   it, so the row never claims to hold a key that does nothing;
 * - when one combination is assigned to two actions, the action that comes first
 *   in the product's own catalog order keeps it and the other is dropped, so the
 *   outcome is decided by a stated rule rather than by map insertion order.
 * @param overrides - one profile's override record. A present-but-`undefined`
 * entry is treated as absent, the same way `buildCatalog` treats one.
 * @param platform - receiving device.
 * @returns each action's resolved binding: absent for untouched, `null` for
 * cleared, otherwise the combination the action holds.
 */
export function composerOverrides(
  overrides: Readonly<Record<string, KeyBinding | null | undefined>>,
  platform: KeyPlatform,
): Readonly<Record<ComposerCommand, KeyBinding | null | undefined>> {
  const claimed = new Set<string>()
  const resolved: Record<string, KeyBinding | null | undefined> = {}
  for (const command of COMPOSER_COMMANDS) {
    const chosen = overrides[command]
    if (chosen === undefined) continue
    if (chosen === null) { resolved[command] = null; continue }
    if (!isTranslatable(chosen)) continue
    const key = bindingKey(normalizeBinding(chosen, platform))
    if (claimed.has(key)) continue
    claimed.add(key)
    resolved[command] = chosen
  }
  return resolved
}
