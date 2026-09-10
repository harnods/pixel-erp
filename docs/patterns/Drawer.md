# Drawer

**Implementation**: a hand-rolled **`Teleport` overlay panel** — **not** Pixel `MpDrawer`.
**Purpose**: Side panel that slides in from the edge for contextual detail or editing without leaving the current page.

> ⚠️ **Never use `MpDrawer` (or `MpDrawerHeader` / `MpDrawerFooter`)** — it has **no
> structural CSS** in this Pixel3 build: the header/footer detach to the viewport
> edges and the body renders as a bare floating card (`rule/drawer-custom-shell`).
> Every ERP/Cowork drawer uses the same **custom Teleport shell** instead — copy it
> from **`BillsFiltersDrawer.vue`** ("All filters"). This is the canonical, only
> supported drawer. (~30 of 38 `*Drawer.vue` already use it.)

---

## Modal vs Drawer

| Use a… | When |
|---|---|
| **Drawer** | User benefits from keeping the underlying page context — view/edit a record's detail, side-by-side reference, longer forms that aren't a full page. Slides from the right. |
| **Modal** | Short, interrupting decision that needs full focus and blocks the page (confirm delete). See [Modal.md](Modal.md). |

---

## The custom Teleport shell (ERP default)

A `Teleport`+`Transition` `.xxx-overlay` (fixed inset 0; flex justify-end; overlay
bg) wraps a `.xxx-panel` (12px margin; `calc(100% - 24px)` height; 12px radius; flex
column; `overflow: hidden`) with plain `<header>` / `.body` / `<footer>` inside.
Panel width `min(<w>px, calc(100% - 24px))`; slide-in via
`transform: translateX(calc(100% + 12px))` on enter/leave. Footer uses the
`btn-enterprise--{ghost,primary}` classes: **ghost Cancel + primary Save**
(`rule/btn-cancel-ghost`). A drawer that is a **form** ignores overlay clicks
(close only via ×/Cancel/Esc) so in-progress input is never lost.

```vue
<template>
  <Teleport to="body">
    <Transition name="xxx">
      <div v-if="open" class="xxx-overlay">           <!-- fixed inset 0; flex justify-end; overlay bg -->
        <div class="xxx-panel" role="dialog">         <!-- margin 12px; height calc(100%-24px); radius 12px; flex column; overflow hidden -->
          <header class="xxx-header">
            Title
            <MpButton class="xxx-close" aria-label="Close" @click="open = false"><MpIcon name="close" /></MpButton>
          </header>
          <div class="xxx-body">…scrollable content (reuse Form.md field anatomy)…</div>
          <footer class="xxx-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="open = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="save">Save</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
```

See `BillsFiltersDrawer.vue` for the full, copy-paste-ready shell (overlay/panel/
header/body/footer CSS + the slide transition), and CLAUDE.md › "Drawers".

---

## Anatomy

- Open state controlled by a boolean (`v-if` on the overlay).
- Header: title + close button (`MpIcon name="close"`).
- Body: scrollable content (detail fields or a form — reuse [Form.md](Form.md) field anatomy).
- Footer: actions — **ghost Cancel + primary confirm** (`rule/btn-cancel-ghost`).
