/**
 * Behavior checks for the plugin's pure layers.
 *
 * These run the real source modules, not a copy: Node's type stripping loads
 * `src/client/*.ts` directly, so the assertions cover the arbitration the
 * browser half will perform.
 */
import assert from 'node:assert/strict'
import { test } from './harness.mjs'
import {
  bindingIssue, bindingKey, normalizeBinding, overlappingBindings, parseBinding, presentBinding,
} from '../src/client/bindings.ts'
import {
  emptyDocument, overrideCount, parseKeymapDocument, partitionOverrides, profileOverrides,
  serializeKeymapDocument, withOverride, withoutOverride, withProfile,
} from '../src/client/document.ts'
import { buildCatalog, displacedBindings, reservedByFixed } from '../src/client/catalog.ts'

/** Build a product catalog row with product-shaped defaults. */
function row(id, label, binding) {
  const normalized = binding === null ? null : normalizeBinding(binding, 'windows')
  return {
    id,
    label,
    aliases: [],
    keys: presentBinding(normalized, 'windows').keys,
    aria: presentBinding(normalized, 'windows').aria,
    binding: normalized,
    modified: false,
    conflicts: [],
    issue: null,
  }
}

test('normalizeBinding expands primary and canonicalizes order', () => {
  assert.deepEqual(normalizeBinding({ code: 'KeyB', modifiers: ['primary'] }, 'macos').modifiers, ['meta'])
  assert.deepEqual(normalizeBinding({ code: 'KeyB', modifiers: ['primary'] }, 'windows').modifiers, ['control'])
  assert.deepEqual(normalizeBinding({ code: 'KeyB', modifiers: ['meta', 'shift'] }, 'windows').modifiers, ['shift', 'meta'])
  assert.deepEqual(normalizeBinding({ code: 'KeyZ', secondCode: 'KeyA', modifiers: [] }, 'windows').code, 'KeyA')
})

test('normalizeBinding rejects unsupported codes and repeated keys', () => {
  assert.throws(() => normalizeBinding({ code: 'KeyFoo', modifiers: [] }, 'windows'))
  assert.throws(() => normalizeBinding({ code: 'KeyA', secondCode: 'KeyA', modifiers: [] }, 'windows'))
})

test('parseBinding accepts the document grammar and rejects unknown fields', () => {
  assert.deepEqual(parseBinding({ code: 'KeyN', modifiers: ['primary', 'alt'] }),
    { code: 'KeyN', modifiers: ['primary', 'alt'] })
  assert.equal(parseBinding(null), null)
  assert.throws(() => parseBinding({ code: 'KeyN', modifiers: ['primary'], extra: 1 }))
  assert.throws(() => parseBinding({ code: 'KeyN', modifiers: ['hyper'] }))
})

test('overlappingBindings matches a single key inside a same-modifier chord', () => {
  const single = normalizeBinding({ code: 'KeyB', modifiers: ['primary'] }, 'windows')
  const chord = normalizeBinding({ code: 'KeyB', secondCode: 'KeyV', modifiers: ['primary'] }, 'windows')
  const otherMods = normalizeBinding({ code: 'KeyB', secondCode: 'KeyV', modifiers: ['alt'] }, 'windows')
  assert.equal(overlappingBindings(single, chord), true)
  assert.equal(overlappingBindings(single, otherMods), false)
  assert.equal(overlappingBindings(single, normalizeBinding({ code: 'KeyN', modifiers: ['primary'] }, 'windows')), false)
})

test('presentBinding keeps the shipped keycap and aria spellings', () => {
  const mac = normalizeBinding({ code: 'Slash', modifiers: ['primary'] }, 'macos')
  assert.deepEqual(presentBinding(mac, 'macos').keys, ['⌘', '/'])
  assert.equal(presentBinding(mac, 'macos').aria, 'Meta+/')
  const win = normalizeBinding({ code: 'KeyB', modifiers: ['primary', 'shift'] }, 'windows')
  assert.deepEqual(presentBinding(win, 'windows').keys, ['Ctrl', '+', 'Shift', '+', 'B'])
  const chord = normalizeBinding({ code: 'KeyF', secondCode: 'KeyG', modifiers: [] }, 'windows')
  assert.equal(presentBinding(chord, 'windows').aria, undefined)
  assert.deepEqual(presentBinding(chord, 'windows').keys, ['F', 'G'])
  assert.deepEqual(presentBinding(null, 'windows'), { keys: [], aria: undefined })
})

test('bindingIssue reproduces the shipped reservations', () => {
  const reserved = (code, modifiers) => bindingIssue(normalizeBinding({ code, modifiers }, 'windows'), 'web', 'windows')
  assert.equal(reserved('KeyC', ['primary']), 'reserved')
  assert.equal(reserved('KeyA', ['primary']), 'reserved')
  assert.equal(reserved('KeyB', ['primary', 'shift']), null)
  assert.equal(reserved('KeyB', ['primary', 'alt']), null)
  // Three or four modifiers are admitted on Windows and macOS browsers.
  assert.equal(reserved('KeyB', ['primary', 'alt', 'shift']), null)
  // Meta on a non-macOS device is a system reservation, not a browser one.
  assert.equal(reserved('KeyB', ['meta']), 'reserved')
  // A bare reserved key is refused as needing a modifier first, which is the
  // order the product's own check applies.
  assert.equal(reserved('Escape', []), 'modifier-required')
  assert.equal(reserved('ArrowUp', []), 'modifier-required')
  // A two-key chord is admitted on desktop and refused in a browser.
  const chord = normalizeBinding({ code: 'KeyF', secondCode: 'KeyG', modifiers: ['primary'] }, 'windows')
  assert.equal(bindingIssue(chord, 'desktop', 'windows'), null)
  assert.equal(bindingIssue(chord, 'web', 'windows'), 'unsupported-key')
  assert.equal(bindingIssue(normalizeBinding({ code: 'KeyB', modifiers: [] }, 'windows'), 'web', 'windows'), 'modifier-required')
  // Desktop on Windows/macOS admits anything, including bare keys and chords.
  assert.equal(bindingIssue(normalizeBinding({ code: 'Escape', modifiers: [] }, 'windows'), 'desktop', 'windows'), null)
})

test('document round-trips overrides and keeps cleared bindings explicit', () => {
  let document = emptyDocument()
  assert.equal(overrideCount(document, 'desktop:windows'), 0)
  document = withOverride(document, 'desktop:windows', 'session.new', { code: 'KeyN', modifiers: ['primary', 'alt'] })
  document = withOverride(document, 'desktop:windows', 'session.fork', null)
  document = withOverride(document, 'web:windows', 'session.new', { code: 'KeyJ', modifiers: ['control', 'alt'] })
  assert.equal(overrideCount(document, 'desktop:windows'), 2)
  assert.equal(overrideCount(document, 'web:windows'), 1)
  const parsed = parseKeymapDocument(serializeKeymapDocument(document))
  assert.equal(parsed.status, 'ready')
  assert.deepEqual(profileOverrides(parsed.document, 'desktop:windows'), {
    'session.new': { code: 'KeyN', modifiers: ['primary', 'alt'] },
    'session.fork': null,
  })
  assert.deepEqual(profileOverrides(parsed.document, 'web:windows'), {
    'session.new': { code: 'KeyJ', modifiers: ['control', 'alt'] },
  })
  const reset = withoutOverride(parsed.document, 'desktop:windows', 'session.fork')
  assert.deepEqual(profileOverrides(reset, 'desktop:windows'), {
    'session.new': { code: 'KeyN', modifiers: ['primary', 'alt'] },
  })
  assert.deepEqual(profileOverrides(withProfile(reset, 'desktop:windows', {}), 'desktop:windows'), {})
})

test('parseKeymapDocument classifies corrupt and foreign documents', () => {
  assert.deepEqual(parseKeymapDocument(null), { status: 'ready', document: emptyDocument() })
  assert.equal(parseKeymapDocument('{').status, 'invalid')
  assert.equal(parseKeymapDocument('{"profiles":{}}').status, 'invalid')
  assert.equal(parseKeymapDocument(JSON.stringify({ plugin: 'dsh-better-keymap', schemaVersion: 2, profiles: {} })).status, 'invalid')
  assert.equal(parseKeymapDocument(JSON.stringify({
    plugin: 'dsh-better-keymap', schemaVersion: 1, profiles: { 'desktop:plan9': {} },
  })).status, 'invalid')
})

const catalogRows = [
  row('shortcuts.open', '快捷键速查', { code: 'Slash', modifiers: ['primary'] }),
  row('session.new', '新会话', { code: 'KeyN', modifiers: ['primary'] }),
  row('session.search', '搜索会话', { code: 'KeyK', modifiers: ['primary'] }),
  row('never.bound', '无默认', null),
]
const fixedRows = [
  { id: 'fixed.select', label: '选择菜单项', keys: ['Enter'], bindings: [normalizeBinding({ code: 'Enter', modifiers: [] }, 'windows')], group: 'menus' },
]

/** The composer gestures the plugin rebinds, as `ui-conversation` registers them. */
const composerFixedRows = [
  {
    id: 'fixed.send', label: '发送消息', keys: ['Enter'],
    bindings: [normalizeBinding({ code: 'Enter', modifiers: [] }, 'windows')], group: 'input',
  },
  {
    id: 'fixed.newline', label: '换行', keys: ['Shift', 'Enter'],
    bindings: [normalizeBinding({ code: 'Enter', modifiers: ['shift'] }, 'windows')], group: 'input',
  },
  { id: 'fixed.select', label: '选择菜单项', keys: ['Enter'], bindings: [normalizeBinding({ code: 'Enter', modifiers: [] }, 'windows')], group: 'menus' },
]

test('an empty document inherits every product default and leaves unset commands unbound', () => {
  const catalog = buildCatalog(catalogRows, fixedRows, {}, 'desktop', 'windows')
  assert.deepEqual(catalog.rows.filter(entry => entry.kind === 'owned').map(entry => entry.id),
    ['shortcuts.open', 'session.new', 'session.search', 'never.bound'])
  assert.deepEqual(catalog.rows.find(entry => entry.id === 'session.new').keys, ['Ctrl', '+', 'N'])
  assert.deepEqual(catalog.rows.find(entry => entry.id === 'never.bound').keys, [])
  assert.equal(catalog.rows.find(entry => entry.id === 'never.bound').binding, null)
  assert.deepEqual(catalog.rows.filter(entry => entry.kind === 'fixed').map(entry => entry.id), ['fixed.select'])
})

test('an override replaces the default and an explicit null clears it', () => {
  const overrides = {
    'session.new': null,
    'session.search': { code: 'KeyJ', modifiers: ['primary', 'alt'] },
  }
  const catalog = buildCatalog(catalogRows, fixedRows, overrides, 'desktop', 'windows')
  const byId = new Map(catalog.rows.map(entry => [entry.id, entry]))
  assert.equal(byId.get('session.new').binding, null)
  assert.equal(byId.get('session.new').customized, true)
  assert.deepEqual(byId.get('session.search').keys, ['Ctrl', '+', 'Alt', '+', 'J'])
  assert.equal(byId.get('session.search').customized, true)
  assert.equal(byId.get('shortcuts.open').customized, false)
})

test('displacedBindings reports the holders of a combination and skips the target', () => {
  const overrides = { 'session.search': { code: 'KeyN', modifiers: ['primary'] } }
  const catalog = buildCatalog(catalogRows, fixedRows, overrides, 'desktop', 'windows')
  const taken = normalizeBinding({ code: 'KeyN', modifiers: ['primary'] }, 'windows')
  const ids = (exceptId) => displacedBindings(catalog, taken, exceptId).map(entry => entry.id)
  assert.deepEqual(ids('session.new'), ['session.search'])
  assert.deepEqual(ids('session.search'), ['session.new'])
})

test('displacedBindings reads the plugin override, not the product default', () => {
  // `session.new` moved to Ctrl+Alt+J, so its old Ctrl+N is free and its new
  // combination is what a later assignment has to displace.
  const overrides = { 'session.new': { code: 'KeyJ', modifiers: ['primary', 'alt'] } }
  const catalog = buildCatalog(catalogRows, fixedRows, overrides, 'desktop', 'windows')
  const oldKey = normalizeBinding({ code: 'KeyN', modifiers: ['primary'] }, 'windows')
  const newKey = normalizeBinding({ code: 'KeyJ', modifiers: ['primary', 'alt'] }, 'windows')
  assert.deepEqual(displacedBindings(catalog, oldKey, 'session.search'), [])
  assert.deepEqual(displacedBindings(catalog, newKey, 'session.search').map(entry => entry.id), ['session.new'])
})

test('a composer gesture participates in displacement with its effective key', () => {
  const catalog = buildCatalog(catalogRows, composerFixedRows, {}, 'desktop', 'windows')
  // Untouched: `换行` answers to Shift+Enter, which is what it performs.
  const shiftEnter = normalizeBinding({ code: 'Enter', modifiers: ['shift'] }, 'windows')
  assert.deepEqual(displacedBindings(catalog, shiftEnter, 'session.new').map(entry => entry.id), ['fixed.newline'])
  // Moved: the gesture's old combination is now free.
  const moved = buildCatalog(catalogRows, composerFixedRows,
    { 'fixed.newline': { code: 'KeyJ', modifiers: ['primary', 'alt'] } }, 'desktop', 'windows')
  assert.deepEqual(displacedBindings(moved, shiftEnter, 'session.new'), [])
  const newKey = normalizeBinding({ code: 'KeyJ', modifiers: ['primary', 'alt'] }, 'windows')
  assert.deepEqual(displacedBindings(moved, newKey, 'session.new').map(entry => entry.id), ['fixed.newline'])
  // Cleared: the gesture holds nothing and yields to nothing.
  const cleared = buildCatalog(catalogRows, composerFixedRows, { 'fixed.newline': null }, 'desktop', 'windows')
  assert.deepEqual(displacedBindings(cleared, shiftEnter, 'session.new'), [])
})

test('every combination a profile writes is available as translation residue', () => {
  // The translation layer swallows a gesture's default key inside the input box.
  // When a product command takes that combination the layer has to stop
  // swallowing it — and the composer's own record cannot say so, because a
  // product command's override is not the composer's business. This is the list
  // the controller hands over for that purpose.
  const overrides = {
    'session.new': { code: 'Enter', modifiers: ['control'] },
    'fixed.send': { code: 'KeyJ', modifiers: ['primary', 'alt'] },
    'fixed.newline': null,
  }
  const { composer, product } = partitionOverrides(overrides, id => id.startsWith('fixed.'))
  assert.deepEqual(Object.keys(composer).sort(), ['fixed.newline', 'fixed.send'])
  assert.deepEqual(Object.values(product).filter(binding => binding !== null),
    [{ code: 'Enter', modifiers: ['control'] }],
    'a cleared product override contributes nothing, because it holds no key')
})

test('the accelerated action holds both of its macOS combinations', () => {
  // The shipped composer accepts Control+Enter and Meta+Enter alike on macOS.
  // Registering only the Meta spelling would let a later assignment take
  // Control+Enter without clearing the action, and the composer would then act
  // on the key the user just gave away.
  const macosFixed = [
    ...composerFixedRows,
    {
      id: 'fixed.complementary', label: '使用互补的 Queue／Steer 方式', keys: ['⌘', 'Enter'],
      bindings: [normalizeBinding({ code: 'Enter', modifiers: ['primary'] }, 'macos')], group: 'input',
    },
  ]
  const catalog = buildCatalog(catalogRows, macosFixed, {}, 'desktop', 'macos')
  for (const modifiers of [['control'], ['meta']]) {
    const binding = normalizeBinding({ code: 'Enter', modifiers }, 'macos')
    assert.deepEqual(displacedBindings(catalog, binding, 'session.new').map(entry => entry.id),
      ['fixed.complementary'], `${modifiers[0]}+Enter must be registered as held`)
  }
  // Clearing still releases both, and the row shows one spelling.
  const cleared = buildCatalog(catalogRows, macosFixed, { 'fixed.complementary': null }, 'desktop', 'macos')
  assert.deepEqual(displacedBindings(cleared, normalizeBinding({ code: 'Enter', modifiers: ['control'] }, 'macos'), 'session.new'), [])
  assert.deepEqual(displacedBindings(cleared, normalizeBinding({ code: 'Enter', modifiers: ['meta'] }, 'macos'), 'session.new'), [])
  // macOS places modifiers adjacently, so the displayed spelling has no `+`.
  const display = catalog.editable.find(row => row.id === 'fixed.complementary')
  assert.deepEqual(display.keys, ['⌘', 'Enter'], 'the row still displays the primary spelling')
  // On other devices the two spellings are one combination, listed once.
  const windows = buildCatalog(catalogRows, [
    ...composerFixedRows,
    {
      id: 'fixed.complementary', label: '使用互补的 Queue／Steer 方式', keys: ['Ctrl', 'Enter'],
      bindings: [normalizeBinding({ code: 'Enter', modifiers: ['primary'] }, 'windows')], group: 'input',
    },
  ], {}, 'desktop', 'windows')
  assert.deepEqual(displacedBindings(windows, normalizeBinding({ code: 'Enter', modifiers: ['primary'] }, 'windows'), 'session.new').map(entry => entry.id),
    ['fixed.complementary'])
})

test('the model ignores a stored override the translation layer cannot carry', () => {
  // A document can arrive from storage or an import with an override this
  // plugin would never write — a chord, or the shell's focus key. The layer
  // ignores it, so the model must too; otherwise the row claims to hold a key
  // that does nothing, and a later assignment is reported as displacing an
  // action that was never reachable through it.
  const untranslatable = [
    { code: 'KeyJ', secondCode: 'KeyK', modifiers: ['primary'] },
    { code: 'Tab', modifiers: ['control'] },
  ]
  for (const chosen of untranslatable) {
    const catalog = buildCatalog(catalogRows, composerFixedRows, { 'fixed.send': chosen }, 'desktop', 'windows')
    const row = catalog.editable.find(entry => entry.id === 'fixed.send')
    // The action still performs its own gesture, so that is what the row shows
    // and what it holds; the stored chord is nowhere.
    assert.deepEqual(row.keys, ['Enter'], 'the row must show the gesture it actually performs')
    assert.equal(row.customized, false, 'an override that changed nothing is not a customization')
    assert.deepEqual(catalog.editables.filter(entry => entry.id === 'fixed.send').map(entry => bindingKey(entry.binding)),
      ['Enter'], 'and it holds only that')
  }
})

test('two actions stored on one combination are awarded by catalog order', () => {
  // The plugin never writes this, but a hand-edited or imported document can.
  // The award has to be decided by a stated rule rather than by map order, and
  // the model has to make the same award the translation layer makes.
  const shared = { code: 'KeyJ', modifiers: ['primary', 'alt'] }
  const catalog = buildCatalog(catalogRows, composerFixedRows,
    { 'fixed.send': shared, 'fixed.newline': shared }, 'desktop', 'windows')
  assert.deepEqual(
    catalog.editables.filter(entry => entry.id.startsWith('fixed.')).map(entry => bindingKey(entry.binding)),
    ['control+alt+KeyJ', 'shift+Enter'],
    'the earlier action keeps the combination and the later one falls back to its own gesture',
  )
  const later = catalog.editable.find(entry => entry.id === 'fixed.newline')
  assert.equal(later.customized, false, 'the action that lost the award was not customized')
  assert.deepEqual(later.keys, ['Shift', '+', 'Enter'])
})

test('reservedByFixed reports window-wide reservations only', () => {
  const windowWide = [
    ...composerFixedRows,
    {
      id: 'fixed.slash', label: '打开命令菜单', keys: ['/'],
      bindings: [normalizeBinding({ code: 'Slash', modifiers: ['primary'] }, 'windows')], group: 'input',
    },
  ]
  const catalog = buildCatalog(catalogRows, windowWide, {}, 'desktop', 'windows')
  // Bare Enter is what a dialog navigates with, and this fixture's dialog action
  // is dialog-scoped, so nothing reserves it: the composer may take it.
  assert.deepEqual(reservedByFixed(catalog, normalizeBinding({ code: 'Enter', modifiers: [] }, 'windows')), [])
  // A window-wide fixed action still reserves its combination.
  assert.deepEqual(reservedByFixed(catalog, normalizeBinding({ code: 'Slash', modifiers: ['primary'] }, 'windows')), ['fixed.slash'])
})

test('neither a composer gesture nor a dialog action reserves a key', () => {
  const withDialog = [
    ...composerFixedRows,
    { id: 'approval.allow', label: '允许一次', keys: ['Enter'], bindings: [normalizeBinding({ code: 'Enter', modifiers: [] }, 'windows')], group: 'approval' },
    { id: 'fixed.slash', label: '打开命令菜单', keys: ['/'], bindings: [normalizeBinding({ code: 'Slash', modifiers: [] }, 'windows')], group: 'input' },
  ]
  const catalog = buildCatalog(catalogRows, withDialog, {}, 'desktop', 'windows')
  const ids = (binding) => reservedByFixed(catalog, binding).sort()
  // Bare Enter: owned by 发送消息 (rebindable) and 允许一次 (dialog-scoped).
  assert.deepEqual(ids(normalizeBinding({ code: 'Enter', modifiers: [] }, 'windows')), [])
  // Bare slash: owned by the command menu, which genuinely reserves it.
  assert.deepEqual(ids(normalizeBinding({ code: 'Slash', modifiers: [] }, 'windows')), ['fixed.slash'])
})

test('bindingKey is order-insensitive for a chord and modifier-ordered otherwise', () => {
  const left = normalizeBinding({ code: 'KeyF', secondCode: 'KeyG', modifiers: ['shift'] }, 'windows')
  const right = normalizeBinding({ code: 'KeyG', secondCode: 'KeyF', modifiers: ['shift'] }, 'windows')
  assert.equal(bindingKey(left), bindingKey(right))
  assert.equal(bindingKey(left), 'shift+KeyF+KeyG')
})
