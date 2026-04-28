import { expect, test } from "@playwright/test";

test("renders the planner shell and opens the add block dialog", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "The compact mobile toolbar does not expose the header Add block button.",
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Schedule Studio" }),
  ).toBeVisible();
  await expect(page.getByText("Weekly totals")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add block" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add schedule item" }),
  ).toBeVisible();
});

test("mobile can use day focus", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Day focus").click({ force: true });
  await expect(page.getByText("Daily totals")).toBeVisible();
});

test("timeline zoom supports five-minute precision", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Timeline zoom")).toHaveAttribute("max", "360");
  await expect(page.getByText("5-minute grid")).toBeVisible();
});

test("can add a block from an empty calendar hover slot", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByTestId("day-column-6").hover({ position: { x: 80, y: 523 } });
  await page.getByTestId("hover-add-block").click();

  await expect(
    page.getByRole("dialog", { name: "Add schedule item" }),
  ).toBeVisible();
  await expect(page.getByLabel("Start time")).toHaveValue("8:05 AM");
  await expect(page.getByLabel("End time")).toHaveValue("8:35 AM");
});

test("can add a pin from an empty calendar hover slot", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByTestId("day-column-7").hover({ position: { x: 80, y: 523 } });
  await page.getByTestId("hover-add-pin").click();

  await expect(
    page.getByRole("dialog", { name: "Add schedule item" }),
  ).toBeVisible();
  await expect(page.getByLabel("Start time")).toHaveValue("8:05 AM");
  await expect(page.getByLabel("End time")).toHaveCount(0);
});

test("can edit an existing block through the unified editor", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page
    .getByTestId("schedule-item")
    .filter({ hasText: "Exercise" })
    .first()
    .dblclick();

  await expect(
    page.getByRole("dialog", { name: "Add schedule item" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Add schedule item" });
  await expect(dialog.getByLabel("Title")).toHaveValue(/exercise/i);
  await expect(dialog.getByLabel("Start time")).toHaveValue("4:40 AM");
  await dialog.getByLabel("Title").fill("Morning exercise");
  await page.getByRole("button", { name: "Save" }).click({ force: true });
  await expect(page.getByText("Morning exercise").first()).toBeVisible();
});

test("horizontal mode supports hover block creation", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("layout-horizontal").click();
  await expect(page.getByTestId("horizontal-day-6")).toBeVisible();

  await page
    .getByTestId("horizontal-day-6")
    .hover({ position: { x: 523, y: 40 } });
  await page.getByTestId("hover-add-block").click();

  await expect(
    page.getByRole("dialog", { name: "Add schedule item" }),
  ).toBeVisible();
  await expect(page.getByLabel("Start time")).toHaveValue("8:00 AM");
});

test("theme selection persists after reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settings-button").click();
  await page.getByTestId("theme-catppuccin-mocha").click({ force: true });
  await expect(
    page
      .getByRole("dialog", { name: "Settings" })
      .getByText("Catppuccin Mocha")
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.evaluate(() => localStorage.getItem("schedule-studio-theme")),
  ).resolves.toBe("catppuccin-mocha");
});
