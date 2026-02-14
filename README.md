<div align="center">

<h1>NextTab</h1>
<p>一个聚焦效率的浏览器起始界面，简洁且现代</p>

[![](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![](https://img.shields.io/badge/Typescript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![](https://badges.aleen42.com/src/vitejs.svg)](https://vitejs.dev/)
[![GitHub License](https://img.shields.io/github/license/N0I0C0K/NextTab?style=flat-square)](https://github.com/N0I0C0K/NextTab/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/N0I0C0K/NextTab?style=flat-square)](https://github.com/N0I0C0K/NextTab/releases)

[English](README.en.md) | 简体中文

</div>

---

## 📖 目录

- [简介](#简介)
- [核心特性](#核心特性)
- [功能展示](#功能展示)
  - [快捷链接](#快捷链接)
  - [命令面板](#命令面板)
- [安装](#安装)
- [快捷键](#快捷键)
- [开发](#开发)
- [浏览器支持](#浏览器支持)
- [开源协议](#开源协议)
- [鸣谢](#鸣谢)

## 简介

NextTab 是一个专注于提升浏览器效率的新标签页扩展，采用简洁现代的设计风格。让你更快地找到并访问目标网站，专注于真正重要的事情。

![主界面截图](doc/images/main-screenshot.png)

## ✨ 核心特性

- 🔗 **高效快捷链接** - 快速访问常用网站，支持拖拽排序。右键菜单提供多种快捷指令
- 🎨 **个性化背景** - 自定义壁纸，默认集成 [Wallhaven](https://wallhaven.cc/) 高质量壁纸
- ⚡ **强大的命令面板** - 快速搜索标签页、书签、历史记录等（持续开发中）
- ⌨️ **键盘优先** - 完善的键盘快捷键支持，操作更高效
- 📱 **响应式设计** - 适配各种屏幕尺寸，提供一致体验
- 🔒 **隐私至上** - 本地运行，不收集用户数据
- 🌐 **跨设备同步** - 通过 MQTT 协议在多设备间同步数据（可选）

## 📸 功能展示

### 快捷链接

一键访问常用网站，通过拖拽轻松调整顺序：

![拖拽演示](doc/images/drag-and-drop-demo.gif)

#### 智能右键菜单

右键点击快捷链接，快速访问相关的标签页、书签和历史记录：

![右键菜单](doc/images/context-menu.png)

#### 快速查看访问历史

右键菜单中可以快速查看该域名下的最近访问记录，轻松回到之前浏览的页面：

![快速历史](doc/images/quick-history-demo.gif)

### 命令面板

使用快捷键 `Cmd/Ctrl + K` 唤起命令面板，快速搜索和执行操作：

![命令面板](doc/images/command-palette.png)

**历史搜索功能**

![历史搜索](doc/images/history-search-demo.gif)

## 🚀 安装

### 从商店安装（即将推出）

<!-- - [Chrome Web Store](#) -->
<!-- - [Firefox Add-ons](#) -->

### 手动安装（开发版）

1. **下载源码**
   ```bash
   git clone https://github.com/N0I0C0K/NextTab.git
   cd NextTab
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **构建扩展**
   ```bash
   # Chrome
   pnpm build
   
   # Firefox
   pnpm build:firefox
   ```

4. **加载扩展**
   
   **Chrome/Edge:**
   - 打开 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `dist` 目录
   
   **Firefox:**
   - 打开 `about:debugging#/runtime/this-firefox`
   - 点击"临时加载附加组件"
   - 选择 `dist` 目录中的 `manifest.json`

## 💻 开发

### 环境要求

- Node.js >= 18.19.1
- pnpm >= 9.9.0

### 开发模式

```bash
# Chrome 开发模式（支持热重载）
pnpm dev

# Firefox 开发模式
pnpm dev:firefox
```

### 常用命令

```bash
# 类型检查
pnpm type-check

# 代码检查和修复
pnpm lint

# 代码格式化
pnpm prettier

# 打包为 zip 文件
pnpm zip
pnpm zip:firefox

# 运行 E2E 测试
pnpm e2e
```

### 项目结构

这是一个基于 pnpm + Turbo 的 Monorepo 项目：

- `chrome-extension/` - 扩展核心（manifest、background）
- `pages/` - UI 页面（new-tab、popup、options 等）
- `packages/` - 共享包（UI 组件、存储、国际化等）

更多开发细节请参考 [copilot-instructions.md](.github/copilot-instructions.md)

## 🌐 浏览器支持

- ✅ Chrome/Edge (推荐)
- ✅ Firefox
- ⚠️ 其他基于 Chromium 的浏览器（未测试）

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

<div align="center">
  
**如果觉得有帮助，请给个 ⭐️ Star！**

Made with ❤️ by [N0I0C0K](https://github.com/N0I0C0K). Powered by [chrome-extension-boilerplate-react-vite](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)

</div>

