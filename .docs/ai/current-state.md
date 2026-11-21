# Current State

## Summary

Schedule Studio is a public, MIT-licensed SvelteKit app. Current capabilities:

- Local SQLite persistence with fictional first-run seed data.
- Saved schedule versions for active/default and sandbox planning, with nullable per-template week anchoring.
- Docker and Home Assistant add-on packaging, plus an optional Cloudflare Workers + D1 deployment.
- 5-minute timeline precision, vertical and horizontal timeline layouts, and right-sidebar item/settings editing.
- Hover-to-add calendar controls.
- Dark and light themes (Calm dark / Linen light).
- A two-level category hierarchy. New subcategories inherit their parent's color, and daily scheduled-time summaries show parent rollups and child detail.

## Build Status

Portfolio/open-source Tier 1 cleanup (2026-11-20):

- `pnpm lint`, `pnpm check` and `pnpm test` pass.
- `pnpm test:workerd` passes against the placeholder `wrangler.jsonc`.
- Mobile grid taps fixed (2026-11-21, `schedule-studio-m6w`): the 300px to-do sidebar now starts collapsed on screens under 768px until the user expands it (state is saved only on toggle; the legacy auto-saved `"false"` counts as no choice), so the timeline gets the width. Playwright passes 26/26 on desktop and 26/26 on the Pixel 7 project (run locally with `channel: "chrome"`), and CI runs both.

Earlier feature QA (2026-11-06):

- `svelte-check` passed, Vitest passed (24 tests), and the Node and Cloudflare Vite builds passed.
- Browser checks at 1280×720 and 390×844 covered subcategory colors, daily totals, and dialog focus handling.

## Cloudflare Deployment

A private, owner-only instance runs on Cloudflare Workers + D1 behind Cloudflare Access. The Worker hook also validates signed Access assertions.

- **Configuration:** the real deploy configuration (hostname, Access issuer and audience, D1 ID) lives in the gitignored `wrangler.production.jsonc`. The committed `wrangler.jsonc` is a placeholder template. The owner email is a Worker secret.
- **Deploying:** `pnpm deploy:cloudflare` deploys with `--config wrangler.production.jsonc`. The generic runbook is `docs/deploy-cloudflare.md`.
- **Seed data:** Cloudflare migration `0008_fictional_seed.sql` is D1-only. Local Node boot applies migrations `0001`–`0007` and seeds fictional data through `seedIfEmpty()`. Keep those paths aligned when changing the schema or the starter schedule.
- **Untested:** live denial of a second (non-owner) authenticated identity hasn't been tested. Unit tests in the Worker hook cover that case.

## Recent Changes

- **Open-source Tier 1 cleanup:**
  - Rewrote the README (quick start, features, security model, screenshots from fictional seed data in `docs/screenshots/`).
  - Moved the Cloudflare runbook to `docs/deploy-cloudflare.md` and templated `wrangler.jsonc`.
  - Removed root screenshots that showed a real schedule. They remain in git history.
  - Untracked `.claude/scheduled_tasks.lock`.
  - Added `.prettierignore` and `CHANGELOG.md`.
  - Fixed ambiguous e2e locators (header "Add", exact "Title").
  - CI now runs lint and the desktop e2e suite.
- New subcategories default to their parent category color. Weekly budget chips group subcategories directly below parents. Each day has an accessible scheduled-time summary showing parent totals and child detail.
- Added the Schedule Studio brand mark and wordmark, with a matching SVG favicon that respects Home Assistant Ingress paths.
- Schedule settings:
  - Nullable `templates.week_start_date` (migration 0007). Date-less schedules show weekday-only labels; dated schedules show anchored week labels and support prev/next/date-picker updates.
  - Visible start/end caps can be applied to all days.

## Notes

- Runtime data lives under `.local/` by default and is ignored by git.
- Docker runtime data lives in `/data` by default and should be mounted as a volume.
- The Home Assistant add-on also stores data in `/data/schedule-studio.sqlite`. It uses Ingress and keeps port `3000` unexposed by default.
- Write user-specific schedules only to ignored local SQLite databases. Never commit them as seed data or screenshots.
- `AGENTS.md` is partly stale. It still mentions ~20 themes, a `date_overrides` table, and a ~1.7k-line `+page.svelte`.
