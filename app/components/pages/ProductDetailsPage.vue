<script setup lang="ts">
/**
 * Product details — master-data detail page (Figma: "Products / Details").
 * Shell mirrors WarehouseDetailsPage.vue exactly (breadcrumb, Actions dropdown,
 * activity log link + modal, MpTabs). The Product info fields use ContentList
 * (see docs/patterns/ContentList.md) laid out in the Figma's image + 3-column
 * arrangement, since that's the actual layout this design calls for.
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpSelect, MpCheckbox, MpTooltip, MpIcon, MpBadge, MpInput, MpInputGroup, MpInputRightAddon, MpButton, MpButtonGroup, MpTextlink, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ContentList from '~/components/patterns/ContentList.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import StockSerialDrawer from '~/components/patterns/StockSerialDrawer.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import PrintBarcodeOptionsModal from '~/components/patterns/PrintBarcodeOptionsModal.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  getProductDetail, getProductTransactions, getProductWarehouseStock, getProductBatches, getProductSerialStock,
  getProductAllSerials, type ProductBatchSummary,
} from '~/data/productDetails'
import { getWarehouseDetail, setWarehouseMinStock, type WarehouseStockItem } from '~/data/warehouseDetails'
import {
  buildRow, invalidateReplenishmentCaches, isManualFloorTooLow, productActionRollup,
  warehouseMinStockRollup,
} from '~/data/replenishment'
import { deriveLeadTime, isEstimatedTier, type LeadTimeTier } from '~/data/leadTimeHistory'
import { getSkuWarehouseOverride, saveSkuWarehouseOverride, inheritedSafetyDays } from '~/data/replenishmentSettings'
import { replenishmentRevision } from '~/data/replenishmentStore'
import { cutoverState } from '~/data/wmsCutover'
import { formatDateTimeLong } from '~/utils/date'
import { generateBarcodeLabelPdf, generateBarcodeSheetPdf } from '~/utils/barcodeLabelPdf'
import { TODAY } from '~/data/master'
import {
  vendorItemsForSku, preferredVendorItem, preferredVendorFor, vendorNameFor,
  preferredVendorIdForWarehouse, setPreferredVendor, clearPreferredVendorForWarehouse,
  vendorItemFor, inactivePreferredVendorFor, type VendorItem,
} from '~/data/vendorItems'
import {
  unitConversionsForSku, upsertUnitConversion, removeUnitConversion, describeQty,
} from '~/data/productUnits'
import type jsPDF from 'jspdf'

const props = defineProps<{ orderId: string }>()
const { t, tf } = useLocale()
// Changing a warehouse's reorder point, safety days or preferred vendor needs replenishment access.
const { canManageReplenishment } = useReplenishmentAccess()
const router = useRouter()
const route = useRoute()

const product = computed(() => getProductDetail(props.orderId))

// WMS doesn't deal in pricing/costing/accounting — those fields/sections are ERP-only.
const { activeScenario } = useScenario()
const isWms = computed(() => activeScenario.value.startsWith('WMS'))

// "WMS upgrade to ERP" migration scenario (separate axis): every price/cost/
// account value is empty until the user runs the migration (Settings →
// Migration date), so those fields render "—" until then. The fields/sections
// still show (we're in the ERP view post-upgrade); only the VALUES are blanked.
// Default scenario is untouched.
const { migrationScenario } = useMigrationScenario()
// Pending only until the WMS→ERP opening balance is published in Data migration.
const isMigrationPending = computed(() =>
  migrationScenario.value === 'WMS upgrade to ERP' && !cutoverState.published,
)

function goBack() { router.push('/product-list') }

// ── Tax info ───────────────────────────────────────────────────────────────────
// `djpCode` carries the DJP catalogue entry as one "<code> - <description>" label
// (that's how the classification list is stored, see taxClassificationCodes.ts).
// The PRD treats the Classification Code and its Description as two separate
// attributes — the description is looked up from the DJP master, never typed — so
// split the stored label back apart for display rather than duplicating the data.
const hasTaxInfo = computed(() => !!product.value?.djpCode)
const djpCodeOnly = computed(() => product.value?.djpCode?.split(' - ')[0] ?? '')
const djpDescription = computed(() => {
  const label = product.value?.djpCode ?? ''
  const sep = label.indexOf(' - ')
  return sep === -1 ? '' : label.slice(sep + 3)
})

// ── Tabs — driven by ?section= (NOT ?tab=: this route's first segment, "product-list",
// is also the index page's pageKey, whose OWN ?tab= is managed globally in
// [...slug].vue — reusing that name here would fight with it) so back/forward still
// restores the active tab. "Transactions" is first/default, matching Figma. The 3rd
// tab depends on Track stock by: "Batch" → Stock by batches, "Serial number" →
// Stock by serial numbers, else → Stock by warehouses. ──
const stockTabName = computed(() => {
  const t = product.value?.trackStockBy
  if (t === 'Batch') return 'batches'
  if (t === 'Serial number') return 'serials'
  return 'warehouses'
})
// Stock by warehouses is last and always present — and for a quantity-tracked
// product it IS the tracking tab, so de-dupe instead of listing it twice. The
// list has to match the rendered tab order exactly: MpTabs addresses tabs by
// index, so an entry missing here sends ?section= to the wrong tab.
const TAB_NAMES = computed(() => ['transactions', 'vendors', 'unit-conversions', ...new Set([stockTabName.value, 'warehouses'])])
const activeTabIndex = computed({
  get(): number {
    const tab = route.query.section as string | undefined
    const idx = tab ? TAB_NAMES.value.indexOf(tab) : -1
    return idx >= 0 ? idx : 0
  },
  set(idx: number) {
    router.replace({ query: { ...route.query, section: TAB_NAMES.value[idx] ?? 'transactions' } })
  },
})

// ── Unit conversions (the product's multi-unit setup) ─────────────────────────
// One larger unit = N base units. Vendor MOQ and pack size are quoted in one of
// these, so this table is what gives the vendor form its unit options.
const unitTick = ref(0)
const conversions = computed(() => {
  void unitTick.value
  return product.value ? unitConversionsForSku(product.value.sku) : []
})

const newUnitName = ref('')
const newUnitFactor = ref('')
const unitError = ref('')

function addConversion() {
  if (!product.value) return
  const name = newUnitName.value.trim()
  const factor = Number(newUnitFactor.value)
  // Validate on click and show an inline error — never a disabled button.
  if (!name) { unitError.value = 'Enter a unit name'; return }
  if (name.toLowerCase() === product.value.unit.toLowerCase()) {
    unitError.value = `"${name}" is already the base unit`
    return
  }
  if (!factor || Number.isNaN(factor) || factor <= 1 || !Number.isInteger(factor)) {
    unitError.value = 'Quantity must be a whole number greater than 1'
    return
  }
  upsertUnitConversion(product.value.sku, name, factor)
  newUnitName.value = ''
  newUnitFactor.value = ''
  unitError.value = ''
  unitTick.value++
  // Vendor terms quote MOQ in these units, so their labels change too.
  vendorTick.value++
}

function editFactor(name: string, raw: string) {
  if (!product.value) return
  const factor = Number(raw)
  if (!factor || Number.isNaN(factor) || factor <= 1) return
  upsertUnitConversion(product.value.sku, name, factor)
  unitTick.value++
  vendorTick.value++
}

function deleteConversion(name: string) {
  if (!product.value) return
  // A unit still used by a vendor's MOQ cannot be removed without silently
  // changing what that MOQ means, so say so instead of doing it.
  const inUse = vendorItemsForSku(product.value.sku).filter((v) => v.purchaseUnit === name)
  if (inUse.length) {
    unitError.value = `${name} is used by ${inUse.length === 1 ? 'a vendor' : inUse.length + ' vendors'}. Change their MOQ unit first.`
    return
  }
  removeUnitConversion(product.value.sku, name)
  unitError.value = ''
  unitTick.value++
}

// ── Vendors (who sells us this product, and on what terms) ────────────────────
// Read live from the vendor↔item link table, so the terms shown here are the same
// ones the replenishment engine uses to size a suggested order.
const vendorTick = ref(0)

const vendorRows = computed(() => {
  void vendorTick.value // re-read after the drawer saves
  return product.value ? vendorItemsForSku(product.value.sku) : []
})

const preferredVendor = computed(() => {
  void vendorTick.value
  return product.value ? preferredVendorItem(product.value.sku) : undefined
})

/**
 * What the Purchase info "Preferred vendor" field can honestly say (D23): the vendor is
 * chosen PER WAREHOUSE, so one name is only true when every stocked warehouse uses the
 * same one. Otherwise it reads "Varies by warehouse".
 */
const purchaseInfoVendor = computed<{ kind: 'same'; vendorId: string; item: VendorItem | undefined } | { kind: 'varies' } | { kind: 'none' }>(() => {
  void vendorTick.value
  void replenishmentRevision.value
  const picks = preferredByWarehouse.value
  const ids = new Set(picks.map((r) => r.vendorId).filter((v): v is string => !!v))
  if (ids.size > 1 || (ids.size === 1 && picks.some((r) => !r.vendorId))) return { kind: 'varies' }
  const only = [...ids][0]
  if (only) return { kind: 'same', vendorId: only, item: product.value ? vendorItemFor(product.value.sku, only) : undefined }
  const fallback = preferredVendor.value
  return fallback ? { kind: 'same', vendorId: fallback.vendorId, item: fallback } : { kind: 'none' }
})

/**
 * Lead time is derived per vendor × product × WAREHOUSE (US-001 VR-01), so a
 * vendor no longer has one number — it has one per warehouse the product is
 * stocked in. Show the range across those warehouses (or a single value when
 * they agree); the authoritative per-warehouse figures live on the Stock-by-
 * warehouses tab.
 */
function vendorLeadLabel(vendorId: string): string {
  void vendorTick.value
  void replenishmentRevision.value
  const sku = product.value?.sku
  if (!sku) return '—'
  const days = warehouseStock.value
    .map((s) => deriveLeadTime(vendorId, sku, undefined, s.warehouseId).days)
    .filter((d): d is number => d != null)
  if (!days.length) {
    const d = deriveLeadTime(vendorId, sku).days
    return d != null ? `${d} days` : '—'
  }
  const min = Math.min(...days)
  const max = Math.max(...days)
  return min === max ? `${min} days` : `${min}–${max} days`
}

/**
 * The preferred vendor PER WAREHOUSE (D23): a SKU can prefer a different vendor in
 * each warehouse, so one global "preferred" checkmark is no longer the truth. This
 * resolves each stocked warehouse's own pick (falling back to the SKU-level default
 * via the ladder) plus that pair's single lead time — the source for the summary
 * table on the Vendors tab.
 */
const preferredByWarehouse = computed(() => {
  void vendorTick.value
  void replenishmentRevision.value
  const sku = product.value?.sku
  if (!sku) return [] as {
    warehouseId: string; warehouseName: string
    vendorId: string | null; vendorName: string | null
    leadDays: number | null; leadEstimated: boolean; estimatedBasis: string
  }[]
  return warehouseStock.value.map((s) => {
    const vi = preferredVendorFor(sku, s.warehouseId)
    const d = vi ? deriveLeadTime(vi.vendorId, sku, undefined, s.warehouseId) : null
    return {
      warehouseId: s.warehouseId,
      warehouseName: s.warehouseName,
      vendorId: vi?.vendorId ?? null,
      vendorName: vi ? vendorNameFor(vi.vendorId) : null,
      leadDays: d?.days ?? null,
      leadEstimated: d ? isEstimatedTier(d.tier) : false,
      estimatedBasis: d && isEstimatedTier(d.tier) ? estimatedBasis(d.tier) : '',
    }
  })
})

/** The warehouses in which a given vendor is the preferred pick — drives the ✓ in the
 *  terms table (preferred in ≥1 warehouse). Editing happens on Stock by warehouses. */
function preferredInWarehouses(vendorId: string) {
  return preferredByWarehouse.value.filter((r) => r.vendorId === vendorId)
}
/** "how many" a vendor is preferred in — "All N warehouses" when it is every one. */
function preferredCountLabel(vendorId: string): string {
  const n = preferredInWarehouses(vendorId).length
  const total = preferredByWarehouse.value.length
  if (n > 0 && n === total) return tf('All {n} warehouses', { n })
  return n === 1 ? t('1 warehouse') : tf('{n} warehouses', { n })
}

// Which vendor rows have their per-warehouse lead-time breakdown expanded.
/** One vendor's warehouse list open at a time (the same rule as the warehouse calculations). */
const expandedVendor = ref<string | null>(null)
function toggleVendor(vendorId: string) {
  expandedVendor.value = expandedVendor.value === vendorId ? null : vendorId
}
/** A click anywhere on the row opens it — except on something that has its own job. */
function onVendorRowClick(e: MouseEvent, vendorId: string): void {
  if ((e.target as HTMLElement).closest('a, button, input, label, [role="button"]')) return
  toggleVendor(vendorId)
}

/** MOQ in the purchase unit, plus what that means in stock units — "4 Pallet" is
 *  meaningless on its own when a pallet is 20 sacks. */
function moqLabel(moq: number, purchaseUnit: string, unitsPer: number): string {
  const base = `${moq.toLocaleString('id-ID')} ${purchaseUnit}`
  if (unitsPer <= 1 || !product.value) return base
  return `${base} = ${(moq * unitsPer).toLocaleString('id-ID')} ${product.value.unit}`
}

// ── Formatters ─────────────────────────────────────────────────────────────────
function formatQty(n: number, unit: string) {
  return `${n.toLocaleString('id-ID')} ${unit}`
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
const createdLabel = computed(() => product.value ? formatDateTimeLong(product.value.createdAt) : '')

// ── Activity log ───────────────────────────────────────────────────────────────
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const p = product.value
  if (!p) return []
  return [{
    date: p.createdAt,
    user: p.createdBy,
    activity: 'Created',
    details: [
      { label: 'Name', value: p.name },
      { label: 'SKU', value: p.sku },
      { label: 'Category', value: p.category },
    ],
  }]
})

// empty-state illustration (runtime public path, not a build-time import)
const emptyIllustration = '/illustrations/empty-folder.png'

// ── Transactions tab ─────────────────────────────────────────────────────────────
const allTransactions = computed(() => product.value ? getProductTransactions(product.value.sku) : [])
const txTypeFilter = ref('')
const txSearch = ref('')
const txTypeOptions = computed(() => [...new Set(allTransactions.value.map(t => t.type))])
const filteredTransactions = computed(() => {
  let list = allTransactions.value
  if (txTypeFilter.value) list = list.filter(t => t.type === txTypeFilter.value)
  const q = txSearch.value.trim().toLowerCase()
  if (q) list = list.filter(t => t.number.toLowerCase().includes(q))
  return list
})
const txPage = ref(1)
const txPerPage = ref(25)
const pagedTransactions = computed(() => {
  const start = (txPage.value - 1) * txPerPage.value
  return filteredTransactions.value.slice(start, start + txPerPage.value)
})
watch([txTypeFilter, txSearch], () => { txPage.value = 1 })

// ── Stock by warehouses tab ──────────────────────────────────────────────────────
const warehouseStock = computed(() => product.value ? getProductWarehouseStock(product.value.sku) : [])
const whPage = ref(1)
const whPerPage = ref(25)
const pagedWarehouseStock = computed(() => {
  const start = (whPage.value - 1) * whPerPage.value
  return warehouseStock.value.slice(start, start + whPerPage.value)
})

/**
 * Replenishment settings at the WAREHOUSE grain (PRD US-024, US-011 AC-02).
 *
 * This is the grain the PRD actually specifies — "Reorder point, settings,
 * demand, lead time, worklist and netting are all at the item × warehouse
 * grain" (decision D2). A SKU selling 3/day in Jakarta and 0.2/day in Medan
 * genuinely needs different floors, and a product-level number cannot express
 * that. The product form sets the SKU-level DEFAULT; this table overrides it per
 * location, which is the precedence chain's top tier.
 *
 * Safety days is the input; min. stock is what it works out to, because the PRD
 * defines them as one quantity: "Reorder Point = MINIMUM STOCK THRESHOLD =
 * avg daily demand × (lead time + safety days)".
 */
/** Where this product is short right now — the action rollup (D13a), shown in
 *  Product info in place of a company-wide minimum that never existed. */
const actionRollup = computed(() => {
  const sku = product.value?.sku
  void replenishmentRevision.value
  return sku ? productActionRollup(sku) : null
})

const whReplenishment = computed(() => {
  // The engine reads its settings from localStorage, which Vue cannot track, so
  // without this the table would keep showing the pre-save values after an edit —
  // the same stale-read that once made the worklist tab badge disagree with its
  // own list. `writeStore` bumps this on every save.
  void replenishmentRevision.value
  const sku = product.value?.sku
  const out: Record<string, {
    effective: number
    source: string
    safetyDays: number
    safetyDaysSource: string
    velocity: number
    leadTimeDays: number
    leadTimeTier: string
    leadTimeEstimated: boolean
    leadTimeSampleSize: number
    manualTooLow: boolean
    vendorName: string
    vendorId: string | null
    lookbackDays: number
    lookbackUnits: number
    /** What the formula gives, ignoring any override. */
    recommended: number | null
    /** Safety days this warehouse would use with no value of its own. */
    inheritedSafetyDays: number
  }> = {}
  if (!sku) return out

  // Same function the product page sums, so the column and the rollup above it
  // cannot drift (D13 / US-024 AC-04).
  const roll = warehouseMinStockRollup(sku)
  for (const s of warehouseStock.value) {
    const row = buildRow(sku, s.warehouseId)
    const velocity = row.velocity.avgDailySales
    const rollRow = roll.perWarehouse.find((w) => w.warehouseId === s.warehouseId)
    out[s.warehouseId] = {
      effective: row.reorderPoint,
      source: row.reorderPointSource,
      safetyDays: row.safetyDays,
      safetyDaysSource: row.safetyDaysSource,
      velocity,
      leadTimeDays: row.leadTimeDays,
      leadTimeTier: row.leadTimeTier,
      leadTimeEstimated: row.leadTimeEstimated,
      leadTimeSampleSize: row.leadTimeSampleSize,
      vendorName: row.vendor?.name ?? '',
      vendorId: row.vendor?.id ?? null,
      lookbackDays: row.velocity.lookbackDays,
      lookbackUnits: row.velocity.lookbackUnits,
      // No demand basis means no floor to recommend — the same rule the worklist
      // applies, so this table cannot show a number the engine would refuse.
      recommended: velocity > 0 ? Math.ceil(velocity * (row.leadTimeDays + row.safetyDays)) : null,
      // US-024 VR-03 — a hand-set floor well under what demand justifies is how a
      // busy warehouse quietly stops being flagged.
      manualTooLow: rollRow ? isManualFloorTooLow(rollRow) : false,
      inheritedSafetyDays: inheritedSafetyDays(sku, s.warehouseId),
    }
  }
  return out
})

/**
 * The little grey line under each figure, in read AND edit mode.
 *
 * It used to disappear the moment Edit was clicked, which is exactly backwards:
 * "7" and "39" mean nothing on their own, and the moment you most need to know
 * whether a number is inherited or calculated is while you are deciding whether
 * to overwrite it. The full arithmetic stays on the cell's hover title; these are
 * the short forms that fit a 130px column.
 */
/**
 * Two columns, two rules — because their distributions differ.
 *
 * SAFETY DAYS is uniform: every row inherits the same figure unless somebody
 * overrode that one warehouse. A word on all nine rows would say the same thing
 * nine times, so only the departure is marked.
 *
 * MIN. STOCK is genuinely mixed — 63% of warehouse rows across the catalogue are
 * demand-calculated and 37% have no sales to calculate from, never lopsided per
 * product. With no dominant state a blank cell does not read as "calculated", it
 * reads as "missing", and marking only some rows leaves the column ragged. So
 * every row states its own provenance in one word.
 *
 * The full arithmetic stays on each cell's hover title in both columns.
 */
function whSafetyIsCustom(warehouseId: string): boolean {
  return whReplenishment.value[warehouseId]?.safetyDaysSource === 'sku-warehouse'
}

function whMinStockIsCustom(warehouseId: string): boolean {
  const src = whReplenishment.value[warehouseId]?.source
  return src === 'sku-warehouse' || src === 'sku'
}

/**
 * What the formula WOULD give for this warehouse, whether or not it is in use.
 *
 * Shown beside an overridden figure so the two are legible at once: telling a
 * user their number is "custom" answers which is which, but not the question
 * they actually have — is my override still sensible? Demand moves, so a floor
 * typed three months ago can quietly drift far from what the product now needs,
 * and the only way to notice is to see both numbers together.
 */
function whCalculatedHint(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r || r.recommended === null) return ''
  return tf('Calculated: {n}', { n: r.recommended })
}

/**
 * A caption only where someone set the reorder point by hand: the calculated figure
 * stays visible beside it (D17). A calculated number carries no label — the chevron
 * beside it opens the working.
 */
function whMinStockSub(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r || !whMinStockIsCustom(warehouseId)) return ''
  return whCalculatedHint(warehouseId) || t('Set for this warehouse')
}

/** The draft differs from what the warehouse would inherit / what the formula gives. */
function whSafetyDiffers(warehouseId: string): boolean {
  const r = whReplenishment.value[warehouseId]
  return !!r && whSafetyDraft[warehouseId] !== String(r.inheritedSafetyDays)
}
function whRopDiffers(warehouseId: string): boolean {
  const r = whReplenishment.value[warehouseId]
  return !!r && r.recommended !== null && whMinDraft[warehouseId] !== String(r.recommended)
}

/**
 * Which rows have their working shown.
 *
 * The product form can afford a permanent disclosure under one field; a table of
 * nine rows cannot, so the breakdown opens per row and only on request. Same
 * content and same wording as the form, so a user who learned it in one place
 * recognises it in the other.
 */
const expandedWh = ref<Set<string>>(new Set())

/** One calculation open at a time: opening another closes the one before it. */
function toggleWhDetails(warehouseId: string): void {
  expandedWh.value = expandedWh.value.has(warehouseId) ? new Set() : new Set([warehouseId])
}

/** A click anywhere on the row opens it — except on something that has its own job. */
function onWhRowClick(e: MouseEvent, warehouseId: string): void {
  if (whEditing.value) return
  if ((e.target as HTMLElement).closest('a, button, input, label, [role="button"]')) return
  toggleWhDetails(warehouseId)
}

/** Where this warehouse's lead time came from — measured, estimated, or vendorless. */
function whLeadTimeLine(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r) return ''
  if (!r.vendorId) return tf('No preferred vendor, so this uses the category default of {n} days.', { n: r.leadTimeDays })
  if (r.leadTimeEstimated) return tf('Lead time is an estimate. {vendor} has no delivered purchase orders yet.', { vendor: r.vendorName })
  return tf('Lead time is measured from {vendor}, the average of the last {n} receipts.', { vendor: r.vendorName, n: r.leadTimeSampleSize })
}

/** Where the lead time on the calculation card comes from — vendor and basis. */
function whLeadBasis(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r) return ''
  if (!r.vendorId) return t('Category default')
  if (r.leadTimeEstimated) return tf('{vendor}, estimated', { vendor: r.vendorName })
  return tf('{vendor}, avg of last {n} receipts', { vendor: r.vendorName, n: r.leadTimeSampleSize })
}

/** Where the safety days on the calculation card come from. */
function whSafetySource(warehouseId: string): string {
  switch (whReplenishment.value[warehouseId]?.safetyDaysSource) {
    case 'sku-warehouse': return t('Set for this warehouse')
    case 'sku': return t('Set for this product')
    case 'warehouse': return t('Warehouse setting')
    case 'category': return t('Category default')
    default: return t('Default')
  }
}

/**
 * The reorder point the table CELL shows: with no sales there is nothing to calculate,
 * so the cell shows the stored figure the low-stock alerts enforce — the panel must
 * compare stock against that same number, not the engine's 0.
 */
function whRopShown(s: { warehouseId: string; minStock: number }): number {
  const r = whReplenishment.value[s.warehouseId]
  if (r && r.recommended === null && r.source === 'none') return s.minStock
  return r?.effective ?? s.minStock
}

/** Room above the larger of position and reorder point, so the marker never sits at the end. */
const POSITION_HEADROOM = 1.3

/** Fill and marker positions of the stock-position bar, as percentages of its track. */
function whPositionPct(s: { warehouseId: string; available: number; onTheWay: number; minStock: number }): { fill: string; marker: string } {
  const rop = whRopShown(s)
  const position = Math.max(0, s.available + s.onTheWay)
  const scale = Math.max(position, rop, 1) * POSITION_HEADROOM
  return { fill: `${Math.min(100, (position / scale) * 100)}%`, marker: `${Math.min(100, (rop / scale) * 100)}%` }
}

/** The two captions under the bar: the position's arithmetic, and how it stands against the point. */
function whPositionCaption(s: { warehouseId: string; available: number; onTheWay: number; minStock: number; unit: string }): { left: string; right: string; short: boolean } {
  const rop = whRopShown(s)
  const position = s.available + s.onTheWay
  const gap = rop - position
  const left = tf('{available} available + {transit} in transit = {total} {unit}', {
    available: s.available.toLocaleString('id-ID'), transit: s.onTheWay.toLocaleString('id-ID'),
    total: position.toLocaleString('id-ID'), unit: s.unit,
  })
  const right = gap > 0
    ? tf('{n} {unit} below reorder point ({rop})', { n: gap.toLocaleString('id-ID'), unit: s.unit, rop: rop.toLocaleString('id-ID') })
    : gap < 0
      ? tf('{n} {unit} above reorder point ({rop})', { n: Math.abs(gap).toLocaleString('id-ID'), unit: s.unit, rop: rop.toLocaleString('id-ID') })
      : tf('At reorder point ({rop})', { rop: rop.toLocaleString('id-ID') })
  return { left, right, short: gap > 0 }
}

/** The working behind one warehouse's reorder point, as whole sentences. */
function whWhyLines(s: { warehouseId: string; warehouseName: string; minStock: number; unit: string }): string[] {
  const r = whReplenishment.value[s.warehouseId]
  if (!r) return []
  const lines: string[] = []
  if (r.recommended !== null) {
    lines.push(tf('{velocity} per day × ({lead} lead time days + {safety} safety days) = {n} {unit}', {
      velocity: r.velocity.toFixed(2), lead: r.leadTimeDays, safety: r.safetyDays, n: r.recommended, unit: s.unit,
    }))
    lines.push(tf('{n} {unit} sold here over {days} days.', { n: r.lookbackUnits, unit: s.unit, days: r.lookbackDays }))
  } else {
    lines.push(tf('Nothing sold from {warehouse} in the last {days} days, so there is no demand to calculate from. The {n} {unit} shown still applies to low-stock alerts.', {
      warehouse: s.warehouseName, days: r.lookbackDays, n: s.minStock.toLocaleString('id-ID'), unit: s.unit,
    }))
  }
  lines.push(whLeadTimeLine(s.warehouseId))
  if (whMinStockIsCustom(s.warehouseId)) lines.push(t('This warehouse uses a value you set, not the calculation.'))
  return lines
}

// On hand, reserved, available and in transit are all MEASURED by the warehouse,
// so they stay read only. Safety days and min. stock are decisions, so they are
// the two editable columns. Edits are held in a draft until Save — both drive
// low-stock alerts and the replenishment worklist, so a half-typed number
// shouldn't take effect on the way to the right one.
const whEditing = ref(false)
/** Invalid cells after a failed save, keyed `safety:<wh>` / `rop:<wh>` (rule/field-invalid-caption). */
const whErrors = reactive<Record<string, boolean>>({})
const whFormError = ref('')
function clearWhErrors() { for (const k of Object.keys(whErrors)) delete whErrors[k]; whFormError.value = '' }
function cancelEditMinStock() { clearWhErrors(); whEditing.value = false }
const whMinDraft = reactive<Record<string, string>>({})
const whSafetyDraft = reactive<Record<string, string>>({})
/** Preferred vendor per warehouse (D23) — editable here, the one place it is set. */
const whPreferredDraft = reactive<Record<string, string>>({})

/** The SKU's linked vendors, as options for the per-warehouse preferred selector. */
const whVendorOptions = computed(() => {
  void vendorTick.value
  return vendorRows.value.map((v) => ({ value: v.vendorId, label: vendorNameFor(v.vendorId) }))
})
/** This warehouse's own preferred vendor went inactive: lead time fell back to the next listed one (US-001 EH-01). */
function whInactivePreferred(warehouseId: string): boolean {
  void vendorTick.value
  void replenishmentRevision.value
  const sku = product.value?.sku
  return !!sku && !!inactivePreferredVendorFor(sku, warehouseId)
}
/** The read-mode preferred vendor name for a warehouse (resolved pick, D23). */
function whPreferredName(warehouseId: string): string {
  void vendorTick.value
  void replenishmentRevision.value
  const sku = product.value?.sku
  if (!sku) return ''
  return preferredVendorFor(sku, warehouseId)?.vendorId
    ? vendorNameFor(preferredVendorFor(sku, warehouseId)!.vendorId)
    : ''
}
/**
 * The lead time for a warehouse's preferred vendor — the draft pick while editing,
 * the saved pick otherwise. This is the single per-warehouse figure (D10), shown as
 * a sub-line so the vendor choice and its consequence read together.
 */
/**
 * The tag on a lead time that was not measured (US-001 AC-04): says WHICH default it
 * comes from — the product's category, or the "Other categories" floor.
 */
function estimatedBasis(tier: LeadTimeTier): string {
  return tier === 'global' ? t('Estimated (other categories)') : t('Estimated (category default)')
}

function whLeadInfo(warehouseId: string): { days: number | null; estimated: boolean; basis: string } {
  void vendorTick.value
  void replenishmentRevision.value
  const sku = product.value?.sku
  const vendorId = whEditing.value
    ? (whPreferredDraft[warehouseId] || '')
    : (sku ? (preferredVendorFor(sku, warehouseId)?.vendorId ?? '') : '')
  if (!sku || !vendorId) return { days: null, estimated: false, basis: '' }
  const d = deriveLeadTime(vendorId, sku, undefined, warehouseId)
  return { days: d.days, estimated: isEstimatedTier(d.tier), basis: estimatedBasis(d.tier) }
}

/**
 * Bulk safety-days edit.
 *
 * Safety days is the same policy decision for most warehouses most of the time —
 * typing 14 into nine boxes is the kind of work software should do. Applying
 * fills the DRAFTS rather than saving, so a bulk change is reviewed in the table
 * alongside everything else and committed by the same Save.
 */
const whSelected = ref<Set<string>>(new Set())
const whBulkSafety = ref('')
const whBulkMinStock = ref('')
const whBulkPreferred = ref('')

const whAllSelected = computed(() =>
  warehouseStock.value.length > 0 && whSelected.value.size === warehouseStock.value.length,
)

function toggleWhSelected(warehouseId: string): void {
  const next = new Set(whSelected.value)
  next.has(warehouseId) ? next.delete(warehouseId) : next.add(warehouseId)
  whSelected.value = next
}

function toggleWhSelectAll(): void {
  whSelected.value = whAllSelected.value
    ? new Set()
    : new Set(warehouseStock.value.map((s) => s.warehouseId))
}

/**
 * Apply whichever bulk boxes were filled to every selected warehouse.
 *
 * A bulk write is a one-off that stamps EXPLICIT values on the rows it touches —
 * different in kind from the product-level defaults, which are live and inherited
 * (D15). Use this for a set of warehouses that genuinely differ; use the product
 * default for "most of them behave the same".
 *
 * An empty box is left alone rather than treated as a clear, because clearing
 * nine warehouses by accident is the more expensive mistake. `Clear` is explicit.
 */
function applyBulk(): void {
  const safety = whBulkSafety.value.trim().replace(/\D/g, '')
  const min = whBulkMinStock.value.trim().replace(/\D/g, '')
  const vendor = whBulkPreferred.value
  for (const id of whSelected.value) {
    if (safety !== '') whSafetyDraft[id] = safety
    if (min !== '') whMinDraft[id] = min
    if (vendor !== '') whPreferredDraft[id] = vendor
  }
  whBulkSafety.value = ''
  whBulkMinStock.value = ''
  whBulkPreferred.value = ''
  whSelected.value = new Set()
}

/**
 * Hand the selected warehouses back to the cascade — the explicit counterpart to
 * filling a box, so "make these inherit again" is one deliberate action.
 *
 * What they return TO depends on the field: safety days falls back to its
 * inherited default (warehouse → category → company); min. stock returns to the
 * calculated figure where there are sales, or the stored floor where there are
 * none. There is no product-level or category min-stock default any more (D17).
 */
function clearBulk(): void {
  const skuDefaultVendorId = product.value ? (preferredVendorItem(product.value.sku)?.vendorId ?? '') : ''
  for (const id of whSelected.value) {
    const r = whReplenishment.value[id]
    if (!r) continue
    whSafetyDraft[id] = String(r.inheritedSafetyDays)
    if (r.recommended !== null) whMinDraft[id] = String(r.recommended)
    // Preferred falls back to the SKU-level default (cleared on save, D23).
    whPreferredDraft[id] = skuDefaultVendorId
  }
  whSelected.value = new Set()
}

function startEditMinStock() {
  if (!canManageReplenishment.value) return
  whSelected.value = new Set()
  whBulkSafety.value = ''
  for (const id of Object.keys(whMinDraft)) delete whMinDraft[id]
  for (const id of Object.keys(whSafetyDraft)) delete whSafetyDraft[id]
  for (const id of Object.keys(whPreferredDraft)) delete whPreferredDraft[id]
  const sku = product.value?.sku
  // The form opens FILLED with the value in force, never blank. Saving a value that
  // still equals its default stores no override (see saveMinStock), so it keeps
  // inheriting / tracking demand.
  for (const s of warehouseStock.value) {
    const r = whReplenishment.value[s.warehouseId]
    const override = sku ? getSkuWarehouseOverride(sku, s.warehouseId) : {}
    whMinDraft[s.warehouseId] = String(override.reorderPoint ?? r?.recommended ?? s.minStock)
    whSafetyDraft[s.warehouseId] = String(r?.safetyDays ?? '')
    // The resolved preferred vendor (explicit pick, else the SKU default via the ladder).
    whPreferredDraft[s.warehouseId] = sku ? (preferredVendorFor(sku, s.warehouseId)?.vendorId ?? '') : ''
  }
  clearWhErrors()
  whEditing.value = true
}

function saveMinStock() {
  const sku = product.value?.sku
  if (!sku) return

  // Validate on click and mark the cells — never a disabled button
  // (rule/btn-no-disabled-validation). Safety days: whole number of 1 or more.
  // Reorder point: whole number of 0 or more. Neither may be empty.
  clearWhErrors()
  const whole = (raw: string) => /^\d+$/.test(raw.trim())
  for (const s of warehouseStock.value) {
    const safetyRaw = String(whSafetyDraft[s.warehouseId] ?? '')
    const ropRaw = String(whMinDraft[s.warehouseId] ?? '')
    if (!whole(safetyRaw) || Number(safetyRaw) < 1) whErrors[`safety:${s.warehouseId}`] = true
    if (!whole(ropRaw)) whErrors[`rop:${s.warehouseId}`] = true
  }
  if (Object.keys(whErrors).length) {
    whFormError.value = t('Fix the highlighted fields to save')
    return
  }

  for (const s of warehouseStock.value) {
    const rec = whReplenishment.value[s.warehouseId]
    const typedSafety = Number(whSafetyDraft[s.warehouseId])
    const typedRop = Number(whMinDraft[s.warehouseId])

    // A value equal to its default is not an override: store nothing, so safety
    // days keeps inheriting and the reorder point keeps tracking demand.
    const safetyDays = typedSafety === rec?.inheritedSafetyDays ? undefined : typedSafety
    const isDefaultRop = rec?.recommended !== null && rec?.recommended !== undefined
      ? typedRop === rec.recommended
      : typedRop === s.minStock
    const reorderPoint = isDefaultRop ? undefined : typedRop

    saveSkuWarehouseOverride(sku, s.warehouseId, { safetyDays, reorderPoint })

    // Keep the legacy per-warehouse minStock in step. It feeds the low-stock
    // counts on the Products and warehouse screens and in Cowork, which read
    // `minStock` rather than the engine.
    if (reorderPoint !== undefined && reorderPoint !== s.minStock) {
      setWarehouseMinStock(s.warehouseId, sku, reorderPoint)
    }

    // Preferred vendor per warehouse (D23). A pick equal to the SKU-level default is
    // not an override — clear it so the warehouse keeps inheriting; otherwise store
    // the explicit per-warehouse pick. Only write when it actually changed.
    const chosenVendor = whPreferredDraft[s.warehouseId] || ''
    const skuDefaultVendorId = preferredVendorItem(sku)?.vendorId ?? ''
    const currentExplicit = preferredVendorIdForWarehouse(sku, s.warehouseId)
    if (chosenVendor && chosenVendor !== skuDefaultVendorId) {
      if (chosenVendor !== currentExplicit) setPreferredVendor(sku, chosenVendor, s.warehouseId)
    } else if (currentExplicit) {
      clearPreferredVendorForWarehouse(sku, s.warehouseId)
    }
  }

  invalidateReplenishmentCaches()
  vendorTick.value++ // refresh the Vendors tab ✓ and any preferred-derived reads
  whEditing.value = false
}

// ── Stock by batches tab (batch-tracked products only) ────────────────────────────
const allBatches = computed(() => product.value ? getProductBatches(product.value.sku) : [])
const showArchivedBatches = ref(false)
const batchSearch = ref('')
const filteredBatches = computed(() => {
  let list = allBatches.value
  if (!showArchivedBatches.value) list = list.filter(b => !b.archived)
  const q = batchSearch.value.trim().toLowerCase()
  if (q) list = list.filter(b => b.batchNo.toLowerCase().includes(q))
  return list
})
const batchPage = ref(1)
const batchPerPage = ref(25)
const pagedBatches = computed(() => {
  const start = (batchPage.value - 1) * batchPerPage.value
  return filteredBatches.value.slice(start, start + batchPerPage.value)
})
watch([showArchivedBatches, batchSearch], () => { batchPage.value = 1 })

function daysToExpiry(iso: string) { return Math.ceil((new Date(iso).getTime() - TODAY.getTime()) / 86_400_000) }
function isExpiryWarning(iso: string) { return daysToExpiry(iso) < 30 }
function expiryTooltip(iso: string) {
  const d = formatDate(iso)
  const days = daysToExpiry(iso)
  if (days < 0) return `Expired on ${d}`
  if (days === 0) return `Expires today (${d})`
  return `Expiring in ${days} day${days === 1 ? '' : 's'} (${d})`
}
function viewBatch(batchNo: string) {
  if (!product.value) return
  router.push(`/product-list/${product.value.sku}/batches/${encodeURIComponent(batchNo)}`)
}

type PrintBarcodeTarget =
  | { kind: 'batch'; batch: ProductBatchSummary }
  | { kind: 'sku' }
  | { kind: 'serials'; serials: string[] }
  | { kind: 'batches'; batches: ProductBatchSummary[] }
const printBarcodeOptionsOpen = ref(false)
const printBarcodeTarget = ref<PrintBarcodeTarget | null>(null)
function printBatchBarcode(b: ProductBatchSummary) {
  printBarcodeTarget.value = { kind: 'batch', batch: b }
  printBarcodeOptionsOpen.value = true
}
// Print one barcode per batch currently listed (respects the archived toggle + search).
function printAllBatchBarcodes() {
  const batches = filteredBatches.value
  if (!batches.length) return
  printBarcodeTarget.value = { kind: 'batches', batches: [...batches] }
  printBarcodeOptionsOpen.value = true
}
function printSkuBarcode() {
  printBarcodeTarget.value = { kind: 'sku' }
  printBarcodeOptionsOpen.value = true
}
// Print one barcode per serial number (available + reserved) for this SKU.
function printAllSerialBarcodes() {
  if (!product.value) return
  const serials = getProductAllSerials(product.value.sku)
  if (!serials.length) return
  printBarcodeTarget.value = { kind: 'serials', serials }
  printBarcodeOptionsOpen.value = true
}

const barcodePreviewOpen = ref(false)
const barcodePreviewDoc = ref<jsPDF | null>(null)
const barcodePreviewFilename = ref('')
async function confirmPrintBarcode({ qty, columns }: { qty: number; columns: 1 | 2 | 3 }) {
  const target = printBarcodeTarget.value
  if (!product.value || !target) return
  printBarcodeOptionsOpen.value = false
  if (target.kind === 'serials') {
    // One label per serial number — its own barcode + the SN as the headline.
    const labels = target.serials.map((sn) => ({
      barcode: sn,
      batchNo: sn,
      productName: product.value!.name,
      sku: product.value!.sku,
    }))
    barcodePreviewDoc.value = await generateBarcodeSheetPdf(labels, columns, qty)
    barcodePreviewFilename.value = `Barcodes - ${product.value.sku} (serial numbers).pdf`
  } else if (target.kind === 'batches') {
    // One label per batch — the batch's own barcode + batch number headline.
    const labels = target.batches.map((b) => ({
      barcode: b.barcode,
      batchNo: b.batchNo,
      productName: product.value!.name,
      sku: product.value!.sku,
    }))
    barcodePreviewDoc.value = await generateBarcodeSheetPdf(labels, columns, qty)
    barcodePreviewFilename.value = `Barcodes - ${product.value.sku} (batches).pdf`
  } else if (target.kind === 'batch') {
    const b = target.batch
    barcodePreviewDoc.value = await generateBarcodeLabelPdf({
      barcode: b.barcode,
      batchNo: b.batchNo,
      productName: product.value.name,
      sku: product.value.sku,
    }, qty, columns)
    barcodePreviewFilename.value = `Barcode - ${b.batchNo}.pdf`
  } else {
    // No separate batch/serial identifier for a plain SKU label — the SKU itself
    // is already shown below, so leave the bold headline field blank.
    barcodePreviewDoc.value = await generateBarcodeLabelPdf({
      barcode: product.value.barcode,
      batchNo: '',
      productName: product.value.name,
      sku: product.value.sku,
    }, qty, columns)
    barcodePreviewFilename.value = `Barcode - ${product.value.sku}.pdf`
  }
  barcodePreviewOpen.value = true
}
// ── Stock by serial numbers tab (serial-tracked products only) ────────────────────
const serialStock = computed(() => product.value ? getProductSerialStock(product.value.sku) : [])
const serialPage = ref(1)
const serialPerPage = ref(25)
const pagedSerialStock = computed(() => {
  const start = (serialPage.value - 1) * serialPerPage.value
  return serialStock.value.slice(start, start + serialPerPage.value)
})
function serialCountLabel(n: number) { return `${n} ${n === 1 ? 'serial number' : 'serial numbers'}` }
const serialTotal = computed(() => serialStock.value.reduce((n, s) => n + s.availableCount + s.reservedCount, 0))

const serialDrawerOpen = ref(false)
const serialDrawerProduct = ref<WarehouseStockItem | null>(null)
const serialDrawerWarehouseId = ref('')
const serialDrawerTab = ref<'available' | 'reserved'>('available')
function openSerialDrawer(warehouseId: string, tab: 'available' | 'reserved') {
  if (!product.value) return
  const item = getWarehouseDetail(warehouseId)?.stock.find(s => s.sku === product.value!.sku)
  if (!item) return
  serialDrawerProduct.value = item
  serialDrawerWarehouseId.value = warehouseId
  serialDrawerTab.value = tab
  serialDrawerOpen.value = true
}
</script>

<template>
  <div v-if="product" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpButton class="detail-breadcrumb" variant="ghost" @click="goBack">Products</MpButton>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ product.name }}</h1>
        </div>
      </div>

      <MpPopover id="pd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton class="detail-btn detail-btn--primary" variant="primary">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="router.push(`/product-list/${product.sku}/edit`)">Edit</MpPopoverListItem>
            <MpPopoverListItem @click="printSkuBarcode">Print barcode</MpPopoverListItem>
            <MpPopoverListItem>Duplicate</MpPopoverListItem>
            <MpPopoverListItem>Archive</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <!-- ── Stage ── -->
    <div class="detail-stage">

      <!-- Product info -->
      <section class="pd-section">
        <h2 class="pd-section-title">Product info</h2>
        <div class="pd-info-row">
          <div class="pd-image-col">
            <img :src="product.img" :alt="product.name" class="pd-image" />
          </div>
          <div class="pd-field-col" style="width: 368px">
            <ContentList label="SKU" :value="product.sku" />
            <ContentList label="Barcode" :value="product.barcode" />
            <ContentList label="Category" :value="product.category" />
            <ContentList label="Base unit" :value="product.unit" />
            <ContentList label="Description">
              <ClampText :text="product.desc" :lines="2" />
            </ContentList>
          </div>
          <div class="pd-field-col pd-field-col--flex">
            <!-- Product type is an ERP concept — every WMS Standalone product is single. -->
            <ContentList v-if="!isWms" label="Product type" :value="product.productType" />
            <ContentList label="Track stock by" :value="product.trackStockBy" />
            <ContentList v-if="!isWms" label="Default inventory account">
              <span v-if="isMigrationPending">—</span>
              <a v-else class="pd-link">{{ product.defaultInventoryAccount }}</a>
            </ContentList>
          </div>
          <div class="pd-field-col pd-field-col--flex">
            <ContentList label="On hand" :value="formatQty(product.onHand, product.unit)" />
            <ContentList label="Reserved" :value="formatQty(product.reserved, product.unit)" />
            <ContentList label="Available" :value="formatQty(product.available, product.unit)" />
            <!--
              NOT a company-wide min. stock. That row used to read
              `product.minStock`, which is a seed figure keyed on the product's
              position in the catalogue — settable nowhere, equal to no
              warehouse's floor, and a company-wide threshold of exactly the kind
              D13/D15 reject ("stock in one warehouse cannot cover a shortage in
              another"). It is kept as DATA because the Products index and Cowork
              still derive their low-stock status from it, but showing it here
              invited a number nobody could act on or change.

              What replaces it is the same action rollup the product form shows:
              where this product is actually short, and how much to ask for.
            -->
            <!-- Whole labelled fields, not sentence fragments (docs/patterns/ContentList.md). -->
            <template v-if="actionRollup && actionRollup.warehouseCount">
              <ContentList
                :label="t('Due for reorder')"
                :value="tf('{n} of {total} warehouses', { n: actionRollup.dueCount, total: actionRollup.warehouseCount })"
              />
              <!-- US-021 AC-04 / D13a: the ACTION rollup — how much to ask for in total. -->
              <ContentList
                v-if="actionRollup.dueCount"
                :label="t('Total suggested qty')"
                :value="`${actionRollup.totalSuggestedQty.toLocaleString('id-ID')} ${product.unit}`"
              />
            </template>
            <ContentList v-else :label="t('Due for reorder')" value="—" />
          </div>
        </div>
      </section>

      <!-- Purchase info / Sales info / Tax info — all three are ERP only; WMS
           doesn't deal in pricing/accounting and has no tax module. -->
      <div class="pd-two-col">
        <section v-if="!isWms" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Purchase info</h2>
          <div class="pd-purchase-row">
            <div class="pd-field-col pd-field-col--flex">
              <ContentList label="Default purchase cost" :value="isMigrationPending ? '—' : formatIDR(product.defaultPurchaseCost)" />
              <ContentList label="Average cost" :value="isMigrationPending ? '—' : formatIDR(product.averageCost)" />
              <ContentList label="Last purchase cost" :value="isMigrationPending ? '—' : formatIDR(product.lastPurchaseCost)" />
            </div>
            <div class="pd-field-col pd-field-col--flex">
              <ContentList label="Default purchase account">
                <span v-if="isMigrationPending">—</span>
                <a v-else class="pd-link">{{ product.defaultPurchaseAccount }}</a>
              </ContentList>
              <ContentList label="Default purchase tax" :value="isMigrationPending ? '—' : product.defaultPurchaseTax" />
              <!-- Preferred vendor + its minimum order — the two facts a buyer
                   opens this page for. The full comparison is in the Vendors tab. -->
              <ContentList label="Preferred vendor">
                <template v-if="purchaseInfoVendor.kind === 'same'">
                  <span>{{ vendorNameFor(purchaseInfoVendor.vendorId) }}</span>
                  <span class="pd-vendor-note">{{ tf('Lead time: {lead}', { lead: vendorLeadLabel(purchaseInfoVendor.vendorId) }) }}</span>
                  <span v-if="purchaseInfoVendor.item" class="pd-vendor-note">{{ tf('MOQ: {moq}', { moq: moqLabel(purchaseInfoVendor.item.moq, purchaseInfoVendor.item.purchaseUnit, purchaseInfoVendor.item.unitsPerPurchaseUnit) }) }}</span>
                </template>
                <template v-else-if="purchaseInfoVendor.kind === 'varies'">
                  <span class="pd-vendor-name" data-devchange="product-preferred-varies-by-warehouse">{{ t('Varies by warehouse') }}</span>
                </template>
                <template v-else>
                  <span class="pd-vendor-none">{{ t('Not set') }}</span>
                  <span class="pd-vendor-note">{{ t('This product cannot be ordered until a vendor is added') }}</span>
                </template>
              </ContentList>
            </div>
          </div>
        </section>
        <section v-if="!isWms" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Sales info</h2>
          <div class="pd-field-col pd-field-col--fixed">
            <ContentList label="Default sales price" :value="isMigrationPending ? '—' : formatIDR(product.defaultSalesPrice)" />
            <ContentList label="Default sales account">
              <span v-if="isMigrationPending">—</span>
              <a v-else class="pd-link">{{ product.defaultSalesAccount }}</a>
            </ContentList>
            <ContentList label="Default sales tax" :value="isMigrationPending ? '—' : product.defaultSalesTax" />
          </div>
        </section>

        <!-- Tax info — ERP only (WMS Standalone has no tax module), and always
             rendered once we're in ERP, whether or not the product is classified:
             tax classification is optional at creation and is typically completed
             later by Tax/Finance (PRD-03a BR-002), so the section doubles as the
             signal that a product still has a classification gap. Same vertical-list
             pattern as Sales info (single column, fixed 270px). -->
        <section v-if="!isWms" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Tax info</h2>
          <div v-if="!hasTaxInfo" class="pd-tax-empty">
            <MpIcon name="information" size="sm" color="icon.secondary" />
            <span>
              Tax info is incomplete.
              <a class="pd-link" @click.prevent="router.push(`/product-list/${product.sku}/edit`)">Add tax info</a>
              to use this product on a tax document.
            </span>
          </div>
          <div v-else class="pd-field-col pd-field-col--fixed">
            <ContentList label="Product classification" :value="product.productClassification" />
            <ContentList label="DJP code" :value="djpCodeOnly" />
            <ContentList label="DJP description">
              <ClampText :text="djpDescription" :lines="3" />
            </ContentList>
            <ContentList label="DJP unit" :value="product.djpUnit" />
          </div>
        </section>
      </div>

      <a class="detail-updated" @click.prevent="activityOpen = true">
        Created by {{ product.createdBy }} on {{ createdLabel }}
      </a>

      <!-- ── Tabs ── -->
      <MpTabs id="pd-detail-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="pd-tab-transactions" value="transactions">Transactions</MpTab>
          <MpTab id="pd-tab-vendors" value="vendors">Vendors</MpTab>
          <MpTab id="pd-tab-units" value="unit-conversions">Unit conversions</MpTab>
          <MpTab v-if="product.trackStockBy === 'Batch'" id="pd-tab-batches" value="batches">Stock by batches</MpTab>
          <MpTab v-else-if="product.trackStockBy === 'Serial number'" id="pd-tab-serials" value="serials">Stock by serial numbers</MpTab>
          <!-- Every product sits in warehouses, whatever it's tracked by — and this is
               the only place a warehouse's min. stock can be set, so batch- and
               serial-tracked products need it too, not just quantity-tracked ones.
               Kept last so no existing tab shifts position. -->
          <MpTab id="pd-tab-warehouses" value="warehouses">Stock by warehouses</MpTab>
        </MpTabList>
        <MpTabPanels>

          <!-- Transactions -->
          <MpTabPanel value="transactions">
            <div class="pd-filter-bar">
              <div class="pd-filter-left">
                <MpPopover id="pd-tx-type-filter" is-close-on-select>
                  <MpPopoverTrigger>
                    <MpSelect
                      id="pd-tx-type-select"
                      placeholder="Transaction type"
                      :model-value="txTypeFilter"
                      is-clearable
                      :class="css({ width: '200px' })"
                      @mousedown.prevent
                      @clear="txTypeFilter = ''"
                    >
                      <option v-if="txTypeFilter" :value="txTypeFilter">{{ txTypeFilter }}</option>
                    </MpSelect>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
                    <MpPopoverList>
                      <MpPopoverListItem
                        v-for="t in txTypeOptions"
                        :key="t"
                        :is-active="t === txTypeFilter"
                        @click="txTypeFilter = t"
                      >{{ t }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </div>
              <div class="pd-search">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <input v-model="txSearch" class="pd-search-input" type="text" placeholder="Search..." />
                <MpButton v-if="txSearch" class="pd-search-clear" variant="secondary" type="button" aria-label="Clear search" @click="txSearch = ''">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </MpButton>
              </div>
            </div>

            <div v-if="pagedTransactions.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col style="width: 120px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 220px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 110px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 100px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 100px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 100px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 100px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 90px" /><!-- pixel-police-allow: table column width, not spacing -->
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Date</th>
                    <th class="pd-th">Number</th>
                    <th class="pd-th">Movement</th>
                    <th class="pd-th pd-th--num">On hand qty</th>
                    <th class="pd-th pd-th--num">Reserved qty</th>
                    <th class="pd-th pd-th--num">Available qty</th>
                    <th class="pd-th pd-th--num">In transit qty</th>
                    <th class="pd-th">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tx in pagedTransactions" :key="tx.id" class="pd-tr">
                    <td class="pd-td">{{ formatDate(tx.date) }}</td>
                    <td class="pd-td">
                      <!-- Plain text, not a link: a warehouse manager shouldn't be able to
                           open transactions from warehouses they aren't assigned to. -->
                      <span class="pd-tx-number">{{ tx.number }}</span>
                    </td>
                    <td class="pd-td">
                      <div class="pd-movement" :class="tx.delta >= 0 ? 'pd-movement--pos' : 'pd-movement--neg'">
                        {{ tx.delta >= 0 ? `+${tx.delta}` : tx.delta }}
                      </div>
                      <span v-for="a in tx.affects" :key="a" class="pd-movement-caption">{{ a }}</span>
                    </td>
                    <td class="pd-td pd-td--num">{{ tx.onHand.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ tx.reserved.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ tx.available.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ tx.onTheWay.toLocaleString('id-ID') }}</td>
                    <td class="pd-td">{{ tx.unit }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No transactions</p>
              <p class="empty-full-desc">Transactions will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredTransactions.length"
              :current-page="txPage"
              :per-page="txPerPage"
              :total="filteredTransactions.length"
              @page-change="txPage = $event"
              @per-page-change="txPerPage = $event; txPage = 1"
            />
          </MpTabPanel>

          <!-- Unit conversions -->
          <!-- Vendors — who supplies this product and on what terms. Same numbers
               the replenishment engine sizes an order from, so a buyer can see why
               a suggested quantity came out the way it did. -->
          <MpTabPanel value="vendors">
            <div v-if="vendorRows.length" class="pd-vendor-panel">
              <div class="pd-table-scroll">
                <table class="pd-table">
                  <colgroup>
                    <col style="width: 208px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 220px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 136px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 88px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 96px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 152px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 160px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 160px" /><!-- pixel-police-allow: table column width, not spacing -->
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="pd-th">{{ t('Vendor') }}</th>
                      <th class="pd-th">{{ t('Preferred') }}</th>
                      <th class="pd-th pd-th--num">
                        <span class="pd-th-info">
                          {{ t('Lead time') }}
                          <MpTooltip
                            id="pd-th-lead-tip"
                            :label="t('Measured per warehouse from its own purchase-to-receipt history, so it can differ by warehouse.')"
                            placement="top" use-portal
                          >
                            <span class="pd-th-icon"><MpIcon name="info" size="sm" /></span>
                          </MpTooltip>
                        </span>
                      </th>
                      <th class="pd-th pd-th--num">{{ t('MOQ') }}</th>
                      <th class="pd-th">{{ t('Unit') }}</th>
                      <th class="pd-th pd-th--num">{{ t('MOQ in base unit') }}</th>
                      <th class="pd-th pd-th--num">
                        <span class="pd-th-info">
                          {{ t('Purchase multiplier') }}
                          <MpTooltip
                            id="pd-th-multiplier-tip"
                            :label="t('An order is raised to the MOQ, then rounded up to the purchase multiplier.')"
                            placement="top" use-portal
                          >
                            <span class="pd-th-icon"><MpIcon name="info" size="sm" /></span>
                          </MpTooltip>
                        </span>
                      </th>
                      <th class="pd-th pd-th--num">{{ t('Unit cost') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="vi in vendorRows" :key="vi.id">
                      <tr
                        class="pd-tr"
                        :class="{ 'pd-tr--clickable': preferredInWarehouses(vi.vendorId).length, 'pd-tr--open': expandedVendor === vi.vendorId }"
                        @click="onVendorRowClick($event, vi.vendorId)"
                      >
                        <td class="pd-td">
                          <!-- Name on the left, the disclosure chevron right-aligned so the chevrons
                               form one column — the same cell as the warehouse rows. -->
                          <span class="pd-wh-name pd-wh-name--top">
                            <span class="pd-vendor-cell">
                              <span class="pd-vendor-name">{{ vendorNameFor(vi.vendorId) }}</span>
                              <span v-if="vi.unitsPerPurchaseUnit > 1" class="pd-vendor-note">
                                {{ tf('1 {unit} = {n} {base}', { unit: vi.purchaseUnit, n: vi.unitsPerPurchaseUnit, base: product.unit }) }}
                              </span>
                            </span>
                            <MpButton
                              v-if="preferredInWarehouses(vi.vendorId).length"
                              :id="`pd-vendor-why-${vi.vendorId}`"
                              variant="ghost"
                              class="pd-cell-toggle"
                              data-devchange="product-vendors-expand"
                              :aria-label="expandedVendor === vi.vendorId ? t('Hide warehouses') : t('Show warehouses')"
                              :aria-expanded="expandedVendor === vi.vendorId"
                              @click.stop="toggleVendor(vi.vendorId)"
                            >
                              <MpIcon :name="expandedVendor === vi.vendorId ? 'chevrons-up' : 'chevrons-down'" size="sm" />
                            </MpButton>
                          </span>
                        </td>
                        <td class="pd-td">
                          <span v-if="preferredInWarehouses(vi.vendorId).length">{{ preferredCountLabel(vi.vendorId) }}</span>
                          <span v-else class="pd-vendor-alt">—</span>
                        </td>
                        <td class="pd-td pd-td--num">{{ vendorLeadLabel(vi.vendorId) }}</td>
                        <td class="pd-td pd-td--num">{{ vi.moq.toLocaleString('id-ID') }}</td>
                        <td class="pd-td">{{ vi.purchaseUnit }}</td>
                        <td class="pd-td pd-td--num">
                          {{ (vi.moq * vi.unitsPerPurchaseUnit).toLocaleString('id-ID') }} {{ product.unit }}
                        </td>
                        <td class="pd-td pd-td--num">{{ vi.packSize }} {{ vi.purchaseUnit }}</td>
                        <td class="pd-td pd-td--num">{{ formatIDR(vi.unitCost) }}</td>
                      </tr>

                      <!-- Opened: one line per warehouse that prefers this vendor — its name under
                           Preferred, its lead time under Lead time. -->
                      <template v-if="expandedVendor === vi.vendorId">
                        <tr v-for="w in preferredInWarehouses(vi.vendorId)" :key="`${vi.id}-${w.warehouseId}`" class="pd-tr pd-tr--sub">
                          <td class="pd-td" />
                          <td class="pd-td">{{ w.warehouseName }}</td>
                          <td class="pd-td pd-td--num">
                            <template v-if="w.leadDays != null">
                              {{ tf('{n} days', { n: w.leadDays }) }}
                              <span v-if="w.leadEstimated" class="pd-lead-est pd-lead-est--below">{{ w.estimatedBasis }}</span>
                            </template>
                            <template v-else>—</template>
                          </td>
                          <td class="pd-td" colspan="5" />
                        </tr>
                      </template>
                    </template>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">{{ t('No vendors') }}</p>
              <p class="empty-full-desc">
                {{ t('No vendor supplies this product yet, so it cannot be ordered or replenished. Link it to a vendor from the Vendors module.') }}
              </p>
              <MpButton id="pd-go-vendors" variant="secondary" is-rounded class="empty-cta" @click="router.push('/vendors')">{{ t('Go to Vendors') }}</MpButton>
            </div>
          </MpTabPanel>

          <!-- Unit conversions — larger units this product is handled in. Vendor MOQ
               and pack size are quoted in one of these, so editing a factor here
               changes what every vendor's minimum means. -->
          <MpTabPanel value="unit-conversions">
            <div class="pd-unit-panel">
              <p class="pd-unit-intro">
                Base unit is <strong>{{ product.unit }}</strong>. Add the larger units this product
                is bought or handled in — a vendor's minimum order can then be quoted in any of them.
              </p>

              <div v-if="conversions.length" class="pd-table-scroll">
                <table class="pd-table">
                  <colgroup>
                    <col style="width: 220px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 160px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 240px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 200px" /><!-- pixel-police-allow: table column width, not spacing -->
                    <col style="width: 90px" /><!-- pixel-police-allow: table column width, not spacing -->
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="pd-th">Unit</th>
                      <th class="pd-th pd-th--num">Quantity</th>
                      <th class="pd-th">Conversion</th>
                      <th class="pd-th">Used by</th>
                      <th class="pd-th" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in conversions" :key="c.id" class="pd-tr">
                      <td class="pd-td">{{ c.name }}</td>
                      <td class="pd-td pd-td--num">
                        <MpInput
                          :id="`pd-uc-factor-${c.name}`"
                          :model-value="String(c.factor)"
                          type="number"
                          :class="css({ width: '88px' })"
                          @update:model-value="(v: string) => editFactor(c.name, v)"
                        />
                      </td>
                      <td class="pd-td">1 {{ c.name }} = {{ c.factor }} {{ product.unit }}</td>
                      <td class="pd-td">
                        <span v-if="vendorRows.filter(v => v.purchaseUnit === c.name).length" class="pd-vendor-note">
                          {{ vendorRows.filter(v => v.purchaseUnit === c.name).length }}
                          vendor MOQ
                        </span>
                        <span v-else class="pd-vendor-alt">—</span>
                      </td>
                      <td class="pd-td pd-td--num">
                        <button
                          class="pd-uc-remove"
                          type="button"
                          aria-label="Remove"
                          @click="deleteConversion(c.name)"
                        ><MpIcon name="minus-circular" size="md" /></button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="pd-unit-empty">
                No larger units yet — this product is only handled by the {{ product.unit }}.
              </p>

              <div class="pd-unit-add">
                <span class="pd-unit-add-label">Add unit</span>
                <MpInput
                  id="pd-uc-new-name"
                  v-model="newUnitName"
                  placeholder="Pack"
                  :class="css({ width: '160px' })"
                />
                <span class="pd-unit-eq">=</span>
                <MpInput
                  id="pd-uc-new-factor"
                  v-model="newUnitFactor"
                  type="number"
                  placeholder="12"
                  :class="css({ width: '96px' })"
                />
                <span class="pd-unit-eq">{{ product.unit }}</span>
                <button
                  class="btn-enterprise btn-enterprise--secondary"
                  type="button"
                  @click="addConversion"
                >Add</button>
              </div>
              <p v-if="unitError" class="pd-unit-error">{{ unitError }}</p>
            </div>
          </MpTabPanel>

          <!-- Stock by batches (batch-tracked products) -->
          <MpTabPanel v-if="product.trackStockBy === 'Batch'" value="batches">
            <div class="pd-filter-bar pd-filter-bar--end">
              <div class="pd-filter-right">
                <MpCheckbox
                  id="pd-show-archived-batches" :is-checked="showArchivedBatches"
                  @change="showArchivedBatches = !showArchivedBatches"
                >Show archived batches</MpCheckbox>
                <div class="pd-search">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  <input v-model="batchSearch" class="pd-search-input" type="text" placeholder="Search..." />
                  <MpButton v-if="batchSearch" class="pd-search-clear" variant="secondary" type="button" aria-label="Clear search" @click="batchSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </MpButton>
                </div>
                <MpButton
                  v-if="filteredBatches.length"
                  class="detail-btn detail-btn--secondary"
                  variant="secondary"
                  type="button"
                  @click="printAllBatchBarcodes"
                >
                  Print all barcode
                </MpButton>
              </div>
            </div>

            <div v-if="pagedBatches.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col style="width: 140px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 130px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 220px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 110px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 110px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 110px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 90px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 56px" /><!-- pixel-police-allow: table column width, not spacing -->
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Number</th>
                    <th class="pd-th">Expiration date</th>
                    <th class="pd-th">Description</th>
                    <th class="pd-th pd-th--num">On hand</th>
                    <th class="pd-th pd-th--num">Reserved</th>
                    <th class="pd-th pd-th--num">Available</th>
                    <th class="pd-th">Unit</th>
                    <th class="pd-th"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="b in pagedBatches" :key="b.batchNo" class="pd-tr">
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="viewBatch(b.batchNo)">{{ b.batchNo }}</a>
                    </td>
                    <td class="pd-td">
                      <span class="pd-expiry-cell" :class="{ 'pd-expiry-cell--danger': isExpiryWarning(b.expiryDate) }">
                        {{ formatDate(b.expiryDate) }}
                        <MpTooltip v-if="isExpiryWarning(b.expiryDate)" :id="`pd-tt-exp-${b.batchNo}`" :label="expiryTooltip(b.expiryDate)" placement="top" use-portal>
                          <span class="pd-expiry-warn" @click.stop><MpIcon name="warning-triangle" size="sm" /></span>
                        </MpTooltip>
                      </span>
                    </td>
                    <td class="pd-td">{{ b.description }}</td>
                    <td class="pd-td pd-td--num">{{ b.onHand.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ b.reserved.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ b.available.toLocaleString('id-ID') }}</td>
                    <td class="pd-td">{{ b.unit }}</td>
                    <td class="pd-td pd-td--action">
                      <MpPopover :id="`pd-batch-actions-${b.batchNo}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <MpButton class="row-kebab" variant="secondary" aria-label="More actions" @click.stop>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                          </MpButton>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                          <MpPopoverList>
                            <MpPopoverListItem @click="viewBatch(b.batchNo)">View details</MpPopoverListItem>
                            <MpPopoverListItem @click="printBatchBarcode(b)">Print barcode</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No batches</p>
              <p class="empty-full-desc">Batches will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredBatches.length"
              :current-page="batchPage"
              :per-page="batchPerPage"
              :total="filteredBatches.length"
              @page-change="batchPage = $event"
              @per-page-change="batchPerPage = $event; batchPage = 1"
            />
          </MpTabPanel>

          <!-- Stock by serial numbers (serial-tracked products) -->
          <MpTabPanel v-else-if="product.trackStockBy === 'Serial number'" value="serials">
            <div class="pd-section-head">
              <h3 class="linked-section-title">Serial numbers</h3>
              <MpButton
                v-if="serialTotal > 0"
                class="detail-btn detail-btn--secondary"
                variant="secondary"
                type="button"
                @click="printAllSerialBarcodes"
              >
                Print all barcode
              </MpButton>
            </div>
            <div v-if="pagedSerialStock.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col style="width: 240px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 200px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 200px" /><!-- pixel-police-allow: table column width, not spacing -->
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Warehouse</th>
                    <th class="pd-th">Available</th>
                    <th class="pd-th">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in pagedSerialStock" :key="s.warehouseId" class="pd-tr">
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="router.push(`/warehouses/${s.warehouseId}`)">{{ s.warehouseName }}</a>
                    </td>
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="openSerialDrawer(s.warehouseId, 'available')">{{ serialCountLabel(s.availableCount) }}</a>
                    </td>
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="openSerialDrawer(s.warehouseId, 'reserved')">{{ serialCountLabel(s.reservedCount) }}</a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No stock</p>
              <p class="empty-full-desc">Serial numbers will appear here.</p>
            </div>

            <ErpPagination
              v-if="serialStock.length"
              :current-page="serialPage"
              :per-page="serialPerPage"
              :total="serialStock.length"
              @page-change="serialPage = $event"
              @per-page-change="serialPerPage = $event; serialPage = 1"
            />
          </MpTabPanel>

          <!-- Stock by warehouses — shown for every product, alongside the batch /
               serial breakdown rather than instead of it. -->
          <MpTabPanel value="warehouses">
            <div v-if="pagedWarehouseStock.length && !whEditing && canManageReplenishment" class="pd-filter-bar pd-filter-bar--end">
              <MpButton id="pd-wh-edit" variant="secondary" is-rounded data-devchange="product-warehouses-tidy" @click="startEditMinStock">{{ t('Edit vendor') }}</MpButton>
            </div>
            <div v-if="pagedWarehouseStock.length" class="pd-table-scroll pd-wh-scroll" :class="{ 'pd-form-table': whEditing }">
              <table class="pd-table">
                <colgroup>
                  <col v-if="whEditing" style="width: 44px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 200px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 104px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 104px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 104px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 104px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 152px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col v-if="!whEditing" style="width: 72px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col style="width: 136px" /><!-- pixel-police-allow: table column width, not spacing -->
                  <col :style="{ width: whEditing ? '380px' : '220px' }" /><!-- pixel-police-allow: table column width, not spacing -->
                </colgroup>
                <thead>
                  <!-- Bulk set — the same value for several warehouses should not be typed nine times.
                       Each field sits above the column it fills, so the column header is its label. -->
                  <tr v-if="whEditing" class="pd-bulk-row" data-devchange="product-warehouses-bulk-row">
                    <td colspan="6" class="pd-bulk-cell">
                      <span class="pd-bulk-lead">
                        <span v-if="whSelected.size" class="pd-bulk-count">{{ tf('{n} warehouses selected', { n: whSelected.size }) }}</span>
                        <span v-else class="pd-bulk-hint">{{ t('Select warehouses to set their safety days, reorder point or preferred vendor together') }}</span>
                      </span>
                    </td>
                    <td class="pd-bulk-cell">
                      <MpInputGroup v-if="whSelected.size" id="pd-wh-bulk-min-stock-group">
                        <MpInput id="pd-wh-bulk-min-stock" v-model="whBulkMinStock" type="number" :aria-label="t('Reorder point')" />
                        <MpInputRightAddon has-background>{{ pagedWarehouseStock[0]?.unit }}</MpInputRightAddon>
                      </MpInputGroup>
                    </td>
                    <td class="pd-bulk-cell">
                      <MpInputGroup v-if="whSelected.size" id="pd-wh-bulk-safety-group">
                        <MpInput id="pd-wh-bulk-safety" v-model="whBulkSafety" type="number" :aria-label="t('Safety days')" />
                        <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                      </MpInputGroup>
                    </td>
                    <td class="pd-bulk-cell">
                      <span v-if="whSelected.size" class="pd-bulk-vendor">
                        <ErpFilterSelect
                          id="pd-wh-bulk-preferred"
                          v-model="whBulkPreferred"
                          :options="whVendorOptions"
                          :placeholder="t('Select vendor')"
                          width="100%"
                        />
                        <!-- Split button: Apply acts at once; the chevron only holds "Use defaults". -->
                        <span class="pd-split">
                          <MpButton id="pd-wh-bulk-apply" variant="secondary" size="sm" is-rounded class="pd-split-main" @click="applyBulk">{{ t('Apply') }}</MpButton>
                          <MpPopover id="pd-wh-bulk-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                            <MpPopoverTrigger>
                              <MpButton variant="secondary" size="sm" is-rounded class="pd-split-more" :aria-label="t('More actions')" right-icon="chevrons-down" />
                            </MpPopoverTrigger>
                            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                              <MpPopoverList>
                                <MpPopoverListItem @click="clearBulk">{{ t('Use defaults') }}</MpPopoverListItem>
                              </MpPopoverList>
                            </MpPopoverContent>
                          </MpPopover>
                        </span>
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th v-if="whEditing" class="pd-th">
                      <MpCheckbox id="pd-wh-select-all" :is-checked="whAllSelected" @change="toggleWhSelectAll" />
                    </th>
                    <th class="pd-th">{{ t('Warehouse') }}</th>
                    <th class="pd-th pd-th--num">{{ t('On hand qty') }}</th>
                    <th class="pd-th pd-th--num">{{ t('Reserved qty') }}</th>
                    <th class="pd-th pd-th--num">{{ t('Available qty') }}</th>
                    <th class="pd-th pd-th--num">{{ t('In transit qty') }}</th>
                    <th class="pd-th pd-th--num">
                      <span class="pd-th-info">
                        {{ t('Reorder point') }}
                        <MpTooltip
                          id="pd-th-minstock-tip"
                          :label="t('Calculated per warehouse as daily sales × (lead time + safety days). A value you set replaces the calculation.')"
                          placement="top" use-portal
                        >
                          <span class="pd-th-icon"><MpIcon name="info" size="sm" /></span>
                        </MpTooltip>
                      </span>
                    </th>
                    <th v-if="!whEditing" class="pd-th">{{ t('Unit') }}</th>
                    <th class="pd-th pd-th--num">
                      <span class="pd-th-info">
                        {{ t('Safety days') }}
                        <MpTooltip
                          id="pd-th-safety-tip"
                          :label="t('Extra cover on top of the vendor lead time. A warehouse without its own value uses the category default from Replenishment settings.')"
                          placement="top" use-portal
                        >
                          <span class="pd-th-icon"><MpIcon name="info" size="sm" /></span>
                        </MpTooltip>
                      </span>
                    </th>
                    <th class="pd-th">
                      <span class="pd-th-info">
                        {{ t('Preferred vendor') }}
                        <MpTooltip
                          id="pd-th-preferred-tip"
                          :label="t('The vendor this warehouse orders from. It can differ by warehouse, and its lead time sets the reorder point.')"
                          placement="top" use-portal
                        >
                          <span class="pd-th-icon"><MpIcon name="info" size="sm" /></span>
                        </MpTooltip>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="s in pagedWarehouseStock" :key="s.warehouseId">
                  <tr class="pd-tr" :class="{ 'pd-tr--clickable': !whEditing, 'pd-tr--open': expandedWh.has(s.warehouseId) }" @click="onWhRowClick($event, s.warehouseId)">
                    <td v-if="whEditing" class="pd-td">
                      <MpCheckbox
                        :id="`pd-wh-select-${s.warehouseId}`"
                        :is-checked="whSelected.has(s.warehouseId)"
                        @change="toggleWhSelected(s.warehouseId)"
                      />
                    </td>
                    <td class="pd-td">
                      <span class="pd-wh-name">
                        <!-- While editing, the name is just a label — nothing here navigates away mid-edit. -->
                        <span v-if="whEditing" class="cell-text">{{ s.warehouseName }}</span>
                        <a v-else class="cell-link cell-text" @click.stop="router.push(`/warehouses/${s.warehouseId}`)">{{ s.warehouseName }}</a>
                        <!-- The working behind this warehouse's reorder point opens from the chevron
                             (or anywhere on the row); right-aligned so the chevrons form one column. -->
                        <MpButton
                          v-if="!whEditing"
                          :id="`pd-wh-why-${s.warehouseId}`"
                          variant="ghost"
                          class="pd-cell-toggle"
                          :aria-label="expandedWh.has(s.warehouseId) ? t('Hide calculation') : t('Show calculation')"
                          :aria-expanded="expandedWh.has(s.warehouseId)"
                          @click.stop="toggleWhDetails(s.warehouseId)"
                        >
                          <MpIcon :name="expandedWh.has(s.warehouseId) ? 'chevrons-up' : 'chevrons-down'" size="sm" />
                        </MpButton>
                      </span>
                    </td>
                    <td class="pd-td pd-td--num">{{ s.onHand.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ s.reserved.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ s.available.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ s.onTheWay.toLocaleString('id-ID') }}</td>

                    <!-- Reorder point — calculated unless someone set it for this warehouse. -->
                    <td
                      class="pd-td pd-td--num"
                      :class="{ 'pd-td--input': whEditing, 'pd-td--error': whEditing && whErrors[`rop:${s.warehouseId}`] }"
                    >
                      <MpInputGroup v-if="whEditing" :id="`pd-wh-min-stock-group-${s.warehouseId}`">
                        <MpInput
                          :id="`pd-wh-min-stock-${s.warehouseId}`"
                          v-model="whMinDraft[s.warehouseId]"
                          type="number"
                          :aria-label="tf('Reorder point for {warehouse}', { warehouse: s.warehouseName })"
                        />
                        <MpInputRightAddon has-background>{{ s.unit }}</MpInputRightAddon>
                      </MpInputGroup>
                      <!-- With no sales there is nothing to calculate, so the stored figure the
                           low-stock alerts enforce is shown and labelled as such. -->
                      <template v-else-if="whReplenishment[s.warehouseId]?.recommended === null && whReplenishment[s.warehouseId]?.source === 'none'">
                        {{ s.minStock.toLocaleString('id-ID') }}
                      </template>
                      <template v-else>
                        {{ (whReplenishment[s.warehouseId]?.effective ?? s.minStock).toLocaleString('id-ID') }}
                      </template>
                      <span v-if="whReplenishment[s.warehouseId]?.manualTooLow" class="pd-cell-warn">{{ t('Below calculated') }}</span>
                      <span v-if="whMinStockSub(s.warehouseId)" class="pd-cell-sub">{{ whMinStockSub(s.warehouseId) }}</span>
                      <MpTextlink
                        v-if="whEditing && whRopDiffers(s.warehouseId)"
                        :id="`pd-wh-rop-calc-${s.warehouseId}`"
                        as="a"
                        class="pd-cell-link"
                        @click.prevent="whMinDraft[s.warehouseId] = String(whReplenishment[s.warehouseId]?.recommended ?? '')"
                      >{{ t('Use calculated') }}</MpTextlink>
                    </td>

                    <td v-if="!whEditing" class="pd-td">{{ s.unit }}</td>

                    <!-- Safety days — opens filled with the value in force (docs/patterns/FormTable.md). -->
                    <td
                      class="pd-td pd-td--num"
                      :class="{ 'pd-td--input': whEditing, 'pd-td--error': whEditing && whErrors[`safety:${s.warehouseId}`] }"
                    >
                      <MpInputGroup v-if="whEditing" :id="`pd-wh-safety-group-${s.warehouseId}`">
                        <MpInput
                          :id="`pd-wh-safety-${s.warehouseId}`"
                          v-model="whSafetyDraft[s.warehouseId]"
                          type="number"
                          :aria-label="tf('Safety days for {warehouse}', { warehouse: s.warehouseName })"
                        />
                        <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                      </MpInputGroup>
                      <template v-else>{{ whReplenishment[s.warehouseId]?.safetyDays ?? '—' }}</template>
                      <span v-if="whSafetyIsCustom(s.warehouseId)" class="pd-cell-sub">{{ t('Set for this warehouse') }}</span>
                      <MpTextlink
                        v-if="whEditing && whSafetyDiffers(s.warehouseId)"
                        :id="`pd-wh-safety-default-${s.warehouseId}`"
                        as="a"
                        class="pd-cell-link"
                        @click.prevent="whSafetyDraft[s.warehouseId] = String(whReplenishment[s.warehouseId]?.inheritedSafetyDays ?? '')"
                      >{{ t('Use default') }}</MpTextlink>
                    </td>


                    <!-- Preferred vendor — the one place it is set per warehouse (D23). -->
                    <td
                      class="pd-td"
                      :class="{ 'pd-td--select': whEditing && whVendorOptions.length }"
                      data-devchange="product-warehouses-preferred-vendor"
                    >
                      <!-- Editing: a select-like cell (FormTable.md › Select / Search Cell) — custom
                           single-root trigger, no inner border; the cell draws the focus ring. -->
                      <MpPopover
                        v-if="whEditing && whVendorOptions.length"
                        :id="`pd-wh-preferred-${s.warehouseId}`"
                        is-close-on-select
                        use-portal
                        :is-keep-alive="false"
                        placement="bottom-start"
                      >
                        <MpPopoverTrigger>
                          <div class="pd-select-trigger" role="button" tabindex="0">
                            <span class="pd-select-text">
                              <span v-if="whPreferredDraft[s.warehouseId]" class="pd-vendor-name">{{ vendorNameFor(whPreferredDraft[s.warehouseId]!) }}</span>
                              <span v-else class="pd-vendor-alt">{{ t('Select vendor') }}</span>
                              <span v-if="whLeadInfo(s.warehouseId).days != null" class="pd-cell-sub">
                                {{ tf('Lead time: {n} days', { n: whLeadInfo(s.warehouseId).days }) }}
                                <span v-if="whLeadInfo(s.warehouseId).estimated" class="pd-lead-est">{{ whLeadInfo(s.warehouseId).basis }}</span>
                              </span>
                            </span>
                            <MpIcon name="chevrons-down" size="sm" class="pd-select-chevron" />
                          </div>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
                          <MpPopoverList>
                            <MpPopoverListItem
                              v-for="o in whVendorOptions"
                              :key="o.value"
                              :is-active="o.value === whPreferredDraft[s.warehouseId]"
                              @click="whPreferredDraft[s.warehouseId] = o.value"
                            >{{ o.label }}</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                      <template v-else>
                        <span v-if="whPreferredName(s.warehouseId)" class="pd-vendor-name">{{ whPreferredName(s.warehouseId) }}</span>
                        <span v-else class="pd-vendor-alt">{{ t('No preferred vendor set') }}</span>
                        <span v-if="whInactivePreferred(s.warehouseId)" class="pd-cell-sub pd-cell-sub--warning" data-devchange="product-warehouses-inactive-preferred">{{ t('Preferred vendor is inactive') }}</span>
                        <span v-if="whLeadInfo(s.warehouseId).days != null" class="pd-cell-sub">
                          {{ tf('Lead time: {n} days', { n: whLeadInfo(s.warehouseId).days }) }}
                          <span v-if="whLeadInfo(s.warehouseId).estimated" class="pd-lead-est">{{ whLeadInfo(s.warehouseId).basis }}</span>
                        </span>
                      </template>
                    </td>
                  </tr>

                  <!-- Working shown on request. -->
                  <!-- How the reorder point is calculated: the formula as cards, then where stock
                       stands against it. Every figure comes from the same row the table reads. -->
                  <tr v-if="expandedWh.has(s.warehouseId) && !whEditing" :key="`${s.warehouseId}-why`" class="pd-tr pd-tr--details">
                    <td class="pd-td pd-td--details" colspan="9">
                      <div class="pd-calc" data-devchange="product-warehouses-calc-panel">
                        <template v-if="whReplenishment[s.warehouseId]?.recommended != null">
                          <p class="pd-calc-title">{{ t('How reorder point is calculated') }}</p>
                          <div class="pd-calc-formula">
                            <div class="pd-calc-card">
                              <span class="pd-calc-label">{{ t('Avg daily sales') }}</span>
                              <span class="pd-calc-value">{{ whReplenishment[s.warehouseId]!.velocity.toFixed(2) }} {{ s.unit }}</span>
                              <span class="pd-calc-sub">{{ tf('{n} {unit} ÷ {days} days', { n: whReplenishment[s.warehouseId]!.lookbackUnits, unit: s.unit, days: whReplenishment[s.warehouseId]!.lookbackDays }) }}</span>
                            </div>
                            <span class="pd-calc-op">× (</span>
                            <div class="pd-calc-card">
                              <span class="pd-calc-label">{{ t('Lead time') }}</span>
                              <span class="pd-calc-value">{{ tf('{n} days', { n: whReplenishment[s.warehouseId]!.leadTimeDays }) }}</span>
                              <span class="pd-calc-sub pd-calc-sub--link">{{ whLeadBasis(s.warehouseId) }}</span>
                            </div>
                            <span class="pd-calc-op">+</span>
                            <div class="pd-calc-card">
                              <span class="pd-calc-label">{{ t('Safety days') }}</span>
                              <span class="pd-calc-value">{{ tf('{n} days', { n: whReplenishment[s.warehouseId]!.safetyDays }) }}</span>
                              <span class="pd-calc-sub">{{ whSafetySource(s.warehouseId) }}</span>
                            </div>
                            <span class="pd-calc-op">) =</span>
                            <div class="pd-calc-card pd-calc-card--result">
                              <span class="pd-calc-label">{{ t('Reorder point') }}</span>
                              <span class="pd-calc-value">{{ (whReplenishment[s.warehouseId]?.effective ?? s.minStock).toLocaleString('id-ID') }} {{ s.unit }}</span>
                              <span class="pd-calc-sub">{{ whMinStockIsCustom(s.warehouseId) ? t('Set for this warehouse') : t('Calculated') }}</span>
                              <span v-if="whMinStockIsCustom(s.warehouseId)" class="pd-calc-sub">{{ whCalculatedHint(s.warehouseId) }}</span>
                            </div>
                          </div>
                        </template>
                        <p v-else class="pd-calc-note">{{ whWhyLines(s)[0] }}</p>

                        <p class="pd-calc-title">{{ t('Stock position vs reorder point') }}</p>
                        <div class="pd-calc-bar" role="img" :aria-label="whPositionCaption(s).right">
                          <span class="pd-calc-fill" :style="{ width: whPositionPct(s).fill }" />
                          <span class="pd-calc-marker" :style="{ left: whPositionPct(s).marker }" />
                        </div>
                        <div class="pd-calc-captions">
                          <span>{{ whPositionCaption(s).left }}</span>
                          <span :class="{ 'pd-calc-short': whPositionCaption(s).short }">{{ whPositionCaption(s).right }}</span>
                        </div>
                        <p class="pd-calc-links">
                          <MpTextlink :id="`pd-wh-lead-defaults-${s.warehouseId}`" as="a" class="pd-cell-link" @click.prevent="router.push('/replenishment-settings#lead-time')">
                            {{ t('View lead time defaults') }}
                          </MpTextlink>
                        </p>
                      </div>
                    </td>
                  </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- Edit-mode actions: inline error on the left, ghost Cancel + primary Save changes
                 (rule/btn-responsive-footer, rule/form-edit-save-changes, rule/form-errors-inline). -->
            <div v-if="whEditing && pagedWarehouseStock.length" class="pd-wh-footer">
              <p v-if="whFormError" class="pd-wh-error" role="alert">{{ whFormError }}</p>
              <MpButtonGroup class="erp-action-footer">
                <MpButton id="pd-wh-cancel" variant="ghost" is-rounded @click="cancelEditMinStock">{{ t('Cancel') }}</MpButton>
                <MpButton id="pd-wh-save" variant="primary" is-rounded @click="saveMinStock">{{ t('Save changes') }}</MpButton>
              </MpButtonGroup>
            </div>
            <div v-if="!pagedWarehouseStock.length" class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No stock</p>
              <p class="empty-full-desc">Warehouses will appear here.</p>
            </div>

            <ErpPagination
              v-if="warehouseStock.length"
              :current-page="whPage"
              :per-page="whPerPage"
              :total="warehouseStock.length"
              @page-change="whPage = $event"
              @per-page-change="whPerPage = $event; whPage = 1"
            />
          </MpTabPanel>

        </MpTabPanels>
      </MpTabs>
    </div>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="product.name"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <StockSerialDrawer
      :open="serialDrawerOpen"
      :product="serialDrawerProduct"
      :warehouse-id="serialDrawerWarehouseId"
      :initial-tab="serialDrawerTab"
      @update:open="serialDrawerOpen = $event"
    />

    <PrintBarcodeOptionsModal
      :open="printBarcodeOptionsOpen"
      @close="printBarcodeOptionsOpen = false"
      @confirm="confirmPrintBarcode"
    />

    <PdfPreviewModal
      :open="barcodePreviewOpen"
      :doc="barcodePreviewDoc"
      :filename="barcodePreviewFilename"
      title="Barcode preview"
      @close="barcodePreviewOpen = false"
    />
  </div>

  <div v-else class="detail-page">
    <div class="pd-notfound">
      <p class="empty-full-title">Product not found</p>
      <a class="pd-link" @click.prevent="goBack">Back to Products</a>
    </div>
  </div>
</template>

<style scoped>
/* ── Shell — identical to WarehouseDetailsPage.vue (docs/patterns/details-page-format.md §C) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; font-family: inherit;
}
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
.detail-updated {
  align-self: flex-start;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Tabs (green active-state override, per details-page-format.md §A.8) ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

/* ── Product info / Purchase / Sales sections ── */
.pd-section { display: flex; flex-direction: column; }
.pd-section--flex { flex: 1; min-width: 0; }
.pd-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.pd-info-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.pd-image-col { flex-shrink: 0; width: 172px; }
.pd-image {
  width: 172px; height: 172px; object-fit: cover; border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-subtle);
}
.pd-field-col { display: flex; flex-direction: column; }
.pd-field-col--flex { flex: 1; min-width: 0; }
.pd-field-col--fixed { width: 270px; }
/* Tax info empty state — an unclassified product isn't an error, just a gap Tax/
   Finance still has to close, so this reads as an inline hint, not a warning. */
.pd-tax-empty {
  display: flex;
  gap: var(--mp-spacing-2);
  align-items: flex-start;
  padding: var(--mp-spacing-2) 0;
  max-width: 360px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-secondary);
}
.pd-tax-empty :deep(svg) { flex: none; margin-top: 2px; }
.pd-two-col { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.pd-purchase-row { display: flex; gap: var(--mp-spacing-6); }
.pd-link { color: var(--mp-text-link); cursor: pointer; }
.pd-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Filter bar (Transaction type + search, right-aligned search per detail-page-format.md) ── */
.pd-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pd-filter-bar--end { justify-content: flex-end; }
.pd-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pd-filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  min-width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral); color: var(--mp-text-subtle);
}
.pd-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); min-width: 0; }
.pd-search-input::placeholder { color: var(--mp-text-placeholder); }
.pd-search-clear {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.pd-search-clear:hover { background: var(--mp-background-neutral-hovered); }

/* ── Tables (ErpTablePage header/row spec, raw table — mirrors WarehouseDetailsPage's tab tables) ── */
/* Where a number came from, under the number itself — muted so the figure still
   reads first and the provenance is there when questioned. */

/* The disclosure chevron, left of the warehouse it explains. MpButton pins its own padding,
   so it is reset to a bare icon target. */
.pd-cell-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: auto; min-width: 0; height: auto; padding: var(--mp-spacing-0\.5);
  vertical-align: middle; color: var(--mp-text-secondary);
}
.pd-wh-name { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.pd-tr--clickable { cursor: pointer; }
.pd-tr--clickable:hover > .pd-td { background: var(--mp-background-neutral-subtle); }
.pd-cell-toggle:hover { color: var(--mp-text-default); }

.pd-tr--details > .pd-td--details { padding: 0; }
/* ── How the reorder point is calculated (the expanded warehouse row) ── */
/* The scroll area is a size container, so the panel can be exactly as wide as what is
   visible (100cqw) and stay pinned left while the table scrolls under it. */
.pd-wh-scroll { container-type: inline-size; }
.pd-calc {
  position: sticky; left: 0; box-sizing: border-box; width: 100cqw;
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); text-align: left; white-space: normal;
  background: var(--mp-background-neutral-subtle);
}
.pd-calc-title { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pd-calc-formula { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-2); }
.pd-calc-op { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); white-space: nowrap; }
.pd-calc-card {
  display: flex; flex-direction: column;
  min-width: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.pd-calc-card--result { border-color: var(--mp-colors-border-selected); }
.pd-calc-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.pd-calc-value { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-lg); }
.pd-calc-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pd-calc-sub--link { color: var(--mp-text-link); }
.pd-calc-card--result .pd-calc-label,
.pd-calc-card--result .pd-calc-value,
.pd-calc-card--result .pd-calc-sub { color: var(--mp-text-selected); }
.pd-calc-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
/* Track, the stock held, and a marker where the reorder point sits. */
.pd-calc-bar {
  position: relative; height: var(--mp-sizes-2); overflow: hidden;
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
}
.pd-calc-fill { position: absolute; inset: 0 auto 0 0; background: var(--mp-border-bold); }
.pd-calc-marker { position: absolute; top: 0; bottom: 0; width: var(--mp-spacing-0\.5); background: var(--mp-colors-background-warning-bold); }
.pd-calc-captions { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pd-calc-short { color: var(--mp-colors-text-warning); }
.pd-calc-links { margin: 0; display: flex; gap: var(--mp-spacing-3); }
.pd-calc-links .pd-cell-link { margin-left: 0; }



/* MpTextlink pins 14px with a layered !important; scale it to the 12px caption. */
.pd-cell-link { display: flex; width: fit-content; margin-left: auto; zoom: calc(12 / 14); }

/* A hand-set floor materially under the calculated one. Amber, not red: it is a
   judgement the buyer is allowed to make, not an error. */
.pd-cell-warn {
  display: block; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
  color: var(--mp-colors-text-warning);
}

.pd-cell-sub {
  display: block; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary);
}
/* The bulk-set row: a table row above the headers, so each field sits over its column. */
.pd-bulk-row > .pd-bulk-cell {
  padding: var(--mp-spacing-2); vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
}
.pd-bulk-lead { display: flex; align-items: center; gap: var(--mp-spacing-3); white-space: normal; }
.pd-bulk-row :deep(.mp-input__root) { width: 100%; }
.pd-bulk-vendor { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pd-bulk-vendor :deep(.efs) { flex: 1; min-width: 0; }
/* Split button: the main half and the chevron half read as one control. */
.pd-split { display: inline-flex; flex-shrink: 0; }
.pd-split :deep(.pd-split-main) { border-top-right-radius: 0 !important; border-bottom-right-radius: 0 !important; }
.pd-split :deep(.pd-split-more) {
  border-top-left-radius: 0 !important; border-bottom-left-radius: 0 !important;
  margin-left: -1px; padding-left: var(--mp-spacing-1\.5) !important; padding-right: var(--mp-spacing-1\.5) !important;
}
/* Header label plus its info affordance. Inline-flex so the icon rides the text
   baseline instead of forcing the numeric column's right alignment open. */
.pd-th-info { display: inline-flex; align-items: center; gap: 4px; }
.pd-th-icon {
  display: inline-flex;
  color: var(--mp-icon-subdued, #9ca3af);
  cursor: help;
}
.pd-th-icon:hover { color: var(--mp-icon-default, #4b5563); }

.pd-bulk-count { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pd-cell-sub--warning { color: var(--mp-colors-text-warning); }
.pd-bulk-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pd-table-scroll { overflow-x: auto; }
.pd-table { width: 100%; min-width: max-content; border-collapse: collapse; }
.pd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.pd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pd-tx-number { color: var(--mp-text-default); }
.pd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top; white-space: nowrap; background: var(--mp-background-neutral);
}
.pd-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
/* Edit mode is a form table (docs/patterns/FormTable.md): read-only cells go gray,
   the two editable cells stay white, own their border + focus ring, and the input
   inside is borderless and fills the 40px baseline (rule/table-form-cell-no-border,
   rule/table-nonform-bg-gray). */
.pd-form-table .pd-td { background: var(--mp-background-neutral-subtle); border-right: 1px solid var(--mp-border-default); }
.pd-form-table .pd-td:last-child { border-right: none; }
.pd-form-table .pd-td--input { padding: 0; background: var(--mp-background-neutral); position: relative; vertical-align: top; }
.pd-form-table .pd-td--input :deep([class*='input']) {
  width: 100%; height: var(--mp-sizes-10);
  border-color: transparent; border-radius: 0; box-shadow: none !important; /* pixel-police-allow-shadow: strips the input's own ring, the cell draws it */
  text-align: right; font-variant-numeric: tabular-nums;
}
/* A cell whose only content is the input (no "Use default" / "Use calculated" link or caption
   under it) lets the input fill the whole cell, so no empty band is left under it. */
.pd-form-table .pd-td--input:has(> :only-child) { height: 1px; }
/* Suffix (days / unit) inside an input cell: Pixel lays the addon over the input's padding,
   which leaves a white gap between the number and the segment. In a cell it sits in the flow
   instead — the input takes what is left, the addon is a flush subtle segment at the end. */
.pd-form-table .pd-td--input :deep([class*='input-group']) { display: flex; width: 100%; height: var(--mp-sizes-10); }
.pd-form-table .pd-td--input :deep([class*='input-group'] > [class*='input__root']) { flex: 1 1 0; width: auto; min-width: 0; }
.pd-form-table .pd-td--input :deep([class*='input-group'] [class*='input__control']) { padding-right: var(--mp-spacing-2); }
.pd-form-table .pd-td--input :deep([class*='input-addon']) {
  position: static; inset: auto; transform: none; flex: 0 0 auto; width: auto; height: auto; align-self: stretch;
  display: flex; align-items: center; padding: 0 var(--mp-spacing-3);
  text-align: left; border-radius: 0; border-color: transparent;
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary);
}
.pd-form-table .pd-td--input:has(> :only-child) :deep([class*='input']) { height: 100%; }
.pd-form-table .pd-td--input:has(> :only-child):focus-within::after,
.pd-form-table .pd-td--error:has(> :only-child)::after { height: auto; bottom: 0; }
.pd-form-table .pd-td--input:focus-within::after,
.pd-form-table .pd-td--error::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10);
  border: 1px solid var(--mp-border-bold); pointer-events: none;
}
.pd-form-table .pd-td--error { background: var(--mp-colors-background-danger); }
.pd-form-table .pd-td--error::after { border-color: var(--mp-colors-border-danger); }
.pd-form-table .pd-td--error :deep([class*='input']) { background: transparent; }
.pd-form-table .pd-td--input > .pd-cell-sub,
.pd-form-table .pd-td--input > .pd-cell-warn,
.pd-form-table .pd-td--input > .pd-cell-link { margin-right: var(--mp-spacing-2); }
.pd-form-table .pd-td--input > .pd-cell-sub,
.pd-form-table .pd-td--input > .pd-cell-warn { padding-right: var(--mp-spacing-2); margin-right: 0; }
.pd-form-table .pd-td--select { padding: 0; background: var(--mp-background-neutral); position: relative; }
.pd-form-table .pd-td--select:focus-within::after {
  content: ''; position: absolute; inset: 0; border: 1px solid var(--mp-border-bold); pointer-events: none;
}
/* Custom single-root select trigger: the cell owns the border and focus ring. */
.pd-select-trigger {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-2);
  min-height: var(--mp-sizes-10); padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-3);
  cursor: pointer; text-align: left;
}
.pd-select-text { display: flex; flex-direction: column; min-width: 0; }
.pd-select-text .pd-vendor-name { overflow-wrap: anywhere; }
.pd-select-chevron { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5); }
.pd-wh-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4);
  margin-top: var(--mp-spacing-4);
}
.pd-wh-error { margin: 0 auto 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
.pd-td--action { text-align: right; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.pd-tx-number { color: var(--mp-text-default); }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }
.pd-tr:hover .pd-td { background: var(--mp-background-neutral-hovered); }

/* Number / Warehouse cells — the value links to the record's detail */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Expiration date cell — warning icon + tint when a batch is near/past expiry
   (mirrors StockTables.vue's wh-expiry-cell) */
.pd-expiry-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); white-space: nowrap; }
.pd-expiry-cell--danger { color: var(--mp-text-danger, #a8352d); }
.pd-expiry-warn { display: inline-flex; align-items: center; color: var(--mp-text-danger, #a8352d); flex-shrink: 0; cursor: default; }

/* Movement cell: signed delta (green/red) + small caption lines */
.pd-movement { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.pd-movement--pos { color: var(--mp-text-success, #0f6d4d); }
.pd-movement--neg { color: var(--mp-text-danger); }
.pd-movement-caption {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

/* ── Empty state (illustrated — matches every other index/detail page) ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: auto; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0 0 var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.pd-notfound { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10) 0; }

/* Section title above a tab's table (matches PickingTaskDetailsPage.vue's "Sales orders") */
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pd-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.pd-section-head .linked-section-title { margin: 0; }
.detail-btn--secondary { background: var(--mp-background-neutral, #fff); border-color: var(--mp-text-default, #080d0e); color: var(--mp-text-default); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* ── Unit conversions ── */
.pd-unit-panel { display: flex; flex-direction: column; }
.pd-unit-intro { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-3); }
.pd-unit-empty {
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.pd-unit-add {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4); flex-wrap: wrap;
}
.pd-unit-add-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pd-unit-eq { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pd-unit-error { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.pd-uc-remove {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.pd-uc-remove:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-danger); }

/* ── Vendors ── */
.pd-vendor-panel { display: flex; flex-direction: column; }
.pd-vendor-name { display: block; color: var(--mp-text-default); }
.pd-vendor-note {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle);
}
.pd-vendor-none { color: var(--mp-text-secondary); }
.pd-vendor-alt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

/* The vendor name and its unit note, stacked, left of the chevron. */
.pd-vendor-cell { display: flex; flex-direction: column; min-width: 0; }
/* The warehouse lines opened under a vendor: lighter, and joined to the row above. */
.pd-tr--sub > .pd-td { background: var(--mp-background-neutral-subtle); border-bottom-color: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pd-tr--sub:last-of-type > .pd-td, .pd-tr--sub:has(+ .pd-tr:not(.pd-tr--sub)) > .pd-td { border-bottom-color: var(--mp-border-default); }
.pd-wh-name--top { align-items: flex-start; }
/* The estimate basis sits on its own line under the days, not beside them. */
.pd-lead-est--below { display: block; margin-left: 0; margin-top: 2px; }
.pd-lead-est { margin-left: 4px; color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-xs, 11px); }
</style>
