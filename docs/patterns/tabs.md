# Tabs

There are **two** distinct tab patterns in this app. Using the wrong one — or a
custom active color — is a recurring mistake. Pick by where the tabs sit.

---

## 1. Status tabs — page-level (the default for index/overview pages)

**Where:** directly **below the page title bar**, **OUTSIDE the white stage**
(they sit on the `var(--mp-background-neutral-subtle)` chrome, same as the title
bar). This is the pattern for switching a page between sections/statuses
(e.g. Inbound delivery → Receipts / Receiving / Put-away).

**How — do NOT hand-roll, and do NOT put `MpTabs` in the page.** Register the
tabs in the router, `app/pages/[...slug].vue`:

1. Add an entry to **`pageTabs`** keyed by the page label (`currentPageKey`):
   ```ts
   const pageTabs: Record<string, string[]> = {
     'Overview': ['Outbound delivery', 'Inbound delivery'],
     …
   }
   ```
   The tab bar renders itself (`.page-tabs` / `.page-tab`) below the title,
   outside the stage. It only shows when there are **≥2** tabs.
2. (Optional) map each tab to the component shown **inside the stage** via
   **`tabComponents[pageKey][tabLabel]`**. With no mapping, the stage shows the
   default “Page content goes here” placeholder.
3. Mirror a page across two routes by giving **both** page keys the same
   `pageTabs` (and `tabComponents`) entry — e.g. `Overview` and `Wms report`.

**Active state — fixed, never customize:** the active tab is styled by
`.page-tab--active`:
- text `color: var(--mp-text-selected)`
- `font-weight: var(--mp-font-weights-semi-bold)`
- a **2px bottom bar** (`::after`, `var(--mp-background-brand)`)

Do **not** invent an active color, and do **not** use `variant-color` here —
this is not an `MpTabs`.

---

## 2. In-page detail tabs — inside the stage

**Where:** **inside** a detail page's own stage (e.g. `ProductDetailsPage` →
Transactions / Unit conversions / Stock by batches). These belong to the page,
not the section.

**How:** use Pixel `MpTabs`:
```vue
<MpTabs id="…-tabs" v-model="activeTabIndex" is-manual variant-color="green">
  <MpTabList>
    <MpTab value="a">Tab A</MpTab>
    <MpTab value="b">Tab B</MpTab>
  </MpTabList>
  <MpTabPanels>
    <MpTabPanel value="a">…</MpTabPanel>
    <MpTabPanel value="b">…</MpTabPanel>
  </MpTabPanels>
</MpTabs>
```
Here `variant-color="green"` is correct — it's the Pixel component's own token.

---

## Which one?

| Question | Status tabs (§1) | In-page tabs (§2) |
|---|---|---|
| Position | Below title, **outside** stage | **Inside** the stage |
| Switches | Page **section** (index/overview) | Content **within one detail page** |
| Implementation | `pageTabs` + `tabComponents` in `[...slug].vue` | `MpTabs` in the page component |
| Active style | `.page-tab--active` (`--mp-text-selected` + 2px bar) | `MpTabs variant-color="green"` |

> If the tabs are for an index/overview page (switching what the page shows at
> the top level), it is **always** §1 — never `MpTabs` inside the page.
