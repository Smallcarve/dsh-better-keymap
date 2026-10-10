/**
 * Run every check.
 *
 * `node --test` is unavailable here (it spawns a child per file, which this
 * sandbox denies), so the files are imported and their checks run in order by
 * `tests/harness.mjs`.
 *
 * @module scripts/run-tests.mjs
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runChecks } from '../tests/harness.mjs'

/** Check files, in the order that fails fastest: pure logic first. */
const FILES = [
  'tests/logic.test.mjs',
  'tests/reserved-keys.test.mjs',
  'tests/controller.test.mjs',
  'tests/gesture-conflict.test.mjs',
  'tests/failure-paths.test.mjs',
  'tests/composer.test.mjs',
  'tests/bundle.test.mjs',
  'tests/ui.test.mjs',
]

const root = resolve(import.meta.dirname, '..')
for (const file of FILES) {
  try {
    await import(pathToFileURL(resolve(root, file)).href)
  } catch (error) {
    console.error(`dsh-better-keymap: ${file} failed to load`)
    console.error(error)
    process.exit(1)
  }
}
await runChecks(FILES.length)
