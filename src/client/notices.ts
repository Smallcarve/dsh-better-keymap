/**
 * The sentences the reference shows after a write it could not complete.
 *
 * These live beside the components rather than inside one so they can be
 * checked directly: the empty "occupied by nobody" notice came from reading a
 * result's status while ignoring the reason the recorder had already resolved.
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { KeymapSaveResult } from './controller.ts'

/** The keymap dictionary, as the renderer receives it. */
type Translate = PropsLocale<'keymap'>['t']

/**
 * Describe the plugin document's read failure and the recovery path.
 * @param t - keymap dictionary.
 * @returns localized recovery guidance.
 */
export function readFailure(t: Translate): string {
  return `${t('invalid', { location: t('plugin-document'), reload: t('web-reload') })} ${t('using-defaults')}`
}

/**
 * Turn one failed outcome into the sentence the user reads.
 *
 * Three sources are consulted, in this order:
 *
 * 1. `message`, a sentence the recorder resolved itself — it is the only source
 *    that can name the key that was refused;
 * 2. `issue`, the product's or the plugin's own classification;
 * 3. `status`, the controller's verdict when neither of the above is present.
 *
 * Reading only the status is what produced the empty "occupied by nobody"
 * notice: a refusal knows which key it refused, and that knowledge has to
 * survive the trip to the screen.
 * @param result - the failed save result.
 * @param t - keymap dictionary.
 * @returns localized diagnosis.
 */
export function failureText(result: KeymapSaveResult, t: Translate): string {
  if (result.message !== undefined && result.message !== '') return result.message
  if (result.issue !== undefined) return t(result.issue)
  if (result.status === 'conflict' && result.conflicts !== undefined && result.conflicts.length > 0) {
    return t('reserved-conflict', { commands: result.conflicts.join('、') })
  }
  return result.status === 'stale' ? t('stale')
    : result.status === 'write-failed' ? t('write-failed')
      : result.status === 'not-ready' ? t('not-ready')
        : result.status === 'unreadable' ? readFailure(t)
          : t('saved')
}
