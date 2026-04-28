import { json } from "@sveltejs/kit";
import { deleteItem, upsertItem } from "$lib/server/db";

export async function PUT({ params, request }) {
  const item = await request.json();
  return json(upsertItem({ ...item, id: params.id }));
}

export function DELETE({ params }) {
  deleteItem(params.id);
  return json({ ok: true });
}
