import { json } from "@sveltejs/kit";
import { reorderTodo } from "$lib/server/db";

export async function POST({ request }) {
  const body = await request.json();
  if (
    typeof body.id !== "string" ||
    (body.direction !== "up" && body.direction !== "down")
  ) {
    return json({ error: "id + direction required" }, { status: 400 });
  }
  reorderTodo(body.id, body.direction);
  return json({ ok: true });
}
