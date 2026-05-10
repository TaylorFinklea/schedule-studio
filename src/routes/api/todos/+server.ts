import { json } from "@sveltejs/kit";
import { createTodo } from "$lib/server/db";

export async function POST({ request }) {
  const body = await request.json();
  if (typeof body.title !== "string") {
    return json({ error: "title required" }, { status: 400 });
  }
  if (body.kind !== "block" && body.kind !== "pin") {
    return json({ error: "kind must be block or pin" }, { status: 400 });
  }
  return json(
    createTodo({
      title: body.title,
      kind: body.kind,
      categoryId: typeof body.categoryId === "string" ? body.categoryId : null,
      durationMinutes:
        typeof body.durationMinutes === "number" ? body.durationMinutes : null,
    }),
  );
}
