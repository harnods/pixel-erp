<script setup lang="ts">
/**
 * Request additional stock — PRD v0.5 D-7 (the tail of UC-11).
 *
 * Production asks the warehouse for MORE of a component than the work order's own
 * demand, with its own required date and its own reason. The lines land on the
 * work order's existing stock request tagged **Additional stock** — never as a
 * second request, because a transaction has exactly one (C-4). The stockist can
 * reject a tagged line (W-7), which they cannot do to the components the work
 * order itself committed to.
 *
 * Why this is separate from Adjust: Adjust changes what the JOB needs and is a
 * change to the plan, carrying a mandatory reason-to-adjust and, on a cut, a
 * release. Additional stock leaves the plan alone — the job still needs what it
 * needed; somebody on the floor needs extra material on top. Folding the two
 * together would make every "send me two more sacks" look like a revision of the
 * production plan.
 *
 * A modal rather than a drawer: a short blocking decision, like Adjust.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpTextarea, MpIcon, MpDatePicker, MpCheckbox,
} from '@mekari/pixel3'
import type { StockRequestLine } from '~/data/stockRequests'

const props = defineProps<{
  id: string
  isOpen: boolean
  workOrderNumber: string
  /** The work order's existing request lines — the components it may ask more of. */
  lines: StockRequestLine[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'request', payload: {
    lines: { productId: string; qty: number; requiredDate: string }[]
    reason: string
  }): void
}>()

const { t } = useLocale()

const todayIso = new Date().toISOString().slice(0, 10)

// MpDatePicker speaks DD/MM/YYYY; a request line stores ISO (same boundary rule as
// AdjustWorkOrderModal — a date stored in the wrong format breaks every comparison
// downstream).
const toDisplay = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const toIso = (display: string): string => {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** One row per COMPONENT — several lines of the same material roll up, as in Adjust. */
interface Row {
  productId: string
  product: string
  sku: string
  unit: string
  /** what the work order already asks for, across its lines */
  current: number
  selected: boolean
  qty: string
  /** DD/MM/YYYY, as the picker speaks it */
  requiredDate: string
}

const rows = ref<Row[]>([])
const reason = ref('')
const error = ref('')

function build(): Row[] {
  const byProduct = new Map<string, Row>()
  for (const l of props.lines) {
    if (l.rejected) continue
    const existing = byProduct.get(l.productId)
    if (existing) { existing.current += l.qty; continue }
    byProduct.set(l.productId, {
      productId: l.productId,
      product: l.product,
      sku: l.sku,
      unit: l.unit,
      current: l.qty,
      selected: false,
      qty: '',
      // Defaults to TODAY, never the component's own required date: extra material
      // is wanted now or later, and the original date is usually already in the
      // past by the time somebody asks for more.
      requiredDate: toDisplay(todayIso),
    })
  }
  return [...byProduct.values()]
}

watch(() => props.isOpen, (open) => {
  if (!open) return
  rows.value = build()
  reason.value = ''
  error.value = ''
})
watch([rows, reason], () => { error.value = '' }, { deep: true })

const num = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const selectedRows = computed(() => rows.value.filter(r => r.selected))
const allSelected = computed(() =>
  rows.value.length > 0 && rows.value.every(r => r.selected))

function toggleAll(next: boolean) {
  for (const r of rows.value) r.selected = next
}

// Footer actions stay rendered and enabled (rule/form-actions-always-present);
// an unmet precondition explains itself inline rather than greying the button out.
function submit() {
  if (selectedRows.value.length === 0) {
    error.value = t('Select at least one component to request.')
    return
  }
  const noQty = selectedRows.value.find(r => num(r.qty) <= 0)
  if (noQty) {
    error.value = `${noQty.product}: ${t('enter how much extra is needed.')}`
    return
  }
  const missingDate = selectedRows.value.find(r => !toIso(r.requiredDate))
  if (missingDate) {
    error.value = `${missingDate.product}: ${t('a request date is required on every component you request.')}`
    return
  }
  const backdated = selectedRows.value.find(r => toIso(r.requiredDate) < todayIso)
  if (backdated) {
    error.value = `${backdated.product}: ${t('the request date cannot be earlier than today.')}`
    return
  }
  if (!reason.value.trim()) {
    error.value = t('Give a reason for this request.')
    return
  }
  emit('request', {
    lines: selectedRows.value.map(r => ({
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
        {{ t('Request additional stock') }} — {{ workOrderNumber }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="ras-lead">
          {{ t('Extra material on top of what this work order already asks for. It is sent to the warehouse as its own line, tagged Additional stock, which the stockist can decline.') }}
        </p>

        <div class="ras-table-wrap">
          <table class="ras-table">
            <thead>
              <tr>
                <th class="ras-th ras-th--check">
                  <MpCheckbox
                    :id="`${id}-all`" :is-checked="allSelected"
                    :aria-label="t('Select all components')"
                    @change="toggleAll(!allSelected)"
                  />
                </th>
                <th class="ras-th">{{ t('Product') }}</th>
                <th class="ras-th ras-th--num">{{ t('Already requested') }}</th>
                <th class="ras-th ras-th--num">{{ t('Additional qty') }}</th>
                <th class="ras-th">{{ t('Request date') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.productId" class="ras-tr">
                <td class="ras-td ras-td--check">
                  <MpCheckbox
                    :id="`${id}-row-${r.productId}`" :is-checked="r.selected"
                    :aria-label="`${t('Select')} ${r.product}`"
                    @change="r.selected = !r.selected"
                  />
                </td>
                <td class="ras-td">
                  <span class="ras-product">{{ r.product }}</span>
                  <span class="ras-sku">{{ r.sku }}</span>
                </td>
                <td class="ras-td ras-td--num">{{ r.current }} {{ r.unit }}</td>
                <td class="ras-td ras-td--num">
                  <input
                    v-model="r.qty" type="number" min="0" inputmode="numeric"
                    class="ras-qty" :aria-label="`${t('Additional qty')} — ${r.product}`"
                  >
                </td>
                <td class="ras-td">
                  <div class="ras-datepicker">
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

        <div class="ras-banner">
          <MpIcon name="information" size="md" />
          <span>{{ t('This does not change the work order plan — the job still needs what it needed.') }}</span>
        </div>

        <div class="ras-field">
          <label class="ras-label" :for="`${id}-reason`">{{ t('Reason for the request') }}</label>
          <MpTextarea
            :id="`${id}-reason`" v-model="reason" size="md" :rows="3"
            :placeholder="t('Why is extra material needed?')"
          />
        </div>

        <p v-if="error" class="ras-error">{{ error }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="ras-footer">
          <span class="ras-summary">
            {{ selectedRows.length }}
            {{ selectedRows.length === 1 ? t('component selected') : t('components selected') }}
          </span>
          <div class="ras-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">{{ t('Send request') }}</button>
          </div>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.ras-lead { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }

.ras-table-wrap { overflow-x: auto; }
.ras-table { width: 100%; border-collapse: collapse; }
.ras-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary, #3a4749); text-align: left; white-space: nowrap;
}
.ras-th--num { text-align: right; }
.ras-th--check { width: var(--mp-sizes-10, 40px); }
.ras-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-subtle, #e5e7e7);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e);
  vertical-align: middle; white-space: nowrap;
}
.ras-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.ras-td--check { vertical-align: middle; }
.ras-product { display: block; }
.ras-sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }

.ras-qty {
  width: var(--mp-sizes-24, 96px); text-align: right;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default, #c8cdce); border-radius: var(--mp-radii-md, 8px);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums;
  background: var(--mp-background-default, #fff); color: var(--mp-text-default, #080d0e);
}
.ras-qty:focus { outline: none; border-color: var(--mp-border-bold, #55595b); border-width: 2px; }

.ras-datepicker { min-width: var(--mp-sizes-44, 176px); }

.ras-banner {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4); padding: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md, 8px);
  background: var(--mp-background-information-subtle, #eef4fb);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749);
}

.ras-field { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ras-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #080d0e); }

.ras-error {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical, #a8352d);
}

.ras-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); width: 100%; }
.ras-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
.ras-footer-btns { display: flex; gap: var(--mp-spacing-3); }
</style>
