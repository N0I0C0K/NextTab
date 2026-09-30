# NextTab project guidance

## UI and styling changes

Read [.agents/skills/nexttab-ui-style/SKILL.md](.agents/skills/nexttab-ui-style/SKILL.md) when changing visible UI, spacing, dialog sizing, or responsive layouts. Apply its project conventions while preserving the user's requested scope and visual direction.

Treat responsive behavior as part of the change: give desktop content sufficient space, adapt information hierarchy on narrow screens, and keep short-window content and controls reachable. Inspect the outer container's sizing before adjusting its children.

For layout changes, inspect representative desktop, narrow, and short-window renderings. Check long titles/URLs, localized metadata, overflow, and keyboard selection in the affected component. Passing functional tests alone does not establish that the layout is comfortable.
