<script setup lang="ts">
/**
 * PickSerialNumberDrawer — dual-list serial picker, matching the Pixel library's
 * PickSerialNumberDrawer (Storybook: components-pickserialnumberdrawer--default).
 * No scan bar, no bins, no ad-hoc "add new" — just move real, already-known
 * warehouse serials between "Serial number" (available) and "Selected serial
 * number" lists.
 */
import { ref, computed, watch } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import { getWarehouseDetail } from '~/data/warehouseDetails'

const props = withDefaults(defineProps<{
  open: boolean
  productName: string
  productImg?: string
  sku: string
  warehouseId: string
  warehouseName: string
  /** Selected count shown as "X / targetCount Serial number(s)" */
  targetCount: number
  modelValue: string[]
  /** View only — e.g. "what's still reserved" from the complete-work-order
   *  guard. Shows just the selected serials as a plain list, no Available
   *  column, no search, no Save; a single Close replaces Cancel/Save. */
  isReadOnly?: boolean
  title?: string
}>(), {
  isReadOnly: false,
  title: 'Manage serial number',
})

const emit = defineEmits<{
  'update:open': [boolean]
  save: [serials: string[]]
}>()

const selected = ref<string[]>([])
const leftSearch = ref('')
const rightSearch = ref('')

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  selected.value = [...props.modelValue]
  leftSearch.value = ''
  rightSearch.value = ''
}, { immediate: true })

const allSerials = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  const item = wh?.stock.find(s => s.sku === props.sku)
  return item?.serials?.available.map(u => u.serial) ?? []
})
const availableSerials = computed(() => allSerials.value.filter(s => !selected.value.includes(s)))
const filteredAvailable = computed(() => {
  const q = leftSearch.value.trim().toLowerCase()
  return q ? availableSerials.value.filter(s => s.toLowerCase().includes(q)) : availableSerials.value
})
const filteredSelected = computed(() => {
  const q = rightSearch.value.trim().toLowerCase()
  return q ? selected.value.filter(s => s.toLowerCase().includes(q)) : selected.value
})
const roomLeft = computed(() => Math.max(0, props.targetCount - selected.value.length))
const canAddMore = computed(() => roomLeft.value > 0)

function addOne(serial: string) {
  if (!canAddMore.value) return
  selected.value = [...selected.value, serial]
}
function addAll() {
  if (!canAddMore.value) return
  selected.value = [...selected.value, ...availableSerials.value.slice(0, roomLeft.value)]
}
function removeOne(serial: string) {
  selected.value = selected.value.filter(s => s !== serial)
}
function removeAll() {
  selected.value = []
}

function handleCancel() { emit('update:open', false) }
function handleSave() {
  emit('save', selected.value)
  emit('update:open', false)
}
</script>

<template>
  <Transition name="psn">
  <div v-if="open" class="psn-overlay" @click.self="handleCancel">
    <div class="psn-panel" role="dialog" :aria-label="title">

      <header class="psn-header">
        <h2 class="psn-title">{{ title }}</h2>
        <button class="psn-close" type="button" aria-label="Close" @click="handleCancel">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="psn-content">
        <div class="psn-info-bar">
          <div class="psn-info-product">
            <img v-if="productImg" class="psn-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="psn-info-thumb psn-info-thumb--empty" />
            <div class="psn-info-names">
              <span class="psn-info-name">{{ productName }}</span>
              <span class="psn-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="psn-info-stats">
            <div class="psn-stat">
              <span class="psn-stat-label">Warehouse</span>
              <span class="psn-stat-value">{{ warehouseName || '—' }}</span>
            </div>
            <div class="psn-stat">
              <span class="psn-stat-label">Selected</span>
              <span class="psn-stat-value">{{ selected.length }}/{{ targetCount }} Serial number{{ targetCount === 1 ? '' : 's' }}</span>
            </div>
          </div>
        </div>

        <div class="psn-columns" :class="{ 'psn-columns--single': isReadOnly }">
          <!-- ── Available (editable mode only) ── -->
          <div v-if="!isReadOnly" class="psn-col">
            <div class="psn-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <input v-model="leftSearch" class="psn-search-input" type="text" placeholder="Search serial number" />
            </div>
            <div class="psn-col-head">
              <span class="psn-col-title">Serial number ({{ filteredAvailable.length }})</span>
              <a class="psn-link" :class="{ 'psn-link--disabled': !canAddMore || !availableSerials.length }" @click.prevent="addAll">Add all</a>
            </div>
            <div class="psn-list">
              <div v-for="s in filteredAvailable" :key="s" class="psn-row" @click="addOne(s)">
                <span class="psn-row-text">{{ s }}</span>
                <button class="psn-row-btn psn-row-btn--add" type="button" :aria-label="`Add ${s}`" @click.stop="addOne(s)">
                  <MpIcon name="add" size="sm" />
                </button>
              </div>
              <p v-if="!filteredAvailable.length" class="psn-empty-text">No serial numbers available.</p>
            </div>
          </div>

          <!-- ── Selected ── -->
          <div class="psn-col">
            <div v-if="!isReadOnly" class="psn-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <input v-model="rightSearch" class="psn-search-input" type="text" placeholder="Search selected serial number" />
            </div>
            <div class="psn-col-head">
              <span class="psn-col-title">{{ isReadOnly ? 'Serial number' : 'Selected serial number' }} ({{ selected.length }})</span>
              <a v-if="!isReadOnly" class="psn-link" :class="{ 'psn-link--disabled': !selected.length }" @click.prevent="removeAll">Remove all</a>
            </div>
            <div class="psn-list">
              <div v-for="s in filteredSelected" :key="s" class="psn-row" :class="{ 'psn-row--static': isReadOnly }">
                <span class="psn-row-text">{{ s }}</span>
                <button v-if="!isReadOnly" class="psn-row-btn psn-row-btn--remove" type="button" :aria-label="`Remove ${s}`" @click="removeOne(s)">
                  <MpIcon name="minus-circular" size="sm" />
                </button>
              </div>
              <p v-if="!filteredSelected.length" class="psn-empty-text">{{ isReadOnly ? 'Nothing reserved.' : 'No serial numbers selected.' }}</p>
            </div>
          </div>
        </div>
      </div>

      <footer class="psn-footer">
        <button v-if="isReadOnly" class="btn-enterprise btn-enterprise--primary" type="button" @click="handleCancel">Close</button>
        <template v-else>
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="handleCancel">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="handleSave">Save</button>
        </template>
      </footer>

    </div>
  </div>
  </Transition>
</template>

<style scoped>
.psn-enter-active,
.psn-leave-active { transition: background-color 250ms ease; }
.psn-enter-from, .psn-leave-to { background-color: transparent; }
.psn-enter-active :deep(.psn-panel) { transition: transform 350ms ease-out; }
.psn-leave-active :deep(.psn-panel) { transition: transform 250ms ease-in; }
.psn-enter-from :deep(.psn-panel),
.psn-leave-to :deep(.psn-panel) { transform: translateX(calc(100% + 12px)); }

.psn-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.psn-panel {
  margin: var(--mp-spacing-3);
  width: min(1000px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}

.psn-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.psn-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.psn-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.psn-close:hover { background: var(--mp-background-neutral-hovered); }

.psn-content { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px; }

.psn-info-bar {
  flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.psn-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.psn-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.psn-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.psn-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.psn-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.psn-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.psn-info-stats { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5) var(--mp-spacing-10); }
.psn-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; min-width: 160px; }
.psn-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.psn-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }

.psn-columns { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-6); }
.psn-columns--single { grid-template-columns: 1fr; }
.psn-col { min-height: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }

.psn-search {
  flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.psn-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.psn-search-input::placeholder { color: var(--mp-text-placeholder); }

.psn-col-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; }
.psn-col-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.psn-link { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.psn-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.psn-link--disabled { color: var(--mp-text-disabled); cursor: not-allowed; pointer-events: none; text-decoration: none; }

.psn-list { flex: 1; min-height: 0; overflow-y: auto; border-top: 1px solid var(--mp-border-default); }
.psn-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-1);
  border-bottom: 1px solid var(--mp-border-default);
  cursor: pointer;
}
.psn-row:hover { background: var(--mp-background-neutral-hovered); }
.psn-row--static { cursor: default; }
.psn-row--static:hover { background: none; }
.psn-row-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
/* Always laid out (never display:none) so the row's height never changes on
   hover — only opacity/pointer-events toggle, same as the Pixel library's own
   PickSerialNumberDrawer (its row action button sits at opacity:0, pointer-
   events:none at rest and fades in on hover, never removed from flow). */
.psn-row-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer;
  transition: opacity 150ms ease-out;
}
.psn-row-btn--add { color: var(--mp-text-link); opacity: 0; pointer-events: none; }
.psn-row:hover .psn-row-btn--add { opacity: 1; pointer-events: auto; }
.psn-row-btn--remove { color: var(--mp-text-critical); }
.psn-empty-text { margin: 0; padding: var(--mp-spacing-6) 0; text-align: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.psn-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default);
}
</style>
