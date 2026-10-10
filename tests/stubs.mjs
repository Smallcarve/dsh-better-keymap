// Development helper: stub the module-table rows the bundle requests, so the
// built artifact can be materialized outside a browser. Not part of the
// published package.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Create stub packages for the shell-owned modules the bundle requires.
 * @param root - directory that will hold a `node_modules` tree.
 * @param reactPath - absolute path of the real React CommonJS build.
 * @param jsxPath - absolute path of the real React JSX runtime.
 */
export function installStubs(root, reactPath, jsxPath) {
  const write = (name, body) => {
    const dir = join(root, 'node_modules', ...name.split('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js', type: 'commonjs' }))
    writeFileSync(join(dir, 'index.js'), body)
  }
  write('react', `module.exports = require(${JSON.stringify(reactPath)})`)
  write('react/jsx-runtime', `module.exports = require(${JSON.stringify(jsxPath)})`)
  write('react-dom', 'module.exports = {}')
  write('@deepseek-ai/dsh-client-store', STORE_STUB)
  write('@deepseek-ai/dsh-client-ui-primitives', PRIMITIVES_STUB)
  write('@deepseek-ai/dsh-client-ui-slots', SLOTS_STUB)
  write('@deepseek-ai/dsh-client-ui-dockkit', 'module.exports = {}')
  write('@deepseek-ai/cordis', 'module.exports = {}')
}

/**
 * The store engine the plugin declares its overlay store with. This stub keeps
 * the real contract: a handle with a `create()` returning `{ getSnapshot,
 * subscribe, actions }`, and actions that mutate a draft.
 */
const STORE_STUB = `
function createSnapshotStore(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    set: (next) => { value = next; for (const l of [...listeners]) l() },
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
  }
}
function defineStore(decl) {
  return {
    spec: decl,
    create() {
      const store = createSnapshotStore(decl.init())
      const actions = {}
      for (const key of Object.keys(decl.actions)) {
        actions[key] = (...params) => {
          const draft = { ...store.getSnapshot() }
          decl.actions[key](draft, ...params)
          store.set(draft)
        }
      }
      return { store, actions }
    },
  }
}
module.exports = { createSnapshotStore, defineStore }
`

/** The primitives the reference renders with; each is a marker element. */
const PRIMITIVES_STUB = `
const React = require('react')
const marker = (name) => function Stub(props) { return React.createElement(name, null, props.children ?? null) }
module.exports = {
  Button: marker('button'),
  Modal: function Modal(props) { return props.open ? React.createElement('div', { role: 'dialog' }, props.children ?? null) : null },
  // The toast renders its own text, so a check can read what the user reads.
  Toast: function Toast(props) { return React.createElement('toast', null, props.text ?? null) },
  Tooltip: function Tooltip(props) { return React.createElement('span', null, props.children ?? null) },
  ShortcutKeys: function ShortcutKeys(props) { return React.createElement('kbd', null, (props.keys ?? []).join('')) },
  IconCloseOutlineRegular: marker('icon-close'),
  IconRefreshOutlineRegular: marker('icon-refresh'),
  closeTopModal: () => {},
  focusWithoutRing: () => {},
  isBehindModal: () => false,
  observeComposition: () => ({ guards: () => false, dispose: () => {} }),
  rankByName: (entries) => entries,
}
`

/** The slot service: the registration surface the plugin composes against. */
const SLOTS_STUB = `
const registered = []
module.exports = {
  registered,
  resolveSlotLabel: (label) => typeof label === 'function' ? label() : label,
}
`
