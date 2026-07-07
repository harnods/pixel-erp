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
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpDatePicker, MpButton, MpIcon,
  MpCheckbox, MpRadio, toast,
} from '@mekari/pixel3'
import { CATALOG } from '~/data/catalog'
import { warehouses } from '~/data/warehouses'

const router = useRouter()
function goList() { router.push('/work-orders') }

// ── Option lists ────────────────────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { id: 'Standard', name: 'Standard' },
  { id: 'Order', name: 'Order' },
]
const WO_TYPE_OPTIONS = [
  { id: 'Assembly', name: 'Assembly' },
  { id: 'Disassembly', name: 'Disassembly' },
]
const BOM_OPTIONS = [
  { id: 'bom-10006', name: 'Skateboard',           no: 'Bill of Materials #10006', type: 'Assembly' },
  { id: 'bom-10007', name: 'Espresso Blend 1kg',   no: 'Bill of Materials #10007', type: 'Assembly' },
  { id: 'bom-10008', name: 'Cold Brew Concentrate', no: 'Bill of Materials #10008', type: 'Assembly' },
  { id: 'bom-10009', name: 'Gift Box - Signature', no: 'Bill of Materials #10009', type: 'Assembly' },
  { id: 'bom-10010', name: 'Drip Bag Pack (10s)',  no: 'Bill of Materials #10010', type: 'Disassembly' },
]
const productOptions = CATALOG.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.price, sku: p.sku }))
const warehouseOptions = warehouses
  .filter(w => !w.isDefault && w.status === 'active')
  .map(w => ({ id: w.id, name: w.name }))
const UNIT_OPTIONS = [...new Set(CATALOG.map(p => p.unit))].map(u => ({ id: u, name: u }))
const COST_ACCOUNT_OPTIONS = [
  { id: 'labour', name: 'Direct labour' },
  { id: 'overhead', name: 'Manufacturing overhead' },
  { id: 'electricity', name: 'Electricity' },
  { id: 'depreciation', name: 'Machine depreciation' },
]
const COST_DRIVER_OPTIONS = [
  { id: 'labour-hour', name: 'Labour hour' },
  { id: 'machine-hour', name: 'Machine hour' },
  { id: 'unit', name: 'Unit produced' },
]
const PROCESS_OPTIONS = [
  { id: 'assembly', name: 'Assembly' },
  { id: 'painting', name: 'Painting' },
  { id: 'finishing', name: 'Finishing & packing' },
  { id: 'qc', name: 'Quality control' },
]
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
const planDates = ref('') // "DD/MM/YYYY - DD/MM/YYYY"
const planDatesError = ref(false)
const producedQty = ref('')
const createAsSubAssembly = ref(false)

const bomNo = computed(() => BOM_OPTIONS.find(b => b.id === bomId.value)?.no ?? '')

// The line-item sections (raw materials → finished goods) only exist once a BOM is
// chosen — that BOM defines them. While its data "loads", the sections render with
// skeleton placeholder rows (Figma: default state = info only; loading = skeletons).
const hasBom = computed(() => !!bomId.value)
const bomLoading = ref(false)
let bomTimer: ReturnType<typeof setTimeout> | null = null

function onBomSelect(id: string) {
  const bom = BOM_OPTIONS.find(b => b.id === id)
  bomError.value = false
  if (bom && !workOrderType.value) workOrderType.value = bom.type
  if (bomTimer) { clearTimeout(bomTimer); bomTimer = null }
  if (id) {
    bomLoading.value = true
    bomTimer = setTimeout(() => {
      fillDummyData()
      bomLoading.value = false
    }, 1200)
  } else {
    resetLineItems()
    bomLoading.value = false
  }
}
onUnmounted(() => { if (bomTimer) clearTimeout(bomTimer) })

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
function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 2,
  }).format(n || 0)
}
const num = (v: string) => Number(v) || 0
const productName = (id: string) => productOptions.find(p => p.id === id)?.name ?? ''

// ── Raw materials ────────────────────────────────────────────────────────────
interface RawRow { id: number; productId: string; purchaseCost: number; warehouseId: string; needed: string; unit: string; requiredDate: string }
let rawSeq = 0
const makeRaw = (): RawRow => ({ id: rawSeq++, productId: '', purchaseCost: 0, warehouseId: '', needed: '', unit: '', requiredDate: '' })
const rawRows = ref<RawRow[]>([makeRaw()])
const bulkSetWarehouse = ref(false)
function onRawProduct(row: RawRow, id: string) {
  const p = CATALOG.find(c => c.id === id)
  row.purchaseCost = p?.price ?? 0
  if (p && !row.unit) row.unit = p.unit
  appendIfLast(rawRows, row.id, makeRaw)
}
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

// ── Cost summary ─────────────────────────────────────────────────────────────
const totalProductionCost = computed(() => rawSubtotal.value + productionCostSubtotal.value + routingSubtotal.value)

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

// ── Dummy BOM data ─────────────────────────────────────────────────────────────
// When a BOM finishes "loading", its materials / cost / routing / outputs are
// populated with representative dummy rows (Figma: filled variant). Option ids come
// from the real data lists so the in-cell autocompletes display their labels.
function fillDummyData() {
  const wh = warehouseOptions[0]?.id ?? ''
  const reqDate = '01/03/2026'
  // purchase cost + needed mirror the Figma reference (tidy subtotal), product ids
  // come from the catalog so the in-cell autocompletes show a real product name.
  const rawSpec = [
    { cost: 100_000, needed: '10' },
    { cost: 2_000,   needed: '80' },
    { cost: 30_000,  needed: '40' },
    { cost: 50_000,  needed: '20' },
  ]
  rawRows.value = CATALOG.slice(0, 4).map((p, i) => ({
    id: rawSeq++, productId: p.id, purchaseCost: rawSpec[i]!.cost, warehouseId: wh,
    needed: rawSpec[i]!.needed, unit: p.unit, requiredDate: reqDate,
  }))
  rawRows.value.push(makeRaw())

  costRows.value = [
    { id: costSeq++, account: 'labour',   costDriver: 'labour-hour',  estUnitCost: '100000', multiplier: '1' },
    { id: costSeq++, account: 'overhead', costDriver: 'machine-hour', estUnitCost: '1000',   multiplier: '50' },
    makeCost(),
  ]

  routeRows.value = [
    { id: routeSeq++, process: 'assembly',  description: 'Check every components before start assembling', accountMapping: 'routing-cost', amount: '25000' },
    { id: routeSeq++, process: 'painting',  description: 'Follow the instruction guide to assembly',       accountMapping: 'routing-cost', amount: '25000' },
    { id: routeSeq++, process: 'finishing', description: 'Apply paint and coating',                        accountMapping: 'routing-cost', amount: '25000' },
    makeRoute(),
  ]

  // Main output is a single row defined by the BOM — no trailing/empty row (it can't
  // be added to, changed, or removed; only the produced qty is editable).
  const mainProduct = CATALOG[10] ?? CATALOG[0]!
  mainRows.value = [
    { id: mainSeq++, productId: mainProduct.id, sku: mainProduct.sku, producedQty: '10', unit: mainProduct.unit, percentage: '90', estCost: '3204000' },
  ]
  const otherProduct = CATALOG[5] ?? CATALOG[1]!
  otherRows.value = [
    { id: otherSeq++, productId: otherProduct.id, sku: otherProduct.sku, producedQty: '50', unit: otherProduct.unit, percentage: '5', estCost: '178000' },
    makeOutput(() => otherSeq++),
  ]
  wasteRows.value = [
    { id: wasteSeq++, accountMapping: 'waste', allocationMethod: 'percentage', percentage: '5', amount: '178000' },
    makeWaste(),
  ]

  // Complete the header for a filled-form look (only where the user hasn't typed).
  if (!producedQty.value) producedQty.value = '10'
  if (!planDates.value) planDates.value = '01/03/2026 - 10/03/2026'
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
  if (!planDates.value) { planDatesError.value = true; ok = false }
  return ok
}
function handleSave() {
  if (!validate()) return
  toast.notify({ variant: 'success', title: 'Work order saved' })
  goList()
}
function handleSaveDraft() {
  toast.notify({ variant: 'success', title: 'Work order saved as draft' })
  goList()
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
          <button class="detail-breadcrumb" @click="goList">Work orders</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New work order</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <div class="wo-body">

        <!-- ══ Work order info ══════════════════════════════════════════════ -->
        <section class="wo-section">
          <h2 class="wo-section-title">Work order info</h2>
          <div class="wo-grid">
            <!-- Work order no. (auto) -->
            <MpFormControl id="wo-no" is-required>
              <div class="wo-label-row">
                <MpFormLabel>Work order no.</MpFormLabel>
                <span class="wo-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
              </div>
              <MpInput id="wo-no-input" model-value="" placeholder="[Auto]" is-full-width is-disabled />
            </MpFormControl>

            <!-- Category -->
            <MpFormControl id="wo-category" is-required :is-invalid="categoryError">
              <MpFormLabel>Category</MpFormLabel>
              <MpAutocomplete
                id="wo-category-ac" v-model="category" :data="CATEGORY_OPTIONS"
                label-prop="name" value-prop="id" placeholder="Select category"
                is-clearable use-portal is-full-width :is-invalid="categoryError"
                @update:model-value="categoryError = false"
              />
              <MpFormErrorMessage>Please select a category</MpFormErrorMessage>
            </MpFormControl>

            <!-- BOM name -->
            <MpFormControl id="wo-bom" is-required :is-invalid="bomError">
              <MpFormLabel>BOM name</MpFormLabel>
              <MpAutocomplete
                id="wo-bom-ac" v-model="bomId" :data="BOM_OPTIONS"
                label-prop="name" value-prop="id" placeholder="Select BOM"
                is-searchable is-clearable use-portal is-full-width :is-invalid="bomError"
                @update:model-value="onBomSelect"
              />
              <MpFormErrorMessage>Please select a BOM</MpFormErrorMessage>
            </MpFormControl>

            <!-- BOM no. (read-only, derived from the selected BOM) -->
            <MpFormControl id="wo-bomno">
              <MpFormLabel>BOM no.</MpFormLabel>
              <MpInput id="wo-bomno-input" :model-value="bomNo" placeholder="[Auto]" is-full-width is-disabled />
            </MpFormControl>

            <!-- Work order type -->
            <MpFormControl id="wo-type" is-required :is-invalid="workOrderTypeError">
              <MpFormLabel>Work order type</MpFormLabel>
              <MpAutocomplete
                id="wo-type-ac" v-model="workOrderType" :data="WO_TYPE_OPTIONS"
                label-prop="name" value-prop="id" placeholder="Select type"
                is-clearable use-portal is-full-width :is-invalid="workOrderTypeError"
                @update:model-value="workOrderTypeError = false"
              />
              <MpFormErrorMessage>Please select a work order type</MpFormErrorMessage>
            </MpFormControl>

            <!-- Track routing -->
            <MpFormControl id="wo-routing" is-required>
              <MpFormLabel>Track routing</MpFormLabel>
              <div class="wo-radio-group">
                <label class="wo-radio-item">
                  <MpRadio id="wo-routing-yes" name="wo-routing" value="yes" :is-checked="trackRouting === 'yes'" @change="trackRouting = 'yes'" />
                  <span>Yes</span>
                </label>
                <label class="wo-radio-item">
                  <MpRadio id="wo-routing-no" name="wo-routing" value="no" :is-checked="trackRouting === 'no'" @change="trackRouting = 'no'" />
                  <span>No</span>
                </label>
              </div>
            </MpFormControl>

            <!-- Production plan dates -->
            <MpFormControl id="wo-plan" is-required :is-invalid="planDatesError">
              <MpFormLabel>Production plan dates</MpFormLabel>
              <div class="wo-datepicker">
                <MpDatePicker
                  id="wo-plan-dp" v-model="planDates" is-range format="DD/MM/YYYY"
                  value-type="format" range-separator=" - " placeholder="Start date - End date"
                  use-portal @update:model-value="planDatesError = false"
                />
              </div>
              <MpFormErrorMessage>Please set the production plan dates</MpFormErrorMessage>
            </MpFormControl>

            <!-- Produced qty -->
            <MpFormControl id="wo-qty">
              <MpFormLabel>Produced qty</MpFormLabel>
              <div class="wo-qty-row">
                <MpInput id="wo-qty-input" v-model="producedQty" type="number" placeholder="0" is-full-width />
                <span class="wo-qty-unit">Pcs</span>
              </div>
            </MpFormControl>
          </div>

          <!-- Attachment -->
          <div class="wo-attachment">
            <div class="wo-section-label">Attachment</div>
            <input
              ref="fileInput" type="file" multiple
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              class="wo-file-hidden" @change="onFileChange"
            />
            <div class="wo-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">Choose file</MpButton>
              <span class="wo-attach-or">or drag and drop here</span>
            </div>
            <p class="wo-helper-text">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum size of 10 MB and 3 files per BOM</p>
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
            <span>Create as sub-assembly</span>
          </label>
        </section>

        <!-- ══ Raw materials ════════════════════════════════════════════════ -->
        <!-- The line-item sections appear only once a BOM is chosen (it defines them). -->
        <section v-if="hasBom" class="wo-section">
          <h2 class="wo-section-title">Raw materials</h2>
          <p class="wo-section-desc">Unit purchase cost may change if inventory value is adjusted.</p>
          <label class="wo-checkbox-row wo-checkbox-row--tight">
            <MpCheckbox id="wo-bulk-wh" :is-checked="bulkSetWarehouse" @change="bulkSetWarehouse = !bulkSetWarehouse" />
            <span>Bulk set warehouse</span>
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
                  <th class="wo-th">Product</th><th class="wo-th">Purchase cost</th><th class="wo-th">Warehouse</th>
                  <th class="wo-th">Needed</th><th class="wo-th">Unit</th><th class="wo-th">Required date</th>
                  <th class="wo-th wo-th--right">Estimated cost</th><th class="wo-th wo-th--del" />
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
                    <MpAutocomplete :id="`raw-prod-${row.id}`" v-model="row.productId" :data="productOptions" label-prop="name" value-prop="id" placeholder="Select product" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onRawProduct(row, v)" />
                  </td>
                  <td class="wo-td wo-td--num">{{ row.purchaseCost ? formatIDR(row.purchaseCost) : '—' }}</td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`raw-wh-${row.id}`" v-model="row.warehouseId" :data="warehouseOptions" label-prop="name" value-prop="id" placeholder="Select" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput :id="`raw-need-${row.id}`" v-model="row.needed" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`raw-unit-${row.id}`" v-model="row.unit" :data="UNIT_OPTIONS" label-prop="name" value-prop="id" placeholder="Unit" is-searchable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input">
                    <div class="wo-datepicker"><MpDatePicker :id="`raw-date-${row.id}`" v-model="row.requiredDate" format="DD/MM/YYYY" value-type="format" placeholder="DD/MM/YYYY" is-clearable use-portal /></div>
                  </td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(rawEstimated(row)) }}</td>
                  <td class="wo-td wo-td--del">
                    <button v-if="!(rawRows.length === 1 && !row.productId)" class="wo-del-btn" type="button" @click="removeRow(rawRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>Estimated raw materials subtotal</span>
            <span class="wo-subtotal-amount">{{ formatIDR(rawSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Production cost ══════════════════════════════════════════════ -->
        <section v-if="hasBom" class="wo-section">
          <h2 class="wo-section-title">Production cost</h2>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:200px" /><col style="width:180px" />
                <col style="width:140px" /><col style="width:180px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">Other cost</th><th class="wo-th">Cost driver</th><th class="wo-th">Estimated unit cost</th>
                  <th class="wo-th">Multiplier</th><th class="wo-th wo-th--right">Amount</th><th class="wo-th wo-th--del" />
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
                    <MpAutocomplete :id="`cost-acc-${row.id}`" v-model="row.account" :data="COST_ACCOUNT_OPTIONS" label-prop="name" value-prop="id" placeholder="Select cost account" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onCostAccount(row, v)" />
                  </td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`cost-drv-${row.id}`" v-model="row.costDriver" :data="COST_DRIVER_OPTIONS" label-prop="name" value-prop="id" placeholder="Select" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput :id="`cost-unit-${row.id}`" v-model="row.estUnitCost" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input"><MpInput :id="`cost-mult-${row.id}`" v-model="row.multiplier" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(costAmount(row)) }}</td>
                  <td class="wo-td wo-td--del">
                    <button v-if="!(costRows.length === 1 && !row.account)" class="wo-del-btn" type="button" @click="removeRow(costRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>Production cost subtotal</span>
            <span class="wo-subtotal-amount">{{ formatIDR(productionCostSubtotal) }}</span>
          </div>
        </section>

        <!-- ══ Routing ══════════════════════════════════════════════════════ -->
        <section v-if="hasBom" class="wo-section">
          <h2 class="wo-section-title">Routing</h2>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col style="width:220px" /><col /><col style="width:200px" />
                <col style="width:180px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">Process</th><th class="wo-th">Description</th><th class="wo-th">Account mapping</th>
                  <th class="wo-th wo-th--right">Amount</th><th class="wo-th wo-th--del" />
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
                    <MpAutocomplete :id="`route-proc-${row.id}`" v-model="row.process" :data="PROCESS_OPTIONS" label-prop="name" value-prop="id" placeholder="Select process" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onRouteProcess(row, v)" />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput :id="`route-desc-${row.id}`" v-model="row.description" placeholder="Description" is-full-width /></td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`route-map-${row.id}`" v-model="row.accountMapping" :data="ACCOUNT_MAPPING_OPTIONS" label-prop="name" value-prop="id" placeholder="Select" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput :id="`route-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="!(routeRows.length === 1 && !row.process)" class="wo-del-btn" type="button" @click="removeRow(routeRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>Routing cost subtotal</span>
            <span class="wo-subtotal-amount">{{ formatIDR(routingSubtotal) }}</span>
          </div>

          <!-- Cost summary -->
          <div class="wo-summary">
            <div class="wo-summary-row"><span>Estimated subtotal of raw materials</span><span>{{ formatIDR(rawSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>Subtotal production cost</span><span>{{ formatIDR(productionCostSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>Subtotal routing cost</span><span>{{ formatIDR(routingSubtotal) }}</span></div>
            <div class="wo-summary-row wo-summary-row--total"><span>Estimated total of production cost</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
          </div>
        </section>

        <!-- ══ Finished goods ═══════════════════════════════════════════════ -->
        <section v-if="hasBom" class="wo-section wo-section--last">
          <h2 class="wo-section-title">Finished goods</h2>

          <!-- Main output -->
          <h3 class="wo-subsection-title">Main output</h3>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:140px" /><col style="width:140px" />
                <col style="width:110px" /><col style="width:140px" /><col style="width:160px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">Product</th><th class="wo-th">SKU</th><th class="wo-th">Produced qty</th>
                  <th class="wo-th">Unit</th><th class="wo-th">Percentage</th><th class="wo-th wo-th--right">Estimated cost</th><th class="wo-th wo-th--del" />
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
            <span>Estimated main output subtotal</span>
            <span class="wo-subtotal-amount">{{ formatIDR(mainOutputSubtotal) }}</span>
          </div>

          <!-- Other outputs -->
          <h3 class="wo-subsection-title">Other outputs</h3>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:140px" /><col style="width:140px" />
                <col style="width:110px" /><col style="width:140px" /><col style="width:160px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">Product</th><th class="wo-th">SKU</th><th class="wo-th">Produced qty</th>
                  <th class="wo-th">Unit</th><th class="wo-th">Percentage</th><th class="wo-th wo-th--right">Estimated cost</th><th class="wo-th wo-th--del" />
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
                    <MpAutocomplete :id="`other-prod-${row.id}`" v-model="row.productId" :data="productOptions" label-prop="name" value-prop="id" placeholder="Select product" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onOtherProduct(row, v)" />
                  </td>
                  <td class="wo-td">{{ row.sku || '—' }}</td>
                  <td class="wo-td wo-td--input"><MpInput :id="`other-qty-${row.id}`" v-model="row.producedQty" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`other-unit-${row.id}`" v-model="row.unit" :data="UNIT_OPTIONS" label-prop="name" value-prop="id" placeholder="Unit" is-searchable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput :id="`other-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput :id="`other-cost-${row.id}`" v-model="row.estCost" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="!(otherRows.length === 1 && !row.productId)" class="wo-del-btn" type="button" @click="removeRow(otherRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>Estimated other outputs subtotal</span>
            <span class="wo-subtotal-amount">{{ formatIDR(otherOutputsSubtotal) }}</span>
          </div>

          <!-- Production waste -->
          <h3 class="wo-subsection-title">Production waste</h3>
          <div class="wo-table-scroll">
            <table class="wo-table">
              <colgroup>
                <col /><col style="width:200px" /><col style="width:160px" />
                <col style="width:180px" /><col style="width:44px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wo-th">Account mapping</th><th class="wo-th">Allocation method</th><th class="wo-th">Percentage</th>
                  <th class="wo-th wo-th--right">Amount</th><th class="wo-th wo-th--del" />
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
                    <MpAutocomplete :id="`waste-map-${row.id}`" v-model="row.accountMapping" :data="ACCOUNT_MAPPING_OPTIONS" label-prop="name" value-prop="id" placeholder="Select account mapping" is-searchable is-clearable use-portal is-full-width @update:model-value="(v: string) => onWasteMapping(row, v)" />
                  </td>
                  <td class="wo-td wo-td--input">
                    <MpAutocomplete :id="`waste-alloc-${row.id}`" v-model="row.allocationMethod" :data="ALLOCATION_METHOD_OPTIONS" label-prop="name" value-prop="id" placeholder="Select" is-searchable is-clearable use-portal is-full-width />
                  </td>
                  <td class="wo-td wo-td--input"><MpInput :id="`waste-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput :id="`waste-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--del">
                    <button v-if="!(wasteRows.length === 1 && !row.accountMapping)" class="wo-del-btn" type="button" @click="removeRow(wasteRows, row.id)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row">
            <span>Estimated production waste subtotal</span>
            <span class="wo-subtotal-amount">{{ formatIDR(wasteSubtotal) }}</span>
          </div>

          <!-- Finished goods summary -->
          <div class="wo-summary">
            <div class="wo-summary-row"><span>Estimated main output subtotal</span><span>{{ formatIDR(mainOutputSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>Estimated other outputs subtotal</span><span>{{ formatIDR(otherOutputsSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>Estimated production waste subtotal</span><span>{{ formatIDR(wasteSubtotal) }}</span></div>
            <div class="wo-summary-row wo-summary-row--total"><span>Estimated finished goods total</span><span>{{ formatIDR(finishedGoodsTotal) }}</span></div>
          </div>
        </section>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goList">Cancel</MpButton>
      <MpButton variant="secondary" is-rounded @click="handleSaveDraft">Save as draft</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">Save</MpButton>
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

.wo-qty-row { display: flex; align-items: stretch; gap: var(--mp-spacing-2); }
.wo-qty-row > :first-child { flex: 1; min-width: 0; }
.wo-qty-unit {
  display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); white-space: nowrap;
}

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
.wo-file-remove:hover { color: var(--mp-text-critical); }

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
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); white-space: nowrap;
}
.wo-th:last-child { border-right: none; }
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
  /* inset separator on the sticky column's left edge — same as ErpTablePage's
     fixed actions column, so the pinned column reads consistently across the app. */
  box-shadow: inset 2px 0 var(--mp-border-default);
}
.wo-th--del { background: var(--mp-background-neutral-subtle); }
.wo-td--del { background: var(--mp-background-neutral); }
.wo-td {
  /* vertical padding kept under the 38px input-control height so read-only text
     cells don't out-tall the inputs — the inputs define the row height and fill it,
     matching the barang-masuk/new create table. */
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: middle;
}
.wo-td:last-child { border-right: none; }
.wo-tr:last-child .wo-td { border-bottom: none; }
.wo-td--num { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wo-td--right { text-align: right; }
.wo-td--input { padding: 0; vertical-align: middle; }
.wo-td--num-input { padding: 0; }
.wo-td--num-input :deep(input) { text-align: right; }
/* Cell controls are borderless within the grid; the focused cell shows a 2px inset
   ring (square) — matching the barang-masuk/new create-table active state. */
.wo-td--input :deep([class*='input']),
.wo-td--input :deep([class*='autocomplete']),
.wo-td--input :deep(.mp-datepicker__root) { border-radius: 0; border-color: transparent; }
.wo-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); z-index: 1; }
.wo-del-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
  border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
}
.wo-del-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-critical); }

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
