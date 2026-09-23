<script setup lang="ts">
/**
 * Merge several Purchase Requests into draft Purchase Order(s) (PRD D12 / US-018).
 *
 * Same-SKU lines across the selected requests are SUMMED into one need, and that
 * combined need is rounded ONCE to the chosen vendor's MOQ + purchase multiplier —
 * so three requests for 16 + 22 + 42 become one 80-unit need that rounds to a
 * single MOQ/pack quantity, instead of three separate roundings that over-order.
 *
 * Each merged line shows which requests fed it, keeps the qty editable, and lets
 * purchasing switch the vendor (re-rounding the merged need). The output is always
 * a DRAFT PO (US-020). Mirrors ConvertPrToPoModal.vue / CreatePurchaseRequestModal.
 */
import { MpIcon, MpInput, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import type { PurchaseRequest } from '~/data/types'
import {
  planPosFromPurchaseRequests, skipReasonLabel, defaultConversionWarehouseForMany,
} from '~/data/replenishmentDraftPo'
import { applyMoqAndPack } from '~/data/replenishment'
import { vendorItemsForSku, vendorItemFor, vendorNameFor } from '~/data/vendorItems'
import { warehouses } from '~/data/warehouses'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ isOpen: boolean; prs: PurchaseRequest[] }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', payload: {
    warehouseId: string
    vendorChoices: Record<string, string | null>
    qtyOverrides: Record<string, number>
  }): void
}>()

const { t } = useLocale()

const warehouseId = ref('')
const vendorChoices = reactive<Record<string, string | null>>({})
const qtyOverrides = reactive<Record<string, number>>({})
const qtyError = ref('')
const pendingRecommend = reactive<Record<string, { from: number; to: number; vendorName: string }>>({})

const activeWarehouses = computed(() => warehouses.filter((w) => w.status === 'active'))
const warehouseName = computed(() => warehouses.find((w) => w.id === warehouseId.value)?.name ?? '—')

watch(() => props.isOpen, (open) => {
  if (!open) return
  for (const k of Object.keys(vendorChoices)) delete vendorChoices[k]
  for (const k of Object.keys(qtyOverrides)) delete qtyOverrides[k]
  for (const k of Object.keys(pendingRecommend)) delete pendingRecommend[k]
  qtyError.value = ''
  warehouseId.value = defaultConversionWarehouseForMany(props.prs)
})

const plan = computed(() => planPosFromPurchaseRequests(props.prs, warehouseId.value, { ...vendorChoices }, { ...qtyOverrides }))

const totals = computed(() => {
  const groups = plan.value.groups
  return {
    poCount: groups.length,
    vendorCount: new Set(groups.map((g) => g.vendorId)).size,
    lineCount: groups.reduce((n, g) => n + g.lines.length, 0),
  }
})

const summaryLine = computed(() => {
  const { poCount, vendorCount, lineCount } = totals.value
  const reqPart = props.prs.length === 1 ? t('1 request') : `${props.prs.length} ${t('requests')}`
  if (poCount === 0) return `${reqPart} · ${t('nothing can be ordered')}`
  const poPart = poCount === 1 ? t('1 draft purchase order') : `${poCount} ${t('draft purchase orders')}`
  const vendorPart = vendorCount === 1 ? t('1 vendor') : `${vendorCount} ${t('vendors')}`
  const linePart = lineCount === 1 ? t('1 merged line') : `${lineCount} ${t('merged lines')}`
  return `${reqPart} → ${poPart} · ${vendorPart} · ${linePart}`
})

function alternativesFor(sku: string) { return vendorItemsForSku(sku) }

function needFor(sku: string): number {
  let n = 0
  for (const pr of props.prs) for (const l of pr.lines) if (l.sku === sku) n += l.requestedQty
  return n
}

function chooseVendor(sku: string, vendorId: string | null) {
  vendorChoices[sku] = vendorId
  const vi = vendorId ? vendorItemFor(sku, vendorId) : undefined
  const next = applyMoqAndPack(needFor(sku), vi).purchaseQty
  const typed = qtyOverrides[sku]
  if (typed === undefined || typed === next) { delete pendingRecommend[sku]; return }
  pendingRecommend[sku] = { from: typed, to: next, vendorName: vendorId ? vendorNameFor(vendorId) : t('no vendor') }
}

function applyRecommendation(sku: string) {
  const pending = pendingRecommend[sku]
  if (!pending) return
  qtyOverrides[sku] = pending.to
  delete pendingRecommend[sku]
}
function dismissRecommendation(sku: string) { delete pendingRecommend[sku] }

function setQty(sku: string, raw: string) {
  const n = Number(raw)
  if (raw === '' || Number.isNaN(n)) delete qtyOverrides[sku]
  else qtyOverrides[sku] = Math.max(0, Math.floor(n))
  delete pendingRecommend[sku]
  qtyError.value = ''
}

function roundNote(line: { vendorItem: { moq: number; packSize: number }; raisedByMoq?: boolean; raisedByPack?: boolean }): string {
  if (line.raisedByMoq) return `${t('Raised to MOQ')} ${line.vendorItem.moq}`
  if (line.raisedByPack) return `${t('Rounded to multiples of')} ${line.vendorItem.packSize}`
  return ''
}

/** "From #90036 (16) + #90078 (22) + #90013 (42)" — makes the merge visible. */
function sourceNote(line: { sources?: { prNumber: number; qty: number }[] }): string {
  if (!line.sources || line.sources.length < 2) return ''
  return `${t('From')} ${line.sources.map((s) => `#${s.prNumber} (${s.qty})`).join(' + ')}`
}

const confirmLabel = computed(() => {
  const n = totals.value.poCount
  return n <= 1 ? t('Create draft purchase order') : `${t('Create')} ${n} ${t('draft purchase orders')}`
})

function close() { emit('update:isOpen', false) }

function confirm() {
  if (!warehouseId.value) { qtyError.value = t('Choose a ship-to warehouse.'); return }
  if (totals.value.poCount === 0) { qtyError.value = t('Nothing can be ordered from this request.'); return }
  const zeroLines = Object.values(qtyOverrides).filter((v) => v <= 0).length
  if (zeroLines > 0) {
    qtyError.value = `${t('Enter a quantity for')} ${zeroLines} ${zeroLines === 1 ? t('product') : t('products')}`
    return
  }
  emit('confirm', { warehouseId: warehouseId.value, vendorChoices: { ...vendorChoices }, qtyOverrides: { ...qtyOverrides } })
}
</script>

<template>
  <Transition name="rp-po">
    <div v-if="isOpen" class="rp-po-overlay" @click.self="close">
      <div class="rp-po-panel" role="dialog" aria-modal="true" :aria-label="t('Create purchase order')">
        <header class="rp-po-header">
          <span class="rp-po-title">{{ t('Merge into purchase order') }}</span>
          <button class="rp-po-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="rp-po-body">
          <p class="rp-po-summary">{{ summaryLine }}</p>
          <p class="rp-po-summary rp-po-summary--muted">
            {{ t('Same-product lines across the selected requests are combined, then the merged quantity is rounded to each vendor\'s MOQ and purchase multiplier. Saved as a draft for approval.') }}
          </p>

          <div class="rp-po-shipto">
            <span class="rp-po-shipto-label">{{ t('Ship to') }}</span>
            <MpPopover id="bcpo-warehouse" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
              <MpPopoverTrigger>
                <button type="button" class="rp-po-shipto-value">
                  {{ warehouseName }}
                  <MpIcon name="chevron-down" size="sm" />
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '260px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="w in activeWarehouses"
                    :key="w.id"
                    :is-active="w.id === warehouseId"
                    @click="warehouseId = w.id"
                  >{{ w.name }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>

          <p v-if="plan.skipped.length" class="rp-po-summary rp-po-summary--warning">
            {{ plan.skipped.length }}
            {{ plan.skipped.length === 1 ? t('line skipped') : t('lines skipped') }}
            — {{ t('see below') }}
          </p>

          <section v-for="group in plan.groups" :key="group.key" class="rp-po-card">
            <header class="rp-po-card-head">
              <div>
                <p class="rp-po-vendor">{{ group.vendorName }}</p>
                <p class="rp-po-card-sub">
                  {{ group.warehouseName }} · {{ t('Needed in') }} {{ group.leadTimeDays }} {{ t('days') }}
                </p>
              </div>
              <div class="rp-po-card-total">
                <span class="rp-po-card-total-label">{{ t('Est. value') }}</span>
                <span class="rp-po-card-total-value">{{ formatIDR(group.total) }}</span>
              </div>
            </header>

            <table class="rp-po-table">
              <thead>
                <tr>
                  <th class="rp-po-th">{{ t('Product') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Merged need') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Order qty') }}</th>
                  <th class="rp-po-th">{{ t('Unit') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Est. value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in group.lines" :key="line.sku">
                  <td class="rp-po-td">
                    <span class="rp-po-product">{{ line.productName }}</span>
                    <span class="rp-po-product-sub">{{ line.sku }}</span>
                    <span v-if="sourceNote(line)" class="rp-po-product-sub rp-po-product-merge">{{ sourceNote(line) }}</span>
                    <MpPopover
                      v-if="alternativesFor(line.sku).length > 1"
                      :id="`bcpo-vendor-${line.sku}`"
                      is-close-on-select
                      use-portal
                      :is-keep-alive="false"
                      placement="bottom-start"
                    >
                      <MpPopoverTrigger>
                        <a class="rp-po-change">{{ t('Change vendor') }}</a>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
                        <MpPopoverList>
                          <MpPopoverListItem
                            v-for="alt in alternativesFor(line.sku)"
                            :key="alt.id"
                            :is-active="alt.vendorId === line.vendorId"
                            @click="chooseVendor(line.sku, alt.vendorId)"
                          >
                            {{ vendorNameFor(alt.vendorId) }} · {{ t('MOQ') }} {{ alt.moq }} · ×{{ alt.packSize }} · {{ alt.leadTimeDays }} {{ t('days') }}
                          </MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <td class="rp-po-td rp-po-td--num rp-po-td--muted">{{ line.needStock }}</td>
                  <td class="rp-po-td rp-po-td--num">
                    <MpInput
                      :id="`bcpo-qty-${line.sku}`"
                      :model-value="String(line.finalQty)"
                      type="number"
                      :class="css({ width: '96px' })"
                      @update:model-value="(v: string) => setQty(line.sku, v)"
                    />
                    <span v-if="roundNote(line)" class="rp-po-cell-note">{{ roundNote(line) }}</span>
                    <span v-if="pendingRecommend[line.sku]" class="rp-po-cell-note rp-po-cell-note--prompt">
                      {{ t('Recommended') }}
                      {{ pendingRecommend[line.sku]!.from }} → {{ pendingRecommend[line.sku]!.to }}
                      ({{ pendingRecommend[line.sku]!.vendorName }})
                      <a class="rp-po-change" @click="applyRecommendation(line.sku)">{{ t('Apply') }}</a>
                      <a class="rp-po-change" @click="dismissRecommendation(line.sku)">{{ t('Keep mine') }}</a>
                    </span>
                  </td>
                  <td class="rp-po-td">{{ line.purchaseUnit }}</td>
                  <td class="rp-po-td rp-po-td--num">{{ formatIDR(line.finalQty * line.unitCost) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-if="plan.skipped.length" class="rp-po-card rp-po-card--skipped">
            <header class="rp-po-card-head">
              <p class="rp-po-vendor">{{ t('Skipped') }} ({{ plan.skipped.length }})</p>
            </header>
            <ul class="rp-po-skip-list">
              <li v-for="s in plan.skipped" :key="s.sku" class="rp-po-skip-item">
                <span class="rp-po-skip-name">{{ s.productName }}</span>
                <span class="rp-po-skip-sub">{{ s.sku }}</span>
                <span class="rp-po-skip-reason">{{ t(skipReasonLabel(s.reason)) }}</span>
              </li>
            </ul>
            <p class="rp-po-skip-hint">
              {{ t('These products need a linked vendor with pack details before they can be ordered.') }}
            </p>
          </section>
        </div>

        <footer class="rp-po-footer">
          <span v-if="qtyError" class="rp-po-error">{{ qtyError }}</span>
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirm">{{ confirmLabel }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rp-po-enter-active, .rp-po-leave-active { transition: opacity 200ms ease; }
.rp-po-enter-from, .rp-po-leave-to { opacity: 0; }
.rp-po-enter-active .rp-po-panel, .rp-po-leave-active .rp-po-panel { transition: transform 200ms ease, opacity 200ms ease; }
.rp-po-enter-from .rp-po-panel, .rp-po-leave-to .rp-po-panel { transform: scale(0.97); opacity: 0; }

.rp-po-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 48px var(--mp-spacing-4);
  overflow-y: auto;
}
.rp-po-panel {
  width: min(880px, 100%);
  max-height: calc(100vh - 96px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 16px);
  overflow: hidden;
}
.rp-po-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-po-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.rp-po-close:hover { background: var(--mp-background-neutral-hovered); }

.rp-po-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-5); }
.rp-po-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rp-po-summary--muted { margin-top: 2px; color: var(--mp-text-subdued, #6b7280); }
.rp-po-summary--warning { margin-top: var(--mp-spacing-2); color: var(--mp-text-warning); }

.rp-po-shipto { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
.rp-po-shipto-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-shipto-value {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-stage, #fff); cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

.rp-po-card {
  margin-top: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.rp-po-card--skipped { border-color: var(--mp-border-warning, var(--mp-border-default)); }
.rp-po-card-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-vendor { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-po-card-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total { text-align: right; white-space: nowrap; }
.rp-po-card-total-label { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.rp-po-table { width: 100%; border-collapse: collapse; }
.rp-po-th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.rp-po-th--num { text-align: right; }
.rp-po-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  vertical-align: top;
}
.rp-po-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-po-td--muted { color: var(--mp-text-subtle); }
.rp-po-product { display: block; }
.rp-po-product-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-po-product-merge { color: var(--mp-text-secondary); margin-top: 1px; }
.rp-po-change {
  display: inline-block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer;
}
.rp-po-cell-note { display: block; margin-top: 2px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning); }
.rp-po-cell-note--prompt { color: var(--mp-text-informational, #1f6feb); }
.rp-po-cell-note--prompt .rp-po-change { margin-left: 8px; }

.rp-po-skip-list { display: flex; flex-direction: column; }
.rp-po-skip-item {
  display: flex; align-items: baseline; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rp-po-skip-name { flex: 1; min-width: 0; }
.rp-po-skip-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-po-skip-reason { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning); white-space: nowrap; }
.rp-po-skip-hint {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

.rp-po-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.rp-po-error { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
