# Development Guide

This document provides development-related information for the NextTab project.

## 📖 Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Development Mode](#development-mode)
- [Common Commands](#common-commands)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
  - [Adding a New Page](#adding-a-new-page)
  - [Adding a Storage Type](#adding-a-storage-type)
  - [Adding UI Components](#adding-ui-components)
- [Build and Package](#build-and-package)
- [Testing](#testing)
- [Code Standards](#code-standards)

## Requirements

- Node.js >= 18.19.1 (see `.nvmrc`)
- pnpm >= 9.9.0 (required)
- Git

## Quick Start

1. **Clone the Repository**
   ```bash
   git clone https://github.com/N0I0C0K/NextTab.git
   cd NextTab
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Start Development Mode**
   ```bash
   # Chrome development mode (with hot reload)
   pnpm dev
   
   # Firefox development mode
   pnpm dev:firefox
   ```

4. **Load into Browser**
   
   **Chrome/Edge:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory
   
   **Firefox:**
   - Open `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json` in the `dist` directory

## Development Mode

Development mode supports Hot Module Replacement (HMR), and the extension automatically reloads when files are modified.

```bash
# Chrome development mode
pnpm dev

# Firefox development mode
pnpm dev:firefox
```

Development mode features:
- Automatic compilation and reload
- Source map support
- Fast iteration development

## Common Commands

```bash
# Type checking
pnpm type-check

# Linting and auto-fix
pnpm lint

# Code formatting
pnpm prettier

# Production build
pnpm build           # Chrome
pnpm build:firefox   # Firefox

# Package as zip file (for publishing)
pnpm zip
pnpm zip:firefox

# Run E2E tests
pnpm e2e

# Update version
pnpm update-version <version>
```

## Project Structure

This is a pnpm + Turbo based Monorepo project:

```
chrome-extension/     # Core extension (manifest, background script)
pages/               # Extension UI pages
  new-tab/          # Main new tab replacement page
  popup/            # Extension popup
  options/          # Settings page
  side-panel/       # Chrome side panel
packages/            # Shared workspace packages
  shared/           # Common utilities, hooks, MQTT provider
  storage/          # Chrome storage abstraction layer
  ui/              # Reusable UI components (based on shadcn/ui)
  i18n/            # Internationalization system
  hmr/             # Hot module replacement support
  vite-config/     # Shared Vite configuration
```

### Tech Stack

- **Framework**: React 18
- **Language**: TypeScript
- **Build Tools**: Vite + Turbo
- **Package Manager**: pnpm workspaces
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: React Hooks + Chrome Storage API
- **Testing**: E2E testing framework

## Development Workflow

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

Example:
```typescript
import { settingStorage } from '@extension/storage'
import { useStorage } from '@extension/shared'

// In component
const settings = useStorage(settingStorage)

// Update (supports deep merge)
await settingStorage.update({ wallpaperUrl: 'https://...' })
```

### Adding UI Components

Follow `packages/ui/README.md` for shadcn/ui components:

```bash
# Add component
pnpm dlx shadcn@latest add {component} -c ./packages/ui

# Export from packages/ui
# Add export in packages/ui/lib/components/ui/index.ts

# Use withUI() in consuming page's tailwind.config.ts
```

## Build and Package

### Development Build

```bash
pnpm dev        # Chrome
pnpm dev:firefox # Firefox
```

### Production Build

```bash
pnpm build        # Chrome
pnpm build:firefox # Firefox
```

Build output is in the `dist/` directory.

### Package for Release

```bash
# Package as zip (for store upload)
pnpm zip          # Chrome
pnpm zip:firefox  # Firefox
```

Generated zip files are in the project root directory.

## Testing

### E2E Tests

```bash
pnpm e2e
```

Test location: `tests/e2e/`

Note: Current test infrastructure is limited, contributions welcome.

## Code Standards

### TypeScript

- Use `import type { ... }` for type imports
- No need to explicitly import React (globally configured)
- Use path aliases (e.g., `@src`, `@root`)

### Styling

- Use Tailwind CSS
- Use `cn()` utility for class merging (from `@extension/ui`)
- Follow shadcn/ui component patterns

### Formatting

- Single quotes
- No semicolons
- 120 character width
- Trailing commas
- See `.prettierrc` for details

### Commit Convention

It's recommended to follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug
docs: documentation update
style: code formatting adjustment
refactor: code refactoring
test: test related
chore: build/toolchain update
```

## Additional Resources

- [copilot-instructions.md](.github/copilot-instructions.md) - Detailed architecture and development guide
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Vite Documentation](https://vitejs.dev/)
- [Turbo Documentation](https://turbo.build/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)

## Contributing

Issues and Pull Requests are welcome! Please ensure:

1. Code passes `pnpm lint` and `pnpm type-check`
2. Follow project code standards
3. Add necessary comments and documentation
4. Test your changes

---

Back to [README.en.md](README.en.md)
