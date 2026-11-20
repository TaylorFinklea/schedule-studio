import { json } from "@sveltejs/kit";
import {
  activateVersion,
  deleteVersion,
  renameVersion,
  setDefaultVersion,
  updateVersionWeekStart,
} from "$lib/server/db";

export async function PUT({ params, request }) {
  const payload = await request.json();
  if (payload.action === "activate") {
    await activateVersion(params.id);
    return json({ ok: true });
  }
  if (payload.action === "set-default") {
    await setDefaultVersion(params.id);
    return json({ ok: true });
  }
  if ("weekStartDate" in payload) {
    await updateVersionWeekStart(params.id, payload.weekStartDate ?? null);
    return json({ ok: true });
  }
  await renameVersion(params.id, payload.name);
  return json({ ok: true });
}

export async function DELETE({ params }) {
  await deleteVersion(params.id);
  return json({ ok: true });
}
