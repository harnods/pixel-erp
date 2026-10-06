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
import { toast, MpIcon, MpButton, MpButtonGroup, MpTextlink, MpInput, MpRadio, css } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  vendorItemsForSku, upsertVendorItem, setPreferredVendor, deactivateVendorItem, vendorNameFor,
  preferredVendorIdForWarehouse,
} from '~/data/vendorItems'
import { recommendPreferredVendor, type VendorReasonKind } from '~/data/vendorRecommendation'
import { vendors } from '~/data/vendors'
import { productBySku } from '~/data/inventory'
import { deriveLeadTime, isEstimatedTier, leadTimeTierLabel } from '~/data/leadTimeHistory'
import { getProductWarehouseStock } from '~/data/productDetails'
import { unitOptionsForSku, factorFor, baseUnitFor } from '~/data/productUnits'
import { formatIDR } from '~/utils/currency'

/**
 * `readonly` — vendor TERMS (lead time, MOQ, purchase multiplier, cost) show as
 * text, with no inputs and no add/remove: those are edited by purchasing in the
 * Vendors module. The one thing that stays editable is WHICH vendor is preferred —
 * a radio per row, saved with "Save changes", which persists only that flag. Every
 * current caller (worklist, Needs setup, product detail) opens it this way.
 *
 * `warehouseId` — the preferred vendor is per SKU × warehouse (D23). Opened from a
 * worklist row the warehouse is known and pre-selected; from the product page it is
 * not, so a warehouse selector lets the user choose which warehouse they are setting.
 */
const props = defineProps<{ isOpen: boolean; sku: string | null; readonly?: boolean; warehouseId?: string }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved'): void
}>()

const { t, tf } = useLocale()

const rows = ref<VendorItemDraft[]>([])
const removed = ref<string[]>([])
const error = ref('')

// ── Per-warehouse preferred vendor (D23) ──
// The warehouses this SKU is stocked in — the scope the preferred vendor is chosen
// per. `selectedWarehouse` is the one being edited; `chosen` holds unsaved picks
// keyed by warehouse id.
const warehouseOptions = computed(() =>
  props.sku ? getProductWarehouseStock(props.sku).map((s) => ({ value: s.warehouseId, label: s.warehouseName })) : [],
)
const selectedWarehouse = ref('')
const chosen = ref<Record<string, string>>({})

/** The SKU-level default preferred vendor id (fallback when a warehouse has no pick). */
const skuDefaultVendorId = computed(() => rows.value.find((r) => r.isPreferred)?.vendorId ?? rows.value[0]?.vendorId ?? null)

/** The effective preferred vendor for a warehouse: unsaved pick → stored per-warehouse → SKU default. */
function preferredForWarehouse(wh: string): string | null {
  if (!props.sku || !wh) return skuDefaultVendorId.value
  return chosen.value[wh] ?? preferredVendorIdForWarehouse(props.sku, wh) ?? skuDefaultVendorId.value
}

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
 * PO→goods-receipt history per warehouse, falling to the category default. The
 * drawer is scoped to one selected warehouse (that is the grain a preferred vendor
 * is chosen at — D10/D23), so lead time shows that warehouse's single figure, not
 * a cross-warehouse range. The recommendation scores vendors on the derived figure.
 */
function derivedLeadDays(vendorId: string): number {
  if (!props.sku) return 0
  const wh = selectedWarehouse.value
  return (wh ? deriveLeadTime(vendorId, props.sku, undefined, wh) : deriveLeadTime(vendorId, props.sku)).days ?? 0
}
function leadLabel(vendorId: string): string {
  if (!props.sku) return '—'
  const wh = selectedWarehouse.value
  const d = wh ? deriveLeadTime(vendorId, props.sku, undefined, wh) : deriveLeadTime(vendorId, props.sku)
  return d.days != null ? `${d.days} days` : '—'
}
/** The basis behind the number for the selected warehouse — measured vs estimated. */
function leadSub(vendorId: string): string {
  if (!props.sku || !selectedWarehouse.value) return ''
  const d = deriveLeadTime(vendorId, props.sku, undefined, selectedWarehouse.value)
  if (d.days == null) return ''
  return leadTimeTierLabel(d.tier, d.sampleSize)
}

const showReasons = ref(false)
/** The headline split around the vendor name, so the name alone can be bold. */
const aiHead = computed(() => tf('Airene recommends {vendor} as the preferred vendor', { vendor: '\u0000' }).split('\u0000'))

function reasonText(kind: VendorReasonKind): string {
  const r = recommendedRow.value
  if (!r) return ''
  switch (kind) {
    case 'lead': return tf('Fastest lead time: {n} days', { n: r.leadTimeDays })
    case 'price': return tf('Lowest price: {price} per unit', { price: formatIDR(Math.round(r.costPerBase)) })
    case 'moq': return tf('Lowest MOQ: {n} units', { n: r.moqInBase.toLocaleString('id-ID') })
    case 'history': return tf('Most delivered orders: {n}', { n: r.purchases })
    default: return t('Best overall balance of lead time, price and MOQ')
  }
}
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
  initialPreferred.value = rows.value.find((r) => r.isPreferred)?.vendorId ?? null
  // Per-warehouse preferred (D23): pre-select the warehouse the drawer was opened
  // from, else the first the SKU is stocked in; drop any unsaved picks.
  chosen.value = {}
  const opts = warehouseOptions.value
  selectedWarehouse.value = (props.warehouseId && opts.some((o) => o.value === props.warehouseId))
    ? props.warehouseId
    : (opts[0]?.value ?? '')
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

/** Pick the preferred vendor for the SELECTED warehouse (D23) — a local edit until save. */
function makeDefault(index: number) {
  const row = rows.value[index]
  if (!row || !selectedWarehouse.value) return
  chosen.value = { ...chosen.value, [selectedWarehouse.value]: row.vendorId }
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
  if (pack > 1 && moq % pack !== 0) return tf('MOQ is not a multiple of purchase multiplier {n}', { n: pack })
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
      [t('Purchase multiplier'), row.packSize, 1],
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
  toast.notify({ variant: 'success', title: t('Vendor terms saved'), maxWidth: 'max-content' })
}

/**
 * Read-only mode still lets a stockist pick the preferred vendor — that choice is
 * theirs, not a purchasing term. This persists ONLY the preferred flag, never the
 * (read-only) terms. Saving with nothing changed just closes.
 */
const initialPreferred = ref<string | null>(null)
function savePreferred() {
  if (!props.sku) return
  // Persist every warehouse whose preferred vendor was changed (D23).
  let changed = 0
  for (const [wh, vendorId] of Object.entries(chosen.value)) {
    const stored = preferredVendorIdForWarehouse(props.sku, wh) ?? skuDefaultVendorId.value
    if (vendorId !== stored) { setPreferredVendor(props.sku, vendorId, wh); changed++ }
  }
  if (changed) {
    emit('saved')
    toast.notify({ variant: 'success', title: t('Preferred vendor saved'), maxWidth: 'max-content' })
  }
  close()
}

/** "Pack = 6 Bag, Carton = 12 Bag" — the larger units this product is bought in. */
const conversionsLabel = computed(() => unitOptions.value
  .filter((o) => !o.isBase)
  .map((o) => tf('1 {unit} = {n} {base}', { unit: o.name, n: o.factor, base: baseUnit.value }))
  .join(', '))
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
            <template v-if="readonly">
              {{ t('No vendor supplies this product yet, so it cannot be ordered. Add one in the Vendors module.') }}
            </template>
            <template v-else>
              {{ t('No vendor supplies this product yet, so it cannot be ordered. Add one to include it in the worklist.') }}
            </template>
          </p>

          <!-- Airene preferred-vendor recommendation — only with something to choose between. -->
          <div v-if="recommendation && recommendedRow" class="rp-vi-ai" data-devchange="vendors-airene-recommendation">
            <div class="rp-vi-ai-head">
              <MpIcon name="airene-brand" size="sm" class="rp-vi-ai-icon" />
              <!-- One translated sentence; only the vendor name is emphasised. -->
              <span class="rp-vi-ai-text">{{ aiHead[0] }}<strong>{{ recommendedRow.vendorName }}</strong>{{ aiHead[1] }}</span>
              <MpTextlink id="rp-vi-ai-why" as="a" @click.prevent="showReasons = !showReasons">
                {{ showReasons ? t('Hide reasons') : t('View reasons') }}
              </MpTextlink>
            </div>
            <template v-if="showReasons">
              <ul class="rp-vi-ai-reasons">
                <li v-for="kind in recommendedRow.reasonKinds" :key="kind">{{ reasonText(kind) }}</li>
              </ul>
              <p class="rp-vi-ai-note">{{ t('Based on lead time, price, MOQ and purchase history.') }}</p>
            </template>
          </div>

          <!-- Preferred vendor is per warehouse (D23): pick the warehouse, then the
               preferred vendor below applies to it. -->
          <div v-if="rows.length && warehouseOptions.length" class="rp-vi-wh" data-devchange="vendors-preferred-per-warehouse">
            <span class="rp-vi-wh-label">{{ t('Preferred vendor for') }}</span>
            <ErpFilterSelect
              id="rp-vi-wh"
              :model-value="selectedWarehouse"
              :placeholder="t('Warehouse')"
              :options="warehouseOptions"
              width="240px"
              :is-clearable="false"
              @update:model-value="(v: string) => (selectedWarehouse = v)"
            />
            <span class="rp-vi-wh-hint">{{ t('A product can have a different preferred vendor in each warehouse.') }}</span>
          </div>

          <!-- A mini-table inside a drawer is a contained object: outer border in
               border-bold, default-weight inner dividers (rule/table-outer-border-bold). -->
          <div v-if="rows.length" class="rp-vi-table-wrap">
          <table class="rp-vi-table">
            <thead>
              <tr>
                <th class="rp-vi-th rp-vi-th--vendor">{{ t('Vendor') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('Lead time') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('MOQ') }}</th>
                <th class="rp-vi-th">{{ t('MOQ unit') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('Purchase multiplier') }}</th>
                <th class="rp-vi-th rp-vi-th--num">{{ t('Unit cost') }}</th>
                <th class="rp-vi-th rp-vi-th--center">{{ t('Preferred') }}</th>
                <th v-if="!readonly" class="rp-vi-th" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="row.id">
                <td class="rp-vi-td">
                  <!-- rule/select-erpfilterselect: an MpPopover menu, not the OS dropdown. -->
                  <ErpFilterSelect
                    v-if="row.isNew"
                    :id="`rp-vi-vendor-${i}`"
                    :model-value="row.vendorId"
                    :placeholder="t('Vendor')"
                    :options="vendors.map(v => ({ value: v.id, label: v.name }))"
                    width="100%"
                    :is-clearable="false"
                    @update:model-value="(v: string) => onVendorChange(i, v)"
                  />
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
                <td class="rp-vi-td rp-vi-td--num" data-devchange="vendors-drawer-lead-per-warehouse">
                  <span class="rp-vi-lead-ro">{{ leadLabel(row.vendorId) }}</span>
                  <span v-if="leadSub(row.vendorId)" class="rp-vi-cell-sub">{{ leadSub(row.vendorId) }}</span>
                </td>
                <td class="rp-vi-td rp-vi-td--num">
                  <MpInput v-if="!readonly" :id="`rp-vi-moq-${i}`" v-model="row.moq" type="number" :class="css({ width: '68px' })" />
                  <span v-else class="rp-vi-lead-ro">{{ row.moq }}</span>
                  <span v-if="moqNote(row)" class="rp-vi-cell-sub rp-vi-cell-sub--warning">{{ moqNote(row) }}</span>
                </td>
                <!-- Quote the minimum in the base unit or in any multi-unit the
                     product has registered. Picking one re-derives the conversion,
                     so the "= N base" reading below always tells the truth. -->
                <td class="rp-vi-td">
                  <ErpFilterSelect
                    v-if="!readonly"
                    :id="`rp-vi-unit-${i}`"
                    :model-value="row.purchaseUnit"
                    :placeholder="t('MOQ unit')"
                    :options="unitOptions.map(o => o.name)"
                    width="112px"
                    :is-clearable="false"
                    @update:model-value="(v: string) => onUnitChange(i, v)"
                  />
                  <span v-else class="rp-vi-lead-ro">{{ row.purchaseUnit }}</span>
                  <span v-if="moqInStockUnits(row)" class="rp-vi-cell-sub">{{ moqInStockUnits(row) }}</span>
                  <span v-else class="rp-vi-cell-sub">{{ t('base unit') }}</span>
                </td>
                <td class="rp-vi-td rp-vi-td--num">
                  <MpInput v-if="!readonly" :id="`rp-vi-pack-${i}`" v-model="row.packSize" type="number" :class="css({ width: '68px' })" />
                  <span v-else class="rp-vi-lead-ro">{{ row.packSize }}</span>
                </td>
                <td class="rp-vi-td rp-vi-td--num">
                  <MpInput v-if="!readonly" :id="`rp-vi-cost-${i}`" v-model="row.unitCost" type="number" :class="css({ width: '124px' })" />
                  <span v-else class="rp-vi-lead-ro">{{ formatIDR(Number(row.unitCost) || 0) }}</span>
                  <span class="rp-vi-cell-sub">{{ formatIDR(Number(row.unitCost) || 0) }} / {{ row.purchaseUnit }}</span>
                </td>
                <!-- The preferred vendor is chosen per warehouse (D23): the radio reflects
                     the vendor preferred for the selected warehouse. -->
                <td class="rp-vi-td rp-vi-td--center">
                  <MpRadio
                    :id="`rp-vi-default-${i}`"
                    :name="`rp-vi-default-${sku}`"
                    :is-checked="preferredForWarehouse(selectedWarehouse) === row.vendorId"
                    :aria-label="tf('Set {vendor} as preferred', { vendor: vendorNameFor(row.vendorId) })"
                    @change="makeDefault(i)"
                  />
                </td>
                <td v-if="!readonly" class="rp-vi-td rp-vi-td--center">
                  <MpButton variant="ghost" class="rp-vi-remove" :aria-label="t('Remove')" @click="removeRow(i)">
                    <MpIcon name="minus-circular" size="md" />
                  </MpButton>
                </td>
              </tr>
            </tbody>
          </table>
          </div>

          <MpButton v-if="!readonly" variant="ghost" left-icon="add" class="rp-vi-add" @click="addRow">{{ t('Vendor') }}</MpButton>

          <p v-if="!readonly" class="rp-vi-hint">
            {{ t('Unit options come from this product\'s unit conversions. Base unit:') }}
            <strong>{{ baseUnit }}</strong>{{ unitOptions.length > 1 ? ', ' : '' }}
            <template v-if="unitOptions.length > 1">
              {{ unitOptions.filter(o => !o.isBase).map(o => `${o.name} = ${o.factor} ${baseUnit}`).join(', ') }}
            </template>
            <template v-else>{{ t('· no multi-units registered yet') }}</template>
          </p>
        </div>

        <footer class="rp-vi-footer" data-devchange="vendors-drawer-preferred">
          <!-- Inline, never a toast (rule/form-errors-inline). -->
          <span v-if="error" class="rp-vi-error" role="alert">{{ error }}</span>
          <MpButtonGroup class="erp-action-footer">
            <MpButton id="rp-vi-cancel" variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton id="rp-vi-save" variant="primary" is-rounded @click="readonly ? savePreferred() : save()">{{ t('Save changes') }}</MpButton>
          </MpButtonGroup>
        </footer>
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
  /* Wide enough for all seven columns: the table needs about 875px. */
  width: min(960px, calc(100% - 24px));
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

/* Per-warehouse preferred-vendor selector (D23). */
.rp-vi-wh { display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-3); }
.rp-vi-wh-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rp-vi-wh-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); flex-basis: 100%; }

/* ── Airene recommendation ── */
.rp-vi-ai {
  margin-bottom: var(--mp-spacing-4);
  border: 1px solid var(--mp-colors-border-information);
  border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-information);
  padding: var(--mp-spacing-3);
}
.rp-vi-ai-head { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.rp-vi-ai-icon { color: var(--mp-colors-icon-information); flex-shrink: 0; }
/* One text style throughout: 14px body in the default colour (rule/type-14-default). */
.rp-vi-ai-text, .rp-vi-ai-reasons, .rp-vi-ai-note { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
/* A real list, so it keeps its markers (CLAUDE.md › List bullets). */
.rp-vi-ai-reasons { list-style: disc outside; margin: var(--mp-spacing-2) 0 0; padding-left: var(--mp-spacing-5); }
.rp-vi-ai-reasons li { display: list-item; margin-top: var(--mp-spacing-0\.5); }
.rp-vi-ai-note { margin: var(--mp-spacing-2) 0 0; }
.rp-vi-ai-chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-0\.5, 2px); margin-top: var(--mp-spacing-1);
  padding: 0 var(--mp-spacing-1\.5, 6px); height: 20px;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-colors-background-information);
  color: var(--mp-colors-text-information);
  font-size: var(--mp-font-sizes-xs, 12px); font-weight: var(--mp-font-weights-medium, 500);
  white-space: nowrap; vertical-align: middle;
}
.rp-vi-ai-chip :deep(svg) { width: 12px; height: 12px; }

.rp-vi-table-wrap {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  overflow-x: auto;
}
.rp-vi-table { width: 100%; border-collapse: collapse; }
.rp-vi-table tbody tr:last-child .rp-vi-td { border-bottom: none; }
.rp-vi-th:first-child, .rp-vi-td:first-child { padding-left: var(--mp-spacing-4); }
.rp-vi-th:last-child, .rp-vi-td:last-child { padding-right: var(--mp-spacing-4); }
/* The vendor name stays on one line; the AI pick chip sits under it, left-aligned. */
.rp-vi-th--vendor { min-width: var(--mp-sizes-52, 208px); }
.rp-vi-th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  background: var(--mp-background-neutral-subtle);
  white-space: nowrap;
}
.rp-vi-th--num { text-align: right; }
.rp-vi-th--center { text-align: center; }
.rp-vi-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2\.5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default, #e3e7e9));
  vertical-align: top;
}
.rp-vi-td--num { text-align: right; }
.rp-vi-td--center { text-align: center; }
/* MpRadio reserves room for a label even when it has none, which pushes the control
   left of centre. Drop the empty label so the radio sits under its "Preferred" header. */
.rp-vi-td--center :deep(.mp-radio__root) { display: inline-flex; justify-content: center; gap: 0; }
.rp-vi-td--center :deep(.mp-radio__label) { display: none; }
.rp-vi-vendor { display: block; white-space: nowrap; }
.rp-vi-vendor-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-vi-cell-sub {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap;
}
.rp-vi-cell-sub--warning { color: var(--mp-colors-text-warning); }
.rp-vi-lead-ro { font-variant-numeric: tabular-nums; color: var(--mp-text-default); white-space: nowrap; }
.rp-vi-remove {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.rp-vi-remove:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-text-danger); }

.rp-vi-add { margin-top: var(--mp-spacing-3); }
.rp-vi-hint {
  margin-top: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

.rp-vi-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-vi-error { margin-right: auto; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
