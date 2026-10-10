/**
 * Minimal check harness.
 *
 * The suite needs one thing Node's own runner only provides when it owns the
 * process: a nonzero exit code on failure. `node --test` needs a child process,
 * which a restricted sandbox denies, so the checks are plain functions that
 * this module runs in order and reports.
 *
 * @module tests/harness.mjs
 */

/** Every registered check, in declaration order. */
const checks = []

/**
 * Register one check.
 * @param name - the check's description.
 * @param run - the check body; it fails by throwing.
 */
export function test(name, run) {
  checks.push({ name, run })
}

/** How many checks are registered; the published docs quote this number. */
export function checkCount() {
  return checks.length
}

/**
 * Run every registered check and exit with the result.
 * @param files - file names whose checks are being reported, for the summary.
 */
export async function runChecks(files) {
  let passed = 0
  const failures = []
  for (const { name, run } of checks) {
    try {
      await run()
      passed += 1
      console.log(`✔ ${name}`)
    } catch (error) {
      failures.push({ name, error })
      console.error(`✖ ${name}`)
      console.error(`  ${error?.message ?? String(error)}`)
    }
  }
  console.log(`\ndsh-better-keymap: ${passed} passed, ${failures.length} failed (${files} file(s))`)
  if (failures.length > 0) process.exit(1)
}
