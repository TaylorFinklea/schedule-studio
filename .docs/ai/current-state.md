# Current State

## Summary

Schedule Studio is a public MIT-licensed SvelteKit app with local SQLite persistence, fictional first-run seed data, saved schedule versions for active/default and sandbox planning, nullable per-template week anchoring, Docker/Home Assistant add-on packaging, 5-minute timeline precision, vertical and horizontal timeline layouts, right-sidebar item/settings editing, hover-to-add calendar controls, a built-in 20-theme engine, and a two-level category hierarchy (parent categories with optional subcategories; budgets roll up parent + children while keeping independent targets/colors).

## Build Status

Latest verification (0.1.5 version bump, 2026-06-03): `pnpm check` (0 errors), `pnpm test` (10 passing). Previous same-session verification for week anchoring + bounds controls: `pnpm build` OK, focused `pnpm test:e2e tests/e2e/planner.spec.ts -g "schedule week picker|rows view keeps|visible time caps"` OK (6 passing: chromium + mobile). `pnpm lint` still fails on pre-existing repo-wide formatting noise outside the touched set (`.pnpm-store`, `AGENTS.md`, `pnpm-lock.yaml`, older source files); touched TS/Svelte/e2e files pass scoped Prettier check.

## Recent Changes

- Schedule settings: nullable `templates.week_start_date` (migration 0007); date-less schedules render weekday-only labels, dated schedules show anchored week labels and support prev/next/date picker updates. New settings controls apply visible start/end caps to all days.
- Version bumped to `0.1.5` in `package.json` and `home-assistant/schedule-studio/config.yaml`; add-on changelog updated so Home Assistant recognizes the update.
- Rows layout day labels are sticky at the left edge during horizontal timeline scroll.
- Reparent existing categories via a per-row "Parent" dropdown in CategoryEditor (rendered only when the category has no children). `updateCategory` reassigns `sort_order` to the end of the destination sibling group on a move. Committed but NOT yet released to HA (no version bump since 0.1.3).

## Notes

- Runtime data lives under `.local/` by default and is ignored by git.
- Docker runtime data lives in `/data` by default and should be mounted as a volume.
- Home Assistant add-on runtime data also lives in `/data/schedule-studio.sqlite`; the add-on uses Ingress and keeps port `3000` unexposed by default.
- User-specific schedules should be written only to ignored local SQLite databases, not committed as seed data.
- The approved visual target is the no-sidebar dark concept generated during planning.
