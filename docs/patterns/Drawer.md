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
