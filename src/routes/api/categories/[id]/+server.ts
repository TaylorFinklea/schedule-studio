import { json } from "@sveltejs/kit";
import {
  CategoryInUseError,
  deleteCategory,
  updateCategory,
} from "$lib/server/db";
import type { BudgetMode } from "$lib/types";

const VALID_MODES: BudgetMode[] = ["target", "minimum", "observation"];

export async function PUT({ params, request }) {
  const payload = await request.json();
  const update: Parameters<typeof updateCategory>[0] = { id: params.id };
  if (typeof payload.name === "string") update.name = payload.name;
  if (typeof payload.color === "string") update.color = payload.color;
  if (
    typeof payload.budgetMode === "string" &&
    VALID_MODES.includes(payload.budgetMode as BudgetMode)
  ) {
    update.budgetMode = payload.budgetMode as BudgetMode;
  }
  if (
    payload.targetMinutes === null ||
    typeof payload.targetMinutes === "number"
  ) {
    update.targetMinutes = payload.targetMinutes;
  }
  if (typeof payload.archived === "boolean") {
    update.archived = payload.archived;
  }
  if (typeof payload.sortOrder === "number") {
    update.sortOrder = payload.sortOrder;
  }
  updateCategory(update);
  return json({ ok: true });
}

export function DELETE({ params }) {
  try {
    deleteCategory(params.id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof CategoryInUseError) {
      return json({ error: "in_use" }, { status: 409 });
    }
    throw error;
  }
}
