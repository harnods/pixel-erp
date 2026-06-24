<template>
  <!--
    Warehouse switcher next to the logo. Shown only when the user is assigned more
    than one warehouse (WMS Ops 2). Selecting a warehouse sets it active and opens
    its detail. Popover content is portalled, so its root-box styles are :global
    (same rationale as ErpUserMenu); inner rows stay scoped.
  -->
  <!-- Single warehouse (Ops 1): static label, not switchable -->
  <div v-if="!hasWarehouseSwitcher" class="wh-switch-static">
    <span class="wh-switch-sep" aria-hidden="true" />
    <span class="wh-switch-label">
      <span class="wh-switch-name">{{ activeWarehouse?.name }}</span>
      <span class="wh-switch-code">{{ activeWarehouse?.code }}</span>
    </span>
  </div>

  <!-- Multiple warehouses (Ops 2): switcher dropdown -->
  <MpPopover
    v-else
    id="wh-switcher"
    placement="bottom-start"
    use-portal
    is-close-on-blur
    is-close-on-escape
    v-slot="{ onClosePopover }"
  >
    <MpPopoverTrigger>
      <button type="button" class="wh-switch-trigger" aria-label="Switch warehouse">
        <span class="wh-switch-sep" aria-hidden="true" />
        <span class="wh-switch-label">
          <span class="wh-switch-name">{{ activeWarehouse?.name }}</span>
          <span class="wh-switch-code">{{ activeWarehouse?.code }}</span>
        </span>
        <MpIcon name="chevrons-down" size="sm" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>

    <MpPopoverContent class="wh-switch-menu" is-unstyled>
      <p class="wh-switch-heading">Switch warehouse</p>
      <nav class="wh-switch-list">
        <button
          v-for="w in assignedWarehouses"
          :key="w.id"
          type="button"
          class="wh-switch-item"
          @click="select(w.id, onClosePopover)"
        >
          <span class="wh-switch-item-label">
            <span class="wh-switch-item-name">{{ w.name }}</span>
            <span class="wh-switch-item-code">{{ w.code }}</span>
          </span>
          <MpIcon
            v-if="w.id === activeWarehouse?.id"
            name="check"
            size="md"
            color="icon.brand"
          />
        </button>
      </nav>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon } from "@mekari/pixel3";

const router = useRouter();
const { assignedWarehouses, activeWarehouse, hasWarehouseSwitcher, setActiveWarehouse } =
  useWarehouseContext();

function select(id: string, closePopover: () => void) {
  setActiveWarehouse(id);
  router.push(`/warehouses/${id}`);
  closePopover();
}
</script>

<style scoped>
/* ── Static label (Ops 1 — single warehouse, not switchable) ─ */
.wh-switch-static {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  height: var(--mp-spacing-12, 48px);
  padding: 0 var(--mp-spacing-2);
}

/* ── Trigger (sits on the dark header, next to the logo) ───── */
.wh-switch-trigger {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  height: var(--mp-spacing-12, 48px);
  padding: 0 var(--mp-spacing-2);
  background: transparent;
  border: 0;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-colors-text-inverse, #fff);
}
.wh-switch-trigger:hover {
  background: var(
    --mp-colors-background-header-menu-hovered,
    rgba(255, 255, 255, 0.08)
  );
}
.wh-switch-sep {
  width: var(--mp-border-width-sm, 1px);
  height: var(--mp-spacing-5); /* 20px */
  background: rgba(255, 255, 255, 0.24);
  margin-right: var(--mp-spacing-1);
}
.wh-switch-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.wh-switch-name {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-inverse, #fff);
  white-space: nowrap;
}
.wh-switch-code {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-colors-text-inverse, #fff);
  opacity: 0.7;
  white-space: nowrap;
}

/* ── Dropdown (portalled → root box is global) ─────────────── */
:global(.mp-popover.wh-switch-menu) {
  /* Above the header (sticky 1100) and the table's sticky cells/headers */
  z-index: var(--mp-z-indices-popover, 1600);
  min-width: 240px;
  padding: 0 0 var(--mp-spacing-2);
  background: var(--mp-colors-background-stage, #fff);
  border: var(--mp-border-width-sm, 1px) solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  box-shadow:
    0 4px 6px -2px rgba(0, 0, 0, 0.05),
    0 10px 15px -3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.wh-switch-heading {
  /* 8px above the title, 4px below → gap to the warehouse list */
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-colors-text-secondary, #3a4749);
}
.wh-switch-list {
  display: flex;
  flex-direction: column;
}
.wh-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.wh-switch-item:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}
.wh-switch-item-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.wh-switch-item-name {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-colors-text-default, #080d0e);
}
.wh-switch-item-code {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-colors-text-secondary, #3a4749);
}
</style>
