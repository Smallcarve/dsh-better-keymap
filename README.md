<p align="right">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a>
</p>

# dsh-better-keymap

**v1.0.0** · for DeepSeek Harness **0.2.0-rc.2+**

[![GitHub](https://img.shields.io/badge/GitHub-Smallcarve%2Fdsh--better--keymap-181717?logo=github&logoColor=white)](https://github.com/Smallcarve/dsh-better-keymap)
[![Gitee](https://img.shields.io/badge/Gitee-Smallcarve%2Fdsh--better--keymap-c71d23?logo=gitee&logoColor=white)](https://gitee.com/Smallcarve/dsh-better-keymap)
[![npm](https://img.shields.io/npm/v/dsh-better-keymap)](https://www.npmjs.com/package/dsh-better-keymap)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

The better keyboard-shortcut manager for DeepSeek Harness. One editable table covers the vast majority of commands, **a later assignment overrides an earlier one**, and anything displaced is reported to you.

## Why

Harness refuses any edit that would conflict: try to move `Ctrl+N` off "new session" and it tells you the combination is taken, then declines to save. This plugin replaces that rule with **the later assignment wins** — the previous holder is unbound and named in a notice.

It also makes three actions rebindable that Harness ships as fixed keys:

| Action | Default |
|---|---|
| Send message | `Enter` |
| Newline | `Shift+Enter` |
| Complementary queue/steer | `Ctrl`/`⌘`+`Enter` |

Each can be moved to another key, or cleared so it triggers nothing.

## Install

```sh
cd ~/.dsh/profiles/desktop
pnpm add dsh-better-keymap
```

Then restart Harness. The package declares `dsh.bundle`, so the plugin manager installs it as a profile layer — **no configuration file needs editing.**

Installing from source instead:

```sh
pnpm add "github:Smallcarve/dsh-better-keymap"
pnpm add "git+https://gitee.com/Smallcarve/dsh-better-keymap.git"   # China mirror
```

`lib/` ships prebuilt, so no build step is needed either way. You can also install through **Plugins → Install plugin** in Harness and restart.

## Use

Press `Ctrl`/`⌘`+`/` to open the reference, then click a row's key to record a new combination. Release the keys to commit.

The reference is the product's own shortcuts page — same structure, copy, and interaction — served as an overlay that takes over the official entry point. Search, per-row reset, and restore-all-defaults all work as before.

## Rules

A bare key and two combinations are reserved, because Harness cannot dispatch them to an editable command without shadowing a fixed gesture:

| Reserved | Editable commands | The three input actions |
|---|---|---|
| `Enter` `Esc` `/` `@` `↑` `↓` | refused | `Enter` allowed, the rest refused |
| `Shift+Enter`, `Ctrl`+`Enter` | refused | allowed |

Everything else is decided by Harness's own deliverability check. **A refused assignment writes nothing** — your keys and defaults are untouched, and the notice says why.

## Compatibility

| | |
|---|---|
| DeepSeek Harness | 0.2.0-rc.2 and later |
| Node.js | 22.19+ or 24+ (only to build from source) |
| Profiles | `desktop` and `web`; verified on `desktop` |
| Host source | unmodified — the plugin uses only `ctx.shortcuts`, `ctx.slots`, `ctx.locale` |

## Repositories

[GitHub](https://github.com/Smallcarve/dsh-better-keymap) (primary) · [Gitee](https://gitee.com/Smallcarve/dsh-better-keymap) (China mirror) · [npm](https://www.npmjs.com/package/dsh-better-keymap)

## Development

```sh
pnpm install
pnpm run build        # writes lib/
pnpm run test         # 114 checks
```

## License

MIT
