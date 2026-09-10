# Modal

**Pixel components**: `MpModal`, `MpModalHeader`, `MpModalContent`, `MpModalBody`, `MpModalFooter`, `MpModalCloseButton`, `MpButtonGroup`
**Purpose**: Centered overlay dialog for focused, interrupting tasks (confirm, quick edit, short form).

> ⚠️ There is no custom `ErpModal` component. Use Pixel `MpModal` directly
> following the structure below.

---

## When to use

| Use a… | When |
|---|---|
| **Modal** | Short, interrupting decision/action that needs focus (confirm delete, quick edit). Blocks the page. |
| **Drawer** | Contextual side panel where the user keeps the page context (detail, longer edit). See [Drawer.md](Drawer.md). |
| **Page** | Long forms or multi-step flows. See [page-recipes.md](page-recipes.md). |

---

## Anatomy

- Open state controlled by `v-model` (boolean).
- `MpModalHeader` holds the title + `MpModalCloseButton`.
- `MpModalBody` holds the content.
- `MpModalFooter` holds actions: **ghost Cancel + primary confirm**
  (`rule/btn-cancel-ghost`), in an `MpButtonGroup`.

---

## Example — action flow

```vue
<script setup lang="ts">
import {
  MpModal, MpModalHeader, MpModalContent, MpModalBody, MpModalFooter,
  MpModalCloseButton, MpButton, MpButtonGroup, MpText,
} from '@mekari/pixel3'

const isOpen = ref(false)
</script>

<template>
  <MpModal v-model="isOpen">
    <MpModalHeader>
      Confirm action
      <MpModalCloseButton />
    </MpModalHeader>
    <MpModalContent>
      <MpModalBody>
        <MpText>Review the impact before continuing.</MpText>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" @click="isOpen = false">Cancel</MpButton>
          <MpButton variant="primary">Confirm</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>
```

> Verify exact subcomponent names/props with `get-component("MpModal")` before
> finalizing.
