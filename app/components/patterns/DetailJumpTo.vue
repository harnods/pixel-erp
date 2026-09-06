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
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, css } from '@mekari/pixel3'

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
      <button class="djt-chevron" type="button" :aria-label="ariaLabel">
        <MpIcon name="chevrons-down" size="md" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ width: '304px' })">
      <div class="djt">
        <div class="djt-search-wrap">
          <input v-model="search" class="djt-search" type="text" :placeholder="placeholder" />
          <button v-if="search" class="djt-clear" type="button" aria-label="Clear search" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
        <div class="djt-list">
          <button v-for="it in results" :key="it.id" class="djt-item" type="button" @click="choose(it.id)">
            <span class="djt-item-primary">{{ it.primary }}</span>
            <span v-if="it.secondary" class="djt-item-secondary">{{ it.secondary }}</span>
          </button>
          <p v-if="!results.length" class="djt-empty">{{ emptyText }}</p>
        </div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.djt-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.djt-chevron:hover { background: var(--mp-background-neutral-hovered); }

.djt { display: flex; flex-direction: column; }
.djt-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.djt-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) 34px var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
}
.djt-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.djt-search::placeholder { color: var(--mp-text-placeholder); }
.djt-clear {
  position: absolute; right: 18px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary)); border-radius: var(--mp-radii-full, 999px);
}
.djt-clear:hover { background: var(--mp-background-neutral-hovered); }

.djt-list { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; padding: 0 var(--mp-spacing-1) var(--mp-spacing-1); }
.djt-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left;
  background: none; border: none; cursor: pointer;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.djt-item:hover { background: var(--mp-background-neutral-subtle); }
.djt-item-primary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.djt-item-secondary { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.djt-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
