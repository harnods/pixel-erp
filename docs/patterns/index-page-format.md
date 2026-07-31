# ERP Index Page Format

A **reusable template** for any list/index page in the ERP — Sales orders,
Purchase invoices, Products, Vendors, Stock adjustments, … The **layout and
behaviours are identical across modules**; only the **columns, status set,
labels, and title-bar actions change per module**. Use this doc to generate a
correct index page for *any* module — not just the example at the bottom.

> Built from: [ErpTablePage.md](ErpTablePage.md) · [ErpFilterBar.md](ErpFilterBar.md) ·
> [ErpPagination.md](ErpPagination.md) · [ErpStatusBadge.md](ErpStatusBadge.md) ·
> select pattern in [Form.md](Form.md#select).
> Stage padding + title bar come from the shell ([DESIGN.md](../../DESIGN.md) → Layout).

---

## Wireframe

Placeholders in `[brackets]` change per module; everything else is fixed.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Page title]                          [ Secondary ]  [ + New [entity] ]       │  (title bar)
├──────────────────────────────────────────────────────────────────────────────┤
│  STAGE — white, padding var(--mp-spacing-6) (24px)                             │
│                                                                                │
│  ── Filter bar ──────────────────────────────  (flex, space-between, no border)│
│  ┌─ left ───────────────────────────┐        ┌─ right ───────────────────────┐ │
│  │ [ Status ▾ ]  [ ⚙ All filters ]  │        │ [✦] [▥] [⭳]   [ 🔍 Search… ] │ │
│  └──────────────────────────────────┘        └───────────────────────────────┘ │
│                                                                                │
│  ── Table ──────────────────────────────────────────────────────────────────  │
│  ┌────┬───────────┬───────────┬───────────┬───────────┬─ … ─┬────┐            │
│  │ ☑  │ [COL 1]   │ [COL 2]   │ [COL 3]   │ [STATUS]  │ …   │ ┊  │  ← sticky top │
│  │ ☐  │ value     │ value     │ value     │ ▢ badge   │ …   │ ┊  │            │
│  └────┴───────────┴───────────┴───────────┴───────────┴─ … ─┴────┘            │
│    ▲ checkbox merges into the FIRST column     kebab sticky-right + border     │
│      (select-all in header)                    ONLY when table overflows       │
│                                                                                │
│  ── Pagination ─────────────────────────────────  (flex, space-between, border-top)│
│  Rows per page [ 25 ▾ ]   Showing 1–25 of N           Page 1 of X      ‹  ›    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## A. Fixed — identical for every module

Reuse as-is; do not redesign per module.

1. **Layout**: Filter bar → Table → Pagination, inside the white stage
   (padding `var(--mp-spacing-6)`).
2. **Title bar** — see **[page-title-bar.md](page-title-bar.md)** (the single source of
   truth for every page's title bar). Index variant: page title left; **action buttons
   right** — one **primary** `+ New [entity]` + optional **secondary** (e.g. Import).
   Bulk ops (export, column settings) go in the filter bar's right group, not here.
3. **Filter bar** (`#filters` slot — `space-between`, no border):
   - **Left**: **quick filter(s)** (`MpSelect` **fixed 160px**, long label truncates
     with `…`; `MpPopover` dropdown shows full text) + **All filters** pill (filter
     icon left). Quick-filter rules (see
     [Form.md → Select](Form.md#select)): **placeholder = filter name** (e.g. `Status`),
     options = real values only (**no "All …"**), `(x)` clears to show-all. **Max 2
     quick filters.**
   - **Right**: AI · column-settings · export icon buttons + pill **Search…**.
     Each icon button is wrapped in an **`MpTooltip`** (`Ask Airene` / `Column settings`
     / `Export`, `placement="bottom"`). Like `MpPopoverTrigger`, an `MpTooltip` takes a
     **single child** — no comment/sibling inside it.
4. **Table** (`ErpTablePage`, `has-checkbox`):
   - Checkbox merges into the **first column's cell** (select-all in header).
   - Sticky header; actions kebab is **sticky-right with a separator border ONLY when
     the table overflows horizontally** — and a persistent scrollbar is shown.
   - **Row hover actions**: number → **View details**; customer/vendor → **Open preview**
     (always); other columns → **ask** (see B-5).
   - **Actions kebab menu**: the `⋮` column always opens an **`MpPopover`** dropdown;
     **`View details` is always the first item**; `Share via …` actions are separated
     by a divider; min-width 160px, single-line labels (see
     [ErpTablePage.md → Row actions menu](ErpTablePage.md#row-actions-menu-kebab)).
   - **Row metrics**: follow [ErpTablePage.md → Row](ErpTablePage.md#row) as the
     single source of truth.
   - **Skeleton** = 3 solid rows: on **first load** (`:loading`) and **automatically
     on every page / rows-per-page change** (built into `ErpTablePage`).
   - **Cell alignment**: follow [ErpTablePage.md → Cell content rules](ErpTablePage.md#cell-content-rules).
   - **Tags column** uses `ErpTagList` (clamped to 2 lines, `More` link on overflow).
   - **Empty state** — two variants (see [ErpTablePage.md → Empty state](ErpTablePage.md#empty-state--two-variants)):
     *full* (illustration + title + CTA via `#empty`, no data ever) vs *inline*
     ("No results found" + "Clear all filters", when search/filter empties the list →
     pass `has-active-filter` + handle `clearFilters`).
5. **Pagination**: default **25 rows/page**.

All wired with `useTableState(rows, { perPage: 25, filterFn })` (search + status + sort + pagination).

---

## B. Per module — what you define

These change for every module. **If any are unknown, ask the user before generating.**

1. **Entity + sidebar label** — the `pageRegistry` key must match the sidebar label
   exactly (e.g. `'Sales orders'`, `'Purchase invoices'`).
2. **Columns** — for each: `key`, `label`, `width`, `align` (left/right/center), and
   **format**:
   - date → `DD/MM/YYYY` · currency → IDR · number → custom (e.g. `Sales Order #10090`)
   - status → `ErpStatusBadge` · tags → chips · plain text
   - A clickable identifier / vendor / customer cell is a **text link** (`.cell-link`),
     never a hover chip — see [ErpTablePage.md](./ErpTablePage.md#clickable-cells--text-links-cell-link).
   - The **first column** is where the checkbox merges (usually a date or the primary id).
   - Right-align numeric/currency columns.
3. **Status set + badge mapping** — list every status and its `ErpStatusBadge` type
   (`completed`/`warning`/`critical`/`information`/`announcement`). Add any new status to
   `ErpStatusBadge` (+ [ErpStatusBadge.md](ErpStatusBadge.md)). **This differs per module.**
   (gray = `announcement`, blue = `information`.)
4. **Quick filters (max 2)** — which filter(s) appear in the filter bar's left group
   and their options. Each: placeholder = the filter name, real-value options only,
   `(x)` to clear (see [Form.md → Select](Form.md#select)). **Ask the user.**
5. **Row hover actions** — which column is **View details** (the record's detail page —
   usually the document/number column) and which is **Open preview** (customer/vendor
   **always**; any other column is a per-module decision → ask).
6. **Actions kebab menu items** — `View details` is always there; the rest differ per
   module → **ask**. `Share via …` items go in a divider-separated group at the bottom.
7. **Title-bar buttons** — primary create label (`New [entity]`) + optional secondary.
8. **Empty state (full variant)** — illustration (public asset, dynamic `:src`) + fixed
   copy: title **`No {entities}`** (no "yet"), description **`{Entities} will appear here.`**,
   and a **secondary** CTA **`+ New {entity}`**. (The inline "no results" variant is built in.)
9. **Mock data** — `app/data/<entity>.ts` (+ type in `app/data/types.ts`, export from
   `app/data/index.ts`).

### Questions to ask before generating an index page

1. Entity name + sidebar label?
2. Which columns, in what order — and each one's width, alignment, and format?
3. Document-number format (if any)?
4. What are the statuses, and what colour/type is each?
5. **Which quick filters (max 2), and what options does each have?** (placeholder = filter name; no "All …" option)
6. Which columns get **View details** vs **Open preview**? (customer/vendor = preview by default)
7. What **actions kebab menu** items, besides the always-present **View details**?
8. Title-bar actions — primary create label + any secondary button?

---

## Example — Sales Orders

The concrete instance of the template above
([SalesOrdersPage.vue](../../app/components/pages/SalesOrdersPage.vue)).

**Columns**

| # | Column | key | width | align | Notes |
|---|---|---|---|---|---|
| 1 | Date | `date` | 120px | left | checkbox merges here; `DD/MM/YYYY` |
| 2 | Number | `number` | 200px | left | sortable; `Sales Order #{number}`; **View details** on hover |
| 3 | Customer | `customerName` | 240px | left | sortable; **Open preview** on hover |
| 4 | Due date | `dueDate` | 120px | left | `DD/MM/YYYY` |
| 5 | Status | `status` | 180px | left | `ErpStatusBadge` |
| 6 | Balance due | `balanceDue` | 160px | right | IDR |
| 7 | Total | `total` | 160px | right | IDR |
| 8 | Tags | `tags` | 160px | left | chips |
| — | Actions | (slot) | 44px | center | kebab `⋮`, sticky-right on overflow |

**Status set** (Sales Orders only — other modules differ)

| Status | Badge type | Colour |
|---|---|---|
| Open | `warning` | yellow |
| Partially processed | `information` | blue |
| Closed | `announcement` | gray |
| Voided | `announcement` | gray |

**Title bar**: secondary `Import` + primary `+ New sales order`.

**Actions kebab menu**: View details · Create sales delivery · Create sales invoice ·
Mark as completed · Duplicate · *(divider)* · Share via WhatsApp · Share via email · Copy link.

---

## Build checklist

- [ ] Collect the **per-module inputs (B)** — ask the user for anything unknown.
- [ ] Mock data `app/data/<entity>.ts` + type in `types.ts` + export from `index.ts`.
- [ ] Page `app/components/pages/<Name>Page.vue` from this template.
- [ ] `useTableState(rows, { perPage: 25, filterFn })`.
- [ ] Register in `pageRegistry` (`app/pages/[...slug].vue`); key = sidebar label.
- [ ] Title-bar `v-if` block in `[...slug].vue` (primary create + optional secondary).
- [ ] New statuses → `ErpStatusBadge` (+ [ErpStatusBadge.md](ErpStatusBadge.md)).
- [ ] Quick filter(s) (max 2): `MpSelect`+`MpPopover`, placeholder = filter name, no "All …" option, `(x)` clears — **ask which filters & options**.
- [ ] Row hover actions: number → View details, customer/vendor → Open preview, others → ask.
- [ ] Actions kebab → `MpPopover` menu: View details first, ask for the rest, `Share via …` in a divider-separated group.
- [ ] First-load skeleton via `:loading`.
