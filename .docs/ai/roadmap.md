# Roadmap

## Done (recent)

- [x] **Category color inheritance and daily totals** — new subcategories default to the parent color, budget chips place children below parents, and a per-day dialog shows scheduled-time totals with parent rollups and child detail.
- [x] **Schedule Studio branding** — added a custom stepped-time-block SVG logo, responsive accessible wordmark, and matching favicon.

- [x] Week anchoring + visible bounds controls: templates may have nullable `week_start_date`; date-less templates render Mon/Tue/etc only, dated templates render real dates with picker/prev-next updates. Settings can apply visible start/end caps to every day, and rows view pins the day label during horizontal scroll.
- [x] Reparent existing categories: per-row "Parent" dropdown in CategoryEditor (top-level + eligible parents), shown only for categories without children; reuses the `parentId` update path. Backend reassigns `sort_order` to the end of the destination sibling group on a move so orders don't collide.
- [x] Subcategories: two-level category hierarchy (`categories.parent_id`). Items assign to parent or child; parents roll up own + children's actuals (`rolledUpActualMinutes`) while keeping independent targets/colors. Grouped item picker, indented BudgetStrip pills, per-parent "Add subcategory" in CategoryEditor. Archiving a parent hides its subtree from pickers; depth capped at 2; parents with children can't be deleted.
- [x] Design-led rewrite: calm UI, anchored editor popover, click-to-create, pin lane, two-theme cut
- [x] Per-category budget modes (target / minimum / observation) with weekly deltas in the BudgetStrip
- [x] Item series (recurring blocks/pins): create across N weekdays, edit propagates, Detach to make standalone
- [x] Default 4am–10pm waking range; auto-grouping of seeded duplicates
- [x] Editable wake/sleep per day (popover from each day header)
- [x] Category management: add / delete (FK-checked) / archive / unarchive / reorder via up/down arrows
- [x] Tech-debt cleanup: dropped `completed` + buffer columns + `date_overrides` + drizzle; pruned `+page.svelte` dead state
- [x] Resize bug fix: `snapMinute` was clamping the delta to ≥ 0, blocking shrink-from-end
- [x] Docker workflow (`docker compose up --build -d`)
- [x] Home Assistant add-on packaging with Ingress and persistent `/data` SQLite storage
- [x] To-do sidebar: persistent task pool with default kind/category/duration; drag a row onto a day cell to spawn an item at the drop position
- [x] **Private Cloudflare preview** — deployed to `workers.dev` behind owner-only Cloudflare Access, with D1 migrations and fictional seed data; owner sign-in and create/save/reload/delete persistence verified.
- [x] **Sift-style Cloudflare custom domain** — the private custom hostname is protected by the exact-owner, 24-hour Access policy; owner sign-in and D1 persistence were verified, the temporary test series was deleted, and the previous `workers.dev` destination is disabled.

## Now

- [ ] **Mobile grid taps** — on phone widths the sticky day-label column intercepts taps on schedule items and drag gestures; 6 mobile e2e tests fail and CI runs desktop-only until fixed (`schedule-studio-m6w`)
- [ ] **Drag-to-draw block creation** — Outlook-style click + drag on empty grid to size a new block before the editor opens (today: click anywhere creates a default 60-min block at click-pos)
- [ ] **Drag between days** — horizontal layout supports resize within a day but not lateral drag to move a block to a different weekday
- [ ] **Series UX polish** — Delete-series button in the editor, "updated N instances" toast after a propagating save, multi-day chip labels for clarity

## Next

- [ ] **Import / export** — JSON backup + restore for the active version (and optionally all sandboxes)
- [ ] **Keyboard shortcuts** — `n` new block, `Esc` close editor, `←/→` prev/next week, `Cmd+S` save
- [ ] **Settings page: default wake/sleep bounds** — global default applied to new templates / new days, separate from the per-day popover editor that already exists
- [ ] **Alternating-week templates (A/B weeks)** — a single sandbox today only models one week; biweekly events need a 2-week pattern. Likely a `week_parity` flag on items or a "linked sibling" template pair
- [ ] **Typography / spacing polish pass** — calm direction always has more to refine

## Later

- [ ] Calendar export (.ics) — push the template to Google / Outlook
- [ ] Side-by-side schedule-version comparison

## Dropped

- ~~Full date-specific override workflow~~ — out of scope per the locked design decisions in the rewrite (aspirational weekly template + budget visualizer only; no per-date deltas)

## Backlog (migrated from Beads, 2026-09-29)

Open items restored from the `backlog-schedule-studio` Dolt remote (last pushed 2026-07-11) when Beads was retired; they may be stale, so verify before starting. Full export of all 10 issues is in `beads-archive.jsonl`.

- [ ] P1 Series UX polish: delete-series, propagation toast, multi-day labels (`schedule-studio-3yp`)
- [ ] P1 Drag a block between weekdays in horizontal layout (`schedule-studio-e6b`)
- [ ] P1 Drag-to-draw block creation on empty grid (`schedule-studio-oxx`)
- [ ] P2 JSON import/export backup and restore for active version (`schedule-studio-96v`)
- [ ] P2 Alternating-week (A/B) template support (`schedule-studio-i0t`)
- [ ] P2 Add keyboard shortcuts for planner actions (`schedule-studio-tws`)
- [ ] P2 Settings: global default wake/sleep bounds for new templates/days (`schedule-studio-wdk`)
- [ ] P3 Typography and spacing polish pass (`schedule-studio-c7w`)
- [ ] P3 Calendar export to .ics (Google/Outlook) (`schedule-studio-zvq`)
- [ ] P4 Side-by-side schedule-version comparison view (`schedule-studio-a3c`)
