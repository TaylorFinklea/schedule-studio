# Roadmap

## Done (recent)

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

## Now

- [ ] **Drag-to-draw block creation** — Outlook-style click + drag on empty grid to size a new block before the editor opens (today: click anywhere creates a default 60-min block at click-pos)
- [ ] **Drag between days** — horizontal layout supports resize within a day but not lateral drag to move a block to a different weekday
- [ ] **Series UX polish** — Delete-series button in the editor, "updated N instances" toast after a propagating save, multi-day chip labels for clarity

## Next

- [ ] **Import / export** — JSON backup + restore for the active version (and optionally all sandboxes)
- [ ] **Keyboard shortcuts** — `n` new block, `Esc` close editor, `←/→` prev/next week, `Cmd+S` save
- [ ] **Settings page: default wake/sleep bounds** — global default applied to new templates / new days, separate from the per-day popover editor that already exists
- [ ] **Alternating-week templates (A/B weeks)** — a single sandbox today only models one week; user has biweekly events (e.g. spouses alternating temple visits) that need a 2-week pattern. Likely a `week_parity` flag on items or a "linked sibling" template pair
- [ ] **Typography / spacing polish pass** — calm direction always has more to refine

## Later

- [ ] Calendar export (.ics) — push the template to Google / Outlook
- [ ] Side-by-side schedule-version comparison

## Dropped

- ~~Full date-specific override workflow~~ — out of scope per the locked design decisions in the rewrite (aspirational weekly template + budget visualizer only; no per-date deltas)
