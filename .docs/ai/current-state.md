# Current State

## Summary

Schedule Studio is a public MIT-licensed SvelteKit app with local SQLite persistence, fictional first-run seed data, saved schedule versions for active/default and sandbox planning, Docker packaging, 5-minute timeline precision, vertical and horizontal timeline layouts, unified item editing, hover-to-add calendar controls, and a built-in 20-theme engine.

## Build Status

Passing: `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`.

## Notes

- Runtime data lives under `.local/` by default and is ignored by git.
- Docker runtime data lives in `/data` by default and should be mounted as a volume.
- User-specific schedules should be written only to ignored local SQLite databases, not committed as seed data.
- The approved visual target is the no-sidebar dark concept generated during planning.
