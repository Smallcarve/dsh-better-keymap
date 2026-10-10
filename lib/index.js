//#region src/index.ts
/**
* Node half of `dsh-better-keymap`.
*
* The plugin is browser-only: it owns no host service, registers no tool, and
* writes no session data. Its Cordis patch adds the browser row, and the Loader
* still imports this entry, so it must exist and be side-effect free.
*/
/** Cordis plugin name, matching the package name the Loader row declares. */
const name = "dsh-better-keymap";
/**
* Mount the node half.
*
* Intentionally empty: the browser half registers every contribution, and a
* no-op keeps the host process free of shortcuts concerns.
* @returns nothing; this half contributes nothing to the host.
*/
function apply() {}

//#endregion
export { apply, name };
