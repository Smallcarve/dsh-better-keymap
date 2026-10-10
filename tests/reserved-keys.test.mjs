/**
 * The single-key rule.
 *
 * `Enter`, `Esc`, `/`, `@` and the two menu arrows belong to fixed input
 * gestures, so no editable shortcut may take one of them bare. The three
 * composer gestures are the single exception for `Enter`, because that is the
 * product's own send key and the gesture lives in the same input box.
 */
import assert from 'node:assert/strict'
import { test } from './harness.mjs'
import { KeymapController } from '../src/client/controller.ts'
import { memoryKeymapStorage } from '../src/client/document.ts'
import { bindingIssue, normalizeBinding, presentBinding } from '../src/client/bindings.ts'

const PLATFORM = 'windows'
const COMPOSER = ['fixed.send', 'fixed.newline', 'fixed.complementary']
/** The five single keys that stay out of reach everywhere. */
const BLOCKED = [
  ['Escape', 'Esc'],
  ['Slash', '/'],
  ['Digit2', '@'],
  ['ArrowUp', '↑'],
  ['ArrowDown', '↓'],
]
const bare = (code) => ({ code, modifiers: [] })

/**
 * Build a controller over a fresh product stub.
 * @param options - `withInputMenus` includes the two bare-key composer menus,
 * which genuinely reserve `/` and `@` window-wide.
 * @returns the controller under test.
 */
async function controllerUnderTest({ withInputMenus = true } = {}) {
  const fixed = (id, label, modifiers, group = 'input') => ({
    id,
    label,
    keys: presentBinding(normalizeBinding({ code: 'Enter', modifiers }, PLATFORM), PLATFORM).keys,
    bindings: [normalizeBinding({ code: 'Enter', modifiers }, PLATFORM)],
    group,
  })
  const rows = ['session.new', 'session.search'].map((id, index) => ({
    id,
    label: index === 0 ? '新会话' : '搜索会话',
    aliases: [],
    keys: [],
    aria: undefined,
    binding: normalizeBinding(index === 0 ? { code: 'KeyN', modifiers: ['primary'] } : { code: 'KeyK', modifiers: ['primary'] }, PLATFORM),
    modified: false,
    conflicts: [],
    issue: null,
  }))
  const fixedRows = [
    fixed('fixed.send', '发送消息', []),
    fixed('fixed.newline', '换行', ['shift']),
    fixed('fixed.complementary', '使用互补的 Queue／Steer 方式', ['control']),
    ...(withInputMenus
      ? [fixed('fixed.slash', '打开命令菜单', [], 'input'), fixed('fixed.mention', '打开引用菜单', [], 'input')]
      : []),
    fixed('fixed.select', '选择菜单项', [], 'menus'),
    fixed('approval.allow', '允许一次', [], 'approval'),
  ]
  const product = {
    runtime: 'desktop',
    platform: PLATFORM,
    catalog: { getSnapshot: () => rows },
    fixedCatalog: { getSnapshot: () => fixedRows },
    config: { getSnapshot: () => ({ revision: 'r1', status: 'ready' }) },
    describeBinding(binding) {
      if (binding === null) return { binding: null, keys: [], issue: null }
      const value = normalizeBinding(binding, PLATFORM)
      return {
        binding: value,
        keys: presentBinding(value, PLATFORM).keys,
        issue: bindingIssue(value, 'desktop', PLATFORM),
      }
    },
    async edit() { return { status: 'saved' } },
    async recording() {},
  }
  const controller = new KeymapController(product, memoryKeymapStorage())
  await controller.start()
  return controller
}

for (const [code, keycap] of BLOCKED) {
  test(`every editable command refuses bare ${keycap}`, async () => {
    const controller = await controllerUnderTest()
    for (const id of ['session.new', 'session.search']) {
      const result = await controller.apply({ type: 'set', id, binding: bare(code) })
      assert.equal(result.status, 'conflict', `${id} must refuse bare ${keycap}`)
      assert.equal(result.issue, 'reserved-key', `${id} must name the single-key rule`)
      assert.deepEqual(result.displaced, [], 'a refused edit changes nothing')
    }
  })

  test(`every composer gesture refuses bare ${keycap}`, async () => {
    const controller = await controllerUnderTest()
    for (const id of COMPOSER) {
      const result = await controller.apply({ type: 'set', id, binding: bare(code) })
      assert.equal(result.status, 'conflict', `${id} must refuse bare ${keycap}`)
      assert.equal(result.issue, 'reserved-key')
    }
  })

  test(`a modifier combination of ${keycap} stays available where the browser allows it`, async () => {
    const controller = await controllerUnderTest()
    // Esc and the arrows are reserved product-wide, so only `/`, `@` and the
    // composer keys have a modulation worth checking here.
    if (code === 'Escape' || code === 'ArrowUp' || code === 'ArrowDown') return
    const result = await controller.apply({
      type: 'set', id: 'session.new', binding: { code, modifiers: ['primary', 'alt'] },
    })
    assert.equal(result.status, 'saved', `Ctrl+Alt+${keycap} must be accepted`)
    const row = controller.model().editable.find(entry => entry.id === 'session.new')
    assert.equal(row.customized, true)
  })
}

test('bare Enter is the one key the composer gestures may take', async () => {
  const controller = await controllerUnderTest({ withInputMenus: false })
  for (const id of COMPOSER) {
    const result = await controller.apply({ type: 'set', id, binding: bare('Enter') })
    assert.equal(result.status, 'saved', `${id} may take bare Enter`)
  }
})

test('bare Enter is refused for every other editable command', async () => {
  const controller = await controllerUnderTest()
  for (const id of ['session.new', 'session.search']) {
    const result = await controller.apply({ type: 'set', id, binding: bare('Enter') })
    assert.equal(result.status, 'conflict', `${id} must refuse bare Enter`)
    assert.equal(result.issue, 'reserved-key')
  }
})

test('the single-key rule is checked before the product’s own classification', async () => {
  const controller = await controllerUnderTest()
  // Bare Enter is also "modifier-required" to the product, and bare Esc is
  // "reserved" to it. The plugin's own rule must win so one message explains
  // every one of these keys the same way.
  const enter = await controller.apply({ type: 'set', id: 'session.new', binding: bare('Enter') })
  assert.equal(enter.issue, 'reserved-key')
  const escape = await controller.apply({ type: 'set', id: 'session.new', binding: bare('Escape') })
  assert.equal(escape.issue, 'reserved-key')
})

test('modulations of Enter remain free for every editable command', async () => {
  const controller = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: 'session.new', binding: { code: 'Enter', modifiers: ['alt'] } })
  assert.equal(result.status, 'saved')
  const row = controller.model().editable.find(entry => entry.id === 'session.new')
  assert.deepEqual(row.keys, ['Alt', '+', 'Enter'])
})

test('a refused single key never reaches the document', async () => {
  const controller = await controllerUnderTest()
  await controller.apply({ type: 'set', id: 'session.new', binding: bare('Slash') })
  const row = controller.model().editable.find(entry => entry.id === 'session.new')
  assert.equal(row.customized, false, 'nothing was recorded')
  assert.deepEqual(row.keys, ['Ctrl', '+', 'N'], 'the default is still in force')
})

test('the live recorder preview answers the single-key rule the same way', async () => {
  const controller = await controllerUnderTest()
  const command = controller.describeBinding(bare('Enter'), 'session.new')
  assert.equal(command.issue, 'reserved-key', 'a command is told before releasing the keys')
  const gesture = controller.describeBinding(bare('Enter'), 'fixed.newline')
  assert.equal(gesture.issue, null, 'the composer gesture may take bare Enter')
  const gestureEscape = controller.describeBinding(bare('Escape'), 'fixed.newline')
  assert.equal(gestureEscape.issue, 'reserved-key', 'but not the other singles')
})
