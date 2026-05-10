import { json } from "@sveltejs/kit";
import { deleteTodo, updateTodo } from "$lib/server/db";

export async function PUT({ params, request }) {
  const body = await request.json();
  const patch: Parameters<typeof updateTodo>[1] = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (body.kind === "block" || body.kind === "pin") patch.kind = body.kind;
  if (body.categoryId === null || typeof body.categoryId === "string")
    patch.categoryId = body.categoryId;
  if (body.durationMinutes === null || typeof body.durationMinutes === "number")
    patch.durationMinutes = body.durationMinutes;
  const result = updateTodo(params.id, patch);
  if (!result) return json({ error: "not found" }, { status: 404 });
  return json(result);
}

export function DELETE({ params }) {
  deleteTodo(params.id);
  return json({ ok: true });
}
