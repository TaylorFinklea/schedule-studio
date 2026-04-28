# Decisions

## 2026-04-27

- Use SvelteKit, Svelte 5 runes, Tailwind v4, Bits UI, and local SQLite.
- Make the repo public under the MIT license.
- Keep all real schedule data out of source control.
- Use Node's built-in `node:sqlite` driver so the app avoids native dependency build scripts.
- Use a Tokyo Night-inspired dark palette as the default theme.
- Store schedule versions as separate local SQLite templates, with active/default IDs in `app_settings`.
- Package production with a multi-stage Node Docker image and a mounted `/data` SQLite volume.

## 2026-04-28

- Calendar hover creation shows explicit Block and Pin actions instead of creating items immediately, and calendar-created blocks default to 30 minutes.
