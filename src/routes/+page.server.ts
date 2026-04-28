import { getWeekView } from "$lib/server/db";

export function load({ url }) {
  return {
    week: getWeekView(url.searchParams.get("date") ?? undefined),
  };
}
