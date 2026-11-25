# Changelog

Notable changes to Schedule Studio. Versions match `package.json`, the container image tag, and the Home Assistant add-on version. The add-on keeps its own short [changelog](home-assistant/schedule-studio/CHANGELOG.md) for the Home Assistant update UI.

## 0.1.6 — 2026-11-25

### Fixed

- On phone-width screens the to-do sidebar starts collapsed until you expand it, so the timeline has room and its blocks can be tapped. The sidebar now saves its state only when you toggle it. CI now runs the mobile Playwright suite too.

## v0.1.5 tag — 2026-11-20

The version number wasn't bumped after the June 0.1.5 release, so the `v0.1.5` Git tag (and the `0.1.5` container image built from `main`) also includes these changes.

### Added

- Daily scheduled-time summaries per day, with parent-category rollups and subcategory detail.
- New subcategories inherit their parent's color; budget chips list subcategories under their parent.
- Schedule Studio logo, wordmark, and SVG favicon.
- Optional Cloudflare Workers + D1 deployment behind Cloudflare Access. See [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).

### Changed

- The README now covers architecture, operations, how the project was built and reviewed, and quick start, with fresh screenshots of the fictional seed data.
- `wrangler.jsonc` is now a placeholder template; real deployments use a gitignored `wrangler.production.jsonc`.
- CI now runs Prettier and the desktop Playwright suite.

## 0.1.5 — 2026-06-03

- Schedules can be anchored to a real week (or left date-less to show weekday-only labels).
- Visible start/end caps can be applied to every day.
- Day labels stay pinned during horizontal scroll in rows view.

## 0.1.4 — 2026-06-02

- Existing categories can be moved under a different parent.

## 0.1.3 — 2026-05-31

- Two-level category hierarchy: parents roll up their subcategories' time.
- The to-do sidebar can be collapsed, and the setting persists.

## 0.1.2 — 2026-05-09

- "Set default" for schedule versions.

## 0.1.1 — 2026-05-09

- Fixed SQLite startup in the Home Assistant add-on's `/data` mount (the container no longer switches to the `node` user).

## 0.1.0 — 2026-05-09

- First packaged release: a weekly planner with blocks, pins, categories and budgets, recurring series, sandbox schedule versions, and a to-do sidebar.
- Docker image and Home Assistant add-on with Ingress and persistent `/data` storage.
