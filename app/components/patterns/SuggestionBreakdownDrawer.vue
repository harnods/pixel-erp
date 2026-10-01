<script setup lang="ts">
/**
 * "Suggested qty calculation" — the trust surface behind a suggested quantity
 * (PRD US-005 AC-05: every input behind the number is visible).
 *
 * A right-side drawer rather than an expandable row or a detail page: the user is
 * triaging a list of rows in one pass, so they must not lose their place, and
 * there is no stored record for a URL to own — the numbers are derived.
 *
 * Everything shown is a projection of the row the engine already built, never a
 * second calculation, so the drawer cannot disagree with the table.
 *
 * Layout follows docs/patterns/Drawer.md + ContentList.md: the canonical Teleport
 * shell, H3 sections, key/value rows as horizontal ContentList
 * (rule/content-list-horizontal), a bold-bordered calculation box
 * (rule/table-outer-border-bold) and an MpButtonGroup footer.
 */
import { MpIcon, MpButton, MpButtonGroup, MpTextlink } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import type { WorklistRow } from '~/data/replenishment'
import { leadTimeTierLabel, leadTimeSamplesFor } from '~/data/leadTimeHistory'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { downloadCsv } from '~/utils/csv'

const props = defineProps<{ isOpen: boolean; row: WorklistRow | null }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'create-purchase-request', row: WorklistRow): void
  (e: 'edit-settings', row: WorklistRow): void
  (e: 'edit-vendors', row: WorklistRow): void
}>()

const { t, tf } = useLocale()

function close() { emit('update:isOpen', false) }

const num = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** `64 Bag` — a quantity with its unit, as one translated-safe string. */
const qty = (v: number, unit: string) => `${num(v)} ${unit}`

/** Where a resolved value came from, in words the user can act on. */
const SOURCE_LABEL: Record<string, string> = {
  'sku-warehouse': 'Set for this product in this warehouse',
  sku: 'Set for this product',
  warehouse: 'Warehouse default',
  category: 'Category default',
  global: 'Company default',
  calculated: 'Calculated',
  none: '—',
  default: 'Default',
}
const sourceLabel = (key: string) => t(SOURCE_LABEL[key] ?? key)

const velocityNote = computed(() => {
  const row = props.row
  if (!row) return ''
  if (row.velocity.source !== 'computed') return t('No sales yet. Excluded until its first sale')
  return row.velocity.provisional
    ? tf('Provisional. Averaged over {n} days since first sale', { n: row.velocity.lookbackDays })
    : tf('Averaged over the last {n} days of sales', { n: row.velocity.lookbackDays })
})

/** How the lead time was resolved, as a whole sentence (never joined fragments). */
const leadTimeSource = computed(() => {
  const row = props.row
  if (!row) return ''
  return row.leadTimeTier === 'computed'
    ? tf('Average of the last {n} receipts', { n: row.leadTimeSampleSize })
    : t(leadTimeTierLabel(row.leadTimeTier, row.leadTimeSampleSize))
})

/**
 * A rough cost of the NEED at the vendor's unit price. The suggestion is in stocking
 * units and unitCost is per purchase unit, so convert back. The exact amount is set
 * on the purchase order, after MOQ and pack rounding — this is only an estimate.
 */
const needCost = computed(() => {
  const row = props.row
  if (!row?.vendorItem) return 0
  const perStockingUnit = row.vendorItem.unitCost / Math.max(1, row.vendorItem.unitsPerPurchaseUnit)
  return Math.round(row.suggestion.rawQty * perStockingUnit)
})

// ── Contributing documents ────────────────────────────────────────────────────
// The drawer does NOT list transactions — a window can hold hundreds and a partial
// preview misleads. It shows the counts and hands the full detail to a spreadsheet.

/** Every sales/movement doc behind the demand figure. */
const salesDocs = computed(() => props.row?.velocity.citations ?? [])
/** PO→goods-receipt samples behind a COMPUTED lead time (an estimated tier has none). */
const purchaseDocs = computed(() => {
  const row = props.row
  if (!row || row.leadTimeTier !== 'computed' || !row.vendor) return []
  return leadTimeSamplesFor(row.vendor.id, row.sku, row.warehouseId).filter((s) => !s.excluded && s.leadDays >= 1)
})
const modelledDays = computed(() => props.row?.velocity.modelledDays ?? 0)
const longestWindow = computed(() => props.row?.velocity.lookbackDays ?? 0)

const documentsSummary = computed(() => {
  const s = salesDocs.value.length
  const p = purchaseDocs.value.length
  if (!s && !p) return t('No contributing documents in this window')
  const parts = [s === 1 ? t('1 sales document') : tf('{n} sales documents', { n: s })]
  if (p) parts.push(p === 1 ? t('1 purchase receipt') : tf('{n} purchase receipts', { n: p }))
  return parts.join(' · ')
})

/** The full contributing SALES detail — the entry point the drawer doesn't list. */
function exportSales() {
  const row = props.row
  if (!row) return
  const lines: (string | number)[][] = [['Date', 'Number', 'Source', 'Qty', 'Unit']]
  for (const d of [...salesDocs.value].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    lines.push([
      d.date, d.number,
      d.salesNo ?? (d.kind === 'work-order' ? 'Work order material consume' : ''),
      d.qty, row.unit,
    ])
  }
  downloadCsv(lines, `contributing-sales-${row.sku}-${row.warehouseId}.csv`)
}

/** The full contributing PURCHASE detail (PO→goods-receipt samples). */
function exportPurchase() {
  const row = props.row
  if (!row) return
  const lines: (string | number)[][] = [['Ordered', 'Received', 'Purchase order', 'Receipt', 'Lead days']]
  for (const s of [...purchaseDocs.value].sort((a, b) => (a.receiptDate < b.receiptDate ? 1 : -1))) {
    lines.push([s.orderDate, s.receiptDate, s.poNumber ?? '(modelled)', s.receiptNumber ?? '(modelled)', s.leadDays])
  }
  downloadCsv(lines, `contributing-purchase-${row.sku}-${row.warehouseId}.csv`)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="rp-bd">
      <div v-if="isOpen && row" class="rp-bd-overlay">
        <div class="rp-bd-panel" role="dialog" :aria-label="t('Suggested qty calculation')">
          <header class="rp-bd-header">
            <span class="rp-bd-title">{{ t('Suggested qty calculation') }}</span>
            <MpButton class="rp-bd-close" is-rounded :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="rp-bd-body">
            <!-- Identity -->
            <div class="rp-bd-identity">
              <img v-if="row.img" class="rp-bd-thumb" :src="row.img" :alt="row.productName" loading="lazy" />
              <span v-else class="rp-bd-thumb" />
              <div class="rp-bd-identity-text">
                <p class="rp-bd-product">{{ row.productName }}</p>
                <p class="rp-bd-caption">{{ row.sku }} · {{ row.warehouseName }} · {{ t('As of') }} {{ formatDate(row.asOf) }}</p>
              </div>
            </div>

            <!-- ── Suggestion ── -->
            <section class="rp-bd-section">
              <h3 class="rp-bd-section-title">{{ t('Suggestion') }}</h3>

              <ContentList horizontal :label="t('Suggested qty')">
                <span class="rp-bd-strong">{{ qty(row.suggestion.rawQty, row.unit) }}</span>
                <!-- This is the NEED. MOQ and the purchase multiplier are applied later,
                     when purchasing turns the request into a purchase order. -->
                <span v-if="row.suggestion.rawQty > 0 && row.vendorItem" class="rp-bd-note">
                  {{ t('Rounded to MOQ and purchase multiplier when purchasing creates the purchase order') }}
                </span>
                <!-- US-004 AC-03: due, but open POs already bring it up to the target. -->
                <span v-if="row.suggestion.coveredBy.length" class="rp-bd-note">
                  {{ tf('Covered by {docs}. Nothing more to order', { docs: row.suggestion.coveredBy.join(', ') }) }}
                </span>
                <span v-if="row.suggestion.suppressed" class="rp-bd-note">
                  <template v-if="row.suggestion.suppressReason === 'above-reorder-point'">
                    {{ t('Nothing to order. Stock is above the reorder point') }}
                  </template>
                  <template v-else-if="row.suggestion.suppressReason === 'no-demand-basis'">
                    {{ t('No quantity can be suggested without a demand basis') }}
                  </template>
                  <template v-else>{{ t('This product is not tracked for replenishment') }}</template>
                </span>
              </ContentList>

              <!-- Days of cover — how long available stock lasts at the current pace. -->
              <ContentList horizontal :label="t('Days of cover')">
                <template v-if="row.cover.coverDays === null">
                  —
                  <span class="rp-bd-note">{{ t('No recent sales') }}</span>
                </template>
                <template v-else>
                  <span :class="{ 'rp-bd-critical': row.cover.belowLeadTime }">
                    {{ tf('{n} days', { n: num(row.cover.coverDays, 1) }) }}
                  </span>
                  <span class="rp-bd-note" :class="{ 'rp-bd-critical': row.cover.belowLeadTime }">
                    {{ row.cover.belowLeadTime ? t('Stocks out before resupply') : t('From available stock at the current pace') }}
                  </span>
                </template>
              </ContentList>
            </section>

            <!-- ── Inputs ── -->
            <section class="rp-bd-section">
              <h3 class="rp-bd-section-title">{{ t('Inputs') }}</h3>

              <ContentList horizontal :label="t('Demand velocity')">
                {{ tf('{n} {unit} per day', { n: num(row.velocity.avgDailySales, 2), unit: row.unit }) }}
                <span class="rp-bd-note">{{ velocityNote }}</span>
              </ContentList>

              <ContentList horizontal :label="t('Lead time')">
                {{ tf('{n} days', { n: row.leadTimeDays }) }}
                <span class="rp-bd-note">{{ leadTimeSource }}</span>
                <!-- Receipts that could not be measured, and why (US-001 AC-03). -->
                <span v-if="row.leadTimeExcludedNoPo" class="rp-bd-note">
                  {{ row.leadTimeExcludedNoPo === 1
                    ? t('1 receipt excluded. Bought directly with no purchase order')
                    : tf('{n} receipts excluded. Bought directly with no purchase order', { n: row.leadTimeExcludedNoPo }) }}
                </span>
              </ContentList>

              <ContentList horizontal :label="t('Vendor')">
                {{ row.vendor?.name ?? '—' }}
                <span v-if="!row.vendor" class="rp-bd-note">{{ t('No vendor. Using the default lead time') }}</span>
                <span v-if="row.vendorItem" class="rp-bd-note">
                  {{ tf('MOQ {moq} {unit} · purchase multiplier {pack}', { moq: row.vendorItem.moq, unit: row.vendorItem.purchaseUnit, pack: row.vendorItem.packSize }) }}
                </span>
                <span v-if="row.inactivePreferredVendor" class="rp-bd-note rp-bd-warning">
                  {{ t('Preferred vendor is inactive. Lead time falls back to the next listed vendor') }}
                </span>
                <MpTextlink id="rp-bd-vendors" as="a" class="rp-bd-link" @click.prevent="emit('edit-vendors', row)">
                  {{ t('View vendors, lead time and MOQ') }}
                </MpTextlink>
              </ContentList>

              <ContentList horizontal :label="t('Safety days')">
                {{ tf('{n} days', { n: row.safetyDays }) }}
                <span class="rp-bd-note">{{ sourceLabel(row.safetyDaysSource) }}</span>
                <MpTextlink id="rp-bd-settings" as="a" class="rp-bd-link" @click.prevent="emit('edit-settings', row)">
                  {{ t('Replenishment settings') }}
                </MpTextlink>
              </ContentList>

              <!-- Sizes the ORDER, never the trigger (decision D9). -->
              <ContentList horizontal :label="t('Coverage days')">
                {{ tf('{n} days', { n: row.coverageDays }) }}
                <span class="rp-bd-note">{{ t('How much each order covers. Not part of the trigger') }}</span>
              </ContentList>

              <ContentList horizontal :label="t('Reorder point')">
                <template v-if="row.reorderPointSource === 'none'">—</template>
                <template v-else>{{ qty(row.reorderPoint, row.unit) }}</template>
                <span class="rp-bd-note">{{ sourceLabel(row.reorderPointSource) }}</span>
              </ContentList>

              <!-- The order-up-to level the suggestion refills to. -->
              <ContentList horizontal :label="t('Order up to')">
                <template v-if="row.velocity.avgDailySales > 0">
                  {{ qty(row.suggestion.targetQty, row.unit) }}
                  <span class="rp-bd-note">{{ t('Demand velocity × (lead time + safety days + coverage days)') }}</span>
                </template>
                <template v-else>
                  —
                  <span class="rp-bd-note">{{ t('No demand yet to size an order') }}</span>
                </template>
              </ContentList>

              <ContentList horizontal :label="t('Available qty')">
                {{ qty(row.atp.available, row.unit) }}
                <span class="rp-bd-note">
                  {{ tf('On hand {onHand} − reserved {reserved}', { onHand: num(row.atp.onHand), reserved: num(row.atp.reserved) }) }}
                </span>
              </ContentList>

              <ContentList horizontal :label="t('In transit qty')">
                {{ qty(row.atp.onOrder, row.unit) }}
                <span class="rp-bd-note">
                  {{ row.atp.onOrderDocs.length
                    ? row.atp.onOrderDocs.map(d => `${d.number} (${d.outstanding})`).join(' · ')
                    : t('No open purchase orders or receipts') }}
                </span>
              </ContentList>
            </section>

            <!-- ── Calculation, with the numbers substituted so it can be checked by eye ── -->
            <section class="rp-bd-section">
              <h3 class="rp-bd-section-title">{{ t('Calculation') }}</h3>
              <p class="rp-bd-caption">
                {{ t('Suggested qty = demand velocity × (lead time + safety days + coverage days) − (available + in transit), rounded up') }}
              </p>
              <!-- A contained key/value box: bold outer border, default inner rules
                   (rule/table-outer-border-bold). -->
              <div class="rp-bd-steps">
                <div v-for="step in row.suggestion.trace" :key="step.label" class="rp-bd-step">
                  <span class="rp-bd-step-label">{{ t(step.label) }}</span>
                  <span class="rp-bd-step-value">{{ step.value }}</span>
                </div>
              </div>
            </section>

            <!-- ── Contributing documents — counts only; the full detail is an export away ── -->
            <section class="rp-bd-section">
              <h3 class="rp-bd-section-title">{{ t('Contributing documents') }}</h3>
              <p class="rp-bd-caption">
                {{ documentsSummary }}
                <template v-if="modelledDays > 0">
                  · {{ tf('{n} of {total} days are modelled demo history', { n: modelledDays, total: longestWindow }) }}
                </template>
              </p>
              <!-- Text-only buttons: no leading icon on Export (rule/btn-icon-add-only). -->
              <MpButtonGroup v-if="salesDocs.length || purchaseDocs.length" class="rp-bd-export">
                <MpButton v-if="salesDocs.length" variant="secondary" is-rounded @click="exportSales">
                  {{ t('Export sales (CSV)') }}
                </MpButton>
                <MpButton v-if="purchaseDocs.length" variant="secondary" is-rounded @click="exportPurchase">
                  {{ t('Export purchases (CSV)') }}
                </MpButton>
              </MpButtonGroup>
            </section>

            <!-- ── Estimated cost of the NEED — a rough figure; the exact amount is set
                 on the purchase order, after MOQ rounding ── -->
            <section v-if="row.vendorItem && row.suggestion.rawQty > 0" class="rp-bd-section">
              <h3 class="rp-bd-section-title">{{ t('Estimated cost') }}</h3>
              <ContentList horizontal :label="t('Unit cost')">
                {{ formatIDR(row.vendorItem.unitCost) }} / {{ row.vendorItem.purchaseUnit }}
              </ContentList>
              <ContentList horizontal :label="t('Estimated total')">
                {{ formatIDR(needCost) }}
                <span class="rp-bd-note">{{ t('Estimate for the suggested qty. The exact total is set on the purchase order') }}</span>
              </ContentList>
            </section>
          </div>

          <footer class="rp-bd-footer">
            <MpButtonGroup class="erp-action-footer">
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Close') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="emit('create-purchase-request', row)">
                {{ t('Request to purchase') }}
              </MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Canonical drawer shell (docs/patterns/Drawer.md › BillsFiltersDrawer.vue). */
.rp-bd-enter-active, .rp-bd-leave-active { transition: background-color 250ms ease; }
.rp-bd-enter-from, .rp-bd-leave-to { background-color: transparent; }
.rp-bd-enter-active .rp-bd-panel { transition: transform 350ms ease-out; }
.rp-bd-leave-active .rp-bd-panel { transition: transform 250ms ease-in; }
.rp-bd-enter-from .rp-bd-panel, .rp-bd-leave-to .rp-bd-panel { transform: translateX(calc(100% + 12px)); }

.rp-bd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.rp-bd-panel {
  margin: var(--mp-spacing-3);
  width: min(560px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #ffffff);
  border-radius: 12px;
  overflow: hidden;
}
.rp-bd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-bd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-bd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.rp-bd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.rp-bd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }

/* ── Identity ── */
.rp-bd-identity { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.rp-bd-thumb {
  flex-shrink: 0; width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-sm); object-fit: cover;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-bd-identity-text { min-width: 0; }
.rp-bd-product {
  margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-lg, 24px);
}

/* ── Sections: H3 (rule/type-scale — lg/16, semibold), divider between ── */
.rp-bd-section {
  margin-top: var(--mp-spacing-4);
  padding-top: var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-bd-section-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default);
}
.rp-bd-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Value helpers inside ContentList ── */
.rp-bd-strong { font-weight: var(--mp-font-weights-semi-bold); }
.rp-bd-note {
  display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  overflow-wrap: anywhere;
}
.rp-bd-critical { color: var(--mp-text-danger); }
.rp-bd-warning { color: var(--mp-colors-text-warning); }
.rp-bd-link { display: inline-block; font-size: var(--mp-font-sizes-sm); }

/* ── Calculation steps — a contained key/value box ── */
.rp-bd-steps {
  margin-top: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.rp-bd-step {
  display: flex; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-bd-step:last-child { border-bottom: none; font-weight: var(--mp-font-weights-semi-bold); }
.rp-bd-step-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); flex-shrink: 0; }
.rp-bd-step-value {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
}

.rp-bd-export { margin-top: var(--mp-spacing-3); flex-wrap: wrap; }

.rp-bd-footer {
  flex-shrink: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
</style>
