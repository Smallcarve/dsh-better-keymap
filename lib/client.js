window.__ModuleLoader__.load({ id: "dsh-better-keymap", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
__deepseek_ai_dsh_client_ui_primitives = __toESM(__deepseek_ai_dsh_client_ui_primitives);
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);
let __deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
__deepseek_ai_dsh_client_store = __toESM(__deepseek_ai_dsh_client_store);

//#region src/client/bindings.ts
/** Every profile the plugin stores independently, in document order. */
const KEY_PROFILES = [
	"desktop:macos",
	"desktop:windows",
	"desktop:linux",
	"web:macos",
	"web:windows",
	"web:linux"
];
/**
* The physical codes the plugin accepts, in one place.
*
* `KEY_NAMES` carries two jobs that happen to share a key set: it is the
* allowlist for codes outside `CODE_PATTERN`, and it is the visible keycap
* table.
*/
const KEY_NAMES = {
	Slash: "/",
	Comma: ",",
	Period: ".",
	Backslash: "\\",
	Backquote: "`",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Semicolon: ";",
	Quote: "'",
	Enter: "Enter",
	Escape: "Esc",
	Space: "Space",
	Tab: "Tab",
	Backspace: "Backspace",
	Delete: "Delete",
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→"
};
/** Canonical modifier order; it is also the keycap order. */
const MODIFIER_ORDER = [
	"control",
	"alt",
	"shift",
	"meta"
];
/** Letter, digit, and function keys whose code is derivable from the pattern. */
const CODE_PATTERN = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/u;
/**
* Expand logical modifiers, validate physical codes, and canonicalize order.
* @param binding - declared combination.
* @param platform - receiving device, selecting the `primary` expansion.
* @returns the canonical binding.
* @throws {Error} when a code is outside the accepted alphabet or the two keys coincide.
*/
function normalizeBinding(binding, platform) {
	const codes = [binding.code, ...binding.secondCode === void 0 ? [] : [binding.secondCode]];
	codes.sort();
	for (const code of codes) if (!CODE_PATTERN.test(code) && !Object.hasOwn(KEY_NAMES, code)) throw new Error(`Unsupported shortcut code: ${code}`);
	if (codes.length === 2 && codes[0] === codes[1]) throw new Error("Shortcut keys must be distinct");
	const expanded = new Set(binding.modifiers.map((value) => value === "primary" ? platform === "macos" ? "meta" : "control" : value));
	return {
		code: codes[0],
		...codes[1] === void 0 ? {} : { secondCode: codes[1] },
		modifiers: MODIFIER_ORDER.filter((value) => expanded.has(value))
	};
}
/**
* Build the exact-match index used for both storage and conflict detection.
* @param binding - normalized combination.
* @returns a stable key joining canonical modifiers and sorted codes.
*/
function bindingKey(binding) {
	const codes = binding.secondCode === void 0 ? [binding.code] : [binding.code, binding.secondCode].sort();
	return [...binding.modifiers, ...codes].join("+");
}
/**
* Decide whether two combinations cannot both be bound.
*
* The rule mirrors the shipped arbitration: an identical combination collides,
* and under the same modifier set a single key collides with any two-key chord
* that contains it.
* @param left - normalized candidate.
* @param right - normalized occupant.
* @returns whether the two combinations overlap.
*/
function overlappingBindings(left, right) {
	if (left.modifiers.join("+") !== right.modifiers.join("+")) return false;
	if (left.secondCode !== void 0 && right.secondCode !== void 0) return bindingKey(left) === bindingKey(right);
	return [left.code, left.secondCode].some((code) => code !== void 0 && (code === right.code || code === right.secondCode));
}
/**
* Compare two resolved combinations for equality.
*
* The controller's `reconcile` asks this when it checks whether a product row
* still matches the plugin document. It lives with the type it compares rather
* than being re-derived beside that caller.
* @param left - one normalized combination, or null for unbound.
* @param right - the other.
* @returns whether both name the same physical combination.
*/
function sameBinding(left, right) {
	if (left === null || right === null) return left === right;
	return left.code === right.code && left.secondCode === right.secondCode && left.modifiers.join("+") === right.modifiers.join("+");
}
/**
* Format keycaps and the ARIA accelerator for one combination.
*
* Windows separates modifiers with `+`; other platforms place them adjacently.
* A two-key chord omits ARIA because the attribute accepts one non-modifier key.
* @param binding - normalized combination, or null for an unbound command.
* @param platform - receiving device.
* @returns visible keycaps and the ARIA accelerator.
*/
function presentBinding(binding, platform) {
	if (binding === null) return {
		keys: [],
		aria: void 0
	};
	const key = KEY_NAMES[binding.code] ?? binding.code.replace(/^(Key|Digit)/u, "");
	const symbols = platform === "macos" ? {
		control: "⌃",
		alt: "⌥",
		shift: "⇧",
		meta: "⌘"
	} : {
		control: "Ctrl",
		alt: "Alt",
		shift: "Shift",
		meta: "Meta"
	};
	const ariaNames = {
		control: "Control",
		alt: "Alt",
		shift: "Shift",
		meta: "Meta"
	};
	const ariaKey = binding.code === "Space" ? "Space" : binding.code === "Escape" ? "Escape" : binding.code.startsWith("Arrow") ? binding.code : key;
	const second = binding.secondCode === void 0 ? [] : [KEY_NAMES[binding.secondCode] ?? binding.secondCode.replace(/^(Key|Digit)/u, "")];
	const keys = [...binding.modifiers.map((value) => symbols[value]), key];
	return {
		keys: [...platform === "windows" ? keys.flatMap((label, index) => index === 0 ? [label] : ["+", label]) : keys, ...second],
		aria: binding.secondCode === void 0 ? [...binding.modifiers.map((value) => ariaNames[value]), ariaKey].join("+") : void 0
	};
}
/**
* Reject combinations no device can deliver or that collide with text editing.
* @param binding - normalized candidate.
* @param runtime - receiving shell.
* @param platform - receiving device.
* @returns the rejection reason, or null when the combination is usable.
*/
function bindingIssue(binding, runtime, platform) {
	if (runtime === "desktop" && (platform === "windows" || platform === "macos")) return null;
	if (binding.secondCode !== void 0) return "unsupported-key";
	if (binding.modifiers.length === 0 || binding.modifiers.every((modifier) => modifier === "shift")) return "modifier-required";
	if ((platform === "windows" || platform === "macos") && binding.modifiers.length >= 3) return null;
	if (runtime === "web" && (platform === "windows" || platform === "macos") && isWebBindingAllowed(binding, platform)) return null;
	const primary = binding.modifiers.includes(platform === "macos" ? "meta" : "control");
	if ([
		"Escape",
		"Tab",
		"Space",
		"Backspace",
		"Delete",
		"ArrowUp",
		"ArrowDown",
		"ArrowLeft",
		"ArrowRight"
	].includes(binding.code) || binding.code === "Enter" && !binding.modifiers.includes("alt") || primary && [
		"KeyC",
		"KeyV",
		"KeyX",
		"KeyZ",
		"KeyY",
		"KeyQ",
		"KeyH"
	].includes(binding.code) || primary && binding.code === "KeyA" && !binding.modifiers.includes("shift") || platform !== "macos" && (binding.modifiers.includes("meta") || binding.modifiers.includes("alt") && ["F4", "F2"].includes(binding.code)) || platform === "macos" && binding.modifiers.includes("control") && binding.modifiers.includes("meta") || platform === "macos" && binding.modifiers.includes("alt") && !primary) return "reserved";
	if (runtime === "web" && !isWebBindingAllowed(binding, platform)) return "unsupported-browser";
	return null;
}
/**
* Check the combinations a browser can actually hand to the page.
*
* Windows and macOS additionally admit any three or four modifiers; Linux keeps
* the narrow set the shipped product allows.
* @param binding - normalized candidate.
* @param platform - receiving device.
* @returns whether the combination is admitted; admission does not guarantee delivery.
*/
function isWebBindingAllowed(binding, platform) {
	if (binding.secondCode !== void 0) return false;
	if (platform === "windows" || platform === "macos") {
		if (binding.modifiers.length >= 3) return true;
		const primary = platform === "macos" ? "meta" : "control";
		if (binding.modifiers.length === 1 && (["Comma", "Backslash"].includes(binding.code) && binding.modifiers[0] === primary || binding.code === "Backquote" && binding.modifiers[0] === "control")) return true;
		if (binding.modifiers.length === 2 && binding.modifiers.includes(primary) && (binding.modifiers.includes("alt") || binding.modifiers.includes("shift"))) return true;
	}
	return [
		{
			code: "Slash",
			modifiers: ["primary"]
		},
		{
			code: "Comma",
			modifiers: ["primary", "shift"]
		},
		{
			code: "Period",
			modifiers: ["primary", "shift"]
		}
	].some((candidate) => bindingKey(binding) === bindingKey(normalizeBinding(candidate, platform)));
}
/**
* Validate an untrusted JSON binding value before it enters the document.
* @param value - parsed storage or IPC input.
* @returns the accepted binding, or null for an explicit removal.
* @throws {Error} when the value carries unknown fields or an unsupported code.
*/
function parseBinding(value) {
	if (value === null) return null;
	if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid shortcut binding");
	const record = value;
	if (Object.keys(record).some((key) => key !== "code" && key !== "secondCode" && key !== "modifiers") || typeof record.code !== "string" || !Array.isArray(record.modifiers) || Object.hasOwn(record, "secondCode") && typeof record.secondCode !== "string" || !record.modifiers.every((modifier) => typeof modifier === "string" && [
		"primary",
		"control",
		"alt",
		"shift",
		"meta"
	].includes(modifier))) throw new Error("Invalid shortcut binding");
	const binding = {
		code: record.code,
		modifiers: record.modifiers,
		...typeof record.secondCode === "string" ? { secondCode: record.secondCode } : {}
	};
	normalizeBinding(binding, "windows");
	return binding;
}

//#endregion
//#region src/client/gestures.ts
/** The composer's three rebindable actions, in the product's own catalog order. */
const COMPOSER_COMMANDS = [
	"fixed.send",
	"fixed.newline",
	"fixed.complementary"
];
/**
* Whether an id names one of the composer actions.
* @param id - a command id from the product catalog or a plugin document.
* @returns whether the id is one of the three.
*/
function isComposerCommand(id) {
	return COMPOSER_COMMANDS.includes(id);
}
/**
* The three actions the plugin rebinds, and the combination each one performs.
*
* The performed combination is fixed product behavior; only the key that
* triggers it is the user's. Only `performs` is declared here — the *displayed*
* key for an untouched action comes from this same combination, resolved by
* `catalog.ts`, so there is no second table to drift.
*/
const COMPOSER_GESTURES = {
	"fixed.send": { performs: {
		code: "Enter",
		modifiers: []
	} },
	"fixed.newline": { performs: {
		code: "Enter",
		modifiers: ["shift"]
	} },
	"fixed.complementary": { performs: {
		code: "Enter",
		modifiers: ["primary"]
	} }
};
/**
* The physical modifiers the shipped composer reads for each action.
*
* `compositor.ts` synthesizes exactly these on the substituted event, and
* `composerDefaults` below turns them into the combinations the action answers
* to. One table, so a gesture can never be translated as one thing and
* registered as another.
*/
const ACTION_GESTURE = {
	"fixed.send": [],
	"fixed.newline": ["shift"],
	"fixed.complementary": ["control"]
};
/** The Meta spelling of the accelerated gesture, which macOS also accepts. */
const ACCELERATED_GESTURE = ["meta"];
/** The key every composer action uses; only the modifiers distinguish them. */
const COMPOSER_CODE = "Enter";
/** Keys the translation layer can never turn into a gesture. */
const UNSUPPORTED_CODES = new Set([
	"Tab",
	"CapsLock",
	"Fn",
	"FnLock",
	"NumLock",
	"ScrollLock"
]);
/**
* Resolve the gesture one action performs on a device.
* @param command - the composer action.
* @param platform - receiving device.
* @returns the modifiers the substituted event carries.
*/
function gestureFor(command, platform) {
	if (command === "fixed.complementary" && platform === "macos") return ACCELERATED_GESTURE;
	return ACTION_GESTURE[command];
}
/**
* List every combination one action answers to on a device.
*
* On macOS the shipped composer accepts both Control+Enter and Meta+Enter for
* the accelerated action, so the action holds two combinations there. On every
* other device `primary` expands to Control, so the two spellings coincide and
* listing both would double-count one combination.
* @param command - the composer action.
* @param platform - receiving device.
* @returns one resolved combination per combination the action answers to.
*/
function composerDefaults(command, platform) {
	return (command === "fixed.complementary" && platform === "macos" ? [ACCELERATED_GESTURE, ACTION_GESTURE[command]] : [gestureFor(command, platform)]).map((modifiers) => normalizeBinding({
		code: COMPOSER_CODE,
		modifiers: [...modifiers]
	}, platform));
}
/**
* Whether one combination reaches an action on a device.
* @param command - the composer action.
* @param binding - the candidate combination.
* @param platform - receiving device.
* @returns whether the action answers to this combination.
*/
function composerAccepts(command, binding, platform) {
	const chosen = bindingKey(normalizeBinding(binding, platform));
	return composerDefaults(command, platform).some((entry) => bindingKey(entry) === chosen);
}
/**
* Whether the translation layer can carry one chosen combination.
*
* A chord has no single physical press to substitute, and the shell owns a
* handful of modifier and lock keys. Which combinations stay out of reach is a
* separate rule, `reservedBindingIssue`, because that one is about what the
* window can deliver while this one is about what this layer can translate.
* @param binding - the candidate combination.
* @returns whether the layer can translate this combination.
*/
function isTranslatable(binding) {
	if (binding.secondCode !== void 0) return false;
	return !UNSUPPORTED_CODES.has(binding.code);
}
/**
* Single keys no editable shortcut may take.
*
* These are the product's own fixed input gestures: Enter sends, Escape stops
* and dismisses, `/` and `@` open the composer's menus, and the arrows walk a
* menu. Assigning one of them bare would either shadow a gesture the user cannot
* give up, or fire during ordinary typing. Modifier combinations of the same
* keys stay available, because those are deliberate.
*/
const RESERVED_SINGLE_CODES = new Set([
	"Enter",
	"Escape",
	"Slash",
	"Digit2",
	"ArrowUp",
	"ArrowDown"
]);
/**
* The subset the three composer actions may still use.
*
* `Enter` is the product's own send key, so an action in the input box may take
* it; the rest stay out of reach there too.
*/
const COMPOSER_RESERVED_SINGLE_CODES = new Set([
	"Escape",
	"Slash",
	"Digit2",
	"ArrowUp",
	"ArrowDown"
]);
/**
* Enter combinations the input box's fixed actions own on every device.
*
* The product registers these as *fixed* reservations, and it folds a fixed
* reservation into every editable row's conflicts unconditionally
* (`configuration.ts`). A row with conflicts never enters the dispatch table, so
* an editable command that claims one of them is consumed but never runs: the
* key does nothing, silently, in the input box and everywhere else.
*
* The plugin therefore refuses them for editable commands instead of accepting a
* binding the window cannot deliver. It cannot lift the reservation either:
* that would mean replacing the owning plugin's `registerFixed` row, and
* re-registering a duplicate id throws, which would take that plugin's mount
* down with it.
*
* The three composer actions still take these combinations, because their keys
* are translated locally and never mirrored into the product.
*/
const RESERVED_COMBINATIONS = [["shift"], ["control"]];
/**
* Whether an editable shortcut may take one combination.
*
* One rule, one home: the bare keys the product's input gestures own, plus the
* Enter combinations its fixed reservations lock window-wide. A caller uses this
* in place of a private copy, so the recorder and the commit can never disagree.
* @param binding - the candidate combination.
* @param composer - whether the target is one of the three composer actions.
* @returns the rejection reason, or null when the combination is available.
*/
function reservedBindingIssue(binding, composer) {
	if (binding.secondCode !== void 0) return null;
	const single = composer ? COMPOSER_RESERVED_SINGLE_CODES : RESERVED_SINGLE_CODES;
	if (binding.modifiers.length === 0) return single.has(binding.code) ? "reserved-key" : null;
	if (composer || binding.code !== COMPOSER_CODE) return null;
	return RESERVED_COMBINATIONS.some((modifiers) => modifiers.length === binding.modifiers.length && modifiers.every((modifier) => binding.modifiers.includes(modifier))) ? "reserved-combination" : null;
}
/**
* Resolve the combinations one profile's overrides give the composer actions.
*
* This is the single answer both consumers read, so the reference's arbitration
* and the translation layer cannot disagree about the same stored document:
*
* - an override the layer cannot carry is ignored, exactly as the layer ignores
*   it, so the row never claims to hold a key that does nothing;
* - when one combination is assigned to two actions, the action that comes first
*   in the product's own catalog order keeps it and the other is dropped, so the
*   outcome is decided by a stated rule rather than by map insertion order.
* @param overrides - one profile's override record. A present-but-`undefined`
* entry is treated as absent, the same way `buildCatalog` treats one.
* @param platform - receiving device.
* @returns each action's resolved binding: absent for untouched, `null` for
* cleared, otherwise the combination the action holds.
*/
function composerOverrides(overrides, platform) {
	const claimed = /* @__PURE__ */ new Set();
	const resolved = {};
	for (const command of COMPOSER_COMMANDS) {
		const chosen = overrides[command];
		if (chosen === void 0) continue;
		if (chosen === null) {
			resolved[command] = null;
			continue;
		}
		if (!isTranslatable(chosen)) continue;
		const key = bindingKey(normalizeBinding(chosen, platform));
		if (claimed.has(key)) continue;
		claimed.add(key);
		resolved[command] = chosen;
	}
	return resolved;
}

//#endregion
//#region src/client/catalog.ts
/** Display groups, in the order the reference renders them. */
const GROUP_ORDER = [
	"application",
	"input",
	"menus",
	"approval"
];
/** Product command ordering inside the application group. */
const CORE_ACTION_ORDER = [
	"shortcuts.open",
	"session.new",
	"sidebar.left.toggle",
	"session.search",
	"workspace.add",
	"session.rename",
	"session.fork",
	"session.archive",
	"settings.open",
	"workspace.openLocal",
	"sidebar.right.toggle",
	"workspace.files",
	"browser.new",
	"terminal.new",
	"pane.split",
	"pane.fullscreen.toggle",
	"page.refresh",
	"page.close"
].reduce((order, id, index) => order.set(id, index), /* @__PURE__ */ new Map());
/**
* An empty model, used as the controller's placeholder before the first publish.
* @returns a model with no rows and no occupancy.
*/
function emptyCatalog() {
	return {
		rows: [],
		editable: [],
		editables: [],
		frozen: []
	};
}
/**
* Sort key for one editable command, reproducing the shipped reference order.
* @param id - product command id.
* @returns the ordering rank.
*/
function rowRank(id) {
	return CORE_ACTION_ORDER.get(id) ?? CORE_ACTION_ORDER.size;
}
/**
* Build search terms exactly as the shipped reference does.
* @param row - product catalog row.
* @returns every name the fuzzy matcher searches.
*/
function ownedNames(row) {
	const joined = row.keys.filter((key) => key !== "+").join("+");
	return [
		...row.aliases,
		joined,
		row.keys.filter((key) => key !== "+").join(""),
		row.aria ?? "",
		row.aria?.replace("Meta", "Cmd") ?? ""
	];
}
/**
* Resolve every combination one composer gesture holds for arbitration.
*
* A gesture the user has not touched still answers to the combinations it
* performs, which is what makes moving onto one of them displace it. A cleared
* gesture occupies nothing, so it can neither displace nor be displaced.
*
* The decision comes from the translation layer's own resolver, not from a
* second opinion here, so the model and the layer always agree about the same
* document: an override the layer cannot carry holds nothing, and a combination
* two actions were both assigned belongs to the one the layer awarded it to.
* @param id - the fixed row's command id.
* @param resolved - the layer's resolution of this profile's overrides.
* @param platform - receiving device.
* @returns one entry per combination the gesture holds.
*/
function composerBindings(id, resolved, platform) {
	if (!isComposerCommand(id)) return [];
	const chosen = resolved[id];
	if (chosen === void 0) return composerDefaults(id, platform);
	return chosen === null ? [] : [normalizeBinding(chosen, platform)];
}
/**
* Resolve the combination a composer gesture displays.
*
* Unlike {@link composerBindings}, an untouched gesture shows the combination it
* performs: that is the product's own key, and it is what the reference must
* show before the user changes anything. An override the translation layer
* cannot carry is not shown either, because the row must never name a key that
* does nothing.
* @param id - the fixed row's command id.
* @param resolved - the layer's resolution of this profile's overrides.
* @param platform - receiving device.
* @returns the displayed combination, or null when nothing is in force.
*/
function composerDisplay(id, resolved, platform) {
	const gesture = COMPOSER_GESTURES[id];
	if (gesture === void 0) return null;
	const chosen = resolved[id];
	if (chosen === void 0) return normalizeBinding(gesture.performs, platform);
	return chosen === null ? null : normalizeBinding(chosen, platform);
}
/**
* Resolve every combination an editable row currently answers to, product
* commands and composer gestures alike.
*
* The product's own `binding` is only a default: once the user overrides a
* command, that override is what the window dispatches. Arbitration therefore
* reads the plugin document, or a later assignment would both miss the real
* holder and wrongly refuse a key the user already moved away from.
* @param catalog - live product catalog rows.
* @param fixed - live product fixed rows.
* @param overrides - the plugin's explicit overrides for the current profile.
* @param composer - the translation layer's resolution of the composer subset.
* @param platform - receiving device.
* @returns one entry per held combination, so a row may contribute several.
*/
function editableBindings(catalog, fixed, overrides, composer, platform) {
	const entries = [];
	for (const row of catalog) {
		const candidate = Object.hasOwn(overrides, row.id) ? overrides[row.id] : row.binding;
		if (candidate === null) continue;
		entries.push({
			id: row.id,
			binding: normalizeBinding(candidate, platform)
		});
	}
	for (const row of fixed) for (const binding of composerBindings(row.id, composer, platform)) entries.push({
		id: row.id,
		binding
	});
	return entries;
}
/**
* Fixed actions that belong to a dialog or a menu rather than to the window.
*
* These own the bare keys a dialog navigates with: Enter picks the highlighted
* item, Escape dismisses the layer. Their whole point is that the *focused
* layer* decides, so a gesture living in the composer is a different use of the
* same key and must not be refused because one of them exists. Every other
* fixed action genuinely reserves its combination window-wide.
*/
const DIALOG_SCOPED_ACTIONS = new Set([
	"fixed.move",
	"fixed.select",
	"fixed.dismiss",
	"approval.allow",
	"approval.reject"
]);
/**
* List the combinations no editable row may take without asking.
*
* Two kinds of fixed action are deliberately absent:
*
* - a composer gesture, because the plugin rebinds it and it therefore yields
*   to a later assignment instead of refusing it;
* - a dialog-scoped action, because its bare key is resolved by the focused
*   layer, so it never contends with the composer for the same press.
* @param fixed - live product fixed rows.
* @param platform - receiving device.
* @returns every combination a window-wide fixed action reserves.
*/
function frozenBindings(fixed, platform) {
	return fixed.filter((row) => COMPOSER_GESTURES[row.id] === void 0).filter((row) => !DIALOG_SCOPED_ACTIONS.has(row.id)).flatMap((row) => row.bindings.map((binding) => ({
		id: row.id,
		binding: normalizeBinding(binding, platform)
	})));
}
/**
* Derive the full display model from live product catalogs plus the plugin document.
*
* Effective bindings resolve in this order: an explicit override in the plugin
* document (`null` meaning cleared), otherwise the product's own resolved
* binding. That is what makes a fresh install behave exactly like Harness, and
* an absent product default stay unbound.
* @param catalog - live product catalog rows.
* @param fixed - live product fixed rows.
* @param overrides - the plugin's explicit overrides for the current profile.
* @param runtime - receiving shell.
* @param platform - receiving device.
* @returns rows, effective bindings, and the fixed reservation index.
*/
function buildCatalog(catalog, fixed, overrides, runtime, platform) {
	const effective = /* @__PURE__ */ new Map();
	for (const row of catalog) {
		const candidate = Object.hasOwn(overrides, row.id) ? overrides[row.id] : row.binding;
		effective.set(row.id, candidate === null ? null : normalizeBinding(candidate, platform));
	}
	const usable = catalog.flatMap((row) => {
		const binding = effective.get(row.id) ?? null;
		if (binding === null) return [];
		return [{
			id: row.id,
			binding,
			issue: bindingIssue(binding, runtime, platform)
		}];
	});
	const composer = composerOverrides(overrides, platform);
	const editables = editableBindings(catalog, fixed, overrides, composer, platform);
	const frozen = frozenBindings(fixed, platform);
	const rows = [];
	for (const row of catalog) {
		const binding = effective.get(row.id) ?? null;
		const customized = Object.hasOwn(overrides, row.id);
		rows.push({
			kind: "owned",
			id: row.id,
			label: row.label,
			group: "application",
			binding,
			names: ownedNames(row),
			...arbitration(row, binding, customized, usable, frozen, runtime, platform)
		});
	}
	rows.sort((left, right) => rowRank(left.id) - rowRank(right.id) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
	for (const row of fixed) {
		const gesture = COMPOSER_GESTURES[row.id];
		const shown = gesture === void 0 ? null : composerDisplay(row.id, composer, platform);
		rows.push({
			kind: "fixed",
			id: row.id,
			label: row.label,
			group: row.group === "application" ? "input" : row.group,
			keys: gesture === void 0 ? row.keys : presentBinding(shown, platform).keys,
			names: gesture === void 0 ? [row.id, row.keys.join(" ")] : [
				row.id,
				...presentBinding(shown, platform).keys.filter((key) => key !== "+"),
				row.keys.join(" ")
			],
			composer: gesture !== void 0
		});
	}
	return {
		rows,
		editable: buildEditable(catalog, fixed, overrides, composer, effective, usable, frozen, runtime, platform),
		editables,
		frozen
	};
}
/**
* Build the unified editable view over product commands and composer gestures.
*
* Product commands come first in product order, then the composer gestures in
* the order the product lists them. Both carry the same arbitration fields, so
* one recorder serves both.
* @param catalog - live product catalog rows.
* @param fixed - live product fixed rows.
* @param overrides - the plugin's explicit overrides for the current profile.
* @param composer - the translation layer's resolution of the composer subset.
* @param effective - resolved binding per product command.
* @param usable - product commands whose own binding is deliverable.
* @param frozen - every combination a fixed action the plugin cannot rebind reserves.
* @param runtime - receiving shell.
* @param platform - receiving device.
* @returns the unified editable rows.
*/
function buildEditable(catalog, fixed, overrides, composer, effective, usable, frozen, runtime, platform) {
	const rows = [];
	for (const row of catalog) {
		const binding = effective.get(row.id) ?? null;
		const customized = Object.hasOwn(overrides, row.id);
		rows.push({
			id: row.id,
			label: row.label,
			group: "application",
			customized,
			composer: false,
			binding,
			...arbitration(row, binding, customized, usable, frozen, runtime, platform)
		});
	}
	for (const row of fixed) {
		const gesture = COMPOSER_GESTURES[row.id];
		if (gesture === void 0) continue;
		const chosen = composer[row.id];
		const customized = chosen !== void 0;
		const binding = chosen === void 0 ? normalizeBinding(gesture.performs, platform) : composerDisplay(row.id, composer, platform);
		rows.push({
			id: row.id,
			label: row.label,
			group: row.group === "application" ? "input" : row.group,
			customized,
			composer: true,
			binding,
			keys: presentBinding(binding, platform).keys
		});
	}
	return rows;
}
/**
* Build the shared arbitration fields of one product command row.
* @param row - the product catalog row.
* @param binding - its effective binding.
* @param customized - whether the plugin document overrides it.
* @param usable - product commands whose own binding is deliverable.
* @param frozen - every combination a fixed action the plugin cannot rebind reserves.
* @param runtime - receiving shell.
* @param platform - receiving device.
* @returns the keycaps plus the conflict and issue fields.
*/
function arbitration(row, binding, customized, usable, frozen, runtime, platform) {
	const present = presentBinding(binding, platform);
	return {
		keys: present.keys,
		aria: present.aria,
		customized,
		conflicts: binding === null ? [] : usable.filter((other) => other.id !== row.id && other.issue === null && overlappingBindings(other.binding, binding)).map((other) => other.id),
		reservedBy: binding === null ? [] : frozen.filter((other) => overlappingBindings(other.binding, binding)).map((other) => other.id),
		issue: binding === null ? null : bindingIssue(binding, runtime, platform)
	};
}
/**
* Find every editable row that currently occupies a candidate combination.
*
* Unlike the row-level `conflicts` field, this deliberately ignores whether a
* holder is itself usable: a row whose own binding is refused still holds the
* combination in the document, and taking the combination has to clear it.
* Composer gestures are included, so a key the user moves onto one of them is
* taken from it and reported like any other displacement.
* @param catalog - derived display model.
* @param binding - the candidate combination.
* @param exceptId - the row being assigned, which cannot displace itself.
* @returns the displaced rows, in catalog order.
*/
function displacedBindings(catalog, binding, exceptId) {
	return catalog.editables.filter((other) => other.id !== exceptId && overlappingBindings(other.binding, binding));
}
/**
* Find every frozen fixed action that holds a candidate combination.
*
* A non-empty result is a refusal: `applySet` and `applyComposer` both reject the
* assignment and report these ids through `KeymapSaveResult.conflicts`, which the
* reference renders as 「…为固定操作，无法被覆盖」. The frozen set is exactly the
* actions that cannot yield, so there is nothing to displace and no `issue` to
* carry — the ids themselves are the reason.
*
* Composer gestures are excluded: the plugin rebinds them, so they yield to a
* later assignment and appear in `displacedBindings` instead.
* @param catalog - derived display model.
* @param binding - the candidate combination.
* @returns the fixed command ids blocking this combination.
*/
function reservedByFixed(catalog, binding) {
	return catalog.frozen.filter((other) => overlappingBindings(other.binding, binding)).map((other) => other.id);
}
/**
* Resolve a label for a command id, falling back to the raw id when the command
* is not currently registered (a plugin that unmounted after a binding was saved).
* @param catalog - derived display model.
* @param id - command id to name.
* @returns the localized label or the id.
*/
function labelOf(catalog, id) {
	return catalog.rows.find((row) => row.id === id)?.label ?? id;
}

//#endregion
//#region src/client/compositor.ts
/**
* Install the composer translation layer on one document.
* @param platform - receiving device, selecting the `primary` expansion.
* @returns the translation layer.
*/
function installComposerRemap(platform) {
	/** Physical combination key (see `bindingKey`) to its mapping. */
	let byCombination = /* @__PURE__ */ new Map();
	/** Physical combination key to the command whose chosen key swallows it. */
	let swallowed = /* @__PURE__ */ new Map();
	const synthesized = /* @__PURE__ */ new WeakSet();
	const rebuild = (bindings, residue = []) => {
		const combinations = /* @__PURE__ */ new Map();
		const hidden = /* @__PURE__ */ new Map();
		/** Every combination this profile writes, whichever row wrote it. */
		const resolvedKeys = new Set(residue.map((binding) => bindingKey(normalizeBinding(binding, platform))));
		/** Actions the user rebound, by command. */
		const rebound = /* @__PURE__ */ new Map();
		/** Actions the user cleared outright. */
		const cleared = /* @__PURE__ */ new Set();
		const resolved = composerOverrides(bindings, platform);
		for (const command of COMPOSER_COMMANDS) {
			const chosen = resolved[command];
			if (chosen === void 0) continue;
			if (chosen === null) {
				cleared.add(command);
				continue;
			}
			rebound.set(command, chosen);
			combinations.set(bindingKey(normalizeBinding(chosen, platform)), {
				binding: chosen,
				gesture: gestureFor(command, platform)
			});
		}
		const claimed = new Set([...combinations.keys(), ...resolvedKeys]);
		for (const command of COMPOSER_COMMANDS) {
			const replacement = rebound.get(command);
			if (replacement === void 0 && !cleared.has(command)) continue;
			if (replacement !== void 0 && composerAccepts(command, replacement, platform)) continue;
			for (const binding of composerDefaults(command, platform)) {
				const key = bindingKey(binding);
				if (claimed.has(key)) continue;
				hidden.set(key, command);
			}
		}
		for (const [key, mapping] of combinations) {
			const owner = COMPOSER_COMMANDS.find((command) => composerAccepts(command, mapping.binding, platform));
			if (owner === void 0 || rebound.has(owner) || cleared.has(owner)) continue;
			if (claimed.has(key)) continue;
			hidden.set(key, owner);
		}
		byCombination = combinations;
		swallowed = hidden;
	};
	rebuild({});
	const onKeyDown = (event) => {
		if (event.isComposing || event.repeat || synthesized.has(event)) return;
		const target = event.target;
		if (target === null || target.nodeType !== 1) return;
		const composer = target.closest("[data-composer-input]");
		if (composer === null) return;
		const combination = combinationOf(event);
		if (combination === null) return;
		const mapping = byCombination.get(combination);
		if (mapping === void 0) {
			if (swallowed.has(combination)) suppress(event);
			return;
		}
		suppress(event);
		const substituted = new ((composer.ownerDocument?.defaultView)?.KeyboardEvent ?? KeyboardEvent)("keydown", {
			key: "Enter",
			code: mapping.binding.code,
			bubbles: true,
			cancelable: true,
			...modifierFlags(mapping.gesture)
		});
		synthesized.add(substituted);
		composer.dispatchEvent(substituted);
	};
	document.addEventListener("keydown", onKeyDown, true);
	return {
		update: (bindings, residue) => {
			rebuild(bindings, residue);
		},
		dispose: () => {
			document.removeEventListener("keydown", onKeyDown, true);
		}
	};
}
/**
* Read the physical combination a keyboard event carries.
* @param event - the live event.
* @returns the combination key, or null when the event cannot be matched.
*/
function combinationOf(event) {
	if (event.code === "") return null;
	const modifiers = [];
	if (event.ctrlKey) modifiers.push("control");
	if (event.altKey) modifiers.push("alt");
	if (event.shiftKey) modifiers.push("shift");
	if (event.metaKey) modifiers.push("meta");
	return [...[
		"control",
		"alt",
		"shift",
		"meta"
	].filter((value) => modifiers.includes(value)), event.code].join("+");
}
/**
* Build the modifier flags for a synthesized gesture.
* @param gesture - the physical modifiers the gesture performs.
* @returns the KeyboardEvent init flags.
*/
function modifierFlags(gesture) {
	return {
		ctrlKey: gesture.includes("control"),
		altKey: gesture.includes("alt"),
		shiftKey: gesture.includes("shift"),
		metaKey: gesture.includes("meta")
	};
}
/**
* Withdraw one gesture from every other listener.
* @param event - the live event to suppress.
*/
function suppress(event) {
	event.preventDefault();
	event.stopPropagation();
}

//#endregion
//#region src/client/document.ts
/** Local storage key holding the plugin document. */
const KEYMAP_STORAGE_KEY = "dsh-better-keymap.keybindings.v1";
/** Marker distinguishing the plugin's document from unrelated data under the same key. */
const DOCUMENT_MARKER = "dsh-better-keymap";
/**
* An empty document: every command inherits the product default.
* @returns a document with no profile overrides.
*/
function emptyDocument() {
	return {
		schemaVersion: 1,
		profiles: {}
	};
}
/**
* Read one profile's overrides.
* @param document - accepted document.
* @param profile - runtime and platform whose overrides apply.
* @returns the override record, empty when the profile was never edited.
*/
function profileOverrides(document$1, profile) {
	return document$1.profiles[profile] ?? {};
}
/**
* Count the overrides a profile currently holds, for the UI's customized badge.
* @param document - accepted document.
* @param profile - runtime and platform whose overrides apply.
* @returns the number of explicitly edited commands.
*/
function overrideCount(document$1, profile) {
	return Object.keys(profileOverrides(document$1, profile)).length;
}
/**
* Split one profile's overrides into the composer actions the plugin intercepts
* and the product commands it mirrors.
*
* The distinction is the write path: a product command is mirrored into the
* product's own keybindings, while a composer action is enforced by the
* plugin's key translation and must never be sent to the product, whose
* keybinding document does not know that id.
* @param overrides - one profile's override record.
* @param isComposer - predicate naming the intercepted ids.
* @returns the two subsets.
*/
function partitionOverrides(overrides, isComposer) {
	const composer = {};
	const product = {};
	for (const [id, binding] of Object.entries(overrides)) if (isComposer(id)) composer[id] = binding;
	else product[id] = binding;
	return {
		composer,
		product
	};
}
/**
* Apply one override without touching other profiles.
* @param document - accepted document.
* @param profile - runtime and platform being edited.
* @param id - command whose binding is written.
* @param binding - the new binding, or null to clear it.
* @returns the candidate document.
*/
function withOverride(document$1, profile, id, binding) {
	return {
		schemaVersion: 1,
		profiles: {
			...document$1.profiles,
			[profile]: {
				...profileOverrides(document$1, profile),
				[id]: binding
			}
		}
	};
}
/**
* Drop one command's override so it inherits the product default again.
* @param document - accepted document.
* @param profile - runtime and platform being edited.
* @param id - command whose override is removed.
* @returns the candidate document.
*/
function withoutOverride(document$1, profile, id) {
	const { [id]: _removed,...remaining } = profileOverrides(document$1, profile);
	return {
		schemaVersion: 1,
		profiles: {
			...document$1.profiles,
			[profile]: remaining
		}
	};
}
/**
* Replace every override in one profile at once, used by restore-all and by
* binding sweeping.
* @param document - accepted document.
* @param profile - runtime and platform being edited.
* @param overrides - the complete replacement override record.
* @returns the candidate document.
*/
function withProfile(document$1, profile, overrides) {
	return {
		schemaVersion: 1,
		profiles: {
			...document$1.profiles,
			[profile]: overrides
		}
	};
}
/**
* Decode a stored document without losing dormant overrides for other profiles.
* @param raw - stored JSON text, or null when nothing was written yet.
* @returns the accepted document, or a classified read failure.
*/
function parseKeymapDocument(raw) {
	if (raw === null) return {
		status: "ready",
		document: emptyDocument()
	};
	try {
		const value = JSON.parse(raw);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return { status: "invalid" };
		const record = value;
		if (record.plugin !== DOCUMENT_MARKER || record.schemaVersion !== 1) return { status: "invalid" };
		if (typeof record.profiles !== "object" || record.profiles === null || Array.isArray(record.profiles)) return { status: "invalid" };
		const profiles = {};
		for (const [profile, overrides] of Object.entries(record.profiles)) {
			if (!KEY_PROFILES.includes(profile)) return { status: "invalid" };
			if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) return { status: "invalid" };
			const bindings = {};
			for (const [id, binding] of Object.entries(overrides)) bindings[id] = parseBinding(binding);
			profiles[profile] = bindings;
		}
		return {
			status: "ready",
			document: {
				schemaVersion: 1,
				profiles
			}
		};
	} catch (_error) {
		return { status: "invalid" };
	}
}
/**
* Serialize a document for storage.
* @param document - accepted document.
* @returns the exact text to persist.
*/
function serializeKeymapDocument(document$1) {
	const profiles = {};
	for (const profile of KEY_PROFILES) {
		const overrides = document$1.profiles[profile];
		if (overrides !== void 0 && Object.keys(overrides).length > 0) profiles[profile] = overrides;
	}
	return `${JSON.stringify({
		plugin: DOCUMENT_MARKER,
		schemaVersion: 1,
		profiles
	}, null, 2)}\n`;
}
/**
* Open the browser's local storage for the plugin key.
* @returns a storage port, or undefined when the page denies storage access.
*/
function browserKeymapStorage() {
	try {
		const probe = window.localStorage;
		probe.getItem(KEYMAP_STORAGE_KEY);
		return {
			read: () => probe.getItem(KEYMAP_STORAGE_KEY),
			write: (raw) => {
				probe.setItem(KEYMAP_STORAGE_KEY, raw);
			}
		};
	} catch (_error) {
		return;
	}
}
/**
* Keep the document in memory when no durable storage is available.
* @returns a storage port whose writes never reach disk.
*/
function memoryKeymapStorage() {
	let raw = null;
	return {
		read: () => raw,
		write: (next) => {
			raw = next;
		}
	};
}

//#endregion
//#region src/client/controller.ts
/**
* Owns the document and reconciles it into the product.
*/
var KeymapController = class {
	document = emptyDocument();
	status = "loading";
	syncing = false;
	/** Model published in the most recent snapshot; rebuilt by every `publish`. */
	modelCache = emptyCatalog();
	snapshot = {
		document: this.document,
		status: "loading",
		model: this.modelCache,
		customized: 0
	};
	listeners = /* @__PURE__ */ new Set();
	storage;
	product;
	/** Key translation for the three composer gestures, kept in step on every publish. */
	composer;
	/** Set by `persist` when the accepted document did not reach durable storage. */
	persistFailed = false;
	/** Profiles whose stored bytes could not be decoded; editing stays disabled for them. */
	unreadable = /* @__PURE__ */ new Set();
	/**
	* @param product - live product shortcuts service.
	* @param storage - preference port; omitted to use the page's own storage, or
	* an in-memory one when the page denies access.
	*/
	constructor(product, storage) {
		this.product = product;
		this.storage = storage ?? browserKeymapStorage() ?? memoryKeymapStorage();
	}
	/**
	* Install the composer translation layer.
	*
	* Separate from the constructor because it touches the document, and a
	* controller built for a test may have no document at all.
	* @returns nothing; the layer is released by detachComposerRemap.
	*/
	attachComposerRemap() {
		this.composer ??= installComposerRemap(this.product.platform);
		this.pushComposer();
	}
	/**
	* Hand the translation layer the current profile's assignments.
	*
	* Two sets go over: the composer actions' own overrides, and every other
	* combination this profile writes. The second is what tells the layer to leave
	* a key alone once a product command has taken it from an input gesture;
	* without it the layer would keep swallowing that key inside the input box,
	* and the command would never fire there.
	*/
	pushComposer() {
		if (this.composer === void 0) return;
		const { composer, product } = partitionOverrides(profileOverrides(this.document, this.profile), isComposerCommand);
		this.composer.update(composer, Object.values(product).filter((binding) => binding !== null));
	}
	/**
	* Release the composer translation layer.
	* @returns nothing; the layer is forgotten and must be re-attached to be used.
	*/
	detachComposerRemap() {
		this.composer?.dispose();
		this.composer = void 0;
	}
	/** Current runtime and platform profile key. */
	get profile() {
		return `${this.product.runtime}:${this.product.platform}`;
	}
	/** Receiving device, selecting the `primary` expansion and keycap symbols. */
	get platform() {
		return this.product.platform;
	}
	/** Receiving shell, selecting the default profile and browser-key admissions. */
	get runtime() {
		return this.product.runtime;
	}
	/**
	* Read stored preferences and reconcile product bindings.
	* @returns after the first accepted snapshot is published.
	*/
	async start() {
		const parsed = parseKeymapDocument(this.storage.read());
		if (parsed.status === "invalid") {
			this.status = "unreadable";
			this.unreadable.add(this.profile);
		} else {
			this.document = parsed.document;
			this.status = "ready";
		}
		this.publish();
		await this.reconcile();
	}
	/**
	* Observe the plugin's state channel.
	* @param listener - callback invoked after every accepted change.
	* @returns disposer releasing the listener.
	*/
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	/**
	* Read the current snapshot; the reference is stable between changes.
	* @returns the plugin's state.
	*/
	getSnapshot() {
		return this.snapshot;
	}
	/** Live product catalog rows. */
	get catalog() {
		return this.product.catalog.getSnapshot();
	}
	/** Live product fixed rows. */
	get fixedCatalog() {
		return this.product.fixedCatalog.getSnapshot();
	}
	/**
	* Derive the full display model for the current profile.
	* @returns rows, the editable set, the held combinations, and the reservations.
	*/
	model() {
		return buildCatalog(this.catalog, this.fixedCatalog, profileOverrides(this.document, this.profile), this.product.runtime, this.product.platform);
	}
	/**
	* Describe a candidate combination for the recorder, under the plugin's rules.
	*
	* The order of the checks matches `applySet` and `applyComposer` exactly, so
	* the recorder can never show a combination as acceptable and then have the
	* commit refuse it: the promise the user reads before releasing the keys is
	* the outcome they get.
	*
	* The two paths reach the same verdicts in a different order — the commits ask
	* the plugin's own reservation rules first and the product second, while this
	* asks the product first because it must normalize the candidate before it can
	* test anything about it. What matters is that no combination is accepted here
	* and refused there.
	* @param binding - candidate combination, or null for an unbound command.
	* @param exceptId - command being recorded, excluded from its own displacement list.
	* @returns the normalized binding, its keycaps, any hard rejection, and the
	* editable commands it would displace.
	*/
	describeBinding(binding, exceptId = "") {
		const composer = isComposerCommand(exceptId);
		const described = this.product.describeBinding(binding);
		if (described.binding === null) return {
			binding: null,
			keys: described.keys,
			issue: described.issue,
			conflicts: [],
			reserved: []
		};
		if (binding === null) return {
			binding: described.binding,
			keys: described.keys,
			issue: described.issue,
			conflicts: [],
			reserved: []
		};
		const reserved = reservedBindingIssue(binding, composer);
		if (reserved !== null) return {
			binding: described.binding,
			keys: described.keys,
			issue: reserved,
			conflicts: [],
			reserved: []
		};
		if (composer) {
			const problem = composerKeyProblem(binding);
			if (problem !== null) return {
				binding: described.binding,
				keys: described.keys,
				issue: problem,
				conflicts: [],
				reserved: []
			};
		}
		const model = this.model();
		return {
			binding: described.binding,
			keys: described.keys,
			issue: described.issue,
			conflicts: displacedBindings(model, described.binding, exceptId).map((entry) => entry.id),
			reserved: [...reservedByFixed(model, described.binding)]
		};
	}
	/**
	* Forward desktop recording protection to the product bridge.
	* @param active - whether a recorder currently owns keyboard input.
	*/
	recording(active) {
		return this.product.recording(active);
	}
	/**
	* Apply one reviewed edit under the plugin's arbitration.
	*
	* Setting a combination clears every editable row that currently holds it,
	* then writes the new binding. A combination a frozen fixed action holds is
	* refused instead, and the refusal names those actions.
	*
	* `applyComposer` below is the same algorithm for the three input gestures.
	* The two stay separate because their middle steps genuinely differ: a gesture
	* is validated against the translation layer's own limits and never reaches
	* the product, while a command is validated by the product and is written
	* through it. Sharing the tail would hide that difference rather than remove
	* it.
	* @param edit - the requested operation.
	* @param id - command the operation targets, absent for `reset-all`.
	* @returns the outcome plus every displacement the user must be told about.
	*/
	async apply(edit, id) {
		if (this.status !== "ready" || this.unreadable.has(this.profile)) return {
			status: "unreadable",
			displaced: []
		};
		this.persistFailed = false;
		const result = await this.dispatch(edit);
		return this.persistFailed && result.status === "saved" ? {
			...result,
			status: "write-failed"
		} : result;
	}
	async dispatch(edit) {
		switch (edit.type) {
			case "set": return await this.applySet(edit.id, edit.binding);
			case "reset": return await this.applyReset(edit.id);
			case "reset-all": return await this.applyResetAll();
		}
	}
	/**
	* Bind one composer gesture.
	*
	* The gesture's own id is never written to the product: it has no editable
	* command there, so its key is enforced by the translation layer instead. The
	* rows it displaces *are* written, because a product command that loses the
	* combination has to be released through the product like any other. A cleared
	* gesture keeps its row and simply dispatches nothing.
	*/
	async applyComposer(target, binding) {
		if (binding === null) {
			this.document = withOverride(this.document, this.profile, target, null);
			this.persist();
			return {
				status: "saved",
				displaced: []
			};
		}
		const reservedComposer = reservedBindingIssue(binding, true);
		if (reservedComposer !== null) return {
			status: "conflict",
			displaced: [],
			issue: reservedComposer
		};
		const described = this.product.describeBinding(binding);
		if (described.binding === null) return {
			status: "conflict",
			displaced: []
		};
		if (described.issue !== null) return {
			status: "conflict",
			displaced: [],
			issue: described.issue
		};
		const problem = composerKeyProblem(binding);
		if (problem !== null) return {
			status: "conflict",
			displaced: [],
			issue: problem
		};
		const model = this.model();
		const frozen = reservedByFixed(model, described.binding);
		if (frozen.length > 0) return {
			status: "conflict",
			displaced: [],
			conflicts: frozen.map((other) => labelOf(model, other))
		};
		const holders = displacedBindings(model, described.binding, target);
		const displaced = holders.map((other) => ({
			id: other.id,
			label: labelOf(model, other.id),
			keys: presentBinding(other.binding, this.product.platform).keys
		}));
		const released = await this.release(holders.filter((other) => !isComposerCommand(other.id)));
		if ("failed" in released) return {
			status: released.failed,
			displaced: []
		};
		let next = this.document;
		for (const other of holders) next = withOverride(next, this.profile, other.id, null);
		next = withOverride(next, this.profile, target, normalizeBinding(binding, this.product.platform));
		this.document = next;
		this.persist();
		return {
			status: "saved",
			displaced
		};
	}
	async applySet(target, binding) {
		if (isComposerCommand(target)) return await this.applyComposer(target, binding);
		if (binding === null) {
			const product = await this.write({
				type: "set",
				id: target,
				binding: null
			});
			if (product.status !== "saved") return {
				status: product.status,
				displaced: []
			};
			this.document = withOverride(this.document, this.profile, target, null);
			this.persist();
			return {
				status: "saved",
				displaced: []
			};
		}
		const reservedCommand = reservedBindingIssue(binding, false);
		if (reservedCommand !== null) return {
			status: "conflict",
			displaced: [],
			issue: reservedCommand
		};
		const described = this.product.describeBinding(binding);
		if (described.binding === null) return {
			status: "conflict",
			displaced: []
		};
		if (described.issue !== null) return {
			status: "conflict",
			displaced: [],
			issue: described.issue
		};
		const normalized = described.binding;
		const model = this.model();
		const reserved = reservedByFixed(model, normalized);
		if (reserved.length > 0) return {
			status: "conflict",
			displaced: [],
			conflicts: reserved.map((other) => labelOf(model, other))
		};
		const holders = displacedBindings(model, normalized, target);
		const displaced = holders.map((other) => ({
			id: other.id,
			label: labelOf(model, other.id),
			keys: presentBinding(other.binding, this.product.platform).keys
		}));
		const outcome = await this.writeWithRelease(target, normalized, holders.filter((other) => !isComposerCommand(other.id)));
		if (outcome !== "saved") return {
			status: outcome,
			displaced: []
		};
		let next = this.document;
		for (const other of holders) next = withOverride(next, this.profile, other.id, null);
		next = withOverride(next, this.profile, target, normalized);
		this.document = next;
		this.persist();
		return {
			status: "saved",
			displaced
		};
	}
	async applyReset(target) {
		if (isComposerCommand(target)) {
			this.document = withoutOverride(this.document, this.profile, target);
			this.persist();
			return {
				status: "saved",
				displaced: []
			};
		}
		const written = await this.write({
			type: "reset",
			id: target
		});
		if (written.status !== "saved") return {
			status: written.status,
			displaced: []
		};
		this.document = withoutOverride(this.document, this.profile, target);
		this.persist();
		return {
			status: "saved",
			displaced: []
		};
	}
	async applyResetAll() {
		const written = await this.write({ type: "reset-all" });
		if (written.status !== "saved") return {
			status: written.status,
			displaced: []
		};
		this.document = withProfile(this.document, this.profile, {});
		this.persist();
		return {
			status: "saved",
			displaced: []
		};
	}
	/**
	* Reconcile the product's bindings with the plugin document.
	*
	* Runs after a change from outside the plugin (another install, a restored
	* file, or a command that mounted later). Only differing commands are
	* written, so an already-matching product document is left untouched.
	* @returns after every differing command has been written, or after the first
	* failure to write one.
	*/
	async reconcile() {
		if (this.status !== "ready" || this.unreadable.has(this.profile)) return;
		const overrides = profileOverrides(this.document, this.profile);
		if (Object.keys(overrides).length === 0) return;
		this.syncing = true;
		this.publish();
		try {
			const model = this.model();
			for (const row of model.rows) {
				if (row.kind !== "owned" || !row.customized) continue;
				const product = this.catalog.find((entry) => entry.id === row.id);
				if (product === void 0) continue;
				if (sameBinding(product.binding, row.binding)) continue;
				await this.write({
					type: "set",
					id: row.id,
					binding: row.binding
				});
			}
		} finally {
			this.syncing = false;
			this.publish();
		}
	}
	async write(edit) {
		const revision = this.product.config.getSnapshot().revision;
		return await this.product.edit(edit, revision);
	}
	/**
	* Release every holder, undoing the releases if any of them fails.
	*
	* A failure part-way through would otherwise leave the product with a holder
	* cleared while the plugin document still records it — a divergence the user
	* sees as a binding that came back, and that `reconcile` would write back over
	* whatever the product holds on the next start. So every release is undone
	* before the failure is reported: either the operation lands, or nothing about
	* it does.
	* @param holders - the product commands currently holding the combination.
	* @returns the first failure, or the pre-operation catalog when every holder
	* was released.
	*/
	async release(holders) {
		const before = this.catalog.map((row) => ({ ...row }));
		const released = [];
		for (const holder of holders) {
			const cleared = await this.write({
				type: "set",
				id: holder.id,
				binding: null
			});
			if (cleared.status !== "saved") {
				await this.restore(released, before);
				return { failed: cleared.status };
			}
			released.push(holder.id);
		}
		return { before };
	}
	/**
	* Release every holder through the product, then take the combination.
	* @param target - the command taking the combination.
	* @param binding - the combination to take.
	* @param holders - the product commands currently holding it.
	* @returns the outcome of the release or of the assignment.
	*/
	async writeWithRelease(target, binding, holders) {
		const outcome = await this.release(holders);
		if ("failed" in outcome) return outcome.failed;
		const taken = await this.write({
			type: "set",
			id: target,
			binding
		});
		if (taken.status !== "saved") {
			await this.restore(holders.map((holder) => holder.id), outcome.before);
			return taken.status;
		}
		return "saved";
	}
	/**
	* Put released bindings back, best effort.
	*
	* The plugin's document still holds the pre-operation state at this point, so
	* `before` — read before the first write — is the authority for what to
	* restore. A restore that fails is logged rather than reported: the user
	* already has the failure of the operation itself, and `reconcile` will settle
	* the difference on the next start.
	* @param released - command ids already cleared in the product.
	* @param before - the product catalog as it was before the operation began.
	* @returns after every restore has been attempted.
	*/
	async restore(released, before) {
		for (const id of released) {
			const previous = before.find((row) => row.id === id)?.binding ?? null;
			if ((await this.write({
				type: "set",
				id,
				binding: previous
			})).status !== "saved") console.error(`dsh-better-keymap: could not restore ${id} after a failed assignment`);
		}
	}
	/**
	* Persist the accepted document.
	* @returns whether the document reached durable storage.
	*/
	persist() {
		let stored = true;
		try {
			this.storage.write(serializeKeymapDocument(this.document));
		} catch (error) {
			console.warn("dsh-better-keymap: preference write failed", error);
			stored = false;
		}
		if (!stored) this.persistFailed = true;
		this.publish();
		return stored;
	}
	/**
	* Rebuild the snapshot after the product catalog, locale, or command roster
	* changed. The reference calls this from its own subscriptions.
	* @returns nothing; subscribers are notified as part of it.
	*/
	refresh() {
		this.publish();
	}
	publish() {
		const overrides = profileOverrides(this.document, this.profile);
		this.modelCache = buildCatalog(this.catalog, this.fixedCatalog, overrides, this.product.runtime, this.product.platform);
		this.pushComposer();
		this.snapshot = {
			document: this.document,
			status: this.status,
			model: this.modelCache,
			customized: overrideCount(this.document, this.profile)
		};
		for (const listener of [...this.listeners]) try {
			listener();
		} catch (error) {
			console.error("dsh-better-keymap: subscriber failed", error);
		}
	}
};
/**
* Reject a combination this layer cannot translate.
*
* A composer gesture is synthesized from the chosen key, so the key has to be a
* plain one: a two-key chord has no single physical press to substitute, and
* `Tab` belongs to the shell's focus traversal. Everything else — including a
* bare letter or punctuation key — is the user's call; which combinations stay
* out of reach is decided once, by `reservedBindingIssue`.
* @param binding - the candidate combination.
* @returns the rejection reason, or null when the combination is usable.
*/
function composerKeyProblem(binding) {
	if (binding.secondCode !== void 0) return "unsupported-key";
	if (binding.code === "Tab") return "reserved";
	return null;
}

//#endregion
//#region src/client/Icons.tsx
/** Reference-control and feedback artwork, colored by the owning UI. */
const artwork = {
	edit: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7.4553 1.01221C8.02829 0.676881 8.73746 0.676959 9.31048 1.01221C9.52928 1.14026 9.72631 1.34353 9.98255 1.59978C10.2388 1.85601 10.4421 2.05305 10.5701 2.27185C10.9053 2.84485 10.9054 3.55407 10.5701 4.12703C10.4421 4.34576 10.2387 4.54293 9.98255 4.7991L4.99422 9.78744C4.71024 10.0714 4.50494 10.2832 4.2488 10.4324C3.99266 10.5815 3.70709 10.6557 3.32001 10.7625L2.43268 11.0072C2.08118 11.1042 1.75876 11.1948 1.50071 11.2265C1.2387 11.2585 0.884455 11.2512 0.607798 10.9745C0.331166 10.6979 0.323805 10.3436 0.35587 10.0816C0.387501 9.82358 0.47815 9.50112 0.575111 9.14964L0.819864 8.26232C0.926638 7.87525 1.00083 7.58966 1.14992 7.33353C1.2991 7.07739 1.5109 6.87209 1.79489 6.58811L6.78322 1.59978C7.03941 1.34359 7.23656 1.14027 7.4553 1.01221ZM11.6568 11.13H5.6639L6.72503 10.0689H11.6568V11.13ZM2.54509 7.33831C2.22348 7.65993 2.13155 7.75784 2.06755 7.86768C2.0036 7.97757 1.96369 8.10606 1.84272 8.54454L1.59797 9.43187C1.5011 9.78304 1.44118 10.0065 1.4162 10.1653C1.57504 10.1404 1.79876 10.0814 2.15046 9.98436L3.03779 9.7396C3.47631 9.61863 3.60475 9.57874 3.71464 9.51478C3.82448 9.45077 3.92239 9.35885 4.24401 9.03723L8.04047 5.23998L6.34155 3.54106L2.54509 7.33831ZM8.77473 1.92824C8.53277 1.78664 8.233 1.78664 7.99104 1.92824C7.91987 1.97 7.83628 2.04713 7.53343 2.34998L7.09176 2.79085L8.79068 4.48977L9.23235 4.0489C9.53517 3.74608 9.61232 3.66245 9.65409 3.59128C9.79567 3.34935 9.79564 3.04954 9.65409 2.8076C9.61237 2.73635 9.53565 2.65329 9.23235 2.34998C8.92899 2.04662 8.84598 1.96995 8.77473 1.92824Z" }) }),
	error: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8.90039 3.97328V9.07973H7.09961V3.97328H8.90039Z" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8.90039 10.341V12.3654H7.09961V10.341H8.90039Z" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z" })
	] }),
	success: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z" })] })
};
/**
* Render reference artwork at its supplied size.
* @param kind - which glyph to draw.
* @param className - optional color class supplied by the owning UI.
* @returns an ornamental SVG hidden from assistive technology.
*/
function KeymapIcon({ kind, className }) {
	const size = kind === "edit" ? 12 : 16;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		width: size,
		height: size,
		viewBox: `0 0 ${size} ${size}`,
		fill: "currentColor",
		className,
		"aria-hidden": "true",
		children: artwork[kind]
	});
}
/**
* Render the magnifier used by the reference search field.
* @returns an ornamental SVG hidden from assistive technology.
*/
function SearchIcon() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		width: "14",
		height: "14",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M10.28 5.86536C10.28 3.41381 8.29245 1.42644 5.84094 1.42627C3.38929 1.42627 1.40186 3.4137 1.40186 5.86536C1.40203 8.31686 3.38939 10.3044 5.84094 10.3044C8.29234 10.3043 10.2799 8.31676 10.28 5.86536ZM11.4174 5.86536C11.4172 8.94498 8.92057 11.4416 5.84094 11.4418C2.76117 11.4418 0.263843 8.94509 0.263672 5.86536C0.263672 2.78548 2.76106 0.288086 5.84094 0.288086C8.92067 0.288258 11.4174 2.78559 11.4174 5.86536Z",
			fill: "currentColor"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M13.7372 12.9078L12.9323 13.7127L9.9732 10.7536L10.7781 9.94867L13.7372 12.9078Z",
			fill: "currentColor"
		})]
	});
}

//#endregion
//#region src/client/notices.ts
/**
* Describe the plugin document's read failure and the recovery path.
* @param t - keymap dictionary.
* @returns localized recovery guidance.
*/
function readFailure(t) {
	return `${t("invalid", {
		location: t("plugin-document"),
		reload: t("web-reload")
	})} ${t("using-defaults")}`;
}
/**
* Turn one failed outcome into the sentence the user reads.
*
* Three sources are consulted, in this order:
*
* 1. `message`, a sentence the recorder resolved itself — it is the only source
*    that can name the key that was refused;
* 2. `issue`, the product's or the plugin's own classification;
* 3. `status`, the controller's verdict when neither of the above is present.
*
* Reading only the status is what produced the empty "occupied by nobody"
* notice: a refusal knows which key it refused, and that knowledge has to
* survive the trip to the screen.
* @param result - the failed save result.
* @param t - keymap dictionary.
* @returns localized diagnosis.
*/
function failureText(result, t) {
	if (result.message !== void 0 && result.message !== "") return result.message;
	if (result.issue !== void 0) return t(result.issue);
	if (result.status === "conflict" && result.conflicts !== void 0 && result.conflicts.length > 0) return t("reserved-conflict", { commands: result.conflicts.join("、") });
	return result.status === "stale" ? t("stale") : result.status === "write-failed" ? t("write-failed") : result.status === "not-ready" ? t("not-ready") : result.status === "unreadable" ? readFailure(t) : t("saved");
}

//#endregion
//#region \0dsh-keymap-css:src/client/Reference.module.css?compiled
const css = ".CLWJ4a_setting,.CLWJ4a_row,.CLWJ4a_binding{justify-content:space-between;align-items:center;gap:8px;display:flex}.CLWJ4a_setting{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);min-height:60px;padding:16px 0}.CLWJ4a_settingText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.CLWJ4a_settingTitle{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}.CLWJ4a_settingDescription{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}.CLWJ4a_button{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);min-width:90px;max-width:280px;height:36px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;white-space:nowrap;border:none;flex-shrink:0;justify-content:center;align-items:center;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.CLWJ4a_button:hover{background:var(--dsw-alias-interactive-bg-hover)}.CLWJ4a_dialog{box-sizing:border-box;border-radius:24px;gap:0;width:min(480px,100%);height:600px;max-height:calc(100dvh - 108px);padding:0;transform:translateY(30px);box-shadow:0 0 1px #0003,0 0 4px #00000005,0 12px 32px #00000014}.CLWJ4a_dialog:focus{outline:none}.CLWJ4a_contents{flex-direction:column;flex:1;min-height:0;display:flex}.CLWJ4a_header{box-sizing:border-box;flex:0 0 46px;padding:22px 54px 0 24px;position:relative}.CLWJ4a_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}.CLWJ4a_close{width:28px;height:28px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:0;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex;position:absolute;top:20px;right:14px}.CLWJ4a_close:hover{background:var(--dsw-alias-interactive-bg-hover)}.CLWJ4a_searchRow{box-sizing:border-box;flex:0 0 60px;align-items:center;padding:14px 20px 10px;display:flex}.CLWJ4a_searchField{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-markdown-code-block);border-radius:12px;align-items:center;gap:8px;width:100%;height:36px;padding:8px 14px;display:flex}.CLWJ4a_searchIcon{color:var(--dsw-alias-label-caption);flex:none}.CLWJ4a_search{width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:inherit;background:0 0;border:0;outline:none;padding:0;font-size:13px;line-height:18px}.CLWJ4a_search::placeholder{color:var(--dsw-alias-label-tertiary);opacity:1}.CLWJ4a_search::-webkit-search-cancel-button{-webkit-appearance:none}.CLWJ4a_clearSearch{box-sizing:border-box;border:.5px solid var(--dsw-alias-label-tertiary);corner-shape:round;width:16px;height:16px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.CLWJ4a_clearSearch:hover{background:var(--dsw-alias-interactive-bg-hover)}.CLWJ4a_clearSearch:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.CLWJ4a_list{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);overscroll-behavior:contain;flex:1;min-height:0;padding:0 16px 18px;overflow-y:auto}.CLWJ4a_footer{border-top:.5px solid var(--dsw-alias-border-l2);flex:none;justify-content:space-between;align-items:center;gap:12px;min-height:52px;padding:0 24px;font-size:12px;line-height:18px;display:flex}.CLWJ4a_resetAll{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;border-radius:4px;align-items:center;gap:8px;padding:6px 0;display:inline-flex}.CLWJ4a_resetAll:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.CLWJ4a_resetAll:disabled{cursor:default;opacity:.45}.CLWJ4a_modifiedCount{color:var(--dsw-alias-label-tertiary)}.CLWJ4a_group{color:var(--dsw-alias-label-tertiary);margin:18px 8px 4px;font-size:12px;font-weight:400;line-height:18px}.CLWJ4a_rows{margin:0;padding:0;list-style:none}.CLWJ4a_row{border-radius:var(--dsw-radius-md);box-sizing:border-box;min-height:42px;color:var(--dsw-alias-label-primary);padding:8px;font-size:13px;line-height:18px;position:relative}.CLWJ4a_binding{pointer-events:none;flex-shrink:0;position:relative}.CLWJ4a_binding:has(.CLWJ4a_inlineEditor){pointer-events:auto;max-width:100%}.CLWJ4a_commandLabel{pointer-events:none;text-overflow:ellipsis;white-space:nowrap;min-width:0;position:relative;overflow:hidden}.CLWJ4a_hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}p.CLWJ4a_hint{margin:6px 0}.CLWJ4a_rowActions{width:20px;height:26px;color:var(--dsw-alias-label-tertiary);opacity:0;justify-content:center;align-items:center;display:inline-flex}.CLWJ4a_row:hover .CLWJ4a_rowActions,.CLWJ4a_row:has(:focus-visible) .CLWJ4a_rowActions{opacity:1}.CLWJ4a_inlineAction:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:4px}.CLWJ4a_rowButton{border-radius:inherit;cursor:pointer;background:0 0;border:0;width:100%;height:100%;position:absolute;inset:0}.CLWJ4a_row:has(.CLWJ4a_rowButton:enabled):hover{background:var(--dsw-alias-interactive-bg-hover)}.CLWJ4a_rowButton:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}.CLWJ4a_binding .CLWJ4a_keyBadge{color:var(--dsw-alias-label-secondary)}.CLWJ4a_binding .CLWJ4a_fixedKeyBadge{height:26px;color:var(--dsw-alias-label-tertiary)}.CLWJ4a_keyBadge{box-sizing:border-box;background:var(--dsw-alias-bg-module-platform);border-radius:10px;justify-content:center;height:26px;padding:0 12px}.CLWJ4a_unbound{box-sizing:border-box;background:var(--dsw-alias-bg-module-platform);height:26px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;border-radius:10px;justify-content:center;align-items:center;padding:6px 16px;font-size:12px;line-height:14px;display:inline-flex}.CLWJ4a_inlineEditor{flex-direction:column;align-items:flex-end;gap:6px;display:flex}.CLWJ4a_inlineControls{justify-content:flex-end;align-items:center;gap:8px;display:flex}.CLWJ4a_inlineAction{color:var(--dsw-alias-label-tertiary);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;padding:0;font-size:12px;line-height:18px}.CLWJ4a_recorder{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-module-platform);min-width:96px;height:26px;color:var(--dsw-alias-label-secondary);font:inherit;white-space:nowrap;cursor:pointer;border-radius:10px;justify-content:center;align-items:center;padding:3px 14px;font-size:12px;line-height:18px;display:inline-flex}.CLWJ4a_recorder:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.CLWJ4a_recorder.CLWJ4a_invalid{border:1px solid var(--dsw-alias-state-error-primary);box-shadow:none}.CLWJ4a_recorded{height:auto;color:inherit;background:0 0;padding:0}.CLWJ4a_toastSuccess{color:var(--dsw-alias-state-success-secondary)}.CLWJ4a_toastError{color:var(--dsw-alias-state-warn-secondary)}.CLWJ4a_srOnly{clip-path:inset(50%);white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}@media (hover:none){.CLWJ4a_rowActions{opacity:1}}.CLWJ4a_button:disabled,.CLWJ4a_rowButton:disabled,.CLWJ4a_inlineAction:disabled,.CLWJ4a_recorder[aria-disabled=true]{cursor:default;opacity:.45}.CLWJ4a_displace{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:12px;line-height:18px;display:flex}";
const tagId = "dsh-better-keymap/Reference.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-better-keymap";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
var Reference_module_default = {
	"binding": "CLWJ4a_binding",
	"button": "CLWJ4a_button",
	"clearSearch": "CLWJ4a_clearSearch",
	"close": "CLWJ4a_close",
	"commandLabel": "CLWJ4a_commandLabel",
	"contents": "CLWJ4a_contents",
	"dialog": "CLWJ4a_dialog",
	"displace": "CLWJ4a_displace",
	"fixedKeyBadge": "CLWJ4a_fixedKeyBadge",
	"footer": "CLWJ4a_footer",
	"group": "CLWJ4a_group",
	"header": "CLWJ4a_header",
	"hint": "CLWJ4a_hint",
	"inlineAction": "CLWJ4a_inlineAction",
	"inlineControls": "CLWJ4a_inlineControls",
	"inlineEditor": "CLWJ4a_inlineEditor",
	"invalid": "CLWJ4a_invalid",
	"keyBadge": "CLWJ4a_keyBadge",
	"list": "CLWJ4a_list",
	"modifiedCount": "CLWJ4a_modifiedCount",
	"recorded": "CLWJ4a_recorded",
	"recorder": "CLWJ4a_recorder",
	"resetAll": "CLWJ4a_resetAll",
	"row": "CLWJ4a_row",
	"rowActions": "CLWJ4a_rowActions",
	"rowButton": "CLWJ4a_rowButton",
	"rows": "CLWJ4a_rows",
	"search": "CLWJ4a_search",
	"searchField": "CLWJ4a_searchField",
	"searchIcon": "CLWJ4a_searchIcon",
	"searchRow": "CLWJ4a_searchRow",
	"setting": "CLWJ4a_setting",
	"settingDescription": "CLWJ4a_settingDescription",
	"settingText": "CLWJ4a_settingText",
	"settingTitle": "CLWJ4a_settingTitle",
	"srOnly": "CLWJ4a_srOnly",
	"title": "CLWJ4a_title",
	"toastError": "CLWJ4a_toastError",
	"toastSuccess": "CLWJ4a_toastSuccess",
	"unbound": "CLWJ4a_unbound"
};

//#endregion
//#region src/client/KeymapEditor.tsx
/** Interpolate `{name}` placeholders in one localized string. */
function fill(text, values) {
	return text.replace(/\{(\w+)\}/gu, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
/**
* Render the inline editor for one command.
* @param target - the row being edited.
* @param snapshot - the live plugin snapshot, for label lookups.
* @param controller - arbitration and candidate preview.
* @param desktop - whether the shell is the desktop application.
* @param busy - whether another write currently owns the surface.
* @param persist - writes one reviewed edit.
* @param onClose - closes the recorder.
* @param onResult - reports the outcome to the reference.
* @param t - keymap dictionary.
* @returns the inline command controls.
*/
function KeymapEditor({ target, snapshot, controller, desktop, busy, persist, onClose, onResult, t }) {
	const [candidate, setCandidate] = (0, react.useState)(null);
	const [captured, setCaptured] = (0, react.useState)(false);
	const [message, setMessage] = (0, react.useState)("");
	const [recording, setRecording] = (0, react.useState)(desktop ? false : true);
	const [writing, setWriting] = (0, react.useState)(false);
	const descriptionId = (0, react.useId)();
	const recorder = (0, react.useRef)(null);
	const mounted = (0, react.useRef)(true);
	const busyRef = (0, react.useRef)(false);
	const restart = (0, react.useRef)(() => {});
	const chords = desktop && (controller.platform === "macos" || controller.platform === "windows");
	const targetId = target.id;
	const readOnly = busy || writing || snapshot.status !== "ready";
	/** Describe the live candidate against the current model. */
	const described = candidate === null ? null : controller.describeBinding(candidate, targetId);
	const displaced = described?.conflicts ?? [];
	const reserved = described?.reserved ?? [];
	/**
	* State a reason in place and raise it as a notice.
	*
	* This preview path never reaches the controller, so the reason is carried on
	* the result as finished text (`message`). Only `message` is set: `issue` is
	* the dictionary *key* that other producers use, and the reference would try
	* to translate whatever it found there.
	* @param text - the already-localized reason to show and announce.
	*/
	const report = (text) => {
		setMessage(text);
		onResult({
			status: "conflict",
			displaced: [],
			message: text
		});
	};
	(0, react.useEffect)(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const commit = async (operation) => {
		if (busyRef.current) return;
		busyRef.current = true;
		setWriting(true);
		let result;
		try {
			result = await persist(operation, targetId);
		} catch (error) {
			console.error("dsh-better-keymap: recording failed", error);
			finish({
				status: "write-failed",
				displaced: []
			});
			return;
		}
		finish(result);
	};
	/**
	* Report one finished attempt and release the recorder.
	* @param result - the outcome to show and forward.
	*/
	const finish = (result) => {
		busyRef.current = false;
		if (!mounted.current) return;
		setWriting(false);
		onResult(result);
		if (result.status === "saved") onClose();
		else setMessage(failureText(result, t));
	};
	const capture = (binding) => {
		setCandidate(binding);
		setCaptured(true);
		const view = controller.describeBinding(binding, targetId);
		if (view.issue !== null) {
			report(t(view.issue));
			return;
		}
		setMessage("");
		commit({
			type: "set",
			id: targetId,
			binding
		});
	};
	const handlers = (0, react.useRef)({
		capture,
		report,
		onClose
	});
	(0, react.useLayoutEffect)(() => {
		handlers.current = {
			capture,
			report,
			onClose
		};
	});
	(0, react.useEffect)(() => {
		let disposed = false;
		controller.recording(true).then(() => {
			if (!disposed) setRecording(true);
		}, () => {
			if (!disposed) handlers.current.report(t("native-failed"));
		});
		const composition = (0, __deepseek_ai_dsh_client_ui_primitives.observeComposition)(document);
		let pending = null;
		let dead = false;
		let blocked = false;
		const held = /* @__PURE__ */ new Set();
		const reset = () => {
			pending = null;
			held.clear();
			blocked = false;
			dead = false;
		};
		restart.current = reset;
		const down = (event) => {
			if (composition.guards(event) || event.getModifierState("AltGraph")) {
				if (chords) reset();
				return;
			}
			if ((!chords || document.activeElement !== recorder.current) && event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
				event.preventDefault();
				event.stopPropagation();
				if (!event.repeat && !busyRef.current) handlers.current.onClose();
				return;
			}
			const commandDeadKey = !desktop && controller.platform === "macos" && document.activeElement === recorder.current && event.code === "KeyN" && event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey;
			if (event.key === "Dead" && !commandDeadKey) {
				if (chords) reset();
				dead = true;
				return;
			}
			if (dead) {
				dead = false;
				return;
			}
			const modifiers = [
				"control",
				"alt",
				"shift",
				"meta"
			].filter((value) => ({
				control: event.ctrlKey,
				alt: event.altKey,
				shift: event.shiftKey,
				meta: event.metaKey
			})[value]);
			const recordTab = chords || (controller.platform === "macos" || controller.platform === "windows") && modifiers.length >= 3;
			if (document.activeElement !== recorder.current || event.key === "Tab" && !recordTab) return;
			event.preventDefault();
			event.stopPropagation();
			if (busyRef.current || event.repeat) return;
			if (/^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(event.code)) {
				if (chords && pending !== null) {
					reset();
					setCandidate(null);
					setCaptured(false);
				}
				return;
			}
			if (chords) {
				held.add(event.code);
				if (blocked) return;
				if (held.size > 2) {
					blocked = true;
					pending = null;
					handlers.current.report(t("too-many-keys"));
					return;
				}
			}
			try {
				const codes = [event.code, ...chords ? [...held].filter((value) => value !== event.code) : []];
				pending = {
					code: codes[0],
					...codes[1] === void 0 ? {} : { secondCode: codes[1] },
					modifiers
				};
				setCandidate(pending);
				setCaptured(chords);
				setMessage("");
			} catch (_error) {
				blocked = chords;
				pending = null;
				handlers.current.report(t("unsupported-key"));
			}
		};
		const up = (event) => {
			held.delete(event.code);
			if (chords && document.activeElement === recorder.current) {
				event.preventDefault();
				event.stopPropagation();
			}
			const binding = pending !== null && (pending.code === event.code || pending.secondCode === event.code || pending.modifiers.some((modifier) => modifier === event.code.replace(/(Left|Right)$/u, "").toLowerCase())) ? pending : null;
			if (binding !== null) {
				pending = null;
				blocked = chords;
			}
			if (chords && (held.size === 0 || controller.platform === "macos" && /^Meta(Left|Right)$/u.test(event.code))) {
				held.clear();
				blocked = false;
			}
			if (binding === null) return;
			handlers.current.capture(binding);
		};
		const blur = () => {
			reset();
			if (chords) {
				setCandidate(null);
				setCaptured(false);
			}
		};
		const focus = () => {
			if (document.activeElement !== recorder.current) blur();
		};
		document.addEventListener("keydown", down, true);
		document.addEventListener("keyup", up, true);
		window.addEventListener("blur", blur);
		if (chords) {
			document.addEventListener("focusin", focus, true);
			document.addEventListener("compositionstart", blur, true);
		}
		return () => {
			disposed = true;
			composition.dispose();
			document.removeEventListener("keydown", down, true);
			document.removeEventListener("keyup", up, true);
			window.removeEventListener("blur", blur);
			document.removeEventListener("focusin", focus, true);
			document.removeEventListener("compositionstart", blur, true);
			controller.recording(false).catch(() => {});
		};
	}, [
		controller,
		t,
		targetId,
		desktop,
		chords,
		snapshot.model
	]);
	(0, react.useEffect)(() => {
		const element = recorder.current;
		if (recording && element !== null) (0, __deepseek_ai_dsh_client_ui_primitives.focusWithoutRing)(element);
	}, [recording]);
	const preview = described !== null ? described.keys : [];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: Reference_module_default.inlineEditor,
		role: "group",
		"aria-label": target.label,
		"data-shortcut-modal": "shortcut-edit",
		"aria-busy": writing,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Reference_module_default.inlineControls,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: Reference_module_default.inlineAction,
						disabled: readOnly,
						onClick: () => {
							commit({
								type: "reset",
								id: targetId
							});
						},
						children: t("reset")
					}),
					target.binding !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: Reference_module_default.inlineAction,
						disabled: readOnly,
						onClick: () => {
							commit({
								type: "set",
								id: targetId,
								binding: null
							});
						},
						children: t("clear")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						ref: recorder,
						type: "button",
						className: message === "" ? Reference_module_default.recorder : `${Reference_module_default.recorder} ${Reference_module_default.invalid}`,
						disabled: !recording,
						"aria-disabled": writing || !recording,
						onBlur: () => {
							restart.current();
						},
						"aria-label": t("record"),
						"aria-invalid": message !== "",
						"aria-describedby": descriptionId,
						onClick: () => {
							if (!busyRef.current) {
								restart.current();
								setCaptured(false);
								setMessage("");
								setCandidate(null);
							}
						},
						children: captured && preview.length > 0 && message === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.ShortcutKeys, {
							keys: preview,
							className: Reference_module_default.recorded
						}) : t("record")
					})
				]
			}),
			target.composer === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Reference_module_default.displace,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("composer-help") })
			}),
			target.composer === true && target.customized && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Reference_module_default.displace,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("composer-default-off") })
			}),
			displaced.length > 0 && message === "" && target.composer !== true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Reference_module_default.displace,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeymapIcon, { kind: "edit" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("cleared"), { commands: displaced.map((id) => labelOf(snapshot.model, id)).join("、") }) })]
			}),
			reserved.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Reference_module_default.displace,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("reserved-conflict"), { commands: reserved.map((id) => labelOf(snapshot.model, id)).join("、") }) })
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				id: descriptionId,
				className: Reference_module_default.srOnly,
				children: message || (chords ? t("record-help") : helpText(t, controller.platform, desktop))
			})
		]
	});
}
/**
* Select the browser-facing help line for the current device.
* @param t - keymap dictionary.
* @param platform - receiving device.
* @param desktop - whether the shell is the desktop application.
* @returns the localized help text.
*/
function helpText(t, platform, desktop) {
	if (desktop) return "";
	return platform === "windows" ? t("windows-web-help") : platform === "macos" ? t("macos-web-help") : t("web-help");
}

//#endregion
//#region src/client/KeymapReference.tsx
/** Display groups, in render order. */
const GROUPS = GROUP_ORDER;
/**
* Every search term for one rendered row.
*
* Both row kinds carry a precomputed term list; the label is appended so a
* search for the visible name always matches, whichever kind the row is.
* @param row - a displayed row.
* @returns the terms the fuzzy matcher searches.
*/
function rowNames(row) {
	return [...row.names, row.label];
}
/**
* Resolve the editable view of one rendered row.
*
* The displayed rows and the editable rows are derived from the same document
* and the same overrides, so this lookup cannot disagree with what the row
* shows — it only tells the recorder which arbitration fields to use.
* @param snapshot - the live plugin snapshot.
* @param id - the row's command id.
* @returns the editable row, or undefined when the id is not rebindable.
*/
function rowModel(snapshot, id) {
	return snapshot.model.editable.find((row) => row.id === id);
}
/**
* Render the reference dialog.
* @param useStore - store state and its declared reads.
* @param actions - the store's complete mutation API.
* @param useSnapshot - live plugin state.
* @param controller - arbitration and candidate preview.
* @param desktop - whether the shell is the desktop application.
* @param t - keymap dictionary.
* @returns the single reference dialog when open.
*/
function KeymapReference({ useStore, actions, useSnapshot, controller, desktop, t }) {
	const { open, query, focusRequest } = useStore((state) => state);
	const snapshot = useSnapshot((value) => value);
	const rows = snapshot.model.rows;
	const [target, setTarget] = (0, react.useState)(null);
	const [resetOpen, setResetOpen] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const [toast, setToast] = (0, react.useState)(null);
	const mounted = (0, react.useRef)(true);
	const search = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const dismissToast = (0, react.useCallback)(() => {
		setToast(null);
	}, []);
	const notify = (0, react.useCallback)((text, error = false) => {
		setToast((previous) => {
			if (error && previous?.error && previous.text === text) return previous;
			return {
				text,
				error,
				seq: (previous?.seq ?? 0) + 1
			};
		});
	}, []);
	(0, react.useEffect)(() => {
		if (open && snapshot.status === "unreadable") notify(readFailure(t), true);
	}, [
		open,
		snapshot.status,
		notify,
		t
	]);
	const closeEditor = () => {
		setTarget(null);
		const dialog = search.current?.closest("[role=\"dialog\"]");
		if (dialog != null) (0, __deepseek_ai_dsh_client_ui_primitives.focusWithoutRing)(dialog, { preventScroll: true });
	};
	const closeReference = () => {
		if (busy) return;
		if (resetOpen) setResetOpen(false);
		else if (target !== null) closeEditor();
		else actions.close();
	};
	(0, react.useEffect)(() => {
		if (!open) setResetOpen(false);
	}, [open]);
	/** Report one accepted edit, naming every command the assignment displaced. */
	const report = (0, react.useCallback)((result) => {
		if (result.status !== "saved") {
			notify(failureText(result, t), true);
			return;
		}
		if (result.displaced.length === 0) {
			notify(t("saved"));
			return;
		}
		notify(t("cleared", { commands: result.displaced.map((entry) => entry.keys.length === 0 ? entry.label : `${entry.label}（${entry.keys.join("")}）`).join("、") }));
	}, [notify, t]);
	const persist = (0, react.useCallback)(async (edit, id) => {
		setBusy(true);
		const result = await controller.apply(edit, id);
		if (mounted.current) setBusy(false);
		return result;
	}, [controller]);
	const resetAll = async () => {
		const result = await persist({ type: "reset-all" });
		if (!mounted.current) return;
		if (result.status === "saved") setResetOpen(false);
		notify(result.status === "saved" ? t("reset-saved") : t("reset-failed"), result.status !== "saved");
	};
	(0, react.useLayoutEffect)(() => {
		const input = search.current;
		if (open && input !== null && !(0, __deepseek_ai_dsh_client_ui_primitives.isBehindModal)(input)) (0, __deepseek_ai_dsh_client_ui_primitives.focusWithoutRing)(input);
	}, [open, focusRequest]);
	const term = query.trim();
	const matches = [...new Set((0, __deepseek_ai_dsh_client_ui_primitives.rankByName)(rows.flatMap((row) => rowNames(row).map((name) => ({
		name,
		label: row.label,
		row
	}))), term).map((match) => match.row))];
	const customized = snapshot.customized;
	(0, react.useLayoutEffect)(() => {
		const input = search.current;
		if (open && !resetOpen && customized === 0 && document.activeElement === document.body && input !== null) (0, __deepseek_ai_dsh_client_ui_primitives.focusWithoutRing)(input);
	}, [
		open,
		resetOpen,
		customized
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Modal, {
			open,
			onClose: closeReference,
			title: t("title"),
			headless: true,
			shortcutModal: "shortcuts",
			className: Reference_module_default.dialog,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Reference_module_default.contents,
				onPointerDownCapture: (event) => {
					if (target === null || busy || !(event.target instanceof Element) || event.target.closest("button, input, a, [contenteditable=\"true\"], [role=\"group\"]") !== null) return;
					event.preventDefault();
					closeEditor();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: Reference_module_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: Reference_module_default.title,
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: Reference_module_default.close,
							"aria-label": t("close"),
							disabled: busy,
							onClick: closeReference,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 14 })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Reference_module_default.searchRow,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Reference_module_default.searchField,
							role: "search",
							"aria-label": t("search"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: Reference_module_default.searchIcon,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchIcon, {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: search,
									"data-modal-autofocus": true,
									className: Reference_module_default.search,
									type: "search",
									"aria-label": t("search"),
									placeholder: t("search"),
									value: query,
									onChange: (event) => {
										actions.search(event.target.value);
									}
								}),
								query !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Reference_module_default.clearSearch,
									"aria-label": t("clear-search"),
									onClick: () => {
										actions.search("");
										search.current?.focus();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 10 })
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Reference_module_default.list,
						"aria-busy": snapshot.status === "loading",
						children: [GROUPS.map((group) => {
							const groupRows = matches.filter((row) => row.group === group);
							if (groupRows.length === 0) return null;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								"aria-label": t(group),
								children: [group !== "application" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: Reference_module_default.group,
									children: t(group)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: Reference_module_default.rows,
									children: groupRows.map((row) => {
										const editable = row.kind === "owned" || row.composer;
										const model = editable ? rowModel(snapshot, row.id) : void 0;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
											className: Reference_module_default.row,
											children: [
												editable && target !== row.id && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: Reference_module_default.rowButton,
													"aria-label": t("edit-label", { command: row.label }),
													disabled: busy || snapshot.status !== "ready",
													onClick: () => {
														setTarget(row.id);
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: Reference_module_default.commandLabel,
													children: row.label
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: Reference_module_default.binding,
													children: editable && model !== void 0 ? target === row.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeymapEditor, {
														target: model,
														snapshot,
														controller,
														desktop,
														busy,
														persist,
														onClose: closeEditor,
														onResult: report,
														t
													}, row.id) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: Reference_module_default.rowActions,
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeymapIcon, { kind: "edit" })
													}), row.keys.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: Reference_module_default.unbound,
														children: t("unbound")
													}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.ShortcutKeys, {
														keys: row.keys,
														className: Reference_module_default.keyBadge
													})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.ShortcutKeys, {
														keys: row.keys,
														className: Reference_module_default.fixedKeyBadge
													})
												})
											]
										}, row.id);
									})
								})]
							}, group);
						}), matches.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: Reference_module_default.hint,
							role: "status",
							children: t("empty")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: Reference_module_default.footer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: Reference_module_default.resetAll,
							disabled: busy || snapshot.status !== "ready" || customized === 0,
							onClick: (event) => {
								event.currentTarget.focus();
								setTarget(null);
								setResetOpen(true);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, { size: 12 }), t("reset-all")]
						}), customized > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Reference_module_default.modifiedCount,
							children: t("modified-count", { count: customized })
						})]
					})
				]
			})
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Modal, {
			open: open && resetOpen,
			title: t("reset-title"),
			description: t("reset-description"),
			closeLabel: t("close-confirmation"),
			onClose: () => {
				if (!busy) setResetOpen(false);
			},
			footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
				"data-modal-autofocus": true,
				disabled: busy,
				onClick: () => {
					setResetOpen(false);
				},
				children: t("cancel")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "primary",
				disabled: busy || snapshot.status !== "ready",
				onClick: () => {
					resetAll();
				},
				children: t("reset")
			})] })
		}),
		toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Toast, {
			text: toast.text,
			onDone: dismissToast,
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeymapIcon, {
				kind: toast.error ? "error" : "success",
				className: toast.error ? Reference_module_default.toastError : Reference_module_default.toastSuccess
			})
		}, toast.seq)
	] });
}

//#endregion
//#region src/client/KeymapSettingsRow.tsx
/**
* Render the General settings action that opens the keymap reference.
*
* The store is declared on the registration but not read here: this row only
* flips `open`, and the overlay owns everything else. The inject face supplies
* the live key hint.
* @param actions - the store's mutation API.
* @param useSnapshot - live plugin state, read for the current hint key.
* @param t - keymap dictionary.
* @returns the settings row.
*/
function KeymapSettingsRow({ actions, t, useSnapshot }) {
	const shortcut = useSnapshot((snapshot) => snapshot.model.rows.find((row) => row.id === "shortcuts.open" && row.kind === "owned"));
	const keys = shortcut?.kind === "owned" ? shortcut.keys : [];
	const aria = shortcut?.kind === "owned" ? shortcut.aria : void 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: Reference_module_default.setting,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: Reference_module_default.settingText,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Reference_module_default.settingTitle,
				children: t("settings")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: Reference_module_default.settingDescription,
				children: t("description")
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Tooltip, {
			disabled: keys.length === 0,
			label: t("global-hint"),
			shortcutKeys: keys,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: Reference_module_default.button,
				type: "button",
				"aria-label": t("view"),
				"aria-keyshortcuts": aria,
				onClick: () => {
					actions.open();
				},
				children: t("view")
			})
		})]
	});
}

//#endregion
//#region src/client/store.ts
/**
* Declare the overlay store.
*
* `create()` builds a fresh store on every call, which is the engine's contract.
* The single shared instance the two registrations need is imposed by `apply`,
* which pins `create` to one instance.
* @returns the store handle `apply` pins to a single instance.
*/
function createKeymapStore() {
	return (0, __deepseek_ai_dsh_client_store.defineStore)({
		init: () => ({
			open: false,
			query: "",
			focusRequest: 0
		}),
		actions: {
			open: (draft) => {
				draft.open = true;
				draft.focusRequest += 1;
			},
			close: (draft) => {
				draft.open = false;
				draft.query = "";
			},
			search: (draft, query) => {
				draft.query = query;
			}
		}
	});
}

//#endregion
//#region src/client/locales.ts
/**
* Localized copy for the keymap reference.
*
* Namespace `keymap` belongs to this plugin. Keys shared with the product's own
* reference (`title`, `search`, `conflict`, `unbound`, the group headings, the
* save outcomes) keep the shipped wording verbatim so the reference reads the
* same regardless of which plugin renders it. The rest is this plugin's own:
* `cleared` names the commands a later assignment displaced, the `composer-*`
* pair describes rebinding the three input actions, `reserved-combination`
* explains the Enter combinations the window cannot dispatch, and
* `plugin-document` names this plugin's own storage key.
*/
/** Simplified Chinese dictionary (the key-set source of truth). */
const zh = {
	title: "快捷键",
	open: "快捷键速查",
	settings: "快捷键",
	view: "编辑快捷键",
	description: "查看和编辑当前可用的快捷键和输入操作",
	search: "搜索快捷键",
	"clear-search": "清空搜索",
	close: "关闭快捷键",
	"global-hint": "全局唤起查看",
	application: "应用操作",
	input: "消息输入",
	menus: "菜单与弹层",
	approval: "审批区域",
	unbound: "暂无快捷键",
	empty: "没有匹配的快捷键",
	"edit-label": "修改{command}快捷键",
	record: "按下快捷键",
	"record-help": "松开组合键即保存。Tab 切换操作，Esc 退出录键。",
	"web-help": "浏览器可用组合：Mod+/、Mod+Shift+,、Mod+Shift+.。Mod 在 Mac 上为 Command，其他系统为 Ctrl。",
	"macos-web-help": "可设置 Command+/、Command+,、Command+反斜杠、Control+反引号、Command+Option+按键或 Command+Shift+按键。也支持三个或四个不同修饰键的组合。浏览器或系统占用的组合可能无法送达页面。",
	"windows-web-help": "可设置 Ctrl+/、Ctrl+,、Ctrl+反斜杠、Ctrl+反引号、Ctrl+Alt+按键或 Ctrl+Shift+按键。也支持三个或四个不同修饰键的组合。浏览器或系统占用的组合可能无法送达页面。",
	"unsupported-key": "暂不支持这个按键。",
	reserved: "此组合由系统或文本编辑操作保留。",
	"reserved-key": "此按键已被固定操作占用，不能单独使用。请加上 Ctrl、Alt 或 Command 等修饰键，或改用其他按键。",
	"reserved-combination": "此组合已固定用于输入框动作（发送消息、换行、互补方式），普通快捷键无法使用。请改用其他组合。",
	"modifier-required": "请同时按下 Command、Ctrl 或 Alt 修饰键。",
	"too-many-keys": "最多同时按下两个非修饰键。请松开后重试。",
	"unsupported-browser": "此浏览器暂不支持该组合。",
	conflict: "已被「{commands}」占用",
	cleared: "已清空「{commands}」的快捷键",
	"reserved-conflict": "「{commands}」为固定操作，无法被覆盖",
	saved: "已修改",
	clear: "移除",
	reset: "恢复默认",
	"reset-all": "恢复全部默认",
	"modified-count": "{count} 项已自定义",
	"composer-help": "此键在输入框内生效。动作本身不变，只改变触发它的按键。",
	"composer-default-off": "默认按键已停用；按它不会再触发这个动作。",
	"reset-title": "恢复全部默认快捷键？",
	"reset-description": "将恢复当前平台的默认快捷键。你修改或移除的快捷键都会恢复，其他平台不受影响。",
	cancel: "取消",
	"reset-saved": "已恢复默认快捷键",
	"close-confirmation": "关闭确认",
	"reset-failed": "恢复默认失败。原快捷键已保留，请重试。",
	stale: "快捷键配置或可用命令已更新。请核对最新键位后再保存。",
	"write-failed": "保存失败。原快捷键和当前草稿已保留，请重试。",
	"not-ready": "快捷键尚未准备好，请稍后重试。",
	invalid: "{location} 的快捷键配置内容损坏。请先备份并修复该配置，然后{reload}。",
	"plugin-document": "当前网站本地存储中的 dsh-better-keymap.keybindings.v1",
	"web-reload": "刷新页面",
	"using-defaults": "当前使用默认键位。",
	"native-failed": "无法启用桌面录键保护，请关闭后重试。"
};
/** English dictionary, checked complete against the Chinese key set. */
const en = {
	title: "Keyboard shortcuts",
	open: "Open keyboard shortcuts",
	settings: "Keyboard shortcuts",
	view: "Edit shortcuts",
	description: "View and edit available shortcuts and input actions",
	search: "Search shortcuts",
	"clear-search": "Clear search",
	close: "Close keyboard shortcuts",
	"global-hint": "Open from anywhere",
	application: "Application",
	input: "Message input",
	menus: "Menus and dialogs",
	approval: "Approval area",
	unbound: "No shortcut",
	empty: "No matching shortcuts",
	"edit-label": "Edit shortcut for {command}",
	record: "Press a shortcut",
	"record-help": "Release the keys to save. Tab moves between actions; Esc cancels.",
	"web-help": "Browser combinations: Mod+/, Mod+Shift+,, Mod+Shift+.. Mod is Command on Mac and Ctrl elsewhere.",
	"macos-web-help": "Use Command+/, Command+,, Command+Backslash, Control+Backquote, Command+Option+key, or Command+Shift+key. Combinations with three or four distinct modifiers are also supported. Browser or system shortcuts may not reach the page.",
	"windows-web-help": "Use Ctrl+/, Ctrl+,, Ctrl+Backslash, Ctrl+Backquote, Ctrl+Alt+key, or Ctrl+Shift+key. Combinations with three or four distinct modifiers are also supported. Browser or system shortcuts may not reach the page.",
	"unsupported-key": "This key is not supported.",
	reserved: "This combination is reserved for system or text editing actions.",
	"reserved-key": "This key is already taken by a fixed action and cannot be used on its own. Add a modifier such as Ctrl, Alt, or Command, or choose another key.",
	"reserved-combination": "This combination is fixed to an input-box action (send, newline, or complementary delivery), so an ordinary shortcut cannot use it. Choose another combination.",
	"modifier-required": "Include Command, Ctrl, or Alt in the combination.",
	"too-many-keys": "Hold at most two non-modifier keys. Release the keys to try again.",
	"unsupported-browser": "This browser does not support this combination yet.",
	conflict: "Already used by “{commands}”",
	cleared: "Cleared the shortcut for “{commands}”",
	"reserved-conflict": "“{commands}” is a fixed action and cannot be overridden",
	saved: "Modified",
	clear: "Remove",
	reset: "Restore default",
	"reset-all": "Restore all defaults",
	"modified-count": "{count} customized",
	"composer-help": "This key applies inside the input box. The action itself is unchanged; only the key that triggers it is.",
	"composer-default-off": "The default key is off; pressing it no longer triggers this action.",
	"reset-title": "Restore all default shortcuts?",
	"reset-description": "Restore the default shortcuts for this platform. All modified or removed shortcuts will be restored. Other platforms are unaffected.",
	cancel: "Cancel",
	"reset-saved": "Default shortcuts restored",
	"close-confirmation": "Close confirmation",
	"reset-failed": "Could not restore defaults. Your shortcuts are unchanged. Please retry.",
	stale: "Shortcut configuration or available commands changed. Review the latest bindings before saving.",
	"write-failed": "Could not save. Your previous shortcuts and current draft are preserved. Please retry.",
	"not-ready": "Shortcuts are not ready. Please try again.",
	invalid: "Shortcut configuration in {location} is damaged. Back up and repair this configuration, then {reload}.",
	"plugin-document": "this site’s localStorage entry dsh-better-keymap.keybindings.v1",
	"web-reload": "reload the page",
	"using-defaults": "Default bindings are active.",
	"native-failed": "Could not protect desktop key recording. Exit recording and try again."
};

//#endregion
//#region src/client/index.ts
/** Dictionary namespace owned by this plugin. */
const NS = "keymap";
/** Shadowing priority below the product's own overlay entry, which registers at 0. */
const OVERLAY_PRIORITY = -1;
/** Services the plugin requires before it activates. */
const inject = [
	"shortcuts",
	"slots",
	"locale"
];
/**
* Register the reference surface, its settings row, and the product mirror.
* @param ctx - plugin-owned client context.
* @returns nothing; every contribution is registered through the context.
*/
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "dsh-better-keymap: dictionaries");
	const t = ctx.locale.bind(NS);
	const handle = createKeymapStore();
	const instance = handle.create();
	const store = {
		...handle,
		create: () => instance
	};
	const controller = new KeymapController(ctx.shortcuts);
	ctx.effect(() => {
		controller.attachComposerRemap();
		controller.start();
		return () => {
			controller.detachComposerRemap();
		};
	}, "dsh-better-keymap: controller lifetime");
	ctx.effect(() => ctx.shortcuts.catalog.subscribe(() => {
		controller.refresh();
	}), "dsh-better-keymap: catalog changes");
	ctx.effect(() => ctx.locale.subscribe(() => {
		controller.refresh();
	}), "dsh-better-keymap: locale changes");
	const injected = () => ({
		controller,
		desktop: controller.runtime === "desktop",
		hooks: { snapshot: {
			getSnapshot: () => controller.getSnapshot(),
			subscribe: (listener) => controller.subscribe(listener)
		} }
	});
	ctx.slots.inject("settings.general.item", () => ctx.slots.register({
		name: "settings.general.item",
		id: "shortcuts",
		order: 16,
		locale: NS,
		store,
		inject: injected
	}, KeymapSettingsRow));
	ctx.slots.inject("shell.overlay", function* () {
		const disposeCommand = ctx.shortcuts.register({
			id: "shortcuts.open",
			label: () => t("open"),
			aliases: [
				"shortcuts",
				"keyboard shortcuts",
				"keymap"
			],
			defaults: {
				"desktop:macos": {
					code: "Slash",
					modifiers: ["primary"]
				},
				"desktop:windows": {
					code: "Slash",
					modifiers: ["primary"]
				},
				"desktop:linux": {
					code: "Slash",
					modifiers: ["primary"]
				},
				"web:macos": {
					code: "Slash",
					modifiers: ["primary"]
				},
				"web:windows": {
					code: "Slash",
					modifiers: ["primary"]
				},
				"web:linux": {
					code: "Slash",
					modifiers: ["primary"]
				}
			},
			regions: [
				"page",
				"editable",
				"terminal"
			],
			modals: ["settings", "shortcuts"],
			resolve: ({ modal }) => {
				if (modal !== null && modal !== "settings" && modal !== "shortcuts") return {
					status: "blocked",
					reason: "modal"
				};
				return {
					status: "handled",
					run: () => {
						if (modal === "shortcuts") (0, __deepseek_ai_dsh_client_ui_primitives.closeTopModal)(document);
						else instance.actions.open();
					}
				};
			}
		});
		const disposeSlot = ctx.slots.register({
			name: "shell.overlay",
			id: "shortcuts",
			priority: OVERLAY_PRIORITY,
			locale: NS,
			store,
			inject: injected
		}, KeymapReference);
		yield disposeCommand;
		yield disposeSlot;
	});
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
