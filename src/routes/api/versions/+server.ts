import { json } from "@sveltejs/kit";
import { createVersion } from "$lib/server/db";

export async function POST({ request }) {
  const payload = await request.json();
  return json(createVersion(payload));
}
