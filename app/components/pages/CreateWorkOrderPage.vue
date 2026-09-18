<script setup lang="ts">
/**
 * New work order — Production module create form. Built from the Figma reference
 * (Production / Work Order / New Work Order) using the ERP create-page shell
 * (.detail-page + scrollable stage + sticky footer) and the shared .cr-table
 * line-item pattern. Reference only — components/patterns follow pixel-erp docs.
 *
 * Sections: Work order info · Raw materials · Production cost · Routing ·
 * (cost summary) · Finished goods (Main output / Other outputs / Production waste).
 */
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpInputGroup, MpInputRightAddon, MpDatePicker, MpButton, MpIcon,
  MpCheckbox, MpRadio, MpTooltip, MpBadge, toast,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { FULL_CATALOG as CATALOG } from '~/data/catalog'
import { warehouses } from '~/data/warehouses'
import { workOrderLinks } from '~/data/workOrderLinks'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import SubconMethodChip from '~/components/patterns/SubconMethodChip.vue'
import SubconPlanPreview from '~/components/patterns/SubconPlanPreview.vue'
import {
  SUBCON_VENDORS, DEFAULT_SUBCON_VENDOR, SUBCON_SCOPE_LABEL,
  PRODUCTION_WAREHOUSE, SUBCON_VENDOR_WAREHOUSES,
  SUBCON_METHOD_LABEL, SUBCON_METHOD_DESCRIPTION,
  SUBCON_SERVICE_PRODUCTS, subconServiceProduct, SUBCON_COST_DRIVERS,
  type SubconScope, type SubconSplit, type SubconMethod,
} from '~/data/subcon'
import { formatDate } from '~/utils/date'
import { billOfMaterials, catalogProduct, type BillOfMaterials } from '~/data/billOfMaterials'
import { addWorkOrder, type WorkOrderStatus, type WorkOrderMaterialReservation } from '~/data/workOrders'
import { isBatchTracked, isSerialized } from '~/data/warehouseDetails'
import PickSerialNumberDrawer from '~/components/patterns/PickSerialNumberDrawer.vue'
import PickBatchDrawer, { type PickedBatch } from '~/components/patterns/PickBatchDrawer.vue'

const { t } = useLocale()
const router = useRouter()
const route = useRoute()
function goList() { router.push('/work-orders') }

// ── Creation flow (Default vs From production request) ────────────────────────
// From-PR adds the Linked transactions section; preselected when arriving ?source=pr.
type Flow = 'default' | 'production-request'
const flow = ref<Flow>(route.query.source === 'pr' ? 'production-request' : 'default')
const flowOptions: { value: Flow; label: string }[] = [
  { value: 'default', label: t('Default') },
  { value: 'production-request', label: t('From production request') },
]
const fromProductionRequest = computed(() => flow.value === 'production-request')

// ── Option lists ────────────────────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { id: 'Standard', name: 'Standard' },
  { id: 'Order', name: 'Order' },
  // Subcontracting turns on the vendor setup below — the work itself is performed
  // outside, so the work order also has to raise the documents that get it there.
  { id: 'Subcontracting', name: 'Subcontracting' },
]
const WO_TYPE_OPTIONS = [
  { id: 'Assembly', name: 'Assembly' },
  { id: 'Disassembly', name: 'Disassembly' },
]
// Work orders can only be raised from an already-created BOM — the dropdown lists
// the real (persisted) BOM catalog, newest first.
const BOM_OPTIONS = computed(() => billOfMaterials.map(b => ({ id: b.id, name: b.name, no: b.number })))
function findBom(id: string): BillOfMaterials | undefined { return billOfMaterials.find(b => b.id === id) }

// A BOM's own option vocabulary (account/cost-driver/process/mapping labels) may not
// match this form's fixed option ids — synthesize a matching option (id = slug of the
// label) so the in-cell autocomplete always displays the real BOM value correctly.
function ensureOption(options: { id: string; name: string }[], label: string): string {
  const existing = options.find(o => o.name === label)
  if (existing) return existing.id
  const id = `bom-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  options.push({ id, name: label })
  return id
}
const productOptions = CATALOG.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.price, sku: p.sku }))
const warehouseOptions = warehouses
  .filter(w => !w.isDefault && w.status === 'active')
  .map(w => ({ id: w.id, name: w.name }))
const UNIT_OPTIONS = [...new Set(CATALOG.map(p => p.unit))].map(u => ({ id: u, name: u }))
const COST_ACCOUNT_OPTIONS = [
  { id: 'labour', name: 'Direct labor' },
  { id: 'overhead', name: 'Manufacturing overhead' },
  { id: 'electricity', name: 'Electricity' },
  { id: 'depreciation', name: 'Machine depreciation' },
]
const COST_DRIVER_OPTIONS = [
  { id: 'labour-hour', name: 'Labor hour' },
  { id: 'machine-hour', name: 'Machine hour' },
  { id: 'unit', name: 'Unit produced' },
]
const PROCESS_OPTIONS = [
  { id: 'assembly', name: 'Assembly' },
  { id: 'painting', name: 'Painting' },
  { id: 'finishing', name: 'Finishing & packing' },
  { id: 'qc', name: 'Quality control' },
]
// A subcon work order buys a service instead of running its own processes, so its
// cost lines are NON-TRACK service products (the same list the BOM costs against),
// not in-house labour/overhead/routing accounts.
const SUBCON_PRODUCT_OPTIONS = SUBCON_SERVICE_PRODUCTS.map(p => ({
  id: p.id, name: `${p.name} · ${p.sku}`,
}))
const SUBCON_COST_DRIVER_OPTIONS = SUBCON_COST_DRIVERS.map(d => ({ id: d, name: d }))
const ACCOUNT_MAPPING_OPTIONS = [
  { id: 'wip', name: 'Work in process' },
  { id: 'routing-cost', name: 'Routing cost' },
  { id: 'waste', name: 'Production waste' },
]
const ALLOCATION_METHOD_OPTIONS = [
  { id: 'percentage', name: 'Percentage' },
  { id: 'quantity', name: 'Quantity' },
]

// ── Work order info ──────────────────────────────────────────────────────────
const category = ref('')
const categoryError = ref(false)
const bomId = ref('')
const bomError = ref(false)
const workOrderType = ref('')
const workOrderTypeError = ref(false)
const trackRouting = ref<'yes' | 'no'>('yes')
const planDates = ref<Date[]>([])
const planDatesError = ref(false)
const producedQty = ref('')
const createAsSubAssembly = ref(false)

// ── Subcontracting ───────────────────────────────────────────────────────────
// Only meaningful when Category = Subcontracting. The three choices below decide
// which purchase requests / transfers / receipts this work order raises; the plan
// is previewed live so that consequence is visible before saving.
const isSubcon = computed(() => category.value === 'Subcontracting')
const subconScope = ref<SubconScope>('finished-good')
const subconSplit = ref<SubconSplit>('full')
const subconMethod = ref<SubconMethod>('resupply')
const subconVendorId = ref(DEFAULT_SUBCON_VENDOR.id)
const subconPromisedDate = ref('')
// Where components leave from, and where the vendor's output comes back to.
// The DESTINATION of the transfer is the vendor's own location, not a company
// warehouse, so it is derived from the chosen vendor rather than picked.
const subconWarehouseId = ref(DEFAULT_SUBCON_VENDOR.warehouseId ?? '')
const subconReceivingWarehouseId = ref(PRODUCTION_WAREHOUSE.id)
const subconDateError = ref(false)

const SUBCON_VENDOR_OPTIONS = SUBCON_VENDORS
  .filter(v => v.role === 'subcon')
  .map(v => ({ id: v.id, name: v.name }))

const subconVendor = computed(() =>
  SUBCON_VENDORS.find(v => v.id === subconVendorId.value) ?? DEFAULT_SUBCON_VENDOR)

const SUBCON_SCOPE_OPTIONS = (Object.keys(SUBCON_SCOPE_LABEL) as SubconScope[])
  .map(k => ({ id: k, name: t(SUBCON_SCOPE_LABEL[k]) }))

const SUBCON_SPLIT_OPTIONS = [
  { id: 'full', name: t('Full quantity') },
  { id: 'partial', name: t('Partial (split)') },
]

// Each method's label says WHO supplies the components — the distinction that
// decides the document chain. The chosen one's detail shows as a caption.
const SUBCON_METHOD_OPTIONS = (Object.keys(SUBCON_METHOD_LABEL) as SubconMethod[]).map(m => ({
  id: m,
  name: `${m === 'basic' ? t('By the subcon vendor')
    : m === 'resupply' ? t('By the company itself')
    : t('By a 3rd-party vendor')} · ${t(SUBCON_METHOD_LABEL[m])}`,
}))

const subconMethodLabel = computed(() => (subconScope.value === 'finished-good'
  ? t('How are components procured?')
  : t('How does the raw material reach the vendor?')))

const subconMethodHint = computed(() => t(SUBCON_METHOD_DESCRIPTION[subconScope.value][subconMethod.value]))

/** Only `resupply` moves stock out of a company warehouse. */
const subconNeedsSource = computed(() => subconMethod.value === 'resupply')


// The vendor's own locations. Changing vendor re-points the destination unless
// the user has deliberately chosen a different one.
const SUBCON_WAREHOUSE_OPTIONS = SUBCON_VENDOR_WAREHOUSES.map(w => ({ id: w.id, name: w.name }))
watch(subconVendorId, (id) => {
  const own = SUBCON_VENDORS.find(v => v.id === id)?.warehouseId
  const belongsToAnotherVendor = SUBCON_VENDOR_WAREHOUSES
    .some(w => w.id === subconWarehouseId.value && w.vendorId !== id)
  if (own && (!subconWarehouseId.value || belongsToAnotherVendor)) subconWarehouseId.value = own
})
function subconWarehouseNameOf(id: string) {
  return SUBCON_WAREHOUSE_OPTIONS.find(w => w.id === id)?.name ?? ''
}

function warehouseName(id: string) {
  return warehouseOptions.find(w => w.id === id)?.name ?? ''
}

/** A subcon work order cannot raise its supply documents while it is still a draft. */
const subconGateText = t('Saving this work order creates it as a draft. Supply the vendor first — raise the component transfer or purchase request — then start the work order, which issues the components and unlocks the rest of the run.')


const bomNo = computed(() => BOM_OPTIONS.value.find(b => b.id === bomId.value)?.no ?? '')
const bomAllowsAdjustment = computed(() => findBom(bomId.value)?.allowBomAdjustment ?? false)

// The line-item sections (raw materials → finished goods) only exist once a BOM is
// chosen — that BOM defines them. While its data "loads", the sections render with
// skeleton placeholder rows (Figma: default state = info only; loading = skeletons).
const hasBom = computed(() => !!bomId.value)
const bomLoading = ref(false)
let bomTimer: ReturnType<typeof setTimeout> | null = null

function onBomSelect(id: string) {
  bomError.value = false
  if (bomTimer) { clearTimeout(bomTimer); bomTimer = null }
  if (id) {
    bomLoading.value = true
    bomTimer = setTimeout(() => {
      fillFromBom(id)
      bomLoading.value = false
    }, 600)
  } else {
    resetLineItems()
    bomLoading.value = false
  }
}
onUnmounted(() => { if (bomTimer) clearTimeout(bomTimer) })

// Prefill from the "Create work order" entry points that already know which BOM to
// use — the Production Request bulk modal and the BOM detail page's own
// "Create work order" button both arrive via ?bomId=<real BOM id>.
const presetBomId = route.query.bomId as string | undefined
if (presetBomId && findBom(presetBomId)) {
  if (!category.value) category.value = 'Standard'
  bomId.value = presetBomId
  onBomSelect(presetBomId)
}

// ── Attachment ───────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])
function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) {
    for (const f of Array.from(input.files)) {
      if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
    }
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

// ── Formatters ───────────────────────────────────────────────────────────────
const num = (v: string) => Number(v) || 0
const productName = (id: string) => productOptions.find(p => p.id === id)?.name ?? ''

// ── Raw materials ────────────────────────────────────────────────────────────
interface RawRow {
  id: number; productId: string; purchaseCost: number; warehouseId: string; needed: string; unit: string; requiredDate: string
  /** Batch/serial units reserved for this row — picked up front via Manage batch/serial number. */
  batchSelection: PickedBatch[]
  serialSelection: string[]
}
let rawSeq = 0
const makeRaw = (): RawRow => ({ id: rawSeq++, productId: '', purchaseCost: 0, warehouseId: '', needed: '', unit: '', requiredDate: '', batchSelection: [], serialSelection: [] })
const rawRows = ref<RawRow[]>([makeRaw()])

/**
 * Where a subcon transfer draws FROM. Not a field: each component line already
 * names its warehouse, so asking again would invite the two to disagree. Takes
 * the first component that has one — the transfer form lets the operator change
 * it if components span warehouses.
 */
const subconSourceWarehouseId = computed(() =>
  rawRows.value.find(r => r.productId && r.warehouseId)?.warehouseId ?? '')
const bulkSetWarehouse = ref(false)
function onRawProduct(row: RawRow, id: string) {
  const p = CATALOG.find(c => c.id === id)
  row.purchaseCost = p?.price ?? 0
  if (p && !row.unit) row.unit = p.unit
  row.batchSelection = []
  row.serialSelection = []
  appendIfLast(rawRows, row.id, makeRaw)
}
function onRawWarehouse(row: RawRow) {
  row.batchSelection = []
  row.serialSelection = []
}

// ── Reserve batch/serial number — picked up front, consumed later by the
// Material consume & return flow (see NewMaterialRecordPage.vue, which
// pre-fills its own pick drawer from whatever of this reservation is left). ──
function trackingTypeFor(productId: string): 'serial' | 'batch' | undefined {
  const category = catalogProduct(productId)?.category ?? ''
  if (isSerialized(category)) return 'serial'
  if (isBatchTracked(category)) return 'batch'
  return undefined
}
function reservedCount(row: RawRow): number {
  return trackingTypeFor(row.productId) === 'serial'
    ? row.serialSelection.length
    : row.batchSelection.reduce((s, b) => s + b.qty, 0)
}
const activeRawDrawerRow = ref<RawRow | null>(null)
function openRawTracking(row: RawRow) {
  if (!row.warehouseId) { toast.notify({ variant: 'warning', title: t('Select warehouse first') }); return }
  if (!num(row.needed)) { toast.notify({ variant: 'warning', title: t('Input the needed qty first') }); return }
  activeRawDrawerRow.value = row
}
function closeRawTracking() { activeRawDrawerRow.value = null }
function onRawSerialDrawerSave(serials: string[]) { if (activeRawDrawerRow.value) activeRawDrawerRow.value.serialSelection = serials }
function onRawBatchDrawerSave(batches: PickedBatch[]) { if (activeRawDrawerRow.value) activeRawDrawerRow.value.batchSelection = batches }
const rawDrawerWarehouseName = computed(() => warehouseOptions.find(w => w.id === activeRawDrawerRow.value?.warehouseId)?.name ?? '')
const rawEstimated = (r: RawRow) => num(r.needed) * r.purchaseCost
const rawSubtotal = computed(() => rawRows.value.reduce((s, r) => s + rawEstimated(r), 0))

// ── Production cost ──────────────────────────────────────────────────────────
interface CostRow { id: number; account: string; costDriver: string; estUnitCost: string; multiplier: string }
let costSeq = 0
const makeCost = (): CostRow => ({ id: costSeq++, account: '', costDriver: '', estUnitCost: '', multiplier: '' })
const costRows = ref<CostRow[]>([makeCost()])
function onCostAccount(row: CostRow, _id: string) { appendIfLast(costRows, row.id, makeCost) }
const costAmount = (r: CostRow) => num(r.estUnitCost) * num(r.multiplier)
const productionCostSubtotal = computed(() => costRows.value.reduce((s, r) => s + costAmount(r), 0))

// ── Routing ──────────────────────────────────────────────────────────────────
interface RouteRow { id: number; process: string; description: string; accountMapping: string; amount: string }
let routeSeq = 0
const makeRoute = (): RouteRow => ({ id: routeSeq++, process: '', description: '', accountMapping: '', amount: '' })
const routeRows = ref<RouteRow[]>([makeRoute()])
function onRouteProcess(row: RouteRow, _id: string) { appendIfLast(routeRows, row.id, makeRoute) }
const routingSubtotal = computed(() => routeRows.value.reduce((s, r) => s + num(r.amount), 0))

// ── Subcon cost ──────────────────────────────────────────────────────────────
// Replaces Production cost + Routing on a Subcontracting work order: the work is
// performed outside, so there is no in-house labour, overhead or routing to cost —
// what the order carries is the vendor's fee. Pre-filled from the BOM's subcon
// process so the common case needs no typing.
interface SubconCostRow {
  id: number
  /** Non-track service product id (SUBCON_SERVICE_PRODUCTS). */
  productId: string
  costDriver: string
  amount: string
}
let subconCostSeq = 0
function makeSubconCost(partial: Partial<SubconCostRow> = {}): SubconCostRow {
  return { id: subconCostSeq++, productId: '', costDriver: '', amount: '', ...partial }
}
const subconCostRows = ref<SubconCostRow[]>([makeSubconCost()])

/** The service the vendor performs, which depends on how much is subcontracted. */
const scopeServiceId = computed(() => (subconScope.value === 'finished-good' ? 'svc-roast-pack' : 'svc-roast'))

/**
 * The lines to start from. A Subcontracting BOM defines its own services — those
 * ARE this order's subcon cost, so they win. The scope-derived pair below is only
 * the fallback for a BOM that predates the Subcon cost section.
 */
function defaultSubconCostRows(): SubconCostRow[] {
  const fromBom = findBom(bomId.value)?.subconCost ?? []
  if (fromBom.length) {
    return [
      ...fromBom.map(l => makeSubconCost({
        productId: l.productId, costDriver: l.costDriver, amount: String(l.amount),
      })),
      makeSubconCost(),
    ]
  }
  const service = subconServiceProduct(scopeServiceId.value)!
  const freight = subconServiceProduct('svc-handling')!
  return [
    makeSubconCost({ productId: service.id, costDriver: service.defaultCostDriver, amount: String(service.defaultPrice) }),
    makeSubconCost({ productId: freight.id, costDriver: freight.defaultCostDriver, amount: String(freight.defaultPrice) }),
    makeSubconCost(),
  ]
}

/** True while the table still holds exactly what we pre-filled — i.e. untouched. */
function subconCostUntouched(): boolean {
  const rows = subconCostRows.value.filter(r => r.productId)
  if (rows.length !== 2) return false
  const serviceIds = ['svc-roast-pack', 'svc-roast']
  const service = subconServiceProduct(rows[0]!.productId)
  return serviceIds.includes(rows[0]!.productId)
    && rows[0]!.amount === String(service?.defaultPrice)
    && rows[1]!.productId === 'svc-handling'
    && rows[1]!.amount === String(subconServiceProduct('svc-handling')?.defaultPrice)
}

// Seed on entering Subcontracting, and re-seed when the scope changes which
// service applies — but never overwrite figures the user has edited.
watch([isSubcon, subconScope, bomId], ([on]) => {
  if (!on) return
  const empty = subconCostRows.value.every(r => !r.productId)
  if (empty || subconCostUntouched()) subconCostRows.value = defaultSubconCostRows()
}, { immediate: true })

/** Picking a service fills its usual driver and price — both still editable. */
function onSubconCostProduct(row: SubconCostRow, id: string) {
  const p = subconServiceProduct(id)
  if (!p) return
  row.costDriver = p.defaultCostDriver
  if (!row.amount) row.amount = String(p.defaultPrice)
  appendIfLast(subconCostRows, row.id, makeSubconCost)
}
const subconCostSubtotal = computed(() => subconCostRows.value.reduce((s, r) => s + num(r.amount), 0))

// ── Cost summary ─────────────────────────────────────────────────────────────
// On a subcon work order the vendor's fee stands in for production + routing.
const totalProductionCost = computed(() => (isSubcon.value
  ? rawSubtotal.value + subconCostSubtotal.value
  : rawSubtotal.value + productionCostSubtotal.value + routingSubtotal.value))

// ── Finished goods: main output / other outputs ──────────────────────────────
interface OutputRow { id: number; productId: string; sku: string; producedQty: string; unit: string; percentage: string; estCost: string }
let mainSeq = 0, otherSeq = 0
const makeOutput = (seq: () => number): OutputRow => ({ id: seq(), productId: '', sku: '', producedQty: '', unit: '', percentage: '', estCost: '' })
const mainRows = ref<OutputRow[]>([makeOutput(() => mainSeq++)])
const otherRows = ref<OutputRow[]>([makeOutput(() => otherSeq++)])
const makeOther = (): OutputRow => makeOutput(() => otherSeq++)
function onOtherProduct(row: OutputRow, id: string) {
  const p = CATALOG.find(c => c.id === id)
  if (p) { row.sku = p.sku; if (!row.unit) row.unit = p.unit }
  appendIfLast(otherRows, row.id, makeOther)
}
const mainOutputSubtotal = computed(() => mainRows.value.reduce((s, r) => s + num(r.estCost), 0))
const otherOutputsSubtotal = computed(() => otherRows.value.reduce((s, r) => s + num(r.estCost), 0))

// ── Finished goods: production waste ─────────────────────────────────────────
interface WasteRow { id: number; accountMapping: string; allocationMethod: string; percentage: string; amount: string }
let wasteSeq = 0
const makeWaste = (): WasteRow => ({ id: wasteSeq++, accountMapping: '', allocationMethod: '', percentage: '', amount: '' })
const wasteRows = ref<WasteRow[]>([makeWaste()])
function onWasteMapping(row: WasteRow, _id: string) { appendIfLast(wasteRows, row.id, makeWaste) }
const wasteSubtotal = computed(() => wasteRows.value.reduce((s, r) => s + num(r.amount), 0))
const finishedGoodsTotal = computed(() => mainOutputSubtotal.value + otherOutputsSubtotal.value - wasteSubtotal.value)

// ── Shared row helpers ───────────────────────────────────────────────────────
// Append a fresh empty row once the last row's key cell gets a value.
function appendIfLast<T extends { id: number }>(rowsRef: { value: T[] }, rowId: number, make: () => T) {
  const arr = rowsRef.value
  const last = arr[arr.length - 1]
  if (last && last.id === rowId) rowsRef.value.push(make())
}
function removeRow<T extends { id: number }>(rowsRef: { value: T[] }, id: number) {
  if (rowsRef.value.length === 1) return
  rowsRef.value = rowsRef.value.filter(r => r.id !== id)
}

// ── Fill from the selected BOM ──────────────────────────────────────────────────
// A work order can only be created from an already-created BOM — every line-item
// section below is populated from that BOM's OWN stored raw materials / production
// cost / routing / finished goods (see app/data/billOfMaterials.ts), not a dummy
// example. Option ids come from this form's fixed lists where they match, else a
// matching option is synthesized (ensureOption) so the BOM's real values display.
function todayDDMMYYYY(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function fillFromBom(id: string) {
  const bom = findBom(id)
  if (!bom) { resetLineItems(); return }
  const wh = warehouseOptions[0]?.id ?? ''
  const reqDate = todayDDMMYYYY()

  rawRows.value = bom.rawMaterials.map(r => ({
    id: rawSeq++, productId: r.productId, purchaseCost: r.purchaseCost, warehouseId: wh,
    needed: String(r.needed), unit: r.unit, requiredDate: reqDate,
    batchSelection: [], serialSelection: [],
  }))
  if (bom.allowBomAdjustment) rawRows.value.push(makeRaw())

  costRows.value = bom.productionCost.map(c => ({
    id: costSeq++,
    account: ensureOption(COST_ACCOUNT_OPTIONS, c.account),
    costDriver: ensureOption(COST_DRIVER_OPTIONS, c.costDriver),
    estUnitCost: String(c.amount),
    multiplier: '1',
  }))
  costRows.value.push(makeCost())

  routeRows.value = bom.routing.map(r => ({
    id: routeSeq++,
    process: ensureOption(PROCESS_OPTIONS, r.process),
    description: r.description,
    accountMapping: ensureOption(ACCOUNT_MAPPING_OPTIONS, r.accountMapping),
    amount: String(r.amount),
  }))
  routeRows.value.push(makeRoute())

  // Main output is a single row defined by the BOM — no trailing/empty row (it can't
  // be added to, changed, or removed; only the produced qty is editable).
  const fg = catalogProduct(bom.finishedGoodId)
  const rawSubtotal = bom.rawMaterials.reduce((s, r) => s + r.needed * r.purchaseCost, 0)
  const productionCostSubtotal = bom.productionCost.reduce((s, c) => s + c.amount, 0)
  const routingSubtotal = bom.routing.reduce((s, r) => s + r.amount, 0)
  const otherOutputsSubtotal = bom.otherOutputs.reduce((s, o) => s + o.estCost, 0)
  const wasteSubtotalBom = bom.productionWaste.reduce((s, w) => s + w.amount, 0)
  const totalCost = rawSubtotal + productionCostSubtotal + routingSubtotal
  const mainEstCost = Math.max(0, totalCost - otherOutputsSubtotal - wasteSubtotalBom)
  mainRows.value = [
    { id: mainSeq++, productId: bom.finishedGoodId, sku: fg?.sku ?? '', producedQty: String(bom.finishedGoodQty), unit: bom.finishedGoodUnit, percentage: String(bom.finishedGoodPercentage), estCost: String(Math.round(mainEstCost)) },
  ]
  otherRows.value = bom.otherOutputs.map(o => {
    const p = catalogProduct(o.productId)
    return { id: otherSeq++, productId: o.productId, sku: p?.sku ?? '', producedQty: String(o.qty), unit: o.unit, percentage: String(o.percentage), estCost: String(o.estCost) }
  })
  otherRows.value.push(makeOutput(() => otherSeq++))
  wasteRows.value = bom.productionWaste.map(w => ({
    id: wasteSeq++,
    accountMapping: ensureOption(ACCOUNT_MAPPING_OPTIONS, w.accountMapping),
    allocationMethod: ensureOption(ALLOCATION_METHOD_OPTIONS, w.allocationMethod),
    percentage: String(w.percentage),
    amount: String(w.amount),
  }))
  wasteRows.value.push(makeWaste())

  // Complete the header for a filled-form look (only where the user hasn't typed).
  if (!producedQty.value) producedQty.value = String(bom.finishedGoodQty)
}

// Clearing the BOM removes its (BOM-derived) line items.
function resetLineItems() {
  rawRows.value = [makeRaw()]
  costRows.value = [makeCost()]
  routeRows.value = [makeRoute()]
  mainRows.value = [makeOutput(() => mainSeq++)]
  otherRows.value = [makeOutput(() => otherSeq++)]
  wasteRows.value = [makeWaste()]
}

// ── Save ─────────────────────────────────────────────────────────────────────
function validate() {
  let ok = true
  if (!category.value) { categoryError.value = true; ok = false }
  if (!bomId.value) { bomError.value = true; ok = false }
  if (!workOrderType.value) { workOrderTypeError.value = true; ok = false }
  if (!planDates.value.length) { planDatesError.value = true; ok = false }
  // A subcon work order needs the date the vendor has committed to — everything
  // downstream (overdue tracking, the custody dashboard) is measured against it.
  if (isSubcon.value && !subconPromisedDate.value) { subconDateError.value = true; ok = false }
  return ok
}
// [startDate, endDate] → ISO start/end (planDates is validated non-empty before this runs).
// Builds the ISO string from local date parts (not toISOString(), which converts to
// UTC and can shift the date back a day in timezones ahead of UTC, e.g. WIB).
function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseDateRange(v: Date[]): { start: string; end: string } {
  const today = toLocalIso(new Date())
  const start = v[0] ? toLocalIso(v[0]) : today
  return { start, end: v[1] ? toLocalIso(v[1]) : start }
}

/** Warehouse per component line, so the detail page and any subcon transfer can
 *  read where each material actually comes from. */
function buildComponentWarehouses(): Record<string, { id: string; name: string }> | undefined {
  const out: Record<string, { id: string; name: string }> = {}
  for (const row of rawRows.value) {
    if (!row.productId || !row.warehouseId) continue
    out[row.productId] = { id: row.warehouseId, name: warehouseName(row.warehouseId) }
  }
  return Object.keys(out).length ? out : undefined
}

// Reservation attached to the saved WorkOrder — only tracked rows with an
// actual pick contribute an entry.
function buildMaterialReservations(): Record<string, WorkOrderMaterialReservation> | undefined {
  const out: Record<string, WorkOrderMaterialReservation> = {}
  for (const row of rawRows.value) {
    if (!row.productId) continue
    const type = trackingTypeFor(row.productId)
    if (type === 'serial' && row.serialSelection.length) out[row.productId] = { warehouseId: row.warehouseId, serialSelection: [...row.serialSelection] }
    else if (type === 'batch' && row.batchSelection.length) out[row.productId] = { warehouseId: row.warehouseId, batchSelection: row.batchSelection.map(b => ({ ...b })) }
  }
  return Object.keys(out).length ? out : undefined
}

// Save persists a real WorkOrder (linked to the chosen BOM) and opens its actual
// detail page — there is no distinct "draft" status yet, so both actions save the
// same "not started" record. The from-PR flag (+ its request no.) is preserved so
// the detail shows its Linked transactions tab.
function saveWorkOrder() {
  const bom = findBom(bomId.value)!
  const { start, end } = parseDateRange(planDates.value)
  return addWorkOrder({
    bomId: bomId.value,
    bomName: bom.name,
    category: category.value as 'Standard' | 'Order' | 'Subcontracting',
    type: workOrderType.value as 'Assembly' | 'Disassembly',
    trackRouting: trackRouting.value === 'yes',
    status: 'not started' as WorkOrderStatus,
    producedQty: 0,
    plannedQty: num(producedQty.value) || bom.finishedGoodQty,
    planStartDate: start,
    planEndDate: end,
    sourceProductionRequestNo: fromProductionRequest.value ? (route.query.prNumber as string | undefined) : undefined,
    materialReservations: buildMaterialReservations(),
    componentWarehouses: buildComponentWarehouses(),
    subcon: isSubcon.value
      ? {
          scope: subconScope.value,
          split: subconSplit.value,
          method: subconMethod.value,
          vendorId: subconVendor.value.id,
          vendorName: subconVendor.value.name,
          promisedDate: subconPromisedDate.value,
          sourceWarehouseId: subconNeedsSource.value ? subconSourceWarehouseId.value : undefined,
          sourceWarehouseName: subconNeedsSource.value ? warehouseName(subconSourceWarehouseId.value) : undefined,
          subconWarehouseId: subconNeedsSource.value ? subconWarehouseId.value : undefined,
          subconWarehouseName: subconNeedsSource.value ? subconWarehouseNameOf(subconWarehouseId.value) : undefined,
          receivingWarehouseId: subconReceivingWarehouseId.value,
          receivingWarehouseName: warehouseName(subconReceivingWarehouseId.value),
        }
      : undefined,
  })
}
function handleSave() {
  if (!validate()) return
  const wo = saveWorkOrder()
  toast.notify({ variant: 'success', title: t('Work order saved') })
  router.push(`/work-orders/${wo.id}${fromProductionRequest.value ? '?source=pr' : ''}`)
}
function handleSaveDraft() {
  if (!validate()) return
  const wo = saveWorkOrder()
  toast.notify({ variant: 'success', title: t('Work order saved as draft') })
  router.push(`/work-orders/${wo.id}${fromProductionRequest.value ? '?source=pr' : ''}`)
}

// ── Sticky footer float ──────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
  })
})
onUnmounted(() => { stageObserver?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goList">{{ t('Work orders') }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New work order') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <div class="wo-body">

        <!-- ══ Work order info ══════════════════════════════════════════════ -->
        <section class="wo-section">
          <h2 class="wo-section-title">{{ t('Work order info') }}</h2>
          <div class="wo-grid">
            <!-- Work order no. (auto) -->
            <MpFormControl id="wo-no" is-required>
              <div class="wo-label-row">
                <MpFormLabel>{{ t('Work order no.') }}</MpFormLabel>
                <span class="wo-label-icon" :title="t('Auto-generated')"><MpIcon name="settings" size="sm" /></span>
              </div>
              <MpInput id="wo-no-input" model-value="" :placeholder="t('Auto')" is-full-width is-disabled />
            </MpFormControl>

            <!-- Category -->
            <MpFormControl id="wo-category" is-required :is-invalid="categoryError">
              <MpFormLabel>{{ t('Category') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-category-ac" v-model="category" :data="CATEGORY_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select category')"
                is-clearable use-portal is-full-width :is-invalid="categoryError"
                @update:model-value="categoryError = false"
              />
              <MpFormErrorMessage>{{ t('You must select category') }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- BOM name -->
            <MpFormControl id="wo-bom" is-required :is-invalid="bomError">
              <MpFormLabel>{{ t('BOM name') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-bom-ac" v-model="bomId" :data="BOM_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select BOM')"
                is-searchable is-clearable use-portal is-full-width :is-invalid="bomError"
                @update:model-value="onBomSelect"
              />
              <MpFormErrorMessage>{{ t('You must select BOM name') }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- BOM no. (read-only, derived from the selected BOM) -->
            <MpFormControl id="wo-bomno">
              <MpFormLabel>{{ t('BOM no.') }}</MpFormLabel>
              <MpInput id="wo-bomno-input" :model-value="bomNo" :placeholder="t('Auto')" is-full-width is-disabled />
            </MpFormControl>

            <!-- Work order type -->
            <MpFormControl id="wo-type" is-required :is-invalid="workOrderTypeError">
              <MpFormLabel>{{ t('Work order type') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-type-ac" v-model="workOrderType" :data="WO_TYPE_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select type')"
                is-clearable use-portal is-full-width :is-invalid="workOrderTypeError"
                @update:model-value="workOrderTypeError = false"
              />
              <MpFormErrorMessage>{{ t('You must select work order type') }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Track routing -->
            <MpFormControl id="wo-routing" is-required>
              <MpFormLabel>{{ t('Track routing') }}</MpFormLabel>
              <div class="wo-radio-group">
                <label class="wo-radio-item">
                  <MpRadio id="wo-routing-yes" name="wo-routing" value="yes" :is-checked="trackRouting === 'yes'" @change="trackRouting = 'yes'" />
                  <span>{{ t('Yes') }}</span>
                </label>
                <label class="wo-radio-item">
                  <MpRadio id="wo-routing-no" name="wo-routing" value="no" :is-checked="trackRouting === 'no'" @change="trackRouting = 'no'" />
                  <span>{{ t('No') }}</span>
                </label>
              </div>
            </MpFormControl>

            <!-- Production plan dates -->
            <MpFormControl id="wo-plan" is-required :is-invalid="planDatesError">
              <MpFormLabel>{{ t('Production plan dates') }}</MpFormLabel>
              <div class="wo-datepicker">
                <MpDatePicker
                  id="wo-plan-dp" v-model="planDates" is-range format="DD/MM/YYYY"
                  :placeholder="t('Select date range')"
                  use-portal @update:model-value="planDatesError = false"
                />
              </div>
              <MpFormErrorMessage>{{ t('You must select production plan dates') }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Produced qty — input with an attached "Pcs" suffix addon -->
            <MpFormControl id="wo-qty">
              <MpFormLabel>{{ t('Produced qty') }}</MpFormLabel>
              <MpInputGroup id="wo-qty-group" is-full-width>
                <MpInput id="wo-qty-input" v-model="producedQty" type="number" placeholder="0" is-full-width />
                <MpInputRightAddon has-background>Pcs</MpInputRightAddon>
              </MpInputGroup>
            </MpFormControl>
          </div>

          <!-- Attachment -->
          <div class="wo-attachment">
            <div class="wo-section-label">{{ t('Attachment') }}</div>
            <input
              ref="fileInput" type="file" multiple
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              class="wo-file-hidden" @change="onFileChange"
            />
            <div class="wo-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">{{ t('Choose file') }}</MpButton>
              <span class="wo-attach-or">{{ t('or drag and drop here') }}</span>
            </div>
            <p class="wo-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 3 files per work order') }}</p>
            <ul v-if="attachedFiles.length" class="wo-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="wo-file-item">
                <MpIcon name="document" size="sm" />
                <span class="wo-file-name">{{ f.name }}</span>
                <button class="wo-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="minus-circular" size="sm" /></button>
              </li>
            </ul>
          </div>

          <label class="wo-checkbox-row">
            <MpCheckbox id="wo-subassembly" :is-checked="createAsSubAssembly" @change="createAsSubAssembly = !createAsSubAssembly" />
            <span>{{ t('Set as sub-assembly') }}</span>
          </label>
        </section>

        <!-- ══ Subcontracting ═══════════════════════════════════════════════
             Appears only for Category = Subcontracting. Five compact fields on
             the same grid as Work order info — the choices are consequential but
             they are still just fields, and stacking them as description cards
             pushed the rest of the form off-screen. The consequence they carry is
             shown once, as the document chain underneath. ═══════════════════ -->
        <section v-if="isSubcon" class="wo-section">
          <h2 class="wo-section-title">{{ t('Subcontracting') }}</h2>
          <p class="wo-section-desc">
            {{ t('This work is performed by an outside vendor. The setup below decides which documents the work order raises.') }}
          </p>

          <div class="wo-grid">
            <MpFormControl id="wo-subcon-vendor" is-required>
              <MpFormLabel>{{ t('Subcon vendor') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-subcon-vendor-ac" v-model="subconVendorId" :data="SUBCON_VENDOR_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select vendor')"
                is-searchable use-portal is-full-width
              />
            </MpFormControl>

            <MpFormControl id="wo-subcon-promised" is-required :is-invalid="subconDateError">
              <MpFormLabel>{{ t('Promised return date') }}</MpFormLabel>
              <MpInput
                id="wo-subcon-promised-input" v-model="subconPromisedDate" type="date" is-full-width
                :is-invalid="subconDateError" @update:model-value="subconDateError = false"
              />
              <MpFormErrorMessage v-if="subconDateError">
                {{ t('Pick the date the vendor has promised the goods back.') }}
              </MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="wo-subcon-scope" is-required>
              <MpFormLabel>{{ t('What is subcontracted') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-subcon-scope-ac" v-model="subconScope" :data="SUBCON_SCOPE_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select scope')"
                use-portal is-full-width
              />
            </MpFormControl>

            <MpFormControl id="wo-subcon-split" is-required>
              <MpFormLabel>{{ t('Quantity subcontracted') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-subcon-split-ac" v-model="subconSplit" :data="SUBCON_SPLIT_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select quantity')"
                use-portal is-full-width
              />
            </MpFormControl>

            <MpFormControl id="wo-subcon-method" is-required>
              <MpFormLabel>{{ subconMethodLabel }}</MpFormLabel>
              <MpAutocomplete
                id="wo-subcon-method-ac" v-model="subconMethod" :data="SUBCON_METHOD_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select supply method')"
                use-portal is-full-width
              />
              <!-- One caption instead of three description cards. -->
              <p class="wo-subcon-hint">{{ subconMethodHint }}</p>
            </MpFormControl>

            <!-- The vendor's own location. Stock sent here is in their custody
                 but still on the company's books, which is what the custody
                 dashboard reconciles — so it is a real, addressable destination,
                 not a company warehouse. -->
            <MpFormControl v-if="subconNeedsSource" id="wo-subcon-dest-wh" is-required>
              <MpFormLabel>{{ t('Transfer components to') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-subcon-dest-wh-ac" v-model="subconWarehouseId" :data="SUBCON_WAREHOUSE_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select subcon warehouse')"
                is-searchable use-portal is-full-width
              />
              <p class="wo-subcon-hint">{{ t('In the vendor\'s custody — still on your books until consumed.') }}</p>
            </MpFormControl>

            <MpFormControl id="wo-subcon-receiving-wh" is-required>
              <MpFormLabel>{{ t('Receive output into') }}</MpFormLabel>
              <MpAutocomplete
                id="wo-subcon-receiving-wh-ac" v-model="subconReceivingWarehouseId" :data="warehouseOptions"
                label-prop="name" value-prop="id" :placeholder="t('Select warehouse')"
                is-searchable use-portal is-full-width
              />
            </MpFormControl>
          </div>

          <!-- The consequence of the three choices, stated once and inline. -->
          <div class="wo-subcon-plan">
            <span class="wo-subcon-plan__label">{{ t('Documents this work order will raise') }}</span>
            <SubconPlanPreview
              compact
              :scope="subconScope"
              :split="subconSplit"
              :method="subconMethod"
              :qty="num(producedQty) || 500"
            />
          </div>

          <!-- The draft gate: nothing can be procured until the WO is started. -->
          <p class="wo-subcon-gate">
            <MpIcon name="info" size="sm" />
            {{ subconGateText }}
          </p>
        </section>

        <!-- ══ Raw materials ════════════════════════════════════════════════ -->
        <!-- The line-item sections appear only once a BOM is chosen (it defines them). -->
        <section v-if="hasBom" class="wo-section">
          <h2 class="wo-section-title">{{ t('Raw materials') }}</h2>
          <p class="wo-section-desc">{{ t('Unit purchase cost may change when inventory value adjusts.') }}</p>
          <label class="wo-checkbox-row wo-checkbox-row--tight">
            <MpCheckbox id="wo-bulk-wh" :is-checked="bulkSetWarehouse" @change="bulkSetWarehouse = !bulkSetWarehouse" />
            <span>{{ t('Bulk set warehouse') }}</span>
          </label>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:150px" /><col style="width:180px" />
                <col style="width:110px" /><col style="width:110px" /><col style="width:150px" />
                <col style="width:150px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Product') }}</th><th class="wo-th">{{ t('Purchase cost') }}</th><th class="wo-th">{{ t('Warehouse') }}</th>
                  <th class="wo-th">{{ t('Needed qty') }}</th><th class="wo-th">{{ t('Unit') }}</th><th class="wo-th">{{ t('Required date') }}</th>
                  <th class="wo-th wo-th--right">{{ t('Estimated cost') }}</th><th class="wo-th wo-th--del" />
                </tr>
              </thead>
              <tbody v-if="bomLoading">
                <tr v-for="n in 3" :key="`sk${n}`" class="wo-tr">
                  <td v-for="c in 7" :key="c" class="wo-td"><span class="wo-skel" /></td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
              <tbody v-else>
                <tr v-for="row in rawRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`raw-prod-${row.id}`" v-model="row.productId" :data="productOptions" label-prop="name" value-prop="id" :placeholder="t('Select product')" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onRawProduct(row, v)" />
                  </td>
                  <td class="wo-td wo-td--num"><template v-if="row.productId">{{ row.purchaseCost ? formatIDR(row.purchaseCost) : '—' }}</template></td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete v-if="row.productId" :id="`raw-wh-${row.id}`" v-model="row.warehouseId" :data="warehouseOptions" label-prop="name" value-prop="id" :placeholder="t('Select warehouse')" is-searchable is-clearable use-portal is-full-width @update:model-value="onRawWarehouse(row)" />
                  </td>
                  <td class="wo-td wo-td--input">
                    <MpInput v-if="row.productId" :id="`raw-need-${row.id}`" v-model="row.needed" type="number" placeholder="0" is-full-width />
                    <template v-if="row.productId && trackingTypeFor(row.productId)">
                      <span v-if="reservedCount(row) > 0" class="wo-tracked-hint">{{ reservedCount(row) }} {{ t('of') }} {{ num(row.needed) }} {{ t('selected') }}</span>
                      <a class="wo-tracking" @click.prevent="openRawTracking(row)">{{ trackingTypeFor(row.productId) === 'serial' ? t('Manage serial number') : t('Manage batch') }}</a>
                    </template>
                  </td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete v-if="row.productId" :id="`raw-unit-${row.id}`" v-model="row.unit" :data="UNIT_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select unit')" is-searchable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input">
                    <div v-if="row.productId" class="wo-datepicker"><MpDatePicker :id="`raw-date-${row.id}`" v-model="row.requiredDate" format="DD/MM/YYYY" value-type="format" placeholder="DD/MM/YYYY" is-clearable use-portal /></div>
                  </td>
                  <td class="wo-td wo-td--num wo-td--right"><template v-if="row.productId">{{ formatIDR(rawEstimated(row)) }}</template></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="row.productId && (!hasBom || bomAllowsAdjustment)" class="wo-del-btn" type="button" @click="removeRow(rawRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>{{ t('Estimated raw materials subtotal') }}</span>
            <span class="wo-subtotal-amount">{{ formatIDR(rawSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Production cost ══════════════════════════════════════════════
             In-house cost structure — a subcon work order has none, so this and
             Routing are replaced by the Subcon cost section below. ═══════════ -->
        <section v-if="hasBom && !isSubcon" class="wo-section">
          <h2 class="wo-section-title">{{ t('Production cost') }}</h2>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:200px" /><col style="width:180px" />
                <col style="width:140px" /><col style="width:180px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Cost account') }}</th><th class="wo-th">{{ t('Cost driver') }}</th><th class="wo-th">{{ t('Estimated unit cost') }}</th>
                  <th class="wo-th">{{ t('Multiplier') }}</th><th class="wo-th wo-th--right">{{ t('Amount') }}</th><th class="wo-th wo-th--del" />
                </tr>
              </thead>
              <tbody v-if="bomLoading">
                <tr v-for="n in 3" :key="`sk${n}`" class="wo-tr">
                  <td v-for="c in 5" :key="c" class="wo-td"><span class="wo-skel" /></td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
              <tbody v-else>
                <tr v-for="row in costRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`cost-acc-${row.id}`" v-model="row.account" :data="COST_ACCOUNT_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select cost account')" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onCostAccount(row, v)" />
                  </td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete v-if="row.account" :id="`cost-drv-${row.id}`" v-model="row.costDriver" :data="COST_DRIVER_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select cost driver')" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput v-if="row.account" :id="`cost-unit-${row.id}`" v-model="row.estUnitCost" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input"><MpInput v-if="row.account" :id="`cost-mult-${row.id}`" v-model="row.multiplier" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--num wo-td--right"><template v-if="row.account">{{ formatIDR(costAmount(row)) }}</template></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="row.account" class="wo-del-btn" type="button" @click="removeRow(costRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>{{ t('Production cost subtotal') }}</span>
            <span class="wo-subtotal-amount">{{ formatIDR(productionCostSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Routing ══════════════════════════════════════════════════════ -->
        <section v-if="hasBom && !isSubcon" class="wo-section">
          <h2 class="wo-section-title">{{ t('Routing') }}</h2>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col style="width:220px" /><col /><col style="width:200px" />
                <col style="width:180px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Process') }}</th><th class="wo-th">{{ t('Description') }}</th><th class="wo-th">{{ t('Account mapping') }}</th>
                  <th class="wo-th wo-th--right">{{ t('Amount') }}</th><th class="wo-th wo-th--del" />
                </tr>
              </thead>
              <tbody v-if="bomLoading">
                <tr v-for="n in 3" :key="`sk${n}`" class="wo-tr">
                  <td v-for="c in 4" :key="c" class="wo-td"><span class="wo-skel" /></td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
              <tbody v-else>
                <tr v-for="row in routeRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`route-proc-${row.id}`" v-model="row.process" :data="PROCESS_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select process')" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onRouteProcess(row, v)" />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput v-if="row.process" :id="`route-desc-${row.id}`" v-model="row.description" is-full-width /></td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete v-if="row.process" :id="`route-map-${row.id}`" v-model="row.accountMapping" :data="ACCOUNT_MAPPING_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select account mapping')" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput v-if="row.process" :id="`route-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="row.process" class="wo-del-btn" type="button" @click="removeRow(routeRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>{{ t('Routing cost subtotal') }}</span>
            <span class="wo-subtotal-amount">{{ formatIDR(routingSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Subcon cost ══════════════════════════════════════════════════
             Replaces Production cost + Routing on a Subcontracting work order.
             The work happens at the vendor, so what the order carries is their
             fee, not in-house labour, overhead or routing. ═══════════════ -->
        <section v-if="hasBom && isSubcon" class="wo-section">
          <h2 class="wo-section-title">{{ t('Subcon cost') }}</h2>
          <p class="wo-section-desc">
            {{ t('What the vendor charges for this work. Pre-filled from the BOM’s subcon process — adjust it to the quote you agreed.') }}
          </p>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <!-- All fixed: the vendor name must not wrap, so the table
                     scrolls on a narrow stage rather than squeezing columns. -->
                <col class="wo-col-svc" /><col class="wo-col-type" /><col class="wo-col-by" />
                <col class="wo-col-driver" /><col class="wo-col-amt" /><col class="wo-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Service product') }}</th>
                  <th class="wo-th">{{ t('Type') }}</th>
                  <th class="wo-th">{{ t('Charged by') }}</th>
                  <th class="wo-th">{{ t('Cost driver') }}</th>
                  <th class="wo-th wo-th--right">{{ t('Amount') }}</th>
                  <th class="wo-th wo-th--del" />
                </tr>
              </thead>
              <tbody v-if="bomLoading">
                <tr v-for="n in 3" :key="`sk${n}`" class="wo-tr">
                  <td v-for="c in 5" :key="c" class="wo-td"><span class="wo-skel" /></td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
              <tbody v-else>
                <tr v-for="row in subconCostRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete
                      :id="`subcon-cost-prod-${row.id}`"
                      v-model="row.productId"
                      :data="SUBCON_PRODUCT_OPTIONS"
                      label-prop="name" value-prop="id"
                      :placeholder="t('Select non-track product')"
                      is-searchable is-clearable use-portal is-full-width
                      @update:model-value="(v: string) => onSubconCostProduct(row, v)"
                    />
                  </td>
                  <!-- Stated on every row: the reason these lines never touch stock. -->
                  <td class="wo-td">
                    <MpBadge v-if="row.productId" for="tableStatus" type="announcement">{{ t('Non-track') }}</MpBadge>
                  </td>
                  <!-- Always the subcon vendor: these are their charges, by definition. -->
                  <td class="wo-td">
                    <span v-if="row.productId">{{ subconVendor.name }}</span>
                  </td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete
                      v-if="row.productId"
                      :id="`subcon-cost-drv-${row.id}`"
                      v-model="row.costDriver"
                      :data="SUBCON_COST_DRIVER_OPTIONS"
                      label-prop="name" value-prop="id"
                      :placeholder="t('Select cost driver')"
                      is-searchable is-clearable use-portal is-full-width
                    />
                  </td>
                  <td class="wo-td wo-td--input wo-td--num-input">
                    <MpInput v-if="row.productId" :id="`subcon-cost-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width />
                  </td>
                  <td class="wo-td wo-td--del">
                    <MpTooltip v-if="row.productId" :label="t('Remove')" placement="top" use-portal>
                      <button class="wo-del-btn btn-enterprise" type="button" :aria-label="t('Remove')" @click="removeRow(subconCostRows, row.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </button>
                    </MpTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>{{ t('Subcon cost subtotal') }}</span>
            <span class="wo-subtotal-amount">{{ formatIDR(subconCostSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Cost summary — rows follow whichever cost structure applies ═══ -->
        <section v-if="hasBom" class="wo-section">
          <div class="wo-summary">
            <div class="wo-summary-row"><span>{{ t('Estimated raw materials subtotal') }}</span><span>{{ formatIDR(rawSubtotal) }}</span></div>
            <template v-if="isSubcon">
              <div class="wo-summary-row"><span>{{ t('Subcon cost subtotal') }}</span><span>{{ formatIDR(subconCostSubtotal) }}</span></div>
            </template>
            <template v-else>
              <div class="wo-summary-row"><span>{{ t('Production cost subtotal') }}</span><span>{{ formatIDR(productionCostSubtotal) }}</span></div>
              <div class="wo-summary-row"><span>{{ t('Routing cost subtotal') }}</span><span>{{ formatIDR(routingSubtotal) }}</span></div>
            </template>
            <div class="wo-summary-row wo-summary-row--total"><span>{{ t('Estimated total production cost') }}</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
          </div>
        </section>

        <!-- ══ Finished goods ═══════════════════════════════════════════════ -->
        <section v-if="hasBom" class="wo-section" :class="{ 'wo-section--last': !fromProductionRequest }">
          <h2 class="wo-section-title">{{ t('Finished goods') }}</h2>

          <!-- Main output -->
          <h3 class="wo-subsection-title">{{ t('Main output') }}</h3>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:140px" /><col style="width:140px" />
                <col style="width:110px" /><col style="width:140px" /><col style="width:160px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Product') }}</th><th class="wo-th">{{ t('SKU') }}</th><th class="wo-th">{{ t('Produced qty') }}</th>
                  <th class="wo-th">{{ t('Unit') }}</th><th class="wo-th">{{ t('Percentage') }}</th><th class="wo-th wo-th--right">{{ t('Estimated cost') }}</th><th class="wo-th wo-th--del" />
                </tr>
              </thead>
              <tbody v-if="bomLoading">
                <tr v-for="n in 3" :key="`sk${n}`" class="wo-tr">
                  <td v-for="c in 6" :key="c" class="wo-td"><span class="wo-skel" /></td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
              <tbody v-else>
                <!-- Single row, defined by the BOM: product/SKU/unit read-only, only qty editable, not removable -->
                <tr v-for="row in mainRows" :key="row.id" class="wo-tr">
                  <td class="wo-td">{{ productName(row.productId) || '—' }}</td>
                  <td class="wo-td">{{ row.sku || '—' }}</td>
                  <td class="wo-td wo-td--input"><MpInput :id="`main-qty-${row.id}`" v-model="row.producedQty" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td">{{ row.unit || '—' }}</td>
                  <td class="wo-td">{{ row.percentage ? `${row.percentage}%` : '—' }}</td>
                  <td class="wo-td wo-td--num">{{ formatIDR(num(row.estCost)) }}</td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>{{ t('Estimated main output subtotal') }}</span>
            <span class="wo-subtotal-amount">{{ formatIDR(mainOutputSubtotal) }}</span>
          </div>

          <!-- Other outputs -->
          <h3 class="wo-subsection-title">{{ t('Other outputs') }}</h3>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:140px" /><col style="width:140px" />
                <col style="width:110px" /><col style="width:140px" /><col style="width:160px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Product') }}</th><th class="wo-th">{{ t('SKU') }}</th><th class="wo-th">{{ t('Produced qty') }}</th>
                  <th class="wo-th">{{ t('Unit') }}</th><th class="wo-th">{{ t('Percentage') }}</th><th class="wo-th wo-th--right">{{ t('Estimated cost') }}</th><th class="wo-th wo-th--del" />
                </tr>
              </thead>
              <tbody v-if="bomLoading">
                <tr v-for="n in 3" :key="`sk${n}`" class="wo-tr">
                  <td v-for="c in 6" :key="c" class="wo-td"><span class="wo-skel" /></td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
              <tbody v-else>
                <tr v-for="row in otherRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`other-prod-${row.id}`" v-model="row.productId" :data="productOptions" label-prop="name" value-prop="id" :placeholder="t('Select product')" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onOtherProduct(row, v)" />
                  </td>
                  <td class="wo-td"><template v-if="row.productId">{{ row.sku || '—' }}</template></td>
                  <td class="wo-td wo-td--input"><MpInput v-if="row.productId" :id="`other-qty-${row.id}`" v-model="row.producedQty" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete v-if="row.productId" :id="`other-unit-${row.id}`" v-model="row.unit" :data="UNIT_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select unit')" is-searchable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput v-if="row.productId" :id="`other-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput v-if="row.productId" :id="`other-cost-${row.id}`" v-model="row.estCost" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="row.productId" class="wo-del-btn" type="button" @click="removeRow(otherRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>{{ t('Estimated other outputs subtotal') }}</span>
            <span class="wo-subtotal-amount">{{ formatIDR(otherOutputsSubtotal) }}</span>
          </div>

          <!-- Production waste -->
          <h3 class="wo-subsection-title">{{ t('Production waste') }}</h3>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:200px" /><col style="width:160px" />
                <col style="width:180px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Account mapping') }}</th><th class="wo-th">{{ t('Allocation method') }}</th><th class="wo-th">{{ t('Percentage') }}</th>
                  <th class="wo-th wo-th--right">{{ t('Amount') }}</th><th class="wo-th wo-th--del" />
                </tr>
              </thead>
              <tbody v-if="bomLoading">
                <tr v-for="n in 3" :key="`sk${n}`" class="wo-tr">
                  <td v-for="c in 4" :key="c" class="wo-td"><span class="wo-skel" /></td>
                  <td class="wo-td wo-td--del" />
                </tr>
              </tbody>
              <tbody v-else>
                <tr v-for="row in wasteRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`waste-map-${row.id}`" v-model="row.accountMapping" :data="ACCOUNT_MAPPING_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select account mapping')" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onWasteMapping(row, v)" />
                  </td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete v-if="row.accountMapping" :id="`waste-alloc-${row.id}`" v-model="row.allocationMethod" :data="ALLOCATION_METHOD_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select allocation method')" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput v-if="row.accountMapping" :id="`waste-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput v-if="row.accountMapping" :id="`waste-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="row.accountMapping" class="wo-del-btn" type="button" @click="removeRow(wasteRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>{{ t('Estimated production waste subtotal') }}</span>
            <span class="wo-subtotal-amount">{{ formatIDR(wasteSubtotal) }}</span>
          </div>

          <!-- Finished goods summary -->
          <div class="wo-summary">
            <div class="wo-summary-row"><span>{{ t('Estimated main output subtotal') }}</span><span>{{ formatIDR(mainOutputSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>{{ t('Estimated other outputs subtotal') }}</span><span>{{ formatIDR(otherOutputsSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>{{ t('Estimated production waste subtotal') }}</span><span>{{ formatIDR(wasteSubtotal) }}</span></div>
            <div class="wo-summary-row wo-summary-row--total"><span>{{ t('Estimated finished goods total') }}</span><span>{{ formatIDR(finishedGoodsTotal) }}</span></div>
          </div>
        </section>

        <!-- ══ Linked transactions — from production request flow only ═══════ -->
        <section v-if="fromProductionRequest" class="wo-section wo-section--last">
          <h2 class="wo-section-title">{{ t('Linked transactions') }}</h2>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup><col style="width:280px" /><col style="width:160px" /><col style="width:120px" /><col style="width:180px" /></colgroup>
              <thead>
                <tr>
                  <th class="wo-th">{{ t('Number') }}</th><th class="wo-th wo-th--right">{{ t('Qty to produce') }}</th><th class="wo-th">{{ t('Unit') }}</th><th class="wo-th">{{ t('Due date') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="link in workOrderLinks" :key="link.number" class="wo-tr">
                  <td class="wo-td">{{ link.number }}</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ link.qtyToProduce }}</td>
                  <td class="wo-td">{{ link.unit }}</td>
                  <td class="wo-td">{{ formatDate(link.dueDate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goList">{{ t('Cancel') }}</MpButton>
      <MpButton variant="secondary" is-rounded @click="handleSaveDraft">{{ t('Save as draft') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ t('Save') }}</MpButton>
    </footer>

    <!-- ── Demo flow scenario switcher ── -->
    <MpPopover id="wo-flow-fab" is-close-on-select use-portal placement="top-end">
      <MpPopoverTrigger>
        <button class="wo-flow-fab" :aria-label="t('Change creation flow')"><MpIcon name="sliders" size="md" color="icon.inverse" /></button>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
        <p class="wo-flow-fab-heading">{{ t('Creation flow') }}</p>
        <MpPopoverList>
          <MpPopoverListItem v-for="o in flowOptions" :key="o.value" :is-active="o.value === flow" @click="flow = o.value">{{ o.label }}</MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>

    <!-- ── Manage serial number / Manage batch — reserve up front, consumed later
         by the Material consume & return flow. ── -->
    <PickSerialNumberDrawer
      v-if="activeRawDrawerRow && trackingTypeFor(activeRawDrawerRow.productId) === 'serial'"
      :open="!!activeRawDrawerRow"
      :product-name="productName(activeRawDrawerRow.productId)"
      :product-img="catalogProduct(activeRawDrawerRow.productId)?.img"
      :sku="catalogProduct(activeRawDrawerRow.productId)?.sku ?? ''"
      :warehouse-id="activeRawDrawerRow.warehouseId"
      :warehouse-name="rawDrawerWarehouseName"
      :target-count="num(activeRawDrawerRow.needed)"
      :model-value="activeRawDrawerRow.serialSelection"
      @update:open="(v: boolean) => { if (!v) closeRawTracking() }"
      @save="onRawSerialDrawerSave"
    />
    <PickBatchDrawer
      v-if="activeRawDrawerRow && trackingTypeFor(activeRawDrawerRow.productId) === 'batch'"
      :open="!!activeRawDrawerRow"
      :product-name="productName(activeRawDrawerRow.productId)"
      :product-img="catalogProduct(activeRawDrawerRow.productId)?.img"
      :sku="catalogProduct(activeRawDrawerRow.productId)?.sku ?? ''"
      :warehouse-id="activeRawDrawerRow.warehouseId"
      :warehouse-name="rawDrawerWarehouseName"
      :unit="activeRawDrawerRow.unit"
      :target-count="num(activeRawDrawerRow.needed)"
      :model-value="activeRawDrawerRow.batchSelection"
      @update:open="(v: boolean) => { if (!v) closeRawTracking() }"
      @save="onRawBatchDrawerSave"
    />
  </div>
</template>

<style scoped>
/* ── Demo flow scenario switcher ─────────────────────────────────────────── */
.wo-flow-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: 84px;
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff; cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.wo-flow-fab:hover { opacity: 0.9; }
.wo-flow-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Page shell (shared create-page pattern) ─────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid transparent; transition: border-top-color 0.15s;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Body / sections ─────────────────────────────────────────────────────── */
.wo-body { display: flex; flex-direction: column; }
.wo-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default); }
.wo-section:first-child { padding-top: 0; }
.wo-section--last { border-bottom: none; }
.wo-section-title {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.wo-section-desc {
  margin: -12px 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md);
}
/* Subcon cost column widths — token scale, so the table reads like every other. */
.wo-col-svc    { width: var(--mp-sizes-75, 300px); }
.wo-col-type   { width: var(--mp-sizes-28, 112px); }
.wo-col-by     { width: var(--mp-sizes-56, 224px); }
.wo-col-driver { width: var(--mp-sizes-38, 152px); }
.wo-col-amt    { width: var(--mp-sizes-42, 168px); }
.wo-col-del    { width: var(--mp-sizes-11, 44px);  }

/* ── Subcontracting ──────────────────────────────────────────────────────── */
.wo-subcon-hint {
  margin: var(--mp-spacing-1) 0 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
.wo-subcon-plan { margin-top: var(--mp-spacing-6); }
.wo-subcon-plan__label {
  display: block;
  margin-bottom: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.wo-subcon-gate {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin: var(--mp-spacing-4) 0 0; max-width: 860px;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.wo-subsection-title {
  margin: var(--mp-spacing-6) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Work order info grid — 2 columns, up to 318px each, capped at 660px.
   minmax(0, 318px) lets the columns shrink on narrow viewports instead of
   overflowing the stage (which otherwise pushes the field arrows/calendar icons
   off to the right edge). */
.wo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 318px));
  gap: var(--mp-spacing-4) var(--mp-spacing-6);
  align-items: start;
  max-width: 660px;
}
.wo-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.wo-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.wo-datepicker { width: 100%; }
.wo-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.wo-radio-group { display: flex; align-items: center; gap: var(--mp-spacing-6); height: var(--mp-sizes-10, 40px); }
.wo-radio-item { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Attachment ──────────────────────────────────────────────────────────── */
.wo-attachment { margin-top: var(--mp-spacing-6); max-width: 640px; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wo-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wo-file-hidden { display: none; }
.wo-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.wo-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wo-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.wo-file-list { margin: var(--mp-spacing-1) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.wo-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.wo-file-name { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wo-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.wo-file-remove:hover { color: var(--mp-text-critical, var(--mp-text-danger, #a8352d)); }

.wo-checkbox-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-6); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.wo-checkbox-row--tight { margin-top: 0; margin-bottom: var(--mp-spacing-4); }

/* ── Line-item tables (shared .cr-table pattern) ─────────────────────────── */
/* Borderless ERP table: top + bottom horizontal rules frame it, internal grid
   lines come from the cells — no outer box or rounded corners. */
.wo-table-scroll {
  overflow-x: auto;
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.wo-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; min-width: max-content; }
.wo-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.wo-th--right { text-align: right; }
/* Action/button icon column — fixed 44px, pinned to the right edge of the table
   so it stays visible while the table scrolls horizontally. Compound selector
   (.wo-td.wo-td--del) so padding:0 beats the general .wo-td padding — otherwise the
   32px button + 20px padding inflates the row past the 38px input height. */
.wo-th.wo-th--del, .wo-td.wo-td--del {
  position: sticky;
  right: 0;
  z-index: 2;
  width: 44px;
  min-width: 44px;
  padding: 0;
  text-align: center;
  /* 1px inset separator on the sticky column's left edge. It must match the 1px
     cell borders exactly and read the same whether the column is pinned (scrolled)
     or not — so it's the SINGLE divider here and the neighbouring cell drops its
     own border-right below (otherwise the two stack into a bolder 2px line). */
  box-shadow: inset 1px 0 var(--mp-border-default);
}
/* Cell immediately left of the sticky action column: no right border, so the
   sticky column's 1px inset shadow is the only line at that boundary. */
.wo-th:nth-last-child(2), .wo-td:nth-last-child(2) { border-right: none; }
.wo-th--del { background: var(--mp-background-neutral-subtle); }
.wo-td--del { background: var(--mp-background-neutral); }
.wo-td {
  /* vertical padding kept under the 38px input-control height so read-only text
     cells don't out-tall the inputs — the inputs define the row height and fill it,
     matching the barang-masuk/new create table. */
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
}
.wo-td:last-child { border-right: none; }
.wo-tr:last-child .wo-td { border-bottom: none; }
.wo-td--num { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wo-td--right { text-align: right; }
.wo-td--input { padding: 0; vertical-align: middle; background: var(--mp-background-neutral, #fff); }
.wo-td--num-input { padding: 0; background: var(--mp-background-neutral, #fff); }
.wo-td--num-input :deep(input) { text-align: right; }
/* Cell controls are borderless within the grid; the focused cell shows a 2px inset
   ring (square) — matching the barang-masuk/new create-table active state. */
.wo-td--input :deep([class*='input']),
.wo-td--input :deep([class*='autocomplete']),
.wo-td--input :deep(.mp-datepicker__root) { border-radius: 0; border-color: transparent; }
.wo-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); z-index: 1; }
.wo-tracked-hint { display: block; padding: var(--mp-spacing-1) var(--mp-spacing-2) 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wo-tracking { display: block; padding: 0 var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.wo-tracking:hover { text-decoration: underline; text-underline-offset: 2px; }
.wo-del-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
  border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
}
.wo-del-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-critical, var(--mp-text-danger, #a8352d)); }

/* Loading skeleton bar (shown in each cell while the selected BOM's data loads) */
.wo-skel {
  display: block;
  height: 14px;
  width: 70%;
  border-radius: var(--mp-radii-sm, 4px);
  background: linear-gradient(90deg, var(--mp-border-default) 25%, var(--mp-background-neutral-subtle) 37%, var(--mp-border-default) 63%);
  background-size: 400% 100%;
  animation: wo-skel-shimmer 1.4s ease infinite;
}
.wo-td--del .wo-skel { display: none; }
@keyframes wo-skel-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

/* ── Subtotal + summary ──────────────────────────────────────────────────── */
.wo-subtotal-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  padding: var(--mp-spacing-3) var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wo-subtotal-amount { min-width: 160px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wo-summary { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wo-summary-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wo-summary-row > :last-child { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wo-summary-row--total { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wo-summary-row--total > :last-child { color: var(--mp-text-default); }
</style>
