/**
 * The keymap reference: a searchable list of every command and input action.
 *
 * Structure, geometry, and copy follow the shipped reference so the surface is
 * indistinguishable from the product's own. The differences are all in the
 * arbitration the editor applies: a combination another command holds is taken
 * from it rather than refused, and the notice names what was cleared.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Button, IconCloseOutlineRegular, IconRefreshOutlineRegular, Modal, ShortcutKeys, Toast,
  focusWithoutRing, isBehindModal, rankByName,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot, PropsStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CatalogRow, EditableRow, GroupKey } from './catalog.ts'
import { GROUP_ORDER } from './catalog.ts'
import type { KeymapController, KeymapSaveResult, KeymapSnapshot } from './controller.ts'
import { KeymapEditor } from './KeymapEditor.tsx'
import { KeymapIcon, SearchIcon } from './Icons.tsx'
import { failureText, readFailure } from './notices.ts'
import type { KeymapStoreHandle } from './store.ts'
import css from './Reference.module.css'

/** The injected face both registrations receive. */
export interface KeymapReferenceInjected extends InjectFace<{
  /** Live plugin state: the derived model plus the accepted document. */
  hooks: { snapshot: ObservableSnapshot<KeymapSnapshot> }
  controller: KeymapController
  /** Whether this shell is the desktop application, which drives its own recording protection. */
  desktop: boolean
}> {}

/** Display groups, in render order. */
const GROUPS: readonly GroupKey[] = GROUP_ORDER

/**
 * Every search term for one rendered row.
 *
 * Both row kinds carry a precomputed term list; the label is appended so a
 * search for the visible name always matches, whichever kind the row is.
 * @param row - a displayed row.
 * @returns the terms the fuzzy matcher searches.
 */
function rowNames(row: CatalogRow): readonly string[] {
  return [...row.names, row.label]
}

/**
 * Resolve the editable view of one rendered row.
 *
 * The displayed rows and the editable rows are derived from the same document
 * and the same overrides, so this lookup cannot disagree with what the row
 * shows — it only tells the recorder which arbitration fields to use.
 * @param snapshot - the live plugin snapshot.
 * @param id - the row's command id.
 * @returns the editable row, or undefined when the id is not rebindable.
 */
function rowModel(snapshot: KeymapSnapshot, id: string): EditableRow | undefined {
  return snapshot.model.editable.find(row => row.id === id)
}

/**
 * Render the reference dialog.
 * @param useStore - store state and its declared reads.
 * @param actions - the store's complete mutation API.
 * @param useSnapshot - live plugin state.
 * @param controller - arbitration and candidate preview.
 * @param desktop - whether the shell is the desktop application.
 * @param t - keymap dictionary.
 * @returns the single reference dialog when open.
 */
export function KeymapReference({
  useStore, actions, useSnapshot, controller, desktop, t,
}: PropsRuntime<'shell.overlay'> & PropsStore<KeymapStoreHandle> & PropsLocale<'keymap'> & KeymapReferenceInjected) {
  const { open, query, focusRequest } = useStore(state => state)
  const snapshot = useSnapshot(value => value)
  const rows = snapshot.model.rows
  const [target, setTarget] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; error: boolean; seq: number } | null>(null)
  const mounted = useRef(true)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const dismissToast = useCallback(() => { setToast(null) }, [])
  const notify = useCallback((text: string, error = false): void => {
    setToast((previous) => {
      if (error && previous?.error && previous.text === text) return previous
      return { text, error, seq: (previous?.seq ?? 0) + 1 }
    })
  }, [])
  useEffect(() => {
    if (open && snapshot.status === 'unreadable') notify(readFailure(t), true)
  }, [open, snapshot.status, notify, t])
  const closeEditor = (): void => {
    setTarget(null)
    const dialog = search.current?.closest<HTMLElement>('[role="dialog"]')
    if (dialog != null) focusWithoutRing(dialog, { preventScroll: true })
  }
  const closeReference = (): void => {
    if (busy) return
    if (resetOpen) setResetOpen(false)
    else if (target !== null) closeEditor()
    else actions.close()
  }
  useEffect(() => { if (!open) setResetOpen(false) }, [open])
  /** Report one accepted edit, naming every command the assignment displaced. */
  const report = useCallback((result: KeymapSaveResult): void => {
    if (result.status !== 'saved') { notify(failureText(result, t), true); return }
    if (result.displaced.length === 0) { notify(t('saved')); return }
    const commands = result.displaced
      .map(entry => entry.keys.length === 0 ? entry.label : `${entry.label}（${entry.keys.join('')}）`)
      .join('、')
    notify(t('cleared', { commands }))
  }, [notify, t])
  const persist = useCallback(async (
    edit: Parameters<KeymapController['apply']>[0],
    id?: string,
  ): Promise<KeymapSaveResult> => {
    setBusy(true)
    const result = await controller.apply(edit, id)
    if (mounted.current) setBusy(false)
    return result
  }, [controller])
  const resetAll = async (): Promise<void> => {
    const result = await persist({ type: 'reset-all' })
    if (!mounted.current) return
    if (result.status === 'saved') setResetOpen(false)
    notify(result.status === 'saved' ? t('reset-saved') : t('reset-failed'), result.status !== 'saved')
  }
  useLayoutEffect(() => {
    const input = search.current
    if (open && input !== null && !isBehindModal(input)) focusWithoutRing(input)
  }, [open, focusRequest])
  const term = query.trim()
  const matches = [...new Set(rankByName(
    rows.flatMap(row => rowNames(row).map(name => ({ name, label: row.label, row }))),
    term,
  ).map(match => match.row))]
  const customized = snapshot.customized
  useLayoutEffect(() => {
    const input = search.current
    if (open && !resetOpen && customized === 0 && document.activeElement === document.body && input !== null) {
      focusWithoutRing(input)
    }
  }, [open, resetOpen, customized])
  return <>
    <Modal open={open} onClose={closeReference} title={t('title')} headless
      shortcutModal="shortcuts" className={css.dialog as string}>
      <div className={css.contents} onPointerDownCapture={(event) => {
        if (target === null || busy || !(event.target instanceof Element)
          || event.target.closest('button, input, a, [contenteditable="true"], [role="group"]') !== null) return
        event.preventDefault()
        closeEditor()
      }}>
        <header className={css.header}>
          <h2 className={css.title}>{t('title')}</h2>
          <button type="button" className={css.close} aria-label={t('close')} disabled={busy} onClick={closeReference}>
            <IconCloseOutlineRegular size={14} />
          </button>
        </header>
        <div className={css.searchRow}>
          <div className={css.searchField} role="search" aria-label={t('search')}>
            <span className={css.searchIcon}><SearchIcon /></span>
            <input ref={search} data-modal-autofocus className={css.search} type="search" aria-label={t('search')}
              placeholder={t('search')} value={query} onChange={(event) => { actions.search(event.target.value) }} />
            {query !== '' && <button type="button" className={css.clearSearch} aria-label={t('clear-search')}
              onClick={() => { actions.search(''); search.current?.focus() }}><IconCloseOutlineRegular size={10} /></button>}
          </div>
        </div>
        <div className={css.list} aria-busy={snapshot.status === 'loading'}>
          {GROUPS.map((group) => {
            const groupRows = matches.filter(row => row.group === group)
            if (groupRows.length === 0) return null
            return <section key={group} aria-label={t(group)}>
              {group !== 'application' && <h3 className={css.group}>{t(group)}</h3>}
              <ul className={css.rows}>{groupRows.map(row => {
                // A composer gesture is a fixed product action the plugin
                // rebinds; every other fixed action is a read-only reservation.
                const editable = row.kind === 'owned' || row.composer
                const model = editable ? rowModel(snapshot, row.id) : undefined
                return <li key={row.id} className={css.row}>
                  {editable && target !== row.id && <button type="button" className={css.rowButton}
                    aria-label={t('edit-label', { command: row.label })} disabled={busy || snapshot.status !== 'ready'}
                    onClick={() => { setTarget(row.id) }} />}
                  <span className={css.commandLabel}>{row.label}</span>
                  <span className={css.binding}>
                    {editable && model !== undefined
                      ? target === row.id
                        ? <KeymapEditor key={row.id} target={model} snapshot={snapshot} controller={controller}
                          desktop={desktop} busy={busy} persist={persist} onClose={closeEditor} onResult={report} t={t} />
                        : <>
                          <span className={css.rowActions}><KeymapIcon kind="edit" /></span>
                          {row.keys.length === 0
                            ? <span className={css.unbound}>{t('unbound')}</span>
                            : <ShortcutKeys keys={row.keys} className={css.keyBadge} />}
                        </>
                      : <ShortcutKeys keys={row.keys} className={css.fixedKeyBadge} />}
                  </span>
                </li>
              })}</ul>
            </section>
          })}
          {matches.length === 0 && <p className={css.hint} role="status">{t('empty')}</p>}
        </div>
        <footer className={css.footer}>
          <button type="button" className={css.resetAll} disabled={busy || snapshot.status !== 'ready' || customized === 0}
            onClick={(event) => { event.currentTarget.focus(); setTarget(null); setResetOpen(true) }}>
            <IconRefreshOutlineRegular size={12} />{t('reset-all')}
          </button>
          {customized > 0 && <span className={css.modifiedCount}>{t('modified-count', { count: customized })}</span>}
        </footer>
      </div>
    </Modal>
    <Modal open={open && resetOpen} title={t('reset-title')} description={t('reset-description')}
      closeLabel={t('close-confirmation')} onClose={() => { if (!busy) setResetOpen(false) }}
      footer={<>
        <Button data-modal-autofocus disabled={busy} onClick={() => { setResetOpen(false) }}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy || snapshot.status !== 'ready'} onClick={() => { void resetAll() }}>{t('reset')}</Button>
      </>} />
    {toast !== null && <Toast key={toast.seq} text={toast.text} onDone={dismissToast}
      icon={<KeymapIcon kind={toast.error ? 'error' : 'success'} className={toast.error ? css.toastError : css.toastSuccess} />} />}
  </>
}
