<script lang="ts">
/**
 * Companion module block — runtime exports + shared type used by both this
 * component's <script setup> and the consuming page (CashManagementDetailPage).
 */
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'

export interface CashTxFiltersValue {
  /** 'in' / 'out' — empty = both. */
  cashFlow: string[]
  /** AdvancedDateRangePicker range — null = not applied. */
  transactionDate: Date[] | null
  amountComparator: AmountComparator
  amountValue: string
  amountMin: string
  amountMax: string
  /** 'reconciled' / 'unreconciled' — empty = all. */
  status: string[]
}

export function emptyCashTxFilters(): CashTxFiltersValue {
  return { cashFlow: [], transactionDate: null, amountComparator: 'gt', amountValue: '', amountMin: '', amountMax: '', status: [] }
}

function amountMatches(amount: number, c: AmountComparator, value: string, min: string, max: string): boolean {
  if (c === 'gt') return value === '' || amount > Number(value)
  if (c === 'lt') return value === '' || amount < Number(value)
  const lo = min === '' ? -Infinity : Number(min)
  const hi = max === '' ? Infinity : Number(max)
  return amount >= lo && amount <= hi
}

/** True when `row` passes every active filter in `f`. */
export function matchCashTxFilters(
  row: { date: string; moneyIn: number; moneyOut: number; status: string },
  f: CashTxFiltersValue,
): boolean {
  if (f.cashFlow.length) {
    const isIn = row.moneyIn > 0
    const ok = (f.cashFlow.includes('in') && isIn) || (f.cashFlow.includes('out') && !isIn)
    if (!ok) return false
  }
  if (f.transactionDate && f.transactionDate.length === 2) {
    const d = new Date(row.date).setHours(0, 0, 0, 0)
    const s = new Date(f.transactionDate[0]!).setHours(0, 0, 0, 0)
    const e = new Date(f.transactionDate[1]!).setHours(0, 0, 0, 0)
    if (d < s || d > e) return false
  }
  if (!amountMatches(row.moneyIn || row.moneyOut, f.amountComparator, f.amountValue, f.amountMin, f.amountMax)) return false
  if (f.status.length && !f.status.includes(row.status)) return false
  return true
}

/** Number of active drawer-filter groups — shown as "(n)" on the All-filters
 *  button. Transaction date is excluded: it lives in the toolbar's own inline
 *  date picker, not in this drawer. */
export function cashTxFilterCount(f: CashTxFiltersValue): number {
  let n = 0
  if (f.cashFlow.length) n++
  if (f.amountValue || f.amountMin || f.amountMax) n++
  if (f.status.length) n++
  return n
}
</script>

<script setup lang="ts">
/**
 * Cash account transactions — "All filters" drawer (same custom-Teleport pattern
 * as BillsFiltersDrawer). Edits a local draft; commits on Apply only. Fields:
 * Cash flow (Money in / Money out), Transaction date, Amount, Status.
 */
import { reactive, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox } from '@mekari/pixel3'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CashTxFiltersValue
  /** Which statuses to offer — accounts without a statement pass []. */
  statusOptions?: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  'update:isOpen': [boolean]
  apply: [CashTxFiltersValue]
}>()

const draft = reactive<CashTxFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
// Keep transactionDate — it belongs to the toolbar's inline date picker, not this drawer.
function clearAll() { Object.assign(draft, { ...emptyCashTxFilters(), transactionDate: draft.transactionDate }) }

function toggle(list: 'cashFlow' | 'status', value: string) {
  draft[list] = draft[list].includes(value) ? draft[list].filter(v => v !== value) : [...draft[list], value]
}

const CASH_FLOW_OPTIONS = [
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Money out' },
]
</script>

<template>
  <Transition name="ctf">
    <div v-if="isOpen" class="ctf-overlay">
      <div class="ctf-panel" role="dialog" aria-label="All filters">
        <header class="ctf-header">
          <span class="ctf-title">All filters</span>
          <MpButton class="ctf-close" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="ctf-body">
          <!-- Cash flow -->
          <div class="ctf-field">
            <span class="ctf-field-label">Cash flow</span>
            <ul class="ctf-checklist">
              <li v-for="opt in CASH_FLOW_OPTIONS" :key="opt.value" class="ctf-check-item" @click="toggle('cashFlow', opt.value)">
                <span @click.stop><MpCheckbox :id="`${id}-flow-${opt.value}`" :is-checked="draft.cashFlow.includes(opt.value)" @change="() => toggle('cashFlow', opt.value)" /></span>
                <span class="ctf-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <!-- Amount -->
          <div class="ctf-field">
            <span class="ctf-field-label">Amount</span>
            <AmountComparatorField
              :id="`${id}-amount`"
              :comparator="draft.amountComparator" :value="draft.amountValue" :min="draft.amountMin" :max="draft.amountMax"
              @update:comparator="draft.amountComparator = $event"
              @update:value="draft.amountValue = $event"
              @update:min="draft.amountMin = $event"
              @update:max="draft.amountMax = $event"
            />
          </div>

          <!-- Status (only for accounts that have a statement) -->
          <div v-if="statusOptions && statusOptions.length" class="ctf-field">
            <span class="ctf-field-label">Status</span>
            <ul class="ctf-checklist">
              <li v-for="opt in statusOptions" :key="opt.value" class="ctf-check-item" @click="toggle('status', opt.value)">
                <span @click.stop><MpCheckbox :id="`${id}-status-${opt.value}`" :is-checked="draft.status.includes(opt.value)" @change="() => toggle('status', opt.value)" /></span>
                <span class="ctf-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>
        </div>

        <footer class="ctf-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <div class="ctf-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ctf-enter-active, .ctf-leave-active { transition: background-color 250ms ease; }
.ctf-enter-from, .ctf-leave-to { background-color: transparent; }
.ctf-enter-active .ctf-panel { transition: transform 350ms ease-out; }
.ctf-leave-active .ctf-panel { transition: transform 250ms ease-in; }
.ctf-enter-from .ctf-panel, .ctf-leave-to .ctf-panel { transform: translateX(calc(100% + 12px)); }

.ctf-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.ctf-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.ctf-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.ctf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctf-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.ctf-close:hover { background: var(--mp-background-neutral-hovered); }

.ctf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }
.ctf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ctf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctf-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* gap:0 — MpCheckbox renders its own 12px control-to-label gap (docs/patterns/Form.md). */
.ctf-check-item { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; }
.ctf-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ctf-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.ctf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
