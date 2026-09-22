# Page Recipes — routing only

This file used to contain standalone scaffolds for index/form/detail pages.
**Those scaffolds were wrong and are gone** — they hardcoded pixel `width` on
`TableColumn` (violating the mandatory `kind` standard enforced by the
`erp-table-page` skill) and put `padding="6"` on a page root without
distinguishing `pageRegistry` (stage already pads) from `detailMatch` (page
owns its own padding). Several *other* docs still said "see page-recipes.md
for the full recipe" while the *actual* full, current, rule-compliant recipe
lived in a different file — two competing answers to "how do I build a page,"
one of them wrong. If you got a page format wrong before this file was fixed
(2026-09-15), this is very likely why.

This file is now **routing only** — it sends you to the one real doc per page
type. Do not add scaffolds back here; extend the target doc instead.

| Trigger | Go to | Also invoke |
|---|---|---|
| `/create-index-page`, "bikin index page", "create index page", "index page" | [index-page-format.md](index-page-format.md) | skill **`erp-table-page`** (mandatory — column-width `kind` standard) |
| `/create-form-page`, "bikin form page", "create form page", "form page" | [Form.md](Form.md) → "Full form-page example" | — |
| `/create-detail-page`, "bikin detail page", "create detail page", "detail page" | [details-page-format.md](details-page-format.md) | — |

All three page types share [page-title-bar.md](page-title-bar.md) (the title
bar) and the `pageRegistry` vs `detailMatch` stage-padding split documented in
`CLAUDE.md`/`DESIGN.md` → "Layout" → "Stage": a `pageRegistry` page (index,
simple pages) renders inside the shell's `.stage` wrapper and must **not** add
its own padding; a `detailMatch` page (detail, form — anything with a dynamic
`:id` or its own full-bleed layout) owns its entire layout and applies the 24px
stage padding itself. Get this backwards and you either double-pad (48px) or
have no padding at all — check `app/pages/[...slug].vue` for which registry
your page type is wired into before writing the root element.

**Never create a new component/pattern** when an existing one can be
customised via slots or props (`ErpTablePage`, `ErpFilterBar`, `ErpStatusBadge`,
`ContentList`, drawers, `ConfirmModal`, …).
