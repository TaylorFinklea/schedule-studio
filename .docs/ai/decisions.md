# Decisions

## 2026-04-27

- Use SvelteKit, Svelte 5 runes, Tailwind v4, Bits UI, and local SQLite.
- Make the repo public under the MIT license.
- Keep all real schedule data out of source control.
- Use Node's built-in `node:sqlite` driver so the app avoids native dependency build scripts.
- Use a Tokyo Night-inspired dark palette as the default theme.
- Store schedule versions as separate local SQLite templates, with active/default IDs in `app_settings`.
- Package production with a multi-stage Node Docker image and a mounted `/data` SQLite volume.

## 2026-04-28

- Calendar hover creation shows explicit Block and Pin actions instead of creating items immediately, and calendar-created blocks default to 30 minutes.
- Schedule editing uses 5-minute precision globally, keeps existing integer-minute SQLite storage, and supports zoom up to 720 px/hour for small blocks.
- Item creation, item editing, and settings live in the right sidebar with human-readable time fields; layout and theme are local UI preferences stored in `localStorage`, not schedule data.

## 2026-05-31

- Categories gain a two-level hierarchy via a single nullable self-FK `categories.parent_id` (no second table); depth >2 is rejected in app code, not the schema. Categories stay global (not per-template), so `createVersion` needs no hierarchy handling.
- Items may assign to either a parent or a child. `calculateCategoryBudgets` rolls a parent's actual up from its children but keeps parent/child targets independent (no envelope enforcement); `deltaMinutes` compares the target against the rolled-up actual.
- Archiving a parent hides its whole subtree from pickers (item editor + BudgetStrip) without individually archiving the children — they reappear on unarchive. `orderedVisibleCategories()` in `schedule.ts` is the shared parent-then-children ordering used by both pickers.

## 2026-05-09

- Package Schedule Studio as a Home Assistant add-on through Supervisor using Ingress on internal port `3000`; keep the port unpublished by default and persist SQLite at `/data/schedule-studio.sqlite`.
- Publish a multi-arch GHCR image from the root Dockerfile and reference it from `home-assistant/schedule-studio/config.yaml`.

## 2026-06-03

- Store a schedule version's optional calendar anchor on `templates.week_start_date`. `NULL` means the template is date-less and renders weekday-only labels; non-null values are normalized to the Monday of that week and drive displayed dates, header range, date picker, and prev/next week controls.
- Keep visible time caps in existing `day_bounds` rows. The settings control applies a chosen start/end to all seven rows for the active template; per-day header editing remains available for exceptions.

## 2026-10-29

- Preserve the default Node adapter and `node:sqlite` path for local, Docker, and Home Assistant use; select `adapter-cloudflare` only for the explicit Cloudflare build target.
- Use request-scoped D1 bindings and D1 `batch()` for atomic multi-statement operations. Cloudflare migration `0008_fictional_seed.sql` seeds the new D1 database once; local SQLite continues to apply migrations `0001`–`0007` and call its existing fictional `seedIfEmpty()` bootstrap.
- Protect the private Workers app with Cloudflare Access and verify the signed `Cf-Access-Jwt-Assertion` against the configured Access issuer, audience, and signing keys. Missing Access configuration fails closed. Never accept an email header as identity.
- Pin the Worker compatibility date to `2026-10-03`, the latest date supported by the selected Wrangler/Workerd runtime during implementation. Do not deploy until independent reviews pass.

## 2026-11-03

- Use a custom stepped-time-block mark as the Schedule Studio brand: three offset schedule bars form an abstract S/weekly flow in the Tokyo Night blue, lavender, and cyan palette. Reuse the vector mark in the app header and browser favicon; show the wordmark at wide widths and retain an accessible app name when the wordmark is visually hidden.

## 2026-11-06

- New subcategories inherit the parent's color as their creation default while keeping an explicit color override available. The daily scheduled-time summary uses the same saved-duration accounting as weekly budgets, including pin spans; parent totals include direct and child time, with child detail shown separately.

## Beads retired (2026-09-29)

Beads (`bd`) is no longer used. The backlog lives in `roadmap.md` (Backlog
section); the full Beads export is in `beads-archive.jsonl`. Earlier entries that mention Beads are historical.
