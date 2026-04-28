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
  await expect(page.getByLabel("Start minute")).toHaveValue("485");
  await expect(page.getByLabel("End minute")).toHaveValue("515");
});

test("can add a pin from an empty calendar hover slot", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByTestId("day-column-7").hover({ position: { x: 80, y: 523 } });
  await page.getByTestId("hover-add-pin").click();

  await expect(
    page.getByRole("dialog", { name: "Add schedule item" }),
  ).toBeVisible();
  await expect(page.getByLabel("Start minute")).toHaveValue("485");
  await expect(page.getByLabel("End minute")).toHaveCount(0);
});
