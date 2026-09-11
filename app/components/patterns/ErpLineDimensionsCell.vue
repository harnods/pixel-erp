<!--
  ErpLineDimensionsCell — the "Dimensions" table cell for ONE line item on a
  transaction create page (Sales/Purchases/Expenses/Stock adjustment). Renders
  one mini combobox per dimension that applies to this transaction type (from
  Settings > Dimensions), stacked vertically — Figma fileKey
  nZdSEnyXOmQVbSWYhcwyGT, node 5060:44579 ("New Sales Order" > Dimensions
  column), "Popover / Branch Options" (node 5060:44581) for the value list.

  Each combobox: click opens a popover listing that dimension's values,
  filterable by typing in the trigger itself; picking one sets it for this
  line. If the typed text matches no existing value, the list area shows
  "No matching <dimension> found" and a visible (non-link-styled) "+ Add ...
  as a new dimension value" action below a divider. Clicking it opens an
  "Add value" MpModal (Dimension read-only + an editable Value field prefilled
  with the typed text) rather than adding immediately, so the user can correct
  the spelling before it's persisted — confirming there calls addDimensionValue
  (DimensionFormDrawer's own "Values" quick-add, applied inline here instead),
  selects the new value on this line, and shows a "Value saved" toast.

  Renders nothing when no dimension applies to this transactionType — callers
  gate the whole "Dimensions" column (header + every cell) on that same check
  so an empty column never shows.

  `errors` (dimensionId -> boolean) drives the house line-item validation
  treatment (feedback_erp_transaction_line_item_error_pattern / Expense's own
  account+amount fields): the specific dimension's row gets a danger tint and
  a hover MpTooltip with "You must select <dimension>", toggled via v-if/v-else
  between the tooltip-wrapped and bare trigger (Expense's actual pattern, not
  a shortcut). Callers own the flag's lifecycle — set it in their own
  validateLineItems(), clear it as soon as a value lands on that dimension.

  `isDisabled` renders the exact same rows (every applicable dimension, same
  labels/values/placeholders) but read-only — clicking never opens the value
  popover. Used where a SECOND surface needs to mirror a line item's
  dimensions verbatim (e.g. Expense's Payment details, which shows the first
  line's tagging) without re-deriving its own "only show filled ones" logic,
  which drifted from the real column and looked inconsistent.
-->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButtonGroup, MpButton, MpModalCloseButton, MpFormControl, MpFormLabel, MpInput, MpFormErrorMessage,
  toast, css,
} from '@mekari/pixel3'
import { applicableDimensions as getApplicableDimensions, addDimensionValue, type Dimension, type DimensionTransactionType } from '~/data/dimensions'

const props = defineProps<{
  transactionType: DimensionTransactionType
  modelValue: Record<string, string>
  id: string
  /** dimensionId -> whether it's currently invalid (mandatory + unfilled), per feedback_erp_transaction_line_item_error_pattern. */
  errors?: Record<string, boolean>
  /** Read-only mirror mode — see doc comment above. */
  isDisabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, string>): void }>()

function isInvalid(dim: Dimension): boolean {
  return !!props.errors?.[dim.id]
}

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
  if (props.isDisabled) return
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

// "+ Add ... as a new dimension value" opens a confirm modal instead of
// adding immediately, so the user can double-check/correct the spelling.
const addValueOpen = ref(false)
const addValueDim = ref<Dimension | null>(null)
const addValueText = ref('')
const addValueError = ref(false)

function openAddValue(dim: Dimension) {
  addValueDim.value = dim
  addValueText.value = query.value.trim()
  addValueError.value = false
  addValueOpen.value = true
  closeDim(dim.id)
}
function confirmAddValue() {
  const name = addValueText.value.trim()
  if (!name) { addValueError.value = true; return }
  const dim = addValueDim.value
  if (!dim) return
  const value = addDimensionValue(dim.id, name)
  if (value) {
    select(dim, value.name)
    toast.notify({ variant: 'success', title: t('Value saved'), maxWidth: 'max-content' })
  }
  addValueOpen.value = false
}
</script>

<template>
  <div v-if="applicableDimensions.length" class="eldc">
    <div v-for="dim in applicableDimensions" :key="dim.id" class="eldc-row" :class="{ 'eldc-row--error': isInvalid(dim) }">
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
          <MpTooltip
            v-if="isInvalid(dim)"
            :id="`${id}-${dim.id}-err-tt`"
            :label="`${t('You must select')} ${dim.name.toLowerCase()}`"
            placement="top"
            use-portal
            class="eldc-tooltip-wrap"
          >
            <div class="eldc-trigger" :class="{ 'eldc-trigger--disabled': isDisabled }" @click="openDim(dim)">
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
          </MpTooltip>
          <div v-else class="eldc-trigger" @click="openDim(dim)">
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
          <div v-if="query.trim().length && filteredValues(dim).length === 0" class="eldc-empty">
            {{ t('No matching') }} {{ dim.name.toLowerCase() }} {{ t('found') }}
          </div>
          <div v-if="showAddRow(dim)" class="eldc-add-row" @click="openAddValue(dim)">
            <MpIcon name="add" size="sm" />
            <span>{{ t('Add') }} &ldquo;{{ query.trim() }}&rdquo; {{ t('as a new dimension value') }}</span>
          </div>
        </MpPopoverContent>
      </MpPopover>
    </div>

    <MpModal
      v-if="addValueOpen" :id="`${id}-add-value-modal`" :is-open="true" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false"
      @close="addValueOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ t('Add value') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <MpFormControl :id="`${id}-add-value-field`" is-required :is-invalid="addValueError">
            <MpFormLabel>{{ t('Value') }}</MpFormLabel>
            <MpInput :id="`${id}-add-value-input`" v-model="addValueText" is-full-width @update:model-value="addValueError = false" />
            <MpFormErrorMessage>{{ t('You must fill in value') }}</MpFormErrorMessage>
          </MpFormControl>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="addValueOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="confirmAddValue">{{ t('Add') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.eldc { display: flex; flex-direction: column; }
.eldc-row { border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.eldc-row:last-child { border-bottom: none; }
/* Per-dimension (not per-cell) danger tint — feedback_erp_transaction_line_item_error_pattern. */
.eldc-row--error { background: var(--mp-colors-background-danger, #fceeed); }

.eldc-trigger {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  min-height: 52px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  cursor: pointer;
}
/* Read-only mirror mode (isDisabled) — same rows, just non-interactive. */
.eldc-trigger--disabled { cursor: default; }
.eldc-trigger--disabled .eldc-value,
.eldc-trigger--disabled .eldc-label { color: var(--mp-text-secondary); }
.eldc-trigger--disabled :deep(.mp-icon) { color: var(--mp-icon-disabled, var(--mp-text-secondary)); }
/* MpTooltip's trigger is inline by default — force it to fill the row so the
   tooltip-wrapped and bare trigger states are visually identical. */
.eldc-tooltip-wrap { display: block; width: 100%; }
.eldc-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }
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

.eldc-empty { padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Visible, non-link-styled action row — default text color (not link-blue) so
   it reads as a clear affordance rather than a subtle hyperlink. */
.eldc-add-row {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default, #e3e7e9); color: var(--mp-text-default); cursor: pointer; font-size: var(--mp-font-sizes-md);
}
.eldc-add-row:hover { background: var(--mp-background-neutral-hovered, #f7f8f9); }
.eldc-add-row span { flex: 1 0 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
