# Shared UI

Reusable React components and styles for NextTab live in this directory.

Import exported components from the root alias:

```tsx
import { Button, cn } from '@extension/ui'
```

Add component exports through `packages/ui/lib/components/index.ts` (or its nested index) and expose public APIs from `packages/ui/index.ts`.

Tailwind is configured once at the repository root in `tailwind.config.ts`; it already scans this directory. Global UI styles are imported by each WXT page entry as needed. To add a shadcn component, run its CLI from the repository root and review the generated aliases before committing it.
