# Current State

## Summary

Schedule Studio is a public MIT-licensed SvelteKit app with local SQLite persistence, fictional first-run seed data, saved schedule versions for active/default and sandbox planning, Docker/Home Assistant add-on packaging, 5-minute timeline precision, vertical and horizontal timeline layouts, right-sidebar item/settings editing, hover-to-add calendar controls, a built-in 20-theme engine, and a two-level category hierarchy (parent categories with optional subcategories; budgets roll up parent + children while keeping independent targets/colors).

## Build Status

Latest verification (subcategories feature, 2026-05-31): `pnpm check` (0 errors), `pnpm test` (8 passing, +2 new for rollup/ordering), `pnpm build` OK. Manual API smoke test on a temp DB confirmed: migration 0006 adds `parent_id`, child create, depth-2 guard (400), delete-parent-with-children (409), reparent-with-children guard (400), reparent of a childless category (200), and page render (200). `pnpm test:e2e` not re-run this session; pre-existing e2e failures (todo-sidebar "Add" vs toolbar "Add" locator collision) are unrelated.

## Recent Changes

- Subcategories: `categories.parent_id` self-FK (migration 0006), parent/child item assignment, rolled-up parent budgets, grouped pickers, per-parent "Add subcategory" in CategoryEditor, archive-hides-subtree, depth capped at 2. New helper `orderedVisibleCategories()` in `schedule.ts`.
- Todo sidebar is now collapsible to a 40px strip (persisted in `localStorage` as `schedule-studio-todo-collapsed`).

## Notes

- Runtime data lives under `.local/` by default and is ignored by git.
- Docker runtime data lives in `/data` by default and should be mounted as a volume.
- Home Assistant add-on runtime data also lives in `/data/schedule-studio.sqlite`; the add-on uses Ingress and keeps port `3000` unexposed by default.
- User-specific schedules should be written only to ignored local SQLite databases, not committed as seed data.
- The approved visual target is the no-sidebar dark concept generated during planning.
