# Development Guide

NextTab is a single-project browser extension built with [WXT](https://wxt.dev/) and React 18.

## Setup

- Node.js >= 20.19 (see `.nvmrc`)
- pnpm 9.9

```bash
pnpm install
pnpm dev             # Chrome/Edge with WXT reload
pnpm dev:firefox     # Firefox MV3
```

To load a production build manually, run `pnpm build` and load `.output/chrome-mv3` as an unpacked Chromium extension.

## Commands

```bash
pnpm type-check
pnpm lint
pnpm format
pnpm test            # Vitest unit tests
pnpm test:e2e        # Build and test the real Chromium extension
pnpm build
pnpm build:firefox
pnpm zip
pnpm zip:firefox
pnpm check           # Types, lint, unit tests, and both browser builds
```

Install the Playwright browser before the first E2E run:

```bash
pnpm exec playwright install chromium
```

## Structure

```text
entrypoints/          WXT background, newtab, and popup entrypoints
components/           Shared React components
hooks/                Shared hooks
utils/                Utilities, messaging, MQTT, i18n, and storage
assets/               Bundled global styles
public/               Icons, images, and browser locales
e2e/                  Playwright extension tests
wxt.config.ts         Manifest and WXT configuration
```

WXT generates the manifest from `entrypoints`. Add extension pages using WXT entrypoint conventions instead of creating page-specific Vite configurations.

## Storage

Define normal settings in `utils/storage/impl` with WXT storage:

```ts
export const exampleStorage = storage.defineItem<string>('local:example-key', {
  fallback: '',
})

const value = await exampleStorage.getValue()
await exampleStorage.setValue('next')
const unwatch = exampleStorage.watch(value => console.log(value))
```

React components subscribe through `useStorage(item)`. Put read-modify-write operations in named storage functions so concurrency handling stays centralized.

Local wallpaper data remains in IndexedDB because large base64 values should not consume extension storage quota. Its adapter exposes the same `getValue/setValue/watch` shape.

## Tests and Releases

- Use Vitest and `wxt/testing/fake-browser` for storage and extension API unit tests.
- Use Playwright for newtab, popup, and service worker integration tests.
- `pnpm zip` and `pnpm zip:firefox` create store packages in `.output`.
- CI runs unit tests, Chrome E2E, and a Firefox build.

The project uses TypeScript, Tailwind CSS, shadcn/ui, and Prettier. Run `pnpm check` before submitting changes.
