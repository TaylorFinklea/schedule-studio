import { expect, test } from "@playwright/test";

test("renders the calm shell with budget strip", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /Add$/ })).toBeVisible();
  await expect(page.getByLabel("Weekly budget summary")).toBeVisible();
  await expect(page.getByTestId("layout-horizontal")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the Add button opens the editor modal", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Add$/ }).click();
  await expect(
    page.locator('section[aria-label="Add schedule item"]'),
  ).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();
  await expect(page.getByLabel("Start time")).toBeVisible();
});

test("clicking a schedule item opens the editor populated with its data", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page
    .getByTestId("schedule-item")
    .filter({ hasText: "Exercise" })
    .first()
    .click();
  const editor = page.locator('section[aria-label="Add schedule item"]');
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Title")).toHaveValue(/exercise/i);
});

test("the layout toggle switches between rows and columns", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("layout-vertical").click();
  await expect(page.getByTestId("layout-vertical")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("layout-horizontal").click();
  await expect(page.getByTestId("layout-horizontal")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the schedule week picker anchors dates and can switch to weekday-only", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByTestId("settings-button").click();
  await page.getByTestId("schedule-dated-toggle").check();
  await page.getByTestId("week-start-input").fill("2026-06-03");
  await expect(page.getByTestId("day-label-1")).toHaveText("Mon 6/1");
  await expect(page.getByText("Jun 1 - Jun 7")).toBeVisible();

  await page.getByTestId("schedule-dated-toggle").uncheck();
  await expect(page.getByTestId("day-label-1")).toHaveText("Mon");
  await expect(page.getByText("Weekly template")).toBeVisible();
});

test("rows view keeps day labels pinned while scrolling the timeline", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("layout-horizontal").click();

  const before = await page.getByTestId("day-header-1").boundingBox();
  await page
    .getByTestId("timeline-scroll")
    .evaluate((element) => (element.scrollLeft = 320));
  const after = await page.getByTestId("day-header-1").boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(2);
});

test("schedule settings apply visible time caps to every day", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  await page.getByTestId("schedule-start-time").fill("3:00 AM");
  await page.getByTestId("schedule-end-time").fill("11:00 PM");
  await page.getByTestId("save-schedule-bounds").click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByTestId("layout-vertical").click();

  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await expect(page.getByTestId(`day-header-${weekday}`)).toContainText(
      "Wake 3 AM",
    );
    await expect(page.getByTestId(`day-header-${weekday}`)).toContainText(
      "Sleep 11 PM",
    );
  }
});

test("the version menu lists schedule versions", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("version-menu").click();
  await expect(page.getByLabel("Schedule versions")).toBeVisible();
  await expect(page.getByLabel("New sandbox name")).toBeVisible();
});

test("set default promotes a sandbox and allows deleting the old default", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("version-menu").click();

  // Create a new sandbox
  await page.getByLabel("New sandbox name").fill("Promote me");
  await page.getByRole("button", { name: "Create sandbox" }).click();
  await page.waitForLoadState("networkidle");

  // Re-open the version menu (creating a sandbox closes it)
  await page.getByTestId("version-menu").click();

  // The new sandbox should be active and listed
  await expect(
    page.locator("button", { hasText: "Promote me" }).first(),
  ).toBeVisible();

  // Set it as default (menu stays open)
  await page.getByTestId("version-set-default-active").click();
  await page.waitForLoadState("networkidle");

  // The old default (seeded template) should now be deletable
  const oldDefault = page
    .locator("li", { hasText: "Fictional planning template" })
    .first();
  await oldDefault.hover();
  await expect(
    oldDefault.locator('[data-testid^="version-delete-"]'),
  ).toBeVisible();

  // Restore original default so other tests aren't affected
  await oldDefault.locator('[data-testid^="version-set-default-"]').click();
  await page.waitForLoadState("networkidle");

  // Delete the sandbox we created (menu is still open)
  page.on("dialog", (dialog) => dialog.accept());
  const sandbox = page.locator("li", { hasText: "Promote me" }).first();
  await sandbox.hover();
  await sandbox.locator('[data-testid^="version-delete-"]').click();
  await page.waitForLoadState("networkidle");

  // Confirm the sandbox is gone (menu closed on delete, reopen to verify)
  await page.getByTestId("version-menu").click();
  await expect(sandbox).not.toBeVisible();
});

test("settings drawer exposes both calm themes and persists the choice", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("theme-tokyo-night")).toBeVisible();
  await expect(page.getByTestId("theme-linen-light")).toBeVisible();
  await page.getByTestId("theme-linen-light").click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("schedule-studio-theme")),
    )
    .toBe("linen-light");
});

test("default grid spans 4 AM through 10 PM", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("4 AM").first()).toBeVisible();
  await expect(page.getByText("10 PM").first()).toBeVisible();
});

test("seeded duplicates render with a series marker", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("series-marker").first()).toBeVisible();
});

test("creating a multi-day item creates a series", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Add$/ }).click();
  // Day 1 (Mon) is pre-selected from the visibleDay default — add Wed + Fri.
  await page.getByTestId("day-chip-3").click();
  await page.getByTestId("day-chip-5").click();
  const title = `E2E series ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForLoadState("networkidle");
  const items = page.getByTestId("schedule-item").filter({ hasText: title });
  await expect(items).toHaveCount(3);
});

test("editing a series-member updates every instance", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Add$/ }).click();
  await page.getByTestId("day-chip-3").click();
  await page.getByTestId("day-chip-5").click();
  const title = `E2E edit ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForLoadState("networkidle");

  await page
    .getByTestId("schedule-item")
    .filter({ hasText: title })
    .first()
    .click();
  const editor = page.locator('section[aria-label="Add schedule item"]');
  await expect(editor).toBeVisible();
  const renamed = `${title} renamed`;
  await editor.getByLabel("Title").fill(renamed);
  await editor.getByRole("button", { name: /^Save$/ }).click();
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByTestId("schedule-item").filter({ hasText: renamed }),
  ).toHaveCount(3);
});

test("detach removes one instance from a series", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Add$/ }).click();
  await page.getByTestId("day-chip-3").click();
  await page.getByTestId("day-chip-5").click();
  const title = `E2E detach ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForLoadState("networkidle");

  await page
    .getByTestId("schedule-item")
    .filter({ hasText: title })
    .first()
    .click();
  const editor = page.locator('section[aria-label="Add schedule item"]');
  await expect(editor.getByTestId("detach-series")).toBeVisible();
  await editor.getByTestId("detach-series").click();
  await page.waitForLoadState("networkidle");

  // After detach the editor stays open with seriesId cleared, so the
  // Detach button should be hidden.
  await expect(editor.getByTestId("detach-series")).toBeHidden();
  const renamed = `${title} solo`;
  await editor.getByLabel("Title").fill(renamed);
  await editor.getByRole("button", { name: /^Save$/ }).click();
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByTestId("schedule-item").filter({ hasText: renamed }),
  ).toHaveCount(1);
  // The other two siblings keep the original title.
  await expect(
    page.getByTestId("schedule-item").filter({ hasText: title }),
  ).toHaveCount(3);
});

test("wake/sleep popover updates the day's bounds", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("day-header-2").click();
  const editor = page.getByTestId("day-bounds-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Wake time").fill("5:30 AM");
  await editor.getByLabel("Sleep time").fill("9:00 PM");
  await editor.getByRole("button", { name: /^Save$/ }).click();
  await page.waitForLoadState("networkidle");
  // Re-open the popover to confirm the saved values round-tripped.
  await page.getByTestId("day-header-2").click();
  await expect(page.getByLabel("Wake time")).toHaveValue("5:30 AM");
  await expect(page.getByLabel("Sleep time")).toHaveValue("9:00 PM");
});

test("add a new category", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  await page.getByTestId("category-create-open").click();
  const name = `Reading ${Date.now()}`;
  await page.getByLabel("New category name").fill(name);
  await page.getByTestId("category-create-submit").click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("category-delete-error")).toBeHidden();
  // The new category should show up in the editor row list.
  await expect(
    page.locator("input[aria-label='Category name']", { hasText: "" }).filter({
      has: page.locator(
        `xpath=ancestor::div[starts-with(@data-testid, 'category-row-')]`,
      ),
    }),
  ).not.toHaveCount(0);
  // And in the budget strip.
  await expect(
    page.getByLabel("Weekly budget summary").getByText(name),
  ).toBeVisible();
});

test("archive moves a category to the archived section", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  const activeRows = page.locator(
    '[data-testid^="category-row-"]:not(.opacity-60)',
  );
  const beforeCount = await activeRows.count();
  // Create a fresh category — it's appended at the bottom of the active list.
  await page.getByTestId("category-create-open").click();
  const name = `Archive me ${Date.now()}`;
  await page.getByLabel("New category name").fill(name);
  await page.getByTestId("category-create-submit").click();
  // Wait for the new row to land in the DOM rather than relying on networkidle.
  await expect(activeRows).toHaveCount(beforeCount + 1);
  const newRow = activeRows.last();
  const rowTestId = await newRow.getAttribute("data-testid");
  await newRow.locator('[data-testid^="category-archive-"]').click();
  await expect(
    page
      .locator(`[data-testid="${rowTestId}"]`)
      .locator('[data-testid^="category-unarchive-"]'),
  ).toBeVisible();
});

test("delete is blocked when a category is in use", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  const firstDelete = page.locator('[data-testid^="category-delete-"]').first();
  // Seeded categories are referenced by seed items, so delete must be disabled.
  await expect(firstDelete).toBeDisabled();
});

test("delete works on a freshly-created empty category", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  const activeRows = page.locator(
    '[data-testid^="category-row-"]:not(.opacity-60)',
  );
  const beforeCount = await activeRows.count();
  await page.getByTestId("category-create-open").click();
  const name = `Disposable ${Date.now()}`;
  await page.getByLabel("New category name").fill(name);
  await page.getByTestId("category-create-submit").click();
  await expect(activeRows).toHaveCount(beforeCount + 1);
  const newRow = activeRows.last();
  const rowTestId = await newRow.getAttribute("data-testid");
  await newRow.locator('[data-testid^="category-delete-"]').click();
  await expect(page.locator(`[data-testid="${rowTestId}"]`)).toHaveCount(0);
});

test("up arrow reorders two adjacent active categories", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  // Create two known-named categories so we own the bottom of the active list.
  const activeRowsForCreate = page.locator(
    '[data-testid^="category-row-"]:not(.opacity-60)',
  );
  let count = await activeRowsForCreate.count();
  const ts = Date.now();
  const aName = `Reorder A ${ts}`;
  const bName = `Reorder B ${ts}`;
  for (const n of [aName, bName]) {
    await page.getByTestId("category-create-open").click();
    await page.getByLabel("New category name").fill(n);
    await page.getByTestId("category-create-submit").click();
    count += 1;
    await expect(activeRowsForCreate).toHaveCount(count);
  }
  // The last active row is B (created most recently). Its up arrow should
  // swap it above A (the second-to-last).
  const activeRows = page.locator(
    '[data-testid^="category-row-"]:not(.opacity-60)',
  );
  await activeRows.last().locator('[data-testid^="category-up-"]').click();
  // Poll until the DOM reflects the swap — networkidle alone can return
  // before Svelte's $effect re-renders the editor list.
  await expect
    .poll(async () =>
      activeRows.evaluateAll((rows) =>
        (rows as HTMLElement[])
          .slice(-2)
          .map(
            (row) =>
              (
                row.querySelector(
                  'input[aria-label="Category name"]',
                ) as HTMLInputElement | null
              )?.value ?? "",
          ),
      ),
    )
    .toEqual([bName, aName]);
});

test("drag-to-draw on empty grid creates a sized block", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Pick a row that fits in the 720px chromium viewport.
  const dayCell = page.getByTestId("horizontal-day-2");
  await expect(dayCell).toBeVisible();
  const box = await dayCell.boundingBox();
  if (!box) throw new Error("day cell missing");
  // Drag in the early morning (between maxStart=4am and Tuesday's first seed).
  const startX = box.x + 24;
  const startY = box.y + box.height / 2;
  const endX = startX + 200;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, startY, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.locator('section[aria-label="Add schedule item"]'),
  ).toBeVisible();
  await expect(page.getByTestId("day-chip-2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("dragging a block onto another day moves it", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Create a fresh single-day block we own, in an empty time slot, so the
  // pointerdown lands cleanly on it instead of an overlapping seed block.
  await page.getByRole("button", { name: /^Add$/ }).click();
  const title = `Move me ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Start time").fill("4:30 AM");
  await page.getByLabel("End time").fill("5:30 AM");
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForLoadState("networkidle");
  const block = page
    .getByTestId("schedule-item")
    .filter({ hasText: title })
    .first();
  await expect(block).toBeVisible();
  const blockBox = await block.boundingBox();
  if (!blockBox) throw new Error("block missing");
  // Drag the block onto Tuesday's row (always visible in 720px viewport).
  const targetCell = page.getByTestId("horizontal-day-2");
  const targetBox = await targetCell.boundingBox();
  if (!targetBox) throw new Error("target row missing");
  const startX = blockBox.x + blockBox.width / 2;
  const startY = blockBox.y + blockBox.height / 2;
  const endX = startX + 4;
  const endY = targetBox.y + targetBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  await page.waitForLoadState("networkidle");
  // The block should now live inside the Saturday row.
  await expect(
    targetCell.locator("[data-schedule-item]").filter({ hasText: title }),
  ).toHaveCount(1);
});

test("delete series wipes every instance and surfaces a toast", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Add$/ }).click();
  const title = `Doomed ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByTestId("day-chip-2").click();
  await page.getByTestId("day-chip-3").click();
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByTestId("schedule-item").filter({ hasText: title }),
  ).toHaveCount(3);
  await page
    .getByTestId("schedule-item")
    .filter({ hasText: title })
    .first()
    .click();
  const editor = page.locator('section[aria-label="Add schedule item"]');
  await expect(editor.getByTestId("delete-series")).toBeVisible();
  await editor.getByTestId("delete-series").click();
  await expect(page.getByTestId("app-toast")).toContainText("Series deleted");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByTestId("schedule-item").filter({ hasText: title }),
  ).toHaveCount(0);
});
