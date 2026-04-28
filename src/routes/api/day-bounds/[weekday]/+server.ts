import { json } from "@sveltejs/kit";
import { updateDayBounds } from "$lib/server/db";

export async function PUT({ params, request }) {
  const payload = await request.json();
  updateDayBounds({ ...payload, weekday: Number(params.weekday) });
  return json({ ok: true });
}
