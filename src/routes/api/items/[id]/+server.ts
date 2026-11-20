import { json } from "@sveltejs/kit";
import {
  deleteItem,
  deleteSeries,
  detachItem,
  getItemTemplateId,
  updateSeries,
  upsertItem,
} from "$lib/server/db";

export async function PUT({ params, request }) {
  const body = await request.json();
  if (body.scope === "series" && body.seriesId) {
    // Ensure the addressed row is in the series before reconciling. This
    // covers the "promote standalone to series" path where the series_id
    // is brand-new and no rows carry it yet.
    const upserted = await upsertItem({
      ...body,
      id: params.id,
      seriesId: body.seriesId,
    });
    const targetWeekdays =
      Array.isArray(body.weekdays) && body.weekdays.length > 0
        ? body.weekdays
        : [body.weekday];
    return json(
      await updateSeries(
        body.seriesId,
        body,
        targetWeekdays,
        upserted.templateId,
      ),
    );
  }
  if (body.scope === "instance") {
    await detachItem(params.id);
    return json(await upsertItem({ ...body, id: params.id, seriesId: null }));
  }
  return json(await upsertItem({ ...body, id: params.id }));
}

export async function DELETE({ params, url }) {
  const scope = url.searchParams.get("scope");
  const seriesId = url.searchParams.get("seriesId");
  if (scope === "series" && seriesId) {
    const templateId = await getItemTemplateId(params.id);
    if (templateId) await deleteSeries(seriesId, templateId);
  } else {
    await deleteItem(params.id);
  }
  return json({ ok: true });
}
