# Mekari Screen — App Shell & Layout Zones

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns zone ownership, layout placement, and Mekari-specific conventions.

Every Mekari product screen sits inside an app shell. This file covers two things: (1) how to detect if the shell already exists in the project and what to do when it does not, and (2) the zone architecture and layout rules every page must follow.

---

## 1. Shell Detection

**Do this before writing any page code.** Check if the project already has a working app shell.

### Check order

1. **Layout file** — look for `app/layouts/default.vue` or `src/layouts/default.vue`. If found, read it.
2. **Navbar component** — look for `components/navbar/`, `components/navbar/index.vue`, or any file matching `*Navbar*`, `*NavBar*`, `*AppBar*`.
3. **Sidebar component** — look for `components/sidebar/`, `components/sidebar/index.vue`, or any file matching `*Sidebar*`, `*SideBar*`.
4. **pixel-blocks folder** — look for `pixel-blocks/` at project root or under `src/` or `app/`. Check for any file matching `*layout*`.

### Decision table

| Finding                                                  | Action                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout + navbar + sidebar all exist                      | Use as-is. Note the `bg` token on the layout wrapper — it should be `background.surface`. Write page components that slot into `<slot />`.              |
| Layout exists but navbar or sidebar missing              | Call `get-block` with the appropriate app-shell block (see block table below). Integrate the missing piece.                                             |
| No layout file found                                     | Call `get-block("general-layout-mekari-screen-default")`. This scaffolds navbar + collapsible sidebar + page area. Do not write the shell from scratch. |
| Layout exists but uses wrong background token on wrapper | Note it as a debt item. Do not refactor it mid-task; write the page component to work with the existing shell.                                          |

---

## 2. App Shell

### App shell blocks

| Block name                                | When to use                                                   |
| ----------------------------------------- | ------------------------------------------------------------- |
| `general-layout-mekari-screen-default`    | Navbar + Sidebar + Single layout page content                 |
| `general-layout-mekari-screen-tabs`       | Navbar + Sidebar + Tabs layout page content                   |
| `general-layout-mekari-screen-boxed`      | Navbar + Sidebar + Boxed layout page content                  |
| `general-layout-mekari-screen-child-menu` | Navbar + Sidebar + Sidebar Child + Single layout page content |

### Two background tones

Mekari screens use **two meaningful background tones**. This table shows zone assignments and ownership only.

| Zone         | Token                |
| ------------ | -------------------- |
| App shell    | `background.surface` |
| Navbar       | `background.stage`   |
| Sidebar      | `background.surface` |
| Page header  | `background.surface` |
| Page content | `background.stage`   |

```
┌─────────────────────────────────────────────────────────────────┐
│ App shell (background.surface)                                  │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Navbar (background.stage - 56px height)                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌──────┬──────────────────────────────────────────────────────┐ │
│ │      │ Page header (background.surface - 72px height)       │ │
│ │      │                                                      │ │
│ │ Side │                                                      │ │
│ │ bar  ├──────────────────────────────────────────────────────┤ │
│ │      │                                                      │ │
│ |      │ Page content (background.stage - 24px padding)       │ │
│ │      │                                                      │ │
│ │      │                                                      │ │
│ │      │                                                      │ │
│ └──────┴──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Navbar

> Call `get-block("general-layout-mekari-screen-default")` for code example

Validate with rules

- Height: **56px max** (Pixel constraint, do not exceed).
- Background: `background.stage` (white).
- Bottom border: `border.default` 1px.
- Horizontal padding: (16px) left and right.

### Left cluster

1. Product logo (`mekari [productname]` lockup). Product-specific accent color — do not invent a new color, use the brand asset from CDN.
2. Optional workspace switcher to the right of the logo (e.g. Talenta's `HRIS ▾`) — only in products with multiple workspaces.

### Right cluster (left to right)

1. **Ask Airene pill** — `BETA` tag inline. Only in products that have shipped the AI assistant. If unsure, ask — do not assume.
2. `+` create shortcut icon button.
3. Search icon button.
4. Notification bell with red count badge (`9+` if over 9).
5. App switcher (9-dot grid icon, opens cross-product launcher).
6. **User identity block** — avatar (32px circle, status dot bottom-right), then name (`Label/Semibold`) above company name (`Label small/Regular`, color: `text.secondary`) below. Whole block clickable → user menu.

---

## 4. Sidebar

> Call `get-block("general-layout-mekari-screen-default")` for code example

Validate with rules

### Single rail with labels (Qontak, Talenta, most products)

- Width ~210px.
- Background: `background.surface`.
- Right border: `border.default` 1px.
- Items: icon + label. Padding (12px) vertical, (16px) horizontal. Gap (12px).
- Default state: text `text.secondary`, icon `icon.default`.
- Hover: subtle bg tint, no text color change.
- Active state: bg `background.brand.selected`, text `text.selected`, icon `icon.brand`. Full-width fill, no left bar accent.
- Section grouping: blank line between groups, no headers, no dividers.
- Bottom: collapse toggle (`«`) flush left. Below it: `Company ID: XXXXXXXX` in `Label small/Regular`, color: `text.secondary`.

### Dual rail (Expense)

- Use when the product has 4+ modules each with 4+ sub-pages.
- Primary rail: ~64px wide, icon-only, `background.surface`. Active module: bg `background.brand.selected`, icon `icon.brand`. Bottom: collapse toggle.
- Secondary rail: ~210px wide, `background.surface`, right border `border.default`.
  - Top: `Overline/Semibold` section header in uppercase. Padding `pxl-space-md` top and left.
  - Items: `Label/Regular`, padding `pxl-space-sm` vertical, `pxl-space-md` horizontal.
  - Active: bg `background.brand.selected`, text `text.selected`.
  - Bottom: collapse toggle.

---

## 5. Page Header

> Call `get-block("page header")`. 2 ready-made blocks exist:
>
> - `general-layout-page-header-default` — title + action buttons
> - `general-layout-page-header-backlink` — back button + breadcrumb + title + CTA (standard for detail and form views)

Validate with rules

The page header band sits above the stage div. It does not have an explicit background — it inherits `background.surface` from the outer wrapper or from adjacent nav zones. This makes it visually contiguous with the sidebar.

- Horizontal padding: 24px.
- Vertical padding: 24px top, 16px bottom.
- Bottom edge: no explicit border — the contrast between surface and the stage div below acts as the separator.

### Vertical order (top to bottom, `pxl-space-xs` 8px gap between rows)

1. **Breadcrumb** (optional) — `Label small/Regular`, color: `text.secondary`. Separator: `/` with spaces. Hide if depth is 1.
   - **Current page does NOT appear in breadcrumb.** H1 below it is the current page. Breadcrumb shows only ancestor pages as clickable links.
   - ✅ Breadcrumb: `Teams` → H1: `Create team`
   - ❌ Breadcrumb: `Teams › Create team` → H1: `Create team` (duplicates current page)
2. **Title row** — flex row, `space-between`:
   - Left: `Heading/H1` + optional badge (gap 12px)
   - Right: primary CTA button.

### Primary CTA

- Variant: solid brand. Background `background.brand.bold`, text `text.inverse`, `Label/Semibold` 14.
- One primary CTA per page header only. Secondary actions go beside it as outline buttons or in a dropdown.
- Leading icon optional (`+` for create actions).

---

## 6. Page Content

> Call `get-block("general layout")`. 3 ready-made blocks exist:
>
> - `general-layout-mekari-screen-default` - Single page layout
> - `general-layout-mekari-screen-tabs` - Tabs page layout
> - `general-layout-mekari-screen-boxed` - Boxed page layout

Validate the rules

1. Ask the user or read the PRD to determine which layout to use. Default to the single-page layout.
2. Key props on the Page content: `paddingTop: 'var(--pixel-navbar-height)'`, `minHeight: '100svh'`, `width: '100%'`.
3. Page content area below the page header uses `bg="background.stage"`, `padding="24px"`, `borderTopWidth="1px"`, `borderLeftWidth="1px"`, `borderColor="border.default"`, `roundedTopLeft="md"`, `flexGrow="1"`.

## 7. View Pattern

Once the app shell and layout is confirmed, move to the relevant pattern inside the page conent:

| Screen type                                        | Reference         |
| -------------------------------------------------- | ----------------- |
| List of many records (table + filter + pagination) | `index-view.md`   |
| One record with many fields                        | `detail-view.md`  |
| Create or edit form                                | `form-view.md`    |
| No data state                                      | `empty-state.md`  |
| File upload UI                                     | `upload-flow.md`  |
| Multi-row table actions                            | `bulk-select.md`  |
| Filter or search toolbar                           | `filter.md`       |
| Destructive confirmation                           | `confirmation.md` |

---

## Common Mistakes

- Nav bar not 56px tall
- Page header not 72px tall
- Page content does not have 24px padding
- Forgetting the right border on the sidebar
- Setting `background.stage` on the layout wrapper instead of `background.surface`.
- Setting `background.surface` in the page component's content area instead of `background.stage`.
- Putting the primary CTA inside the card instead of in the page header.
