# Drawer

**Pixel components**: `MpDrawer` (+ header / body / footer subcomponents — verify with `get-component`)
**Purpose**: Side panel that slides in from the edge for contextual detail or editing without leaving the current page.

> ⚠️ **`MpDrawerHeader` / `MpDrawerFooter` are broken in this Pixel3 build** — they
> render *outside* the floating card, detached at the viewport top/bottom edges (only
> `MpDrawerBody` is styled as the card). **Do not use them.** Two working options:
>
> 1. **Preferred — custom Teleport overlay** (what ~30 of 38 `*Drawer.vue` use, incl.
>    every filters drawer). Copy the shell from **`BillsFiltersDrawer.vue`**. No
>    `MpDrawer` at all: a `Teleport`+`Transition` `.xxx-overlay` (fixed inset 0) around
>    a `.xxx-panel` (12px margin, `calc(100%-24px)` height, 12px radius, flex column)
>    with plain `<header>` / `.body` / `<footer>` inside. This is the ERP default.
> 2. **MpDrawer, header+footer inside the body.** If you use `MpDrawer`, put the header
>    row, content, AND footer row all inside a single `MpDrawerBody` (styled as the
>    card) — never `MpDrawerHeader`/`MpDrawerFooter`. See `NewLocationDrawer.vue`.

---

## Modal vs Drawer

| Use a… | When |
|---|---|
| **Drawer** | User benefits from keeping the underlying page context — view/edit a record's detail, side-by-side reference, longer forms that aren't a full page. Slides from the right. |
| **Modal** | Short, interrupting decision that needs full focus and blocks the page (confirm delete). See [Modal.md](Modal.md). |

---

## ERP default — floating

ERP drawers use the **`floating`** variant: the panel is **not flush** to the screen —
it sits with a **12px margin** from the edges and has **12px rounded corners** (card-like).
Always pass `variant="floating"` (plus `placement="right"` + a `size`). Header title +
`MpDrawerCloseButton`; scrollable body form; footer `MpButtonGroup` with **ghost Cancel +
primary Save** (both `is-rounded`). Example: `NewLocationDrawer.vue`.

```vue
<MpDrawer id="…" :is-open="open" placement="right" size="sm" variant="floating" @close="open = false">
  <MpDrawerContent>
    <MpDrawerHeader>Title <MpDrawerCloseButton /></MpDrawerHeader>
    <MpDrawerBody>…form…</MpDrawerBody>
    <MpDrawerFooter>
      <MpButtonGroup>
        <MpButton variant="ghost" is-rounded @click="open = false">Cancel</MpButton>
        <MpButton variant="primary" is-rounded>Save</MpButton>
      </MpButtonGroup>
    </MpDrawerFooter>
  </MpDrawerContent>
  <MpDrawerOverlay />
</MpDrawer>
```

---

## Anatomy

- Open state controlled by `v-model` (boolean).
- Header: title + close button.
- Body: scrollable content (detail fields or a form — reuse [Form.md](Form.md) field anatomy).
- Footer: actions — **secondary Cancel + primary confirm**, in an `MpButtonGroup`.

---

## Example

```vue
<script setup lang="ts">
import { MpDrawer, MpButton, MpButtonGroup, MpText } from '@mekari/pixel3'

const isOpen = ref(false)
</script>

<template>
  <MpDrawer v-model="isOpen" placement="right">
    <!-- Header -->
    <MpText size="h3">Entity detail</MpText>

    <!-- Body: detail or form fields -->
    <MpText>Content goes here.</MpText>

    <!-- Footer -->
    <MpButtonGroup>
      <MpButton variant="secondary" @click="isOpen = false">Cancel</MpButton>
      <MpButton variant="primary">Save</MpButton>
    </MpButtonGroup>
  </MpDrawer>
</template>
```

> ⚠️ `placement` and the exact slot/subcomponent structure are assumed — run
> `get-component("MpDrawer")` and adjust this example to the real API.
