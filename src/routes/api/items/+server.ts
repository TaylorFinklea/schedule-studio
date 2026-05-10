import { json } from "@sveltejs/kit";
import { createItems, upsertItem } from "$lib/server/db";

export async function POST({ request }) {
  const body = await request.json();
  if (Array.isArray(body.weekdays) && body.weekdays.length > 0) {
    return json(createItems(body, body.weekdays));
  }
  return json(upsertItem(body));
}
