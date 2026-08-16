# NextTab development notes

NextTab is a Manifest V3 browser extension built with WXT, React, TypeScript, and pnpm.

## Architecture

- `entrypoints/`: thin WXT entrypoints for background, new tab, and popup
- `pages/new-tab/src/`: new-tab business UI
- `pages/popup/src/`: popup business UI
- `chrome-extension/src/`: background business logic
- `packages/shared/`: shared hooks and utilities
- `packages/storage/`: typed Chrome storage abstractions
- `packages/ui/`: reusable UI components
- `packages/i18n/`: locales and typed translation wrapper
- `wxt.config.ts`: aliases and generated manifest configuration

Keep business logic outside `entrypoints/`; entrypoints should only connect WXT lifecycle functions to existing modules. Add extension permissions and manifest fields in `wxt.config.ts`.

## Commands

```bash
pnpm dev
pnpm dev:firefox
pnpm type-check
pnpm lint
pnpm build
pnpm build:firefox
pnpm zip
pnpm zip:firefox
```

Production outputs are `.output/chrome-mv3` and `.output/firefox-mv3`.

## Conventions

- Use type-only imports where appropriate.
- Use aliases from `wxt.config.ts`: `@extension/*`, `@src`, and `@newtab`.
- Use `@extension/storage` for persisted state and `useStorage` from `@extension/shared` in React.
- Use shared UI components from `@extension/ui` and `cn()` for class merging.
- Keep translations in `packages/i18n/locales/{locale}/messages.json`; the WXT asset module copies them into `_locales`.
- Run both Chromium and Firefox builds after changing background code, permissions, or browser APIs.
