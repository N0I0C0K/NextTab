# Development Guide

NextTab is a single-project browser extension built with [WXT](https://wxt.dev/) and React 18.

## Setup

- Node.js >= 24.22.1 (development and CI use the version pinned in `.nvmrc`)
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
pnpm icons:generate  # Generate icons and wordmarks from the SVG source
pnpm update-version 1.5.1 # Update both manifests and ZIP filenames through package.json
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

See [Brand assets](doc/BRANDING.md) for the Logo source, exports, and usage.

See [Store submission materials](doc/STORE_LISTING.md) for package files, permission purposes, and the first Firefox submission. The Firefox build targets desktop 140+, with its stable ID and optional MQTT data consent declared in `wxt.config.ts`. Keep the same ID when signing and updating.

When completing a feature, user-visible improvement, or bug fix, update the top `Unreleased / 未发布` draft in the [Changelog](CHANGELOG.md) in the same change, keeping Chinese and English entries aligned. Update existing entries as a feature evolves and remove entries for reverted features; do not append a bullet for each commit or draft iteration. Describe the behavior and benefit to users. Internal refactors, tests, and documentation-only edits need no entry unless they affect users. Ordinary feature work does not itself trigger a version bump or release.

Before publishing, reconcile the draft against the changes actually shipping since the previous published version. Merge overlapping entries, remove reverted or unshipped work and implementation chatter, group by user-facing topic, and edit concise notes with matching Chinese and English content. Use these finalized notes for the changelog, GitHub Release, and store release descriptions.

After editing, move the finalized notes to a section with the version and release date, retaining an empty Unreleased section. Run `pnpm update-version <version>` and update the source version in both READMEs. WXT generates Chrome and Firefox manifest versions from the root `package.json`; About reads the installed manifest version.

After `pnpm check`, `pnpm test:release`, and `pnpm test:e2e`, run `pnpm zip` and `pnpm zip:firefox`. Verify the packaged manifests, icons, and pages. Use the matching `v<version>` GitHub Release tag and consolidated changelog entry. Publishing a stable Release triggers validation, tests, builds, and asset storage; explicitly enabling store publishing also submits Chrome and Firefox independently. Store writes are disabled by default. Manual runs support build, read-only check, upload, and submit modes. See the [release runbook](doc/RELEASING.md) for credentials, operations, artifact reuse, and recovery. Upload production ZIPs to stores and use `public/icon-128.png` as the icon.
