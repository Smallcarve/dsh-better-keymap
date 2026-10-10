<p align="right">
  <a href="./RELEASE_NOTES.md">English</a> · <strong>简体中文</strong>
</p>

# v1.0.0

[![GitHub](https://img.shields.io/badge/GitHub-Smallcarve%2Fdsh--better--keymap-181717?logo=github&logoColor=white)](https://github.com/Smallcarve/dsh-better-keymap)
[![Gitee](https://img.shields.io/badge/Gitee-Smallcarve%2Fdsh--better--keymap-c71d23?logo=gitee&logoColor=white)](https://gitee.com/Smallcarve/dsh-better-keymap)
[![npm](https://img.shields.io/npm/v/dsh-better-keymap)](https://www.npmjs.com/package/dsh-better-keymap)

**适用 DeepSeek Harness `0.2.0-rc.2` 及以上。**

第一个正式版。DeepSeek Harness 更好的快捷键管理。

---

## 与 Harness 自带设置页的区别

Harness 自带设置页会**拒绝**任何造成冲突的编辑：想把 `Ctrl+N` 从「新会话」改给别的命令，它只会告诉你「已被占用」，然后拒绝保存。

本插件把这条规则换成**后来者胜**：

- **后设覆盖前设** —— 新组合直接生效，原先占用它的命令被解绑。
- **明确告知** —— 浮层提示列出被清空的命令名与它原来的键位。
- **唯一事实来源** —— 插件自己的键位表说了算，并镜像进 Harness 的键位配置，保证按键按你看到的样子派发。

## 主要功能

- **绝大多数命令可改键**：逐条可改、可置空、可恢复默认。
- **输入框三键也可改绑**：「发送消息」「换行」「使用互补的 Queue／Steer 方式」原本是固定键，现在可以改键、也可以置空，由插件的按键翻译层完成。
- **界面即官方界面**：沿用 Harness 自己的设置页结构、文案与交互，以独立浮层取代官方入口。
- **保留规则集中一处判定**：六个保留单键（`Enter`、`Esc`、`/`、`@`、`↑`、`↓`，其中 `Enter` 对输入框三键豁免）与两个保留组合（`Shift+Enter`、`Ctrl+Enter`，仅对普通命令），录制预览与保存使用同一份结论，**被拒绝的赋值不写入任何内容**。
- **纯插件实现**：不修改 Harness 任何源码，只用公开的 `ctx.shortcuts`、`ctx.slots`、`ctx.locale` 服务。

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

`lib/` 已预构建，**安装后无需构建**。

## 质量状态

- 自动化检查 **114 项，全部通过**（8 个文件），覆盖协议层、仲裁、输入框三键翻译、失败路径与 jsdom 真实组件渲染。
- 构建**可复现**：同样的源码在任何目录、任何机器上产出逐字节相同的 `lib/client.js`，克隆后重新构建不会产生任何差异。
- 未自动化覆盖的部分：安装与界面实测需在真实 Harness 中人工确认。

## 仓库

- GitHub（主）：https://github.com/Smallcarve/dsh-better-keymap
- Gitee（国内镜像）：https://gitee.com/Smallcarve/dsh-better-keymap
- npm：https://www.npmjs.com/package/dsh-better-keymap

## 许可

MIT
