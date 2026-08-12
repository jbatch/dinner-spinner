# Dinner Spinner

Tiny household dinner wheel with password auth and SQLite storage.

## Run

```bash
pnpm install
DINNER_SPINNER_PASSWORD="pick-a-password" pnpm start
```

Open `http://localhost:3000`.

On this machine, if `node` is not on your shell `PATH`, use the bundled runtime directly:

```bash
DINNER_SPINNER_PASSWORD="pick-a-password" /Users/josh.batchelor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

Optional env vars:

- `PORT`: defaults to `3000`
- `DB_PATH`: defaults to `./data/dinner-spinner.sqlite`
- `COOKIE_SECRET`: defaults to the password, but set it separately if you want stable cookies when rotating the password
