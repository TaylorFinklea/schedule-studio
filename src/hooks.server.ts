import type { Handle } from "@sveltejs/kit";
import { withD1Database } from "$lib/server/db";

type AccessClaims = {
  aud?: string[];
  email?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
};

type AccessKey = JsonWebKey & { kid: string };
type AccessKeySet = { keys: AccessKey[] };
type AccessAssertionResult = "invalid" | "forbidden" | "valid";

let cachedKeys: AccessKey[] = [];
let keysExpireAt = 0;

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

async function accessKeys(issuer: string) {
  if (cachedKeys.length > 0 && Date.now() < keysExpireAt) return cachedKeys;

  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error("Could not retrieve Cloudflare Access keys");

  const keySet = (await response.json()) as AccessKeySet;
  cachedKeys = keySet.keys;
  keysExpireAt = Date.now() + 5 * 60 * 1000;
  return cachedKeys;
}

async function hasValidAccessAssertion(
  assertion: string | null,
  issuerValue: string,
  audienceValue: string,
  ownerEmailValue: string,
): Promise<AccessAssertionResult> {
  if (!assertion) return "invalid";

  const issuer = issuerValue.replace(/\/$/, "");
  const audience = audienceValue.trim();
  const ownerEmail = ownerEmailValue.trim().toLowerCase();
  if (
    !issuer ||
    !audience ||
    !ownerEmail ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(issuer)
  ) {
    return "invalid";
  }

  const [encodedHeader, encodedClaims, encodedSignature] = assertion.split(".");
  if (!encodedHeader || !encodedClaims || !encodedSignature) return "invalid";

  try {
    const header = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedHeader)),
    ) as {
      alg?: string;
      kid?: string;
    };
    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedClaims)),
    ) as AccessClaims;
    if (
      header.alg !== "RS256" ||
      !header.kid ||
      claims.iss !== issuer ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(audience) ||
      typeof claims.exp !== "number" ||
      claims.exp <= Math.floor(Date.now() / 1000) ||
      (typeof claims.nbf === "number" &&
        claims.nbf > Math.floor(Date.now() / 1000))
    ) {
      return "invalid";
    }

    const jwk = (await accessKeys(issuer)).find(
      (key) => key.kid === header.kid,
    );
    if (!jwk) return "invalid";

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    );
    if (!signatureValid) return "invalid";
    if (
      typeof claims.email !== "string" ||
      claims.email.trim().toLowerCase() !== ownerEmail
    ) {
      return "forbidden";
    }
    return "valid";
  } catch {
    return "invalid";
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  if (!event.platform || !("env" in event.platform)) return resolve(event);

  const env = event.platform.env;
  const issuer = env?.CLOUDFLARE_ACCESS_ISSUER;
  const audience = env?.CLOUDFLARE_ACCESS_AUD;
  const ownerEmail = env?.SCHEDULE_STUDIO_ACCESS_OWNER_EMAIL;
  const hostname = env?.SCHEDULE_STUDIO_HOSTNAME;
  if (!env?.DB || !issuer || !audience || !ownerEmail || !hostname) {
    return new Response("Cloudflare Access is not configured", { status: 503 });
  }

  if (event.url.hostname.toLowerCase() !== hostname.trim().toLowerCase()) {
    return new Response("Forbidden", { status: 403 });
  }

  const accessResult = await hasValidAccessAssertion(
    event.request.headers.get("Cf-Access-Jwt-Assertion"),
    issuer,
    audience,
    ownerEmail,
  );
  if (accessResult === "invalid")
    return new Response("Authentication required", { status: 401 });
  if (accessResult === "forbidden")
    return new Response("Forbidden", { status: 403 });

  return withD1Database(env.DB, () => resolve(event));
};
