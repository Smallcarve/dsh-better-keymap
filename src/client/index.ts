/**
 * Browser half of `dsh-better-keymap`.
 *
 * The plugin is the authoritative keymap for the window: it owns one document,
 * renders the reference and the recorder, and mirrors every accepted change
 * into the product's own keybinding preferences so the product keeps
 * dispatching exactly the bindings the user sees here.
 *
 * Two registrations make that authority real:
 *
 * - `shell.overlay` is claimed at a lower shadowing priority than the product's
 *   own reference, so this dialog replaces it instead of rendering beside it.
 * - The `shortcuts.open` command is re-registered under the same id. The product
 *   rejects a duplicate id, so this registration wins only because the plugin's
 *   row loads after the product's overlay has claimed that slot; the product's
 *   own registration is then withdrawn. The command keeps the product's key,
 *   regions, and modal reach, so rebinding it in this reference still works.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import { closeTopModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { KeymapController } from './controller.ts'
import { KeymapReference } from './KeymapReference.tsx'
import type { KeymapReferenceInjected } from './KeymapReference.tsx'
import { KeymapSettingsRow } from './KeymapSettingsRow.tsx'
import { createKeymapStore } from './store.ts'
import type { KeymapStoreHandle } from './store.ts'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'keymap'

/** Shadowing priority below the product's own overlay entry, which registers at 0. */
const OVERLAY_PRIORITY = -1

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Keymap reference copy. */
    keymap: keyof typeof zh
  }
}

/** Services the plugin requires before it activates. */
export const inject = ['shortcuts', 'slots', 'locale']

/**
 * Register the reference surface, its settings row, and the product mirror.
 * @param ctx - plugin-owned client context.
 * @returns nothing; every contribution is registered through the context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-better-keymap: dictionaries')
  const t = ctx.locale.bind(NS)
  const handle: KeymapStoreHandle = createKeymapStore()
  const instance = handle.create()
  // One instance serves both registrations: the settings row only flips `open`,
  // and the overlay reads it. Without the pinned `create`, the two slots would
  // each build their own state and the row could never open the dialog.
  const store: KeymapStoreHandle = { ...handle, create: () => instance }
  const controller = new KeymapController(ctx.shortcuts)
  // The translation layer for the three composer gestures and the mirror of the
  // document into the product's own keybindings. Both own live listeners, so
  // both are released with the plugin's fiber.
  ctx.effect(() => {
    controller.attachComposerRemap()
    void controller.start()
    return () => { controller.detachComposerRemap() }
  }, 'dsh-better-keymap: controller lifetime')
  // The product catalog changes whenever a feature plugin mounts or unmounts a
  // command, and labels change with the locale; the derived model follows both.
  ctx.effect(() => ctx.shortcuts.catalog.subscribe(() => { controller.refresh() }),
    'dsh-better-keymap: catalog changes')
  ctx.effect(() => ctx.locale.subscribe(() => { controller.refresh() }),
    'dsh-better-keymap: locale changes')
  const injected = (): KeymapReferenceInjected => ({
    controller,
    desktop: controller.runtime === 'desktop',
    hooks: {
      snapshot: {
        getSnapshot: () => controller.getSnapshot(),
        subscribe: (listener: () => void) => controller.subscribe(listener),
      },
    },
  })
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'shortcuts',
    order: 16,
    locale: NS,
    store,
    inject: injected,
  }, KeymapSettingsRow))
  ctx.slots.inject('shell.overlay', function* () {
    // Re-registering the product's own command id is what makes the plugin
    // authoritative: the product rejects a duplicate id, and this row loads
    // after the product's own overlay entry, so the product's registration
    // fails and the plugin's resolve owns the gesture from then on. The default
    // key, regions, and modal reach are the product's, so rebinding it here
    // still works exactly as before.
    const disposeCommand = ctx.shortcuts.register({
      id: 'shortcuts.open' as ShortcutCommandId,
      label: () => t('open'),
      aliases: ['shortcuts', 'keyboard shortcuts', 'keymap'],
      defaults: {
        'desktop:macos': { code: 'Slash', modifiers: ['primary'] },
        'desktop:windows': { code: 'Slash', modifiers: ['primary'] },
        'desktop:linux': { code: 'Slash', modifiers: ['primary'] },
        'web:macos': { code: 'Slash', modifiers: ['primary'] },
        'web:windows': { code: 'Slash', modifiers: ['primary'] },
        'web:linux': { code: 'Slash', modifiers: ['primary'] },
      },
      regions: ['page', 'editable', 'terminal'],
      modals: ['settings', 'shortcuts'],
      resolve: ({ modal }) => {
        if (modal !== null && modal !== 'settings' && modal !== 'shortcuts') return { status: 'blocked', reason: 'modal' }
        return {
          status: 'handled',
          run: () => {
            if (modal === 'shortcuts') closeTopModal(document)
            else instance.actions.open()
          },
        }
      },
    })
    const disposeSlot = ctx.slots.register({
      name: 'shell.overlay',
      id: 'shortcuts',
      priority: OVERLAY_PRIORITY,
      locale: NS,
      store,
      inject: injected,
    }, KeymapReference)
    yield disposeCommand
    yield disposeSlot
  })
}
