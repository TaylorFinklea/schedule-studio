import { expect, test } from "@playwright/test";

test("renders the planner shell and opens the add block dialog", async ({
  page,
}) => {
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
