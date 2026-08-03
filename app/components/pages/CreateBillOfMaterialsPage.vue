<script setup lang="ts">
/**
 * New bill of materials — Production module create form. Built from the Figma
 * reference (Production / BOM / New BOM) using the ERP create-page shell
 * (.detail-page + scrollable stage + sticky footer) and the shared borderless
 * line-item table pattern (see CreateWorkOrderPage). Reference/prototype only.
 *
 * Sections: BOM info · Raw materials · Production cost (Labor / Overhead / Other)
 * · Routing · (cost summary) · Finished goods (Main output / Other outputs /
 * Production waste).
 *
 * Unlike the work order create form, a BOM defines its own line items from
 * scratch, so every section is editable and visible from the start (there is no
 * BOM-selection gate).
 */
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpTextarea,
  MpButton, MpIcon, MpCheckbox, toast,
} from '@mekari/pixel3'
import { CATALOG } from '~/data/catalog'
import {
  addBillOfMaterials, billOfMaterials, catalogProduct,
  type BillOfMaterials, type BomRawMaterial, type BomProductionCost,
  type BomRoutingStep, type BomOtherOutput, type BomProductionWaste,
} from '~/data/billOfMaterials'
import { updateBillOfMaterialsSafe } from '~/data/integrityGuards'

const { t } = useLocale()
const router = useRouter()
const route = useRoute()
function goList() { router.push('/bill-of-materials') }

// ── Edit / duplicate — prefill every section from an existing BOM ──────────────
const editingId = (route.query.edit as string) || ''
const duplicateFromId = (route.query.duplicate as string) || ''
const isEditMode = computed(() => !!editingId)
const editingNumber = ref('')
const editingArchived = ref(false)

// ── Option lists ──────────────────────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { id: 'Standard', name: 'Standard' },
  { id: 'Custom', name: 'Custom' },
]
const COSTING_OPTIONS = [
  { id: 'Actual cost', name: 'Actual cost' },
  { id: 'Standard cost', name: 'Standard cost' },
]
const productOptions = CATALOG.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.price, sku: p.sku }))
const UNIT_OPTIONS = [...new Set(CATALOG.map(p => p.unit))].map(u => ({ id: u, name: u }))
const COST_ACCOUNT_OPTIONS = [
  { id: 'labour', name: 'Direct labour' },
  { id: 'worker', name: 'Worker' },
  { id: 'overhead', name: 'Manufacturing overhead' },
  { id: 'electricity', name: 'Electricity' },
  { id: 'depreciation', name: 'Machine depreciation' },
]
const COST_DRIVER_OPTIONS = [
  { id: 'person', name: 'Person' },
  { id: 'kwh', name: 'Kwh' },
  { id: 'labour-hour', name: 'Labour hour' },
  { id: 'machine-hour', name: 'Machine hour' },
  { id: 'unit', name: 'Unit produced' },
]
const PROCESS_OPTIONS = [
  { id: 'assembly', name: 'Assembly' },
  { id: 'fitting', name: 'Fitting' },
  { id: 'painting', name: 'Painting' },
  { id: 'finishing', name: 'Finishing' },
  { id: 'qc', name: 'Quality control' },
]
const ACCOUNT_MAPPING_OPTIONS = [
  { id: 'wip', name: 'Work in process' },
  { id: 'routing-cost', name: 'Routing cost' },
  { id: 'waste', name: 'Production waste' },
]
const ALLOCATION_METHOD_OPTIONS = [
  { id: 'percentage', name: 'Percentage' },
  { id: 'amount', name: 'Amount' },
]

// ── BOM info ────────────────────────────────────────────────────────────────────
const NAME_MAX = 60
const DESC_MAX = 256
const bomName = ref('')
const bomNameError = ref(false)
const category = ref('')
const categoryError = ref(false)
const costingReference = ref('')
const costingError = ref(false)
const description = ref('')
const allowBomAdjustment = ref(false)

// ── Attachment ──────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])
function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) {
    for (const f of Array.from(input.files)) {
      if (!attachedFiles.value.some(x => x.name === f.name) && attachedFiles.value.length < 3) attachedFiles.value.push(f)
    }
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

// ── Formatters ──────────────────────────────────────────────────────────────────
function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(n || 0)
}
const num = (v: string) => Number(v) || 0
const productName = (id: string) => productOptions.find(p => p.id === id)?.name ?? ''

// ── Shared row helpers ───────────────────────────────────────────────────────────
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

// ── Raw materials ────────────────────────────────────────────────────────────────
interface RawRow { id: number; productId: string; sku: string; needed: string; unit: string; purchaseCost: number }
let rawSeq = 0
const makeRaw = (): RawRow => ({ id: rawSeq++, productId: '', sku: '', needed: '', unit: '', purchaseCost: 0 })
const rawRows = ref<RawRow[]>([makeRaw()])
function onRawProduct(row: RawRow, id: string) {
  const p = CATALOG.find(c => c.id === id)
  row.purchaseCost = p?.price ?? 0
  row.sku = p?.sku ?? ''
  if (p && !row.unit) row.unit = p.unit
  appendIfLast(rawRows, row.id, makeRaw)
}
const rawEstimated = (r: RawRow) => num(r.needed) * r.purchaseCost
const rawSubtotal = computed(() => rawRows.value.reduce((s, r) => s + rawEstimated(r), 0))

// ── Raw materials row reorder (drag the grip column) ───────────────────────────────
const rawDragSrc = ref<number | null>(null)
const rawDragOver = ref<number | null>(null)
function onRawDragStart(i: number, e: DragEvent) {
  rawDragSrc.value = i
  e.dataTransfer!.effectAllowed = 'move'
}
function onRawDragOver(i: number, e: DragEvent) {
  if (rawDragSrc.value === null) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  rawDragOver.value = i
}
function onRawDrop(i: number, e: DragEvent) {
  e.preventDefault()
  if (rawDragSrc.value === null || rawDragSrc.value === i) { rawDragOver.value = null; return }
  const r = [...rawRows.value]
  const [moved] = r.splice(rawDragSrc.value, 1)
  r.splice(i, 0, moved!)
  rawRows.value = r
  rawDragSrc.value = null
  rawDragOver.value = null
}
function onRawDragEnd() { rawDragSrc.value = null; rawDragOver.value = null }

// ── Production cost — three fixed groups (Labor / Overhead / Other) ───────────────
interface CostRow { id: number; account: string; costDriver: string; amount: string }
let costSeq = 0
const makeCost = (): CostRow => ({ id: costSeq++, account: '', costDriver: '', amount: '' })
interface CostGroup { key: string; label: string; rows: CostRow[] }
const costGroups = ref<CostGroup[]>([
  { key: 'labor', label: 'Labor cost', rows: [makeCost()] },
  { key: 'overhead', label: 'Overhead cost', rows: [makeCost()] },
  { key: 'other', label: 'Other cost', rows: [makeCost()] },
])
function onCostAccount(group: CostGroup, row: CostRow) {
  const last = group.rows[group.rows.length - 1]
  if (last && last.id === row.id) group.rows.push(makeCost())
}
function removeCostRow(group: CostGroup, id: number) {
  if (group.rows.length === 1) return
  group.rows = group.rows.filter(r => r.id !== id)
}
const productionCostSubtotal = computed(() =>
  costGroups.value.reduce((s, g) => s + g.rows.reduce((gs, r) => gs + num(r.amount), 0), 0),
)

// ── Routing ──────────────────────────────────────────────────────────────────────
interface RouteRow { id: number; process: string; description: string; accountMapping: string; amount: string }
let routeSeq = 0
const makeRoute = (): RouteRow => ({ id: routeSeq++, process: '', description: '', accountMapping: '', amount: '' })
const routeRows = ref<RouteRow[]>([makeRoute()])
function onRouteProcess(row: RouteRow) { appendIfLast(routeRows, row.id, makeRoute) }
const routingSubtotal = computed(() => routeRows.value.reduce((s, r) => s + num(r.amount), 0))

// ── Cost summary ──────────────────────────────────────────────────────────────────
const totalProductionCost = computed(() => rawSubtotal.value + productionCostSubtotal.value + routingSubtotal.value)

// ── Finished goods: main output / other outputs ──────────────────────────────────
// Estimated cost is never typed in directly — it's always derived from the row's
// percentage share of the total production cost (see totalProductionCost above),
// so the finished-goods total always reconciles exactly to it.
interface OutputRow { id: number; productId: string; sku: string; producedQty: string; unit: string; percentage: string }
let mainSeq = 0, otherSeq = 0
const makeMain = (): OutputRow => ({ id: mainSeq++, productId: '', sku: '', producedQty: '', unit: '', percentage: '' })
const makeOther = (): OutputRow => ({ id: otherSeq++, productId: '', sku: '', producedQty: '', unit: '', percentage: '' })
// Main output is a single row (the BOM's primary output).
const mainRow = ref<OutputRow>(makeMain())
function onMainProduct(id: string) {
  const p = CATALOG.find(c => c.id === id)
  if (p) { mainRow.value.sku = p.sku; if (!mainRow.value.unit) mainRow.value.unit = p.unit }
}
const otherRows = ref<OutputRow[]>([makeOther()])
function onOtherProduct(row: OutputRow, id: string) {
  const p = CATALOG.find(c => c.id === id)
  if (p) { row.sku = p.sku; if (!row.unit) row.unit = p.unit }
  appendIfLast(otherRows, row.id, makeOther)
}
function otherEstCost(row: OutputRow) { return totalProductionCost.value * num(row.percentage) / 100 }
const otherOutputsSubtotal = computed(() =>
  otherRows.value.filter(r => r.productId).reduce((s, r) => s + otherEstCost(r), 0),
)

// ── Finished goods: production waste ─────────────────────────────────────────────
// Allocation method decides which of percentage/amount is user-editable — the
// other one is derived and shown disabled: "Percentage" drives amount from the
// total production cost; "Amount" drives percentage back from that same total.
interface WasteRow { id: number; accountMapping: string; allocationMethod: string; percentage: string; amount: string }
let wasteSeq = 0
const makeWaste = (): WasteRow => ({ id: wasteSeq++, accountMapping: '', allocationMethod: '', percentage: '', amount: '' })
const wasteRows = ref<WasteRow[]>([makeWaste()])
function onWasteMapping(row: WasteRow) { appendIfLast(wasteRows, row.id, makeWaste) }
function isWasteByAmount(row: WasteRow) { return row.allocationMethod === 'amount' }
function wastePercentage(row: WasteRow) {
  if (!isWasteByAmount(row)) return num(row.percentage)
  return totalProductionCost.value > 0 ? (num(row.amount) / totalProductionCost.value) * 100 : 0
}
function wasteAmount(row: WasteRow) {
  if (isWasteByAmount(row)) return num(row.amount)
  return totalProductionCost.value * num(row.percentage) / 100
}
const wasteSubtotal = computed(() =>
  wasteRows.value.filter(r => r.accountMapping).reduce((s, r) => s + wasteAmount(r), 0),
)

// Main output's percentage is never typed in — it auto-allocates whatever the
// other outputs + production waste haven't claimed (100% when neither has any
// percentage entered yet), and its estimated cost absorbs whatever production
// cost is left over. That makes the three subtotals always sum to EXACTLY the
// total production cost, regardless of rounding in the other rows.
const otherPercentageTotal = computed(() =>
  otherRows.value.filter(r => r.productId).reduce((s, r) => s + num(r.percentage), 0),
)
const wastePercentageTotal = computed(() =>
  wasteRows.value.filter(r => r.accountMapping).reduce((s, r) => s + wastePercentage(r), 0),
)
const mainPercentage = computed(() => Math.max(0, 100 - otherPercentageTotal.value - wastePercentageTotal.value))
const mainOutputSubtotal = computed(() =>
  Math.max(0, totalProductionCost.value - otherOutputsSubtotal.value - wasteSubtotal.value),
)
// Finished goods total always equals the total production cost by construction.
const finishedGoodsTotal = computed(() => mainOutputSubtotal.value + otherOutputsSubtotal.value + wasteSubtotal.value)

// ── Save ──────────────────────────────────────────────────────────────────────────
const mainProductError = ref(false)
function validate() {
  let ok = true
  if (!bomName.value.trim()) { bomNameError.value = true; ok = false }
  if (!category.value) { categoryError.value = true; ok = false }
  if (!costingReference.value) { costingError.value = true; ok = false }
  if (!mainRow.value.productId) { mainProductError.value = true; ok = false }
  return ok
}

const optionLabel = (options: { id: string; name: string }[], id: string) => options.find(o => o.id === id)?.name ?? id
const optionId = (options: { id: string; name: string }[], label: string) => options.find(o => o.name === label)?.id ?? ''

// Load every section of the form from an existing BOM record — shared by Edit
// (same record, saved back in place) and Duplicate (prefills a new record).
function prefillFrom(bom: BillOfMaterials) {
  bomName.value = bom.name
  category.value = bom.category
  costingReference.value = bom.costingReference
  description.value = bom.description
  allowBomAdjustment.value = bom.allowBomAdjustment

  rawRows.value = bom.rawMaterials.map(r => ({
    id: rawSeq++, productId: r.productId, sku: catalogProduct(r.productId)?.sku ?? '',
    needed: String(r.needed), unit: r.unit, purchaseCost: r.purchaseCost,
  }))
  rawRows.value.push(makeRaw())

  const grouped: Record<string, BomProductionCost[]> = { Labor: [], Overhead: [], Other: [] }
  for (const c of bom.productionCost) grouped[c.group]?.push(c)
  costGroups.value = costGroups.value.map((g) => {
    const key = g.label.replace(' cost', '')
    const rows = (grouped[key] ?? []).map(c => ({
      id: costSeq++, account: optionId(COST_ACCOUNT_OPTIONS, c.account),
      costDriver: optionId(COST_DRIVER_OPTIONS, c.costDriver), amount: String(c.amount),
    }))
    rows.push(makeCost())
    return { ...g, rows }
  })

  routeRows.value = bom.routing.map(r => ({
    id: routeSeq++, process: optionId(PROCESS_OPTIONS, r.process), description: r.description,
    accountMapping: optionId(ACCOUNT_MAPPING_OPTIONS, r.accountMapping), amount: String(r.amount),
  }))
  routeRows.value.push(makeRoute())

  const fg = catalogProduct(bom.finishedGoodId)
  mainRow.value = {
    id: mainSeq++, productId: bom.finishedGoodId, sku: fg?.sku ?? '',
    producedQty: String(bom.finishedGoodQty), unit: bom.finishedGoodUnit, percentage: '',
  }

  otherRows.value = bom.otherOutputs.map((o) => {
    const p = catalogProduct(o.productId)
    return {
      id: otherSeq++, productId: o.productId, sku: p?.sku ?? '',
      producedQty: String(o.qty), unit: o.unit, percentage: String(o.percentage),
    }
  })
  otherRows.value.push(makeOther())

  wasteRows.value = bom.productionWaste.map(w => ({
    id: wasteSeq++,
    accountMapping: optionId(ACCOUNT_MAPPING_OPTIONS, w.accountMapping),
    allocationMethod: w.allocationMethod === 'Amount' ? 'amount' : 'percentage',
    percentage: String(w.percentage), amount: String(w.amount),
  }))
  wasteRows.value.push(makeWaste())
}

if (editingId) {
  const src = billOfMaterials.find(b => b.id === editingId)
  if (src) { prefillFrom(src); editingNumber.value = src.number; editingArchived.value = src.archived }
} else if (duplicateFromId) {
  const src = billOfMaterials.find(b => b.id === duplicateFromId)
  if (src) prefillFrom(src)
}

// Build the persisted BOM record from the form's line-item rows — every product
// reference is a real registered product id (rows without one are in-progress/blank
// and dropped).
function buildBomPayload() {
  const rawMaterials: BomRawMaterial[] = rawRows.value
    .filter(r => r.productId)
    .map(r => ({ productId: r.productId, needed: num(r.needed) || 1, unit: r.unit, purchaseCost: r.purchaseCost }))

  const productionCost: BomProductionCost[] = costGroups.value.flatMap(g =>
    g.rows.filter(r => r.account).map(r => ({
      group: (g.label.replace(' cost', '') as BomProductionCost['group']),
      account: optionLabel(COST_ACCOUNT_OPTIONS, r.account),
      costDriver: optionLabel(COST_DRIVER_OPTIONS, r.costDriver),
      amount: num(r.amount),
    })),
  )

  const routing: BomRoutingStep[] = routeRows.value
    .filter(r => r.process)
    .map(r => ({
      process: optionLabel(PROCESS_OPTIONS, r.process),
      description: r.description,
      accountMapping: optionLabel(ACCOUNT_MAPPING_OPTIONS, r.accountMapping),
      amount: num(r.amount),
    }))

  const otherOutputs: BomOtherOutput[] = otherRows.value
    .filter(r => r.productId)
    .map(r => ({ productId: r.productId, qty: num(r.producedQty), unit: r.unit, percentage: num(r.percentage), estCost: otherEstCost(r) }))

  const productionWaste: BomProductionWaste[] = wasteRows.value
    .filter(r => r.accountMapping)
    .map(r => ({
      accountMapping: optionLabel(ACCOUNT_MAPPING_OPTIONS, r.accountMapping),
      allocationMethod: (optionLabel(ALLOCATION_METHOD_OPTIONS, r.allocationMethod) as BomProductionWaste['allocationMethod']),
      percentage: wastePercentage(r),
      amount: wasteAmount(r),
    }))

  return {
    name: bomName.value.trim(),
    category: category.value as 'Standard' | 'Custom',
    costingReference: costingReference.value as 'Actual cost' | 'Standard cost',
    finishedGoodId: mainRow.value.productId,
    finishedGoodQty: num(mainRow.value.producedQty) || 1,
    finishedGoodUnit: mainRow.value.unit,
    finishedGoodPercentage: mainPercentage.value,
    description: description.value.trim(),
    allowBomAdjustment: allowBomAdjustment.value,
    archived: editingArchived.value,
    rawMaterials,
    productionCost,
    routing,
    otherOutputs,
    productionWaste,
  }
}

// Returns the BOM id to navigate to, or null when the guard refused the edit
// (an active work order still depends on this BOM) — caller then aborts.
function saveBom(): string | null {
  if (isEditMode.value) {
    const res = updateBillOfMaterialsSafe(editingId, buildBomPayload())
    if (!res.ok) {
      toast.notify({ variant: 'error', title: t("This BOM is used by an active work order and can't be edited"), maxWidth: 'max-content' })
      return null
    }
    return editingId
  }
  return addBillOfMaterials(buildBomPayload()).id
}
function handleSave() {
  if (!validate()) return
  const id = saveBom()
  if (!id) return
  toast.notify({ variant: 'success', title: isEditMode.value ? t('Bill of materials updated') : t('Bill of materials saved') })
  router.push(`/bill-of-materials/${id}`)
}
function handleSaveDraft() {
  const id = saveBom()
  if (!id) return
  toast.notify({ variant: 'success', title: isEditMode.value ? t('Bill of materials updated') : t('Bill of materials saved as draft') })
  router.push(`/bill-of-materials/${id}`)
}

// ── Sticky footer float ────────────────────────────────────────────────────────────
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
          <button class="detail-breadcrumb" @click="goList">{{ t('Bill of materials') }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEditMode ? t('Edit bill of materials') : t('New bill of materials') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <div class="bf-body">

        <!-- ══ BOM info ══════════════════════════════════════════════════════ -->
        <section class="bf-section">
          <h2 class="bf-section-title">{{ t('Bill of materials info') }}</h2>

          <!-- BOM no. (auto) -->
          <div class="bf-field bf-field--sm">
            <MpFormControl id="bf-no" is-required>
              <div class="bf-label-row">
                <MpFormLabel>{{ t('BOM no.') }}</MpFormLabel>
                <span class="bf-label-icon" :title="t('Auto-generated')"><MpIcon name="settings" size="sm" /></span>
              </div>
              <MpInput id="bf-no-input" :model-value="editingNumber" :placeholder="t('Auto')" is-full-width is-disabled />
            </MpFormControl>
          </div>

          <!-- BOM name (with counter) -->
          <div class="bf-field bf-field--lg">
            <MpFormControl id="bf-name" is-required :is-invalid="bomNameError">
              <div class="bf-label-row bf-label-row--between">
                <MpFormLabel>{{ t('BOM name') }}</MpFormLabel>
                <span class="bf-counter">{{ bomName.length }} / {{ NAME_MAX }}</span>
              </div>
              <MpInput
                id="bf-name-input" v-model="bomName" :maxlength="NAME_MAX"
                is-full-width :is-invalid="bomNameError"
                @update:model-value="bomNameError = false"
              />
              <MpFormErrorMessage>{{ t('You must fill in BOM name') }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <!-- Category | Costing reference -->
          <div class="bf-grid">
            <MpFormControl id="bf-category" is-required :is-invalid="categoryError">
              <MpFormLabel>{{ t('Category') }}</MpFormLabel>
              <MpAutocomplete
                id="bf-category-ac" v-model="category" :data="CATEGORY_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select category')"
                is-clearable use-portal is-full-width :is-invalid="categoryError"
                @update:model-value="categoryError = false"
              />
              <MpFormErrorMessage>{{ t('You must select category') }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="bf-costing" is-required :is-invalid="costingError">
              <MpFormLabel>{{ t('Costing reference') }}</MpFormLabel>
              <MpAutocomplete
                id="bf-costing-ac" v-model="costingReference" :data="COSTING_OPTIONS"
                label-prop="name" value-prop="id" :placeholder="t('Select costing reference')"
                is-clearable use-portal is-full-width :is-invalid="costingError"
                @update:model-value="costingError = false"
              />
              <MpFormErrorMessage>{{ t('You must select costing reference') }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <!-- Description (optional, with counter) -->
          <div class="bf-field bf-field--lg bf-field--mt">
            <MpFormControl id="bf-desc">
              <div class="bf-label-row bf-label-row--between">
                <MpFormLabel>{{ t('Description') }}</MpFormLabel>
                <span class="bf-counter">{{ description.length }} / {{ DESC_MAX }}</span>
              </div>
              <MpTextarea
                id="bf-desc-textarea" v-model="description" :maxlength="DESC_MAX" :rows="3"
                is-full-width
              />
            </MpFormControl>
          </div>

          <!-- Attachment -->
          <div class="bf-attachment">
            <div class="bf-section-label">{{ t('Attachment') }}</div>
            <input
              ref="fileInput" type="file" multiple
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              class="bf-file-hidden" @change="onFileChange"
            />
            <div class="bf-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">{{ t('Choose file') }}</MpButton>
              <span class="bf-attach-or">{{ t('or drag and drop here') }}</span>
            </div>
            <p class="bf-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 3 files per BOM') }}</p>
            <ul v-if="attachedFiles.length" class="bf-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="bf-file-item">
                <MpIcon name="document" size="sm" />
                <span class="bf-file-name">{{ f.name }}</span>
                <button class="bf-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="minus-circular" size="sm" /></button>
              </li>
            </ul>
          </div>

          <!-- Allow BOM adjustment -->
          <label class="bf-check">
            <MpCheckbox id="bf-adjust" :is-checked="allowBomAdjustment" @change="allowBomAdjustment = !allowBomAdjustment" />
            <span class="bf-check-body">
              <span class="bf-check-title">{{ t('Allow BOM adjustment') }}</span>
              <span class="bf-check-desc">{{ t('You can add or reduce raw materials to the same SKU when creating a work order.') }}</span>
            </span>
          </label>
        </section>

        <!-- ══ Raw materials ═════════════════════════════════════════════════ -->
        <section class="bf-section">
          <h2 class="bf-section-title">{{ t('Raw materials') }}</h2>
          <div class="bf-toolbar">
            <!-- Placeholder action (non-functional in this prototype) -->
            <MpButton variant="secondary" size="sm" is-rounded @click.prevent>
              <template #leftIcon><MpIcon name="add" size="sm" /></template>
              {{ t('Sub-assembly product') }}
            </MpButton>
          </div>
          <div class="bf-table-scroll">
            <table class="bf-table">
              <colgroup>
                <col style="width:44px" /><col style="width:280px" /><col style="width:240px" />
                <col style="width:100px" /><col style="width:120px" /><col />
                <col style="width:256px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="bf-th bf-th--grip" />
                  <th class="bf-th">{{ t('Product') }}</th><th class="bf-th">SKU</th>
                  <th class="bf-th">{{ t('Needed qty') }}</th><th class="bf-th">{{ t('Unit') }}</th>
                  <th class="bf-th bf-th--right">{{ t('Purchase cost') }}</th>
                  <th class="bf-th bf-th--right">{{ t('Estimated cost') }}</th><th class="bf-th bf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, rawIdx) in rawRows"
                  :key="row.id"
                  class="bf-tr"
                  :class="{
                    'bf-tr--dragging': rawDragSrc === rawIdx,
                    'bf-tr--over-above': rawDragOver === rawIdx && rawDragSrc !== null && rawDragSrc > rawIdx,
                    'bf-tr--over-below': rawDragOver === rawIdx && rawDragSrc !== null && rawDragSrc < rawIdx,
                  }"
                  :draggable="!!row.productId"
                  @dragstart="onRawDragStart(rawIdx, $event)"
                  @dragover="onRawDragOver(rawIdx, $event)"
                  @drop="onRawDrop(rawIdx, $event)"
                  @dragend="onRawDragEnd"
                >
                  <td class="bf-td bf-td--grip">
                    <MpIcon v-if="row.productId" name="drag" size="sm" />
                  </td>
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete :id="`raw-prod-${row.id}`" v-model="row.productId" :data="productOptions" label-prop="name" value-prop="id" :placeholder="t('Select product')" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onRawProduct(row, v)" />
                  </td>
                  <td class="bf-td"><template v-if="row.productId">{{ row.sku || '—' }}</template></td>
                  <td class="bf-td bf-td--input"><MpInput v-if="row.productId" :id="`raw-need-${row.id}`" v-model="row.needed" type="number" placeholder="0" is-full-width /></td>
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete v-if="row.productId" :id="`raw-unit-${row.id}`" v-model="row.unit" :data="UNIT_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select unit')" is-searchable use-portal is-full-width />
                  </td>
                  <td class="bf-td bf-td--num bf-td--right"><template v-if="row.productId">{{ row.purchaseCost ? formatIDR(row.purchaseCost) : '—' }}</template></td>
                  <td class="bf-td bf-td--num bf-td--right"><template v-if="row.productId">{{ formatIDR(rawEstimated(row)) }}</template></td>
                  <td class="bf-td bf-td--del">
                    <button v-if="row.productId" class="bf-del-btn" type="button" @click="removeRow(rawRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bf-subtotal-row">
            <span>{{ t('Estimated raw materials subtotal') }}</span>
            <span class="bf-subtotal-amount">{{ formatIDR(rawSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Production cost ══════════════════════════════════════════════ -->
        <section class="bf-section">
          <h2 class="bf-section-title">{{ t('Production cost') }}</h2>
          <div class="bf-table-scroll">
            <table class="bf-table">
              <colgroup>
                <col style="width:240px" /><col style="width:240px" /><col />
                <col style="width:240px" /><col style="width:44px" />
              </colgroup>
              <tbody v-for="group in costGroups" :key="group.key">
                <tr>
                  <th class="bf-th">{{ group.label }}</th>
                  <th class="bf-th">{{ t('Cost driver') }}</th>
                  <th class="bf-th bf-th--spacer" />
                  <th class="bf-th bf-th--right">{{ t('Amount') }}</th>
                  <th class="bf-th bf-th--del" />
                </tr>
                <tr v-for="row in group.rows" :key="row.id" class="bf-tr">
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete :id="`cost-acc-${group.key}-${row.id}`" v-model="row.account" :data="COST_ACCOUNT_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select account mapping')" is-searchable is-clearable use-portal is-full-width @update:model-value="() => onCostAccount(group, row)" />
                  </td>
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete v-if="row.account" :id="`cost-drv-${group.key}-${row.id}`" v-model="row.costDriver" :data="COST_DRIVER_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select cost driver')" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="bf-td bf-td--spacer" />
                  <td class="bf-td bf-td--input bf-td--num-input">
                    <MpInputGroup v-if="row.account" :id="`cost-amt-group-${group.key}-${row.id}`" is-full-width>
                      <MpInputLeftAddon>Rp</MpInputLeftAddon>
                      <MpInput :id="`cost-amt-${group.key}-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width />
                    </MpInputGroup>
                  </td>
                  <td class="bf-td bf-td--del">
                    <button v-if="row.account" class="bf-del-btn" type="button" @click="removeCostRow(group, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bf-subtotal-row">
            <span>{{ t('Production cost subtotal') }}</span>
            <span class="bf-subtotal-amount">{{ formatIDR(productionCostSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Routing ══════════════════════════════════════════════════════ -->
        <section class="bf-section">
          <h2 class="bf-section-title">{{ t('Routing') }}</h2>
          <div class="bf-table-scroll">
            <table class="bf-table">
              <colgroup>
                <col style="width:240px" /><col /><col style="width:240px" />
                <col style="width:240px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="bf-th">{{ t('Process') }}</th><th class="bf-th">{{ t('Description') }}</th><th class="bf-th">{{ t('Account mapping') }}</th>
                  <th class="bf-th bf-th--right">{{ t('Amount') }}</th><th class="bf-th bf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in routeRows" :key="row.id" class="bf-tr">
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete :id="`route-proc-${row.id}`" v-model="row.process" :data="PROCESS_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select process')" is-searchable is-clearable use-portal is-full-width @update:model-value="() => onRouteProcess(row)" />
                  </td>
                  <td class="bf-td bf-td--input"><MpInput v-if="row.process" :id="`route-desc-${row.id}`" v-model="row.description" :placeholder="t('Description')" is-full-width /></td>
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete v-if="row.process" :id="`route-map-${row.id}`" v-model="row.accountMapping" :data="ACCOUNT_MAPPING_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select account mapping')" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="bf-td bf-td--input bf-td--num-input">
                    <MpInputGroup v-if="row.process" :id="`route-amt-group-${row.id}`" is-full-width>
                      <MpInputLeftAddon>Rp</MpInputLeftAddon>
                      <MpInput :id="`route-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width />
                    </MpInputGroup>
                  </td>
                  <td class="bf-td bf-td--del">
                    <button v-if="row.process" class="bf-del-btn" type="button" @click="removeRow(routeRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bf-subtotal-row">
            <span>{{ t('Routing cost subtotal') }}</span>
            <span class="bf-subtotal-amount">{{ formatIDR(routingSubtotal) }}</span>
          </div>

          <!-- Cost summary -->
          <div class="bf-summary">
            <div class="bf-summary-row"><span>{{ t('Estimated raw materials subtotal') }}</span><span>{{ formatIDR(rawSubtotal) }}</span></div>
            <div class="bf-summary-row"><span>{{ t('Production cost subtotal') }}</span><span>{{ formatIDR(productionCostSubtotal) }}</span></div>
            <div class="bf-summary-row"><span>{{ t('Routing cost subtotal') }}</span><span>{{ formatIDR(routingSubtotal) }}</span></div>
            <div class="bf-summary-row bf-summary-row--total"><span>{{ t('Estimated total production cost') }}</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
          </div>
        </section>

        <!-- ══ Finished goods ═══════════════════════════════════════════════ -->
        <section class="bf-section bf-section--last">
          <h2 class="bf-section-title">{{ t('Finished goods') }}</h2>

          <!-- Main output — a single editable row -->
          <h3 class="bf-subsection-title">{{ t('Main output') }}</h3>
          <div class="bf-table-scroll">
            <table class="bf-table">
              <colgroup>
                <col style="width:240px" /><col style="width:240px" /><col style="width:120px" />
                <col style="width:120px" /><col style="width:120px" /><col /><col style="width:240px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="bf-th">{{ t('Product') }}</th><th class="bf-th">SKU</th><th class="bf-th">{{ t('Produced qty') }}</th>
                  <th class="bf-th">{{ t('Unit') }}</th><th class="bf-th">{{ t('Percentage') }}</th><th class="bf-th bf-th--spacer" /><th class="bf-th bf-th--right">{{ t('Estimated cost') }}</th><th class="bf-th bf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr class="bf-tr">
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete id="main-prod" v-model="mainRow.productId" :data="productOptions" label-prop="name" value-prop="id" :placeholder="t('Select product')" is-searchable is-clearable use-portal is-full-width :is-invalid="mainProductError" @update:model-value="(v: string) => { onMainProduct(v); mainProductError = false }" />
                  </td>
                  <td class="bf-td"><template v-if="mainRow.productId">{{ mainRow.sku || '—' }}</template></td>
                  <td class="bf-td bf-td--input"><MpInput v-if="mainRow.productId" id="main-qty" v-model="mainRow.producedQty" type="number" placeholder="0" is-full-width /></td>
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete v-if="mainRow.productId" id="main-unit" v-model="mainRow.unit" :data="UNIT_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select unit')" is-searchable use-portal is-full-width />
                  </td>
                  <td class="bf-td bf-td--input bf-td--pct">
                    <MpInputGroup v-if="mainRow.productId" id="main-pct-group" is-full-width>
                      <MpInput id="main-pct" :model-value="String(mainPercentage)" type="number" is-full-width is-disabled />
                      <MpInputRightAddon>%</MpInputRightAddon>
                    </MpInputGroup>
                  </td>
                  <td class="bf-td bf-td--spacer" />
                  <td class="bf-td bf-td--num bf-td--right"><template v-if="mainRow.productId">{{ formatIDR(mainOutputSubtotal) }}</template></td>
                  <td class="bf-td bf-td--del" />
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bf-subtotal-row">
            <span>{{ t('Estimated main output subtotal') }}</span>
            <span class="bf-subtotal-amount">{{ formatIDR(mainOutputSubtotal) }}</span>
          </div>

          <!-- Other outputs -->
          <h3 class="bf-subsection-title">{{ t('Other outputs') }}</h3>
          <div class="bf-table-scroll">
            <table class="bf-table">
              <colgroup>
                <col style="width:240px" /><col style="width:240px" /><col style="width:120px" />
                <col style="width:120px" /><col style="width:120px" /><col /><col style="width:240px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="bf-th">{{ t('Product') }}</th><th class="bf-th">SKU</th><th class="bf-th">{{ t('Produced qty') }}</th>
                  <th class="bf-th">{{ t('Unit') }}</th><th class="bf-th">{{ t('Percentage') }}</th><th class="bf-th bf-th--spacer" /><th class="bf-th bf-th--right">{{ t('Estimated cost') }}</th><th class="bf-th bf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in otherRows" :key="row.id" class="bf-tr">
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete :id="`other-prod-${row.id}`" v-model="row.productId" :data="productOptions" label-prop="name" value-prop="id" :placeholder="t('Select product')" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onOtherProduct(row, v)" />
                  </td>
                  <td class="bf-td"><template v-if="row.productId">{{ row.sku || '—' }}</template></td>
                  <td class="bf-td bf-td--input"><MpInput v-if="row.productId" :id="`other-qty-${row.id}`" v-model="row.producedQty" type="number" placeholder="0" is-full-width /></td>
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete v-if="row.productId" :id="`other-unit-${row.id}`" v-model="row.unit" :data="UNIT_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select unit')" is-searchable use-portal is-full-width />
                  </td>
                  <td class="bf-td bf-td--input bf-td--pct">
                    <MpInputGroup v-if="row.productId" :id="`other-pct-group-${row.id}`" is-full-width>
                      <MpInput :id="`other-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width />
                      <MpInputRightAddon>%</MpInputRightAddon>
                    </MpInputGroup>
                  </td>
                  <td class="bf-td bf-td--spacer" />
                  <td class="bf-td bf-td--num bf-td--right"><template v-if="row.productId">{{ formatIDR(otherEstCost(row)) }}</template></td>
                  <td class="bf-td bf-td--del">
                    <button v-if="row.productId" class="bf-del-btn" type="button" @click="removeRow(otherRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bf-subtotal-row">
            <span>{{ t('Estimated other outputs subtotal') }}</span>
            <span class="bf-subtotal-amount">{{ formatIDR(otherOutputsSubtotal) }}</span>
          </div>

          <!-- Production waste -->
          <h3 class="bf-subsection-title">{{ t('Production waste') }}</h3>
          <div class="bf-table-scroll">
            <table class="bf-table">
              <colgroup>
                <col style="width:240px" /><col style="width:240px" /><col style="width:240px" />
                <col style="width:120px" /><col /><col style="width:240px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="bf-th">{{ t('Account mapping') }}</th><th class="bf-th bf-th--spacer" /><th class="bf-th">{{ t('Allocation method') }}</th>
                  <th class="bf-th">{{ t('Percentage') }}</th><th class="bf-th bf-th--spacer" /><th class="bf-th bf-th--right">Amount</th><th class="bf-th bf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in wasteRows" :key="row.id" class="bf-tr">
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete :id="`waste-map-${row.id}`" v-model="row.accountMapping" :data="ACCOUNT_MAPPING_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select account mapping')" is-searchable is-clearable use-portal is-full-width @update:model-value="() => onWasteMapping(row)" />
                  </td>
                  <td class="bf-td bf-td--spacer" />
                  <td class="bf-td bf-td--input">
                    <MpAutocomplete v-if="row.accountMapping" :id="`waste-alloc-${row.id}`" v-model="row.allocationMethod" :data="ALLOCATION_METHOD_OPTIONS" label-prop="name" value-prop="id" :placeholder="t('Select allocation method')" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="bf-td bf-td--input bf-td--pct">
                    <MpInputGroup v-if="row.accountMapping && isWasteByAmount(row)" :id="`waste-pct-group-${row.id}`" is-full-width>
                      <MpInput :id="`waste-pct-${row.id}`" :model-value="wastePercentage(row).toFixed(2)" type="number" is-full-width is-disabled />
                      <MpInputRightAddon>%</MpInputRightAddon>
                    </MpInputGroup>
                    <MpInputGroup v-else-if="row.accountMapping" :id="`waste-pct-group-${row.id}`" is-full-width>
                      <MpInput :id="`waste-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width />
                      <MpInputRightAddon>%</MpInputRightAddon>
                    </MpInputGroup>
                  </td>
                  <td class="bf-td bf-td--spacer" />
                  <td class="bf-td" :class="isWasteByAmount(row) ? 'bf-td--input bf-td--num-input' : 'bf-td--num bf-td--right'">
                    <MpInputGroup v-if="row.accountMapping && isWasteByAmount(row)" :id="`waste-amt-group-${row.id}`" is-full-width>
                      <MpInputLeftAddon>Rp</MpInputLeftAddon>
                      <MpInput :id="`waste-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width />
                    </MpInputGroup>
                    <template v-else-if="row.accountMapping">{{ formatIDR(wasteAmount(row)) }}</template>
                  </td>
                  <td class="bf-td bf-td--del">
                    <button v-if="row.accountMapping" class="bf-del-btn" type="button" @click="removeRow(wasteRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bf-subtotal-row">
            <span>{{ t('Estimated production waste subtotal') }}</span>
            <span class="bf-subtotal-amount">{{ formatIDR(wasteSubtotal) }}</span>
          </div>

          <!-- Finished goods summary -->
          <div class="bf-summary">
            <div class="bf-summary-row"><span>{{ t('Estimated main output subtotal') }}</span><span>{{ formatIDR(mainOutputSubtotal) }}</span></div>
            <div class="bf-summary-row"><span>{{ t('Estimated other outputs subtotal') }}</span><span>{{ formatIDR(otherOutputsSubtotal) }}</span></div>
            <div class="bf-summary-row"><span>{{ t('Estimated production waste subtotal') }}</span><span>{{ formatIDR(wasteSubtotal) }}</span></div>
            <div class="bf-summary-row bf-summary-row--total"><span>{{ t('Estimated finished goods total') }}</span><span>{{ formatIDR(finishedGoodsTotal) }}</span></div>
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
  </div>
</template>

<style scoped>
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
.bf-body { display: flex; flex-direction: column; }
.bf-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default); }
.bf-section:first-child { padding-top: 0; }
.bf-section--last { border-bottom: none; }
.bf-section-title {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.bf-subsection-title {
  margin: var(--mp-spacing-6) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Info fields ─────────────────────────────────────────────────────────── */
.bf-field { margin-bottom: var(--mp-spacing-4); }
.bf-field--sm { max-width: 318px; }
.bf-field--lg { max-width: 660px; }
.bf-field--mt { margin-top: var(--mp-spacing-6); }
.bf-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 318px));
  gap: var(--mp-spacing-4) var(--mp-spacing-6); align-items: start; max-width: 660px;
  margin-bottom: var(--mp-spacing-4);
}
.bf-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.bf-label-row--between { justify-content: space-between; }
.bf-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.bf-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Checkbox with title + description — constrained to its own content width so
   only the checkbox + label area is clickable (not the full stage width). */
.bf-check { display: inline-flex; width: fit-content; max-width: 660px; align-items: flex-start; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); cursor: pointer; }
.bf-check-body { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.bf-check-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bf-check-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }

/* ── Attachment ──────────────────────────────────────────────────────────── */
.bf-attachment { margin-top: var(--mp-spacing-6); max-width: 660px; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bf-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bf-file-hidden { display: none; }
.bf-attachment-row {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4); border: 1px dashed var(--mp-border-bold); border-radius: var(--mp-radii-md);
}
.bf-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bf-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.bf-file-list { margin: var(--mp-spacing-1) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bf-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.bf-file-name { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bf-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.bf-file-remove:hover { color: var(--mp-text-critical); }

/* ── Section toolbar (Sub-assembly button) ───────────────────────────────── */
.bf-toolbar { margin-bottom: var(--mp-spacing-3); }

/* ── Line-item tables (shared borderless create-table pattern) ───────────── */
.bf-table-scroll {
  overflow-x: auto;
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.bf-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; min-width: max-content; }
.bf-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.bf-th--right { text-align: right; }
.bf-th--grip { padding: 0; }
.bf-th.bf-th--del, .bf-td.bf-td--del {
  position: sticky; right: 0; z-index: 2; width: 44px; min-width: 44px; padding: 0; text-align: center;
  box-shadow: inset 1px 0 var(--mp-border-default);
}
.bf-td:nth-last-child(2) { border-right: none; }
.bf-th--del { background: var(--mp-background-neutral-subtle); }
.bf-td--del { background: var(--mp-background-neutral); }
.bf-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
}
.bf-td:last-child { border-right: none; }
.bf-tr:last-child .bf-td { border-bottom: none; }
.bf-td--num { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.bf-td--right { text-align: right; }
.bf-td--grip { padding: 0; text-align: center; color: var(--mp-text-disabled); cursor: grab; }
.bf-tr--dragging { opacity: 0.4; }
.bf-tr--over-above .bf-td { border-top: 2px solid var(--mp-border-selected, #2563eb); }
.bf-tr--over-below .bf-td { border-bottom: 2px solid var(--mp-border-selected, #2563eb); }
.bf-td--input { padding: 0; vertical-align: middle; background: var(--mp-background-neutral, #fff); }
.bf-td--num-input { padding: 0; background: var(--mp-background-neutral, #fff); }
.bf-td--num-input :deep(input) { text-align: right; }
.bf-td--pct { padding: 0; background: var(--mp-background-neutral, #fff); }
.bf-td--input :deep([class*='input']),
.bf-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.bf-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); z-index: 1; }
.bf-del-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
  border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
}
.bf-del-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-critical); }

/* ── Subtotal + summary ──────────────────────────────────────────────────── */
.bf-subtotal-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  padding: var(--mp-spacing-3) var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.bf-subtotal-amount { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.bf-summary { margin-top: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bf-summary-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.bf-summary-row > :last-child { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.bf-summary-row--total { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
