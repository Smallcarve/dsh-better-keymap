/**
 * Inline physical-key recording for one command.
 *
 * The recorder listens on the capture phase, records a held combination, and
 * commits it when the keys are released — the same gesture the shipped editor
 * uses. What differs is the arbitration: a combination another command already
 * holds is not refused. The editor previews which commands would lose the
 * combination, then takes it from them on release and reports them.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ShortcutKeys, focusWithoutRing, observeComposition } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { labelOf } from './catalog.ts'
import type { EditableRow } from './catalog.ts'
import type { KeyBinding } from './bindings.ts'
import type { KeymapController, KeymapSaveResult, KeymapSnapshot } from './controller.ts'
import { KeymapIcon } from './Icons.tsx'
import { failureText } from './notices.ts'
import css from './Reference.module.css'

/** Inline localization function shape. */
type Translate = PropsLocale<'keymap'>['t']

/** Props delivered by the reference for the row being edited. */
interface EditorProps {
  readonly target: EditableRow
  readonly snapshot: KeymapSnapshot
  readonly controller: KeymapController
  readonly desktop: boolean
  readonly busy: boolean
  readonly persist: (edit: Parameters<KeymapController['apply']>[0], id?: string) => Promise<KeymapSaveResult>
  readonly onClose: () => void
  readonly onResult: (result: KeymapSaveResult) => void
  readonly t: Translate
}

/** Interpolate `{name}` placeholders in one localized string. */
function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match)
}

/**
 * Render the inline editor for one command.
 * @param target - the row being edited.
 * @param snapshot - the live plugin snapshot, for label lookups.
 * @param controller - arbitration and candidate preview.
 * @param desktop - whether the shell is the desktop application.
 * @param busy - whether another write currently owns the surface.
 * @param persist - writes one reviewed edit.
 * @param onClose - closes the recorder.
 * @param onResult - reports the outcome to the reference.
 * @param t - keymap dictionary.
 * @returns the inline command controls.
 */
export function KeymapEditor({
  target, snapshot, controller, desktop, busy, persist, onClose, onResult, t,
}: EditorProps) {
  const [candidate, setCandidate] = useState<KeyBinding | null>(null)
  const [captured, setCaptured] = useState(false)
  const [message, setMessage] = useState('')
  const [recording, setRecording] = useState(desktop ? false : true)
  const [writing, setWriting] = useState(false)
  const descriptionId = useId()
  const recorder = useRef<HTMLButtonElement>(null)
  const mounted = useRef(true)
  const busyRef = useRef(false)
  const restart = useRef(() => {})
  const chords = desktop && (controller.platform === 'macos' || controller.platform === 'windows')
  const targetId = target.id
  const readOnly = busy || writing || snapshot.status !== 'ready'

  /** Describe the live candidate against the current model. */
  const described = candidate === null ? null : controller.describeBinding(candidate, targetId)
  const displaced = described?.conflicts ?? []
  const reserved = described?.reserved ?? []

  /**
   * State a reason in place and raise it as a notice.
   *
   * This preview path never reaches the controller, so the reason is carried on
   * the result as finished text (`message`). Only `message` is set: `issue` is
   * the dictionary *key* that other producers use, and the reference would try
   * to translate whatever it found there.
   * @param text - the already-localized reason to show and announce.
   */
  const report = (text: string): void => {
    setMessage(text)
    onResult({ status: 'conflict', displaced: [], message: text })
  }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const commit = async (operation: Parameters<KeymapController['apply']>[0]): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setWriting(true)
    let result: KeymapSaveResult
    try {
      result = await persist(operation, targetId)
    } catch (error) {
      // A rejected write must still release the recorder. Leaving `busy` set
      // would disable every control with no way back: the editor is not
      // unmounted on failure, so nothing else would ever clear it.
      console.error('dsh-better-keymap: recording failed', error)
      finish({ status: 'write-failed', displaced: [] })
      return
    }
    finish(result)
  }

  /**
   * Report one finished attempt and release the recorder.
   * @param result - the outcome to show and forward.
   */
  const finish = (result: KeymapSaveResult): void => {
    // Released even when the component is gone, so a later mount is not blocked.
    busyRef.current = false
    if (!mounted.current) return
    setWriting(false)
    onResult(result)
    if (result.status === 'saved') onClose()
    else setMessage(failureText(result, t))
  }

  const capture = (binding: KeyBinding): void => {
    setCandidate(binding)
    setCaptured(true)
    const view = controller.describeBinding(binding, targetId)
    // `issue` alone decides whether the recording can proceed: it carries every
    // reason this plugin refuses a combination, including the two Enter
    // combinations the input box reserves. `conflicts` and `reserved` are
    // explanations shown beside a combination that is otherwise fine — gating on
    // them here would refuse a combination the rules allow.
    if (view.issue !== null) { report(t(view.issue)); return }
    setMessage('')
    void commit({ type: 'set', id: targetId, binding })
  }

  const handlers = useRef({ capture, report, onClose })
  useLayoutEffect(() => { handlers.current = { capture, report, onClose } })

  useEffect(() => {
    let disposed = false
    void controller.recording(true).then(
      () => { if (!disposed) setRecording(true) },
      () => { if (!disposed) handlers.current.report(t('native-failed')) },
    )
    const composition = observeComposition(document)
    let pending: KeyBinding | null = null
    let dead = false
    let blocked = false
    const held = new Set<string>()
    const reset = (): void => { pending = null; held.clear(); blocked = false; dead = false }
    restart.current = reset
    const down = (event: KeyboardEvent): void => {
      if (composition.guards(event) || event.getModifierState('AltGraph')) { if (chords) reset(); return }
      if ((!chords || document.activeElement !== recorder.current) && event.key === 'Escape'
        && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault(); event.stopPropagation()
        if (!event.repeat && !busyRef.current) handlers.current.onClose()
        return
      }
      const commandDeadKey = !desktop && controller.platform === 'macos' && document.activeElement === recorder.current
        && event.code === 'KeyN' && event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey
      if (event.key === 'Dead' && !commandDeadKey) { if (chords) reset(); dead = true; return }
      if (dead) { dead = false; return }
      const modifiers = (['control', 'alt', 'shift', 'meta'] as const).filter(value => ({
        control: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey,
      })[value])
      const recordTab = chords || (controller.platform === 'macos' || controller.platform === 'windows') && modifiers.length >= 3
      if (document.activeElement !== recorder.current || (event.key === 'Tab' && !recordTab)) return
      event.preventDefault(); event.stopPropagation()
      if (busyRef.current || event.repeat) return
      if (/^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(event.code)) {
        if (chords && pending !== null) { reset(); setCandidate(null); setCaptured(false) }
        return
      }
      if (chords) {
        held.add(event.code)
        if (blocked) return
        if (held.size > 2) {
          blocked = true; pending = null; handlers.current.report(t('too-many-keys')); return
        }
      }
      try {
        const codes: [string, ...string[]] = [event.code, ...chords ? [...held].filter(value => value !== event.code) : []]
        pending = {
          code: codes[0],
          ...(codes[1] === undefined ? {} : { secondCode: codes[1] }),
          modifiers,
        }
        setCandidate(pending)
        setCaptured(chords)
        setMessage('')
      } catch (_error) {
        blocked = chords; pending = null; handlers.current.report(t('unsupported-key'))
      }
    }
    const up = (event: KeyboardEvent): void => {
      held.delete(event.code)
      if (chords && document.activeElement === recorder.current) { event.preventDefault(); event.stopPropagation() }
      const binding = pending !== null && (pending.code === event.code || pending.secondCode === event.code
        || pending.modifiers.some(modifier => modifier === event.code.replace(/(Left|Right)$/u, '').toLowerCase()))
        ? pending : null
      if (binding !== null) { pending = null; blocked = chords }
      if (chords && (held.size === 0 || controller.platform === 'macos' && /^Meta(Left|Right)$/u.test(event.code))) {
        held.clear(); blocked = false
      }
      if (binding === null) return
      handlers.current.capture(binding)
    }
    const blur = (): void => { reset(); if (chords) { setCandidate(null); setCaptured(false) } }
    const focus = (): void => { if (document.activeElement !== recorder.current) blur() }
    document.addEventListener('keydown', down, true)
    document.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    if (chords) {
      document.addEventListener('focusin', focus, true)
      document.addEventListener('compositionstart', blur, true)
    }
    return () => {
      disposed = true
      composition.dispose()
      document.removeEventListener('keydown', down, true)
      document.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
      document.removeEventListener('focusin', focus, true)
      document.removeEventListener('compositionstart', blur, true)
      void controller.recording(false).catch(() => { /* The owning window may already be closed. */ })
    }
  }, [controller, t, targetId, desktop, chords, snapshot.model])

  useEffect(() => {
    const element = recorder.current
    if (recording && element !== null) focusWithoutRing(element)
  }, [recording])

  const preview = described !== null ? described.keys : []
  return <div className={css.inlineEditor} role="group" aria-label={target.label} data-shortcut-modal="shortcut-edit" aria-busy={writing}>
    <div className={css.inlineControls}>
      <button type="button" className={css.inlineAction} disabled={readOnly}
        onClick={() => { void commit({ type: 'reset', id: targetId }) }}>{t('reset')}</button>
      {target.binding !== null && <button type="button" className={css.inlineAction} disabled={readOnly}
        onClick={() => { void commit({ type: 'set', id: targetId, binding: null }) }}>{t('clear')}</button>}
      <button ref={recorder} type="button" className={message === '' ? css.recorder : `${css.recorder} ${css.invalid}`}
        disabled={!recording}
        aria-disabled={writing || !recording} onBlur={() => { restart.current() }}
        aria-label={t('record')} aria-invalid={message !== ''} aria-describedby={descriptionId}
        onClick={() => { if (!busyRef.current) { restart.current(); setCaptured(false); setMessage(''); setCandidate(null) } }}>
        {captured && preview.length > 0 && message === ''
          ? <ShortcutKeys keys={preview} className={css.recorded} />
          : t('record')}
      </button>
    </div>
    {target.composer === true && <div className={css.displace}>
      <span>{t('composer-help')}</span>
    </div>}
    {target.composer === true && target.customized && <div className={css.displace}>
      <span>{t('composer-default-off')}</span>
    </div>}
    {displaced.length > 0 && message === '' && target.composer !== true && <div className={css.displace}>
      <KeymapIcon kind="edit" />
      <span>{fill(t('cleared'), { commands: displaced.map(id => labelOf(snapshot.model, id)).join('、') })}</span>
    </div>}
    {reserved.length > 0 && <div className={css.displace}>
      <span>{fill(t('reserved-conflict'), { commands: reserved.map(id => labelOf(snapshot.model, id)).join('、') })}</span>
    </div>}
    {/* A refusal is announced by the reference's notice and described here for
        assistive technology; the field itself keeps only its invalid border,
        matching the product's own editor. */}
    <span id={descriptionId} className={css.srOnly}>
      {message || (chords ? t('record-help') : helpText(t, controller.platform, desktop))}
    </span>
  </div>
}

/**
 * Select the browser-facing help line for the current device.
 * @param t - keymap dictionary.
 * @param platform - receiving device.
 * @param desktop - whether the shell is the desktop application.
 * @returns the localized help text.
 */
function helpText(t: Translate, platform: KeymapController['platform'], desktop: boolean): string {
  if (desktop) return ''
  return platform === 'windows' ? t('windows-web-help')
    : platform === 'macos' ? t('macos-web-help')
      : t('web-help')
}
