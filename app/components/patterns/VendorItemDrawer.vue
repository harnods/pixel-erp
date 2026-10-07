<script setup lang="ts">
/**
 * Vendor terms for ONE product — a read-only view of the vendor database behind every
 * recommendation. This is where lead time, MOQ, purchase multiplier and cost live (per
 * vendor, per SKU), so it is where "why is the suggested quantity 8 Carton and not 5?"
 * gets answered.
 *
 * Terms are edited by purchasing in the Vendors module, never here. The PREFERRED
 * vendor is a per-warehouse decision set on the product's Stock-by-warehouses tab
 * (D23), so this drawer only points there. Lead time is DERIVED, never typed (US-001 /
 * D5): it comes from the vendor's PO→goods-receipt history per warehouse, falling to
 * the category default, so the terms row shows the per-warehouse RANGE (D10).
 */
import { computed } from 'vue'
import { MpIcon, MpButton, MpTextlink, MpTooltip } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { vendorItemsForSku, vendorNameFor } from '~/data/vendorItems'
import { productBySku } from '~/data/inventory'
import { deriveLeadTime } from '~/data/leadTimeHistory'
import { getProductWarehouseStock } from '~/data/productDetails'
import { unitOptionsForSku, baseUnitFor } from '~/data/productUnits'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ isOpen: boolean; sku: string | null }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()

const { t, tf } = useLocale()
const router = useRouter()

const product = computed(() => (props.sku ? productBySku(props.sku) : undefined))
const unitOptions = computed(() => (props.sku ? unitOptionsForSku(props.sku) : []))
const baseUnit = computed(() => (props.sku ? baseUnitFor(props.sku) : ''))
const rows = computed(() => (props.sku && props.isOpen ? vendorItemsForSku(props.sku) : []))

function close() { emit('update:isOpen', false) }

/** The per-warehouse range of this vendor's lead time. */
function leadLabel(vendorId: string): string {
  if (!props.sku) return '—'
  const days = getProductWarehouseStock(props.sku)
    .map((s) => deriveLeadTime(vendorId, props.sku!, undefined, s.warehouseId).days)
    .filter((d): d is number => d != null)
  if (!days.length) {
    const d = deriveLeadTime(vendorId, props.sku).days
    return d != null ? `${d} days` : '—'
  }
  const min = Math.min(...days)
  const max = Math.max(...days)
  return min === max ? `${min} days` : `${min}–${max} days`
}

/** Advisory: a MOQ that is not a whole number of packs cannot be ordered as stated. */
function moqNote(moq: number, pack: number): string {
  if (!moq || !pack || Number.isNaN(moq) || Number.isNaN(pack)) return ''
  if (pack > 1 && moq % pack !== 0) return tf('MOQ is not a multiple of purchase multiplier {n}', { n: pack })
  return ''
}

/** What the MOQ amounts to in the unit the product is stocked in. */
function moqInStockUnits(moq: number, unitsPerPurchaseUnit: number): string {
  if (!moq || Number.isNaN(moq) || unitsPerPurchaseUnit <= 1) return ''
  return `= ${(moq * unitsPerPurchaseUnit).toLocaleString('id-ID')} ${product.value?.unit ?? ''}`
}

/** The cost per stocking unit — only worth a second line when it differs from the quoted cost. */
function costPerBase(unitCost: number, unitsPerPurchaseUnit: number): string {
  if (unitsPerPurchaseUnit <= 1) return ''
  return `${formatIDR(Math.round(unitCost / unitsPerPurchaseUnit))} / ${baseUnit.value}`
}

/** "Pack = 6 Bag, Carton = 12 Bag" — the larger units this product is bought in. */
const conversionsLabel = computed(() => unitOptions.value
  .filter((o) => !o.isBase)
  .map((o) => tf('1 {unit} = {n} {base}', { unit: o.name, n: o.factor, base: baseUnit.value }))
  .join(', '))

/** The note under the table, split around the link so only the tab name is clickable. */
const noteParts = computed(() =>
  tf('Vendor terms are read-only here. Set each warehouse\'s preferred vendor on the product\'s {tab}', { tab: '\u0000' }).split('\u0000'))

function goToWarehouseStock() {
  if (!props.sku) return
  close()
  router.push(`/product-list/${props.sku}?section=warehouses`)
}
</script>

<template>
  <Teleport to="body">
  <Transition name="rp-vi">
    <div v-if="isOpen && sku" class="rp-vi-overlay">
      <div class="rp-vi-panel" role="dialog" :aria-label="t('Vendors')">
        <header class="rp-vi-header">
          <span class="rp-vi-title">{{ t('Vendors') }}</span>
          <MpButton class="rp-vi-close" is-rounded :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="rp-vi-body">
          <!-- Identity: labelled fields, not a "stocked in" fragment (docs/patterns/ContentList.md). -->
          <div class="rp-vi-identity">
            <ContentList :label="t('Product')" :value="product?.name ?? sku ?? ''" />
            <ContentList :label="t('SKU')" :value="sku ?? ''" />
            <ContentList :label="t('Base unit')" :value="baseUnit" />
            <ContentList :label="t('Unit conversions')" :value="conversionsLabel" />
          </div>

          <p v-if="!rows.length" class="rp-vi-empty">
            {{ t('No vendor supplies this product yet, so it cannot be ordered. Add one in the Vendors module.') }}
          </p>

          <!-- A mini-table inside a drawer is a contained object: outer border in
               border-bold, default-weight inner dividers (rule/table-outer-border-bold). -->
          <div v-if="rows.length" class="rp-vi-table-wrap">
            <table class="rp-vi-table">
              <thead>
                <tr>
                  <th class="rp-vi-th rp-vi-th--vendor">{{ t('Vendor') }}</th>
                  <th class="rp-vi-th rp-vi-th--num">
                    <span class="rp-vi-th-info">
                      {{ t('Lead time') }}
                      <MpTooltip
                        id="rp-vi-lead-tip"
                        :label="t('The range across warehouses. Each warehouse\'s own lead time is on the product\'s Stock by warehouses tab.')"
                        placement="top" use-portal
                      >
                        <span class="rp-vi-th-icon"><MpIcon name="info" size="sm" /></span>
                      </MpTooltip>
                    </span>
                  </th>
                  <th class="rp-vi-th rp-vi-th--num">{{ t('MOQ') }}</th>
                  <th class="rp-vi-th">{{ t('MOQ unit') }}</th>
                  <th class="rp-vi-th rp-vi-th--num">{{ t('Purchase multiplier') }}</th>
                  <th class="rp-vi-th rp-vi-th--num">{{ t('Unit cost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td class="rp-vi-td"><span class="rp-vi-vendor">{{ vendorNameFor(row.vendorId) }}</span></td>
                  <td class="rp-vi-td rp-vi-td--num"><span class="rp-vi-ro">{{ leadLabel(row.vendorId) }}</span></td>
                  <td class="rp-vi-td rp-vi-td--num">
                    <span class="rp-vi-ro">{{ row.moq }}</span>
                    <span v-if="moqNote(row.moq, row.packSize)" class="rp-vi-cell-sub rp-vi-cell-sub--warning">{{ moqNote(row.moq, row.packSize) }}</span>
                  </td>
                  <td class="rp-vi-td">
                    <span class="rp-vi-ro">{{ row.purchaseUnit }}</span>
                    <span class="rp-vi-cell-sub">{{ moqInStockUnits(row.moq, row.unitsPerPurchaseUnit) || t('base unit') }}</span>
                  </td>
                  <td class="rp-vi-td rp-vi-td--num"><span class="rp-vi-ro">{{ row.packSize }}</span></td>
                  <td class="rp-vi-td rp-vi-td--num">
                    <span class="rp-vi-ro">{{ formatIDR(row.unitCost || 0) }}</span>
                    <span v-if="costPerBase(row.unitCost, row.unitsPerPurchaseUnit)" class="rp-vi-cell-sub">{{ costPerBase(row.unitCost, row.unitsPerPurchaseUnit) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- The preferred vendor is a per-warehouse decision (D23); point at where it is set. -->
          <p v-if="rows.length" class="rp-vi-hint" data-devchange="vendors-drawer-readonly-preferred">
            {{ noteParts[0] }}<MpTextlink id="rp-vi-warehouses-link" as="a" class="rp-vi-link" @click.prevent="goToWarehouseStock">{{ t('Stock by warehouses tab') }}</MpTextlink>{{ noteParts[1] }}
          </p>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<style scoped>
.rp-vi-enter-active, .rp-vi-leave-active { transition: background-color 250ms ease; }
.rp-vi-enter-from, .rp-vi-leave-to { background-color: transparent; }
.rp-vi-enter-active .rp-vi-panel { transition: transform 350ms ease-out; }
.rp-vi-leave-active .rp-vi-panel { transition: transform 250ms ease-in; }
.rp-vi-enter-from .rp-vi-panel, .rp-vi-leave-to .rp-vi-panel { transform: translateX(calc(100% + 12px)); }

.rp-vi-overlay {
  position: fixed; inset: 0; z-index: 1360;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.rp-vi-panel {
  margin: var(--mp-spacing-3);
  /* Wide enough for the six columns without a horizontal scrollbar. */
  width: min(880px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.rp-vi-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-vi-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-vi-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.rp-vi-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.rp-vi-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
/* Four fields on one row; the product name gets the most room. */
.rp-vi-identity {
  display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 0.6fr) minmax(0, 0.7fr) minmax(0, 1.6fr);
  column-gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3);
}
.rp-vi-empty {
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

.rp-vi-table-wrap {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  overflow-x: auto;
}
.rp-vi-table { width: 100%; border-collapse: collapse; }
.rp-vi-table tbody tr:last-child .rp-vi-td { border-bottom: none; }
.rp-vi-th:first-child, .rp-vi-td:first-child { padding-left: var(--mp-spacing-4); }
.rp-vi-th:last-child, .rp-vi-td:last-child { padding-right: var(--mp-spacing-4); }
.rp-vi-th--vendor { min-width: var(--mp-sizes-52, 208px); }
.rp-vi-th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  background: var(--mp-background-neutral-subtle);
  white-space: nowrap;
}
.rp-vi-th--num { text-align: right; }
.rp-vi-th-info { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.rp-vi-th-icon { display: inline-flex; color: var(--mp-icon-subdued, #9ca3af); cursor: help; }
.rp-vi-th-icon:hover { color: var(--mp-icon-default, #4b5563); }
.rp-vi-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default, #e3e7e9));
  vertical-align: top;
}
.rp-vi-td--num { text-align: right; }
.rp-vi-vendor { display: block; white-space: nowrap; }
.rp-vi-cell-sub {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap;
}
.rp-vi-cell-sub--warning { color: var(--mp-colors-text-warning); }
.rp-vi-ro { font-variant-numeric: tabular-nums; color: var(--mp-text-default); white-space: nowrap; }

.rp-vi-hint {
  margin-top: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
/* MpTextlink pins 14px with a layered !important; scaled to the 12px caption it sits in. */
.rp-vi-link { display: inline-flex; zoom: calc(12 / 14); }
</style>
