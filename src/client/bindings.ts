/**
 * Physical-key protocol for the plugin's own binding decisions.
 *
 * The plugin deliberately keeps this layer private instead of importing
 * `@deepseek-ai/dsh-client-shortcuts`, because a distributed plugin must not
 * add a module-table request for another feature plugin's row. The rules below
 * reproduce the shipped physical-key grammar exactly: the same code alphabet,
 * the same logical `primary` expansion, the same canonical modifier order, and
 * the same two-key overlap semantics used for conflict detection.
 */

/** Operating system of the device receiving input. */
export type KeyPlatform = 'macos' | 'windows' | 'linux'

/** Application shell selecting which binding profile applies. */
export type KeyRuntime = 'desktop' | 'web'

/** Runtime and operating system selecting one preference profile. */
export type KeyProfile = `${KeyRuntime}:${KeyPlatform}`

/** Logical `primary` expands to Meta on macOS and Control elsewhere. */
export type KeyModifier = 'primary' | 'control' | 'alt' | 'shift' | 'meta'

/** One or two distinct physical keys held together, plus an exact modifier set. */
export interface KeyBinding {
  readonly code: string
  readonly secondCode?: string
  readonly modifiers: readonly KeyModifier[]
}

/** A binding whose logical modifiers are already expanded and ordered. */
export interface NormalizedKeyBinding {
  readonly code: string
  readonly secondCode?: string
  readonly modifiers: readonly PhysicalModifier[]
}

/** Modifier actually held on the physical keyboard. */
export type PhysicalModifier = 'control' | 'alt' | 'shift' | 'meta'

/**
 * Why a candidate combination cannot be used at all.
 *
 * `reserved` is the product's own classification. `reserved-key` and
 * `reserved-combination` are the plugin's rule for the bare keys and the Enter
 * combinations the product's fixed input actions own: the product folds a fixed
 * reservation into every editable row's conflicts, and a conflicting row is
 * consumed without ever running.
 */
export type KeyIssue = 'reserved' | 'reserved-key' | 'reserved-combination'
  | 'unsupported-browser' | 'modifier-required' | 'unsupported-key'

/** Every profile the plugin stores independently, in document order. */
export const KEY_PROFILES: readonly KeyProfile[] = [
  'desktop:macos', 'desktop:windows', 'desktop:linux',
  'web:macos', 'web:windows', 'web:linux',
]

/**
 * The physical codes the plugin accepts, in one place.
 *
 * `KEY_NAMES` carries two jobs that happen to share a key set: it is the
 * allowlist for codes outside `CODE_PATTERN`, and it is the visible keycap
 * table.
 */
const KEY_NAMES: Readonly<Record<string, string>> = {
  Slash: '/', Comma: ',', Period: '.', Backslash: '\\', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Enter: 'Enter',
  Escape: 'Esc', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
}

/** Canonical modifier order; it is also the keycap order. */
const MODIFIER_ORDER: readonly PhysicalModifier[] = ['control', 'alt', 'shift', 'meta']

/** Letter, digit, and function keys whose code is derivable from the pattern. */
const CODE_PATTERN = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/u

/**
 * Expand logical modifiers, validate physical codes, and canonicalize order.
 * @param binding - declared combination.
 * @param platform - receiving device, selecting the `primary` expansion.
 * @returns the canonical binding.
 * @throws {Error} when a code is outside the accepted alphabet or the two keys coincide.
 */
export function normalizeBinding(binding: KeyBinding, platform: KeyPlatform): NormalizedKeyBinding {
  const codes: [string, ...string[]] = [binding.code, ...binding.secondCode === undefined ? [] : [binding.secondCode]]
  codes.sort()
  for (const code of codes) {
    if (!CODE_PATTERN.test(code) && !Object.hasOwn(KEY_NAMES, code)) {
      throw new Error(`Unsupported shortcut code: ${code}`)
    }
  }
  if (codes.length === 2 && codes[0] === codes[1]) throw new Error('Shortcut keys must be distinct')
  const expanded = new Set(binding.modifiers.map(value =>
    value === 'primary' ? (platform === 'macos' ? 'meta' : 'control') : value))
  return {
    code: codes[0],
    ...(codes[1] === undefined ? {} : { secondCode: codes[1] }),
    modifiers: MODIFIER_ORDER.filter(value => expanded.has(value)),
  }
}

/**
 * Build the exact-match index used for both storage and conflict detection.
 * @param binding - normalized combination.
 * @returns a stable key joining canonical modifiers and sorted codes.
 */
export function bindingKey(binding: NormalizedKeyBinding): string {
  const codes = binding.secondCode === undefined ? [binding.code] : [binding.code, binding.secondCode].sort()
  return [...binding.modifiers, ...codes].join('+')
}

/**
 * Decide whether two combinations cannot both be bound.
 *
 * The rule mirrors the shipped arbitration: an identical combination collides,
 * and under the same modifier set a single key collides with any two-key chord
 * that contains it.
 * @param left - normalized candidate.
 * @param right - normalized occupant.
 * @returns whether the two combinations overlap.
 */
export function overlappingBindings(left: NormalizedKeyBinding, right: NormalizedKeyBinding): boolean {
  if (left.modifiers.join('+') !== right.modifiers.join('+')) return false
  if (left.secondCode !== undefined && right.secondCode !== undefined) return bindingKey(left) === bindingKey(right)
  return [left.code, left.secondCode].some(code => code !== undefined && (code === right.code || code === right.secondCode))
}

/**
 * Compare two resolved combinations for equality.
 *
 * The controller's `reconcile` asks this when it checks whether a product row
 * still matches the plugin document. It lives with the type it compares rather
 * than being re-derived beside that caller.
 * @param left - one normalized combination, or null for unbound.
 * @param right - the other.
 * @returns whether both name the same physical combination.
 */
export function sameBinding(left: NormalizedKeyBinding | null, right: NormalizedKeyBinding | null): boolean {
  if (left === null || right === null) return left === right
  return left.code === right.code && left.secondCode === right.secondCode
    && left.modifiers.join('+') === right.modifiers.join('+')
}

/**
 * Format keycaps and the ARIA accelerator for one combination.
 *
 * Windows separates modifiers with `+`; other platforms place them adjacently.
 * A two-key chord omits ARIA because the attribute accepts one non-modifier key.
 * @param binding - normalized combination, or null for an unbound command.
 * @param platform - receiving device.
 * @returns visible keycaps and the ARIA accelerator.
 */
export function presentBinding(binding: NormalizedKeyBinding | null, platform: KeyPlatform): {
  keys: readonly string[]
  aria: string | undefined
} {
  if (binding === null) return { keys: [], aria: undefined }
  const key = KEY_NAMES[binding.code] ?? binding.code.replace(/^(Key|Digit)/u, '')
  const symbols = platform === 'macos'
    ? { control: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { control: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' }
  const ariaNames = { control: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta' }
  const ariaKey = binding.code === 'Space' ? 'Space'
    : binding.code === 'Escape' ? 'Escape'
      : binding.code.startsWith('Arrow') ? binding.code : key
  const second = binding.secondCode === undefined
    ? []
    : [KEY_NAMES[binding.secondCode] ?? binding.secondCode.replace(/^(Key|Digit)/u, '')]
  const keys = [...binding.modifiers.map(value => symbols[value]), key]
  return {
    keys: [...platform === 'windows' ? keys.flatMap((label, index) => index === 0 ? [label] : ['+', label]) : keys, ...second],
    aria: binding.secondCode === undefined
      ? [...binding.modifiers.map(value => ariaNames[value]), ariaKey].join('+')
      : undefined,
  }
}

/**
 * Reject combinations no device can deliver or that collide with text editing.
 * @param binding - normalized candidate.
 * @param runtime - receiving shell.
 * @param platform - receiving device.
 * @returns the rejection reason, or null when the combination is usable.
 */
export function bindingIssue(binding: NormalizedKeyBinding, runtime: KeyRuntime, platform: KeyPlatform): KeyIssue | null {
  if (runtime === 'desktop' && (platform === 'windows' || platform === 'macos')) return null
  if (binding.secondCode !== undefined) return 'unsupported-key'
  if (binding.modifiers.length === 0 || binding.modifiers.every(modifier => modifier === 'shift')) return 'modifier-required'
  if ((platform === 'windows' || platform === 'macos') && binding.modifiers.length >= 3) return null
  if (runtime === 'web' && (platform === 'windows' || platform === 'macos') && isWebBindingAllowed(binding, platform)) return null
  const primary = binding.modifiers.includes(platform === 'macos' ? 'meta' : 'control')
  if (['Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(binding.code)
    || (binding.code === 'Enter' && !binding.modifiers.includes('alt'))
    || (primary && ['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyQ', 'KeyH'].includes(binding.code))
    || (primary && binding.code === 'KeyA' && !binding.modifiers.includes('shift'))
    || (platform !== 'macos' && (binding.modifiers.includes('meta') || (binding.modifiers.includes('alt') && ['F4', 'F2'].includes(binding.code))))
    || (platform === 'macos' && binding.modifiers.includes('control') && binding.modifiers.includes('meta'))
    || (platform === 'macos' && binding.modifiers.includes('alt') && !primary)) return 'reserved'
  if (runtime === 'web' && !isWebBindingAllowed(binding, platform)) return 'unsupported-browser'
  return null
}

/**
 * Check the combinations a browser can actually hand to the page.
 *
 * Windows and macOS additionally admit any three or four modifiers; Linux keeps
 * the narrow set the shipped product allows.
 * @param binding - normalized candidate.
 * @param platform - receiving device.
 * @returns whether the combination is admitted; admission does not guarantee delivery.
 */
function isWebBindingAllowed(binding: NormalizedKeyBinding, platform: KeyPlatform): boolean {
  if (binding.secondCode !== undefined) return false
  if (platform === 'windows' || platform === 'macos') {
    if (binding.modifiers.length >= 3) return true
    const primary = platform === 'macos' ? 'meta' : 'control'
    if (binding.modifiers.length === 1
      && ((['Comma', 'Backslash'].includes(binding.code) && binding.modifiers[0] === primary)
        || (binding.code === 'Backquote' && binding.modifiers[0] === 'control'))) return true
    if (binding.modifiers.length === 2 && binding.modifiers.includes(primary)
      && (binding.modifiers.includes('alt') || binding.modifiers.includes('shift'))) return true
  }
  return [
    { code: 'Slash', modifiers: ['primary'] as const },
    { code: 'Comma', modifiers: ['primary', 'shift'] as const },
    { code: 'Period', modifiers: ['primary', 'shift'] as const },
  ].some(candidate => bindingKey(binding) === bindingKey(normalizeBinding(candidate, platform)))
}

/**
 * Validate an untrusted JSON binding value before it enters the document.
 * @param value - parsed storage or IPC input.
 * @returns the accepted binding, or null for an explicit removal.
 * @throws {Error} when the value carries unknown fields or an unsupported code.
 */
export function parseBinding(value: unknown): KeyBinding | null {
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid shortcut binding')
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => key !== 'code' && key !== 'secondCode' && key !== 'modifiers')
    || typeof record.code !== 'string' || !Array.isArray(record.modifiers)
    || (Object.hasOwn(record, 'secondCode') && typeof record.secondCode !== 'string')
    || !record.modifiers.every((modifier: unknown): modifier is KeyModifier =>
      typeof modifier === 'string' && ['primary', 'control', 'alt', 'shift', 'meta'].includes(modifier))) {
    throw new Error('Invalid shortcut binding')
  }
  const binding: KeyBinding = {
    code: record.code,
    modifiers: record.modifiers,
    ...(typeof record.secondCode === 'string' ? { secondCode: record.secondCode } : {}),
  }
  normalizeBinding(binding, 'windows')
  return binding
}
