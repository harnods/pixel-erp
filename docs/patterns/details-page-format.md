# ERP Detail Page Format

A **reusable template** for any transaction *detail* (read) page in the ERP — Sales
order, Sales invoice, Sales quote, Purchase order, Delivery, … The **layout and
behaviours are identical across modules**; only the **labels, fields, tab content, and
actions change per module**. Use this doc to generate a correct detail page for *any*
transaction — it is intentionally **generic** (no single-module example).

> Built from: [ErpTablePage.md](ErpTablePage.md) · [ErpStatusBadge.md](ErpStatusBadge.md) ·
> [Form.md](Form.md) · select pattern in [Form.md → Select](Form.md#select).
> Stage padding + page title bar come from the shell ([DESIGN.md](../../DESIGN.md) → Layout).
> The global app header bar and sidebar nav are **shell** — out of scope here.

This is the read counterpart to [index-page-format.md](index-page-format.md): the index
page lists records; the detail page shows **one** record. The hover "View details"
action and the number-column link on an index page navigate here.

---

## Wireframe

Placeholders in `[brackets]` change per module; everything else is fixed.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Index label] ‹breadcrumb›                                                    │  (title bar)
│  [Entity] #[number]   [▢ Status ▾]                              [✓] [💬]       │
├──────────────────────────────────────────────────────────────────────────────┤
│  STAGE — white, padding var(--mp-spacing-6) (24px)                             │
│                                                                                │
│  ⓘ [Contextual banner message]   [inline link]      (info banner — conditional)│
│                                                                                │
│  ── Header summary ──────────────────────────────────────────────────────────│
│  [Primary label]            [Primary label]                  [EMPHASIS AMOUNT] │  ← primary row
│  [primary value]            [primary value]                  [Total Rp …]      │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  ┌ col 1 ──────┐ ┌ col 2 ─────┐ ┌ col 3 ─────┐ ┌ col 4 ─────┐ ┌ col 5 ──────┐ │  ← detail grid
│  │ [label]     │ │ [label]    │ │ [label]    │ │ [label]    │ │ [label]     │ │    (2–5 cols, max 5)
│  │ value       │ │ value      │ │ value      │ │ value      │ │ [chips]     │ │
│  │ [label]     │ │ [label]    │ │ [label]    │ │ [label]    │ │             │ │
│  │ value       │ │ value      │ │ value      │ │ value      │ │             │ │
│  └─────────────┘ └────────────┘ └────────────┘ └────────────┘ └─────────────┘ │
│                                                                                │
│  ── Line items table ─────────────────────────────────────────────────────────│
│  ┌──────────────┬─────────────┬─────┬──────┬───────────┬──────┬─────┬─────────┐│
│  │ [PRODUCT]    │ [DESC]      │ QTY │ UNIT │ UNIT PRICE │ DISC │ TAX │  AMOUNT ││
│  │ name         │ desc        │   1 │ Pcs  │ Rp120.000  │      │ PPN │ Rp120k  ││
│  │ SKU: …       │             │     │      │            │      │     │         ││
│  └──────────────┴─────────────┴─────┴──────┴───────────┴──────┴─────┴─────────┘│
│  Showing N of N products                                                       │
│                                                                                │
│  ── Notes + totals ───────────────────────────────────────────  (2 columns)   │
│  Message                                         Subtotal           Rp …       │
│  [free text]                                     Discount per line  (Rp …)     │
│  Memo                                            Global discount    (Rp …)     │
│  [free text]                                     [Tax]              Rp …       │
│  Attachment (N)                                  Shipping fee       Rp …       │
│  📎 [file.pdf]  78 KB                            ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│                                                  Total              Rp …  (bold)│
│                                                                                │
│  Last updated by [name] on [date, time] (GMT+7)        (metadata line)         │
│                                                                                │
│  ── Tabs ──────────────────────────────────────────────────────────────────── │
│  [Tab one] | [Tab two]            ← active tab has green underline             │
│  ┌─ panel ──────────────────────────────────────────────────────────────────┐ │
│  │ [Section heading]                                                          │ │
│  │ ┌ DATE ─────┬ NUMBER ─────────┬ STATUS ──┐   (related-records table)       │ │
│  │ │ 30/01/26  │ [Doc] #40018    │ ▢ Open   │                                 │ │
│  │ └───────────┴─────────────────┴──────────┘                                 │ │
│  └────────────────────────────────────────────────────────────────────────────┘
│                                                                                │
│                                       [ Print & share ▾ ]  [ Actions ▾ ]       │  ← footer action bar
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## A. Fixed — identical for every module

Reuse as-is; do not redesign per module.

1. **Layout & stage**: a single white stage, padding `var(--mp-spacing-6)` (24px) on
   all sides. Regions stack vertically: title bar → (info banner) → header summary →
   line-items table → notes + totals → last-updated → tabs → footer action bar.
   - **Region gap = `32px`** (`var(--mp-spacing-8)`) between **every** region — this is
     the standard spacing on transaction detail pages (sales order, sales invoice,
     purchase invoice, expense, …). Not 20px.
   - **Class naming**: structural classes use a **generic `detail-` prefix** (e.g.
     `detail-page`, `detail-bar`, `detail-summary`) — **not** a module-specific prefix
     like `so-`. The same markup/styles are reused across every transaction detail page
     (sales invoice, delivery, quote, purchase …); key/value fields use
     [`ContentList`](ContentList.md).
2. **Title bar** — see **[page-title-bar.md](page-title-bar.md) → Variant B (Detail)**
   for the full spec. In short: 72px bar; breadcrumb directly above the `[Entity]
   #[number]` H1 (no gap); inline status badge (`for="additionalInformation"`,
   `size="md"`) + a **jump-to-transaction chevron** (304px popover, 280px search: + 5 recent
   records); two icon buttons (`Task`, `Comment`) on the right when the module has approval.
3. **Info banner** (conditional): an `information`-colored strip
   (`var(--mp-background-information)`) with an info icon, a contextual message, and an
   optional inline link. Shown only when the record has a contextual state to surface
   (e.g. "being processed in fulfillment"); otherwise omitted.
4. **Header summary** — the record's key facts, in two parts:
   - **Primary row**: also part of the header and **on the same column grid** as the
     detail grid below — the identity fields (e.g. Customer, Email) sit in column 1
     (`318px`), column 2, … so they line up with the rows beneath them. **One emphasized
     amount** (the headline `Total`, large + bold) is **top-aligned** and right-aligned
     in the last column(s). Exactly one emphasis value.
   - A **dashed divider** between header 1 (primary row) and header 2 (detail grid):
     1px, `var(--mp-border-default)`, **4px dash / 4px gap** (via
     `repeating-linear-gradient`, since CSS `border-style: dashed` can't set the dash size).
   - **Detail grid**: a responsive **2–5 column** key-value grid (**max 5 columns**).
     Each column **stacks multiple fields** ([`ContentList`](ContentList.md)). The last
     column commonly holds tag chips. Grid sizing:
     - **Column 1 = `318px`** by default, and shrinks proportionally when the container
       is tight (`minmax(0, 318px)`).
     - **Columns 2…N fill the remaining width equally** (`1fr` each) — the count follows
       how many columns the data needs.
     - **Column gap `var(--mp-spacing-6)`** (24px); **row gap 0** — each field carries
       its own spacing.
   - **Each field is a [`ContentList`](ContentList.md)**: **8px** top & bottom padding,
     **no gap between label and value**, **no gap between fields** in a column. Label =
     12px `var(--mp-text-secondary)`; value = 14px `var(--mp-text-default)`; empty → `—`.
   - Group related fields in the same column (addresses together, dates together,
     references together).
5. **Line-items table** — **read-only**. Reuse `ErpTablePage`
   ([ErpTablePage.md](ErpTablePage.md)) with **no checkbox, no pagination, no row-hover
   actions, no sticky kebab** (or a lighter read-only `<table>` if those features get in
   the way). **Either way it MUST follow the [ErpTablePage.md](ErpTablePage.md) header
   & row spec** — don't re-style it:
   - **Header**: `neutral-subtle` gray bg, **28px**, 12px/600 uppercase, padding
     `4px 16px 4px 8px` (left) / `4px 8px 4px 16px` (right), 1px bottom border.
   - **Rows**: single-line **40px**, **6px vertical padding** (`var(--mp-spacing-1\.5)`),
     not 12px; numeric columns **right-aligned** (money in IDR).
   - **Vertical alignment is conditional**: single-line rows **middle**; a row with a
     multi-line cell (e.g. the name + `SKU:` subtitle) → that whole row **top**.
   - The primary cell stacks **name + a muted subtitle** (e.g. `SKU: …`), and gets a
     **View details** button on row hover (the product/line record's detail).
   - The footer is **progressive pagination** (`Showing N of N [items]`, load-more in
     batches of 10, bottom border) — see [ErpPagination.md](ErpPagination.md#progressive-pagination-load-more).
6. **Notes + totals** (2 columns):
   - **Left**: optional free-text blocks (**Message**, **Memo**) and an **Attachment
     list** (file-type icon + filename link + size; count in the heading `Attachment (N)`).
     The **icon reflects the file type** (`MpIcon`): `.pdf` → **`pdf-document`**, image
     (`.png/.jpg/.jpeg/.gif/.webp/.svg`) → **`image-document`**, spreadsheet
     (`.xls/.xlsx/.csv`) → **`excel-document`**, doc (`.doc/.docx`) → **`word-document`**,
     else → `attachment`.
   - **Right**: a **totals summary** — label/amount rows (per-line discount, global
     discount, tax, shipping, …) at 14px, then a **dashed rule** and the **`Total`** row.
     **`Subtotal` and `Total` use H3 — 16px semibold**; the in-between rows stay 14px.
     The **dashed rule** is **4px dash / 4px gap**, `var(--mp-border-default)` (via
     `repeating-linear-gradient`). Negative/deduction amounts shown in parentheses `(Rp …)`.
7. **Last-updated metadata line**: `Last updated by [name] on [date, time] (GMT+7)` —
   12px, rendered as a **text link** (`var(--mp-text-link)`, underline on hover) — it
   opens the record's activity/history.
8. **Tabs**: `MpTabs` / `MpTabList` / `MpTab` / `MpTabPanels` / `MpTabPanel`
   (`@mekari/pixel3`).
   - The **active tab** uses **`text/selected`** (`var(--mp-text-selected)`) for the
     label and **`border/selected`** (`#029861`) for the underline — override the raw
     `variantColor="green"` (`green.400`) to these tokens.
   - **`MpTabList` ships a 24px bottom margin** — tighten it to **20px** so the gap from
     the tabs to the panel's section heading is 20px; the **heading → table gap is 12px**.
   - Each panel usually holds a **related-records table** (e.g. DATE / NUMBER / STATUS)
     that **follows the [ErpTablePage.md](ErpTablePage.md) header & row spec** (single-line
     rows → middle), statuses via `ErpStatusBadge`. Its columns are **fixed-width and
     left-aligned** (a trailing spacer `<col>` absorbs the rest — don't let the 3 columns
     stretch full-width). The document-**number** column gets **View details** on hover
     (see [ErpTablePage.md → Row hover actions](ErpTablePage.md#row-hover-actions--view-details--open-preview)).
9. **Footer action bar**: bottom-right, two dropdown buttons — secondary
   **`Print & share ▾`** + primary **`Actions ▾`** (both `MpPopover`). Standard items
   (a `*` row is a divider):
   - **Actions**: `Preview` · *—* · `Edit` · `Set as recurring` · `Duplicate` · `Void` ·
     `Delete`.
   - **Print & share**: `Print PDF` · `Print dot matrix` · *—* · `Share via WhatsApp` ·
     `Share via email` · `Copy link`.

   The exact items can differ per module → confirm when generating (B-10).

**Token / spacing reference** (Figma `pxl-space-*` → project `--mp-*`):

| Figma | px | Project var | Typical use |
|---|---|---|---|
| pxl-space-4xs | 2 | `var(--mp-spacing-0\.5)` | hairline offsets |
| pxl-space-3xs | 4 | `var(--mp-spacing-1)` | — |
| pxl-space-2xs | 6 | `var(--mp-spacing-1\.5)` | table cell vertical padding |
| pxl-space-xs | 8 | `var(--mp-spacing-2)` | **ContentList field padding** (top & bottom); chip / inline gaps |
| pxl-space-sm | 12 | `var(--mp-spacing-3)` | totals stacking |
| pxl-space-md | 16 | `var(--mp-spacing-4)` | totals-row gap |
| pxl-space-lg | 20 | `var(--mp-spacing-5)` | section gap |
| pxl-space-xl | 24 | `var(--mp-spacing-6)` | **stage padding**, header column gap |
| pxl-space-2xl | 32 | `var(--mp-spacing-8)` | large region separation |

Type: labels = 12px `--mp-text-secondary`; values = 14px `--mp-text-default`; emphasis
`Total` larger + bold; title = H1 24px semibold. Status colours reuse `ErpStatusBadge`
(gray = `announcement`, blue = `information`).

---

## B. Per module — what you define

These change for every module. **If any are unknown, ask the user before generating.**

1. **Entity + detail URL + breadcrumb** — the detail route is `/{module}/:id` (e.g.
   `/sales-orders/:id`); the breadcrumb links back to the index page label.
   > Note: current routing is **top-level only** ([...slug].vue `pageRegistry`); detail
   > routing with an `:id` param needs an extension — flag at build time.
2. **Title format** — usually `[Entity] #[number]` (e.g. `Sales Order #20018`).
3. **Status set** — every status and its `ErpStatusBadge` type (shown as the title-bar
   badge). Reuse / extend [ErpStatusBadge.md](ErpStatusBadge.md). **Differs per module.**
4. **Header summary** — which fields appear, how they **group into 2–5 columns**, and
   **which single amount is the emphasis** value (top-right). **Ask the user.**
5. **Info banner** — whether it exists, its trigger condition(s), message, and link.
6. **Line-items columns** — column list, which are numeric/right-aligned, the primary
   cell's subtitle (e.g. SKU), and the unit/format of each.
7. **Totals rows** — which rows appear in the totals summary and their order.
8. **Notes presence** — whether Message / Memo / Attachment blocks apply.
9. **Tabs** — which tabs exist and **each tab's content** (e.g. related-records table
   columns). At least one tab is typical. **Ask the user.**
10. **Footer actions** — the **`Print & share`** menu items and the **`Actions`** menu
    items. **Ask the user.**

### Questions to ask before generating a detail page

1. Entity name, detail URL (`/{module}/:id`), and index breadcrumb label?
2. Title format (e.g. `[Entity] #[number]`)?
3. What are the statuses (+ badge type each)?
4. **Which header fields, grouped into how many columns (2–5), and which one amount is
   the emphasis (top-right)?**
5. Is there an info banner? On what condition, with what message + link?
6. Line-items columns — which, and which are numeric/right-aligned? Primary-cell subtitle?
7. Which totals rows, in what order?
8. Are Message / Memo / Attachment blocks present?
9. **Which tabs, and what is each tab's content (table columns, etc.)?**
10. **`Actions` menu items and `Print & share` menu items?**
11. **Does the module have an approval flow?** (→ `task-todo` + `comment` icon buttons
    in the title bar — see [page-title-bar.md](page-title-bar.md))

---

## Build checklist

- [ ] Collect the **per-module inputs (B)** — ask the user for anything unknown.
- [ ] Mock single-record lookup by id (reuse `app/data/<entity>.ts`).
- [ ] Page `app/components/pages/<Name>DetailsPage.vue` from this template.
- [ ] Routing for `/{module}/:id` (current routing is top-level only → extend
      `[...slug].vue` / `useNavigation` to carry an id; flag as a build consideration).
- [ ] Title bar — per [page-title-bar.md](page-title-bar.md) (Variant B): 72px, breadcrumb
      above H1 (no gap), status badge (`for="additionalInformation"`, `size="md"`) + status
      dropdown + two icon buttons (Task, Comment).
- [ ] Info banner (conditional).
- [ ] Header summary: primary row (+ one emphasis amount) → divider → 2–5 col grid.
- [ ] Read-only line-items table (`ErpTablePage` w/o checkbox/pagination/hover/kebab) +
      `Showing N of N` caption.
- [ ] Notes + totals two-column block (Message/Memo/Attachment | totals summary).
- [ ] Last-updated metadata line.
- [ ] Tabs (`MpTabs`, green underline) + each tab's related-records table.
- [ ] Footer action bar: secondary `Print & share ▾` + primary `Actions ▾` (`MpPopover`).
