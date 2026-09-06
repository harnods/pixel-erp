<script setup lang="ts">
/**
 * DetailJumpTo — the "Jump to…" switcher that sits next to a detail page's title:
 * a small chevron button that opens a searchable popover of sibling records, so
 * the user can hop straight to another record of the same type without going back
 * to the list. Each item shows a primary line (the record number/name) and an
 * optional secondary caption. Emits `select` with the chosen id — the page routes.
 *
 * Canonical extraction of the inline `.detail-jump` used across detail pages
 * (StockAdjustment, Bill, WarehouseTransfer, SalesOrder …).
 */
import { ref, computed } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpButton, MpIcon, css } from '@mekari/pixel3'

export interface JumpItem { id: string; primary: string; secondary?: string }

const props = withDefaults(defineProps<{
  id: string
  items: JumpItem[]
  ariaLabel?: string
  placeholder?: string
  emptyText?: string
}>(), { ariaLabel: 'Switch record', placeholder: 'Search...', emptyText: 'No records found' })

const emit = defineEmits<{ select: [id: string] }>()

const search = ref('')
const results = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter((i) =>
    i.primary.toLowerCase().includes(q) || (i.secondary?.toLowerCase().includes(q) ?? false),
  )
})
function choose(id: string) { search.value = ''; emit('select', id) }
</script>

<template>
  <MpPopover :id="id" use-portal :is-keep-alive="false" placement="bottom-start">
    <MpPopoverTrigger>
      <MpButton class="djt-chevron" variant="ghost" left-icon="chevrons-down" :aria-label="ariaLabel" is-rounded />
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ width: '304px' })">
      <div class="djt">
        <div class="djt-search-wrap">
          <!-- sanctioned search-pill input (rule/filter-bar-search); MpInput can't sit borderless here -->
          <input v-model="search" class="djt-search-input" type="text" :placeholder="placeholder" />
          <MpButton v-if="search" class="djt-clear" variant="ghost" left-icon="close" aria-label="Clear search" is-rounded @click="search = ''" />
        </div>
        <div class="djt-list" role="listbox">
          <div v-for="it in results" :key="it.id" class="djt-item" role="option" tabindex="0" @click="choose(it.id)" @keydown.enter="choose(it.id)">
            <span class="djt-item-primary">{{ it.primary }}</span>
            <span v-if="it.secondary" class="djt-item-secondary">{{ it.secondary }}</span>
          </div>
          <p v-if="!results.length" class="djt-empty">{{ emptyText }}</p>
        </div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.djt { display: flex; flex-direction: column; }
.djt-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.djt-search-input {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) 34px var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-colors-border-bold, #8c9596); border-radius: var(--mp-radii-md, 6px);
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); outline: none;
}
/* Focus/active = neutral border-bold + 1px ring (never brand green) — the global
   ERP form-focus rule (erp.css). */
.djt-search-input:focus {
  border-color: var(--mp-colors-border-bold, #8c9596);
  box-shadow: 0 0 0 1px var(--mp-colors-border-bold, #8c9596);
}
.djt-search-input::placeholder { color: var(--mp-text-placeholder); }
.djt-clear {
  position: absolute; right: var(--mp-spacing-4, 16px); top: 50%; transform: translateY(-50%);
}

.djt-list { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; padding: 0 var(--mp-spacing-1) var(--mp-spacing-1); }
.djt-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left;
  cursor: pointer;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.djt-item:hover { background: var(--mp-background-neutral-subtle); }
.djt-item-primary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.djt-item-secondary { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.djt-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
