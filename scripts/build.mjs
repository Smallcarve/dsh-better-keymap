/**
 * Build script for `dsh-better-keymap`.
 *
 * The plugin ships outside the DeepSeek Harness monorepo, so it cannot reuse
 * `packages/client/tsdown.client.ts` — that preset resolves a package manifest
 * from the repository's own tree and owns a stylesheet pipeline that emits a
 * separate sheet. A distributed browser plugin must instead be one artifact
 * with one handoff, so this script drives rolldown directly and states the
 * three artifact contracts itself:
 *
 * 1. The browser half is a CJS closure factory wrapped in the
 *    `window.__ModuleLoader__.load({ id, factory })` handoff the browser module
 *    table requires. Executing the script only registers the factory; every
 *    side effect, including the style tag, waits for materialization.
 * 2. Platform modules stay external, because the module table answers exactly
 *    those specifiers. A copy inlined here would be a second React, a second
 *    snapshot-store engine, and a second UI-primitives instance.
 * 3. Stylesheets compile to a hashed class map and one injected `<style>` tag,
 *    so the artifact set is `lib/index.js` plus `lib/client.js`.
 *
 * @module scripts/build.mjs
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import { transform } from 'lightningcss'

/** Package name stamped into the loader handoff and the injected style tags. */
const PLUGIN_ID = 'dsh-better-keymap'

/** Repository root of this package. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Specifiers the web shell already shares into the module table. This mirrors
 * `PLATFORM_MODULES` in the Harness repository; a drift here shows up
 * immediately as `require(...) missed the module table`.
 */
const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/**
 * Virtual-id prefix keeping stylesheets out of the module graph proper.
 *
 * The id deliberately does not end in `.css`: rolldown routes any id with that
 * suffix into its own stylesheet pipeline, which replaces the plugin's module
 * body with an empty class map.
 */
const CSS_PREFIX = '\0dsh-keymap-css:'
const CSS_SUFFIX = '?compiled'

/** Only the plugin's own relative stylesheets are compiled here. */
const OWN_STYLESHEET = /^[./].*\.module\.css$/u

/**
 * Compile one `.module.css` file into its class map and text.
 *
 * Two things are pinned so the artifact does not depend on where it was built,
 * which matters because `lib/` is committed and a clone must be able to
 * reproduce it:
 *
 * - `lightningcss` derives the `[hash]` in each class name from the file name it
 *   is given, so it is passed a path relative to the project root. An absolute
 *   path would make every checkout produce different class names.
 * - The class map is emitted in sorted key order, because the order the exports
 *   come back in varies between runs.
 * @param file - absolute stylesheet path.
 * @returns the hashed class names and the compiled stylesheet text.
 */
async function compileStylesheet(file) {
  const { code, exports } = transform({
    filename: relative(ROOT, file).split(sep).join('/'),
    code: await readFile(file),
    cssModules: { pattern: '[hash]_[local]' },
    minify: true,
  })
  const classMap = {}
  const names = []
  for (const [local, value] of Object.entries(exports ?? {})) {
    const name = typeof value === 'string' ? value : value?.name
    if (typeof name === 'string') names.push([local, name])
  }
  if (names.length === 0) {
    throw new Error(`dsh-better-keymap: ${file} produced no CSS Modules class names`)
  }
  for (const [local, name] of names.sort(([left], [right]) => (left < right ? -1 : 1))) {
    classMap[local] = name
  }
  return { classMap, css: code.toString() }
}

/**
 * Emit the module that injects one stylesheet and exports its class map.
 * @param file - absolute stylesheet path, used for the tag identity.
 * @param css - compiled stylesheet text.
 * @param classMap - hashed class names keyed by local name.
 * @returns the module source.
 */
function styleModule(file, css, classMap) {
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(file)}`)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/** Keep the shell's shared modules external and compile the plugin's own stylesheets. */
function pluginPlugins() {
  return [
    {
      name: 'dsh-keymap-platform-externals',
      resolveId: {
        order: 'pre',
        handler(source) {
          return PLATFORM_MODULES.has(source) ? { id: source, external: true } : null
        },
      },
    },
    {
      name: 'dsh-keymap-css-modules',
      resolveId(source, importer) {
        if (!OWN_STYLESHEET.test(source)) return null
        const base = importer === undefined ? ROOT : dirname(importer.startsWith('file:') ? fileURLToPath(importer) : importer)
        // The id is root-relative, not absolute: rolldown writes it into a
        // `//#region` comment, and an absolute path would put the build machine's
        // directory layout into the committed artifact.
        const file = relative(ROOT, isAbsolute(source) ? source : resolve(base, source)).split(sep).join('/')
        return CSS_PREFIX + file + CSS_SUFFIX
      },
      async load(virtualId) {
        if (!virtualId.startsWith(CSS_PREFIX) || !virtualId.endsWith(CSS_SUFFIX)) return null
        const file = resolve(ROOT, virtualId.slice(CSS_PREFIX.length, -CSS_SUFFIX.length))
        this.addWatchFile(file)
        const { classMap, css } = await compileStylesheet(file)
        return styleModule(file, css, classMap)
      },
    },
  ]
}

/**
 * Bundle the browser half into the loader's closure-factory artifact.
 * @returns the emitted JavaScript text.
 */
async function buildClient() {
  const bundle = await rolldown({
    input: resolve(ROOT, 'src/client/index.ts'),
    platform: 'browser',
    resolve: { conditionNames: ['browser', 'import', 'module', 'default'] },
    plugins: pluginPlugins(),
  })
  const { output } = await bundle.generate({
    format: 'cjs',
    exports: 'named',
    sourcemap: true,
    sourcemapExcludeSources: false,
  })
  await bundle.close()
  const chunk = output.find(entry => entry.type === 'chunk' && entry.isEntry)
  if (chunk === undefined || chunk.type !== 'chunk') throw new Error('dsh-better-keymap: client bundle emitted no entry chunk')
  const body = chunk.code
    .replace(/^['"]use strict['"];\s*/u, '')
    .replace(/\n?\/\/# sourceMappingURL=.*$/u, '')
  return [
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    'var module = { exports: {} }; var exports = module.exports;',
    body,
    'return module.exports; } });',
    '',
  ].join('\n')
}

/**
 * Bundle the Node half the Loader still imports.
 * @returns the emitted JavaScript text.
 */
async function buildNode() {
  const bundle = await rolldown({ input: resolve(ROOT, 'src/index.ts'), platform: 'node' })
  const { output } = await bundle.generate({ format: 'esm', sourcemap: false })
  await bundle.close()
  const chunk = output.find(entry => entry.type === 'chunk' && entry.isEntry)
  if (chunk === undefined || chunk.type !== 'chunk') throw new Error('dsh-better-keymap: node bundle emitted no entry chunk')
  return `${chunk.code}\n`
}

const outDir = resolve(ROOT, 'lib')
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const [client, node] = await Promise.all([buildClient(), buildNode()])
await writeFile(resolve(outDir, 'client.js'), client)
await writeFile(resolve(outDir, 'index.js'), node)
console.log(`dsh-better-keymap: wrote lib/client.js (${client.length} bytes) and lib/index.js (${node.length} bytes)`)
