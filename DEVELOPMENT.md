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
pnpm test:perf       # 生产构建 + 推荐与长列表性能测量（原速／6 倍 CPU 降速）
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

界面实现遵循 [界面设计要求](doc/DESIGN_REQUIREMENTS.md)，包括说明默认收起、信息按钮交互和页面详情的数据口径。

推荐计算、日志存储与长列表的复杂度和测量边界见 [推荐性能评估](doc/RECOMMENDATION_PERFORMANCE.md)。

性能复测流程已固化为项目 skill：[nexttab-performance](.agents/skills/nexttab-performance/SKILL.md)。可运行 `pnpm test:perf <唯一标签>` 保留独立测量结果，覆盖评分、真实 IndexedDB 和大量标签结果下的生产界面。

代码审查流程见 [nexttab-code-review](.agents/skills/nexttab-code-review/SKILL.md)：检查正确性、事件竞态、数据隔离和失败恢复，按授权修复并复核；复杂度取舍另用 [ponytail-review](.agents/skills/ponytail-review/SKILL.md)。

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

## 推荐日志排查

开发／测试构建中，“回到页面”标题右侧有“导出事件日志”按钮。点击下载 `nexttab-events-<时间>.json`，包含当前 Profile 保留的完整页面映射、原始事件、活动 view、统计时刻、当前打开页面 `openTabs` 和评分参数；记录按既有 10 天／2 MiB 规则保留。`openTabs` 用于复现 1.3 的打开标签系数；旧导出缺少此字段时只能回放使用分。生产构建不显示此入口。

开发／测试构建的 Console 中，`[NextTab:return-pages]` 分为评分和显示两个阶段。评分日志包含最多 5 个候选和最近最多 5 个无可配对记录的页面，检查 `reason`、`rawSegments`、`mergedViews`、`observed`、`lastEvent` 和 `breakdown.days` 的每日贡献及衰减；候选的 `usageScore` 是使用分，`openTabMultiplier` 是本次打开状态的系数（打开 1.3、关闭 1），`score` 是最终排序分。显示阶段只应用用户隐藏页面和排除站点的偏好，不再过滤已保存网站首页。评分公式见 [界面设计要求](doc/DESIGN_REQUIREMENTS.md#推荐评分)。

需要核对原始进入／离开事件时，在扩展新标签页的 DevTools Console 中执行以下代码。替换 `target` 为待排查的页面地址，按站点和路径匹配；结果复制到剪贴板，只包含该页面的事件。不要把完整 Profile 的事件加入自动 Console 输出。

```js
{
  const target = new URL('https://github.com/N0I0C0K')
  const s = await chrome.runtime.sendMessage({ type: 'nexttab:page-activity-snapshot' })
  if (!s?.pages || !s?.events) throw new Error('未取得日志快照')
  const page = s.pages.find(p => p.key === `${target.origin}${target.pathname}`)
  copy(
    JSON.stringify(
      {
        now: s.now,
        activeViewId: s.activeViewId,
        page: page ?? null,
        events: page ? s.events.filter(e => e.pageId === page.id) : [],
      },
      null,
      2,
    ),
  )
}
```

快照请求会校正当前前台状态；它不会清空或改写已有事件。推荐日志只展示筛选后的摘要，不能据此推断未输出的页面没有被记录。
