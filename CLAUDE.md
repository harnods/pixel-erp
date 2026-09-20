# CLAUDE.md — working conventions for this repo

Guidance for Claude (and any AI assistant) contributing to this repository.
See `README.md` for the full project overview.

## SOP — mandatory workflow for every task

Every task — no matter how small — follows these steps in order. No shortcuts.

### 1. Map all dependencies and relations — ask if unsure

Before writing a single line of code, understand the **full scope** of what the
request touches. Read the relevant files and grep for every identifier, label,
type, and data structure involved. Build a mental map of all places that will be
affected — components, data files, pages, types, CSS, translations, validation
logic, computed properties, utilities. **Nothing may be missed.** Every feature in
this codebase is interconnected; changing one spot without updating the rest
creates broken states, stale references, and wasted round-trips.

**If you are unsure about the context, don't know the full scope, or don't
understand how a feature connects to the rest — STOP and ask the user before
executing.** Do not guess or assume. A wrong assumption wastes more time than a
question.

### 2. Read design guidelines and rules

Before any execution, read the relevant design documentation:
- **Invoke the `pixel-erp-design` skill** — this is the mandatory entry point for
  any UI work. It routes to the exact rules and pattern docs for the surface.
- **Read `docs/design/RULES.md`** — the canonical rule registry. When a mockup or
  your instinct conflicts with a rule, **the rule wins**.
- **Read `docs/design/reachable-states.md`** — every surface must cover all states
  (empty, filtered-empty, loading, error, permission, destructive).
- Check `docs/patterns/*` for the specific component/pattern being touched.

This step is not optional. Do not start coding until you have read the relevant
guidelines.

### 3. Apply changes to ALL related places — ask if unsure about components

Make the change in every file identified in step 1 — in a single turn. **If you
are unsure which component to use, or don't know the right pattern for a UI
element — ask the user.** Do not pick a component that "seems right". Common
related places to check:
- `app/data/crm.ts` — types, seed data, properties, module definitions
- `app/data/crmConversion.ts` — validation, readiness, mapping logic
- `app/data/translations.ts` — UI copy
- `app/data/devChanges.ts` — coachmark entries (see step 8)
- Page components (`Crm*Page.vue`) — rendering, tabs, computed values
- Pattern components (`Crm*Builder.vue`, `CrmMappingRow.vue`) — shared UI
- `docs/design/RULES.md` — if a design decision is involved

**Every feature must be functional — not just UI.** All data must be persisted
to the DB (`app/data/persist.ts` — `saveSnapshot`/`loadSnapshot`/`saveCreated`)
so it survives page refresh. No dead-end UI — if a form saves, the saved data
must appear and be usable everywhere it's relevant:
- Within the same module: index page, detail page, related lists, dropdowns, counts.
- **Across other modules**: data has dependencies and relationships beyond its
  own module. A deal links to customers, products, sales orders, quotes,
  contacts, pipelines, properties, ERP transactions, etc. When data is created
  or changed, trace every dependency chain and make sure all consuming modules
  reflect it — dashboards, reports, filters, conversion configs, computed
  totals, navigation counts, badges, and any other module that reads this data.
  If module A references module B's data, the connection must work both ways.

### 4. When unsure about icons, ask

Never guess which icon to use. Ask the user.

### 5. Build

Run `npm run build` to verify zero compilation errors.

### 6. Run tests — all must pass

Run `npm run test -- --run`. Every change must pass the full test suite before
proceeding. The test suite includes:
- **Pixel police** (`tests/pixel-police.spec.ts`) — design compliance: no
  off-theme colors, no raw HTML controls, no hardcoded color literals, no
  drop-shadow, correct toast usage. If your change introduces a violation, fix it.
- **Component usage tests** — verify correct use of Pixel components, copy
  library strings, and enterprise overrides.
- **Feature/logic tests** — business logic, data flows, state transitions.

If any test fails **because of your change**, fix the code (not the test) until
green. If a test was already failing before your change (pre-existing), note it
but do not ignore new failures.

For new features or significant changes, **write a test** that covers the new
behaviour — add it to `tests/` following existing naming conventions
(`<feature-slug>.spec.ts`).

### 7. Restart preview on port 4322

Kill the old process and start the new build with `.env` loaded:
`lsof -ti:4322 | xargs kill -9; set -a; . ./.env; set +a; PORT=4322 node .output/server/index.mjs`

### 8. Add coachmark for the change

Tag every changed/new UI element with `data-devchange="<id>"` in the template,
and add a corresponding entry in `app/data/devChanges.ts` with a clear title,
description, and today's date. This is how engineers and PMs see what changed.

### 9. Verify in browser

Open the affected page(s) on port 4322 in the browser. Screenshot to prove the
change works. Check related pages too — if you changed a data model or validation,
verify the index page, detail page, and any other surface that consumes it.

---

## ⛔ Before ANY UI work — read this first

Building or editing **anything a user sees** (a `.vue` page/component, form, modal,
table, drawer, filter, button, copy)? **Do not work from your training prior.**

1. **Invoke the `pixel-erp-design` skill.** It routes you to the exact rules +
   pattern docs for the surface you're touching, and carries the authority
   hierarchy. It is the mandatory entry point.
2. **`docs/design/RULES.md`** is the canonical rule registry — every accepted
   decision as a stable `rule/<id>` with Do/Don't + Why + Source. When a mockup or
   your instinct conflicts with a rule, **the rule wins** (see the hierarchy in the
   skill / RULES.md). Cite rule IDs in commits and PRs.
3. **`docs/design/reachable-states.md`** — a surface isn't done until every state
   it can reach is designed (empty / filtered-empty / loading / error / permission /
   destructive), not just the populated success case.
4. `pixel-police` (a PostToolUse hook) flags the grep-able rules automatically and
   cites the `rule/*` ID; resolve or justify each note.

The sections below are the long-form rationale for specific rules — RULES.md is the
index; this file and `docs/patterns/*` are the detail.

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
`transform: translateX(calc(100% + 12px))` on enter/leave. **Every** drawer (and
every modal) closes **only** via its × button — the overlay ignores clicks and
there is no Esc-to-close listener (`rule/modal-drawer-close-explicit-only`), so
in-progress input or context is never lost to a stray click or keypress. Buttons
use the `btn-enterprise--{ghost,primary,secondary}` classes,
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
