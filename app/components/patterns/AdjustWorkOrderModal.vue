<script setup lang="ts">
/**
 * Adjust work order — PRD v0.5 UC-06 (In progress phase).
 *
 * Adjust is the ONLY way a running work order's material demand changes, and the
 * only place its reservation can be released after start (UC-03). Both are true
 * for the same reason: once a job is running, a change to what it needs and a
 * change to what it holds are one decision, and the Adjust reason is the record of
 * it. That is why there is no separate approval here (R-2, L-7).
 *
 * The rules this form carries:
 *  • Each line has its own **Request date**, mandatory on every line the user
 *    changes and never earlier than today — a delta raised mid-run has its own
 *    date, which is exactly why the delta gets its own line rather than being
 *    added to the original's qty.
 *  • A **Reason to adjust** is mandatory.
 *  • Cutting below what is already reserved releases that component's FULL
 *    remaining reservation on save (R-4, R-8) — the form says so before the user
 *    commits, rather than surprising them afterwards.
 *  • Qty can never go below what has already been ISSUED: that material has left
 *    the rack and comes back, if at all, through a material return (UC-08).
 *
 * A modal rather than a drawer: this is a short blocking decision, and the
 * underlying page context is not what the user needs while making it.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpTextarea, MpIcon, MpDatePicker,
} from '@mekari/pixel3'
import type { StockRequestLine, DemandChange } from '~/data/stockRequests'

const props = defineProps<{
  id: string
  isOpen: boolean
  workOrderNumber: string
  lines: StockRequestLine[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'adjust', payload: { changes: DemandChange[]; reason: string }): void
}>()

const { t } = useLocale()

const todayIso = new Date().toISOString().slice(0, 10)

// MpDatePicker speaks DD/MM/YYYY display strings (rule/date-picker-variants,
// value-type="format"); a request line stores ISO. Convert at the boundary rather
// than letting one format leak into the other — a date stored in the wrong format
// silently breaks every comparison downstream, which has bitten this build before.
const toDisplay = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const toIso = (display: string): string => {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/**
 * One row per COMPONENT, not per line: the user adjusts what the job needs of a
 * material, and how that resolves across the original and Adjustment lines is the
 * data layer's job (`applyDemandChanges`), not a decision to put in front of them.
 */
interface Row {
  productId: string
  product: string
  sku: string
  unit: string
  /** total qty across every line for this component */
  current: number
  /** already reserved — cutting below this releases the lot */
  reserved: number
  /** already issued — an absolute floor */
  consumed: number
  qty: string
  /** DD/MM/YYYY, as the picker speaks it */
  requiredDate: string
}

const rows = ref<Row[]>([])

function build(): Row[] {
  const byProduct = new Map<string, Row>()
  for (const l of props.lines) {
    if (l.rejected) continue
    const existing = byProduct.get(l.productId)
    if (existing) {
      existing.current += l.qty
      existing.reserved += l.reserved
      existing.consumed += l.consumed
      existing.qty = String(existing.current)
      continue
    }
    byProduct.set(l.productId, {
      productId: l.productId,
      product: l.product,
      sku: l.sku,
      unit: l.unit,
      current: l.qty,
      reserved: l.reserved,
      consumed: l.consumed,
      qty: String(l.qty),
      requiredDate: toDisplay(l.requiredDate),
    })
  }
  return [...byProduct.values()]
}

const reason = ref('')
const error = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  rows.value = build()
  reason.value = ''
  error.value = ''
})

const num = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Rows the user actually changed — the only ones that need a date and get saved. */
const changedRows = computed(() => rows.value.filter(r => num(r.qty) !== r.current))

/** R-4 — cutting below the reserved qty releases that component's whole reservation. */
function willRelease(r: Row): boolean {
  return num(r.qty) < r.reserved + r.consumed && r.reserved > 0
}
/** UC-08 — issued material cannot be un-asked for. */
function belowIssued(r: Row): boolean {
  return num(r.qty) < r.consumed
}

const releasingRows = computed(() => rows.value.filter(willRelease))

watch([rows, reason], () => { error.value = '' }, { deep: true })

// Footer actions stay rendered and enabled (rule/form-actions-always-present);
// an unmet precondition explains itself inline rather than greying the button out.
function submit() {
  if (changedRows.value.length === 0) {
    error.value = t('Change at least one component quantity before adjusting.')
    return
  }
  const issued = changedRows.value.find(belowIssued)
  if (issued) {
    error.value = `${issued.product}: ${t('quantity cannot go below the')} ${issued.consumed} ${issued.unit} ${t('already issued to production.')}`
    return
  }
  const missingDate = changedRows.value.find(r => !toIso(r.requiredDate))
  if (missingDate) {
    error.value = `${missingDate.product}: ${t('a request date is required on every component you change.')}`
    return
  }
  const backdated = changedRows.value.find(r => toIso(r.requiredDate) < todayIso)
  if (backdated) {
    error.value = `${backdated.product}: ${t('the request date cannot be earlier than today.')}`
    return
  }
  if (!reason.value.trim()) {
    error.value = t('Give a reason for this adjustment.')
    return
  }
  emit('adjust', {
    changes: changedRows.value.map(r => ({
      productId: r.productId,
      qty: num(r.qty),
      requiredDate: toIso(r.requiredDate),
    })),
    reason: reason.value.trim(),
  })
}
</script>

<template>
  <MpModal
    :id="id" :is-open="isOpen" size="lg" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false"
    @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Adjust work order') }} — {{ workOrderNumber }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="aw-lead">
          {{ t('An increase is sent to the warehouse as a separate adjustment line with its own request date, so the original demand and its date stay intact.') }}
        </p>

        <div class="aw-table-wrap">
          <table class="aw-table">
            <thead>
              <tr>
                <th class="aw-th">{{ t('Product') }}</th>
                <th class="aw-th aw-th--num">{{ t('Current') }}</th>
                <th class="aw-th aw-th--num">{{ t('Reserved') }}</th>
                <th class="aw-th aw-th--num">{{ t('New qty') }}</th>
                <th class="aw-th">{{ t('Request date') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.productId" class="aw-tr">
                <td class="aw-td">
                  <span class="aw-product">{{ r.product }}</span>
                  <span class="aw-sku">{{ r.sku }}</span>
                </td>
                <td class="aw-td aw-td--num">{{ r.current }} {{ r.unit }}</td>
                <td class="aw-td aw-td--num">
                  {{ r.reserved }} {{ r.unit }}
                  <span v-if="r.consumed > 0" class="aw-hint">{{ r.consumed }} {{ t('issued') }}</span>
                </td>
                <td class="aw-td aw-td--num">
                  <input
                    v-model="r.qty" type="number" min="0" inputmode="numeric"
                    class="aw-qty" :aria-label="`${t('New qty')} — ${r.product}`"
                  >
                </td>
                <td class="aw-td">
                  <!-- Mandatory on every line the adjust changes, never earlier
                       than today (UC-06). A past date is caught inline on submit
                       rather than by disabling days, so the rule is stated in
                       words the user can act on (rule/form-errors-inline). -->
                  <div class="aw-datepicker">
                    <MpDatePicker
                      :id="`${id}-date-${r.productId}`"
                      v-model="r.requiredDate"
                      format="DD/MM/YYYY" value-type="format"
                      placeholder="DD/MM/YYYY" use-portal
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- R-4 / R-8 — say what saving will release, before it happens. -->
        <div v-if="releasingRows.length" class="aw-banner">
          <MpIcon name="information" size="md" />
          <span>
            {{ t('Saving releases the full remaining reservation of') }}
            {{ releasingRows.map(r => r.product).join(', ') }}
            — {{ t('unreserve is never partial. The updated line is sent back to the warehouse to be reserved again.') }}
          </span>
        </div>

        <div class="aw-field">
          <label class="aw-label" :for="`${id}-reason`">{{ t('Reason to adjust') }}</label>
          <MpTextarea
            :id="`${id}-reason`" v-model="reason" size="md" :rows="3"
            :placeholder="t('Why is this work order being adjusted?')"
          />
        </div>

        <p v-if="error" class="aw-error">{{ error }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="aw-footer">
          <span class="aw-summary">
            {{ changedRows.length }}
            {{ changedRows.length === 1 ? t('component changed') : t('components changed') }}
          </span>
          <div class="aw-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">{{ t('Adjust') }}</button>
          </div>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.aw-lead { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }

.aw-table-wrap { overflow-x: auto; }
.aw-table { width: 100%; border-collapse: collapse; }
.aw-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary, #3a4749); text-align: left; white-space: nowrap;
}
.aw-th--num { text-align: right; }
.aw-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-subtle, #e5e7e7);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e);
  vertical-align: middle; white-space: nowrap;
}
.aw-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.aw-product { display: block; }
.aw-sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }
.aw-hint { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }

.aw-qty {
  width: var(--mp-sizes-24, 96px); text-align: right;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default, #c8cdce); border-radius: var(--mp-radii-md, 8px);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums;
  background: var(--mp-background-default, #fff); color: var(--mp-text-default, #080d0e);
}
.aw-qty:focus { outline: none; border-color: var(--mp-border-bold, #55595b); border-width: 2px; }

.aw-datepicker { min-width: var(--mp-sizes-40, 160px); }

.aw-banner {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4); padding: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md, 8px);
  background: var(--mp-background-information-subtle, #eef4fb);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749);
}

.aw-field { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.aw-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #080d0e); }

.aw-error {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical, #a8352d);
}

.aw-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); width: 100%; }
.aw-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
.aw-footer-btns { display: flex; gap: var(--mp-spacing-3); }
</style>
