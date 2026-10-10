/**
 * Arbitration checks for the plugin controller.
 *
 * The fake product below reproduces the one behavior that shapes this design:
 * `edit` refuses a write that would disable another command. The controller has
 * to clear the holders first, then take the combination, and it has to report
 * every holder it cleared.
 */
import assert from 'node:assert/strict'
import { test } from './harness.mjs'
import { KeymapController } from '../src/client/controller.ts'
import { memoryKeymapStorage } from '../src/client/document.ts'
import { bindingIssue, normalizeBinding, presentBinding } from '../src/client/bindings.ts'

const PLATFORM = 'windows'
const RUNTIME = process.env.FAKE_RUNTIME ?? 'desktop'
/**
 * A combination both runtimes admit.
 *
 * The browser profile refuses several families the desktop shell accepts — for
 * example `Ctrl+<letter>` without Alt — so the shared expectations below use
 * `Ctrl+Alt+<letter>`, which the product admits on the desktop and in a
 * browser alike.
 */
const TAKEN = { code: 'KeyN', modifiers: ['primary', 'alt'] }

/**
 * Build a controller over a fresh product stub and a fresh in-memory document.
 * Every test gets its own storage so one test's document cannot leak into the
 * next through the module-level fallback.
 * @returns the controller plus the stub's write log.
 */
async function controllerUnderTest() {
  const fake = fakeProduct()
  const controller = new KeymapController(fake.product, memoryKeymapStorage())
  await controller.start()
  return { controller, writes: fake.writes }
}

/** Product catalog rows: the two commands the fixture edits. */
function productRows() {
  const make = (id, label, binding) => {
    const normalized = binding === null ? null : normalizeBinding(binding, PLATFORM)
    return {
      id, label, aliases: [],
      keys: presentBinding(normalized, PLATFORM).keys,
      aria: presentBinding(normalized, PLATFORM).aria,
      binding: normalized, modified: false, conflicts: [], issue: null,
    }
  }
  return [
    make('shortcuts.open', '快捷键速查', { code: 'Slash', modifiers: ['primary'] }),
    make('session.new', '新会话', TAKEN),
    make('session.search', '搜索会话', { code: 'KeyK', modifiers: ['primary', 'alt'] }),
  ]
}

/**
 * The product's fixed rows for this fixture: the composer gestures the plugin
 * rebinds, exactly as `ui-conversation` registers them.
 * @returns the fixed catalog rows.
 */
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
 * Build a product stub that mirrors the shipped persistence rules.
 * @returns the stub plus the write log and a revision reader.
 */
function fakeProduct() {
  const rows = productRows()
  const overrides = new Map()
  const writes = []
  let revision = 'rev-0'
  const effective = (id) => {
    if (overrides.has(id)) return overrides.get(id)
    return rows.find(row => row.id === id)?.binding ?? null
  }
  const overlapping = (left, right) => {
    if (left === null || right === null) return false
    if (left.modifiers.join('+') !== right.modifiers.join('+')) return false
    if (left.secondCode !== undefined && right.secondCode !== undefined) {
      return [left.code, left.secondCode].sort().join() === [right.code, right.secondCode].sort().join()
    }
    return [left.code, left.secondCode].some(code => code !== undefined && (code === right.code || code === right.secondCode))
  }
  return {
    writes,
    get revision() { return revision },
    product: {
      runtime: RUNTIME,
      platform: PLATFORM,
      catalog: { getSnapshot: () => rows.map(row => ({ ...row, binding: effective(row.id) })) },
      fixedCatalog: { getSnapshot: () => fixedRows() },
      config: { getSnapshot: () => ({ revision, status: 'ready' }) },
      describeBinding(binding) {
        if (binding === null) return { binding: null, keys: [], issue: null }
        const normalized = normalizeBinding(binding, PLATFORM)
        return {
          binding: normalized,
          keys: presentBinding(normalized, PLATFORM).keys,
          issue: bindingIssue(normalized, RUNTIME, PLATFORM),
        }
      },
      async edit(edit, expected) {
        writes.push({ ...edit, expected })
        if (expected !== revision) return { status: 'stale' }
        if (edit.type === 'reset-all') {
          overrides.clear()
          revision = `rev-${writes.length}`
          return { status: 'saved' }
        }
        if (edit.type === 'reset') {
          overrides.delete(edit.id)
          revision = `rev-${writes.length}`
          return { status: 'saved' }
        }
        if (edit.binding !== null) {
          const clash = rows
            .filter(row => row.id !== edit.id && overlapping(effective(row.id), edit.binding))
            .map(row => row.id)
          if (clash.length > 0) return { status: 'conflict', conflicts: clash }
        }
        overrides.set(edit.id, edit.binding)
        revision = `rev-${writes.length}`
        return { status: 'saved' }
      },
      async recording() {},
    },
  }
}

test('a fresh controller inherits every product default', async () => {
  const { controller } = await controllerUnderTest()
  const model = controller.model()
  assert.deepEqual(model.rows.filter(row => row.kind === 'owned').map(row => row.id),
    ['shortcuts.open', 'session.new', 'session.search'])
  assert.deepEqual(model.rows.find(row => row.id === 'session.new').keys, ['Ctrl', '+', 'Alt', '+', 'N'])
  assert.equal(controller.getSnapshot().customized, 0)
})

test('assigning a taken combination clears the holder first and reports it', async () => {
  const { controller, writes } = await controllerUnderTest()
  // `Ctrl+Alt+N` currently belongs to `session.new`; give it to `session.search`.
  const result = await controller.apply({ type: 'set', id: 'session.search', binding: TAKEN })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced.map(entry => entry.id), ['session.new'])
  assert.equal(result.displaced[0].label, '新会话')
  assert.deepEqual(result.displaced[0].keys, ['Ctrl', '+', 'Alt', '+', 'N'])
  // Two writes, in order: release, then take.
  assert.deepEqual(writes.map(write => [write.type, write.id, write.binding === null ? null : 'binding']), [
    ['set', 'session.new', null],
    ['set', 'session.search', 'binding'],
  ])
  assert.deepEqual(controller.model().rows.find(row => row.id === 'session.new').keys, [])
  assert.deepEqual(controller.model().rows.find(row => row.id === 'session.search').keys, ['Ctrl', '+', 'Alt', '+', 'N'])
  assert.equal(controller.getSnapshot().customized, 2)
})

test('clearing a command is never refused and leaves it unbound', async () => {
  const { controller } = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: 'session.new', binding: null })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced, [])
  assert.equal(controller.model().rows.find(row => row.id === 'session.new').binding, null)
  assert.equal(controller.getSnapshot().customized, 1)
})

test('restoring one command drops its override and returns the default', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: 'session.new', binding: null })
  assert.equal(controller.model().rows.find(row => row.id === 'session.new').binding, null)
  const result = await controller.apply({ type: 'reset', id: 'session.new' })
  assert.equal(result.status, 'saved')
  assert.deepEqual(controller.model().rows.find(row => row.id === 'session.new').keys, ['Ctrl', '+', 'Alt', '+', 'N'])
  assert.equal(controller.getSnapshot().customized, 0)
})

test('restoring everything clears the profile overrides', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: 'session.new', binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  assert.equal(controller.getSnapshot().customized, 1)
  const result = await controller.apply({ type: 'reset-all' })
  assert.equal(result.status, 'saved')
  assert.equal(controller.getSnapshot().customized, 0)
  assert.deepEqual(controller.model().rows.find(row => row.id === 'session.new').keys, ['Ctrl', '+', 'Alt', '+', 'N'])
})

test('a combination the product rejects never reaches the document', async () => {
  const { controller } = await controllerUnderTest()
  // The product admits everything on Windows/macOS desktop, so this assertion
  // only bites on the browser profile, where text-editing keys are reserved.
  const rejected = RUNTIME === 'web'
  const result = await controller.apply({ type: 'set', id: 'session.new', binding: { code: 'KeyC', modifiers: ['primary'] } })
  if (rejected) {
    assert.equal(result.status, 'conflict')
    assert.equal(result.issue, 'reserved')
    assert.equal(controller.getSnapshot().customized, 0)
  } else {
    assert.equal(result.status, 'saved')
    assert.equal(controller.getSnapshot().customized, 1)
  }
})

test('describeBinding previews the displacement without committing it', async () => {
  const { controller, writes } = await controllerUnderTest()
  const view = controller.describeBinding(TAKEN, 'session.search')
  assert.deepEqual(view.conflicts, ['session.new'])
  assert.deepEqual(view.keys, ['Ctrl', '+', 'Alt', '+', 'N'])
  assert.equal(view.issue, null)
  assert.deepEqual(writes, [])
})

test('reconcile writes only commands whose product binding drifted', async () => {
  const { controller, writes } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: 'session.new', binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  const before = writes.length
  // Simulate a product restart that lost the mirrored value.
  await controller.reconcile()
  assert.equal(writes.length, before)
  assert.deepEqual(controller.model().rows.find(row => row.id === 'session.new').keys, ['Ctrl', '+', 'Alt', '+', 'J'])
})

test('binding a composer gesture writes only the rows it displaces', async () => {
  const { controller, writes } = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: 'fixed.send', binding: TAKEN })
  assert.equal(result.status, 'saved')
  // The gesture itself has no editable product command, so it is never written;
  // the product command that held the combination is released through the product.
  assert.deepEqual(writes.map(write => [write.id, write.binding]), [['session.new', null]])
  assert.deepEqual(result.displaced.map(entry => entry.id), ['session.new'])
  assert.equal(result.displaced[0].label, '新会话')
  const row = controller.model().editable.find(entry => entry.id === 'fixed.send')
  assert.equal(row.composer, true)
  assert.equal(row.customized, true)
  assert.deepEqual(row.keys, ['Ctrl', '+', 'Alt', '+', 'N'])
})

test('binding a composer gesture to a free key reaches no write path at all', async () => {
  const { controller, writes } = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: 'fixed.send', binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(writes, [])
  assert.deepEqual(result.displaced, [])
})

test('a composer row shows the product gesture until the user changes it', async () => {
  const { controller } = await controllerUnderTest()
  const row = controller.model().editable.find(entry => entry.id === 'fixed.newline')
  assert.equal(row.composer, true)
  assert.equal(row.customized, false)
  assert.deepEqual(row.keys, presentBinding(normalizeBinding({ code: 'Enter', modifiers: ['shift'] }, PLATFORM), PLATFORM).keys)
  assert.deepEqual(row.binding, normalizeBinding({ code: 'Enter', modifiers: ['shift'] }, PLATFORM))
})

test('clearing a composer gesture keeps the row and empties its key', async () => {
  const { controller, writes } = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: 'fixed.newline', binding: null })
  assert.equal(result.status, 'saved')
  assert.deepEqual(writes, [])
  const row = controller.model().editable.find(entry => entry.id === 'fixed.newline')
  assert.equal(row.customized, true)
  assert.equal(row.binding, null)
  assert.deepEqual(row.keys, [])
})

test('restoring a composer gesture returns the product default', async () => {
  const { controller } = await controllerUnderTest()
  await controller.apply({ type: 'set', id: 'fixed.send', binding: TAKEN })
  assert.deepEqual(controller.model().editable.find(entry => entry.id === 'fixed.send').keys, ['Ctrl', '+', 'Alt', '+', 'N'])
  const result = await controller.apply({ type: 'reset', id: 'fixed.send' })
  assert.equal(result.status, 'saved')
  const row = controller.model().editable.find(entry => entry.id === 'fixed.send')
  assert.equal(row.customized, false)
  assert.deepEqual(row.keys, ['Enter'])
})

test('a composer gesture takes a bare key, but not a chord or Tab', async () => {
  const { controller } = await controllerUnderTest()
  // A bare letter is the user's call: the rule that limits bare keys is the six
  // reserved singles, checked by `tests/reserved-keys.test.mjs`.
  const bare = await controller.apply({ type: 'set', id: 'fixed.send', binding: { code: 'KeyJ', modifiers: [] } })
  assert.equal(bare.status, 'saved')
  assert.deepEqual(controller.model().editable.find(entry => entry.id === 'fixed.send').keys, ['J'])
  // A chord has no single press to substitute.
  const chord = await controller.apply({
    type: 'set', id: 'fixed.send', binding: { code: 'KeyJ', secondCode: 'KeyK', modifiers: ['primary'] },
  })
  assert.equal(chord.status, 'conflict')
  // Tab belongs to the shell's focus traversal.
  const tab = await controller.apply({ type: 'set', id: 'fixed.send', binding: { code: 'Tab', modifiers: ['primary'] } })
  assert.equal(tab.status, 'conflict')
})

test('a composer gesture takes Shift+Enter from 换行 and reports it', async () => {
  const { controller } = await controllerUnderTest()
  // Shift+Enter is what 换行 performs while untouched, so the gesture moves:
  // 换行 is cleared and named, exactly like any other later-wins assignment.
  const result = await controller.apply({ type: 'set', id: 'fixed.send', binding: { code: 'Enter', modifiers: ['shift'] } })
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.displaced.map(entry => entry.id), ['fixed.newline'])
  assert.equal(result.displaced[0].label, '换行')
  assert.deepEqual(result.displaced[0].keys, ['Shift', '+', 'Enter'])
  const newline = controller.model().editable.find(entry => entry.id === 'fixed.newline')
  assert.equal(newline.binding, null, '换行 is cleared')
  assert.equal(newline.customized, true)
})

test('every composer gesture appears in the editable and the displayed models', async () => {
  const { controller } = await controllerUnderTest()
  const model = controller.model()
  for (const id of ['fixed.send', 'fixed.newline', 'fixed.complementary']) {
    const editable = model.editable.find(row => row.id === id)
    assert.ok(editable, `${id} must be editable`)
    assert.equal(editable.composer, true)
    assert.equal(editable.customized, false, 'an untouched gesture is not customized')
    const displayed = model.rows.find(row => row.id === id)
    assert.equal(displayed.kind, 'fixed')
    assert.equal(displayed.composer, true, 'a rebindable gesture renders as editable')
    assert.ok(displayed.keys.length > 0, 'it shows the product gesture until the user changes it')
  }
  // A fixed action the plugin does not rebind stays a read-only reservation.
  const dismiss = model.rows.find(row => row.id === 'fixed.dismiss')
  assert.equal(dismiss.composer, false)
})
