# Drawer

**Pixel components**: `MpDrawer` (+ header / body / footer subcomponents — verify with `get-component`)
**Purpose**: Side panel that slides in from the edge for contextual detail or editing without leaving the current page.

> ⚠️ There is no custom `ErpDrawer` component. Use Pixel `MpDrawer` directly.
> The subcomponent API below should be confirmed with `get-component("MpDrawer")`.

---

## Modal vs Drawer

| Use a… | When |
|---|---|
| **Drawer** | User benefits from keeping the underlying page context — view/edit a record's detail, side-by-side reference, longer forms that aren't a full page. Slides from the right. |
| **Modal** | Short, interrupting decision that needs full focus and blocks the page (confirm delete). See [Modal.md](Modal.md). |

---

## ERP default

Standard right drawer — full-height, flush to the screen edges (default `MpDrawer`,
**not** the `floating` variant). `placement="right"` + a `size` (`sm`/`md`/…). Header
title + `MpDrawerCloseButton`; scrollable body form; footer `MpButtonGroup` with
**ghost Cancel + primary Save** (both `is-rounded`). Example: the "New location" drawer
in `WarehouseDetailsPage.vue`.

```vue
<MpDrawer id="…" :is-open="open" placement="right" size="sm" @close="open = false">
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
