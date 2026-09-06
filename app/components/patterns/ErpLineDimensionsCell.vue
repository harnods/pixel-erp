<!--
  ErpLineDimensionsCell — the "Dimensions" table cell for ONE line item on a
  transaction create page (Sales/Purchases/Expenses/Stock adjustment). Renders
  one mini combobox per dimension that applies to this transaction type (from
  Settings > Dimensions), stacked vertically — Figma fileKey
  nZdSEnyXOmQVbSWYhcwyGT, node 5060:44579 ("New Sales Order" > Dimensions
  column), "Popover / Branch Options" (node 5060:44581) for the value list.

  Each combobox: click opens a popover listing that dimension's values,
  filterable by typing in the trigger itself; picking one sets it for this
  line. If the typed text matches no existing value, an "Add ... as a new
  dimension value" row appears (addDimensionValue — DimensionFormDrawer's own
  "Values" quick-add, applied inline here instead).

  Renders nothing when no dimension applies to this transactionType — callers
  gate the whole "Dimensions" column (header + every cell) on that same check
  so an empty column never shows.
-->
<script setup lang="ts">
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, css } from '@mekari/pixel3'
import { applicableDimensions as getApplicableDimensions, addDimensionValue, type Dimension, type DimensionTransactionType } from '~/data/dimensions'

const props = defineProps<{
  transactionType: DimensionTransactionType
  modelValue: Record<string, string>
  id: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, string>): void }>()

const { t } = useLocale()

const applicableDimensions = computed<Dimension[]>(() => getApplicableDimensions(props.transactionType))

const openDimId = ref<string | null>(null)
const query = ref('')
const inputRefs = new Map<string, HTMLInputElement>()
function setInputRef(dimId: string, el: unknown) {
  if (el instanceof HTMLInputElement) inputRefs.set(dimId, el)
  else inputRefs.delete(dimId)
}

function currentValue(dimId: string): string {
  return props.modelValue[dimId] ?? ''
}

function openDim(dim: Dimension) {
  openDimId.value = dim.id
  query.value = currentValue(dim.id)
  nextTick(() => inputRefs.get(dim.id)?.focus())
}
function closeDim(dimId: string) {
  if (openDimId.value === dimId) { openDimId.value = null; query.value = '' }
}

function filteredValues(dim: Dimension) {
  const q = query.value.trim().toLowerCase()
  return q ? dim.values.filter((v) => v.name.toLowerCase().includes(q)) : dim.values
}
function hasExactMatch(dim: Dimension): boolean {
  const q = query.value.trim().toLowerCase()
  return dim.values.some((v) => v.name.toLowerCase() === q)
}
function showAddRow(dim: Dimension): boolean {
  return query.value.trim().length > 0 && !hasExactMatch(dim)
}

function select(dim: Dimension, valueName: string) {
  emit('update:modelValue', { ...props.modelValue, [dim.id]: valueName })
  closeDim(dim.id)
}
function addNew(dim: Dimension) {
  const name = query.value.trim()
  if (!name) return
  const value = addDimensionValue(dim.id, name)
  if (value) select(dim, value.name)
}
</script>

<template>
  <div v-if="applicableDimensions.length" class="eldc">
    <div v-for="dim in applicableDimensions" :key="dim.id" class="eldc-row">
      <MpPopover
        :id="`${id}-${dim.id}`"
        is-manual
        :is-open="openDimId === dim.id"
        use-portal
        :is-keep-alive="false"
        placement="bottom-start"
        @close="closeDim(dim.id)"
      >
        <MpPopoverTrigger>
          <div class="eldc-trigger" @click="openDim(dim)">
            <input
              v-if="openDimId === dim.id"
              :ref="(el) => setInputRef(dim.id, el)"
              v-model="query"
              class="eldc-input"
              :placeholder="`${t('Select')} ${dim.name.toLowerCase()}`"
              @click.stop
            >
            <div v-else class="eldc-text">
              <span v-if="currentValue(dim.id)" class="eldc-label">
                {{ dim.name }}<span v-if="dim.mandatory" class="eldc-required">*</span>
              </span>
              <span class="eldc-value" :class="{ 'eldc-value--placeholder': !currentValue(dim.id) }">
                {{ currentValue(dim.id) || `${t('Select')} ${dim.name.toLowerCase()}` }}<span v-if="dim.mandatory && !currentValue(dim.id)" class="eldc-required">*</span>
              </span>
            </div>
            <MpIcon name="chevrons-down" size="sm" />
          </div>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ width: '220px', padding: '0', overflow: 'hidden' })" @blur="closeDim(dim.id)" @escape="closeDim(dim.id)">
          <ul class="eldc-list">
            <li
              v-for="v in filteredValues(dim)" :key="v.name" class="eldc-item"
              :class="{ 'eldc-item--active': v.name === currentValue(dim.id) }"
              @click="select(dim, v.name)"
            >
              {{ v.name }}
            </li>
          </ul>
          <div v-if="showAddRow(dim)" class="eldc-add-row" @click="addNew(dim)">
            <MpIcon name="add" size="sm" />
            <span>{{ t('Add') }} &ldquo;{{ query.trim() }}&rdquo; {{ t('as a new dimension value') }}</span>
          </div>
        </MpPopoverContent>
      </MpPopover>
    </div>
  </div>
</template>

<style scoped>
.eldc { display: flex; flex-direction: column; }
.eldc-row { border-bottom: 1px solid var(--mp-border-default); }
.eldc-row:last-child { border-bottom: none; }

.eldc-trigger {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  min-height: 52px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  cursor: pointer;
}
.eldc-text { display: flex; flex-direction: column; gap: 2px; flex: 1 0 0; min-width: 0; }
.eldc-label {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); line-height: 16px;
  color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.eldc-value { font-size: var(--mp-font-sizes-md); line-height: 20px; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eldc-value--placeholder { color: var(--mp-text-placeholder); }
.eldc-required { color: var(--mp-text-danger, #a8352d); margin-left: 2px; }

.eldc-input { flex: 1 0 0; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.eldc-input::placeholder { color: var(--mp-text-placeholder); }

.eldc-list { margin: 0; padding: var(--mp-spacing-1) 0; max-height: 200px; overflow-y: auto; list-style: none; }
.eldc-item { padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.eldc-item:hover, .eldc-item--active { background: var(--mp-background-neutral-hovered, #f7f8f9); }

.eldc-add-row {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default);
  color: var(--mp-text-link); cursor: pointer; font-size: var(--mp-font-sizes-md);
}
.eldc-add-row:hover { background: var(--mp-background-neutral-hovered, #f7f8f9); }
.eldc-add-row span { flex: 1 0 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
