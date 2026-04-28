import { json } from "@sveltejs/kit";
import { activateVersion, deleteVersion, renameVersion } from "$lib/server/db";

export async function PUT({ params, request }) {
  const payload = await request.json();
  if (payload.action === "activate") {
    activateVersion(params.id);
    return json({ ok: true });
  }
  renameVersion(params.id, payload.name);
  return json({ ok: true });
}

export function DELETE({ params }) {
  deleteVersion(params.id);
  return json({ ok: true });
}
