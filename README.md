# Mekari ERP — WMS/ERP Prototype

A clickable Nuxt 3 + Vue 3 prototype of Mekari's ERP and WMS (Warehouse
Management System) product, built on the **Mekari Pixel 3** design system.
Everything runs in the browser against mock data — there is no real backend,
so anyone can clone it, run it, and start prototyping new screens or flows
immediately.

This is the right repo for: mocking up a new ERP/WMS screen, testing a flow
end-to-end with realistic (fake) data, or demoing a feature idea before it's
built for real.

---

## Quick Start

```bash
# 1. Clone
git clone <repo-url>
cd erp-app

# 2. Install
npm install

# 3. Run dev server
npm run dev
```

Open **http://localhost:4321**.

Other scripts: `npm run build` (production build), `npm test` (run the test
suite), `npm run generate` (static export).

### Two ports: dev (4321) vs preview (4322)

We run **two** servers side by side, and you should too:

| Port | Command | What it's for |
|---|---|---|
| **4321** | `npm run dev` | **Development.** Hot-reload while editing. Fast, but CSS can transiently break during edits (a known Panda CSS / Vite HMR race) — that's expected here. This is your *working* port. |
| **4322** | `npm run build && npm run preview -- --port 4322` | **Preview / demo.** Serves a real production build — stable, CSS never breaks. Treat it like a mini "production". This is the port you (or a PM) *review and demo* from. |

Workflow: **edit on 4321, review on 4322.** After finishing a change,
`npm run build` again and restart the 4322 preview so it reflects the latest —
the preview is a snapshot of the last build, not live. Keeping the review port
on a clean build is why the demo never shows a broken-CSS flash.

> All data is fake and lives only in your browser's `localStorage` — nothing
> is shared between people or devices. If a demo gets into a confusing state,
> open the account menu (top right) → **Reset demo data** to wipe it back to
> the seed state.

---

## What you're looking at: Scenarios

The same app ships four "scenarios" — different slices of the product aimed
at different audiences. Switch between them from the account menu (top
right) → **Switch to WMS → Select scenario**:

| Scenario | What it shows |
|---|---|
| **ERP** | The full ERP suite — Sales, Purchases, Inventory, Accounting, Production, Contacts, Settings — plus WMS as one menu inside it. This is the default. |
| **WMS Standalone** | WMS sold as its own product: Home, Reports, Inventory, Warehouses, Inbound/Outbound delivery, Stock adjustments, Settings. |
| **WMS Ops / WMS Ops 2** | A trimmed-down, single-warehouse operator view (what a warehouse worker would actually use day to day) — scoped to whichever warehouse and flows (inbound/outbound) that operator is assigned. |

Your choice is remembered (in `localStorage`), so refreshing stays on the
same scenario until you switch again.

---

## Design rules — read this before building a screen

**[DESIGN.md](DESIGN.md)** is the single source of truth for how things
should look and behave: the Enterprise Pixel theme, page layout (stage
padding, the 72px page title bar), which Pixel components to use, button
rules (secondary vs. ghost, "Save" vs. "Save changes"), status badge
mapping, and a pre-coding checklist.

**[docs/](docs/README.md)** goes deeper on specific patterns — page title
bar, index page format, detail page format, the custom `ErpTablePage` /
`ErpFilterBar` / `ErpPagination` / `ErpStatusBadge` components, forms, modals,
drawers, toasts, and date formatting. Check here before inventing a new UI
pattern — there's almost always an existing one to reuse.

---

## How the app is put together

```
erp-app/
├── app/
│   ├── app.vue                        # Entry point (sets the Pixel Enterprise theme)
│   ├── layouts/default.vue            # Shell: header + sidebar (don't change)
│   ├── pages/
│   │   └── [...slug].vue              # ALL routing lives here — see below
│   ├── components/
│   │   ├── ErpHeader.vue              # Top header bar, scenario switcher, reset-data control
│   │   ├── ErpSidebar.vue             # 3-level nav — add new menu items here
│   │   └── pages/                     # One .vue file per screen (this is where you'll spend most of your time)
│   │       ├── HomePage.vue
│   │       ├── PlaceholderPage.vue     # Shown for any screen not yet built
│   │       └── ...
│   ├── components/patterns/           # Reusable ERP building blocks: ErpTablePage, ErpFilterBar, ConfirmModal, etc.
│   ├── data/                          # Mock "database" — one file per entity (warehouses.ts, couriers.ts, ...)
│   └── composables/
│       ├── useNavigation.ts           # Sidebar ↔ URL mapping (don't change)
│       └── useScenario.ts             # Which of the 4 scenarios is active
├── tests/                             # Vitest specs (93+ files) — data-layer logic, not UI snapshots
├── docs/                              # Pattern-level design docs (see above)
├── DESIGN.md                          # Design rules (see above)
└── package.json
```

### Routing: `app/pages/[...slug].vue`

Every URL in the app is handled by this one file, via two mechanisms:

1. **`pageRegistry`** — a simple lookup keyed by the exact page label shown
   in the sidebar, for plain pages with no dynamic ID:
   ```ts
   const pageRegistry: Record<string, Component> = {
     'Couriers': defineAsyncComponent(() => import('~/components/pages/CouriersPage.vue')),
     // ...
   }
   ```
   A page not yet in this list just shows a placeholder — nothing breaks.

2. **Detail routes** (anything with a dynamic `:id`, like `/warehouses/wh-001`
   or `/product-list/SKU-1/edit`) are matched by hand further down the same
   file, by inspecting the URL's path segments.

### Mock data: `app/data/`

There's no backend — every entity (warehouses, products, purchase orders,
couriers, ...) is a plain reactive array in `app/data/*.ts`, seeded with
realistic fake data on load. Anything a user creates or edits is persisted to
`localStorage` so it survives a refresh, but **Reset demo data** (account
menu) wipes it all back to the original seed. Never hardcode data inside a
`.vue` component — add or extend a file in `app/data/` instead.

---

## Adding a new screen — the actual steps

Using a simple example, e.g. adding **"Couriers"** as a new page under WMS:

**1. Add the mock data** (`app/data/couriers.ts`):
```ts
export const couriers = reactive<Courier[]>(seedOrLoadedData)
export function addCourier(name: string) { /* ... */ }
```

**2. Build the page** (`app/components/pages/CouriersPage.vue`) — reuse
`ErpTablePage` for any list/index screen (see
[docs/patterns/ErpTablePage.md](docs/patterns/ErpTablePage.md)), don't build
a table from scratch.

**3. Add it to the sidebar** (`app/components/ErpSidebar.vue`):
```js
{ label: 'Couriers' },
```

**4. Register the route** (`app/pages/[...slug].vue`):
```js
'Couriers': defineAsyncComponent(() => import('~/components/pages/CouriersPage.vue')),
```
The key must match the sidebar label **exactly**.

**5. (Optional) Title-bar button** — if the page needs a primary action like
"Add courier" next to the page title, add a small conditional block keyed on
`currentPageKey === 'Couriers'` in the title-bar section of `[...slug].vue`
(search for an existing one, e.g. `'Bill of materials'`, and copy its shape).

That's it — no build step, no backend, no migration. Refresh the browser and
the new page is live in the sidebar.

---

## Testing

```bash
npm test
```

Runs the Vitest suite (`tests/*.spec.ts`) — these mostly check the mock
data layer's business logic (stock math, status transitions, validation
rules), not visual UI. Worth running after changing anything in `app/data/`.

---

## Deployment

Deployed to **Vercel** as a static SPA (`vercel.json` handles client-side
routing). Pushing to `main` triggers a deploy — there's no separate backend
or database to provision.

---

## Pixel Design System

All UI components and design tokens come from `@mekari/pixel3` (Enterprise
theme):

```vue
<script setup lang="ts">
import { MpButton } from '@mekari/pixel3'
</script>
```

Docs: [docs.mekari.design](https://docs.mekari.design/). Check
[DESIGN.md](DESIGN.md) first for this project's specific rules before
reaching for a Pixel component directly.
