# Current State

## Summary

Schedule Studio is a public MIT-licensed SvelteKit app with local SQLite persistence, fictional first-run seed data, a Tokyo Night-inspired dark planner UI, saved schedule versions for active/default and sandbox planning, Docker packaging, 5-minute timeline precision, deep zoom controls, and hover-to-add calendar controls for blocks and pins.

## Build Status

Passing: `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`.

## Notes

- Runtime data lives under `.local/` by default and is ignored by git.
- Docker runtime data lives in `/data` by default and should be mounted as a volume.
- User-specific schedules should be written only to ignored local SQLite databases, not committed as seed data.
- The approved visual target is the no-sidebar dark concept generated during planning.
