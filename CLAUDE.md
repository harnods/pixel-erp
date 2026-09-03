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

## Pixel 3 DT 2.4 Enterprise overrides — source of truth

Where Pixel's default DT 2.4 Enterprise rendering is wrong for this ERP, we
override it (mostly in `app/assets/css/erp.css`). The recurring "always wrong"
cases — secondary button (black text not gray, semibold), ghost button (regular
weight), primary-button icons (always white), select/search focus (neutral
slate ring, never green), **dropdowns/filters use `<ErpFilterSelect>` (an
MpPopover menu, clearable) — NEVER a native `<select>` or Pixel `MpSelect`, which
render the OS dropdown (off-system, clips in scroll containers)**, search always a
rounded form pill, 14px/regular default type (12px only for captions), ContentList
for key/value on detail pages — are all listed in
`docs/patterns/pixel-enterprise-overrides.md`. Prefer the ERP wrapper
classes/components (`btn-enterprise--*`, `.filter-search`, `ContentList`) over raw
Pixel variants. When you find a NEW recurring Pixel-default-is-wrong case, add it
there and to `erp.css`.

## Form & modal actions — always present, never disabled

The footer/action buttons of a form or modal (**Cancel** + the primary action,
e.g. Save / Import / Create) are **always rendered** — never hidden or disabled
based on whether preconditions are met. If the user clicks the primary action
before its preconditions are satisfied (nothing fetched, a required field empty,
nothing selected), **show an inline error message below the form** explaining
what to do — don't grey out or hide the button. This pairs with the no-disabled-
buttons and errors-inline-not-toast rules. Secondary buttons inside these forms
use `btn-enterprise--secondary` (black text, dark border), not a raw Pixel
`MpButton variant="secondary"`.

## Drawers — custom Teleport overlay panel (NOT Pixel `MpDrawer`)

**Pixel `MpDrawer` has NO structural CSS in this Pixel3 build** — its header and
footer detach to the viewport edges and the body renders as a bare floating card.
So ERP/Cowork drawers do **not** use `MpDrawer`. ~30 of the 38 `*Drawer.vue` (every
filters drawer, `SelectAccessDrawer`, `CrmCustomerViewDrawer`, …) use the same
hand-rolled shell — copy it from **`BillsFiltersDrawer.vue`** ("All filters"):

```
<Teleport to="body"><Transition name="xxx">
  <div v-if="open" class="xxx-overlay">          <!-- fixed inset 0; flex justify-end; overlay bg -->
    <div class="xxx-panel" role="dialog">        <!-- margin 12px; height calc(100%-24px); radius 12px; flex column; overflow hidden -->
      <header class="xxx-header">…title + MpButton close (MpIcon name="close")…</header>
      <div class="xxx-body">…scrollable content…</div>
      <footer class="xxx-footer">…ghost Cancel + primary…</footer>
```

Panel width `min(<w>px, calc(100% - 24px))`; slide-in via
`transform: translateX(calc(100% + 12px))` on enter/leave. A drawer that is a
**form** ignores overlay clicks (close only via ×/Cancel/Esc) so in-progress input
is never lost. Buttons use the `btn-enterprise--{ghost,primary,secondary}` classes,
not raw `MpButton` variants. (Modal vs drawer: drawer when the underlying page
context helps; modal for a short blocking decision.)

## List bullets — `<li>` always shows its marker

The global CSS reset strips `list-style`, so rendered/markdown lists lose their
bullets. **Every `<li>` must show a marker**: set `list-style: disc outside` on
`ul` (`decimal` on `ol`) **and** `display: list-item` on `li`. Applies to any
`v-html`/markdown output (chat, KB docs, skill preview) and hand-written content
lists — never leave a bulleted list rendering as flush, marker-less lines.

## Table column widths — MANDATORY standard (no exceptions)

Any page with a table/index/list **MUST** follow the column-width standard — no
matter what a mockup or ad-hoc request says. This is not a suggestion.

- Set each semantic column's `kind` on its `TableColumn` — **never** hardcode a
  pixel `width` on a date/number/name/status/amount/tags/unit/address column.
  Kinds: `date` (160), `number` (160–240), `name` (240–280), `status` (128–160),
  `amount` (160–240), `tags` (160–240), `unit` (128), `address` (200–240); omit
  `kind` for `default` (160–240). Only layout-only columns (icon/attachment/
  checkbox) keep an explicit `width`.
- Widths are `[min,max]` ranges resolved by `ErpTablePage` (columns grow to max, a
  flexible spacer soaks up the rest, the `[...]` actions column stays flush right).
- If a semantic column truly needs a different width, change the range in
  `columnWidths.ts` (+ the doc) so **every** table benefits — do NOT special-case
  one table with a pixel width.
- Always render tables via `ErpTablePage` + `useTableState`; never hand-roll a table.

Source of truth: `docs/patterns/ErpTablePage.md` › "Column width standard" (spec) and
`app/components/patterns/columnWidths.ts` (values) — keep the two in sync. When
building/editing a table, load the `erp-table-page` skill.

## UI copy

- Indonesian copy follows the **uxw-mekari** guideline (tone, grammar, term
  pairs). All strings live in `app/data/translations.ts` (English key →
  Indonesian value; used via `t()`).
- "Add new" action labels do **not** use "baru" — use the noun-only object name
  on `+` buttons / create-form titles (e.g. `+ Barang keluar`, `+ Pengeluaran`,
  `+ Gudang`); `Tambah <noun>` for combobox inline-create.
- Terminology: "Vendor" (not Supplier/Pemasok), "* number" (not "* ID").
