# NextTab Development Guide

NextTab is built with [WXT](https://wxt.dev/), React, and TypeScript. The existing business directories are retained while WXT handles entrypoint discovery, development, manifest generation, and cross-browser packaging.

## Requirements

- Node.js >= 20.19 (see `.nvmrc`)
- pnpm 9.9.0

## Getting started

```bash
pnpm install
pnpm dev
```

Use `pnpm dev:firefox` for Firefox MV3 development.

## Commands

```bash
pnpm type-check
pnpm lint
pnpm lint:fix
pnpm build
pnpm build:firefox
pnpm zip
pnpm zip:firefox
pnpm e2e
pnpm e2e:firefox
```

Production directories are `.output/chrome-mv3` and `.output/firefox-mv3`. Release archives are also written to `.output`.

## Structure

```text
entrypoints/                 # WXT background, new-tab, and popup entrypoints
pages/new-tab/src/           # New-tab business UI
pages/popup/src/             # Popup business UI
chrome-extension/src/        # Background business logic
chrome-extension/public/     # Icons and static assets
packages/i18n/               # Locales and translation wrapper
packages/shared/             # Shared hooks, utilities, and MQTT support
packages/storage/            # chrome.storage abstractions
packages/ui/                 # Shared UI components
modules/legacy-assets.ts     # Connects existing assets and locales to WXT
wxt.config.ts                # Manifest, aliases, and WXT configuration
```

Keep `entrypoints/` thin. Business logic belongs in the existing page, background, and package directories. Add permissions and other manifest fields in `wxt.config.ts`.

The root `tailwind.config.ts` scans all UI source directories. Translation files under `packages/i18n/locales/{locale}/messages.json` are copied to `_locales` during WXT builds.

Load `.output/chrome-mv3` as an unpacked Chromium extension. In Firefox, load `.output/firefox-mv3/manifest.json` from `about:debugging` for temporary testing.
