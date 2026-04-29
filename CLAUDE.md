# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Live context

Before substantial work, read `.docs/ai/`:
- `current-state.md` — what's built and the current build status
- `decisions.md` — architectural decisions with dates
- `roadmap.md` and `next-steps.md` — what's next

These are kept up to date and supersede anything stale here.

## Commands

Package manager is **pnpm 10.25** (pinned via `packageManager`). Use it; don't fall back to npm/yarn.

```sh
pnpm dev              # Vite dev server (binds 0.0.0.0)
pnpm check            # svelte-kit sync + svelte-check (this is the typecheck — there is no separate tsc)
pnpm test             # vitest run (unit tests under src/**/*.{test,spec}.ts)
pnpm test:e2e         # Playwright; boots its own dev server on 127.0.0.1:5187
pnpm build            # production build (adapter-node)
pnpm preview          # node build (run the built app)
pnpm lint             # prettier --check
pnpm format           # prettier --write
```

Single-test runs:
```sh
pnpm vitest run src/lib/schedule.test.ts            # one file
pnpm vitest run -t "snapMinute"                     # by test name
pnpm test:e2e tests/e2e/planner.spec.ts -g "title"  # one Playwright test
```

Reset local DB / first-run seed:
```sh
rm -rf .local && pnpm dev
```

Override DB location (handy for trying schedules without touching `.local/`):
```sh
SCHEDULE_STUDIO_DB=/tmp/schedule.sqlite pnpm dev
```

## Architecture

Local-first SvelteKit app. The whole planner UI is one big `src/routes/+page.svelte` (~1.7k lines) — that's intentional, not tech debt to "refactor into components" without a reason.

### Data model

- **Time is integer minutes since midnight** (0–1440). All editing snaps to `SNAP_MINUTES = 5` via `snapMinute()` in `src/lib/schedule.ts`. Persistence stays integer minutes.
- **Items**: `kind = "block"` (has `endMinute`) or `"pin"` (no `endMinute`, instant timestamp). See `src/lib/types.ts`.
- **"Schedule version" = `templates` row in SQLite.** There is no separate "version" table. Active/default selection lives in the key/value `app_settings` table under keys `active_template_id` and `default_template_id`. Creating a version copies day_bounds + schedule_items into a new template row in a single transaction (`createVersion` in `src/lib/server/db.ts`).
- **UI preferences (layout, theme) are localStorage**, NOT in the DB. Schedule data is in SQLite. Don't mix these.
- **Date overrides**: `date_overrides` table exists in schema but the full override workflow is not yet implemented (see roadmap "Now").

### Persistence

- Driver is **Node's built-in `node:sqlite`** (chosen so the app has no native build step). `drizzle-orm` and `drizzle-kit` are in `package.json` but **not used at runtime** — the code in `src/lib/server/db.ts` is hand-written prepared statements over raw SQL. Don't introduce drizzle-orm imports in app code without explicit discussion.
- Migrations are raw SQL files in `migrations/`. `getDb()` opens the connection lazily, runs `migrations/0001_initial.sql` on every boot (idempotent CREATE TABLE IF NOT EXISTS), records the version in `schema_migrations`, and seeds fictional data if `categories` is empty. Adding a migration means adding another `.sql` file AND extending `runMigrations()`.
- DB path: `process.env.SCHEDULE_STUDIO_DB` or `.local/schedule-studio.sqlite`. Docker image defaults to `/data/schedule-studio.sqlite` on a mounted volume.
- Migration file is read from `process.cwd() + /migrations/...` — keep that path live in the runtime image (the Dockerfile copies `migrations/` for this reason).

### Routing & data flow

- `src/routes/+page.server.ts` → calls `getWeekView()` → renders `+page.svelte`.
- Mutations go through `src/routes/api/{items,categories,day-bounds,versions}/...` REST handlers. The page `fetch`es these and reloads via SvelteKit `invalidateAll()` patterns.
- Server-only DB code MUST live under `src/lib/server/` (SvelteKit refuses to bundle it client-side from there).

### Svelte 5 runes

- Runes mode is enabled for all non-`node_modules` files via `svelte.config.js`. Use `$state`, `$derived`, `$effect`, `$props` — not the legacy `let` reactivity. The `event_directive_deprecated` warning is silenced project-wide; don't fight that filter, just use the new event syntax (`onclick={...}`).

### Styling

- Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`). Theme tokens live in `src/lib/themes.ts` (~20 built-in themes) and are applied via CSS variables. Tokyo Night-inspired palette is the default.
- Bits UI for primitives, `lucide-svelte` for icons.

### Tests

- **Unit (vitest)**: collocated as `*.test.ts` next to source under `src/`.
- **E2E (Playwright)**: `tests/e2e/`, runs on `127.0.0.1:5187` against a freshly-spawned dev server (`reuseExistingServer: false`). Two projects: `chromium` and `mobile` (Pixel 7) — some tests skip the mobile project explicitly when the compact toolbar hides controls. Tests use `getByTestId` heavily; preserve `data-testid` attributes when refactoring the planner.

## Gotchas

- **Don't commit anything from `.local/`**, exports, or seeds derived from real schedules. The seed data in `seedIfEmpty()` is intentionally fictional.
- **Boundary clamping**: `upsertItem` snaps and clamps times so blocks always have at least `SNAP_MINUTES` duration and never extend past 24:00. If you bypass `upsertItem` for a bulk insert, replicate that or items will silently corrupt the grid.
- **Version delete protection**: the default template (`default_template_id` in `app_settings`) cannot be deleted — `deleteVersion` throws. The active pointer falls back to default on delete.
- **Docker** (`Dockerfile` + `docker-compose.yml`) listens on port 3000 and persists to the `schedule-studio-data` volume at `/data`. Mount accordingly when running outside Compose.
