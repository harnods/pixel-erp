# Page Title Bar

The bar at the top of every page's content column, between the global app header
and the white stage. It is **shared by every page type** (index, detail, form,
settings), so its dimensions and behaviour are defined **here once** — other page
formats reference this doc instead of re-specifying it.

> **Single source of truth.** When generating any page, refer to this doc for the
> title bar. [index-page-format.md](index-page-format.md),
> [details-page-format.md](details-page-format.md) and [DESIGN.md](../../DESIGN.md)
> point here.

Rendered in `app/pages/[...slug].vue` (the shell `.page-title-bar`) for top-level
pages; detail pages render their own bar with the **same** dimensions.

> **Status tabs** (section switchers, e.g. Receipts / Receiving / Put-away) sit
> directly **below** this title bar and **outside** the white stage. They are
> NOT `MpTabs` in the page — register them in `pageTabs` in `[...slug].vue`.
> See **[tabs.md](tabs.md)** for the full rule (and the correct active color).

---

## Fixed dimensions — identical for every page

| Property | Value |
|---|---|
| **Height** | **`72px`** (`var(--mp-sizes-18)`) — always, custom (not in the spacing scale) |
| Background | `var(--mp-background-neutral-subtle)` |
| Padding | `0 var(--mp-spacing-6)` (0 24px, horizontal only) |
| Vertical layout | contents **vertically centred** within the 72px |
| Title font | `var(--mp-font-sizes-2xl)` (24px), `var(--mp-font-weights-semi-bold)`, `var(--mp-text-default)` |
| Title line-height / tracking | `32px` / `-0.2px` (both custom, not tokens) |
| Title source | set from the route via `useNavigation()` |

A page title bar is a **flex row**: the title block on the **left**, actions on the
**right** (`justify-content: space-between`, `align-items: center`).

---

## Variants

### A. Index / list page

```
┌────────────────────────────────────────────────────────────────────┐
│  [Page title]                       [ Secondary ]  [ + New [entity] ]│
└────────────────────────────────────────────────────────────────────┘
```

- **Left**: the page title (plain H1, no breadcrumb).
- **Right**: **action buttons** — at least one **primary** `+ New [entity]`, plus an
  optional **secondary** (e.g. `Import`). Keep to **one primary**; bulk ops (export,
  column settings) live in the filter bar's right group, not here.
- Rendered via a `v-if="currentPageKey === '<Page>'"` block in `[...slug].vue`.

### B. Detail page

```
┌────────────────────────────────────────────────────────────────────┐
│  [Index label] ‹breadcrumb›                                          │
│  [Entity] #[number]   [▢ Status ▾]                       [✓] [💬]    │
└────────────────────────────────────────────────────────────────────┘
```

- The breadcrumb and the title line are both inside the **72px** bar, vertically
  centred, with **no gap between them** (breadcrumb sits directly above the H1).
- **Breadcrumb**: a small link back to the index page (e.g. `Sales orders`),
  `var(--mp-text-link)`, 12px.
  > **CSS requirement**: always set `align-self: flex-start` on the breadcrumb element.
  > Without it the button stretches to the full width of its flex-column container and
  > can appear indented relative to the title text below it.
- **Title**: `[Entity] #[number]` (the standard H1).
- **Inline status** right of the title: an [`ErpStatusBadge`](ErpStatusBadge.md)
  (`for="additionalInformation"`, `size="md"`).
- **Jump-to-transaction switcher**: a **chevron (▾)** right of the badge opens an
  `MpPopover` containing a **search** input on top and, below it, a **list of the 5 most
  recent records** (number + customer). Selecting one navigates to that record's detail
  (`/{module}/:id`); typing filters across all records (top 5 matches). This is how the
  user jumps between transactions.
  > `MpPopover` has **no built-in search variant** — compose it: a plain `<input>` inside
  > `MpPopoverContent`. The **search input is 280px** with **12px padding** around it →
  > the popover content is **304px** (280 + 12 + 12).
- **Icon actions** far right — **only when the page has an approval flow**: exactly
  **two icon buttons** using the Pixel icons **`task-todo`** (tooltip **`Approval log`**)
  and **`comment`** (tooltip **`Comments`**) via `MpIcon`, each wrapped in an `MpTooltip`
  (single child only).
  > Whether a module has approval is a **per-module question — ASK when generating a
  > page**. No approval flow → omit both icons.

### C. Form / create-edit page

```
┌────────────────────────────────────────────────────────────────────┐
│  [Index label] ‹breadcrumb›                                          │
│  New [entity] / Edit [entity]                                        │
└────────────────────────────────────────────────────────────────────┘
```

- **Left**: a **breadcrumb** back to the index page (same as Variant B — small
  `var(--mp-text-link)` link, **12px**, e.g. `Warehouses`), sitting directly above
  the H1 title (**no gap**, both vertically centred in the 72px bar). Title is
  `New [entity]` / `Edit [entity]`.
  > The create title is **`New [entity]`** (matches the index's `+ New [entity]`
  > button), not `Create [entity]`.
- **Right**: usually empty (form actions live in the form's own action group at the
  bottom of the stage).
- Rendered as a full-bleed page via `detailMatch` in `[...slug].vue` (the component
  brings its own title bar + stage), e.g. `/warehouses/new`.

Live reference: [NewWarehousePage.vue](../../app/components/pages/NewWarehousePage.vue).

---

## Title-bar status badge — `for="additionalInformation"`

> **Rule:** a badge that sits next to the **page-title H1** uses the **`MpBadge`
> `additionalInformation` variant** at size **`md`** — **NOT** `for="tableStatus"`
> (that small variant is for table rows).

```vue
<!-- in the title bar -->
<ErpStatusBadge :status="status" badge-for="additionalInformation" size="md" />
```

`ErpStatusBadge` exposes `badgeFor` (default `tableStatus`) and `size` for this.
Status → colour mapping lives in [ErpStatusBadge.md](ErpStatusBadge.md).

---

## Build checklist

- [ ] Bar is **72px**, background `neutral-subtle`, padding `0 24px`, contents centred.
- [ ] Title = H1 (24px semibold) from `useNavigation()`.
- [ ] **Index**: right-side primary `+ New [entity]` + optional secondary.
- [ ] **Detail**: breadcrumb + title + status badge + jump chevron. Specifically:
  - Breadcrumb: `align-self: flex-start` **required** — prevents button from stretching wide and looking indented.
  - Status badge: **`badge-for="additionalInformation"` + `size="md"`** — never `tableStatus` (that's for table rows only).
  - Jump popover: 304px wide, 280px search input, shows 5 recent records.
- [ ] **If the module has an approval flow** (ASK): two icon buttons — `task-todo`
      (tooltip `Approval log`) + `comment` (tooltip `Comments`), each in an `MpTooltip`.
      No approval → omit.
