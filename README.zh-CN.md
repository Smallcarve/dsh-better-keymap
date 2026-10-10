<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

# dsh-better-keymap

**v1.0.0** · 适用 DeepSeek Harness **0.2.0-rc.2** 及以上

[![GitHub](https://img.shields.io/badge/GitHub-Smallcarve%2Fdsh--better--keymap-181717?logo=github&logoColor=white)](https://github.com/Smallcarve/dsh-better-keymap)
[![Gitee](https://img.shields.io/badge/Gitee-Smallcarve%2Fdsh--better--keymap-c71d23?logo=gitee&logoColor=white)](https://gitee.com/Smallcarve/dsh-better-keymap)
[![npm](https://img.shields.io/npm/v/dsh-better-keymap)](https://www.npmjs.com/package/dsh-better-keymap)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

DeepSeek Harness 更好的快捷键管理。一个可编辑的键位表覆盖绝大多数命令，**后设置的组合自动覆盖先设置的**，被清空的快捷键会明确告知你。

## 它解决什么

Harness 自带设置页会**拒绝**任何造成冲突的编辑：想把 `Ctrl+N` 从「新会话」改给别的命令，它只会告诉你「已被占用」，然后拒绝保存。本插件把这条规则换成**后来者胜**——原先占用该组合的命令被解绑，并在提示里点名。

同时，三个原本固定的输入框动作也可以改绑或置空：

| 动作 | 默认键 |
|---|---|
| 发送消息 | `Enter` |
| 换行 | `Shift+Enter` |
| 使用互补的 Queue／Steer 方式 | `Ctrl`／`⌘`+`Enter` |

## 安装

```sh
cd ~/.dsh/profiles/desktop
pnpm add dsh-better-keymap
```

重启 Harness 即可。包内声明了 `dsh.bundle`，插件管理器会把它作为 profile layer 安装，**无需修改任何配置文件**。

从源码安装：

```sh
pnpm add "github:Smallcarve/dsh-better-keymap"
pnpm add "git+https://gitee.com/Smallcarve/dsh-better-keymap.git"   # 国内镜像
```

`lib/` 已预构建，两种方式都不需要自己构建。也可以在 Harness 的 **插件 → 安装插件** 里填入包名，然后重启。

## 使用

按 `Ctrl`／`⌘`+`/` 打开速查表，点击某一行的按键后按下新组合，松开即提交。

界面就是 Harness 自己的快捷键页——结构、文案、交互一致——作为独立浮层取代官方入口。搜索、单行恢复默认、全部恢复默认都照常可用。

## 保留规则

有六个裸键和两个组合被保留，因为 Harness 无法把它们派发给可改键命令而不遮蔽固定手势：

| 保留项 | 普通命令 | 输入框三键 |
|---|---|---|
| `Enter` `Esc` `/` `@` `↑` `↓` | 拒绝 | `Enter` 可设，其余拒绝 |
| `Shift+Enter`、`Ctrl`+`Enter` | 拒绝 | 可设 |

其余取值交给 Harness 自己的可用性判定。**被拒绝的赋值不写入任何内容**——键位与默认值保持不变，提示会说明原因。

## 兼容性

| | |
|---|---|
| DeepSeek Harness | 0.2.0-rc.2 及以上 |
| Node.js | 22.19+ 或 24+（仅自行构建时需要） |
| Profile | `desktop` 与 `web`；已在 `desktop` 上完整验证 |
| Harness 源码 | 未修改——只用公开的 `ctx.shortcuts`、`ctx.slots`、`ctx.locale` |

## 仓库

[GitHub](https://github.com/Smallcarve/dsh-better-keymap)（主） · [Gitee](https://gitee.com/Smallcarve/dsh-better-keymap)（国内镜像） · [npm](https://www.npmjs.com/package/dsh-better-keymap)

## 开发

```sh
pnpm install
pnpm run build        # 产出 lib/
pnpm run test         # 114 项检查
```

## 许可

MIT
