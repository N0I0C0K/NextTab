# NextTab - Chrome Extension Development Guide

## Architecture Overview

This is a **Chrome extension** built as a **pnpm monorepo** using **Turbo** for orchestration. The extension replaces the new tab page with a customizable start interface featuring search, quick links, history search, and MQTT-based event notifications.

### Monorepo Structure

```
chrome-extension/     # Core extension (manifest, background script)
pages/               # Extension UI pages (new-tab, popup, options, etc.)
  new-tab/          # Main new tab replacement page
  popup/            # Extension popup
  options/          # Settings page
  side-panel/       # Chrome side panel
packages/            # Shared workspace packages
  shared/           # Common utilities, hooks, MQTT provider
  storage/          # Chrome storage abstraction layer
  ui/              # Reusable UI components (shadcn/ui based)
  i18n/            # Internationalization system
  hmr/             # Hot module replacement for dev
  vite-config/     # Shared Vite configuration
```

## Development Workflow

**Package Manager**: pnpm 9.9.0 (required)  
**Build Tool**: Turbo + Vite  
**Node Version**: >=18.19.1 (see `.nvmrc`)

### Essential Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Start dev mode with watch (Chrome)
pnpm dev:firefox         # Start dev mode for Firefox
pnpm build               # Production build (Chrome)
pnpm build:firefox       # Production build (Firefox)
pnpm lint                # Run ESLint with auto-fix
pnpm type-check          # TypeScript type checking across monorepo
pnpm update-version 1.2.3 # Update version in all packages
```

### Build System Behavior

- **Turbo orchestrates** package builds via `turbo.json` task definitions
- **`ready` task** runs first for shared packages (`@extension/shared`, `@extension/storage`) using esbuild via `build.mjs`
- **Pages and chrome-extension** use Vite with custom plugins
- **Browser targets**: Chrome (default) and Firefox via `__FIREFOX__` env variable
- **HMR enabled** in dev mode - extension auto-reloads on changes

## Code Patterns & Conventions

### TypeScript & Imports

- **Use `@typescript-eslint/consistent-type-imports`**: Import types with `import type { ... }`
- **No React imports needed**: `react/react-in-jsx-scope` is disabled
- **Path aliases** defined per package in `tsconfig.json` (e.g., `@src`, `@root`)

### Styling

- **Tailwind CSS** with custom config via `@extension/tailwindcss-config`
- **Class merging**: Use `cn()` utility from `@extension/ui` (combines `clsx` and `twMerge`)
- **VS Code setup**: `.vscode/settings.json` configures Tailwind IntelliSense for `cn`, `cva`, `clsx`
- **Prettier config**: Single quotes, no semicolons, 120 char width, trailing commas
- **shadcn/ui integration**: See `packages/ui/README.md` for adding components

### Storage System

All storage uses custom wrappers from `@extension/storage`:

```typescript
import { settingStorage, quickUrlStorage } from '@extension/storage'
import { useStorage } from '@extension/shared'

// In React components
const settings = useStorage(settingStorage)

// Update with deep merge
await settingStorage.update({ wallpaperUrl: 'https://...' })

// In background scripts
const settings = await settingStorage.get()
```

**Storage types**: `BaseStorage` abstraction supports `StorageEnum.Local`, `StorageEnum.Sync`, `StorageEnum.Session`  
**Live updates**: Storage changes propagate via `liveUpdate: true` option

### MQTT Event System

Background script manages MQTT connection for cross-device notifications:

- **Provider**: `generateClient()` from `@extension/shared` creates MQTT connection
- **Event center**: `generateEventCenter()` manages topic subscriptions
- **Example**: "Drink water" reminder events sync via MQTT (`drink-water/launch`, `drink-water/confirm`)
- **Configuration**: Settings stored in `settingStorage.mqttSettings` (broker URL, secret key)
- **Background lifecycle**: Connection setup in `chrome-extension/src/background/index.ts`

### Internationalization (i18n)

- **Chrome i18n API wrapper** with type safety
- **Translation files**: `packages/i18n/locales/{locale}/messages.json`
- **Usage**: `import { t } from '@extension/i18n'` then `t('translationKey')`
- **Auto-generation**: i18n types are generated automatically during `pnpm dev` and `pnpm build`
- **Types**: Ensures all locales have matching keys (compile-time check)

### Component Structure

- **Pages** export a main component (e.g., `NewTab.tsx`) rendered in `index.tsx`
- **Shared components** in `@extension/ui` for cross-page reuse
- **Page-specific components** in `pages/{page}/src/components/`
- **HOCs available**: `withErrorBoundary`, `withSuspense` from `@extension/shared`

## Adding New Features

### Adding a New Page

1. Copy an existing page structure (e.g., `pages/popup`)
2. Update `package.json` with dependencies
3. Create `vite.config.mts` with entry point
4. Add to `chrome-extension/manifest.js` if needed
5. Ensure `pnpm-workspace.yaml` includes the directory

### Adding a Storage Type

1. Create storage in `packages/storage/lib/impl/` using `createStorage()`
2. Define TypeScript types
3. Export from `packages/storage/lib/impl/index.ts`
4. Use `useStorage()` hook in React components

### Adding UI Components

Follow `packages/ui/README.md` for shadcn/ui components:
- Run `pnpm dlx shadcn@latest add {component} -c ./packages/ui`
- Export from `packages/ui/lib/components/ui/index.ts`
- Use `withUI()` in consuming page's `tailwind.config.ts`

## Version Management

Use `pnpm update-version <version>` to update all `package.json` files atomically (see `UPDATE-PACKAGE-VERSIONS.md`).

## Testing

- **E2E tests**: `pnpm e2e` (builds, zips, then runs tests)
- **Test location**: `tests/e2e/`
- Limited test infrastructure currently present

## Browser Compatibility

- **Chrome**: Full support (side panel API)
- **Firefox**: Compatible build via `__FIREFOX__` env (excludes side panel)
- Manifest v3 with webextension-polyfill for cross-browser APIs
