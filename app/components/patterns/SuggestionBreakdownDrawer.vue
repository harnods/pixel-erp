<script setup lang="ts">
/**
 * "Why this number" — the trust surface behind a suggested quantity (PRD US-008
 * AC-02).
 *
 * A right-side drawer rather than an expandable row or a detail page: the user is
 * triaging a list of thirty rows in one pass, so they must not lose their place
 * (ErpTablePage's accordion makes the WHOLE row the toggle, which would collide
 * with the row's checkbox and its three cell links), and there is no stored record
 * for a URL to own — the numbers are derived.
 *
 * Everything shown is a projection of the row the engine already built, never a
 * second calculation, so the drawer cannot disagree with the table.
 */
import { MpIcon } from '@mekari/pixel3'
import type { WorklistRow } from '~/data/replenishment'
import { leadTimeTierLabel } from '~/data/leadTimeHistory'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'

const props = defineProps<{ isOpen: boolean; row: WorklistRow | null }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'create-purchase-request', row: WorklistRow): void
  (e: 'edit-settings', row: WorklistRow): void
  (e: 'edit-vendors', row: WorklistRow): void
}>()

const { t } = useLocale()

function close() { emit('update:isOpen', false) }

const num = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

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

const velocityNote = computed(() => {
  const row = props.row
  if (!row) return ''
  if (row.velocity.source !== 'computed') return 'No sales yet — excluded until its first sale'
  return row.velocity.provisional
    ? `Provisional — averaged over ${row.velocity.lookbackDays} days since first sale`
    : `Averaged over the last ${row.velocity.lookbackDays} days of sales`
})

/** Real documents behind the demand figure, newest first, capped for the panel. */
const documents = computed(() => {
  const docs = props.row?.velocity.citations ?? []
  return [...docs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10)
})

const modelledDays = computed(() => props.row?.velocity.modelledDays ?? 0)
const longestWindow = computed(() => props.row?.velocity.lookbackDays ?? 0)
</script>

<template>
  <Transition name="rp-bd">
    <div v-if="isOpen && row" class="rp-bd-overlay" @click.self="close">
      <div class="rp-bd-panel" role="dialog" :aria-label="t('Why this suggestion')">
        <header class="rp-bd-header">
          <span class="rp-bd-title">{{ t('Why this suggestion') }}</span>
          <button class="rp-bd-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="rp-bd-body">
          <!-- Identity -->
          <div class="rp-bd-identity">
            <img v-if="row.img" class="rp-bd-thumb" :src="row.img" :alt="row.productName" loading="lazy" />
            <span v-else class="rp-bd-thumb rp-bd-thumb--empty" />
            <div class="rp-bd-identity-text">
              <p class="rp-bd-product">{{ row.productName }}</p>
              <p class="rp-bd-sub">{{ row.sku }} · {{ row.warehouseName }}</p>
            </div>
          </div>
          <p class="rp-bd-asof">{{ t('As of') }} {{ formatDate(row.asOf) }}</p>

          <!-- Headline -->
          <section class="rp-bd-section">
            <div class="rp-bd-headline">
              <span class="rp-bd-headline-label">{{ t('Suggested qty') }}</span>
              <span class="rp-bd-headline-value">
                {{ num(row.suggestion.purchaseQty) }} {{ row.suggestion.purchaseUnit }}
              </span>
            </div>
            <p v-if="row.suggestion.purchaseQty > 0" class="rp-bd-headline-note">
              {{ num(row.suggestion.stockingQty) }} {{ row.unit }} ·
              {{ t('Raw suggestion') }} {{ num(row.suggestion.rawQty) }} {{ row.unit }}
            </p>
            <p v-if="row.suggestion.raisedByMoq || row.suggestion.raisedByPack" class="rp-bd-headline-note">
              <template v-if="row.suggestion.raisedByMoq && row.suggestion.raisedByPack">
                {{ t('Rounded up to MOQ') }} {{ num(row.vendorItem?.moq ?? 0) }},
                {{ t('then to a pack of') }} {{ num(row.vendorItem?.packSize ?? 1) }}
              </template>
              <template v-else-if="row.suggestion.raisedByMoq">
                {{ t('Rounded up to MOQ') }} {{ num(row.vendorItem?.moq ?? 0) }} {{ row.suggestion.purchaseUnit }}
              </template>
              <template v-else>
                {{ t('Rounded to a pack of') }} {{ num(row.vendorItem?.packSize ?? 1) }} {{ row.suggestion.purchaseUnit }}
              </template>
            </p>
            <p v-if="row.suggestion.cappedByMaxLevel" class="rp-bd-headline-note">
              {{ t('Capped by the max level') }}
            </p>
            <p v-if="row.suggestion.suppressed" class="rp-bd-headline-note rp-bd-headline-note--muted">
              <template v-if="row.suggestion.suppressReason === 'above-reorder-point'">
                {{ t('Nothing to order — stock is at or above the reorder point.') }}
              </template>
              <template v-else-if="row.suggestion.suppressReason === 'no-demand-basis'">
                {{ t('No quantity can be suggested without a demand basis.') }}
              </template>
              <template v-else>{{ t('This product is not tracked for replenishment.') }}</template>
            </p>
          </section>

          <!-- Inputs -->
          <section class="rp-bd-section">
            <div class="rp-bd-section-head">
              <span class="rp-bd-section-title">{{ t('Inputs') }}</span>
              <a class="rp-bd-link" @click="emit('edit-settings', row)">{{ t('Edit settings') }}</a>
            </div>
            <dl class="rp-bd-dl">
              <div class="rp-bd-dt">{{ t('Demand velocity') }}</div>
              <div class="rp-bd-dd">
                {{ num(row.velocity.avgDailySales, 2) }} {{ row.unit }}/{{ t('day') }}
                <span class="rp-bd-dd-note">{{ velocityNote }}</span>
              </div>

              <div class="rp-bd-dt">{{ t('Lead time') }}</div>
              <div class="rp-bd-dd">
                {{ row.leadTimeDays }} {{ t('days') }}
                <a class="rp-bd-link rp-bd-link--inline" @click="emit('edit-vendors', row)">
                  {{ t('Edit') }}
                </a>
                <span class="rp-bd-dd-note">
                  {{ leadTimeTierLabel(row.leadTimeTier, row.leadTimeSampleSize) }}
                  · {{ row.vendor?.name ?? t('No vendor — using the company default') }}
                  <template v-if="row.vendorItem">
                    · {{ t('MOQ') }} {{ row.vendorItem.moq }} {{ row.vendorItem.purchaseUnit }}
                    · {{ t('pack of') }} {{ row.vendorItem.packSize }}
                  </template>
                  <template v-if="row.alternates.length">
                    · {{ row.alternates.length }} {{ t('other vendors') }}
                  </template>
                </span>
                <!-- Receipts that could not be measured, and why (US-001 AC-02). -->
                <span v-if="row.leadTimeExcludedNoPo" class="rp-bd-dd-note">
                  {{ row.leadTimeExcludedNoPo }}
                  {{ row.leadTimeExcludedNoPo === 1 ? t('receipt excluded') : t('receipts excluded') }}
                  — {{ t('bought directly with no purchase order') }}
                </span>
              </div>

              <div class="rp-bd-dt">{{ t('Safety days') }}</div>
              <div class="rp-bd-dd">
                {{ row.safetyDays }} {{ t('days') }}
                <span class="rp-bd-dd-note">{{ SOURCE_LABEL[row.safetyDaysSource] }}</span>
              </div>

              <!-- Sizes the ORDER, never the trigger (decision D9). -->
              <div class="rp-bd-dt">{{ row.maxLevel !== null ? t('Max level') : t('Coverage days') }}</div>
              <div class="rp-bd-dd">
                <template v-if="row.maxLevel !== null">
                  {{ num(row.maxLevel) }} {{ row.unit }}
                  <span class="rp-bd-dd-note">{{ t('order up to this level') }}</span>
                </template>
                <template v-else>
                  {{ row.coverageDays }} {{ t('days') }}
                  <span class="rp-bd-dd-note">{{ t('how much each order covers — not part of the trigger') }}</span>
                </template>
              </div>

              <div class="rp-bd-dt">{{ t('Reorder point') }}</div>
              <div class="rp-bd-dd">
                <template v-if="row.reorderPointSource === 'none'">—</template>
                <template v-else>{{ num(row.reorderPoint) }} {{ row.unit }}</template>
                <span class="rp-bd-dd-note">{{ SOURCE_LABEL[row.reorderPointSource] }}</span>
              </div>

              <div class="rp-bd-dt">{{ t('Max level') }}</div>
              <div class="rp-bd-dd">
                <template v-if="row.maxLevel === null">—</template>
                <template v-else>{{ num(row.maxLevel) }} {{ row.unit }}</template>
                <span v-if="row.maxLevel !== null" class="rp-bd-dd-note">{{ t('Caps the suggestion') }}</span>
              </div>

              <div class="rp-bd-dt">{{ t('Available') }}</div>
              <div class="rp-bd-dd">
                {{ num(row.atp.available) }} {{ row.unit }}
                <span class="rp-bd-dd-note">
                  {{ t('On hand') }} {{ num(row.atp.onHand) }} − {{ t('Reserved') }} {{ num(row.atp.reserved) }}
                </span>
              </div>

              <div class="rp-bd-dt">{{ t('On order') }}</div>
              <div class="rp-bd-dd">
                {{ num(row.atp.onOrder) }} {{ row.unit }}
                <span v-if="row.atp.onOrderDocs.length" class="rp-bd-dd-note">
                  {{ row.atp.onOrderDocs.map(d => `${d.number} (${d.outstanding})`).join(' · ') }}
                </span>
                <span v-else class="rp-bd-dd-note">{{ t('No open receipts') }}</span>
              </div>

              <div class="rp-bd-dt">{{ t('Days of cover') }}</div>
              <div class="rp-bd-dd">
                <template v-if="row.cover.coverDays === null">
                  — <span class="rp-bd-dd-note">{{ t('No recent sales') }}</span>
                </template>
                <template v-else>
                  {{ num(row.cover.coverDays, 1) }} {{ t('days') }}
                  <span v-if="row.cover.belowLeadTime" class="rp-bd-dd-note rp-bd-dd-note--critical">
                    {{ t('Stocks out before resupply') }}
                  </span>
                </template>
              </div>
            </dl>
          </section>

          <!-- Formula, with the numbers substituted so it can be checked by eye -->
          <section class="rp-bd-section">
            <span class="rp-bd-section-title">{{ t('How this is calculated') }}</span>
            <div class="rp-bd-formula">
              <div v-for="step in row.suggestion.trace" :key="step.label" class="rp-bd-formula-row">
                <span class="rp-bd-formula-label">{{ step.label }}</span>
                <span class="rp-bd-formula-value">{{ step.value }}</span>
              </div>
            </div>
            <p class="rp-bd-caption">
              {{ t('Suggested qty = (lead time + safety days) × velocity − (available + on order), rounded up.') }}
            </p>
          </section>

          <!-- Real demand documents -->
          <section class="rp-bd-section">
            <span class="rp-bd-section-title">{{ t('Contributing sales documents') }}</span>
            <table v-if="documents.length" class="rp-bd-table">
              <thead>
                <tr>
                  <th class="rp-bd-th">{{ t('Date') }}</th>
                  <th class="rp-bd-th">{{ t('Number') }}</th>
                  <th class="rp-bd-th">{{ t('Source') }}</th>
                  <th class="rp-bd-th rp-bd-th--num">{{ t('Qty') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="doc in documents" :key="`${doc.id}-${doc.date}`">
                  <td class="rp-bd-td">{{ formatDate(doc.date) }}</td>
                  <td class="rp-bd-td">{{ doc.number }}</td>
                  <!-- Only a dispatch has a sales reference; a transfer or a
                       write-off says what it was instead of showing a blank. -->
                  <td class="rp-bd-td rp-bd-td--sub">
                    {{ doc.salesNo ?? (doc.kind === 'transfer' ? t('Warehouse transfer') : t('Stock adjustment')) }}
                  </td>
                  <td class="rp-bd-td rp-bd-td--num">{{ num(doc.qty) }} {{ row.unit }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="rp-bd-caption">
              {{ t('No shipped sales documents in this window.') }}
            </p>
            <!-- Honesty: say plainly how much of the window is modelled demo history
                 rather than implying every day is a real document. -->
            <p v-if="modelledDays > 0" class="rp-bd-caption">
              {{ documents.length }} {{ t('shipped documents') }} ·
              {{ modelledDays }} {{ t('of') }} {{ longestWindow }} {{ t('days are modelled demo history') }}
            </p>
            <p v-if="row.flags.volatile" class="rp-bd-caption rp-bd-caption--warning">
              {{ t('Demand is volatile — recent spikes were damped before weighting.') }}
            </p>
          </section>

          <!-- Cost, when there is something to order -->
          <section v-if="row.vendorItem && row.suggestion.purchaseQty > 0" class="rp-bd-section">
            <span class="rp-bd-section-title">{{ t('Estimated cost') }}</span>
            <dl class="rp-bd-dl">
              <div class="rp-bd-dt">{{ t('Unit cost') }}</div>
              <div class="rp-bd-dd">
                {{ formatIDR(row.vendorItem.unitCost) }} / {{ row.vendorItem.purchaseUnit }}
              </div>
              <div class="rp-bd-dt">{{ t('Estimated total') }}</div>
              <div class="rp-bd-dd">
                {{ formatIDR(row.suggestion.purchaseQty * row.vendorItem.unitCost) }}
                <span class="rp-bd-dd-note">{{ t('Before tax') }}</span>
              </div>
            </dl>
          </section>
        </div>

        <footer class="rp-bd-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Close') }}</button>
          <button
            class="btn-enterprise btn-enterprise--primary"
            type="button"
            @click="emit('create-purchase-request', row)"
          >{{ t('Request to purchase') }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rp-bd-enter-active, .rp-bd-leave-active { transition: background-color 250ms ease; }
.rp-bd-enter-from, .rp-bd-leave-to { background-color: transparent; }
.rp-bd-enter-active .rp-bd-panel { transition: transform 350ms ease-out; }
.rp-bd-leave-active .rp-bd-panel { transition: transform 250ms ease-in; }
.rp-bd-enter-from .rp-bd-panel, .rp-bd-leave-to .rp-bd-panel { transform: translateX(calc(100% + 12px)); }

.rp-bd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.rp-bd-panel {
  margin: var(--mp-spacing-3);
  width: min(520px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.rp-bd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-bd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-bd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.rp-bd-close:hover { background: var(--mp-background-neutral-hovered); }

.rp-bd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }

.rp-bd-identity { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.rp-bd-thumb {
  flex-shrink: 0; width: 40px; height: 40px;
  border-radius: var(--mp-radii-sm); object-fit: cover;
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
}
.rp-bd-thumb--empty { display: inline-block; }
.rp-bd-identity-text { min-width: 0; }
.rp-bd-product {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-lg, 24px);
}
.rp-bd-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-bd-asof {
  margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle);
}

.rp-bd-section {
  margin-top: var(--mp-spacing-5);
  padding-top: var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.rp-bd-section-head { display: flex; align-items: baseline; justify-content: space-between; }
.rp-bd-section-title {
  display: block;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rp-bd-link {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
  cursor: pointer; text-decoration: none;
}
.rp-bd-link--inline { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); }

.rp-bd-headline { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.rp-bd-headline-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.rp-bd-headline-value {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); white-space: nowrap;
}
.rp-bd-headline-note { margin-top: 2px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-bd-headline-note--muted { color: var(--mp-text-secondary); }

.rp-bd-dl {
  margin-top: var(--mp-spacing-3);
  display: grid; grid-template-columns: 150px 1fr;
  row-gap: var(--mp-spacing-3); column-gap: var(--mp-spacing-3);
}
.rp-bd-dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-bd-dd { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; }
.rp-bd-dd-note {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle);
  overflow-wrap: anywhere;
}
.rp-bd-dd-note--critical { color: var(--mp-text-danger); }

/* A bordered box, never a drop-shadow (DESIGN.md → Surfaces & cards). */
.rp-bd-formula {
  margin-top: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-3);
  display: flex; flex-direction: column; gap: var(--mp-spacing-1\.5);
}
.rp-bd-formula-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); }
.rp-bd-formula-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-bd-formula-value {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
}
.rp-bd-caption {
  margin-top: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-bd-caption--warning { color: var(--mp-text-warning); }

.rp-bd-table { margin-top: var(--mp-spacing-3); width: 100%; border-collapse: collapse; }
.rp-bd-th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.rp-bd-th--num { text-align: right; }
.rp-bd-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.rp-bd-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-bd-td--sub { color: var(--mp-text-subtle); }

.rp-bd-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
