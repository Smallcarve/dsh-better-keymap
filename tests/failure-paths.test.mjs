/**
 * Failure-path checks.
 *
 * Every check here targets a defect the success path hid: a commit that throws,
 * a release that lands without the assignment that followed it, a preference
 * that never reached storage, and an override that is present but empty. The
 * suite covered the happy path thoroughly and none of these, which is why they
 * survived.
 */
import assert from 'node:assert/strict'
import { test } from './harness.mjs'
import { KeymapController } from '../src/client/controller.ts'
import { memoryKeymapStorage } from '../src/client/document.ts'
import { composerOverrides } from '../src/client/gestures.ts'
import { buildCatalog } from '../src/client/catalog.ts'
import { bindingIssue, normalizeBinding, presentBinding } from '../src/client/bindings.ts'

const PLATFORM = 'windows'
/** The combination both command rows below hold, so either can displace the other. */
const SHARED = { code: 'KeyN', modifiers: ['primary', 'alt'] }

/**
 * A controller over a product stub whose chosen write can fail.
 * @param options - `failWhen` selects the write that must fail, by operation;
 * `rows` names the product commands the stub exposes.
 * @returns the controller, its write log, and the stub's live product rows.
 */
async function controllerUnderTest({ failWhen, storage, rows = ['session.new', 'session.search'] } = {}) {
  const normalized = (code, modifiers) => normalizeBinding({ code, modifiers }, PLATFORM)
  const productRows = rows.map(id => {
    const binding = normalized(SHARED.code, SHARED.modifiers)
    return {
      id, label: id, aliases: [], keys: presentBinding(binding, PLATFORM).keys,
      aria: presentBinding(binding, PLATFORM).aria, binding,
    }
  })
  const fixed = (id, label, modifiers) => ({
    id, label,
    keys: presentBinding(normalized('Enter', modifiers), PLATFORM).keys,
    bindings: [normalized('Enter', modifiers)],
    group: 'input',
  })
  const fixedRows = [
    fixed('fixed.send', '发送消息', []),
    fixed('fixed.newline', '换行', ['shift']),
    fixed('fixed.complementary', '使用互补的 Queue／Steer 方式', ['control']),
  ]
  const writes = []
  const product = {
    runtime: 'desktop',
    platform: PLATFORM,
    catalog: { getSnapshot: () => productRows },
    fixedCatalog: { getSnapshot: () => fixedRows },
    config: { getSnapshot: () => ({ revision: `r${writes.length}`, status: 'ready' }) },
    describeBinding(binding) {
      if (binding === null) return { binding: null, keys: [], issue: null }
      const value = normalized(binding.code, binding.modifiers)
      return { binding: value, keys: presentBinding(value, PLATFORM).keys, issue: bindingIssue(value, 'desktop', PLATFORM) }
    },
    async edit(edit) {
      writes.push(edit)
      // Matched by operation rather than by position: an earlier operation in the
      // same test would otherwise shift the index and silently move the failure.
      if (failWhen !== undefined && failWhen(edit)) return { status: 'write-failed' }
      const target = productRows.find(entry => entry.id === edit.id)
      if (target !== undefined) {
        target.binding = edit.type === 'set' ? edit.binding : null
        const present = presentBinding(target.binding, PLATFORM)
        target.keys = present.keys
        target.aria = present.aria
      }
      // The real product answers with the catalog it published alongside the write.
      return { status: 'saved', snapshot: { catalog: productRows.map(entry => ({ ...entry })) } }
    },
    async recording() {},
  }
  const controller = new KeymapController(product, storage ?? memoryKeymapStorage())
  await controller.start()
  return { controller, writes, productRows, product }
}

/** One row of the live plugin model. */
function row(controller, id) {
  const found = controller.model().editable.find(entry => entry.id === id)
  assert.ok(found, `${id} must be an editable row`)
  return found
}

/** The binding the stub currently holds for one command. */
function hostBinding(productRows, id) {
  return productRows.find(row => row.id === id).binding
}

test('a release that succeeds is reported, and the document follows it', async () => {
  // The control case for the two compensation checks below: with no failure the
  // holder really is released and the document really does change.
  const { controller, writes, productRows } = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: 'session.search', binding: SHARED })
  assert.equal(result.status, 'saved')
  assert.deepEqual(writes.map(write => [write.id, write.binding === null ? 'clear' : 'set']),
    [['session.new', 'clear'], ['session.search', 'set']])
  assert.equal(hostBinding(productRows, 'session.new'), null)
  assert.equal(row(controller, 'session.new').binding, null)
})

test('a release that fails part-way is undone, so the product keeps every binding', async () => {
  // Two holders, and the product refuses the second release. Without
  // compensation the first holder is left cleared while the document still
  // records it — a binding the user sees that the window no longer has.
  const { controller, writes, productRows } = await controllerUnderTest({
    failWhen: edit => edit.id === 'session.search' && edit.binding === null,
  })
  const before = controller.getSnapshot().document
  const result = await controller.apply({ type: 'set', id: 'fixed.newline', binding: SHARED })
  assert.equal(result.status, 'write-failed', 'the failure is reported')
  assert.deepEqual(controller.getSnapshot().document, before, 'the document was not touched')
  assert.deepEqual(hostBinding(productRows, 'session.new'), normalizeBinding(SHARED, PLATFORM),
    'the holder released before the failure was restored')
  assert.deepEqual(hostBinding(productRows, 'session.search'), normalizeBinding(SHARED, PLATFORM),
    'and the holder the product refused was never released')
  assert.deepEqual(writes.map(write => [write.id, write.binding === null ? 'clear' : 'set']),
    [['session.new', 'clear'], ['session.search', 'clear'], ['session.new', 'set']],
    'the last write put the released holder back with its own binding')
})

test('an assignment that fails after its release restores every holder', async () => {
  // The releases land, the assignment does not. `reconcile` would otherwise
  // write the document's stale binding back over whatever the product holds. The
  // target is a product command, because a composer gesture never writes its own
  // id to the product — only the rows it displaces are written.
  const { controller, productRows, writes } = await controllerUnderTest({
    rows: ['session.new', 'session.search', 'session.rename'],
    failWhen: edit => edit.id === 'session.new',
  })
  const before = controller.getSnapshot().document
  const result = await controller.apply({ type: 'set', id: 'session.new', binding: SHARED })
  assert.equal(result.status, 'write-failed')
  assert.deepEqual(controller.getSnapshot().document, before, 'the document was not touched')
  for (const id of ['session.search', 'session.rename']) {
    assert.deepEqual(hostBinding(productRows, id), normalizeBinding(SHARED, PLATFORM), `${id} keeps its binding`)
  }
  assert.deepEqual(writes.map(write => [write.id, write.binding === null ? 'clear' : 'set']), [
    ['session.search', 'clear'],
    ['session.rename', 'clear'],
    ['session.new', 'set'],
    ['session.search', 'set'],
    ['session.rename', 'set'],
  ], 'both releases were undone after the assignment failed')
})

test('a preference that never reached storage is not reported as saved', async () => {
  const failing = { read: () => null, write: () => { throw new Error('storage is full') } }
  const { controller, productRows } = await controllerUnderTest({ storage: failing })
  const result = await controller.apply({ type: 'set', id: 'session.new', binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  // The product took the change, but the choice will not survive a reload, so
  // saying "已修改" would promise something the plugin cannot keep.
  assert.equal(result.status, 'write-failed')
  assert.deepEqual(hostBinding(productRows, 'session.new'), normalizeBinding({ code: 'KeyJ', modifiers: ['primary', 'alt'] }, PLATFORM),
    'the mirror still took it, which is exactly why the user must be told')
})

test('a preference that was stored is still reported as saved', async () => {
  const { controller } = await controllerUnderTest()
  const result = await controller.apply({ type: 'set', id: 'session.new', binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  assert.equal(result.status, 'saved')
})

test('an override that is present but empty is treated as absent everywhere', () => {
  // `Object.hasOwn` is true for an entry whose value is undefined, and the rest
  // of the model already treats that as "no override". The composer resolver
  // used to dereference it instead, which threw while building the catalog.
  const overrides = { 'fixed.send': undefined, 'fixed.newline': null }
  assert.deepEqual(composerOverrides(overrides, PLATFORM), { 'fixed.newline': null })
  const catalog = buildCatalog([], [{
    id: 'fixed.send', label: '发送消息', keys: ['Enter'],
    bindings: [normalizeBinding({ code: 'Enter', modifiers: [] }, PLATFORM)], group: 'input',
  }], overrides, 'desktop', PLATFORM)
  const send = catalog.editable.find(entry => entry.id === 'fixed.send')
  assert.equal(send.customized, false, 'an empty override is not a customization')
  assert.deepEqual(send.keys, ['Enter'], 'and the action keeps the gesture it performs')
})

test('what the plugin stored is what a reload reads back', async () => {
  const storage = memoryKeymapStorage()
  const { controller, product } = await controllerUnderTest({ storage })
  const chosen = { code: 'KeyJ', modifiers: ['primary', 'alt'] }
  await controller.apply({ type: 'set', id: 'session.new', binding: chosen })
  const reloaded = new KeymapController(product, storage)
  await reloaded.start()
  assert.deepEqual(row(reloaded, 'session.new').keys, ['Ctrl', '+', 'Alt', '+', 'J'])
  assert.equal(row(reloaded, 'session.new').customized, true)
})
