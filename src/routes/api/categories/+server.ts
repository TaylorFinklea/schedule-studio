import { json } from "@sveltejs/kit";
import { createCategory } from "$lib/server/db";
import type { BudgetMode } from "$lib/types";

const VALID_MODES: BudgetMode[] = ["target", "minimum", "observation"];

export async function POST({ request }) {
  const payload = await request.json();
  if (typeof payload.name !== "string" || typeof payload.color !== "string") {
    return json({ error: "name and color required" }, { status: 400 });
  }
  const budgetMode =
    typeof payload.budgetMode === "string" &&
    VALID_MODES.includes(payload.budgetMode as BudgetMode)
      ? (payload.budgetMode as BudgetMode)
      : undefined;
  const targetMinutes =
    payload.targetMinutes === null || typeof payload.targetMinutes === "number"
      ? payload.targetMinutes
      : undefined;
  const id = createCategory({
    name: payload.name,
    color: payload.color,
    budgetMode,
    targetMinutes,
  });
  return json({ id });
}
