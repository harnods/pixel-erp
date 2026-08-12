<script setup lang="ts">
/**
 * CRM (Qontak) product sidebar — shown while the CRM product is active (/crm*).
 * A 52px module icon rail + a 212px "DEALS" submenu panel (matches Figma 264px nav).
 */
import { ref } from 'vue'
import { MpIcon, toast } from '@mekari/pixel3'

const router = useRouter()

// Module icon rail (Qontak) — exact icons/order/grouping from Figma node 4214:11232.
// Sales (Deals) is the active module.
interface Rail { icon: string; label: string; active?: boolean }
const railGroups: Rail[][] = [
  [
    { icon: 'home',      label: 'Home' },
    { icon: 'inbox',     label: 'Inbox' },
    { icon: 'phone',     label: 'Phone' },
    { icon: 'broadcast', label: 'Broadcast' },
    { icon: 'chatbot',   label: 'Chatbot' },
  ],
  [
    { icon: 'team',              label: 'Employees' },
    { icon: 'talent-management', label: 'Talent management' },
    { icon: 'reports',           label: 'Reports' },
  ],
  [
    { icon: 'sales',        label: 'Sales', active: true },
    { icon: 'voucher',      label: 'Voucher' },
    { icon: 'competencies', label: 'Competencies' },
  ],
  [
    { icon: 'shop',     label: 'Shop' },
    { icon: 'book',     label: 'Knowledge base' },
    { icon: 'doc',      label: 'Documents' },
    { icon: 'products', label: 'Products' },
    { icon: 'expenses', label: 'Expenses' },
  ],
  [
    { icon: 'officeless', label: 'Officeless' },
  ],
  [
    { icon: 'transfer', label: 'Subscription' },
    { icon: 'settings', label: 'Settings' },
  ],
]

// "DEALS" submenu.
interface Sub { label: string; count?: number; active?: boolean }
const subItems: Sub[] = [
  { label: 'All deals', active: true },
  { label: 'Need my approval', count: 2 },
  { label: 'Owned by me' },
]

function onRail(r: Rail) {
  if (r.active) return
  toast.notify({ variant: 'info', title: `${r.label} — coming soon`, maxWidth: 'max-content' })
}
function onSub(s: Sub) {
  if (s.active) router.push('/crm')
  else toast.notify({ variant: 'info', title: `${s.label} — coming soon`, maxWidth: 'max-content' })
}
</script>

<template>
  <div class="crm-sidebar-wrapper">
    <!-- Module icon rail -->
    <nav class="crm-rail" aria-label="CRM navigation">
      <div v-for="(group, gi) in railGroups" :key="gi" class="crm-rail__group">
        <button
          v-for="r in group"
          :key="r.label"
          class="crm-rail__item"
          :class="{ active: r.active }"
          :title="r.label"
          @click="onRail(r)"
        >
          <MpIcon :name="r.icon" size="md" />
        </button>
      </div>
    </nav>

    <!-- DEALS submenu panel -->
    <div class="crm-panel">
      <div class="crm-panel__header">DEALS</div>
      <div class="crm-panel__list">
        <button
          v-for="s in subItems"
          :key="s.label"
          class="crm-panel__item"
          :class="{ active: s.active }"
          @click="onSub(s)"
        >
          <span class="crm-panel__label">{{ s.label }}</span>
          <span v-if="s.count" class="crm-panel__count">{{ s.count }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crm-sidebar-wrapper { display: flex; height: 100%; flex-shrink: 0; }

/* ── Module icon rail ── */
.crm-rail {
  width: 52px; flex-shrink: 0; background: var(--mp-background-crm-nav, #e7edf5);
  border-right: 1px solid var(--mp-border-default, #dcdfe4);
  display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden;
  padding: var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-6);
  border-top-left-radius: 12px;
}
.crm-rail__group {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5);
  padding-bottom: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-1);
  border-bottom: 1px solid var(--mp-border-default, #dcdfe4);
}
.crm-rail__group:last-child { border-bottom: none; }
.crm-rail__item {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md, 6px); border: none; background: transparent;
  color: var(--mp-text-default, #272b32); cursor: pointer; transition: background-color 100ms;
}
.crm-rail__item:hover { background: var(--mp-background-neutral-subtle-hovered, #ebf0f1); }
.crm-rail__item.active { background: var(--mp-background-brand, #eef0fc); color: var(--mp-text-link, #4b61dc); }
.crm-rail__item :deep(svg) { color: var(--mp-icon-nav, #758195); }
.crm-rail__item.active :deep(svg) { color: var(--mp-text-link, #4b61dc); }

/* ── DEALS submenu panel ── */
.crm-panel {
  width: 212px; flex-shrink: 0; background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-left: 1px solid var(--mp-border-default, #dcdfe4);
  display: flex; flex-direction: column; padding: var(--mp-spacing-3);
}
.crm-panel__header {
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 0.6px; color: var(--mp-text-secondary, #656f80);
}
.crm-panel__list { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.crm-panel__item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md, 6px);
  border: none; background: transparent; cursor: pointer; text-align: left; width: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #272b32);
}
.crm-panel__item:hover { background: var(--mp-background-neutral-subtle-hovered, #ebf0f1); }
.crm-panel__item.active { background: var(--mp-background-brand, #eef0fc); color: var(--mp-text-link, #4b61dc); font-weight: var(--mp-font-weights-semi-bold); }
.crm-panel__count {
  flex-shrink: 0; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--mp-background-neutral-pressed, #ebf0f1); color: var(--mp-text-secondary, #656f80);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
}
</style>
