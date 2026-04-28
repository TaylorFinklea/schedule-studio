import { json } from "@sveltejs/kit";
import { updateCategory } from "$lib/server/db";

export async function PUT({ params, request }) {
  const payload = await request.json();
  updateCategory({ id: params.id, name: payload.name, color: payload.color });
  return json({ ok: true });
}
