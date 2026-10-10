/**
 * Loader-contract smoke test.
 *
 * Materializes the built `lib/client.js` exactly the way the browser module
 * table does — execute the script, capture the registered factory, call it with
 * a `require` — and then runs the plugin's `apply` against a recording context.
 * This is what catches an artifact that builds but cannot register: a request
 * the module table cannot answer, a handoff the loader rejects, or a
 * registration whose shape drifted from the product's slot contract.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, checkCount } from './harness.mjs'
import { installStubs } from './stubs.mjs'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * The published documents that quote this suite's check count.
 *
 * Both languages of each document are listed, because npm, GitHub and Gitee all
 * render one of them and a figure that is right in one language only is still a
 * wrong claim in the shipped release.
 */
const DOCS = [
  'README.md',
  'README.zh-CN.md',
  'RELEASE_NOTES.md',
  'RELEASE_NOTES.zh-CN.md',
]

/**
 * Materialize the built bundle and run `apply` against a recording context.
 * @returns the registrations the plugin made and the context it received.
 */
function loadPlugin() {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-keymap-'))
  try {
    const pluginRequire = createRequire(join(ROOT, 'package.json'))
    installStubs(scratch,
      pluginRequire.resolve('react'),
      pluginRequire.resolve('react/jsx-runtime'))
    const require = createRequire(join(scratch, 'entry.cjs'))

    let registration
    const window = {
      __ModuleLoader__: { load: (value) => { registration = value } },
      localStorage: memoryStorage(),
    }
    // The bundle registers its factory at script execution; every module body
    // side effect waits for materialization, exactly as in the browser.
    const script = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
    const run = new Function('window', script)
    run(window)
    assert.ok(registration, 'the bundle registered no module-loader factory')
    assert.equal(registration.id, 'dsh-better-keymap')
    const exports = registration.factory(require)
    assert.equal(typeof exports.apply, 'function', 'the client half must export apply')

    const calls = { commands: [], slots: [], effects: [], injections: [] }
    const instance = { actions: { open: () => { calls.opened = (calls.opened ?? 0) + 1 } } }
    const ctx = {
      shortcuts: {
        runtime: 'desktop',
        platform: 'windows',
        catalog: { getSnapshot: () => [], subscribe: () => () => {} },
        fixedCatalog: { getSnapshot: () => [] },
        config: { getSnapshot: () => ({ revision: 'r1', status: 'ready' }) },
        describeBinding: (binding) => ({ binding: null, keys: [], issue: null }),
        edit: async () => ({ status: 'saved' }),
        recording: async () => {},
        register: (command) => { calls.commands.push(command); return () => {} },
      },
      locale: {
        register: (namespace, dictionary) => { calls.locale = { namespace, dictionary }; return () => {} },
        bind: (namespace) => {
          calls.bound = namespace
          return (key, params) => `${namespace}:${key}${params === undefined ? '' : JSON.stringify(params)}`
        },
        subscribe: () => () => {},
      },
      slots: {
        inject: (name, factory) => {
          calls.injections.push({ name, factory })
          // The real service runs the factory once the slot is declared. A
          // factory that returns a generator installs several contributions
          // atomically, so iterate it the way the service does — otherwise the
          // overlay registration would stay invisible to these assertions.
          try {
            const result = factory()
            if (result !== null && typeof result === 'object' && typeof result[Symbol.iterator] === 'function') {
              calls.installed = [...(calls.installed ?? []), ...result]
            }
          } catch (error) {
            calls.injectionErrors = [...(calls.injectionErrors ?? []), { name, error: String(error) }]
          }
          return () => {}
        },
        register: (options, component) => { calls.slots.push({ options, component }); return () => {} },
        entries: () => [],
        subscribe: () => () => {},
      },
      effect: (callback, label) => { calls.effects.push({ label, disposer: callback() }); return () => {} },
    }
    exports.apply(ctx)
    return { calls, exports, instance, window }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** A minimal Storage implementation for the bundle's document port. */
function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
  }
}

test('the built bundle registers one factory and exports apply', () => {
  const { calls, exports } = loadPlugin()
  assert.deepEqual(calls.injectionErrors ?? [], [], 'a slot injection threw during apply')
  assert.equal(typeof exports.apply, 'function')
  assert.equal(calls.effects.length > 0, true)
})

test('apply claims both product slots with the shipped identities', () => {
  const { calls } = loadPlugin()
  assert.deepEqual(calls.injections.map(entry => entry.name).sort(), ['settings.general.item', 'shell.overlay'])
  const settings = calls.slots.find(entry => entry.options.name === 'settings.general.item')
  const overlay = calls.slots.find(entry => entry.options.name === 'shell.overlay')
  assert.ok(settings, 'the settings row must be registered')
  assert.ok(overlay, 'the reference overlay must be registered')
  assert.equal(settings.options.id, 'shortcuts')
  assert.equal(settings.options.order, 16)
  assert.equal(settings.options.locale, 'keymap')
  // The overlay shadows the product's own entry, which registers at priority 0.
  assert.equal(overlay.options.id, 'shortcuts')
  assert.equal(overlay.options.priority, -1)
  assert.equal(typeof settings.component, 'function')
  assert.equal(typeof overlay.component, 'function')
})

test('apply re-registers the product command that opens the reference', () => {
  const { calls } = loadPlugin()
  const open = calls.commands.find(command => command.id === 'shortcuts.open')
  assert.ok(open, 'the plugin must own shortcuts.open so the reference follows its keymap')
  assert.deepEqual(open.defaults['desktop:windows'], { code: 'Slash', modifiers: ['primary'] })
  assert.deepEqual(open.regions, ['page', 'editable', 'terminal'])
  assert.deepEqual(open.modals, ['settings', 'shortcuts'])
  assert.equal(open.resolve({ modal: null, region: 'page', target: null }).status, 'handled')
  assert.equal(open.resolve({ modal: 'other', region: 'page', target: null }).status, 'blocked')
})

test('the injected face exposes live state and the arbitration methods', () => {
  const { calls } = loadPlugin()
  const overlay = calls.slots.find(entry => entry.options.name === 'shell.overlay')
  const face = overlay.options.inject()
  assert.equal(typeof face.controller.apply, 'function')
  assert.equal(typeof face.controller.describeBinding, 'function')
  assert.equal(typeof face.controller.recording, 'function')
  assert.equal(face.desktop, true)
  const snapshot = face.hooks.snapshot.getSnapshot()
  // `start()` reads storage asynchronously, so the first snapshot may still be
  // the loading one; either is a valid initial state for a fresh document.
  assert.equal(['loading', 'ready'].includes(snapshot.status), true)
  assert.deepEqual(snapshot.model.rows, [])
  assert.equal(snapshot.customized, 0)
})

test('the dictionary registered for the keymap namespace is complete', () => {
  const { calls } = loadPlugin()
  assert.equal(calls.locale.namespace, 'keymap')
  const zh = calls.locale.dictionary.zh
  const en = calls.locale.dictionary.en
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const key of ['cleared', 'reserved-conflict', 'conflict', 'title', 'unbound', 'application']) {
    assert.equal(typeof zh[key], 'string', `missing zh copy for ${key}`)
  }
  assert.match(zh.cleared, /\{commands\}/u)
})

test('the check count the published docs quote is the real one', () => {
  // Every published document states the number of checks in this suite, and the
  // figure drifts silently whenever a check is added or removed — exactly the
  // kind of stale claim a release should not ship.
  //
  // Every file registers its checks before any of them runs, so the registry
  // already holds this check too — no `+ 1`.
  const expected = checkCount()
  for (const doc of DOCS) {
    let text
    try {
      text = readFileSync(join(ROOT, doc), 'utf8')
    } catch (error) {
      // A renamed or deleted document used to surface as a bare ENOENT from
      // deep inside the run, which says nothing about what to fix.
      throw new Error(`${doc} is missing (${error.code}); update this list when a document is renamed`)
    }
    // "114 checks", "114 项", "114 automated checks" — the number and its noun
    // may be separated by a word or two, but never by a sentence boundary.
    const stated = [...text.matchAll(/(\d+)[^\d\n]{0,24}?(?:项|checks)/gu)].map(match => Number(match[1]))
    assert.ok(stated.length > 0, `${doc} states no check count`)
    for (const value of stated) {
      assert.equal(value, expected, `${doc} says ${value} checks, the suite registers ${expected}`)
    }
  }
})
