<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'

/** A product option for the picker. */
export interface PickerProduct { sku: string; name: string; img?: string; desc?: string }

const props = defineProps<{
  open: boolean
  products: PickerProduct[]
  /** currently-committed selection (SKUs) */
  modelValue: string[]
}>()
const emit = defineEmits<{
  'update:open': [boolean]
  save: [skus: string[]]
}>()

// Working selection — seeded from the committed value each time the drawer opens,
// so Cancel discards and Save commits.
const sel = ref<Set<string>>(new Set())
watch(() => props.open, (o) => {
  if (o) { sel.value = new Set(props.modelValue); leftSearch.value = ''; rightSearch.value = '' }
})

const leftSearch = ref('')
const rightSearch = ref('')

function match(p: PickerProduct, q: string) {
  if (!q) return true
  const s = q.toLowerCase()
  return p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)
}
const available = computed(() => props.products.filter(p => !sel.value.has(p.sku) && match(p, leftSearch.value)))
const selected = computed(() => props.products.filter(p => sel.value.has(p.sku) && match(p, rightSearch.value)))
const selectedCount = computed(() => props.products.filter(p => sel.value.has(p.sku)).length)

function add(sku: string) { const s = new Set(sel.value); s.add(sku); sel.value = s }
function remove(sku: string) { const s = new Set(sel.value); s.delete(sku); sel.value = s }
function addAll() { const s = new Set(sel.value); for (const p of available.value) s.add(p.sku); sel.value = s }
function removeAll() { const s = new Set(sel.value); for (const p of selected.value) s.delete(p.sku); sel.value = s }

function close() { emit('update:open', false) }
function save() { emit('save', [...sel.value]); emit('update:open', false) }
</script>

<template>
  <Transition name="spd">
  <div v-if="open" class="spd-overlay" @click.self="close">
    <div class="spd-panel" role="dialog" aria-label="Select product">
      <!-- Header -->
      <header class="spd-header">
        <h2 class="spd-title">Select product</h2>
        <button class="spd-close" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></button>
      </header>

      <!-- Body — two panels -->
      <div class="spd-body">
        <!-- Available -->
        <section class="spd-col">
          <div class="spd-search">
            <MpIcon name="search" size="sm" />
            <input v-model="leftSearch" class="spd-search-input" type="text" placeholder="Search..." />
          </div>
          <div class="spd-col-head">
            <span class="spd-col-title">Products</span>
            <button class="spd-link" type="button" @click="addAll">Add all</button>
          </div>
          <div class="spd-list">
            <button v-for="p in available" :key="p.sku" class="spd-item" type="button" @click="add(p.sku)">
              <img v-if="p.img" class="spd-thumb" :src="p.img" :alt="p.name" loading="lazy" />
              <span v-else class="spd-thumb spd-thumb--empty" />
              <span class="spd-info">
                <span class="spd-name">{{ p.name }}</span>
                <span class="spd-sku">SKU {{ p.sku }}</span>
              </span>
              <span class="spd-act spd-act--add"><MpIcon name="add" size="sm" /></span>
            </button>
            <p v-if="!available.length" class="spd-empty">No products found.</p>
          </div>
        </section>

        <div class="spd-divider" aria-hidden="true" />

        <!-- Selected -->
        <section class="spd-col">
          <div class="spd-search">
            <MpIcon name="search" size="sm" />
            <input v-model="rightSearch" class="spd-search-input" type="text" placeholder="Search..." />
          </div>
          <div class="spd-col-head">
            <span class="spd-col-title">Selected products ({{ selectedCount }})</span>
            <button class="spd-link" type="button" @click="removeAll">Remove all</button>
          </div>
          <div class="spd-list">
            <button v-for="p in selected" :key="p.sku" class="spd-item" type="button" @click="remove(p.sku)">
              <img v-if="p.img" class="spd-thumb" :src="p.img" :alt="p.name" loading="lazy" />
              <span v-else class="spd-thumb spd-thumb--empty" />
              <span class="spd-info">
                <span class="spd-name">{{ p.name }}</span>
                <span class="spd-sku">SKU {{ p.sku }}</span>
              </span>
              <span class="spd-act spd-act--remove"><MpIcon name="minus-circular" size="sm" /></span>
            </button>
            <p v-if="!selected.length" class="spd-empty">No products selected yet.</p>
          </div>
        </section>
      </div>

      <!-- Footer -->
      <footer class="spd-footer">
        <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
        <MpButton variant="primary" is-rounded @click="save">Save</MpButton>
      </footer>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
.spd-enter-active,
.spd-leave-active { transition: background-color 250ms ease; }
.spd-enter-from, .spd-leave-to { background-color: transparent; }
.spd-enter-active :deep(.spd-panel) { transition: transform 350ms ease-out; }
.spd-leave-active :deep(.spd-panel)  { transition: transform 250ms ease-in; }
.spd-enter-from :deep(.spd-panel),
.spd-leave-to :deep(.spd-panel) { transform: translateX(calc(100% + 12px)); }

.spd-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
/* Floating ERP drawer — 12px margin, 12px rounded corners. */
.spd-panel {
  margin: var(--mp-spacing-3); width: min(920px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column; background: var(--mp-background-stage, #fff);
  border-radius: 24px; overflow: hidden;
}
.spd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle);
}
.spd-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.spd-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.spd-close:hover { background: var(--mp-background-neutral-hovered); }

.spd-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1px 1fr; }
.spd-col { display: flex; flex-direction: column; min-height: 0; padding: var(--mp-spacing-4); gap: var(--mp-spacing-3); }
.spd-divider { background: var(--mp-border-default); }
.spd-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); flex-shrink: 0; }
.spd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.spd-search-input::placeholder { color: var(--mp-text-placeholder); }
.spd-col-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.spd-col-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.spd-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.spd-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.spd-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.spd-item {
  display: flex; align-items: center; gap: var(--mp-spacing-3); width: 100%; text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-1); background: none; border: none; cursor: pointer;
  border-bottom: 1px solid var(--mp-border-default); position: relative;
}
.spd-item:hover { background: var(--mp-background-neutral-subtle); }
.spd-thumb { width: 32px; height: 32px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0; border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral); }
.spd-thumb--empty { background: var(--mp-background-neutral-subtle); }
.spd-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.spd-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spd-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.spd-act { display: none; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 24px; }
.spd-item:hover .spd-act { display: inline-flex; }
.spd-act--add { color: var(--mp-text-link); }
.spd-act--remove { color: var(--mp-text-secondary); }
.spd-empty { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.spd-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
