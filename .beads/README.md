# Schedule Studio Beads

This checkout uses a project-local embedded Dolt store with `dolt.local-only=true`.
Run Beads commands from the repository root with `bd --sandbox`. The local
database is stored under `.beads/embeddeddolt/` and ignored by Git.

Do not configure a Dolt remote or run push/pull unless the user explicitly
requests and approves that exact operation. Check the selected store with
`bd --sandbox where` before making changes.
