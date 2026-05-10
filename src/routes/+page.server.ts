import { getWeekView } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

function ingressPathFromHeader(value: string | null) {
  if (!value?.startsWith("/")) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export const load: PageServerLoad = ({ request, url }) => {
  return {
    ingressPath: ingressPathFromHeader(request.headers.get("x-ingress-path")),
    week: getWeekView(url.searchParams.get("date") ?? undefined),
  };
};
