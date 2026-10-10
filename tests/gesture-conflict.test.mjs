/**
 * Regression checks for the reported sequence.
 *
 * The report had one root cause with three faces: arbitration read the
 * product's *default* gestures instead of the plugin document, so a gesture
 * the user had moved neither blocked a key nor yielded one. These checks walk
 * the exact steps from the report, plus the neighbouring cases.
 */
import assert from 'node:assert/strict'
import { test } from './harness.mjs'
import { KeymapController } from '../src/client/controller.ts'
import { memoryKeymapStorage } from '../src/client/document.ts'
import { bindingIssue, normalizeBinding, presentBinding } from '../src/client/bindings.ts'

const PLATFORM = 'windows'
const SEND = 'fixed.send'
const NEWLINE = 'fixed.newline'
/** The product command every conflict test assigns to. */
const SEARCH = 'session.search'
/** Ctrl+Shift+Enter, the combination the report starts from. */
const TRIPLE = { code: 'Enter', modifiers: ['control', 'shift'] }

/**
 * Build a controller over a fresh product stub: one command that already holds
 * Ctrl+Shift+Enter, the composer gestures, and the frozen reservations that
 * really do own bare Enter.
 * @returns the controller, its write log, and the product command's binding.
 */
async function controllerUnderTest() {
  const fixed = (id, label, modifiers, group = 'input') => ({
    id,
    label,
    keys: presentBinding(normalizeBinding({ code: 'Enter', modifiers }, PLATFORM), PLATFORM).keys,
    bindings: [normalizeBinding({ code: 'Enter', modifiers }, PLATFORM)],
    group,
  })
  const normalized = (code, modifiers) => normalizeBinding({ code, modifiers }, PLATFORM)
  // The product command starts on the very combination the report's step 1
  // assigns, so step 1 has a real holder to displace.
  const catalogBinding = { value: normalizeBinding(TRIPLE, PLATFORM) }
  const rows = [
    {
      id: 'session.search',
      label: '搜索会话',
      aliases: [],
      get keys() { return presentBinding(catalogBinding.value, PLATFORM).keys },
      aria: undefined,
      get binding() { return catalogBinding.value },
      modified: false,
      conflicts: [],
      issue: null,
    },
  ]
  const fixedRows = [
    fixed(SEND, '发送消息', []),
    fixed(NEWLINE, '换行', ['shift']),
    fixed('fixed.complementary', '使用互补的 Queue／Steer 方式', ['control']),
    fixed('fixed.select', '选择菜单项', [], 'menus'),
    fixed('approval.allow', '允许一次', [], 'approval'),
  ]
  const writes = []
  let revision = 'r1'
  const product = {
    runtime: 'desktop',
    platform: PLATFORM,
    catalog: { getSnapshot: () => rows },
    fixedCatalog: { getSnapshot: () => fixedRows },
    config: { getSnapshot: () => ({ revision, status: 'ready' }) },
    describeBinding(binding) {
      if (binding === null) return { binding: null, keys: [], issue: null }
      const value = normalized(binding.code, binding.modifiers)
      return {
        binding: value,
        keys: presentBinding(value, PLATFORM).keys,
        issue: bindingIssue(value, 'desktop', PLATFORM),
      }
    },
    async edit(edit) {
      writes.push(edit)
      revision = `r${writes.length + 1}`
      if (edit.type === 'set' && edit.id === 'session.search') catalogBinding.value = edit.binding
      return { status: 'saved' }
    },
    async recording() {},
  }
  const controller = new KeymapController(product, memoryKeymapStorage())
  await controller.start()
  return { controller, writes, catalogBinding }
}

/**
 * Read one editable row.
 * @param controller - the controller under test.
 * @param id - the row's command id.
 * @returns the row.
 */
function row(controller, id) {
  const found = controller.model().editable.find(entry => entry.id === id)
  assert.ok(found, `${id} must be an editable row`)
  return found
}

test('step 1: 发送消息 takes Ctrl+Shift+Enter and only the displaced command is written', async () => {
  const { controller, writes } = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: SEND, binding: TRIPLE })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced.map(entry => entry.id), ['session.search'])
  // The gesture itself never reaches the product; its holder is released through it.
  assert.deepEqual(writes.map(write => [write.id, write.binding]), [['session.search', null]])
  assert.deepEqual(row(controller, SEND).keys, ['Ctrl', '+', 'Shift', '+', 'Enter'])
})

test('step 2: 发送消息 takes bare Enter, which no fixed action blocks', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: SEND, binding: TRIPLE })
  // The report's exact second step. Bare Enter is what a dialog navigates with,
  // and those actions are dialog-scoped: they must not refuse a composer
  // gesture that lives in the input box, where the two never contend.
  const result = await controller.apply({ type: 'set', id: SEND, binding: { code: 'Enter', modifiers: [] } })
  assert.equal(result.status, 'saved')
  assert.equal(result.conflicts, undefined, 'no fixed action may blame a dialog-scoped key')
  assert.deepEqual(row(controller, SEND).keys, ['Enter'])
})

test('step 2b: bare Enter round-trips and leaves the other gestures alone', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: SEND, binding: TRIPLE })
  await controller.apply({ type: 'set', id: SEND, binding: { code: 'Enter', modifiers: [] } })
  // Enter is `发送消息`'s own performed gesture, so taking it displaces nobody.
  assert.deepEqual(row(controller, SEND).keys, ['Enter'])
  assert.deepEqual(row(controller, NEWLINE).keys, ['Shift', '+', 'Enter'], '换行 is untouched')
  // It is still a real customization, so restoring works.
  const restored = await controller.apply({ type: 'reset', id: SEND })
  assert.equal(restored.status, 'saved')
  assert.equal(row(controller, SEND).customized, false)
  assert.deepEqual(row(controller, SEND).keys, ['Enter'])
})

test('step 2c: a bare letter, a bare dot and a bare backtick are all accepted here', async () => {
  const { controller } = await controllerUnderTest()
  // The three gestures live in the input box, so a bare key is meaningful: the
  // only singles they must leave alone are Esc, `/`, `@` and the two arrows.
  for (const [code, keycap] of [['KeyJ', 'J'], ['Period', '.'], ['Backquote', '`'], ['Comma', ',']]) {
    const result = await controller.apply({ type: 'set', id: SEND, binding: { code, modifiers: [] } })
    assert.equal(result.status, 'saved', `bare ${keycap} must be accepted`)
    assert.deepEqual(row(controller, SEND).keys, [keycap])
  }
  const enter = await controller.apply({ type: 'set', id: NEWLINE, binding: { code: 'Enter', modifiers: [] } })
  assert.equal(enter.status, 'saved', 'Enter is accepted here too')
})

test('step 2d: a modulation of Enter that nothing owns is accepted', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: SEND, binding: TRIPLE })
  const result = await controller.apply({ type: 'set', id: NEWLINE, binding: { code: 'Enter', modifiers: ['alt'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced, [])
  assert.deepEqual(row(controller, NEWLINE).keys, ['Alt', '+', 'Enter'])
})

test('step 2c: 换行 takes a free key while 发送消息 holds the triple', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: SEND, binding: TRIPLE })
  const result = await controller.apply({ type: 'set', id: NEWLINE, binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced, [], 'Ctrl+Alt+J was free')
  assert.deepEqual(row(controller, NEWLINE).keys, ['Ctrl', '+', 'Alt', '+', 'J'])
  assert.deepEqual(row(controller, SEND).keys, ['Ctrl', '+', 'Shift', '+', 'Enter'], '发送消息 keeps its key')
})

test('step 3: 换行 taking the triple clears 发送消息 and reports it', async () => {
  const { controller, writes } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: SEND, binding: TRIPLE })
  const result = await controller.apply({ type: 'set', id: NEWLINE, binding: TRIPLE })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced.map(entry => entry.id), [SEND], '发送消息 must be reported as cleared')
  assert.equal(result.displaced[0].label, '发送消息')
  assert.deepEqual(result.displaced[0].keys, ['Ctrl', '+', 'Shift', '+', 'Enter'])
  // 发送消息 is unbound, 换行 owns the key.
  assert.equal(row(controller, SEND).binding, null)
  assert.deepEqual(row(controller, SEND).keys, [])
  assert.equal(row(controller, SEND).customized, true)
  assert.deepEqual(row(controller, NEWLINE).keys, ['Ctrl', '+', 'Shift', '+', 'Enter'])
  // Still no product write for either gesture: the report's step 3 moves a
  // composer gesture between two composer rows.
  assert.deepEqual(writes.length, 1, 'only step 1 released the product command')
})

test('the recorder preview never accepts what the commit refuses', async () => {
  const { controller } = await controllerUnderTest()
  // Every combination the translation layer cannot carry: a two-key chord and
  // the shell's focus key. The preview runs before the commit, so if it does not
  // apply the same limits the user sees keycaps, releases the keys, and only
  // then learns the recording was refused.
  const refused = [
    ['chord', { code: 'KeyJ', secondCode: 'KeyK', modifiers: ['primary'] }],
    ['Ctrl+Tab', { code: 'Tab', modifiers: ['control'] }],
    ['bare Tab', { code: 'Tab', modifiers: [] }],
  ]
  for (const [name, binding] of refused) {
    const preview = controller.describeBinding(binding, NEWLINE)
    const committed = await controller.apply({ type: 'set', id: NEWLINE, binding })
    assert.equal(committed.status, 'conflict', `${name} must be refused on commit`)
    assert.notEqual(preview.issue, null, `${name} must be refused by the preview too`)
    assert.equal(preview.issue, committed.issue, `${name} must be refused for the same reason`)
  }
  // The same chord is fine on a product row: the limit belongs to the
  // translation layer, not to the plugin as a whole.
  assert.equal(controller.describeBinding(refused[0][1], SEARCH).issue, null,
    'a product command may use a chord')
  assert.equal(row(controller, NEWLINE).customized, false, 'nothing was recorded')
})

test('the recorder preview agrees with the commit on what a binding displaces', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: SEND, binding: TRIPLE })
  const preview = controller.describeBinding(TRIPLE, NEWLINE)
  const committed = await controller.apply({ type: 'set', id: NEWLINE, binding: TRIPLE })
  assert.equal(committed.status, 'saved')
  assert.deepEqual(preview.conflicts, committed.displaced.map(entry => entry.id),
    'the preview names exactly the rows the commit clears')
})

test('a product command may not take the input box’s Enter combinations', async () => {
  const { controller } = await controllerUnderTest()
  // The product registers Shift+Enter and Ctrl+Enter as fixed reservations and
  // folds a fixed reservation into every editable row's conflicts, and a
  // conflicting row is consumed without ever running. Accepting the assignment
  // would hand the user a binding that silently does nothing — which is exactly
  // what was reported. It is refused instead, in the preview and on commit.
  for (const [name, binding, holder] of [
    ['Shift+Enter', { code: 'Enter', modifiers: ['shift'] }, NEWLINE],
    ['Ctrl+Enter', { code: 'Enter', modifiers: ['control'] }, 'fixed.complementary'],
  ]) {
    const preview = controller.describeBinding(binding, SEARCH)
    const result = await controller.apply({ type: 'set', id: SEARCH, binding })
    assert.equal(result.status, 'conflict', `${name} must be refused`)
    assert.equal(result.issue, 'reserved-combination', `${name} must name the reservation rule`)
    assert.equal(preview.issue, result.issue, `${name} must be refused by the preview for the same reason`)
    assert.notEqual(row(controller, holder).binding, null, `${name} must stay with its action`)
    assert.equal(row(controller, SEARCH).customized, false, 'and nothing was written')
  }
})

test('the reservation belongs to the combination, not to the action that used it', async () => {
  const { controller } = await controllerUnderTest()
  // Moving 换行 off Shift+Enter does not release it for ordinary commands: the
  // product's fixed reservation covers the combination window-wide, so the rule
  // cannot depend on where a gesture currently sits.
  await controller.apply({ type: 'set', id: NEWLINE, binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  const stillReserved = await controller.apply({ type: 'set', id: SEARCH, binding: { code: 'Enter', modifiers: ['shift'] } })
  assert.equal(stillReserved.status, 'conflict')
  assert.equal(stillReserved.issue, 'reserved-combination')
  // Every other Enter combination is free, and the action keeps its own key.
  const alt = await controller.apply({ type: 'set', id: SEARCH, binding: { code: 'Enter', modifiers: ['alt'] } })
  assert.equal(alt.status, 'saved')
  assert.deepEqual(row(controller, SEARCH).keys, ['Alt', '+', 'Enter'])
  assert.deepEqual(row(controller, 'fixed.complementary').keys, ['Ctrl', '+', 'Enter'], 'the action keeps its key')
})

test('the three input actions still take the reserved Enter combinations', async () => {
  const { controller } = await controllerUnderTest()
  // The reservation exists because the product cannot dispatch those
  // combinations to an editable command. A composer action's key is translated
  // locally and never mirrored, so it is unaffected — including Enter itself,
  // which is why that one is exempt for exactly these three.
  for (const [id, binding, keycaps] of [
    [SEND, { code: 'Enter', modifiers: ['shift'] }, ['Shift', '+', 'Enter']],
    [NEWLINE, { code: 'Enter', modifiers: ['control'] }, ['Ctrl', '+', 'Enter']],
    [NEWLINE, { code: 'Enter', modifiers: [] }, ['Enter']],
  ]) {
    const result = await controller.apply({ type: 'set', id, binding })
    assert.equal(result.status, 'saved', `${id} must accept ${keycaps.join('')}`)
    assert.deepEqual(row(controller, id).keys, keycaps)
  }
})

test('a moved gesture no longer blocks its old key', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: NEWLINE, binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  // Shift+Enter was 换行's; it has moved, so it is free now.
  const result = await controller.apply({ type: 'set', id: SEND, binding: { code: 'Enter', modifiers: ['shift'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced, [], 'the moved gesture holds nothing at Shift+Enter')
  assert.deepEqual(row(controller, SEND).keys, ['Shift', '+', 'Enter'])
  assert.deepEqual(row(controller, NEWLINE).keys, ['Ctrl', '+', 'Alt', '+', 'J'])
})

test('a cleared gesture blocks its old key for nobody', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: NEWLINE, binding: null })
  const result = await controller.apply({ type: 'set', id: SEND, binding: { code: 'Enter', modifiers: ['shift'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced, [])
  assert.equal(row(controller, NEWLINE).binding, null)
  assert.deepEqual(row(controller, SEND).keys, ['Shift', '+', 'Enter'])
})

test('an untouched gesture still owns the combination it performs', async () => {
  const { controller } = await controllerUnderTest()
  // Shift+Enter is 换行's performed gesture while untouched, so moving onto it
  // displaces 换行 and says so.
  const result = await controller.apply({ type: 'set', id: SEND, binding: { code: 'Enter', modifiers: ['shift'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced.map(entry => entry.id), [NEWLINE])
  assert.equal(result.displaced[0].label, '换行')
  assert.equal(row(controller, NEWLINE).binding, null)
})

test('a cleared gesture is not displaced by its own performed key', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: NEWLINE, binding: null })
  const result = await controller.apply({ type: 'set', id: SEND, binding: { code: 'Enter', modifiers: ['shift'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced, [], 'a cleared gesture holds nothing to take')
})
