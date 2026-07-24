<template>
  <!--
    Quick-create ("+") menu in the header. Trigger is the header's add IconButton;
    clicking opens an MpPopover with a "New" section listing the common create
    shortcuts. Same popover/scoped-CSS approach as ErpUserMenu (is-unstyled content
    + var(--mp-*) tokens) so it stays robust if Pixel's atomic utilities go stale in dev.
  -->
  <MpPopover
    id="header-quick-create"
    placement="bottom-end"
    use-portal
    is-close-on-blur
    is-close-on-escape
    is-focus-on-close
    v-slot="{ onClosePopover }"
  >
    <MpPopoverTrigger>
      <button class="quick-create__trigger" type="button" aria-label="Create new">
        <MpIcon name="add" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>

    <MpPopoverContent class="quick-create" is-unstyled>
      <p class="quick-create__section">New</p>
      <nav class="quick-create__group">
        <button
          v-for="item in items"
          :key="item.label"
          type="button"
          class="quick-create__row"
          @click="go(item, onClosePopover)"
        >
          <span class="quick-create__label">{{ item.label }}</span>
        </button>
      </nav>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon } from "@mekari/pixel3";

interface QuickCreateItem {
  label: string;
  /** Explicit route path (leaf create pages). Falls back to navigate(to ?? label). */
  path?: string;
  to?: string;
}

const items: QuickCreateItem[] = [
  { label: "Sales invoice", to: "Sales invoices" },
  { label: "Sales order", to: "Sales orders" },
  { label: "Purchase invoice", to: "Purchase invoices" },
  { label: "Purchase order", to: "Purchase orders" },
  { label: "Expense", to: "Expenses" },
  { label: "Product", path: "/product-list/new" },
];

const router = useRouter();
const { navigate } = useNavigation();

function go(item: QuickCreateItem, closePopover: () => void) {
  if (item.path) router.push(item.path);
  else navigate(item.to ?? item.label);
  closePopover();
}
</script>

<style scoped>
/* Matches the header's other icon buttons (IconButton): 36×36, rounded, inverse
   icon on the dark header, subtle hover fill. */
.quick-create__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  width: 36px;
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-lg, 8px);
  cursor: pointer;
}
.quick-create__trigger:hover {
  background: var(--mp-colors-background-surface-bold-hovered, rgba(255, 255, 255, 0.12));
}
.quick-create__trigger:active {
  background: var(--mp-colors-background-surface-bold-pressed, rgba(255, 255, 255, 0.2));
}

:global(.mp-popover.quick-create) {
  z-index: var(--mp-z-indices-popover, 1400);
  width: 240px;
  padding: var(--mp-spacing-2) 0;
  background: var(--mp-colors-background-stage, #ffffff);
  border: var(--mp-border-width-sm, 1px) solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  box-shadow: var(--mp-shadows-md, 0 4px 12px rgba(8, 13, 14, 0.12));
}

.quick-create__section {
  margin: 0;
  padding: var(--mp-spacing-1) var(--mp-spacing-3) var(--mp-spacing-2);
  font-family: var(--mp-fonts-label, "Inter"), sans-serif;
  font-size: var(--mp-font-sizes-sm, 12px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mp-colors-text-subtle, #6b7778);
}

.quick-create__group {
  display: flex;
  flex-direction: column;
}

.quick-create__row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); /* 8px / 12px */
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--mp-fonts-label, "Inter"), sans-serif;
}

.quick-create__row:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}

.quick-create__label {
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-colors-text-default, #080d0e);
}
</style>
