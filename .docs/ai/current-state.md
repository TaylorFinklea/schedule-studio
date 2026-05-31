# Current State

## Summary

Schedule Studio is a public MIT-licensed SvelteKit app with local SQLite persistence, fictional first-run seed data, saved schedule versions for active/default and sandbox planning, Docker/Home Assistant add-on packaging, 5-minute timeline precision, vertical and horizontal timeline layouts, right-sidebar item/settings editing, hover-to-add calendar controls, and a built-in 20-theme engine.

## Build Status

Latest verification: `pnpm check`, `pnpm test`, `pnpm build`, local Docker image build, `/healthz` container smoke test, Home Assistant Ingress header smoke test. `pnpm test:e2e` was run; the new "set default" test passes, and pre-existing e2e failures (todo-sidebar "Add" button colliding with toolbar "Add" button locator in existing tests) are unrelated to this change.

## Recent Changes

- Todo sidebar is now collapsible to a 40px strip (persisted in `localStorage` as `schedule-studio-todo-collapsed`).

## Notes

- Runtime data lives under `.local/` by default and is ignored by git.
- Docker runtime data lives in `/data` by default and should be mounted as a volume.
- Home Assistant add-on runtime data also lives in `/data/schedule-studio.sqlite`; the add-on uses Ingress and keeps port `3000` unexposed by default.
- User-specific schedules should be written only to ignored local SQLite databases, not committed as seed data.
- The approved visual target is the no-sidebar dark concept generated during planning.
