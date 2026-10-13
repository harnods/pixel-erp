<script setup lang="ts">
/**
 * Edit work order materials — PRD v0.5 UC-06 (Not started phase).
 *
 * The counterpart to AdjustWorkOrderModal: Adjust changes a RUNNING job's demand,
 * this changes one that has not started. The rules differ in one decisive way —
 * before start, a change updates the existing request line IN PLACE (there is no
 * mid-run delta to keep apart, and no second required date to carry), and the
 * editor becomes that line's requestor.
 *
 * The rules this form carries:
 *  • Qty can go up or down, minimum 1. A component cannot be REMOVED — the work
 *    order still lists it, and a line that vanishes from the warehouse's request
 *    looks like demand that was never raised.
 *  • Qty cannot go below what is already reserved. That is blocked inline with
 *    "unreserve first" rather than silently releasing: before start, unreserve is
 *    an available, deliberate action (UC-03), so the user is asked to take it.
 *    This is the opposite of Adjust, where the cut itself releases, under the
 *    Adjust reason.
 *  • The warehouse is notified of any qty change (in-app; email is out of the
 *    prototype's reach, L-11).
 *
 * Scope note: this edits MATERIAL demand, which is what UC-06 governs. The rest
 * of the work order form (dates, attachments, routing) is not editable yet — see
 * docs/design/stock-request-as-built.md.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpIcon, MpDatePicker,
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
  (e: 'save', payload: { changes: DemandChange[] }): void
}>()

const { t } = useLocale()

// MpDatePicker speaks DD/MM/YYYY; a request line stores ISO. Convert at the
// boundary (same rule as the Adjust modal).
const toDisplay = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const toIso = (display: string): string => {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** One row per COMPONENT — several lines of the same material roll up. */
interface Row {
  productId: string
  product: string
  sku: string
  unit: string
  current: number
  /** already reserved — the floor this edit cannot cut below */
  reserved: number
  qty: string
  /** DD/MM/YYYY, as the picker speaks it */
  requiredDate: string
}

const rows = ref<Row[]>([])
const error = ref('')

function build(): Row[] {
  const byProduct = new Map<string, Row>()
  for (const l of props.lines) {
    if (l.rejected) continue
    const existing = byProduct.get(l.productId)
    if (existing) {
      existing.current += l.qty
      existing.reserved += l.reserved
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
      qty: String(l.qty),
      requiredDate: toDisplay(l.requiredDate),
    })
  }
  return [...byProduct.values()]
}

watch(() => props.isOpen, (open) => {
  if (!open) return
  rows.value = build()
  error.value = ''
})
watch(rows, () => { error.value = '' }, { deep: true })

const num = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const changedRows = computed(() => rows.value.filter(r =>
  num(r.qty) !== r.current || toIso(r.requiredDate) !== isoFor(r.productId)))

function isoFor(productId: string): string {
  return props.lines.find(l => l.productId === productId)?.requiredDate ?? ''
}

/** The guardrail that defines this form: a cut below what is already reserved. */
function blockedByReserved(r: Row): boolean {
  return num(r.qty) < r.reserved
}
const blockedRows = computed(() => rows.value.filter(blockedByReserved))

// Footer actions stay rendered and enabled (rule/form-actions-always-present);
// an unmet precondition explains itself inline rather than greying the button out.
function submit() {
  if (changedRows.value.length === 0) {
    error.value = t('Change a quantity or a request date before saving.')
    return
  }
  const tooLow = changedRows.value.find(r => num(r.qty) < 1)
  if (tooLow) {
    error.value = `${tooLow.product}: ${t('quantity cannot go below 1 — a component cannot be removed from a work order.')}`
    return
  }
  const blocked = blockedRows.value[0]
  if (blocked) {
    error.value = `${blocked.product}: ${t('unreserve first — quantity cannot go below the')} ${blocked.reserved} ${blocked.unit} ${t('already reserved.')}`
    return
  }
  const missingDate = changedRows.value.find(r => !toIso(r.requiredDate))
  if (missingDate) {
    error.value = `${missingDate.product}: ${t('a request date is required on every component you change.')}`
    return
  }
  emit('save', {
    changes: changedRows.value.map(r => ({
      productId: r.productId,
      qty: num(r.qty),
      requiredDate: toIso(r.requiredDate),
    })),
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
        {{ t('Edit materials') }} — {{ workOrderNumber }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="ewm-lead">
          {{ t('The work order has not started, so a change updates its existing request line and the warehouse is told. A component cannot be removed.') }}
        </p>

        <div class="ewm-table-wrap">
          <table class="ewm-table">
            <thead>
              <tr>
                <th class="ewm-th">{{ t('Product') }}</th>
                <th class="ewm-th ewm-th--num">{{ t('Current') }}</th>
                <th class="ewm-th ewm-th--num">{{ t('Reserved') }}</th>
                <th class="ewm-th ewm-th--num">{{ t('New qty') }}</th>
                <th class="ewm-th">{{ t('Request date') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.productId" class="ewm-tr">
                <td class="ewm-td">
                  <span class="ewm-product">{{ r.product }}</span>
                  <span class="ewm-sku">{{ r.sku }}</span>
                </td>
                <td class="ewm-td ewm-td--num">{{ r.current }} {{ r.unit }}</td>
                <td class="ewm-td ewm-td--num">{{ r.reserved }} {{ r.unit }}</td>
                <td class="ewm-td ewm-td--num">
                  <input
                    v-model="r.qty" type="number" min="1" inputmode="numeric"
                    class="ewm-qty" :aria-label="`${t('New qty')} — ${r.product}`"
                  >
                </td>
                <td class="ewm-td">
                  <div class="ewm-datepicker">
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

        <!-- The guardrail, said before the user commits rather than on submit. -->
        <div v-if="blockedRows.length" class="ewm-banner">
          <MpIcon name="information" size="md" />
          <span>
            {{ t('Unreserve') }} {{ blockedRows.map(r => r.product).join(', ') }}
            {{ t('before cutting below what is already reserved — reservation is released deliberately, never by a quantity edit.') }}
          </span>
        </div>

        <p v-if="error" class="ewm-error">{{ error }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="ewm-footer">
          <span class="ewm-summary">
            {{ changedRows.length }}
            {{ changedRows.length === 1 ? t('component changed') : t('components changed') }}
          </span>
          <div class="ewm-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">{{ t('Save') }}</button>
          </div>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.ewm-lead { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }

.ewm-table-wrap { overflow-x: auto; }
.ewm-table { width: 100%; border-collapse: collapse; }
.ewm-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary, #3a4749); text-align: left; white-space: nowrap;
}
.ewm-th--num { text-align: right; }
.ewm-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-subtle, #e5e7e7);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e);
  vertical-align: middle; white-space: nowrap;
}
.ewm-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.ewm-product { display: block; }
.ewm-sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }

.ewm-qty {
  width: var(--mp-sizes-24, 96px); text-align: right;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default, #c8cdce); border-radius: var(--mp-radii-md, 8px);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums;
  background: var(--mp-background-default, #fff); color: var(--mp-text-default, #080d0e);
}
.ewm-qty:focus { outline: none; border-color: var(--mp-border-bold, #55595b); border-width: 2px; }

.ewm-datepicker { min-width: var(--mp-sizes-44, 176px); }

.ewm-banner {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4); padding: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md, 8px);
  background: var(--mp-background-information-subtle, #eef4fb);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749);
}

.ewm-error {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical, #a8352d);
}

.ewm-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); width: 100%; }
.ewm-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
.ewm-footer-btns { display: flex; gap: var(--mp-spacing-3); }
</style>
