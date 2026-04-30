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

test("the version menu lists schedule versions", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("version-menu").click();
  await expect(page.getByLabel("Schedule versions")).toBeVisible();
  await expect(page.getByLabel("New sandbox name")).toBeVisible();
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
