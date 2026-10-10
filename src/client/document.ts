/**
 * The plugin's authoritative preference document.
 *
 * The document is stored under the plugin's own key, never under the product's
 * `dsh.keybindings.v1`, so the plugin can be removed without leaving a
 * half-written product configuration behind. Only explicit overrides are
 * persisted: an absent command inherits the product default and `null` clears
 * the binding, which is what keeps initialization identical to Harness.
 */
import { KEY_PROFILES, parseBinding } from './bindings.ts'
import type { KeyBinding, KeyProfile } from './bindings.ts'

/** One profile's explicit overrides: absent inherits, `null` clears. */
export type ProfileOverrides = Readonly<Record<string, KeyBinding | null>>

/** The complete plugin document. */
export interface KeymapDocument {
  readonly schemaVersion: 1
  readonly profiles: Readonly<Partial<Record<KeyProfile, ProfileOverrides>>>
}

/** Local storage key holding the plugin document. */
export const KEYMAP_STORAGE_KEY = 'dsh-better-keymap.keybindings.v1'

/** Marker distinguishing the plugin's document from unrelated data under the same key. */
const DOCUMENT_MARKER = 'dsh-better-keymap'

/** Read result: the document, or a classified failure the UI can explain. */
export type ReadKeymapResult =
  | { readonly status: 'ready'; readonly document: KeymapDocument }
  | { readonly status: 'invalid' }

/**
 * An empty document: every command inherits the product default.
 * @returns a document with no profile overrides.
 */
export function emptyDocument(): KeymapDocument {
  return { schemaVersion: 1, profiles: {} }
}

/**
 * Read one profile's overrides.
 * @param document - accepted document.
 * @param profile - runtime and platform whose overrides apply.
 * @returns the override record, empty when the profile was never edited.
 */
export function profileOverrides(document: KeymapDocument, profile: KeyProfile): ProfileOverrides {
  return document.profiles[profile] ?? {}
}

/**
 * Count the overrides a profile currently holds, for the UI's customized badge.
 * @param document - accepted document.
 * @param profile - runtime and platform whose overrides apply.
 * @returns the number of explicitly edited commands.
 */
export function overrideCount(document: KeymapDocument, profile: KeyProfile): number {
  return Object.keys(profileOverrides(document, profile)).length
}

/**
 * Split one profile's overrides into the composer actions the plugin intercepts
 * and the product commands it mirrors.
 *
 * The distinction is the write path: a product command is mirrored into the
 * product's own keybindings, while a composer action is enforced by the
 * plugin's key translation and must never be sent to the product, whose
 * keybinding document does not know that id.
 * @param overrides - one profile's override record.
 * @param isComposer - predicate naming the intercepted ids.
 * @returns the two subsets.
 */
export function partitionOverrides(
  overrides: ProfileOverrides,
  isComposer: (id: string) => boolean,
): { readonly composer: ProfileOverrides; readonly product: ProfileOverrides } {
  const composer: Record<string, KeyBinding | null> = {}
  const product: Record<string, KeyBinding | null> = {}
  for (const [id, binding] of Object.entries(overrides)) {
    if (isComposer(id)) composer[id] = binding
    else product[id] = binding
  }
  return { composer, product }
}

/**
 * Apply one override without touching other profiles.
 * @param document - accepted document.
 * @param profile - runtime and platform being edited.
 * @param id - command whose binding is written.
 * @param binding - the new binding, or null to clear it.
 * @returns the candidate document.
 */
export function withOverride(document: KeymapDocument, profile: KeyProfile, id: string,
  binding: KeyBinding | null): KeymapDocument {
  return {
    schemaVersion: 1,
    profiles: { ...document.profiles, [profile]: { ...profileOverrides(document, profile), [id]: binding } },
  }
}

/**
 * Drop one command's override so it inherits the product default again.
 * @param document - accepted document.
 * @param profile - runtime and platform being edited.
 * @param id - command whose override is removed.
 * @returns the candidate document.
 */
export function withoutOverride(document: KeymapDocument, profile: KeyProfile, id: string): KeymapDocument {
  const { [id]: _removed, ...remaining } = profileOverrides(document, profile)
  return { schemaVersion: 1, profiles: { ...document.profiles, [profile]: remaining } }
}

/**
 * Replace every override in one profile at once, used by restore-all and by
 * binding sweeping.
 * @param document - accepted document.
 * @param profile - runtime and platform being edited.
 * @param overrides - the complete replacement override record.
 * @returns the candidate document.
 */
export function withProfile(document: KeymapDocument, profile: KeyProfile, overrides: ProfileOverrides): KeymapDocument {
  return { schemaVersion: 1, profiles: { ...document.profiles, [profile]: overrides } }
}

/**
 * Decode a stored document without losing dormant overrides for other profiles.
 * @param raw - stored JSON text, or null when nothing was written yet.
 * @returns the accepted document, or a classified read failure.
 */
export function parseKeymapDocument(raw: string | null): ReadKeymapResult {
  if (raw === null) return { status: 'ready', document: emptyDocument() }
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { status: 'invalid' }
    const record = value as Record<string, unknown>
    if (record.plugin !== DOCUMENT_MARKER || record.schemaVersion !== 1) return { status: 'invalid' }
    if (typeof record.profiles !== 'object' || record.profiles === null || Array.isArray(record.profiles)) {
      return { status: 'invalid' }
    }
    const profiles: Partial<Record<KeyProfile, ProfileOverrides>> = {}
    for (const [profile, overrides] of Object.entries(record.profiles as Record<string, unknown>)) {
      if (!KEY_PROFILES.includes(profile as KeyProfile)) return { status: 'invalid' }
      if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) return { status: 'invalid' }
      const bindings: Record<string, KeyBinding | null> = {}
      for (const [id, binding] of Object.entries(overrides as Record<string, unknown>)) {
        bindings[id] = parseBinding(binding)
      }
      profiles[profile as KeyProfile] = bindings
    }
    return { status: 'ready', document: { schemaVersion: 1, profiles } }
  } catch (_error) {
    // Invalid JSON and invalid binding fields both leave stored bytes untouched.
    return { status: 'invalid' }
  }
}

/**
 * Serialize a document for storage.
 * @param document - accepted document.
 * @returns the exact text to persist.
 */
export function serializeKeymapDocument(document: KeymapDocument): string {
  const profiles: Record<string, ProfileOverrides> = {}
  for (const profile of KEY_PROFILES) {
    const overrides = document.profiles[profile]
    if (overrides !== undefined && Object.keys(overrides).length > 0) profiles[profile] = overrides
  }
  return `${JSON.stringify({ plugin: DOCUMENT_MARKER, schemaVersion: 1, profiles }, null, 2)}\n`
}

/** Persistence seam so the plugin works with and without browser storage. */
export interface KeymapStorage {
  read(): string | null
  write(raw: string): void
}

/**
 * Open the browser's local storage for the plugin key.
 * @returns a storage port, or undefined when the page denies storage access.
 */
export function browserKeymapStorage(): KeymapStorage | undefined {
  try {
    const probe = window.localStorage
    probe.getItem(KEYMAP_STORAGE_KEY)
    return {
      read: () => probe.getItem(KEYMAP_STORAGE_KEY),
      write: (raw) => { probe.setItem(KEYMAP_STORAGE_KEY, raw) },
    }
  } catch (_error) {
    // A page that denies storage runs the plugin in memory for this session only.
    return undefined
  }
}

/**
 * Keep the document in memory when no durable storage is available.
 * @returns a storage port whose writes never reach disk.
 */
export function memoryKeymapStorage(): KeymapStorage {
  let raw: string | null = null
  return { read: () => raw, write: (next) => { raw = next } }
}
