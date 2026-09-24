<script lang="ts">
/**
 * Vendor terms for ONE product — the vendor database behind every recommendation.
 *
 * This is where lead time, MOQ, pack size and cost actually live (per vendor, per
 * SKU), so it is also where "why is the suggested quantity 8 Carton and not 5?"
 * ultimately gets answered.
 */
export interface VendorItemDraft {
  id: string
  vendorId: string
  leadTimeDays: string
  moq: string
  packSize: string
  unitCost: string
  /** The unit MOQ and pack size are quoted in — the base unit or a registered
   *  multi-unit from the product's unit conversions. */
  purchaseUnit: string
  /** Base units per 1 purchaseUnit. Always derived from the product's conversion
   *  table, never typed, so a unit can't be pinned to a disagreeing factor. */
  unitsPerPurchaseUnit: number
  isPreferred: boolean
  /** Rows added in this session, so Cancel can simply drop them. */
  isNew: boolean
}
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast, MpIcon, MpInput, MpSelect, css } from '@mekari/pixel3'
import {
  vendorItemsForSku, upsertVendorItem, setPreferredVendor, deactivateVendorItem,
} from '~/data/vendorItems'
import { recommendPreferredVendor } from '~/data/vendorRecommendation'
import { vendors } from '~/data/vendors'
import { productBySku } from '~/data/inventory'
import { deriveLeadTime } from '~/data/leadTimeHistory'
import { getProductWarehouseStock } from '~/data/productDetails'
import { unitOptionsForSku, factorFor, baseUnitFor } from '~/data/productUnits'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ isOpen: boolean; sku: string | null }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved'): void
}>()

const { t } = useLocale()

const rows = ref<VendorItemDraft[]>([])
const removed = ref<string[]>([])
const error = ref('')

const product = computed(() => (props.sku ? productBySku(props.sku) : undefined))

/**
 * Units a MOQ can be quoted in: the product's base unit plus every multi-unit
 * registered on its Unit conversions tab. This is why the two features are wired
 * together — register "1 Pack = 12 Bag" there and it becomes selectable here.
 */
const unitOptions = computed(() => (props.sku ? unitOptionsForSku(props.sku) : []))
const baseUnit = computed(() => (props.sku ? baseUnitFor(props.sku) : ''))

/** Vendors not already linked to this SKU — the only ones worth offering. */
const addableVendors = computed(() => {
  const taken = new Set(rows.value.map((r) => r.vendorId))
  return vendors.filter((v) => !taken.has(v.id))
})

// ── Airene: preferred-vendor recommendation ───────────────────────────────────
// The list of vendors here grows on its own as purchases are made, so with more
// than one linked vendor the buyer can be unsure which to prefer. Airene scores
// them on lead time, price, MOQ and purchase history and names one, live off the
// current (possibly edited-but-unsaved) terms.
/**
 * Lead time is DERIVED, never typed (US-001 / D5): it comes from this vendor's
 * PO→goods-receipt history per warehouse, falling to the category default. So it
 * is shown read-only here as the per-warehouse range, and the recommendation
 * scores vendors on that derived figure — not on an editable field.
 */
function derivedLeadDays(vendorId: string): number {
  if (!props.sku) return 0
  return deriveLeadTime(vendorId, props.sku).days ?? 0
}
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

const showReasons = ref(false)
const recommendation = computed(() => {
  if (!props.sku || rows.value.length < 2) return null
  return recommendPreferredVendor(props.sku, rows.value.map((r) => ({
    vendorId: r.vendorId,
    leadTimeDays: derivedLeadDays(r.vendorId),
    moq: Number(r.moq) || 0,
    unitCost: Number(r.unitCost) || 0,
    unitsPerPurchaseUnit: r.unitsPerPurchaseUnit,
  })))
})
const recommendedRow = computed(() => recommendation.value?.scores.find((s) => s.isRecommended) ?? null)
const recommendedIsDefault = computed(() => {
  const id = recommendation.value?.recommendedVendorId
  return !!id && rows.value.some((r) => r.vendorId === id && r.isPreferred)
})
function applyRecommendation() {
  const id = recommendation.value?.recommendedVendorId
  if (!id) return
  const i = rows.value.findIndex((r) => r.vendorId === id)
  if (i >= 0) makeDefault(i)
}

function load() {
  if (!props.sku) return
  rows.value = vendorItemsForSku(props.sku).map((v) => ({
    id: v.id,
    vendorId: v.vendorId,
    leadTimeDays: String(v.leadTimeDays),
    moq: String(v.moq),
    packSize: String(v.packSize),
    unitCost: String(v.unitCost),
    purchaseUnit: v.purchaseUnit,
    unitsPerPurchaseUnit: v.unitsPerPurchaseUnit,
    isPreferred: v.isPreferred,
    isNew: false,
  }))
  removed.value = []
  error.value = ''
  showReasons.value = false
}
watch(() => props.isOpen, (open) => { if (open) load() })

function close() { emit('update:isOpen', false) }

function addRow() {
  const vendor = addableVendors.value[0]
  if (!vendor) {
    error.value = t('Every vendor is already linked to this product.')
    return
  }
  // A brand-new link inherits the category's purchase UoM from an existing row so
  // the units stay coherent; with no rows yet, upsertVendorItem fills them in.
  const template = rows.value[0]
  rows.value.push({
    id: `vi-${vendor.id}-${props.sku}`,
    vendorId: vendor.id,
    leadTimeDays: template?.leadTimeDays ?? '14',
    moq: template?.moq ?? '1',
    packSize: template?.packSize ?? '1',
    unitCost: template?.unitCost ?? '0',
    purchaseUnit: template?.purchaseUnit ?? (product.value?.unit ?? 'Unit'),
    unitsPerPurchaseUnit: template?.unitsPerPurchaseUnit ?? 1,
    isPreferred: rows.value.length === 0,
    isNew: true,
  })
  error.value = ''
}

function removeRow(index: number) {
  const row = rows.value[index]
  if (!row) return
  if (!row.isNew) removed.value.push(row.vendorId)
  rows.value.splice(index, 1)
  // Never leave the product without a default while it still has vendors.
  if (rows.value.length && !rows.value.some((r) => r.isPreferred)) rows.value[0]!.isPreferred = true
}

function makeDefault(index: number) {
  rows.value.forEach((r, i) => { r.isPreferred = i === index })
}

function onUnitChange(index: number, unitName: string) {
  const row = rows.value[index]
  if (!row || !props.sku) return
  row.purchaseUnit = unitName
  // The factor always comes from the product's conversion table, so "4 Pallet"
  // can never end up meaning something the product does not agree with.
  row.unitsPerPurchaseUnit = factorFor(props.sku, unitName)
}

function onVendorChange(index: number, vendorId: string) {
  const row = rows.value[index]
  if (!row) return
  row.vendorId = vendorId
  row.id = `vi-${vendorId}-${props.sku}`
}

/** Advisory, not blocking: MOQ that is not a whole number of packs cannot be
 *  ordered as stated, and it breaks the rounding equivalence the engine relies on. */
function moqNote(row: VendorItemDraft): string {
  const moq = Number(row.moq)
  const pack = Number(row.packSize)
  if (!moq || !pack || Number.isNaN(moq) || Number.isNaN(pack)) return ''
  if (pack > 1 && moq % pack !== 0) return `${t('Not a whole number of packs of')} ${pack}`
  return ''
}

/** What the MOQ actually amounts to in the unit the product is stocked in — a
 *  pallet MOQ is meaningless without it. */
function moqInStockUnits(row: VendorItemDraft): string {
  const moq = Number(row.moq)
  if (!moq || Number.isNaN(moq)) return ''
  if (row.unitsPerPurchaseUnit <= 1) return ''
  return `= ${(moq * row.unitsPerPurchaseUnit).toLocaleString('id-ID')} ${product.value?.unit ?? ''}`
}

function save() {
  if (!props.sku) return

  // Validate on click and show an inline error — never a disabled button (DESIGN.md).
  const seen = new Set<string>()
  for (const row of rows.value) {
    if (!row.vendorId) { error.value = t('You must select a vendor for every row'); return }
    if (seen.has(row.vendorId)) {
      error.value = t('Each vendor can only be listed once for a product')
      return
    }
    seen.add(row.vendorId)

    if (!unitOptions.value.some((o) => o.name === row.purchaseUnit)) {
      error.value = `${row.purchaseUnit} is no longer a unit of this product — pick another`
      return
    }

    for (const [label, raw, min] of [
      [t('Lead time'), row.leadTimeDays, 0],
      [t('MOQ'), row.moq, 1],
      [t('Pack size'), row.packSize, 1],
      [t('Unit cost'), row.unitCost, 0],
    ] as const) {
      const n = Number(raw)
      if (raw === '' || Number.isNaN(n) || n < min) {
        error.value = `${label} ${t('must be')} ${min} ${t('or more')}`
        return
      }
    }
  }
  if (rows.value.length && !rows.value.some((r) => r.isPreferred)) {
    error.value = t('You must set one default vendor')
    return
  }

  for (const vendorId of removed.value) deactivateVendorItem(props.sku, vendorId)
  for (const row of rows.value) {
    upsertVendorItem({
      sku: props.sku,
      vendorId: row.vendorId,
      leadTimeDays: Number(row.leadTimeDays),
      moq: Number(row.moq),
      packSize: Number(row.packSize),
      unitCost: Number(row.unitCost),
      purchaseUnit: row.purchaseUnit,
      unitsPerPurchaseUnit: row.unitsPerPurchaseUnit,
      active: true,
    })
  }
  // Applied after the upserts, so the flag lands on a row that definitely exists.
  const preferred = rows.value.find((r) => r.isPreferred)
  if (preferred) setPreferredVendor(props.sku, preferred.vendorId)

  emit('saved')
  close()
  toast.notify({ variant: 'success', title: t('Vendor terms saved.'), maxWidth: 'max-content' })
}
</script>

<template>
  <Transition name="rp-vi">
    <div v-if="isOpen && sku" class="rp-vi-overlay" @click.self="close">
      <div class="rp-vi-panel" role="dialog" :aria-label="t('Vendors')">
        <header class="rp-vi-header">
          <span class="rp-vi-title">{{ t('Vendors') }}</span>
          <button class="rp-vi-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="rp-vi-body">
          <div class="rp-vi-identity">
            <p class="rp-vi-product">{{ product?.name ?? sku }}</p>
            <p class="rp-vi-sub">
              {{ sku }}
              <template v-if="product"> · {{ t('stocked in') }} {{ product.unit }}</template>
            </p>
          </div>

          <p v-if="!rows.length" class="rp-vi-empty">
            {{ t('No vendor supplies this product yet, so it cannot be ordered. Add one to include it in the worklist.') }}
          </p>

          <!-- Airene preferred-vendor recommendation — only with something to choose between. -->
          <div v-if="recommendation && recommendedRow" class="rp-vi-ai">
            <div class="rp-vi-ai-head">
              <MpIcon name="airene-brand" size="sm" class="rp-vi-ai-icon" />
              <span class="rp-vi-ai-text">
                {{ t('Airene recommends') }}
                <strong>{{ recommendedRow.vendorName }}</strong>
                {{ t('as the preferred vendor') }}
              </span>
              <button type="button" class="rp-vi-ai-why" @click="showReasons = !showReasons">
                {{ showReasons ? t('Hide') : t('Why?') }}
              </button>
              <button
                v-if="!recommendedIsDefault"
                type="button"
                class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                @click="applyRecommendation"
              >{{ t('Set as preferred') }}</button>
            </div>
            <ul v-if="showReasons" class="rp-vi-ai-reasons">
              <li v-for="reason in recommendedRow.reasons" :key="reason">{{ reason }}</li>
              <li class="rp-vi-ai-weights">
                {{ t('Weighed lead time, price, minimum order and purchase history.') }}
              </li>
            </ul>
          </div>

          <table v-if="rows.length" class="rp-vi-table">
            <thead>
              <tr>
                <th class="rp-vi-th">{{ t('Vendor') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('Lead time') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('MOQ') }}</th>
                <th class="rp-vi-th">{{ t('MOQ unit') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('Pack size') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('Unit cost') }}</th>
                <th class="rp-vi-th rp-vi-th--center">{{ t('Default') }}</th>
                <th class="rp-vi-th" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="row.id">
                <td class="rp-vi-td">
                  <MpSelect
                    v-if="row.isNew"
                    :id="`rp-vi-vendor-${i}`"
                    :model-value="row.vendorId"
                    :class="css({ width: '100%' })"
                    @update:model-value="(v: string) => onVendorChange(i, v)"
                  >
                    <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
                  </MpSelect>
                  <template v-else>
                    <span class="rp-vi-vendor">{{ vendors.find(v => v.id === row.vendorId)?.name ?? row.vendorId }}</span>
                    <span
                      v-if="recommendation && row.vendorId === recommendation.recommendedVendorId"
                      class="rp-vi-ai-chip"
                      :title="t('Airene\'s recommended preferred vendor')"
                    >
                      <MpIcon name="airene-brand" size="sm" /> {{ t('AI pick') }}
                    </span>
                  </template>
                </td>
                <td class="rp-vi-td rp-vi-td--num">
                  <span class="rp-vi-lead-ro">{{ leadLabel(row.vendorId) }}</span>
                  <span class="rp-vi-cell-sub">{{ t('measured per warehouse') }}</span>
                </td>
                <td class="rp-vi-td rp-vi-td--num">
                  <MpInput :id="`rp-vi-moq-${i}`" v-model="row.moq" type="number" :class="css({ width: '68px' })" />
                  <span v-if="moqNote(row)" class="rp-vi-cell-sub rp-vi-cell-sub--warning">{{ moqNote(row) }}</span>
                </td>
                <!-- Quote the minimum in the base unit or in any multi-unit the
                     product has registered. Picking one re-derives the conversion,
                     so the "= N base" reading below always tells the truth. -->
                <td class="rp-vi-td">
                  <MpSelect
                    :id="`rp-vi-unit-${i}`"
                    :model-value="row.purchaseUnit"
                    :class="css({ width: '112px' })"
                    @update:model-value="(v: string) => onUnitChange(i, v)"
                  >
                    <option v-for="o in unitOptions" :key="o.name" :value="o.name">{{ o.name }}</option>
                  </MpSelect>
                  <span v-if="moqInStockUnits(row)" class="rp-vi-cell-sub">{{ moqInStockUnits(row) }}</span>
                  <span v-else class="rp-vi-cell-sub">{{ t('base unit') }}</span>
                </td>
                <td class="rp-vi-td rp-vi-td--num">
                  <MpInput :id="`rp-vi-pack-${i}`" v-model="row.packSize" type="number" :class="css({ width: '68px' })" />
                </td>
                <td class="rp-vi-td rp-vi-td--num">
                  <MpInput :id="`rp-vi-cost-${i}`" v-model="row.unitCost" type="number" :class="css({ width: '124px' })" />
                  <span class="rp-vi-cell-sub">{{ formatIDR(Number(row.unitCost) || 0) }} / {{ row.purchaseUnit }}</span>
                </td>
                <td class="rp-vi-td rp-vi-td--center">
                  <input
                    :id="`rp-vi-default-${i}`"
                    class="rp-vi-radio"
                    type="radio"
                    :name="`rp-vi-default-${sku}`"
                    :checked="row.isPreferred"
                    :aria-label="t('Default')"
                    @change="makeDefault(i)"
                  />
                </td>
                <td class="rp-vi-td rp-vi-td--center">
                  <button class="rp-vi-remove" type="button" :aria-label="t('Remove')" @click="removeRow(i)">
                    <MpIcon name="minus-circular" size="md" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <button class="rp-vi-add" type="button" @click="addRow">+ {{ t('Vendor') }}</button>

          <p class="rp-vi-hint">
            {{ t('MOQ and pack size are quoted in the MOQ unit. The suggested quantity is raised to MOQ, then rounded up to a whole pack.') }}
          </p>
          <p class="rp-vi-hint">
            {{ t('Unit options come from this product\'s unit conversions — base unit') }}
            <strong>{{ baseUnit }}</strong>{{ unitOptions.length > 1 ? ', ' : '' }}
            <template v-if="unitOptions.length > 1">
              {{ unitOptions.filter(o => !o.isBase).map(o => `${o.name} = ${o.factor} ${baseUnit}`).join(', ') }}
            </template>
            <template v-else>{{ t('· no multi-units registered yet') }}</template>
          </p>
        </div>

        <footer class="rp-vi-footer">
          <span v-if="error" class="rp-vi-error">{{ error }}</span>
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save changes') }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rp-vi-enter-active, .rp-vi-leave-active { transition: background-color 250ms ease; }
.rp-vi-enter-from, .rp-vi-leave-to { background-color: transparent; }
.rp-vi-enter-active .rp-vi-panel { transition: transform 350ms ease-out; }
.rp-vi-leave-active .rp-vi-panel { transition: transform 250ms ease-in; }
.rp-vi-enter-from .rp-vi-panel, .rp-vi-leave-to .rp-vi-panel { transform: translateX(calc(100% + 12px)); }

.rp-vi-overlay {
  position: fixed; inset: 0; z-index: 1360;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.rp-vi-panel {
  margin: var(--mp-spacing-3);
  width: min(760px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.rp-vi-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-vi-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-vi-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.rp-vi-close:hover { background: var(--mp-background-neutral-hovered); }

.rp-vi-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.rp-vi-identity { margin-bottom: var(--mp-spacing-4); }
.rp-vi-product {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rp-vi-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-vi-empty {
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* ── Airene recommendation ── */
.rp-vi-ai {
  margin-bottom: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-info, #b9d6ff);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-info-subtle, #f0f6ff);
  padding: var(--mp-spacing-3);
}
.rp-vi-ai-head { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.rp-vi-ai-icon { color: var(--mp-icon-info, #2d6cdf); flex-shrink: 0; }
.rp-vi-ai-text { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.rp-vi-ai-why {
  border: none; background: none; cursor: pointer; padding: 0;
  color: var(--mp-text-link); font-size: var(--mp-font-sizes-sm);
}
.rp-vi-ai-why:hover { text-decoration: underline; }
.rp-vi-ai-head .btn-enterprise { margin-left: auto; }
.rp-vi-ai-reasons {
  margin: var(--mp-spacing-2) 0 0; padding-left: var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-vi-ai-reasons li { margin-top: 2px; }
.rp-vi-ai-weights { color: var(--mp-text-tertiary, var(--mp-text-secondary)); }
.rp-vi-ai-chip {
  display: inline-flex; align-items: center; gap: 2px; margin-left: var(--mp-spacing-2);
  padding: 0 var(--mp-spacing-1\.5, 6px); height: 20px;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-info-subtle, #f0f6ff);
  color: var(--mp-text-info, #2d6cdf);
  font-size: var(--mp-font-sizes-xs, 12px); font-weight: var(--mp-font-weights-medium, 500);
  white-space: nowrap; vertical-align: middle;
}
.rp-vi-ai-chip :deep(svg) { width: 12px; height: 12px; }

.rp-vi-table { width: 100%; border-collapse: collapse; }
.rp-vi-th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.rp-vi-th--num { text-align: right; }
.rp-vi-th--center { text-align: center; }
.rp-vi-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  vertical-align: top;
}
.rp-vi-td--num { text-align: right; }
.rp-vi-td--center { text-align: center; }
.rp-vi-vendor { display: block; }
.rp-vi-vendor-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-vi-cell-sub {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap;
}
.rp-vi-cell-sub--warning { color: var(--mp-text-warning); }
.rp-vi-lead-ro { font-variant-numeric: tabular-nums; color: var(--mp-text-default); white-space: nowrap; }
.rp-vi-radio { width: 16px; height: 16px; cursor: pointer; accent-color: var(--mp-background-brand, #04846c); }
.rp-vi-remove {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.rp-vi-remove:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-danger); }

.rp-vi-add {
  margin-top: var(--mp-spacing-3);
  border: none; background: none; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer;
}
.rp-vi-hint {
  margin-top: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

.rp-vi-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.rp-vi-error { flex: 1; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
</style>
