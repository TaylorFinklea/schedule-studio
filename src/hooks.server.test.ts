import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Handle } from "@sveltejs/kit";
import { handle } from "./hooks.server";

const issuer = "https://example-team.cloudflareaccess.com";
const audience = "schedule-studio-test-audience";
const ownerEmail = "owner@example.com";
const hostname = "schedule.example.com";
const now = Math.floor(Date.now() / 1000);
const goodKeys = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const otherKeys = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const publicJwk = {
  ...(await crypto.subtle.exportKey("jwk", goodKeys.publicKey)),
  kid: "test-key",
};

function base64Url(value: Uint8Array | string) {
  return Buffer.from(value).toString("base64url");
}

async function makeAssertion(
  claims: Record<string, unknown> = {
    iss: issuer,
    aud: [audience],
    email: ownerEmail,
    exp: now + 600,
  },
  signingKey: CryptoKey = goodKeys.privateKey,
) {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "test-key" }));
  const payload = base64Url(JSON.stringify(claims));
  const message = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(message),
  );
  return `${message}.${base64Url(new Uint8Array(signature))}`;
}

function event(
  platform: object,
  assertion?: string,
  requestHostname = hostname,
) {
  const headers = assertion
    ? { "Cf-Access-Jwt-Assertion": assertion }
    : undefined;
  const request = new Request(`https://${requestHostname}/`, { headers });
  return {
    request,
    url: new URL(request.url),
    platform,
  } as unknown as Parameters<Handle>[0]["event"];
}

async function invoke(platform: object, assertion?: string) {
  const resolve = vi.fn(async () => new Response("ok", { status: 200 }));
  const response = await handle({
    event: event(platform, assertion),
    resolve,
  } as Parameters<Handle>[0]);
  return { response, resolve };
}

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [publicJwk] })),
  );
});

afterAll(() => vi.unstubAllGlobals());

describe("Cloudflare Access request guard", () => {
  const configured = {
    env: {
      DB: {} as App.Platform["env"]["DB"],
      CLOUDFLARE_ACCESS_ISSUER: issuer,
      CLOUDFLARE_ACCESS_AUD: audience,
      SCHEDULE_STUDIO_ACCESS_OWNER_EMAIL: ownerEmail,
      SCHEDULE_STUDIO_HOSTNAME: hostname,
    },
  };

  it("allows the configured owner on the configured hostname", async () => {
    const { response, resolve } = await invoke(
      configured,
      await makeAssertion(),
    );
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("accepts the configured owner with case and whitespace differences", async () => {
    const { response, resolve } = await invoke(
      {
        env: {
          ...configured.env,
          SCHEDULE_STUDIO_ACCESS_OWNER_EMAIL: " OWNER@EXAMPLE.COM ",
        },
      },
      await makeAssertion({
        iss: issuer,
        aud: [audience],
        email: "Owner@Example.Com ",
        exp: now + 600,
      }),
    );
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("rejects a forged signature", async () => {
    const { response, resolve } = await invoke(
      configured,
      await makeAssertion(undefined, otherKeys.privateKey),
    );
    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed assertion for a different email", async () => {
    const { response, resolve } = await invoke(
      configured,
      await makeAssertion({
        iss: issuer,
        aud: [audience],
        email: "other@example.com",
        exp: now + 600,
      }),
    );
    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed assertion without an email claim", async () => {
    const { response, resolve } = await invoke(
      configured,
      await makeAssertion({ iss: issuer, aud: [audience], exp: now + 600 }),
    );
    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed assertion on another hostname", async () => {
    const resolve = vi.fn(async () => new Response("ok", { status: 200 }));
    const response = await handle({
      event: event(
        configured,
        await makeAssertion(),
        "schedule-studio.workers.dev",
      ),
      resolve,
    } as Parameters<Handle>[0]);
    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong audience", { iss: issuer, aud: ["other-app"], exp: now + 600 }],
    [
      "wrong issuer",
      {
        iss: "https://other.cloudflareaccess.com",
        aud: [audience],
        exp: now + 600,
      },
    ],
    ["expired token", { iss: issuer, aud: [audience], exp: now - 1 }],
  ])("rejects %s", async (_label, claims) => {
    const { response, resolve } = await invoke(
      configured,
      await makeAssertion(claims),
    );
    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects requests without an assertion and fails closed when config is missing", async () => {
    const noAssertion = await invoke(configured);
    expect(noAssertion.response.status).toBe(401);
    expect(noAssertion.resolve).not.toHaveBeenCalled();

    const missingConfig = await invoke({ env: { DB: {} } });
    expect(missingConfig.response.status).toBe(503);
    expect(missingConfig.resolve).not.toHaveBeenCalled();

    const missingOwner = await invoke({
      env: {
        ...configured.env,
        SCHEDULE_STUDIO_ACCESS_OWNER_EMAIL: "",
      },
    });
    expect(missingOwner.response.status).toBe(503);
    expect(missingOwner.resolve).not.toHaveBeenCalled();

    const missingHostname = await invoke({
      env: {
        ...configured.env,
        SCHEDULE_STUDIO_HOSTNAME: "",
      },
    });
    expect(missingHostname.response.status).toBe(503);
    expect(missingHostname.resolve).not.toHaveBeenCalled();
  });

  it("keeps the adapter-node platform object {} on the local path", async () => {
    const { response, resolve } = await invoke({});
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
  });
});
