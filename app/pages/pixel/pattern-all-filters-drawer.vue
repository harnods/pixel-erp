<script setup lang="ts">
import { ref, reactive } from 'vue'
import { MpButton } from '@mekari/pixel3'
import BillsFiltersDrawer, { emptyBillsFilters, type BillsFiltersValue } from '~/components/patterns/BillsFiltersDrawer.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'All filters drawer · Pixel 3 Enterprise' })

// Live demo wired to the canonical Bills "All filters" drawer — it covers the most
// field variants (keyword+scope, two date ranges, status checklist, amount comparator,
// free-text tags), so it stands in for all 15 *FiltersDrawer across the ERP.
const open = ref(false)
const applied = reactive<BillsFiltersValue>(emptyBillsFilters())
const columns = [
  { key: 'number', label: 'Bill number' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'reference', label: 'Reference' },
]
const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'awaiting', label: 'Awaiting payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]
const tagOptions = ['Urgent', 'Recurring', 'Project A']

function onApply(v: BillsFiltersValue) { Object.assign(applied, v) }
const activeCount = () => {
  const a = applied
  return [a.keyword, a.transactionDate, a.dueDate, a.status.length, a.totalValue || a.totalMin || a.totalMax, a.tags.length]
    .filter(Boolean).length
}
</script>

<template>
  <div>
    <DemoHeader title="All filters drawer" tag="pattern · index page"
      lead="The overflow filter surface behind every list page's 'All filters' button. There are 15 of these across the ERP (Bills, Sales invoice, Stock adjustment, WMS report …) — they differ only in which fields they carry; the shell, behaviour and footer never vary. It edits a local DRAFT and only commits to the parent on Apply, so a discarded edit is forgotten. Built as the hand-rolled Teleport/Transition overlay panel (NOT MpDrawer), opened from the 'All filters' button per the filter-bar rules."
      :rules="['rule/filter-drawer-shell', 'rule/filter-drawer-fields', 'rule/filter-drawer-footer', 'rule/drawer-custom-shell', 'rule/filter-bar-all-filters-drawer']" />

    <DemoSection title="Open it"
      desc="Right-side panel: 12px margin, radius 12px, slides in from the right, overlay dimmer behind. Because it's a form, an outside (overlay) click is IGNORED — it closes only via the header ×, Cancel, or Apply, so in-progress input is never lost. The draft re-syncs from the applied value on every open."
      :rules="['rule/filter-drawer-shell', 'rule/drawer-custom-shell']"
      code="<MpButton variant=&quot;secondary&quot; left-icon=&quot;filter&quot; is-rounded @click=&quot;open = true&quot;>All filters</MpButton>

<BillsFiltersDrawer
  :id=&quot;'bills'&quot; :is-open=&quot;open&quot; :model-value=&quot;applied&quot;
  :columns=&quot;columns&quot; :status-options=&quot;statusOptions&quot; :tag-options=&quot;tagOptions&quot;
  @update:is-open=&quot;open = $event&quot; @apply=&quot;onApply&quot; />">
      <div class="afd-demo-row">
        <MpButton variant="secondary" left-icon="filter" is-rounded @click="open = true">
          All filters<span v-if="activeCount()" class="afd-count">{{ activeCount() }}</span>
        </MpButton>
        <span class="afd-hint">{{ activeCount() ? `${activeCount()} filter(s) applied` : 'No filters applied' }}</span>
      </div>
    </DemoSection>

    <DemoSection title="Fields — the variants"
      desc="Only the field set changes per page; each field is a bold label above its control. The vocabulary across the 15 drawers: Keyword (text + inline column-scope dropdown), Date range (AdvancedDateRangePicker — past or future presets), Status/checklist (MpCheckbox list), Amount comparator (AmountComparatorField — prefix operator + value/min-max), and free-text Tags (comparator prefix + typeable chips). Reuse these field components; don't invent a new field control."
      :rules="['rule/filter-drawer-fields', 'rule/select-erpfilterselect', 'rule/date-picker-no-clip']"
      code="<!-- each field: bold label + a reused field control -->
Keyword   → text input + inline column-scope MpPopover
Date      → <AdvancedDateRangePicker /> (direction=&quot;future&quot; for due dates)
Status    → <MpCheckbox> checklist
Total     → <AmountComparatorField /> (operator + value / min–max)
Tags      → comparator prefix + typeable chip input" >
      <p class="afd-note">Open the drawer above to see all five field types.</p>
    </DemoSection>

    <DemoSection title="Footer — Reset · Cancel · Apply"
      desc="Fixed footer, always three actions: a ghost 'Reset filter' pinned left (clears the draft to empty), then ghost 'Cancel' + primary 'Apply' pinned right. Apply commits the draft to the parent and closes; Cancel/× discards. Never disable Apply."
      :rules="['rule/filter-drawer-footer', 'rule/btn-cancel-ghost', 'rule/btn-one-primary']"
      code="<footer>
  <button class=&quot;btn-enterprise btn-enterprise--ghost&quot;>Reset filter</button>   <!-- pinned left -->
  <div>
    <button class=&quot;btn-enterprise btn-enterprise--ghost&quot;>Cancel</button>
    <button class=&quot;btn-enterprise btn-enterprise--primary&quot;>Apply</button>
  </div>
</footer>" >
      <p class="afd-note">The footer is visible at the bottom of the open drawer.</p>
    </DemoSection>

    <BillsFiltersDrawer
      id="afd-bills" :is-open="open" :model-value="applied"
      :columns="columns" :status-options="statusOptions" :tag-options="tagOptions"
      @update:is-open="open = $event" @apply="onApply"
    />
  </div>
</template>

<style scoped>
.afd-demo-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.afd-count {
  display: inline-flex; align-items: center; justify-content: center; margin-left: 6px;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--mp-background-brand-bold, #4b61dc); color: #fff;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
}
.afd-hint, .afd-note { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.afd-note { margin: 0; }
</style>
