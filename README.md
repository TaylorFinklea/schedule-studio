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

The container listens on `http://localhost:3000` and stores SQLite data in the `schedule-studio-data` Docker volume. Override the database path with `SCHEDULE_STUDIO_DB` if you run the image without Compose.

## Checks

```sh
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

## License

MIT
