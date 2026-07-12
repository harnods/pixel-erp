# Mekari ERP — Documentation

Start here. This is the home for ERP UI/UX documentation.

> [`DESIGN.md`](../DESIGN.md) is the single source of truth for design rules.
> The pages below are component- and page-level specs that build on it.

---

## General ERP UI/UX

| Topic | Doc | Covers |
|---|---|---|
| Design rules | [DESIGN.md](../DESIGN.md) | Theme (Enterprise), layout (stage, page title bar), Pixel component usage, table design spec, pre-coding checklist |
| Design tokens | [design-tokens.md](../.agents/skills/pixel/references/design-tokens.md) | Token priority (v2.4 vs v2.1), color / spacing / typography choices |
| Code structure | [code-structure.md](../.agents/skills/pixel/references/code-structure.md) | Vue SFC order, script-setup order, import grouping, component practices |

## Page Format

| Topic | Doc | Covers |
|---|---|---|
| Page title bar | [page-title-bar.md](patterns/page-title-bar.md) | The 72px title bar shared by every page — dimensions, index/detail/form variants, title-bar badge rule |
| Index page format | [index-page-format.md](patterns/index-page-format.md) | Wireframe + spec for list/index pages (filter bar → table → pagination) |
| Detail page format | [details-page-format.md](patterns/details-page-format.md) | Wireframe + spec for transaction detail pages (header summary 2–5 col → line items → totals → tabs → footer actions) |
| Page recipes | [page-recipes.md](patterns/page-recipes.md) | Standard scaffolds for index, form, and detail pages |

## Flows / Scenarios

| Topic | Doc | Covers |
|---|---|---|
| Inbound (Barang masuk) | [inbound-complete-scenario.md](scenarios/inbound-complete-scenario.md) | End-to-end PO → Receiving Task → Put-away: statuses, transitions, SKU-coverage rules, PO-status derivation, seed-data states. **Draft spec — pending sign-off.** |

## ERP Components

| Component | Doc | Covers |
|---|---|---|
| Table | [ErpTablePage.md](patterns/ErpTablePage.md) | Header/row/sticky columns, props, slots, emits, formatters, standard columns |
| Pagination | [ErpPagination.md](patterns/ErpPagination.md) | Rows-per-page selector, page info, prev/next |
| Filter Bar | [ErpFilterBar.md](patterns/ErpFilterBar.md) | Layout container for filter controls + standard search pattern |
| Status Badge | [ErpStatusBadge.md](patterns/ErpStatusBadge.md) | Status → badge type mapping |
| Content List | [ContentList.md](patterns/ContentList.md) | Labelled key/value field (label over value); detail header + key/value displays |
| Date format | [date-format.md](patterns/date-format.md) | Numeric `DD/MM/YYYY` table date standard; `formatDate` / `formatDateTime` helpers |
| Form | [Form.md](patterns/Form.md) | Field anatomy, layout rules (558px / 6-col), field type → Pixel component |
| Form Table | [FormTable.md](patterns/FormTable.md) | Editable table cells in forms/drawers: input cells, select/search cells, focus/error states |
| Modal | [Modal.md](patterns/Modal.md) | Centered dialog for focused/interrupting tasks |
| Drawer | [Drawer.md](patterns/Drawer.md) | Side panel for contextual detail/edit without leaving the page |
