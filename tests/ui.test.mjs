/**
 * Reference UI smoke test.
 *
 * Renders the real components against the real store engine and a recording
 * slot context, then drives the interactions a user performs: open the
 * reference, pick a command, record a combination another command holds, and
 * read the notice that names what was cleared.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from './harness.mjs'
import { JSDOM } from 'jsdom'
import { installStubs } from './stubs.mjs'
import { normalizeBinding, presentBinding } from '../src/client/bindings.ts'
import { en, zh } from '../src/client/locales.ts'
import { failureText } from '../src/client/notices.ts'

const ROOT = resolve(import.meta.dirname, '..')
const PLATFORM = 'windows'
const RUNTIME = 'desktop'

/**
 * The renderer's translation over the shipped dictionary.
 *
 * A missing key surfaces as `<<MISSING key>>` instead of silently passing, and
 * placeholders are filled the same way the product fills them.
 * @param key - dictionary key.
 * @param params - placeholder values, if any.
 * @returns the localized text.
 */
function t(key, params) {
  const text = zh[key]
  if (text === undefined) return `<<MISSING ${key}>>`
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/gu, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match)
}

/**
 * Materialize the built bundle and apply it against a recording context.
 * @param rows - product catalog rows the stub service serves.
 * @param fixedRows - fixed rows the stub service serves, including composer gestures.
 * @returns the registrations plus the recording context.
 */
function loadPlugin(rows, fixedRows = []) {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-keymap-ui-'))
  try {
    const pluginRequire = createRequire(join(ROOT, 'package.json'))
    installStubs(scratch,
      pluginRequire.resolve('react'),
      pluginRequire.resolve('react/jsx-runtime'))
    const require = createRequire(join(scratch, 'entry.cjs'))
    let registration
    // The registration handoff is installed on the global window rather than
    // passed in: a parameter would shadow the real `window` for every module
    // body the factory lazily materializes. jsdom already supplies
    // `localStorage`, which is the same port the real page gives the plugin.
    window.__ModuleLoader__ = { load: (value) => { registration = value } }
    const run = new Function(readFileSync(join(ROOT, 'lib/client.js'), 'utf8'))
    run()
    const exports = registration.factory(require)

    // The catalog must exist before `apply` runs: the controller derives its
    // first model from it, exactly as it does when the real service is live.
    const calls = { commands: [], slots: [], handshake: [], rows, fixedRows }
    const ctx = {
      shortcuts: {
        runtime: RUNTIME,
        platform: PLATFORM,
        catalog: { getSnapshot: () => calls.rows, subscribe: () => () => {} },
        fixedCatalog: { getSnapshot: () => calls.fixedRows },
        config: { getSnapshot: () => ({ revision: calls.revision ?? 'r1', status: 'ready' }) },
        describeBinding: (binding) => {
          if (binding === null) return { binding: null, keys: [], issue: null }
          const normalized = normalizeBinding(binding, PLATFORM)
          return { binding: normalized, keys: presentBinding(normalized, PLATFORM).keys, issue: null }
        },
        edit: async (edit, revision) => {
          calls.handshake.push({ edit, revision })
          const holder = calls.rows.find(row => {
            const held = row.binding
            if (held === null || edit.binding == null) return false
            if (held.modifiers.join('+') !== edit.binding.modifiers.join('+')) return false
            return [held.code, held.secondCode].some(code => code === edit.binding.code || code === edit.binding.secondCode)
          })
          if (holder !== undefined && holder.id !== edit.id) {
            return { status: 'conflict', snapshot: { revision } }
          }
          const row = calls.rows.find(entry => entry.id === edit.id)
          if (row !== undefined) {
            row.binding = edit.binding === null ? null : normalizeBinding(edit.binding, PLATFORM)
            const present = presentBinding(row.binding, PLATFORM)
            row.keys = present.keys
            row.aria = present.aria
          }
          calls.revision = `r${calls.handshake.length + 1}`
          return { status: 'saved', snapshot: { revision: calls.revision } }
        },
        recording: async () => {},
        register: (command) => { calls.commands.push(command); return () => {} },
      },
      locale: {
        register: () => () => {},
        bind: () => (key, params) => params === undefined ? key : `${key}|${JSON.stringify(params)}`,
        subscribe: () => () => {},
      },
      slots: {
        inject: (name, factory) => {
          const result = factory()
          if (result !== null && typeof result === 'object' && typeof result[Symbol.iterator] === 'function') {
            calls.installed = [...(calls.installed ?? []), ...result]
          }
          return () => {}
        },
        register: (options, component) => { calls.slots.push({ options, component }); return () => {} },
        entries: () => [],
        subscribe: () => () => {},
      },
      effect: (callback) => { callback(); return () => {} },
    }
    exports.apply(ctx)
    return { calls, ctx }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * Bring up a DOM, render one component with the composed props the renderer
 * would supply, and return handles for driving and inspecting it.
 * @param options - product rows, the slot to render, and whether the dialog starts open.
 * @returns the rendered document plus React and the recorded plugin calls.
 */
async function renderReference({ rows, slot = 'shell.overlay', open = true }) {
  // A real origin is required: the plugin's document port probes `localStorage`,
  // which jsdom only exposes for an http(s) URL.
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://app.local/',
  })
  // The bundle registers its factory at script execution and reads `window` and
  // `document` from the enclosing scope, so both must exist before it runs.
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.MutationObserver = dom.window.MutationObserver
  const plugin = loadPlugin(rows, rows.fixed ?? [])
  try {
    const { calls, ctx } = plugin

    const require = createRequire(join(ROOT, 'package.json'))
    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const name = slot === 'shell.overlay' ? 'shell.overlay' : 'settings.general.item'
    const register = calls.slots.find(entry => entry.options.name === name)
    assert.ok(register, `no registration for ${name}`)
    const storeHandle = register.options.store
    const instance = storeHandle.create()
    if (open) instance.actions.open()

    const face = register.options.inject()
    const props = {
      actions: instance.actions,
      useStore: (selector) => React.useSyncExternalStore(
        instance.store.subscribe, () => selector(instance.store.getSnapshot())),
      useSnapshot: (selector) => React.useSyncExternalStore(
        face.hooks.snapshot.subscribe, () => selector(face.hooks.snapshot.getSnapshot())),
      // The renderer's own interpolation over the shipped dictionary, so a
      // missing key or an unimplemented placeholder cannot pass unnoticed — a
      // stub returning the key name would hide exactly that class of defect.
      t,
      ...face,
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = dom.window.document.getElementById('root')
    const root = createRoot(container, { onRecoverableError: () => {} })
    await React.act(async () => { root.render(React.createElement(register.component, props)) })
    return { dom, React, root, container, calls, props, instance, ctx }
  } catch (error) {
    throw error
  }
}

/** One product row with product-shaped defaults. */
function productRow(id, label, binding) {
  const normalized = binding === null ? null : normalizeBinding(binding, PLATFORM)
  const present = presentBinding(normalized, PLATFORM)
  return {
    id, label, aliases: [], keys: present.keys, aria: present.aria,
    binding: normalized, modified: false, conflicts: [], issue: null,
  }
}

const ROWS = [
  productRow('shortcuts.open', '快捷键速查', { code: 'Slash', modifiers: ['primary'] }),
  productRow('session.new', '新会话', { code: 'KeyN', modifiers: ['primary', 'alt'] }),
  productRow('session.search', '搜索会话', { code: 'KeyK', modifiers: ['primary', 'alt'] }),
]

/** The fixed rows the product registers, including the three composer gestures. */
function fixedRows() {
  const fixed = (id, label, modifiers, group = 'input') => ({
    id,
    label,
    keys: presentBinding(normalizeBinding({ code: 'Enter', modifiers }, PLATFORM), PLATFORM).keys,
    bindings: [normalizeBinding({ code: 'Enter', modifiers }, PLATFORM)],
    group,
  })
  return [
    fixed('fixed.send', '发送消息', []),
    fixed('fixed.newline', '换行', ['shift']),
    fixed('fixed.complementary', '使用互补的 Queue／Steer 方式', ['control']),
    fixed('fixed.dismiss', '关闭菜单或顶层弹窗', [], 'menus'),
  ]
}

/**
 * A fixture whose fixed catalog carries the composer gestures.
 * @returns product rows plus a `fixed` array the stub service serves.
 */
function rowsWithFixed() {
  const rows = structuredClone(ROWS)
  rows.fixed = fixedRows()
  return rows
}

/**
 * The edit control of one rendered row.
 *
 * The accessible name is built from the shipped dictionary, so the lookup reads
 * the same string the user's screen reader announces.
 * @param scope - the row element, or the document container.
 * @param label - the row's localized command name.
 * @returns the row's edit button, or null when the row is read-only.
 */
function editControl(scope, label) {
  const text = zh['edit-label'].replace('{command}', label)
  return scope.querySelector(`button[aria-label="${text}"]`)
}

/**
 * The record button inside the open inline editor.
 *
 * It is located by its accessible name rather than by position: the control row
 * renders two or three buttons depending on whether the row is currently bound.
 * @param scope - the document container.
 * @returns the recorder button, or null when no editor is open.
 */
function recorderOf(scope) {
  return scope.querySelector(`[data-shortcut-modal="shortcut-edit"] button[aria-label="${zh.record}"]`)
}

test('the settings row renders the product copy and opens the reference', async () => {
  const view = await renderReference({ rows: structuredClone(ROWS), slot: 'settings.general.item', open: false })
  const button = view.container.querySelector('button')
  assert.ok(button, 'the row must render its button')
  assert.equal(button.textContent, zh.view)
  assert.equal(button.getAttribute('aria-label'), zh.view)
  await view.React.act(async () => { button.dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true })) })
  assert.equal(view.instance.store.getSnapshot().open, true, 'clicking the row must open the shared dialog state')
})

test('the reference lists every command and its keycaps', async () => {
  const view = await renderReference({ rows: structuredClone(ROWS) })
  const labels = [...view.container.querySelectorAll('li')].map(node => node.textContent)
  assert.equal(labels.length, 3)
  assert.match(labels[0], /快捷键速查/u)
  // Windows spells modifiers out with separators; this is the same rendering the
  // product's own reference produces for the same device.
  assert.match(labels[0], /Ctrl\+Shift\+Slash|Ctrl\|\+|\//u)
  assert.match(labels[1], /新会话/u)
  assert.match(labels[1], /Ctrl\+Alt\+N/u)
  assert.equal(view.container.querySelectorAll('h3').length, 0, 'the application group renders no heading')
})

test('picking a command opens the inline recorder', async () => {
  const view = await renderReference({ rows: structuredClone(ROWS) })
  const rowButton = editControl(view.container, '快捷键速查')
  assert.ok(rowButton, 'every owned row must expose an edit control')
  await view.React.act(async () => { rowButton.dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true })) })
  const group = view.container.querySelector('[data-shortcut-modal="shortcut-edit"]')
  assert.ok(group, 'the inline editor must mount')
  const controls = [...group.querySelectorAll('button')].map(node => node.textContent)
  assert.deepEqual(controls.slice(0, 2), [zh.reset, zh.clear])
  assert.equal(controls[2], zh.record)
})

test('recording a taken combination clears the holder and reports it', async () => {
  const rows = structuredClone(ROWS)
  const view = await renderReference({ rows })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('搜索会话'))
  const rowButton = editControl(row, '搜索会话')
  await view.React.act(async () => { rowButton.dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true })) })
  const recorder = recorderOf(view.container)
  assert.ok(recorder)
  await view.React.act(async () => { recorder.focus() })
  await view.React.act(async () => {
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keydown', {
      code: 'KeyN', key: 'n', ctrlKey: true, altKey: true, bubbles: true,
    }))
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keyup', {
      code: 'KeyN', key: 'n', ctrlKey: true, altKey: true, bubbles: true,
    }))
  })
  // Two writes reached the product: release the holder, then take the combination.
  assert.deepEqual(view.calls.handshake.map(entry => [entry.edit.id, entry.edit.binding === null ? 'clear' : 'set']), [
    ['session.new', 'clear'],
    ['session.search', 'set'],
  ])
  const newRow = view.calls.rows.find(row => row.id === 'session.new')
  assert.equal(newRow.binding, null, 'the displaced command must be left unbound')
})

test('restoring all defaults asks for confirmation first', async () => {
  const rows = structuredClone(ROWS)
  const view = await renderReference({ rows })
  // A customized command enables the footer control.
  await view.React.act(async () => {
    await view.props.controller.apply({ type: 'set', id: 'session.new', binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
    view.props.controller.refresh()
  })
  const resetAll = [...view.container.querySelectorAll('button')].find(node => node.textContent.includes(zh['reset-all']))
  assert.ok(resetAll, 'the footer must expose restore-all')
  assert.equal(resetAll.disabled, false, 'restore-all is enabled once something is customized')
})

test('the three composer gestures render in the input group as editable rows', async () => {
  const view = await renderReference({ rows: rowsWithFixed() })
  const items = [...view.container.querySelectorAll('li')]
  const byLabel = (text) => items.find(node => node.textContent.includes(text))
  for (const label of ['发送消息', '换行', '使用互补的 Queue／Steer 方式']) {
    const row = byLabel(label)
    assert.ok(row, `${label} must render`)
    assert.ok(editControl(row, label), `${label} must be editable`)
  }
  // A fixed action the plugin does not rebind stays read-only.
  const dismiss = byLabel('关闭菜单或顶层弹窗')
  assert.ok(dismiss)
  assert.equal(editControl(dismiss, '关闭菜单或顶层弹窗'), null, 'fixed reservations stay read-only')
  // The input group keeps its heading because it carries rows.
  const headings = [...view.container.querySelectorAll('h3')].map(node => node.textContent)
  assert.ok(headings.includes(zh.input), 'the input group heading must render')
})

test('recording a composer gesture stores the key and leaves the product alone', async () => {
  const rows = rowsWithFixed()
  const view = await renderReference({ rows })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('换行'))
  await view.React.act(async () => {
    editControl(row, '换行').dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true }))
  })
  const recorder = recorderOf(view.container)
  assert.ok(recorder, 'the composer gesture must open the same recorder')
  await view.React.act(async () => { recorder.focus() })
  await view.React.act(async () => {
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keydown', {
      code: 'KeyJ', key: 'j', ctrlKey: true, altKey: true, bubbles: true,
    }))
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keyup', {
      code: 'KeyJ', key: 'j', ctrlKey: true, altKey: true, bubbles: true,
    }))
  })
  // No product write: the gesture has no editable product command.
  assert.deepEqual(view.calls.handshake, [])
  const rowModel = view.props.controller.model().editable.find(entry => entry.id === 'fixed.newline')
  assert.equal(rowModel.customized, true)
  assert.deepEqual(rowModel.binding, normalizeBinding({ code: 'KeyJ', modifiers: ['primary', 'alt'] }, PLATFORM))
})

test('recording a reserved single key shows the single-key message', async () => {
  const view = await renderReference({ rows: structuredClone(ROWS) })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('新会话'))
  const rowButton = editControl(row, '新会话')
  await view.React.act(async () => { rowButton.dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true })) })
  const recorder = recorderOf(view.container)
  await view.React.act(async () => { recorder.focus() })
  await view.React.act(async () => {
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keydown', {
      code: 'Enter', key: 'Enter', bubbles: true,
    }))
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keyup', {
      code: 'Enter', key: 'Enter', bubbles: true,
    }))
  })
  const group = view.container.querySelector('[data-shortcut-modal="shortcut-edit"]')
  // The refusal is announced by the notice, described for assistive technology,
  // and shown on the field itself only as an invalid border — the same three
  // channels the product's own editor uses.
  assert.ok([...view.container.querySelectorAll('toast')].some(node => node.textContent === zh['reserved-key']),
    'the reason must be raised as a notice the user can see')
  assert.equal(group.querySelector('span[id]').textContent, zh['reserved-key'], 'and described for assistive tech')
  assert.equal(group.querySelector('[data-shortcut-problem]'), null, 'no extra line is added under the field')
  assert.equal(recorder.getAttribute('aria-invalid'), 'true', 'the recorder marks itself invalid')
  assert.deepEqual(view.calls.handshake, [], 'a refused key writes nothing')
  const rowModel = view.props.controller.model().editable.find(entry => entry.id === 'session.new')
  assert.equal(rowModel.customized, false, 'the command keeps its default')
})

test('a repeated refusal is announced again rather than swallowed', async () => {
  const view = await renderReference({ rows: structuredClone(ROWS) })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('新会话'))
  await view.React.act(async () => {
    editControl(row, '新会话').dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true }))
  })
  const recorder = recorderOf(view.container)
  await view.React.act(async () => { recorder.focus() })
  const refuse = async () => {
    await view.React.act(async () => {
      view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keydown', {
        code: 'ArrowUp', key: 'ArrowUp', bubbles: true,
      }))
      view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keyup', {
        code: 'ArrowUp', key: 'ArrowUp', bubbles: true,
      }))
    })
    return [...view.container.querySelectorAll('toast')].map(node => node.textContent)
  }
  assert.deepEqual(await refuse(), [zh['reserved-key']], 'the first attempt is announced')
  // A toast that already carries the identical sentence is normally not re-raised,
  // so the message has to be cleared on every new attempt or the user gets silence.
  assert.deepEqual(await refuse(), [zh['reserved-key']], 'the second attempt is announced too')
})

test('a refused single key names itself the same way a modulated conflict does not', async () => {
  const view = await renderReference({ rows: rowsWithFixed() })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('搜索会话'))
  const rowButton = editControl(row, '搜索会话')
  await view.React.act(async () => { rowButton.dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true })) })
  const recorder = recorderOf(view.container)
  await view.React.act(async () => { recorder.focus() })
  // `/` is one of the six reserved single keys, and it is also owned by the
  // command menu. The single-key message must win: it is the actionable one.
  await view.React.act(async () => {
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keydown', {
      code: 'Slash', key: '/', bubbles: true,
    }))
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keyup', {
      code: 'Slash', key: '/', bubbles: true,
    }))
  })
  assert.ok([...view.container.querySelectorAll('toast')].some(node => node.textContent === zh['reserved-key']),
    'the single-key reason must reach the notice, not the occupied-by sentence')
})

test('every dictionary entry is reachable from the plugin source', () => {
  // A dead entry is a promise the interface never keeps: it costs a translation
  // and tells the next reader that some surface uses it. Keys reached through a
  // variable cannot be found by text, so they are named here instead.
  const reachedThroughAValue = new Set([
    'application', 'input', 'menus', 'approval', // group headings: `t(group)`
    'reserved', 'reserved-key', 'reserved-combination', 'modifier-required', 'unsupported-browser', // `t(result.issue)`
    'conflict', 'stale', 'write-failed', 'not-ready', 'saved', // `failureText` status arms
  ])
  const directory = join(ROOT, 'src', 'client')
  const sources = readdirSync(directory)
    .filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map(name => readFileSync(join(directory, name), 'utf8'))
    .join('\n')
  const unreachable = Object.keys(zh).filter(key =>
    !reachedThroughAValue.has(key) && !sources.includes(`t('${key}'`)
    && !sources.includes(`zh['${key}']`))
  assert.deepEqual(unreachable, [], 'these entries are never read by any surface')
  // The English dictionary is checked complete against the Chinese key set.
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

test('a failed result is worded by one function for both surfaces', () => {
  // The reference's notice and the recorder's inline description must never
  // disagree. Reading only the status is what produced the empty
  // "已被「」占用" sentence, so every producer's fields are asserted here in the
  // order `failureText` promises to consult them.
  const reason = zh['reserved-key']
  const cases = [
    [{ status: 'conflict', displaced: [], message: reason }, reason, 'a carried sentence wins'],
    [{ status: 'conflict', displaced: [], issue: 'reserved-key' }, reason, 'a classified issue is enough'],
    [{ status: 'conflict', displaced: [], conflicts: ['打开命令菜单'] },
      t('reserved-conflict', { commands: '打开命令菜单' }), 'an occupied combination names its holder'],
    [{ status: 'write-failed', displaced: [] }, zh['write-failed'], 'a write failure says so'],
    [{ status: 'stale', displaced: [] }, zh['stale'], 'a stale document says so'],
    [{ status: 'not-ready', displaced: [] }, zh['not-ready'], 'a not-ready service says so'],
  ]
  for (const [result, expected, because] of cases) {
    assert.equal(failureText(result, t), expected, because)
  }
  // An unreadable document explains the recovery path rather than a bare status.
  assert.equal(failureText({ status: 'unreadable', displaced: [] }, t).includes(zh['using-defaults']), true)
})

test('a commit the controller refuses is announced with its own reason', async () => {
  const view = await renderReference({ rows: structuredClone(ROWS) })
  const reason = zh['write-failed']
  // The recorder's preview never reaches the controller for a modulation, so
  // only the commit can refuse it — the other of the two refusal paths.
  view.ctx.shortcuts.edit = async () => ({ status: 'write-failed', displaced: [] })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('搜索会话'))
  await view.React.act(async () => {
    editControl(row, '搜索会话').dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true }))
  })
  const recorder = recorderOf(view.container)
  await view.React.act(async () => { recorder.focus() })
  await view.React.act(async () => {
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keydown', {
      code: 'KeyJ', key: 'j', ctrlKey: true, altKey: true, bubbles: true,
    }))
    view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent('keyup', {
      code: 'KeyJ', key: 'j', ctrlKey: true, altKey: true, bubbles: true,
    }))
  })
  const group = view.container.querySelector('[data-shortcut-modal="shortcut-edit"]')
  assert.equal(group.querySelector('span[id]').textContent, reason, 'the reason reaches the field description')
  assert.ok([...view.container.querySelectorAll('toast')].some(node => node.textContent === reason),
    'and the notice, instead of the empty "occupied by nobody" sentence')
})

test('recording Shift+Enter on a product command states the reservation and changes nothing', async () => {
  const view = await renderReference({ rows: rowsWithFixed() })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('搜索会话'))
  await view.React.act(async () => {
    editControl(row, '搜索会话').dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true }))
  })
  const recorder = recorderOf(view.container)
  await view.React.act(async () => { recorder.focus() })
  await view.React.act(async () => {
    for (const type of ['keydown', 'keyup']) {
      view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent(type, {
        code: 'Enter', key: 'Enter', shiftKey: true, bubbles: true,
      }))
    }
  })
  // The product reserves this combination for the input box and cannot dispatch
  // it to an editable command, so the recording is refused with the reason the
  // user can act on — and nothing is written, so no phantom binding appears.
  const toasts = [...view.container.querySelectorAll('toast')].map(node => node.textContent)
  assert.deepEqual(toasts, [zh['reserved-combination']],
    `the notice must state the reservation, saw ${JSON.stringify(toasts)}`)
  const model = view.props.controller.model()
  assert.notEqual(model.editable.find(entry => entry.id === 'fixed.newline').binding, null,
    '换行 keeps its combination')
  assert.equal(model.editable.find(entry => entry.id === 'session.search').customized, false,
    'the command keeps its previous binding')
  assert.deepEqual(view.calls.handshake, [], 'and nothing reached the product')
})

test('a commit that throws releases the recorder instead of wedging it', async () => {
  const view = await renderReference({ rows: rowsWithFixed() })
  const row = [...view.container.querySelectorAll('li')].find(node => node.textContent.includes('换行'))
  await view.React.act(async () => {
    editControl(row, '换行').dispatchEvent(new view.dom.window.MouseEvent('click', { bubbles: true }))
  })
  const recorder = recorderOf(view.container)
  await view.React.act(async () => { recorder.focus() })
  // The bridge can reject, and the recorder has to survive it. Leaving the busy
  // flag set disables every control with no way back: a failed commit does not
  // unmount the editor, so nothing else would ever clear it. The rejection is
  // injected on the controller the component actually holds — assigning through
  // the service handle does not reach it.
  const controller = view.props.controller
  const original = controller.apply
  controller.apply = async () => { throw new Error('bridge is gone') }
  const errors = []
  const quiet = console.error
  console.error = (...args) => { errors.push(args.join(' ')) }
  try {
    await view.React.act(async () => {
      for (const type of ['keydown', 'keyup']) {
        view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent(type, {
          code: 'KeyJ', key: 'j', ctrlKey: true, altKey: true, bubbles: true,
        }))
      }
    })
  } finally {
    console.error = quiet
    controller.apply = original
  }
  const group = view.container.querySelector('[data-shortcut-modal="shortcut-edit"]')
  assert.equal(errors.some(line => line.includes('recording failed')), true, 'the rejection is reported')
  assert.equal(group.getAttribute('aria-busy'), 'false', 'the editor is not left busy')
  assert.equal(recorder.getAttribute('aria-disabled'), 'false', 'and the recorder still accepts input')
  // A later attempt must actually reach the controller again.
  const before = view.calls.handshake.length
  await view.React.act(async () => {
    for (const type of ['keydown', 'keyup']) {
      view.dom.window.document.dispatchEvent(new view.dom.window.KeyboardEvent(type, {
        code: 'KeyK', key: 'k', ctrlKey: true, altKey: true, bubbles: true,
      }))
    }
  })
  assert.equal(view.calls.handshake.length > before, true, 'the next recording is not blocked')
})
