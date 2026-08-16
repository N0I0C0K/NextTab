# NextTab 开发指南

NextTab 使用 [WXT](https://wxt.dev/) + React + TypeScript 构建。项目保留原有业务目录，WXT 负责入口发现、开发服务器、Manifest 生成和跨浏览器打包。

## 环境要求

- Node.js >= 20.19（见 `.nvmrc`）
- pnpm 9.9.0

## 快速开始

```bash
pnpm install
pnpm dev
```

WXT 会启动 Chromium 开发模式并监听文件变更。Firefox 开发模式使用：

```bash
pnpm dev:firefox
```

## 常用命令

```bash
pnpm dev             # Chromium 开发模式
pnpm dev:firefox     # Firefox MV3 开发模式
pnpm type-check      # TypeScript 检查
pnpm lint            # ESLint 检查
pnpm lint:fix        # ESLint 自动修复
pnpm build           # Chromium 生产构建
pnpm build:firefox   # Firefox MV3 生产构建
pnpm zip             # Chromium 商店包
pnpm zip:firefox     # Firefox 商店包
pnpm e2e             # Chromium E2E
pnpm e2e:firefox     # Firefox E2E
```

构建结果位于 `.output/chrome-mv3` 和 `.output/firefox-mv3`，压缩包也会生成在 `.output`。

## 项目结构

```text
entrypoints/                 # WXT 入口：background、newtab、popup
pages/new-tab/src/           # 新标签页业务代码
pages/popup/src/             # Popup 业务代码
chrome-extension/src/        # 后台业务代码
chrome-extension/public/     # 图标等静态资源
packages/i18n/               # 翻译及类型安全封装
packages/shared/             # 通用 hooks、工具和 MQTT 能力
packages/storage/            # chrome.storage 封装
packages/ui/                 # 跨页面 UI 组件
modules/legacy-assets.ts     # 将既有静态资源和 locales 接入 WXT
wxt.config.ts                # Manifest、别名和 WXT 配置
```

`entrypoints/` 保持很薄，只连接 WXT 生命周期与既有业务模块。业务实现继续放在 `pages/`、`chrome-extension/src/` 和 `packages/` 中。

## 增加入口

按照 WXT 的文件约定在 `entrypoints/` 下增加入口。例如新建 `entrypoints/options/index.html` 和 `main.tsx` 可增加设置页；新增权限和 Manifest 字段统一写在 `wxt.config.ts`。

## 样式与组件

Tailwind 配置位于根目录 `tailwind.config.ts`，PostCSS 配置位于 `postcss.config.mjs`。共享组件从 `@extension/ui` 导入，新标签页内部代码可以使用 `@src` 或 `@newtab` 别名。

## 国际化与静态资源

翻译文件位于 `packages/i18n/locales/{locale}/messages.json`。`modules/legacy-assets.ts` 会在构建时复制为扩展要求的 `_locales` 目录，无需运行额外生成任务。静态图标继续放在 `chrome-extension/public`。

## 浏览器验证

Chromium 可在扩展管理页加载 `.output/chrome-mv3`。Firefox 可通过 `about:debugging` 临时加载 `.output/firefox-mv3/manifest.json`。涉及浏览器 API 时，应分别执行两个生产构建。
