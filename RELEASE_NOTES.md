<p align="right">
  <strong>English</strong> · <a href="./RELEASE_NOTES.zh-CN.md">简体中文</a>
</p>

# v1.0.0

[![GitHub](https://img.shields.io/badge/GitHub-Smallcarve%2Fdsh--better--keymap-181717?logo=github&logoColor=white)](https://github.com/Smallcarve/dsh-better-keymap)
[![Gitee](https://img.shields.io/badge/Gitee-Smallcarve%2Fdsh--better--keymap-c71d23?logo=gitee&logoColor=white)](https://gitee.com/Smallcarve/dsh-better-keymap)
[![npm](https://img.shields.io/npm/v/dsh-better-keymap)](https://www.npmjs.com/package/dsh-better-keymap)

**For DeepSeek Harness `0.2.0-rc.2` and later.**

The first stable release. The better keyboard-shortcut manager for DeepSeek Harness.

---

## What it changes

Harness refuses any edit that would conflict: try to move `Ctrl+N` off "new session" and it tells you the combination is taken, then declines to save.

This plugin replaces that rule with **the later assignment wins**:

- **A later assignment overrides an earlier one** — the new combination takes effect at once, and the previous holder is unbound.
- **Displacements are reported** — the notice names every command that was cleared and the keys it lost.
- **One source of truth** — the plugin's own table decides, and is mirrored into Harness's keybinding configuration so keys dispatch exactly as displayed.

## Features

- **The vast majority of commands are rebindable**: move, clear, or restore each one.
- **The three input-box actions are rebindable too**: send message, newline, and complementary queue/steer were fixed keys; now they can be moved or cleared, handled by the plugin's key-translation layer.
- **The interface is the official one**: same structure, copy, and interaction as Harness's own shortcuts page, served as an overlay taking over the official entry point.
- **One place decides the reservation rule**: six reserved bare keys (`Enter`, `Esc`, `/`, `@`, `↑`, `↓`; `Enter` is exempt for the three input actions) and two reserved combinations (`Shift+Enter`, `Ctrl+Enter`; ordinary commands only). The recording preview and the commit share one verdict, and **a refused assignment writes nothing**.
- **A pure plugin**: no Harness source is modified; it uses only the public `ctx.shortcuts`, `ctx.slots`, and `ctx.locale` services.

## Install

```sh
cd ~/.dsh/profiles/desktop
pnpm add dsh-better-keymap
```

Then restart Harness. The package declares `dsh.bundle`, so the plugin manager installs it as a profile layer — **no configuration file needs editing**.

From source instead:

```sh
pnpm add "github:Smallcarve/dsh-better-keymap"
pnpm add "git+https://gitee.com/Smallcarve/dsh-better-keymap.git"   # China mirror
```

`lib/` ships prebuilt, so **no build step is needed**.

## Quality

- **114 automated checks, all passing** (8 files), covering the key protocol, arbitration, the composer translation layer, failure paths, and real component rendering under jsdom.
- The build is **reproducible**: the same `src/` produces byte-identical `lib/client.js` anywhere, so rebuilding after a clone shows no difference.
- Not automated: installation and on-screen behaviour need confirming by hand in a real Harness window.

## Repositories

- GitHub (primary): https://github.com/Smallcarve/dsh-better-keymap
- Gitee (China mirror): https://gitee.com/Smallcarve/dsh-better-keymap
- npm: https://www.npmjs.com/package/dsh-better-keymap

## License

MIT
