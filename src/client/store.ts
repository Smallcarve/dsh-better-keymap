/**
 * Reference overlay state.
 *
 * The settings row and the overlay are two registrations that must share one
 * instance: the row only flips `open`, and the overlay reads it. The handle is
 * therefore created once in `apply` and handed to both registrations.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Overlay state. */
interface State {
  /** Whether the reference dialog is visible. */
  open: boolean
  /** Current search term. */
  query: string
  /** Monotonic signal asking the overlay to move focus into the search field. */
  focusRequest: number
}

/** Overlay writes. */
interface Actions {
  open(draft: State): void
  close(draft: State): void
  search(draft: State, query: string): void
}

/**
 * The store handle's public shape.
 *
 * `EngineStoreHandle` carries the engine's own `create`; naming the alias here
 * keeps component props readable without re-deriving the generic arguments.
 */
export type KeymapStoreHandle = EngineStoreHandle<State, Actions>

/**
 * Declare the overlay store.
 *
 * `create()` builds a fresh store on every call, which is the engine's contract.
 * The single shared instance the two registrations need is imposed by `apply`,
 * which pins `create` to one instance.
 * @returns the store handle `apply` pins to a single instance.
 */
export function createKeymapStore(): KeymapStoreHandle {
  return defineStore({
    init: (): State => ({ open: false, query: '', focusRequest: 0 }),
    actions: {
      open: (draft) => {
        draft.open = true
        draft.focusRequest += 1
      },
      close: (draft) => {
        draft.open = false
        draft.query = ''
      },
      search: (draft, query: string) => {
        draft.query = query
      },
    },
  })
}
