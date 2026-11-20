# Deploying to Cloudflare Workers + D1

Schedule Studio can run on Cloudflare Workers with a D1 database, protected by Cloudflare Access so only one owner can sign in. This is optional; local SQLite remains the default for development, Docker, and Home Assistant.

## How the Cloudflare build differs

- `SCHEDULE_STUDIO_TARGET=cloudflare` selects `@sveltejs/adapter-cloudflare` instead of the Node adapter.
- Data lives in D1 (`DB` binding), migrated from the same `migrations/` directory. Migration `0008_fictional_seed.sql` is D1-only; Node builds seed through `seedIfEmpty()` instead.
- Static assets are served by Cloudflare without invoking the Worker, so **Cloudflare Access must protect the whole hostname**.
- On application routes, `src/hooks.server.ts` adds a second check that **fails closed**:
  - It returns 503 if the D1 binding or any Access setting is missing.
  - It returns 403 for any hostname other than `SCHEDULE_STUDIO_HOSTNAME`.
  - It returns 401 or 403 unless the `Cf-Access-Jwt-Assertion` header carries a valid RS256 signature from your Access team's keys, with matching issuer and audience, and an email equal to the configured owner (trimmed and lowercased).
- There is no development-only authentication bypass.

## Configuration

The committed [`wrangler.jsonc`](../wrangler.jsonc) is a template with placeholders, used as-is by local tooling. For a real deployment:

```sh
cp wrangler.jsonc wrangler.production.jsonc   # gitignored
pnpm exec wrangler d1 create schedule-studio
```

In `wrangler.production.jsonc`, set:

| Setting                       | Value                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| `d1_databases[0].database_id` | ID printed by `wrangler d1 create`                          |
| `routes`                      | `[{ "pattern": "<your hostname>", "custom_domain": true }]` |
| `CLOUDFLARE_ACCESS_ISSUER`    | `https://<your-team>.cloudflareaccess.com`                  |
| `CLOUDFLARE_ACCESS_AUD`       | Audience tag of the Access application                      |
| `SCHEDULE_STUDIO_HOSTNAME`    | The hostname above                                          |

Then store the owner email as a secret. Wrangler prompts for the value, so it never appears in your shell history:

```sh
pnpm exec wrangler secret put SCHEDULE_STUDIO_ACCESS_OWNER_EMAIL --config wrangler.production.jsonc
```

## First deployment

Set up Access **before** the Worker goes live, so the hostname is never exposed without protection:

1. Confirm the zone is active in your Cloudflare account and the hostname doesn't conflict with an existing DNS record or route.
2. Create a Cloudflare Access application for the hostname:
   - Use an identity provider that supplies a verified email claim.
   - Add an Allow policy for only the owner email.
   - Choose a session length (24 hours works well).
   - Copy the application's audience tag into `CLOUDFLARE_ACCESS_AUD`. A mismatched audience fails closed.
3. Apply the D1 migrations:

   ```sh
   pnpm exec wrangler d1 migrations apply schedule-studio --remote --config wrangler.production.jsonc
   ```

4. Build, inspect a dry run, then deploy:

   ```sh
   pnpm build:cloudflare
   pnpm exec wrangler deploy --dry-run --config wrangler.production.jsonc
   pnpm deploy:cloudflare
   ```

5. Verify each of the following:
   - The owner can sign in.
   - A schedule change survives a reload.
   - An unauthenticated request is redirected by Access.
   - Other hostnames are denied.

## Updates and rollback

- Apply remote D1 migrations only when a reviewed schema change requires them.
- If checks fail after a deployment, roll back the Worker version together with any Access, hostname, or secret change that came with it.
  - Re-enabling `workers.dev` alone is not a rollback: the hostname guard still accepts only `SCHEDULE_STUDIO_HOSTNAME`.
- Preserve D1 data and the migration history.

## Local development against the Cloudflare adapter

`pnpm dev:cloudflare` runs Vite with the Cloudflare adapter. The request guard is active, so requests must use the configured hostname and carry a valid Access assertion. For data-layer checks without Access, use `pnpm test:workerd`: it applies migrations to a throwaway local D1 database and runs the D1 test Worker.
