# NextTab project guidance

## Project map and product rules

NextTab is a WXT browser extension using React and TypeScript. Read [DEVELOPMENT.md](DEVELOPMENT.md) for setup, storage conventions, testing, and release commands, and [doc/DESIGN_REQUIREMENTS.md](doc/DESIGN_REQUIREMENTS.md) for established product behavior. User decisions in the current task take precedence over older documentation.

- `entrypoints/newtab/`: homepage, command modes, settings, and page lists.
- `entrypoints/background/`: extension background tasks and foreground activity collection.
- `entrypoints/popup/`: toolbar popup.
- `components/shared/`: shared UI and typography; `utils/storage/`: persisted settings and update operations.
- `e2e/`: Playwright tests against the built Chromium extension. Unit tests live alongside the relevant code.

## Requirement drafts and design artifacts

Keep requirement documents, proposals, interaction drafts, design mockups, and their screenshots in `artifacts/requirements/<topic>/`, which is ignored by Git. Preserve these materials locally when preparing commits and PRs; do not stage them or force-add ignored files. Keep durable agent workflow rules in this file. Update existing maintained developer and product reference documents when an implemented change makes them inaccurate.

## Parallel work and Git scope

When the user requests parallel work, use a separate worktree and a `codex/` branch. Before moving uncommitted work, copy it with its untracked files, verify the copies, and restore only the original changes that were moved. Leave unrelated work intact. Run installs, builds, and tests from the assigned worktree so generated output does not interfere with other chats.

Base independent PRs on the current target branch and include only the requested changes. Check staged files before committing, especially when the starting checkout contains unfinished release work or local design artifacts.

## UI and styling changes

Read [.agents/skills/nexttab-ui-style/SKILL.md](.agents/skills/nexttab-ui-style/SKILL.md) when changing visible UI, spacing, dialog sizing, or responsive layouts. Apply its project conventions while preserving the user's requested scope and visual direction.

Treat responsive behavior as part of the change: give desktop content sufficient space, adapt information hierarchy on narrow screens, and keep short-window content and controls reachable. Inspect the outer container's sizing before adjusting its children.

For layout changes, inspect representative desktop, narrow, and short-window renderings. Check long titles/URLs, localized metadata, overflow, and keyboard selection in the affected component. Passing functional tests alone does not establish that the layout is comfortable.

## State, data, and localization

Use the existing storage modules and `useStorage` subscriptions for persisted settings. Keep read-modify-write operations in storage helpers. For async queries, prevent stale results from overwriting a newer query and retain the existing failure and retry behavior.

Preserve current Profile and normal/incognito boundaries when reading tabs, activity, or history. Follow the documented URL identity rules for each feature; do not assume that search results, saved links, and recommendation records have the same identity.

Reuse `utils/i18n` and `public/_locales/` for visible strings, with existing platform-aware shortcut conventions. Reuse current extension API and message patterns.

## Changelog and releases

When implementing a feature, user-visible improvement, or bug fix, update the top `Unreleased / 未发布` section of [CHANGELOG.md](CHANGELOG.md) in the same change. Treat it as a concise working draft: update an existing entry when iterating on the same feature, remove entries for reverted changes, and avoid a new bullet for every commit or draft iteration. Keep Simplified Chinese and English entries aligned and describe the behavior and benefit to users. Internal refactors, tests, and documentation-only edits do not need entries unless they affect users. Preserve published version history.

When the user requests a release, first reconcile the draft against the changes actually shipping since the previous published version. Merge overlapping entries, remove reverted or unshipped work and implementation chatter, group by user-facing topic, and rewrite concise release notes with matching Chinese and English content. Only then move the finalized notes into a version section with its release date and retain an empty Unreleased section. Use these finalized notes for GitHub and store release descriptions. Follow [DEVELOPMENT.md](DEVELOPMENT.md) to update versions, validate, package, and publish; ordinary feature work does not itself authorize a version bump or release.

## Verification and review

Choose checks for the changed behavior and use [DEVELOPMENT.md](DEVELOPMENT.md) for the commands:

- Logic and state changes: relevant Vitest tests; extension API interactions and user flows: relevant Playwright E2E.
- TypeScript changes: `pnpm type-check` and `pnpm lint`; UI or extension integration changes: appropriate builds and rendered layout checks.
- Check formatting on changed files and run `git diff --check`. Documentation-only changes need reference and formatting checks.

For code review, use [.agents/skills/nexttab-code-review/SKILL.md](.agents/skills/nexttab-code-review/SKILL.md). For recommendation, activity-log, tab-matching, or long-list performance work, use [.agents/skills/nexttab-performance/SKILL.md](.agents/skills/nexttab-performance/SKILL.md). Run independent agents only when authorized by the user or applicable instructions. Report what was actually verified and any remaining limitations in the PR.
