import { json } from "@sveltejs/kit";
import { upsertItem } from "$lib/server/db";

export async function POST({ request }) {
  const item = await request.json();
  return json(upsertItem(item));
}
