# CLAUDE.md — working conventions for this repo

Guidance for Claude (and any AI assistant) contributing to the Mekari ERP/WMS
prototype. See `README.md` for the full project overview.

## Two-port workflow: dev (4321) + preview (4322)

Always run **two** servers, and keep them in these roles:

- **4321 — development.** `npm run dev` (default port is 4321 via
  `nuxt.config.ts` › `devServer.port`). This is where you edit. Hot-reload is
  on; CSS can transiently break during edits (Panda CSS / Vite HMR race) — that
  is expected on the dev port, don't chase it.
- **4322 — preview / demo.** `npm run build && npm run preview -- --port 4322`.
  A real production build — stable, CSS never breaks. This is the port the user
  and PMs review and demo from ("mini production").

**Rule:** edit on 4321, review on 4322. After you finish a change, **rebuild**
and **restart the 4322 preview** so it reflects the latest — the preview is a
snapshot of the last build, not live. Do this proactively at the end of a work
turn, without being asked. Anyone contributing to this repo (incl. PMs) should
follow the same two-port setup.

**⚠️ Preview must load `.env`.** `npm run preview` loads `.env` automatically, so
the Gemini-backed features (Cowork chat/plan/agents, Buzz) work. If you instead
start the built server directly with `node .output/server/index.mjs`, it does
**NOT** read `.env` — `runtimeConfig.geminiApiKey` stays empty and every Gemini
route silently falls back (`source: "fallback"`, no real model). When starting
that way, load the env first:
`set -a; . ./.env; set +a; PORT=4322 node .output/server/index.mjs`.

## UI copy

- Indonesian copy follows the **uxw-mekari** guideline (tone, grammar, term
  pairs). All strings live in `app/data/translations.ts` (English key →
  Indonesian value; used via `t()`).
- "Add new" action labels do **not** use "baru" — use the noun-only object name
  on `+` buttons / create-form titles (e.g. `+ Barang keluar`, `+ Pengeluaran`,
  `+ Gudang`); `Tambah <noun>` for combobox inline-create.
- Terminology: "Vendor" (not Supplier/Pemasok), "* number" (not "* ID").
