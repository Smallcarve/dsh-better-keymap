/**
 * Behavior checks for the composer's key translation.
 *
 * The layer is pure DOM: it listens at the document capture phase, withdraws a
 * gesture whose key the user rebound, and dispatches the gesture the composer
 * knows. These checks drive it with real `KeyboardEvent`s in a real document
 * and assert exactly what the composer would see.
 */
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from './harness.mjs'
import { installComposerRemap, isComposerCommand } from '../src/client/compositor.ts'
import { COMPOSER_COMMANDS, COMPOSER_GESTURES } from '../src/client/gestures.ts'
import { normalizeBinding } from '../src/client/bindings.ts'

/**
 * Install the layer over a fresh document containing one composer input.
 * @param platform - receiving device.
 * @returns the layer, the composer element, and the events it observed.
 */
function harness(platform = 'windows') {
  const dom = new JSDOM('<!doctype html><html><body><div data-composer-input contenteditable="true"></div></body></html>')
  globalThis.document = dom.window.document
  globalThis.window = dom.window
  const composer = dom.window.document.querySelector('[data-composer-input]')
  /** Every event the composer surface actually received. */
  const seen = []
  composer.addEventListener('keydown', (event) => {
    seen.push({
      key: event.key,
      code: event.code,
      control: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      trusted: event.isTrusted,
    })
  })
  const layer = installComposerRemap(platform)
  return { dom, composer, seen, layer }
}

/**
 * Press a physical combination on one element.
 * @param dom - the harness document.
 * @param element - the event target.
 * @param code - physical key code.
 * @param key - the DOM key value.
 * @param modifiers - held modifiers.
 * @returns whether the dispatched event's default was prevented.
 */
function press(dom, element, code, key, modifiers = {}) {
  const event = new dom.window.KeyboardEvent('keydown', {
    code, key, bubbles: true, cancelable: true, ...modifiers,
  })
  element.dispatchEvent(event)
  return event.defaultPrevented
}

test('the composer command ids are the three gesture ids and nothing else', () => {
  assert.equal(isComposerCommand('fixed.send'), true)
  assert.equal(isComposerCommand('fixed.newline'), true)
  assert.equal(isComposerCommand('fixed.complementary'), true)
  assert.equal(isComposerCommand('fixed.slash'), false)
  assert.equal(isComposerCommand('session.new'), false)
})

test('the translation layer and the reference agree on what each action performs', () => {
  // Two modules state this fact: `compositor.ts` reads it to synthesize the
  // substituted event, and `catalog.ts` states it for the reference. If they
  // drifted, the reference would show one gesture while the composer received
  // another, and no single-module test could see it. This is that cross-check.
  const held = { control: 'control', alt: 'alt', shift: 'shift', meta: 'meta' }
  for (const id of COMPOSER_COMMANDS) {
    for (const platform of ['windows', 'macos']) {
      const declared = normalizeBinding(COMPOSER_GESTURES[id].performs, platform)
      const view = harness(platform)
      // A key nothing else uses, so the substituted event is unambiguous.
      view.layer.update({ [id]: { code: 'KeyJ', modifiers: [] } })
      press(view.dom, view.composer, 'KeyJ', 'j')
      const delivered = view.seen.find(event => !event.trusted)
      assert.ok(delivered, `${id} on ${platform} must deliver a substituted gesture`)
      // Everything the composer reads off the event: the gesture's `key` and the
      // modifiers the action performs. The physical `code` stays the user's key.
      assert.equal(delivered.key, 'Enter', `${id} on ${platform} delivers the Enter gesture`)
      assert.equal(delivered.code, 'KeyJ', `${id} on ${platform} keeps the user's physical key`)
      for (const [modifier, flag] of Object.entries(held)) {
        assert.equal(delivered[flag], declared.modifiers.includes(modifier),
          `${id} on ${platform} ${modifier} must be ${declared.modifiers.includes(modifier)}`)
      }
    }
  }
})

test('an untouched install leaves every default gesture exactly as the product has it', () => {
  const view = harness()
  press(view.dom, view.composer, 'Enter', 'Enter')
  press(view.dom, view.composer, 'Enter', 'Enter', { shiftKey: true })
  press(view.dom, view.composer, 'Enter', 'Enter', { ctrlKey: true })
  // Three physical presses, three delivered events, nothing synthesized.
  assert.deepEqual(view.seen.map(entry => [entry.key, entry.shift, entry.control]), [
    ['Enter', false, false],
    ['Enter', true, false],
    ['Enter', false, true],
  ])
  view.layer.dispose()
})

test('rebinding 发送消息 delivers the send gesture and withdraws the chosen key', () => {
  const view = harness()
  view.layer.update({ 'fixed.send': { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  const prevented = press(view.dom, view.composer, 'KeyJ', 'j', { ctrlKey: true, altKey: true })
  assert.equal(prevented, true, 'the user’s own key must not reach any other listener')
  assert.deepEqual(view.seen, [{
    key: 'Enter', code: 'KeyJ', control: false, alt: false, shift: false, meta: false, trusted: false,
  }])
  view.layer.dispose()
})

test('rebinding 换行 delivers the line-break gesture', () => {
  const view = harness()
  view.layer.update({ 'fixed.newline': { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  press(view.dom, view.composer, 'KeyJ', 'j', { ctrlKey: true, altKey: true })
  assert.deepEqual(view.seen, [{
    key: 'Enter', code: 'KeyJ', control: false, alt: false, shift: true, meta: false, trusted: false,
  }])
  view.layer.dispose()
})

test('rebinding 使用互补的 Queue／Steer 方式 delivers the accelerated gesture per device', () => {
  const windows = harness('windows')
  windows.layer.update({ 'fixed.complementary': { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  press(windows.dom, windows.composer, 'KeyJ', 'j', { ctrlKey: true, altKey: true })
  assert.equal(windows.seen[0].control, true, 'Windows accelerates with Control')
  assert.equal(windows.seen[0].meta, false)
  windows.layer.dispose()

  const mac = harness('macos')
  mac.layer.update({ 'fixed.complementary': { code: 'KeyJ', modifiers: ['primary', 'alt'] } })
  press(mac.dom, mac.composer, 'KeyJ', 'j', { metaKey: true, altKey: true })
  assert.equal(mac.seen[0].meta, true, 'macOS accelerates with Command')
  assert.equal(mac.seen[0].control, false)
  mac.layer.dispose()
})

test('a cleared gesture swallows its default key and delivers nothing', () => {
  const view = harness()
  view.layer.update({ 'fixed.send': { code: 'KeyJ', modifiers: ['primary', 'alt'] }, 'fixed.newline': null })
  // Shift+Enter is now unbound: withdrawn, and no substitute is dispatched.
  const prevented = press(view.dom, view.composer, 'Enter', 'Enter', { shiftKey: true })
  assert.equal(prevented, true)
  assert.deepEqual(view.seen, [], 'a cleared gesture must trigger nothing at all')
  view.layer.dispose()
})

test('a key the profile gave to a command passes through the input box', () => {
  // The reported failure: 新会话 set to Ctrl+Enter. Taking the combination clears
  // the accelerated action, but the command still has to fire *while the caret
  // is in the input box* — so the layer must stop swallowing the key there. Its
  // own record cannot know that a product command took the key, which is what
  // the residue argument carries.
  const view = harness()
  view.layer.update({ 'fixed.complementary': null }, [{ code: 'Enter', modifiers: ['control'] }])
  const prevented = press(view.dom, view.composer, 'Enter', 'Enter', { ctrlKey: true })
  assert.equal(prevented, false, 'the command’s combination must reach the product dispatcher')
  assert.deepEqual(view.seen, [{ key: 'Enter', code: 'Enter', control: true, alt: false, shift: false, meta: false, trusted: false }],
    'and the layer must not substitute anything for it')
  // Without the residue the key stays swallowed: the layer alone cannot tell a
  // cleared action from one whose key a command took.
  const blind = harness()
  blind.layer.update({ 'fixed.complementary': null })
  assert.equal(press(blind.dom, blind.composer, 'Enter', 'Enter', { ctrlKey: true }), true)
  assert.deepEqual(blind.seen, [])
  view.layer.dispose()
  blind.layer.dispose()
})

test('clearing 发送消息 stops plain Enter inside the input box', () => {
  const view = harness()
  view.layer.update({ 'fixed.send': null })
  const prevented = press(view.dom, view.composer, 'Enter', 'Enter')
  assert.equal(prevented, true)
  assert.deepEqual(view.seen, [])
  view.layer.dispose()
})

test('the user’s example: 发送消息 on Shift+Enter, 换行 cleared', () => {
  const view = harness()
  view.layer.update({ 'fixed.send': { code: 'Enter', modifiers: ['shift'] }, 'fixed.newline': null })
  // Shift+Enter sends: a bare Enter gesture reaches the composer.
  press(view.dom, view.composer, 'Enter', 'Enter', { shiftKey: true })
  assert.deepEqual(view.seen, [{
    key: 'Enter', code: 'Enter', control: false, alt: false, shift: false, meta: false, trusted: false,
  }])
  // Plain Enter does nothing: withdrawn, nothing substituted.
  view.seen.length = 0
  press(view.dom, view.composer, 'Enter', 'Enter')
  assert.deepEqual(view.seen, [])
  view.layer.dispose()
})

test('the user’s example: 发送消息 cleared, 换行 on Shift+Enter', () => {
  const view = harness()
  view.layer.update({ 'fixed.send': null })
  // Shift+Enter still breaks the line: it is the product's own gesture and was
  // never rebound, so it reaches the composer untouched.
  const prevented = press(view.dom, view.composer, 'Enter', 'Enter', { shiftKey: true })
  assert.equal(prevented, false)
  assert.deepEqual(view.seen, [{
    key: 'Enter', code: 'Enter', control: false, alt: false, shift: true, meta: false, trusted: false,
  }])
  // Plain Enter does nothing.
  view.seen.length = 0
  press(view.dom, view.composer, 'Enter', 'Enter')
  assert.deepEqual(view.seen, [])
  view.layer.dispose()
})

test('events outside the composer keep their normal behavior', () => {
  const view = harness()
  view.layer.update({ 'fixed.send': null })
  const outside = view.dom.window.document.createElement('input')
  view.dom.window.document.body.appendChild(outside)
  const prevented = press(view.dom, outside, 'Enter', 'Enter')
  assert.equal(prevented, false, 'a cleared gesture only swallows its key inside the input box')
  view.layer.dispose()
})

test('dispose releases the listener and forgets every mapping', () => {
  const view = harness()
  view.layer.update({ 'fixed.send': null })
  view.layer.dispose()
  const prevented = press(view.dom, view.composer, 'Enter', 'Enter')
  assert.equal(prevented, false)
  assert.equal(view.seen.length, 1)
})
