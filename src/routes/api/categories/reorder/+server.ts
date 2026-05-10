import { json } from "@sveltejs/kit";
import { reorderCategory } from "$lib/server/db";

export async function POST({ request }) {
  const payload = await request.json();
  if (
    typeof payload.id !== "string" ||
    (payload.direction !== "up" && payload.direction !== "down")
  ) {
    return json({ error: "id + direction required" }, { status: 400 });
  }
  reorderCategory(payload.id, payload.direction);
  return json({ ok: true });
}
