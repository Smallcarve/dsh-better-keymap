/**
 * The General-settings row that opens the keymap reference.
 *
 * The row shows the plugin's own binding for `shortcuts.open`, so the hint
 * always names the combination that will actually open the reference — the
 * product's own row reads the same catalog, which is how the two stay in step.
 */
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { KeymapReferenceInjected } from './KeymapReference.tsx'
import css from './Reference.module.css'

/**
 * Render the General settings action that opens the keymap reference.
 *
 * The store is declared on the registration but not read here: this row only
 * flips `open`, and the overlay owns everything else. The inject face supplies
 * the live key hint.
 * @param actions - the store's mutation API.
 * @param useSnapshot - live plugin state, read for the current hint key.
 * @param t - keymap dictionary.
 * @returns the settings row.
 */
export function KeymapSettingsRow({
  actions, t, useSnapshot,
}: PropsRuntime<'settings.general.item'> & PropsLocale<'keymap'> & KeymapReferenceInjected) {
  const shortcut = useSnapshot(snapshot => snapshot.model.rows.find(row => row.id === 'shortcuts.open' && row.kind === 'owned'))
  const keys = shortcut?.kind === 'owned' ? shortcut.keys : []
  const aria = shortcut?.kind === 'owned' ? shortcut.aria : undefined
  return <div className={css.setting}>
    <div className={css.settingText}>
      <div className={css.settingTitle}>{t('settings')}</div>
      <p className={css.settingDescription}>{t('description')}</p>
    </div>
    <Tooltip disabled={keys.length === 0} label={t('global-hint')} shortcutKeys={keys}>
      <button className={css.button} type="button" aria-label={t('view')} aria-keyshortcuts={aria}
        onClick={() => { actions.open() }}>{t('view')}</button>
    </Tooltip>
  </div>
}
