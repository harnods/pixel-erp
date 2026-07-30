<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpTextarea, MpButton, MpIcon, MpCheckbox,
  toast,
} from '@mekari/pixel3'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'
import { warehouses } from '~/data/warehouses'
import { productBySku, PRODUCTS } from '~/data/inventory'
import { getWarehouseDetail, getLocationStock } from '~/data/warehouseDetails'
import { addWmsAdjustment } from '~/data/wmsStockAdjustments'
import { getStorageTree, findLocation, type LocNode } from '~/data/storageLocations'
import { getWarehouseOperators } from '~/data/warehouseTeam'
import { scrollToFirstError } from '~/utils/form'

const router = useRouter()
const route = useRoute()

// ── Warehouse + assignee ────────────────────────────────────────────────────────
const realWarehouses = warehouses.filter(w => w.status === 'active' && !w.isDefault)
const warehouseOptions = computed(() => realWarehouses.map(w => ({ id: w.id, name: w.name })))
function warehouseName(id: string) { return warehouseOptions.value.find(w => w.id === id)?.name ?? '' }
const warehouseId = ref(realWarehouses[0]?.id ?? '')
const warehouseError = ref(false)
const assigneeOptions = computed(() => getWarehouseOperators(warehouseId.value))
const assigneeId = ref('')
const assigneeLabel = computed(() => assigneeOptions.value.find(a => a.id === assigneeId.value)?.name ?? '')

const memo = ref('')

// ── Warehouse stock (system on-hand) ────────────────────────────────────────────
const stock = computed(() => (warehouseId.value ? getWarehouseDetail(warehouseId.value)?.stock ?? [] : []))
const stockMap = computed(() => new Map(stock.value.map(s => [s.sku, s])))
function onHandFor(sku: string): number { return stockMap.value.get(sku)?.onHand ?? 0 }
function unitFor(sku: string): string { return stockMap.value.get(sku)?.unit ?? productBySku(sku)?.unit ?? '' }
function nameFor(sku: string): string { return stockMap.value.get(sku)?.name ?? productBySku(sku)?.name ?? sku }
function imgFor(sku: string): string | undefined { return productBySku(sku)?.img }
function descFor(sku: string): string | undefined { return productBySku(sku)?.desc }

const pickerProducts = computed<PickerProduct[]>(() =>
  PRODUCTS.map(p => ({ sku: p.sku, name: p.name, img: p.img, desc: p.desc })),
)

const hasStorageLocs = computed(() => getStorageTree(warehouseId.value).length > 0)

// ── Count by: Location / SKU ────────────────────────────────────────────────────
const countBy = ref<'location' | 'sku'>('location')
const pendingCountBy = ref<'location' | 'sku' | null>(null)

interface LocRow { sku: string; onHand: number }
interface LocEntry {
  locId: string; fullPath: string
  skuStart: number; skuQty: number
  rows: LocRow[]; productDrawerOpen: boolean
}
const selectedLocations = ref<LocEntry[]>([])
const bySkuSelected = ref<string[]>([])
const bySkuDrawerOpen = ref(false)
const locationDrawerOpen = ref(false)

// Fallback for warehouses without storage locations — a plain SKU list.
const flatSkus = ref<string[]>([])
const flatDrawerOpen = ref(false)

watch(warehouseId, () => {
  selectedLocations.value = []
  bySkuSelected.value = []
  flatSkus.value = []
  assigneeId.value = ''
  pendingCountBy.value = null
})

function hasCountData(): boolean {
  return selectedLocations.value.some(l => l.rows.length > 0) || bySkuSelected.value.length > 0
}
function requestSwitchCountBy(to: 'location' | 'sku') {
  if (to === countBy.value) return
  if (hasCountData()) { pendingCountBy.value = to; return }
  applyCountBySwitch(to)
}
function applyCountBySwitch(to: 'location' | 'sku') {
  countBy.value = to
  selectedLocations.value = []
  bySkuSelected.value = []
  pendingCountBy.value = null
}
function confirmCountBySwitch() { if (pendingCountBy.value) applyCountBySwitch(pendingCountBy.value) }
function cancelCountBySwitch() { pendingCountBy.value = null }

interface FlatLoc { id: string; name: string; level: string; depth: number; skuStart: number; skuQty: number }
function flatStorageNodes(): FlatLoc[] {
  const result: FlatLoc[] = []
  const walk = (nodes: LocNode[], depth: number) => {
    for (const n of nodes) {
      if (n.type === 'Storage' && n.children.length === 0) result.push({ id: n.id, name: n.name, level: n.level, depth, skuStart: n.skuStart, skuQty: n.skuQty })
      walk(n.children, depth + 1)
    }
  }
  walk(getStorageTree(warehouseId.value), 0)
  return result
}

function rebuildLocsBySkus(skus: string[]) {
  if (!skus.length) { selectedLocations.value = []; return }
  const wh = getWarehouseDetail(warehouseId.value)
  if (!wh) { selectedLocations.value = []; return }
  const allFlat = flatStorageNodes()
  const locMap = new Map<string, LocEntry>()
  for (const sku of skus) {
    const stockIdx = wh.stock.findIndex(s => s.sku === sku)
    const matchingNodes = stockIdx >= 0
      ? allFlat.filter(n => stockIdx >= n.skuStart && stockIdx < n.skuStart + n.skuQty)
      : []
    for (const node of matchingNodes) {
      if (!locMap.has(node.id)) {
        const fullPath = findLocation(warehouseId.value, node.id)?.path.map(n => n.name).join(' / ') ?? node.name
        locMap.set(node.id, { locId: node.id, fullPath, skuStart: node.skuStart, skuQty: node.skuQty, rows: [], productDrawerOpen: false })
      }
      const entry = locMap.get(node.id)!
      if (!entry.rows.some(r => r.sku === sku)) {
        const onHand = getLocationStock(warehouseId.value, node.skuStart, node.skuQty).find(s => s.sku === sku)?.onHand ?? 0
        entry.rows.push({ sku, onHand })
      }
    }
  }
  selectedLocations.value = [...locMap.values()]
}
function applySkuPicker(skus: string[]) {
  bySkuSelected.value = skus
  rebuildLocsBySkus(skus)
  bySkuDrawerOpen.value = false
}

// ── Select-locations drawer (tree with search + expand/collapse) ───────────────
interface TreeDrawerItem { id: string; name: string; fullPath: string; depth: number; isLeaf: boolean; isExpanded: boolean; leafIds: string[] }
const locDrawerSel = ref<Set<string>>(new Set())
const locDrawerSearch = ref('')
const locDrawerExpanded = ref<Set<string>>(new Set())
watch(locationDrawerOpen, (o) => {
  if (o) {
    locDrawerSel.value = new Set(selectedLocations.value.map(l => l.locId))
    locDrawerSearch.value = ''
    const expanded = new Set<string>()
    const walkExp = (nodes: LocNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) { expanded.add(n.id); walkExp(n.children) }
      }
    }
    walkExp(getStorageTree(warehouseId.value))
    locDrawerExpanded.value = expanded
  }
})
function collectLeafIds(nodes: LocNode[]): string[] {
  const ids: string[] = []
  const walk = (ns: LocNode[]) => ns.forEach(n => n.children.length ? walk(n.children) : ids.push(n.id))
  walk(nodes)
  return ids
}
const locDrawerItems = computed((): TreeDrawerItem[] => {
  const q = locDrawerSearch.value.trim().toLowerCase()
  const result: TreeDrawerItem[] = []
  const walk = (nodes: LocNode[], depth: number, trail: string[]) => {
    for (const n of nodes) {
      const here = [...trail, n.name]
      const isLeaf = n.children.length === 0
      const fullPath = here.join(' / ')
      if (q) {
        if (isLeaf && fullPath.toLowerCase().includes(q))
          result.push({ id: n.id, name: n.name, fullPath, depth: 0, isLeaf: true, isExpanded: false, leafIds: [n.id] })
        else if (!isLeaf) walk(n.children, 0, here)
      } else {
        const isExpanded = locDrawerExpanded.value.has(n.id)
        const leafIds = isLeaf ? [n.id] : collectLeafIds(n.children)
        result.push({ id: n.id, name: n.name, fullPath, depth, isLeaf, isExpanded, leafIds })
        if (!isLeaf && isExpanded) walk(n.children, depth + 1, here)
      }
    }
  }
  walk(getStorageTree(warehouseId.value), 0, [])
  return result
})
function toggleLocDrawerSel(id: string) {
  const s = new Set(locDrawerSel.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerSel.value = s
}
function toggleLocExpanded(id: string) {
  const s = new Set(locDrawerExpanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerExpanded.value = s
}
function toggleParentSel(leafIds: string[]) {
  const s = new Set(locDrawerSel.value)
  const allSelected = leafIds.every(id => s.has(id))
  leafIds.forEach(id => allSelected ? s.delete(id) : s.add(id))
  locDrawerSel.value = s
}
function confirmLocSelection() {
  const all = flatStorageNodes()
  const existing = new Map(selectedLocations.value.map(l => [l.locId, l]))
  selectedLocations.value = [...locDrawerSel.value]
    .map(id => {
      if (existing.has(id)) return existing.get(id)!
      const node = all.find(n => n.id === id)
      if (!node) return null
      const stockItems = getLocationStock(warehouseId.value, node.skuStart, node.skuQty)
      const rows: LocRow[] = stockItems.map(s => ({ sku: s.sku, onHand: s.onHand }))
      const fullPath = findLocation(warehouseId.value, id)?.path.map(n => n.name).join(' / ') ?? node.name
      return { locId: id, fullPath, skuStart: node.skuStart, skuQty: node.skuQty, rows, productDrawerOpen: false }
    })
    .filter(Boolean) as LocEntry[]
  locationDrawerOpen.value = false
}
function removeLoc(locId: string) { selectedLocations.value = selectedLocations.value.filter(l => l.locId !== locId) }
function removeLocRow(loc: LocEntry, sku: string) { loc.rows = loc.rows.filter(r => r.sku !== sku) }
function addProductsToLoc(loc: LocEntry, skus: string[]) {
  const existingSkus = new Set(loc.rows.map(r => r.sku))
  for (const sku of skus) {
    if (!existingSkus.has(sku)) {
      const onHand = getLocationStock(warehouseId.value, loc.skuStart, loc.skuQty).find(s => s.sku === sku)?.onHand ?? 0
      loc.rows.push({ sku, onHand })
    }
  }
  loc.productDrawerOpen = false
}
function productsForLoc(loc: LocEntry): PickerProduct[] {
  return getLocationStock(warehouseId.value, loc.skuStart, loc.skuQty).map(s => {
    const p = productBySku(s.sku)
    return { sku: s.sku, name: p?.name ?? s.sku, img: p?.img, desc: p?.desc }
  })
}

// ── Flat fallback (warehouse has no storage locations) ─────────────────────────
function applyFlatPicker(skus: string[]) { flatSkus.value = skus; flatDrawerOpen.value = false }
function removeFlatSku(sku: string) { flatSkus.value = flatSkus.value.filter(s => s !== sku) }

// ── Pre-fill from Cycle count recommendations (query: warehouse, preselect) ────
// Mirrors StockCountFormPage's own deep-link prefill — nextTick so this runs
// after the warehouseId watcher's own clear-on-change reset has settled.
onMounted(() => {
  const warehouseParam = route.query.warehouse as string | undefined
  if (warehouseParam && warehouseOptions.value.find(w => w.id === warehouseParam)) {
    warehouseId.value = warehouseParam
  }
  const preselectParam = route.query.preselect as string | undefined
  if (preselectParam) {
    const skus = preselectParam.split(',').filter(Boolean)
    nextTick(() => {
      if (hasStorageLocs.value) {
        countBy.value = 'sku'
        bySkuSelected.value = skus
        rebuildLocsBySkus(skus)
      } else {
        flatSkus.value = skus
      }
    })
  }
})

// ── Attachment ───────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])
function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) for (const f of Array.from(input.files)) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

// ── Navigation + save ──────────────────────────────────────────────────────────────
function goBack() { router.push('/cycle-counts') }
const formError = ref('')
const isSaving = ref(false)
async function handleSave() {
  formError.value = ''
  let valid = true
  if (!warehouseId.value) { warehouseError.value = true; valid = false }

  let lines: { sku: string; qty: number }[] = []
  if (hasStorageLocs.value) {
    if (!selectedLocations.value.length || !selectedLocations.value.some(l => l.rows.length)) {
      formError.value = 'You must select at least one location with products to count'
      valid = false
    }
    for (const loc of selectedLocations.value) {
      for (const r of loc.rows) lines.push({ sku: r.sku, qty: 0 })
    }
  } else {
    if (!flatSkus.value.length) { formError.value = 'You must add at least one product to count'; valid = false }
    // Counting happens later on the counting page — qty starts at 0.
    lines = flatSkus.value.map(sku => ({ sku, qty: 0 }))
  }

  if (!valid) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))

  const adj = addWmsAdjustment({
    kind: 'count',
    date: new Date().toISOString().slice(0, 10),
    warehouseId: warehouseId.value,
    warehouseName: warehouseName(warehouseId.value),
    category: 'Stock count',
    tags: [],
    memo: memo.value.trim() || undefined,
    lines,
    assignee: assigneeLabel.value || undefined,
  })
  toast.notify({ variant: 'success', title: 'Count task created', maxWidth: 'max-content' })
  router.push(`/cycle-counts/${adj.id}`)
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Cycle counts</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New count task</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <div class="nct-body">

        <!-- Header fields -->
        <div class="nct-form-grid">
          <MpFormControl id="nct-number" class="nct-f-number">
            <div class="nct-label-row">
              <MpFormLabel>Number</MpFormLabel>
              <span class="nct-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
            </div>
            <MpInput id="nct-number-input" model-value="" placeholder="[Auto]" is-full-width is-disabled />
          </MpFormControl>

          <MpFormControl id="nct-warehouse" class="nct-f-warehouse nct-f-row2" is-required :is-invalid="warehouseError">
            <MpFormLabel>Warehouse</MpFormLabel>
            <MpAutocomplete id="nct-warehouse-ac" v-model="warehouseId" :data="warehouseOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :is-invalid="warehouseError" @update:model-value="warehouseError = false" />
            <MpFormErrorMessage>You must select warehouse</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="nct-assignee" class="nct-f-assignee nct-f-row2">
            <MpFormLabel>Assignee</MpFormLabel>
            <MpAutocomplete id="nct-assignee-ac" v-model="assigneeId" :data="assigneeOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width placeholder="Select assignee" />
          </MpFormControl>
        </div>

        <!-- Count task section -->
        <template v-if="hasStorageLocs">
          <div class="scf-countby">
            <span class="scf-countby-label">Count by</span>
            <div class="scf-countby-wrap">
              <div v-if="pendingCountBy" class="scf-countby-popover">
                <p class="scf-countby-popover-text">Switching will clear all current entries.</p>
                <div class="scf-countby-popover-btns">
                  <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="cancelCountBySwitch">Cancel</button>
                  <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirmCountBySwitch">Switch</button>
                </div>
                <span class="scf-countby-popover-arrow" />
              </div>
              <div class="scf-countby-toggle">
                <button class="scf-countby-btn" :class="{ 'scf-countby-btn--active': countBy === 'location' }" type="button" @click="requestSwitchCountBy('location')">Location</button>
                <button class="scf-countby-btn" :class="{ 'scf-countby-btn--active': countBy === 'sku' }" type="button" @click="requestSwitchCountBy('sku')">SKU</button>
              </div>
            </div>
          </div>

          <template v-if="countBy === 'location'">
            <div class="scf-loc-banner">
              This warehouse uses storage locations. Select location before making adjustments
            </div>
            <div class="scf-loc-actions">
              <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="locationDrawerOpen = true">
                <MpIcon name="add" size="sm" />
                Select locations
              </button>
            </div>
          </template>

          <template v-else>
            <div class="scf-loc-banner">
              Select products to count. They'll be grouped by their storage location.
            </div>
            <div class="scf-loc-actions">
              <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="bySkuDrawerOpen = true">
                <MpIcon name="add" size="sm" />
                Select products
              </button>
            </div>
          </template>

          <div v-for="loc in selectedLocations" :key="loc.locId" class="nct-loc-card">
            <div class="nct-loc-head">
              <span class="scf-acc-label">{{ loc.fullPath }}</span>
              <span class="scf-acc-meta">SKU qty: {{ loc.rows.length }}</span>
              <button class="scf-acc-remove" type="button" aria-label="Remove location" @click="removeLoc(loc.locId)">
                <MpIcon name="minus-circular" size="sm" />
              </button>
            </div>
            <div class="scf-acc-body">
              <div class="scf-table-scroll">
                <table class="scf-table scf-table--loc">
                  <colgroup>
                    <col class="scf-col-prod" />
                    <col class="scf-col-sku" />
                    <col class="scf-col-num" />
                    <col class="scf-col-unit" />
                    <col class="scf-col-spacer" />
                    <col class="scf-col-del" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="scf-th">Product</th>
                      <th class="scf-th">SKU</th>
                      <th class="scf-th scf-th--num">On hand qty</th>
                      <th class="scf-th">Unit</th>
                      <th class="scf-th" />
                      <th class="scf-th scf-th--del" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in loc.rows" :key="row.sku" class="scf-tr">
                      <td class="scf-td scf-td--prod">
                        <span class="scf-prod">
                          <img v-if="imgFor(row.sku)" class="scf-thumb" :src="imgFor(row.sku)" :alt="nameFor(row.sku)" loading="lazy" />
                          <span v-else class="scf-thumb scf-thumb--empty" />
                          <span class="scf-prod-info">
                            <span class="scf-prod-name">{{ nameFor(row.sku) }}</span>
                            <span v-if="descFor(row.sku)" class="scf-prod-desc">{{ descFor(row.sku) }}</span>
                          </span>
                        </span>
                      </td>
                      <td class="scf-td scf-td--muted">{{ row.sku }}</td>
                      <td class="scf-td scf-td--num">{{ row.onHand.toLocaleString('id-ID') }}</td>
                      <td class="scf-td scf-td--muted">{{ unitFor(row.sku) }}</td>
                      <td class="scf-td" />
                      <td class="scf-td scf-td--del">
                        <button class="scf-del-btn" type="button" @click="removeLocRow(loc, row.sku)"><MpIcon name="minus-circular" size="sm" /></button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button class="scf-add-btn" type="button" @click="loc.productDrawerOpen = true">
                <MpIcon name="add" size="sm" /> Add product
              </button>

              <SelectProductDrawer
                v-model:open="loc.productDrawerOpen"
                :products="productsForLoc(loc)"
                :model-value="loc.rows.map(r => r.sku)"
                @save="skus => addProductsToLoc(loc, skus)"
              />
            </div>
          </div>

          <p v-if="formError" class="scf-form-error">{{ formError }}</p>
        </template>

        <!-- Fallback: warehouse has no storage locations — plain SKU list -->
        <div v-else class="nct-flat">
          <div class="scf-loc-actions">
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="flatDrawerOpen = true">
              <MpIcon name="add" size="sm" />
              Select products
            </button>
          </div>

          <div v-if="flatSkus.length" class="scf-table-scroll">
            <table class="scf-table scf-table--loc">
              <colgroup>
                <col class="scf-col-prod" />
                <col class="scf-col-sku" />
                <col class="scf-col-num" />
                <col class="scf-col-unit" />
                <col class="scf-col-spacer" />
                <col class="scf-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="scf-th">Product</th>
                  <th class="scf-th">SKU</th>
                  <th class="scf-th scf-th--num">On hand qty</th>
                  <th class="scf-th">Unit</th>
                  <th class="scf-th" />
                  <th class="scf-th scf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="sku in flatSkus" :key="sku" class="scf-tr">
                  <td class="scf-td scf-td--prod">
                    <span class="scf-prod">
                      <img v-if="imgFor(sku)" class="scf-thumb" :src="imgFor(sku)" :alt="nameFor(sku)" loading="lazy" />
                      <span v-else class="scf-thumb scf-thumb--empty" />
                      <span class="scf-prod-info">
                        <span class="scf-prod-name">{{ nameFor(sku) }}</span>
                        <span v-if="descFor(sku)" class="scf-prod-desc">{{ descFor(sku) }}</span>
                      </span>
                    </span>
                  </td>
                  <td class="scf-td scf-td--muted">{{ sku }}</td>
                  <td class="scf-td scf-td--num">{{ onHandFor(sku).toLocaleString('id-ID') }}</td>
                  <td class="scf-td scf-td--muted">{{ unitFor(sku) }}</td>
                  <td class="scf-td" />
                  <td class="scf-td scf-td--del">
                    <button class="scf-del-btn" type="button" @click="removeFlatSku(sku)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="formError" class="scf-form-error">{{ formError }}</p>
        </div>

        <!-- Memo -->
        <div class="scf-section scf-section--gap-top">
          <MpFormControl id="nct-memo">
            <MpFormLabel>Memo</MpFormLabel>
            <MpTextarea id="nct-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="scf-helper-text">Only visible to you and your team</p>
        </div>

        <!-- Attachment -->
        <div class="scf-section scf-section--last">
          <div class="scf-section-label">Attachment</div>
          <div class="scf-attachment">
            <input ref="fileInput" type="file" multiple accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" class="scf-file-hidden" @change="onFileChange" />
            <div class="scf-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">Choose file</MpButton>
              <span class="scf-attach-or">or drag and drop here</span>
            </div>
            <p class="scf-helper-text">File must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
            <ul v-if="attachedFiles.length" class="scf-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="scf-file-item">
                <span class="scf-file-name">{{ f.name }}</span>
                <button class="scf-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="close" size="xs" /></button>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <footer class="detail-footer">
      <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">Cancel</button>
      <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</button>
    </footer>

    <SelectProductDrawer v-model:open="bySkuDrawerOpen" :products="pickerProducts" :model-value="bySkuSelected" @save="applySkuPicker" />
    <SelectProductDrawer v-model:open="flatDrawerOpen" :products="pickerProducts" :model-value="flatSkus" @save="applyFlatPicker" />

    <!-- Select locations drawer -->
    <Transition name="scf-loc">
      <div v-if="locationDrawerOpen" class="loc-spd-overlay" @click.self="locationDrawerOpen = false">
        <div class="loc-spd-panel" role="dialog" aria-label="Select locations">
          <div class="loc-spd-header">
            <span class="loc-spd-title">Select locations</span>
            <button class="loc-spd-close" type="button" @click="locationDrawerOpen = false"><MpIcon name="close" size="sm" /></button>
          </div>
          <div class="loc-spd-search-wrap">
            <input v-model="locDrawerSearch" class="loc-spd-search-input" type="text" placeholder="Search..." />
            <button v-if="locDrawerSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="locDrawerSearch = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="loc-spd-list">
            <template v-for="node in locDrawerItems" :key="node.id">
              <div v-if="!node.isLeaf"
                class="loc-drawer-item loc-drawer-item--parent"
                :style="{ paddingLeft: `${16 + node.depth * 20}px` }"
              >
                <span class="loc-drawer-chevron" :class="{ 'loc-drawer-chevron--open': node.isExpanded }" @click="toggleLocExpanded(node.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <MpCheckbox
                  :is-checked="node.leafIds.every(id => locDrawerSel.has(id))"
                  :is-indeterminate="node.leafIds.some(id => locDrawerSel.has(id)) && !node.leafIds.every(id => locDrawerSel.has(id))"
                  @change="toggleParentSel(node.leafIds)"
                />
                <span class="loc-drawer-name loc-drawer-name--parent" @click="toggleLocExpanded(node.id)">{{ node.name }}</span>
              </div>
              <div v-else
                class="loc-drawer-item loc-drawer-item--leaf"
                :style="{ paddingLeft: `${16 + node.depth * 20 + 40}px` }"
              >
                <MpCheckbox
                  :is-checked="locDrawerSel.has(node.id)"
                  @change="toggleLocDrawerSel(node.id)"
                />
                <span class="loc-drawer-name" @click="toggleLocDrawerSel(node.id)">{{ locDrawerSearch.trim() ? node.fullPath : node.name }}</span>
              </div>
            </template>
            <div v-if="!locDrawerItems.length" class="loc-drawer-empty">No storage locations found</div>
          </div>
          <div class="loc-spd-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="locationDrawerOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirmLocSelection">
              Select ({{ locDrawerSel.size }})
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }

.nct-body { display: flex; flex-direction: column; }
.nct-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-4); align-items: start; }
.nct-f-number { grid-column: 1; grid-row: 1; }
.nct-f-row2 { grid-row: 2; }
.nct-f-warehouse.nct-f-row2 { grid-column: 1; }
.nct-f-assignee.nct-f-row2 { grid-column: 2; }
.nct-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.nct-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.nct-loc-card { margin-top: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.nct-loc-head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.nct-flat { margin-top: var(--mp-spacing-4); }

.scf-table-scroll { overflow-x: auto; }
.scf-table { width: 100%; table-layout: auto; border-collapse: collapse; border-spacing: 0; min-width: 900px; }
.scf-table--loc { table-layout: fixed; }
.scf-col-sku   { width: 120px; }
.scf-col-num   { width: 116px; }
.scf-col-prod { width: 26%; } .scf-col-sku { width: 12%; } .scf-col-num { width: 12%; } .scf-col-unit { width: 8%; } .scf-col-spacer { /* fills remaining width */ } .scf-col-del { width: 44px; }
.scf-table--loc .scf-th { background: var(--mp-background-neutral-subtle); }
.scf-table--loc .scf-td { background: var(--mp-background-neutral, #fff); }
.scf-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.scf-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.scf-th--del { padding: 0; }
.scf-td { padding: 8px var(--mp-spacing-4) 8px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; background: var(--mp-background-neutral-subtle); }
.scf-td--muted { color: var(--mp-text-secondary); }
.scf-td--num { text-align: right; white-space: nowrap; padding: 8px var(--mp-spacing-2) 8px var(--mp-spacing-4); }
.scf-td--prod { width: 40%; max-width: 0; }
.scf-prod { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; width: 100%; }
.scf-thumb { width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0; border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral); }
.scf-thumb--empty { background: var(--mp-background-neutral-subtle); }
.scf-prod-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.scf-prod-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-prod-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-td--del { padding: 0; text-align: center; }
.scf-del-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); }
.scf-del-btn:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-danger, #dc2626); }
.scf-add-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); background: none; border: none; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.scf-add-btn:hover { background: var(--mp-background-neutral-subtle); }
.scf-form-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

.scf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-6) 0; }
.scf-section--gap-top { padding-top: 32px; padding-bottom: 0; }
.scf-section--last { padding-top: 20px; }
.scf-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.scf-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.scf-file-hidden { display: none; }
.scf-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.scf-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.scf-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.scf-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.scf-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.scf-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.scf-file-remove:hover { color: var(--mp-text-default); }

/* Count by toggle */
.scf-countby { margin-top: var(--mp-spacing-5); display: flex; align-items: center; gap: var(--mp-spacing-3); }
.scf-countby-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.scf-countby-toggle { display: flex; align-items: center; background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full); padding: 2px; gap: 2px; }
.scf-countby-btn { height: 28px; padding: 0 var(--mp-spacing-3); border: none; border-radius: var(--mp-radii-full); background: none; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.scf-countby-btn:hover { color: var(--mp-text-default); }
.scf-countby-btn--active { background: var(--mp-background-stage, #fff); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.scf-countby-wrap { position: relative; }
.scf-countby-popover {
  position: absolute; bottom: calc(100% + 10px); left: 0; z-index: 200;
  min-width: 260px;
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
}
.scf-countby-popover-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.scf-countby-popover-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }
.scf-countby-popover-arrow {
  position: absolute; bottom: -5px; left: 18px;
  width: 8px; height: 8px;
  background: var(--mp-background-stage, #fff);
  border-right: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
  transform: rotate(45deg);
}

/* Storage location banner + actions */
.scf-loc-banner { margin-top: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.scf-loc-actions { margin-top: 12px; }

/* Accordion-style content slots (reused for the non-accordion location cards) */
.scf-acc-label { flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-acc-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap; }
.scf-acc-remove { margin-left: var(--mp-spacing-2); flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-icon-default); }
.scf-acc-remove:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
.scf-acc-body { padding: var(--mp-spacing-4); }

/* Location drawer transition */
.scf-loc-enter-active, .scf-loc-leave-active { transition: background-color 250ms ease; }
.scf-loc-enter-from, .scf-loc-leave-to { background-color: transparent; }
.scf-loc-enter-active .loc-spd-panel { transition: transform 350ms ease-out; }
.scf-loc-leave-active .loc-spd-panel { transition: transform 250ms ease-in; }
.scf-loc-enter-from .loc-spd-panel, .scf-loc-leave-to .loc-spd-panel { transform: translateX(calc(100% + 12px)); }

/* Location drawer — standalone styles (spd-* classes are scoped to SelectProductDrawer) */
.loc-spd-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.loc-spd-panel { margin: var(--mp-spacing-3); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.loc-spd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.loc-spd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.loc-spd-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.loc-spd-close:hover { background: var(--mp-background-neutral-hovered); }
.loc-spd-search-wrap { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); position: relative; }
.loc-spd-search-input { width: 100%; height: 36px; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); padding: 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; box-sizing: border-box; padding-right: 34px; }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.loc-spd-list { flex: 1; overflow-y: auto; }
.loc-spd-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

/* Location drawer items */
.loc-drawer-item { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: 8px 16px; border-bottom: 1px solid var(--mp-border-default); }
.loc-drawer-item:last-child { border-bottom: none; }
.loc-drawer-item--parent { cursor: pointer; min-height: 36px; }
.loc-drawer-item--parent:hover { background: var(--mp-background-neutral-subtle); }
.loc-drawer-item--leaf { cursor: pointer; min-height: 40px; }
.loc-drawer-item--leaf:hover { background: var(--mp-background-neutral-subtle); }
.loc-drawer-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: 1.4; }
.loc-drawer-name--parent { font-weight: var(--mp-font-weights-semi-bold); }
.loc-drawer-chevron { display: inline-flex; align-items: center; justify-content: center; width: 20px; flex-shrink: 0; color: var(--mp-icon-subtle); transition: transform 150ms ease; }
.loc-drawer-chevron--open { transform: rotate(90deg); }
.loc-drawer-empty { padding: var(--mp-spacing-8); text-align: center; color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-md); }

.btn-enterprise--icon-before { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
