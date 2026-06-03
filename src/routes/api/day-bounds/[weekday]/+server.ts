import { json } from "@sveltejs/kit";
import { updateAllDayBounds, updateDayBounds } from "$lib/server/db";

export async function PUT({ params, request }) {
  const payload = await request.json();
  if (params.weekday === "all") {
    updateAllDayBounds(payload.wakeMinute, payload.sleepMinute);
    return json({ ok: true });
  }
  updateDayBounds({ ...payload, weekday: Number(params.weekday) });
  return json({ ok: true });
}
