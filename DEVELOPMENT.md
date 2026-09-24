# 开发指南

NextTab 是一个基于 [WXT](https://wxt.dev/) 和 React 18 的单项目浏览器扩展。

## 环境与启动

- Node.js >= 20.19（见 `.nvmrc`）
- pnpm 9.9

```bash
pnpm install
pnpm dev             # Chrome/Edge，WXT 会启动浏览器并热更新
pnpm dev:firefox     # Firefox MV3
```

如果要手动加载生产构建，运行 `pnpm build` 后在 Chromium 的扩展管理页加载 `.output/chrome-mv3`。

## 常用命令

```bash
pnpm type-check      # WXT 类型生成 + TypeScript
pnpm lint
pnpm format
pnpm test            # Vitest 单元测试
pnpm test:e2e        # 构建后用 Playwright 测试真实 Chromium 扩展
pnpm build
pnpm build:firefox
pnpm zip
pnpm zip:firefox
pnpm check           # 类型、lint、单测及双浏览器构建
```

首次运行 E2E 前需要安装浏览器：

```bash
pnpm exec playwright install chromium
```

## 项目结构

```text
entrypoints/          WXT 入口：background、newtab、popup
components/           共享 React 组件
hooks/                共享 hooks
utils/                业务工具、消息、MQTT、i18n 和 storage
assets/               参与打包的全局样式
public/               图标、图片和浏览器 locales
e2e/                  Playwright 扩展测试
wxt.config.ts         manifest 与 WXT 配置
```

WXT 根据 `entrypoints` 自动生成 manifest。新增扩展页面时按 WXT entrypoint 约定创建目录和 `index.html`，无需手写多套 Vite 配置。

## 存储

普通设置在 `utils/storage/impl` 中通过 WXT `storage.defineItem` 声明：

```ts
export const exampleStorage = storage.defineItem<string>('local:example-key', {
  fallback: '',
})

const value = await exampleStorage.getValue()
await exampleStorage.setValue('next')
const unwatch = exampleStorage.watch(value => console.log(value))
```

React 组件用 `useStorage(item)` 订阅。涉及“读取后更新”的业务操作应放在 storage 模块的命名函数中，避免组件重复实现并发更新逻辑。

本地壁纸是例外：大体积 base64 继续放 IndexedDB，通过与 WXT item 相同的 `getValue/setValue/watch` 接口访问。

## 测试与发布

- 存储和纯逻辑使用 Vitest；扩展 API 使用 `wxt/testing/fake-browser`。
- newtab、popup 和 service worker 的集成行为使用 Playwright。
- `pnpm zip` 与 `pnpm zip:firefox` 在 `.output` 生成商店上传包。
- CI 会运行单测、Chrome E2E 和 Firefox 构建。

代码使用 TypeScript、Tailwind CSS、shadcn/ui 和 Prettier；提交前建议运行 `pnpm check`。
