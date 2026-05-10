# Schedule Studio

Schedule Studio is a local-first weekly planning app for seeing where time actually goes. It supports an ideal weekly template, draggable time blocks, instant timestamp pins, color-coded categories, overlap warnings, saved sandbox versions, and daily/weekly category totals.

The app is dark-mode-first and uses a Tokyo Night-inspired palette.

## Stack

- SvelteKit, Svelte 5 runes, and TypeScript
- Tailwind CSS v4
- Bits UI primitives
- SQLite with Node's built-in `node:sqlite`
- Vitest and Playwright

## Development

```sh
pnpm install
pnpm dev
```

The app stores runtime data in SQLite at `.local/schedule-studio.sqlite` by default. Override it with:

```sh
SCHEDULE_STUDIO_DB=/path/to/schedule-studio.sqlite pnpm dev
```

## Privacy

No personal schedule data is committed to this repository. Runtime databases, exports, `.env` files, and local artifacts are ignored by git. The first-run seed data is fictional and exists only to make the interface usable immediately.

To reset local data:

```sh
rm -rf .local
pnpm dev
```

## Docker

```sh
docker compose up --build
```

The container listens on `http://localhost:3000`, exposes `/healthz`, and stores SQLite data in the `schedule-studio-data` Docker volume. Override the database path with `SCHEDULE_STUDIO_DB` if you run the image without Compose.

## Home Assistant

This repository can be added to Home Assistant as an add-on repository. The add-on metadata lives in `home-assistant/schedule-studio/` and points to `ghcr.io/taylorfinklea/schedule-studio`.

The add-on opens through Home Assistant Ingress, does not publish port `3000` to the host by default, and stores SQLite data at `/data/schedule-studio.sqlite` so it persists across restarts and is included in Home Assistant backups.

## Checks

```sh
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

## License

MIT
