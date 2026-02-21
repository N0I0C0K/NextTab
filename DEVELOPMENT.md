# 开发指南

本文档提供 NextTab 项目的开发相关信息。

## 📖 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [开发模式](#开发模式)
- [常用命令](#常用命令)
- [项目结构](#项目结构)
- [开发工作流](#开发工作流)
  - [添加新页面](#添加新页面)
  - [添加存储类型](#添加存储类型)
  - [添加 UI 组件](#添加-ui-组件)
- [构建与打包](#构建与打包)
- [测试](#测试)
- [代码规范](#代码规范)

## 环境要求

- Node.js >= 18.19.1（参考 `.nvmrc`）
- pnpm >= 9.9.0（必需）
- Git

## 快速开始

1. **克隆仓库**
   ```bash
   git clone https://github.com/N0I0C0K/NextTab.git
   cd NextTab
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **启动开发模式**
   ```bash
   # Chrome 开发模式（支持热重载）
   pnpm dev
   
   # Firefox 开发模式
   pnpm dev:firefox
   ```

4. **加载到浏览器**
   
   **Chrome/Edge:**
   - 打开 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `dist` 目录
   
   **Firefox:**
   - 打开 `about:debugging#/runtime/this-firefox`
   - 点击"临时加载附加组件"
   - 选择 `dist` 目录中的 `manifest.json`

## 开发模式

开发模式下支持热模块替换（HMR），文件修改后扩展会自动重新加载。

```bash
# Chrome 开发模式
pnpm dev

# Firefox 开发模式
pnpm dev:firefox
```

开发模式的特点：
- 自动编译和重新加载
- Source map 支持
- 快速迭代开发

## 常用命令

```bash
# 类型检查
pnpm type-check

# 代码检查和自动修复
pnpm lint

# 代码格式化
pnpm prettier

# 生产构建
pnpm build           # Chrome
pnpm build:firefox   # Firefox

# 打包为 zip 文件（用于发布）
pnpm zip
pnpm zip:firefox

# 运行 E2E 测试
pnpm e2e

# 更新版本号
pnpm update-version <version>
```

## 项目结构

这是一个基于 pnpm + Turbo 的 Monorepo 项目：

```
chrome-extension/     # 核心扩展（manifest、background 脚本）
pages/               # 扩展 UI 页面
  new-tab/          # 主新标签页替换页面
  popup/            # 扩展弹出窗口
  options/          # 设置页面
  side-panel/       # Chrome 侧边栏
packages/            # 共享工作区包
  shared/           # 通用工具、hooks、MQTT provider
  storage/          # Chrome storage 抽象层
  ui/              # 可复用 UI 组件（基于 shadcn/ui）
  i18n/            # 国际化系统
  hmr/             # 热模块替换支持
  vite-config/     # 共享 Vite 配置
```

### 技术栈

- **框架**: React 18
- **语言**: TypeScript
- **构建工具**: Vite + Turbo
- **包管理**: pnpm workspaces
- **样式**: Tailwind CSS
- **UI 组件**: shadcn/ui
- **状态管理**: React Hooks + Chrome Storage API
- **测试**: E2E 测试框架

## 开发工作流

### 添加新页面

1. 复制现有页面结构（如 `pages/popup`）
2. 更新 `package.json` 添加依赖
3. 创建 `vite.config.mts` 配置入口点
4. 如需要，在 `chrome-extension/manifest.js` 中添加配置
5. 确保 `pnpm-workspace.yaml` 包含该目录

### 添加存储类型

1. 在 `packages/storage/lib/impl/` 中使用 `createStorage()` 创建存储
2. 定义 TypeScript 类型
3. 从 `packages/storage/lib/impl/index.ts` 导出
4. 在 React 组件中使用 `useStorage()` hook

示例：
```typescript
import { settingStorage } from '@extension/storage'
import { useStorage } from '@extension/shared'

// 在组件中
const settings = useStorage(settingStorage)

// 更新（支持深度合并）
await settingStorage.update({ wallpaperUrl: 'https://...' })
```

### 添加 UI 组件

参考 `packages/ui/README.md` 使用 shadcn/ui 组件：

```bash
# 添加组件
pnpm dlx shadcn@latest add {component} -c ./packages/ui

# 从 packages/ui 导出
# 在 packages/ui/lib/components/ui/index.ts 中添加导出

# 在使用页面的 tailwind.config.ts 中使用 withUI()
```

## 构建与打包

### 开发构建

```bash
pnpm dev        # Chrome
pnpm dev:firefox # Firefox
```

### 生产构建

```bash
pnpm build        # Chrome
pnpm build:firefox # Firefox
```

构建输出位于 `dist/` 目录。

### 打包发布

```bash
# 打包为 zip（用于商店上传）
pnpm zip          # Chrome
pnpm zip:firefox  # Firefox
```

生成的 zip 文件位于项目根目录。

## 测试

### E2E 测试

```bash
pnpm e2e
```

测试位置：`tests/e2e/`

注意：目前测试基础设施较为有限，欢迎贡献。

## 代码规范

### TypeScript

- 使用 `import type { ... }` 导入类型
- 不需要显式导入 React（已全局配置）
- 使用路径别名（如 `@src`、`@root`）

### 样式

- 使用 Tailwind CSS
- 使用 `cn()` 工具合并类名（来自 `@extension/ui`）
- 遵循 shadcn/ui 的组件模式

### 格式化

- 单引号
- 无分号
- 120 字符宽度
- 尾随逗号
- 配置详见 `.prettierrc`

### Commit 规范

建议遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建/工具链更新
```

## 更多资源

- [copilot-instructions.md](.github/copilot-instructions.md) - 详细的架构和开发指南
- [Chrome Extension 文档](https://developer.chrome.com/docs/extensions/)
- [Vite 文档](https://vitejs.dev/)
- [Turbo 文档](https://turbo.build/)
- [shadcn/ui 文档](https://ui.shadcn.com/)

## 贡献

欢迎提交 Issue 和 Pull Request！请确保：

1. 代码通过 `pnpm lint` 和 `pnpm type-check`
2. 遵循项目的代码规范
3. 添加必要的注释和文档
4. 测试你的更改

---

返回 [README.md](README.md)
