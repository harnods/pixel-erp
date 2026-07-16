<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  MpAccordion, MpAccordionItem, MpAccordionHeader, MpAccordionIcon, MpAccordionPanel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpCheckbox,
  MpDatePicker,
  MpIcon,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import { getWmsAdjustment, saveWmsCountDraft, finishWmsCount } from '~/data/wmsStockAdjustments'
import { addAdjustment, adjustmentLineItems, type AdjustmentLine } from '~/data/stockAdjustments'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { PRODUCTS } from '~/data/inventory'
import { formatDateTimeLong } from '~/utils/date'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'
import { getStorageLeaves, getStorageTree, type LocNode } from '~/data/storageLocations'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const adjustment = computed(() => getWmsAdjustment(props.orderId))

const lineItems = computed(() => adjustment.value ? adjustmentLineItems(adjustment.value) : [])

// ── Warehouse stock map (for batch/serial detection) ──────────────────────────
const warehouseStockMap = computed(() => {
  const wh = getWarehouseDetail(adjustment.value?.warehouseId ?? '')
  return Object.fromEntries((wh?.stock ?? []).map(s => [s.sku, s]))
})
function isBatchTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.batches }
function isSerialTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.serials }

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Expand batch-tracked SKUs into per-batch per-location rows (mirrors details) ─
const wmsCountLines = computed((): AdjustmentLine[] => {
  const wh = getWarehouseDetail(adjustment.value?.warehouseId ?? '')
  if (!wh) return lineItems.value

  const allWhLocs = [...new Set(wh.stock.flatMap(s => [
    ...s.locations,
    ...(s.batches?.map(b => b.location) ?? []),
  ]))]

  const result: AdjustmentLine[] = []
  for (const item of lineItems.value) {
    const whItem = warehouseStockMap.value[item.sku]
    if (!whItem?.batches?.length) { result.push(item); continue }
    for (let b = 0; b < whItem.batches.length; b++) {
      const batch = whItem.batches[b]!
      const bh = hashStr(batch.batchNo + String(b))
      const shouldSplit = bh % 3 !== 0
      if (shouldSplit) {
        const otherLocs = allWhLocs.filter(l => l !== batch.location)
        const loc2 = otherLocs.length ? otherLocs[bh % otherLocs.length]! : null
        if (loc2) {
          const qty1 = Math.ceil(batch.onHand * 0.6)
          const qty2 = batch.onHand - qty1
          result.push({ key: `${item.sku}~${batch.batchNo}~a`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty1, counted: qty1, difference: 0, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          result.push({ key: `${item.sku}~${batch.batchNo}~b`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty2, counted: qty2, difference: 0, storageLocation: loc2, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          continue
        }
      }
      result.push({ key: `${item.sku}~${batch.batchNo}`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: batch.onHand, counted: batch.onHand, difference: 0, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
    }
  }
  return result
})

// ── Draft counted quantities keyed by item.key ────────────────────────────────
const draftCounted = ref<Record<string, number | undefined>>({})

watch(wmsCountLines, (lines) => {
  const map: Record<string, number | undefined> = {}
  for (const item of lines) {
    const saved = adjustment.value?.lines?.find(l => l.sku === item.sku)
    if (saved && saved.qty > 0) {
      map[item.key] = Math.round(saved.qty * item.prevOnHand / (lines.filter(l => l.sku === item.sku).reduce((s, l) => s + l.prevOnHand, 0) || 1))
    }
  }
  draftCounted.value = map
}, { immediate: true })

function onCountedInput(key: string, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  draftCounted.value = { ...draftCounted.value, [key]: n }
}

// ── Serial drawer ────────────────────────────────────────────────────────────
const serialDrawerKey = ref<string | null>(null)
const serialLinesByKey = ref<Record<string, string[]>>({})
const serialDrawerOpen = computed({
  get: () => serialDrawerKey.value !== null,
  set: (v: boolean) => { if (!v) serialDrawerKey.value = null },
})
function openSerialDrawer(key: string) {
  if (!(draftCounted.value[key] ?? 0)) {
    toast.notify({ variant: 'error', title: 'Enter counted qty first' , maxWidth: 'max-content'})
    return
  }
  serialDrawerKey.value = key
}
function openSerialDrawerForAdded(id: string, counted: number | undefined) {
  if (!(counted ?? 0)) {
    toast.notify({ variant: 'error', title: 'Enter counted qty first', maxWidth: 'max-content' })
    return
  }
  serialDrawerKey.value = id
}
const activeSerialSku = computed(() => {
  if (!serialDrawerKey.value) return ''
  return wmsCountLines.value.find(i => i.key === serialDrawerKey.value)?.sku
    ?? Object.values(addedByLoc.value).flat().find(r => r.id === serialDrawerKey.value)?.sku
    ?? ''
})
const activeSerialDelta = computed(() => {
  if (!serialDrawerKey.value) return 0
  if (draftCounted.value[serialDrawerKey.value] !== undefined) return draftCounted.value[serialDrawerKey.value] ?? 0
  return Object.values(addedByLoc.value).flat().find(r => r.id === serialDrawerKey.value)?.counted ?? 0
})
function serialCount(key: string): number { return serialLinesByKey.value[key]?.length ?? 0 }
function saveSerialLines(serials: CommittedSerial[]) {
  const key = serialDrawerKey.value
  if (!key) return
  serialLinesByKey.value = { ...serialLinesByKey.value, [key]: serials.map(s => s.serial) }
}

// ── Manually added locations ──────────────────────────────────────────────────
const addedLocations = ref<string[]>([])

// Location drawer (tree-based)
const locDrawerOpen = ref(false)
const locDrawerSearch = ref('')
const locDrawerExpanded = ref<Set<string>>(new Set())
const locDrawerSel = ref<Set<string>>(new Set())

const leafPathToId = computed(() => {
  const wh = adjustment.value?.warehouseId ?? ''
  const map = new Map<string, string>()
  for (const l of getStorageLeaves(wh)) map.set(l.path, l.id)
  return map
})
const usedLeafIds = computed(() => {
  const s = new Set<string>()
  for (const g of groupedByLocation.value) {
    const id = leafPathToId.value.get(g.location)
    if (id) s.add(id)
  }
  return s
})

interface TreeDrawerItem { id: string; name: string; fullPath: string; depth: number; isLeaf: boolean; isExpanded: boolean; leafIds: string[] }
function collectLocLeafIds(nodes: LocNode[]): string[] {
  const ids: string[] = []
  const walk = (ns: LocNode[]) => ns.forEach(n => n.children.length ? walk(n.children) : ids.push(n.id))
  walk(nodes)
  return ids
}
const locDrawerItems = computed((): TreeDrawerItem[] => {
  const q = locDrawerSearch.value.trim().toLowerCase()
  const wh = adjustment.value?.warehouseId ?? ''
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
        const leafIds = isLeaf ? [n.id] : collectLocLeafIds(n.children)
        result.push({ id: n.id, name: n.name, fullPath, depth, isLeaf, isExpanded, leafIds })
        if (!isLeaf && isExpanded) walk(n.children, depth + 1, here)
      }
    }
  }
  walk(getStorageTree(wh), 0, [])
  return result
})

function openLocDrawer() {
  locDrawerSearch.value = ''
  locDrawerSel.value = new Set()
  const expanded = new Set<string>()
  const wh = adjustment.value?.warehouseId ?? ''
  const walkExp = (nodes: LocNode[]) => {
    for (const n of nodes) { if (n.children.length) { expanded.add(n.id); walkExp(n.children) } }
  }
  walkExp(getStorageTree(wh))
  locDrawerExpanded.value = expanded
  locDrawerOpen.value = true
}
function toggleLocExpanded(id: string) {
  const s = new Set(locDrawerExpanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerExpanded.value = s
}
function toggleLocDrawerSel(id: string) {
  if (usedLeafIds.value.has(id)) return
  const s = new Set(locDrawerSel.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerSel.value = s
}
function toggleParentLocSel(leafIds: string[]) {
  const avail = leafIds.filter(id => !usedLeafIds.value.has(id))
  if (!avail.length) return
  const s = new Set(locDrawerSel.value)
  const allSel = avail.every(id => s.has(id))
  avail.forEach(id => allSel ? s.delete(id) : s.add(id))
  locDrawerSel.value = s
}
function confirmLocSelection() {
  const wh = adjustment.value?.warehouseId ?? ''
  const idToPath = new Map<string, string>()
  for (const l of getStorageLeaves(wh)) idToPath.set(l.id, l.path)
  const next = [...addedLocations.value]
  for (const id of locDrawerSel.value) {
    const path = idToPath.get(id)
    if (path && !next.includes(path)) next.push(path)
  }
  addedLocations.value = next
  locDrawerOpen.value = false
}

// ── Operator-added lines per location ─────────────────────────────────────────
interface AddedLine { id: string; sku: string; productName: string; batchNumber: string; counted: number | undefined }
let _addedId = 0
const addedByLoc = ref<Record<string, AddedLine[]>>({})

// Product picker — one shared drawer, tracks which location triggered it
const pickerOpen = ref(false)
const pickerLocation = ref<string>('')
const pickerAvailableProducts = computed<PickerProduct[]>(() => {
  const existingSkus = new Set(
    (groupedByLocation.value.find(g => g.location === pickerLocation.value)?.items ?? []).map(i => i.sku),
  )
  return PRODUCTS
    .filter(p => !existingSkus.has(p.sku))
    .map(p => ({ sku: p.sku, name: p.name, img: p.img, desc: p.desc }))
})
const pickerCurrentSkus = computed(() => (addedByLoc.value[pickerLocation.value] ?? []).map(r => r.sku))

function openPicker(location: string) {
  pickerLocation.value = location
  pickerOpen.value = true
}
function applyPicker(skus: string[]) {
  const loc = pickerLocation.value
  const existing = new Map((addedByLoc.value[loc] ?? []).map(r => [r.sku, r]))
  const next: AddedLine[] = skus.map(sku => {
    if (existing.has(sku)) return existing.get(sku)!
    const p = PRODUCTS.find(x => x.sku === sku)
    return { id: `added-${++_addedId}`, sku, productName: p?.name ?? sku, batchNumber: '', counted: undefined }
  })
  addedByLoc.value = { ...addedByLoc.value, [loc]: next }
}
function removeAddedRow(location: string, id: string) {
  addedByLoc.value = { ...addedByLoc.value, [location]: (addedByLoc.value[location] ?? []).filter(r => r.id !== id) }
}
function updateAddedField(location: string, id: string, field: 'batchNumber', value: string) {
  addedByLoc.value = { ...addedByLoc.value, [location]: (addedByLoc.value[location] ?? []).map(r => r.id === id ? { ...r, [field]: value } : r) }
}
function updateAddedQty(location: string, id: string, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  addedByLoc.value = { ...addedByLoc.value, [location]: (addedByLoc.value[location] ?? []).map(r => r.id === id ? { ...r, counted: n } : r) }
}
const addedCountedTotal = computed(() =>
  Object.values(addedByLoc.value).flat().reduce((s, r) => s + (r.counted ?? 0), 0),
)

// ── New batch modal (for added rows) ──────────────────────────────────────────
const newBatchOpen = ref(false)
const newBatchTarget = ref<{ location: string; id: string } | null>(null)
const newBatchNo = ref('')
const newBatchExpiry = ref('')
const newBatchDesc = ref('')
const isSaving = ref(false)

function openNewBatchModal(location: string, id: string) {
  newBatchTarget.value = { location, id }
  newBatchNo.value = ''
  newBatchExpiry.value = ''
  newBatchDesc.value = ''
  newBatchOpen.value = true
}
async function confirmNewBatch() {
  const nm = newBatchNo.value.trim()
  if (!nm) { toast.notify({ variant: 'error', title: 'You must fill in batch name', maxWidth: 'max-content' }); return }
  const t = newBatchTarget.value
  if (!t) return
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  addedByLoc.value = {
    ...addedByLoc.value,
    [t.location]: (addedByLoc.value[t.location] ?? []).map(r =>
      r.id === t.id ? { ...r, batchNumber: nm } : r,
    ),
  }
  isSaving.value = false
  newBatchOpen.value = false
  newBatchTarget.value = null
}

// ── View mode + search ────────────────────────────────────────────────────────
const viewMode = ref<'location' | 'sku'>('location')
const search = ref('')

// ── Group by location ─────────────────────────────────────────────────────────
const groupedByLocation = computed(() => {
  const q = search.value.trim().toLowerCase()
  const groups = new Map<string, AdjustmentLine[]>()
  for (const item of wmsCountLines.value) {
    const loc = item.storageLocation || '—'
    if (!groups.has(loc)) groups.set(loc, [])
    groups.get(loc)!.push(item)
  }
  for (const loc of addedLocations.value) {
    if (!groups.has(loc)) groups.set(loc, [])
  }
  const all = [...groups.entries()].map(([location, items]) => ({ location, items }))
  if (!q) return all
  return all
    .map(g => ({
      location: g.location,
      items: g.location.toLowerCase().includes(q)
        ? g.items
        : g.items.filter(i => i.sku.toLowerCase().includes(q) || i.product.name.toLowerCase().includes(q) || (i.batchNumber ?? '').toLowerCase().includes(q)),
    }))
    .filter(g => g.items.length > 0 || addedLocations.value.includes(g.location))
})

// ── Group by SKU (aggregated read-only summary) ───────────────────────────────
const groupedBySku = computed(() => {
  const q = search.value.trim().toLowerCase()
  const map = new Map<string, { sku: string; product: AdjustmentLine['product']; prevOnHand: number; counted: number; difference: number; unit: string; locations: string[] }>()
  for (const item of wmsCountLines.value) {
    const loc = item.storageLocation || '—'
    const counted = draftCounted.value[item.key] ?? 0
    if (map.has(item.sku)) {
      const e = map.get(item.sku)!
      e.prevOnHand += item.prevOnHand
      e.counted += counted
      e.difference = e.counted - e.prevOnHand
      if (!e.locations.includes(loc)) e.locations.push(loc)
    } else {
      map.set(item.sku, { sku: item.sku, product: item.product, prevOnHand: item.prevOnHand, counted, difference: counted - item.prevOnHand, unit: item.unit, locations: [loc] })
    }
  }
  const all = [...map.values()]
  if (!q) return all
  return all.filter(r => r.sku.toLowerCase().includes(q) || r.product.name.toLowerCase().includes(q))
})

// ── Summary stats ──────────────────────────────────────────────────────────────
const skuCount = computed(() => new Set(wmsCountLines.value.map(i => i.sku)).size)
const onHandTotal = computed(() => wmsCountLines.value.reduce((s, i) => s + i.prevOnHand, 0))
const countedTotal = computed(() => Object.values(draftCounted.value).reduce((s, v) => s + (v ?? 0), 0) + addedCountedTotal.value)
const differenceTotal = computed(() => countedTotal.value - onHandTotal.value)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('id-ID') }
function diffLabel(n: number) { return n > 0 ? `+${fmt(n)}` : n < 0 ? fmt(n) : '—' }

// ── Build save lines ──────────────────────────────────────────────────────────
function buildLines(): { sku: string; qty: number; location?: string }[] {
  const map = new Map<string, { qty: number; location?: string }>()
  for (const item of wmsCountLines.value) {
    const qty = draftCounted.value[item.key] ?? 0
    const e = map.get(item.sku)
    if (e) { e.qty += qty }
    else { map.set(item.sku, { qty, location: item.storageLocation }) }
  }
  for (const [loc, rows] of Object.entries(addedByLoc.value)) {
    for (const r of rows) {
      if (!r.sku.trim() || !r.counted) continue
      const e = map.get(r.sku)
      if (e) {
        e.qty += r.counted
      } else {
        // SKU was not in the count plan: preserve existing on-hand at uncounted
        // locations and add only the newly counted amount on top.
        const existingOnHand = warehouseStockMap.value[r.sku]?.onHand ?? 0
        map.set(r.sku, { qty: existingOnHand + r.counted, location: loc })
      }
    }
  }
  return [...map.entries()].map(([sku, { qty, location }]) => ({ sku, qty, location }))
}

// ── Footer: Save draft ────────────────────────────────────────────────────────
function saveDraft() {
  saveWmsCountDraft(props.orderId, buildLines())
  toast.notify({ variant: 'success', title: 'Draft saved' , maxWidth: 'max-content'})
  router.push(`/stock-adjustments/${props.orderId}`)
}

// ── Footer: Finish counting ───────────────────────────────────────────────────
const showConfirm = ref(false)
const showQtyErrors = ref(false)

function clickFinish() {
  if (countedTotal.value === 0) {
    showQtyErrors.value = true
    toast.notify({ variant: 'error', title: 'You must fill in counted qty for at least one item' , maxWidth: 'max-content'})
    return
  }
  // Validate serial counts match qty
  for (const item of wmsCountLines.value) {
    if (!isSerialTrackedSku(item.sku)) continue
    const expected = draftCounted.value[item.key] ?? 0
    const actual = serialCount(item.key)
    if (expected > 0 && actual !== expected) {
      toast.notify({
        variant: 'error',
        title: `You must fill in all serial numbers for ${item.product.name} (${actual}/${expected})`,
        maxWidth: 'max-content',
      })
      return
    }
  }
  showConfirm.value = true
}

function commitFinish() {
  showConfirm.value = false
  const lines = buildLines()

  // Snapshot prevOnHand per SKU BEFORE finishWmsCount updates warehouse stock
  const prevBySkuMap = new Map<string, number>()
  for (const item of wmsCountLines.value) {
    prevBySkuMap.set(item.sku, (prevBySkuMap.get(item.sku) ?? 0) + item.prevOnHand)
  }
  // Added SKUs not in wmsCountLines: look up their actual warehouse on-hand
  for (const rows of Object.values(addedByLoc.value)) {
    for (const r of rows) {
      if (r.sku && !prevBySkuMap.has(r.sku)) {
        const stock = warehouseStockMap.value[r.sku]
        if (stock) prevBySkuMap.set(r.sku, stock.onHand)
      }
    }
  }

  const wmsAdj = finishWmsCount(props.orderId, lines)
  if (wmsAdj) {
    addAdjustment({
      kind: 'count',
      date: new Date().toISOString().slice(0, 10),
      warehouseId: wmsAdj.warehouseId,
      warehouseName: wmsAdj.warehouseName,
      category: 'Stock count',
      tags: [],
      lines: lines.map(l => ({ ...l, prevQty: prevBySkuMap.get(l.sku) ?? 0 })),
      linkedCycleCountId: wmsAdj.id,
    })
  }
  toast.notify({ variant: 'success', title: 'Cycle count completed', maxWidth: 'max-content' })
  router.push('/cycle-counts')
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() { router.push(`/stock-adjustments/${props.orderId}`) }
function goList() { router.push('/cycle-counts') }

// ── Footer overflow ───────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkOverflow() {
  if (stageEl.value) stageOverflowing.value = stageEl.value.scrollHeight > stageEl.value.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkOverflow()
    stageObserver = new ResizeObserver(checkOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkOverflow, { passive: true })
    }
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkOverflow)
})
</script>

<template>
  <div v-if="adjustment" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goList">Cycle counts</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ adjustment.number }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Stock counting</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Task header -->
      <div class="sc-header">
        <ContentList label="Transaction no." :value="adjustment.number" />
        <ContentList label="Warehouse" :value="adjustment.warehouseName" />
        <ContentList label="Assignee" :value="adjustment.assignee || '—'" />
        <ContentList v-if="adjustment.startDate" label="Start date" :value="formatDateTimeLong(adjustment.startDate)" />
        <ContentList v-if="adjustment.startDate" label="End date" :value="adjustment.status === 'completed' && adjustment.endDate ? formatDateTimeLong(adjustment.endDate) : '—'" />
      </div>

      <!-- Search bar -->
      <div class="sc-filter-bar">
        <div class="sc-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="sc-search" type="text" placeholder="Search..." />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- By location: accordion -->
      <div v-if="!groupedByLocation.length" class="sc-empty">
        <p>No items match your search.</p>
      </div>
      <MpAccordion v-else is-allow-multiple is-allow-toggle class="sc-accordions">
          <MpAccordionItem
            v-for="group in groupedByLocation"
            :key="group.location"
            :id="`sco-acc-${group.location}`"
            is-default-open
            icon-position="start"
          >
            <MpAccordionHeader>
              <MpAccordionIcon />
              <span class="sc-acc-label">{{ group.location === '—' ? 'No location assigned' : group.location }}</span>
              <span class="sc-acc-meta">{{ new Set(group.items.map(i => i.sku)).size }} SKU{{ new Set(group.items.map(i => i.sku)).size !== 1 ? 's' : '' }}</span>
            </MpAccordionHeader>
            <MpAccordionPanel>
              <div class="sc-acc-body">
                <div class="sc-loc-scroll" :class="{ 'sc-loc-scroll--split': group.items.some(i => isSerialTrackedSku(i.sku)) }">
                  <table class="sc-items sc-items--fixed">
                    <colgroup>
                      <col class="sc-col-product" />
                      <col class="sc-col-sku" />
                      <col class="sc-col-batch" />
                      <col class="sc-col-num" />
                      <col class="sc-col-unit" />
                      <col class="sc-col-del" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th class="sc-th">Product</th>
                        <th class="sc-th">SKU</th>
                        <th class="sc-th">Batch no.</th>
                        <th class="sc-th sc-th--num">Counted qty</th>
                        <th class="sc-th">Unit</th>
                        <th class="sc-th" />
                      </tr>
                    </thead>
                    <tbody>
                      <!-- System lines from count plan -->
                      <tr
                        v-for="item in group.items"
                        :key="item.key"
                        class="sc-row"
                        :class="{ 'sc-row--serial': isSerialTrackedSku(item.sku) }"
                      >
                        <td class="sc-td sc-td--product"><ProductCell :name="item.product.name" :desc="item.product.desc" :image="item.product.img" /></td>
                        <td class="sc-td">{{ item.sku }}</td>
                        <td class="sc-td">{{ item.batchNumber ?? '—' }}</td>

                        <!-- Counted qty: serial-tracked → split cell (input + drawer link) -->
                        <td v-if="isSerialTrackedSku(item.sku)" class="sc-td sc-td--split" :class="{ 'sc-td--error': showQtyErrors && !(draftCounted[item.key] ?? 0) }">
                          <div class="sc-split-row sc-split-row--top">
                            <input
                              class="sc-qty-input"
                              type="number" min="0"
                              :value="draftCounted[item.key] ?? ''"
                              :aria-label="`Counted qty for ${item.product.name}`"
                              @input="onCountedInput(item.key, $event); showQtyErrors = false"
                            />
                          </div>
                          <div class="sc-split-row sc-split-row--action">
                            <button class="sc-link" type="button" @click="openSerialDrawer(item.key)">
                              Enter serial numbers
                              <span v-if="serialCount(item.key)" class="sc-serial-count">({{ serialCount(item.key) }})</span>
                            </button>
                          </div>
                        </td>

                        <!-- Counted qty: batch or regular → plain input -->
                        <td
                          v-else
                          class="sc-td sc-td--input"
                          :class="{ 'sc-td--error': showQtyErrors && !(draftCounted[item.key] ?? 0) }"
                        >
                          <input
                            class="sc-qty-input"
                            type="number" min="0"
                            :value="draftCounted[item.key] ?? ''"
                            :aria-label="`Counted qty for ${item.product.name}`"
                            @input="onCountedInput(item.key, $event); showQtyErrors = false"
                          />
                        </td>

                        <td class="sc-td">{{ item.unit }}</td>
                        <td class="sc-td sc-td--del-placeholder" aria-hidden="true" />
                      </tr>

                      <!-- Operator-added lines (from product picker) -->
                      <tr
                        v-for="added in (addedByLoc[group.location] ?? [])"
                        :key="added.id"
                        class="sc-row"
                      >
                        <td class="sc-td sc-td--product">
                          <ProductCell :name="added.productName" :desc="PRODUCTS.find(p => p.sku === added.sku)?.desc ?? ''" :image="PRODUCTS.find(p => p.sku === added.sku)?.img ?? ''" />
                        </td>
                        <td class="sc-td">{{ added.sku }}</td>
                        <!-- Batch no.: popover picker for batch-tracked, plain dash otherwise -->
                        <td v-if="isBatchTrackedSku(added.sku)" class="sc-td sc-td--input">
                          <MpPopover
                            :id="`sc-batch-pick-${added.id}`"
                            is-close-on-select
                            use-portal
                            :is-keep-alive="false"
                            placement="bottom-start"
                          >
                            <MpPopoverTrigger>
                              <button class="sc-batch-trigger" type="button">
                                <span class="sc-batch-trigger-label">{{ added.batchNumber || 'Select batch' }}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="sc-batch-trigger-chevron">
                                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                              </button>
                            </MpPopoverTrigger>
                            <MpPopoverContent>
                              <MpPopoverList>
                                <MpPopoverListItem
                                  v-for="b in (warehouseStockMap[added.sku]?.batches ?? [])"
                                  :key="b.batchNo"
                                  @click="updateAddedField(group.location, added.id, 'batchNumber', b.batchNo)"
                                >
                                  {{ b.batchNo }}
                                  <span v-if="b.expiryDate" style="color:var(--mp-text-subtle);font-size:var(--mp-font-sizes-sm)"> · exp {{ b.expiryDate }}</span>
                                </MpPopoverListItem>
                                <MpPopoverListItem @click="openNewBatchModal(group.location, added.id)">
                                  + Add new batch
                                </MpPopoverListItem>
                              </MpPopoverList>
                            </MpPopoverContent>
                          </MpPopover>
                        </td>
                        <td v-else class="sc-td">—</td>
                        <td v-if="isSerialTrackedSku(added.sku)" class="sc-td sc-td--split">
                          <div class="sc-split-row sc-split-row--top">
                            <input
                              class="sc-qty-input"
                              type="number" min="0"
                              :value="added.counted ?? ''"
                              aria-label="Counted qty for added product"
                              @input="updateAddedQty(group.location, added.id, $event)"
                            />
                          </div>
                          <div class="sc-split-row sc-split-row--action">
                            <button class="sc-link" type="button" @click="openSerialDrawerForAdded(added.id, added.counted)">
                              Enter serial numbers
                              <span v-if="serialCount(added.id)" class="sc-serial-count">({{ serialCount(added.id) }})</span>
                            </button>
                          </div>
                        </td>
                        <td v-else class="sc-td sc-td--input">
                          <input
                            class="sc-qty-input"
                            type="number" min="0"
                            :value="added.counted ?? ''"
                            aria-label="Counted qty for added product"
                            @input="updateAddedQty(group.location, added.id, $event)"
                          />
                        </td>
                        <td class="sc-td">{{ PRODUCTS.find(p => p.sku === added.sku)?.unit ?? '—' }}</td>
                        <td class="sc-td sc-td--del">
                          <button class="sc-del-row-btn" type="button" aria-label="Remove product" @click="removeAddedRow(group.location, added.id)">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
                              <path d="M5 8H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                          </button>
                        </td>
                      </tr>

                      <!-- Add product trigger row -->
                      <tr class="sc-row-add-trigger">
                        <td colspan="6" class="sc-td-add-trigger">
                          <button class="sc-add-sku-btn" type="button" @click="openPicker(group.location)">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                              <path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                            Add product
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </MpAccordionPanel>
          </MpAccordionItem>
        </MpAccordion>

      <!-- Add location button -->
      <div class="sc-add-loc-row">
        <button class="sc-add-loc-btn" type="button" @click="openLocDrawer">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Add location
        </button>
      </div>

    </div>

    <!-- ── Footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="sc-btn sc-btn--ghost" @click="goBack">Cancel</button>
      <button class="sc-btn sc-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="sc-btn sc-btn--primary" @click="clickFinish">Finish counting</button>
    </footer>

  </div>

  <!-- Not found -->
  <div v-else class="sc-not-found">
    <p>Stock count not found.</p>
    <button class="detail-breadcrumb" @click="goList">Back to Cycle counts</button>
  </div>

  <!-- ── Finish counting confirmation ── -->
  <MpModal
    id="sco-confirm"
    :is-open="showConfirm"
    size="md"
    is-close-on-esc
    :is-keep-alive="false"
    @close="showConfirm = false"
  >
    <MpModalContent>
      <MpModalHeader>Finish counting?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="sc-confirm-text">
          Counted <strong>{{ fmt(countedTotal) }}</strong> units across <strong>{{ fmt(skuCount) }}</strong> SKUs. This will post the count and update stock on hand.
        </p>
      </MpModalBody>
      <MpModalFooter>
        <div class="sc-modal-footer">
          <button class="sc-btn sc-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="sc-btn sc-btn--primary" @click="commitFinish">Finish counting</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── New batch modal ── -->
  <MpModal
    id="sc-new-batch-modal"
    :is-open="newBatchOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="newBatchOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>
        Add new batch
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="sc-new-batch-form">
          <div class="sc-new-batch-field">
            <label class="sc-new-batch-label">Batch name <span class="sc-required">*</span></label>
            <input v-model="newBatchNo" class="sc-new-batch-input" type="text" />
          </div>
          <div class="sc-new-batch-field">
            <label class="sc-new-batch-label">Expiry date</label>
            <div class="sc-new-batch-datepicker">
              <MpDatePicker id="sc-new-batch-expiry" v-model="newBatchExpiry" format="DD/MM/YYYY" value-type="format" use-portal />
            </div>
          </div>
          <div class="sc-new-batch-field">
            <label class="sc-new-batch-label">Description</label>
            <textarea v-model="newBatchDesc" class="sc-new-batch-textarea" rows="2" maxlength="256" />
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="sc-modal-footer">
          <button class="sc-btn sc-btn--ghost" @click="newBatchOpen = false">Cancel</button>
          <button class="sc-btn sc-btn--primary" :disabled="isSaving" @click="confirmNewBatch">{{ isSaving ? 'Saving…' : 'Save' }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Product picker drawer ── -->
  <SelectProductDrawer
    v-model:open="pickerOpen"
    :products="pickerAvailableProducts"
    :model-value="pickerCurrentSkus"
    @save="applyPicker"
  />

  <!-- ── Add location drawer ── -->
  <Transition name="sc-loc-drw">
    <div v-if="locDrawerOpen" class="loc-drw-overlay" @click.self="locDrawerOpen = false">
      <div class="loc-drw-panel" role="dialog" aria-label="Add location">
        <div class="loc-drw-header">
          <span class="loc-drw-title">Add location</span>
          <button class="loc-drw-close" type="button" @click="locDrawerOpen = false">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
        <div class="loc-drw-search-wrap">
          <input v-model="locDrawerSearch" class="loc-drw-search-input" type="text" placeholder="Search location..." />
          <button v-if="locDrawerSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="locDrawerSearch = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="loc-drw-list">
          <template v-for="node in locDrawerItems" :key="node.id">
            <!-- Parent node -->
            <div
              v-if="!node.isLeaf"
              class="loc-drw-item loc-drw-item--parent"
              :style="{ paddingLeft: `${16 + node.depth * 20}px` }"
            >
              <span
                class="loc-drw-chevron"
                :class="{ 'loc-drw-chevron--open': node.isExpanded }"
                @click="toggleLocExpanded(node.id)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <MpCheckbox
                :is-checked="node.leafIds.filter(id => !usedLeafIds.has(id)).length > 0 && node.leafIds.filter(id => !usedLeafIds.has(id)).every(id => locDrawerSel.has(id))"
                :is-indeterminate="node.leafIds.filter(id => !usedLeafIds.has(id)).some(id => locDrawerSel.has(id)) && !node.leafIds.filter(id => !usedLeafIds.has(id)).every(id => locDrawerSel.has(id))"
                :is-disabled="node.leafIds.every(id => usedLeafIds.has(id))"
                @change="toggleParentLocSel(node.leafIds)"
                @click.stop
              />
              <span class="loc-drw-name loc-drw-name--parent" @click="toggleLocExpanded(node.id)">{{ node.name }}</span>
            </div>
            <!-- Leaf node -->
            <div
              v-else
              class="loc-drw-item loc-drw-item--leaf"
              :class="{ 'loc-drw-item--used': usedLeafIds.has(node.id) }"
              :style="{ paddingLeft: `${16 + node.depth * 20 + 40}px` }"
            >
              <MpCheckbox
                :is-checked="usedLeafIds.has(node.id) || locDrawerSel.has(node.id)"
                :is-disabled="usedLeafIds.has(node.id)"
                @change="toggleLocDrawerSel(node.id)"
              />
              <span
                class="loc-drw-name"
                :class="{ 'loc-drw-name--used': usedLeafIds.has(node.id) }"
                @click="toggleLocDrawerSel(node.id)"
              >
                {{ locDrawerSearch.trim() ? node.fullPath : node.name }}
              </span>
            </div>
          </template>
          <div v-if="!locDrawerItems.length" class="loc-drw-empty">No storage locations found</div>
        </div>
        <div class="loc-drw-footer">
          <button class="sc-btn sc-btn--ghost" type="button" @click="locDrawerOpen = false">Cancel</button>
          <button class="sc-btn sc-btn--primary" type="button" :disabled="!locDrawerSel.size" @click="confirmLocSelection">
            Add{{ locDrawerSel.size ? ` (${locDrawerSel.size})` : '' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ── Serial drawer ── -->
  <ManageSerialDrawer
    v-if="serialDrawerKey && adjustment"
    :open="serialDrawerOpen"
    :sku="activeSerialSku"
    :warehouse-id="adjustment.warehouseId"
    kind="count"
    :delta="activeSerialDelta"
    :target-count="activeSerialDelta"
    :location-on-hand="0"
    :model-value="(serialLinesByKey[serialDrawerKey] ?? []).map(s => ({ serial: s }))"
    @update:open="serialDrawerOpen = $event"
    @save="saveSerialLines"
  />
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
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
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Task header ─────────────────────────────────────────────────────────────── */
.sc-header {
  display: flex; flex-wrap: wrap; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}
.sc-header :deep(.content-list) { flex: 0 0 318px; width: 318px; }
.sc-header :deep(.content-list__value) { white-space: normal; overflow-wrap: break-word; word-break: break-word; }

/* ── Summary stats ───────────────────────────────────────────────────────────── */
.sc-summary {
  display: flex; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}
.sc-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.sc-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.sc-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-lg); font-variant-numeric: tabular-nums; }
.sc-stat-val--pos { color: var(--mp-text-success, #1a7a4a); }
.sc-stat-val--neg { color: var(--mp-text-danger, #a8352d); }

/* ── Filter bar ──────────────────────────────────────────────────────────────── */
.sc-filter-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-6);
}
.sc-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.sc-view-toggle { display: flex; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); overflow: hidden; }
.sc-view-btn {
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  background: none; border: none; cursor: pointer; color: var(--mp-text-secondary);
}
.sc-view-btn--active { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
.sc-view-btn:hover:not(.sc-view-btn--active) { background: var(--mp-background-neutral-subtle); }
.sc-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sc-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 260px;
}
.sc-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.sc-search::placeholder { color: var(--mp-text-placeholder); }

/* ── Accordions ──────────────────────────────────────────────────────────────── */
.sc-accordions { padding: var(--mp-spacing-4) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.sc-accordions :deep(*:not(td):not(th)) { border-top: none !important; border-bottom: none !important; }
.sc-accordions :deep(.sc-split-row--top) { border-bottom: 1px solid var(--mp-border-default) !important; }
.sc-acc-label { flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-acc-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap; }
.sc-acc-body { padding: var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-4) 0; }

/* ── Table ───────────────────────────────────────────────────────────────────── */
.sc-loc-scroll { overflow-x: auto; }
.sc-loc-scroll--split .sc-row--serial .sc-td { vertical-align: top; }
.sc-loc-scroll--split .sc-td { border-left: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); }
.sc-loc-scroll--split .sc-td:first-child { border-left: none; }
.sc-loc-scroll--split .sc-td:last-child { border-right: none; }

.sc-items { width: 100%; border-collapse: collapse; }
.sc-items--fixed { table-layout: fixed; width: 100%; }

.sc-col-product { width: 210px; }
.sc-col-sku     { width: 90px; }
.sc-col-batch   { width: 120px; }
.sc-col-num     { width: 110px; }
.sc-col-unit    { width: 90px; }
.sc-col-del     { width: 40px; }

.sc-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-align: left; text-transform: uppercase; white-space: nowrap;
  border-bottom: 1px solid var(--mp-border-default);
}
.sc-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.sc-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
  vertical-align: top;
}
.sc-td--product { background: var(--mp-background-neutral-subtle); }
.sc-td--num { text-align: right; font-variant-numeric: tabular-nums; background: var(--mp-background-neutral-subtle); }

/* Input cells — white bg, no own border, inset focus shadow */
.sc-td--input {
  padding: 0;
  background: var(--mp-background-neutral, #fff);
}
.sc-td--input:focus-within {
  box-shadow: inset 0 0 0 1px var(--mp-border-bold);
}
.sc-td--input.sc-td--error { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #a8352d); }

/* Serial split cell */
.sc-td--split {
  padding: 0;
  background: var(--mp-background-neutral, #fff);
}
.sc-td--split:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.sc-td--split.sc-td--error { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #a8352d); }
.sc-split-row { display: flex; align-items: center; padding: 0 var(--mp-spacing-2); }
.sc-split-row--top { min-height: 40px; border-bottom: 1px solid var(--mp-border-default); justify-content: flex-end; }
.sc-split-row--action { min-height: 32px; }

.sc-qty-input {
  width: 100%; min-width: 0; height: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-2);
  border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right;
  font-variant-numeric: tabular-nums;
}
.sc-qty-input::-webkit-outer-spin-button,
.sc-qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.sc-qty-input[type=number] { -moz-appearance: textfield; }

.sc-link {
  background: none; border: none; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; line-height: 1;
}
.sc-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.sc-serial-count { color: var(--mp-text-secondary); }

.sc-diff--pos { color: var(--mp-text-success, #1a7a4a); }
.sc-diff--neg { color: var(--mp-text-danger, #a8352d); }

/* Delete button on added rows */
.sc-td--del-placeholder { background: var(--mp-background-neutral-subtle); }
.sc-td--del { padding: 0; text-align: center; vertical-align: middle; background: var(--mp-background-neutral-subtle); }
.sc-del-row-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm);
  cursor: pointer; color: var(--mp-text-secondary);
}
.sc-del-row-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Add product trigger row */
.sc-row-add-trigger td { border-bottom: none; }
.sc-td-add-trigger { padding: var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral, #fff); }
.sc-add-sku-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  background: none; border: none; padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm); cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
}
.sc-add-sku-btn:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Batch picker trigger */
.sc-batch-trigger {
  width: 100%; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2);
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.sc-batch-trigger:hover { background: var(--mp-background-neutral-hovered); }
.sc-batch-trigger-label { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-batch-trigger-chevron { flex-shrink: 0; color: var(--mp-icon-default); }

/* Add location button */
.sc-add-loc-row { padding: 0 var(--mp-spacing-6) var(--mp-spacing-4); }
.sc-add-loc-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  background: none; border: none; padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm); cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link);
}
.sc-add-loc-btn:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Location drawer */
.loc-drw-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.loc-drw-panel { margin: var(--mp-spacing-3); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.loc-drw-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.loc-drw-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.loc-drw-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.loc-drw-close:hover { background: var(--mp-background-neutral-hovered); }
.loc-drw-search-wrap { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); position: relative; }
.loc-drw-search-input { width: 100%; height: 36px; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); padding: 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; box-sizing: border-box; padding-right: 34px; }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.loc-drw-list { flex: 1; overflow-y: auto; }
.loc-drw-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.loc-drw-item { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: 8px 16px; border-bottom: 1px solid var(--mp-border-default); }
.loc-drw-item:last-child { border-bottom: none; }
.loc-drw-item--parent { cursor: pointer; min-height: 36px; }
.loc-drw-item--parent:hover { background: var(--mp-background-neutral-subtle); }
.loc-drw-item--leaf { cursor: pointer; min-height: 40px; }
.loc-drw-item--leaf:hover:not(.loc-drw-item--used) { background: var(--mp-background-neutral-subtle); }
.loc-drw-item--used { cursor: default; opacity: 0.55; }
.loc-drw-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: 1.4; }
.loc-drw-name--parent { font-weight: var(--mp-font-weights-semi-bold); }
.loc-drw-chevron { display: inline-flex; align-items: center; justify-content: center; width: 20px; flex-shrink: 0; color: var(--mp-icon-subtle); transition: transform 150ms ease; }
.loc-drw-chevron--open { transform: rotate(90deg); }
.loc-drw-empty { padding: var(--mp-spacing-8); text-align: center; color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-md); }

/* Drawer enter/leave transition */
.sc-loc-drw-enter-active,
.sc-loc-drw-leave-active { transition: background-color 250ms ease; }
.sc-loc-drw-enter-from,
.sc-loc-drw-leave-to { background-color: transparent; }
.sc-loc-drw-enter-active .loc-drw-panel { transition: transform 350ms ease-out; }
.sc-loc-drw-leave-active .loc-drw-panel { transition: transform 250ms ease-in; }
.sc-loc-drw-enter-from .loc-drw-panel,
.sc-loc-drw-leave-to .loc-drw-panel { transform: translateX(calc(100% + 12px)); }

/* New batch modal form */
.sc-new-batch-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.sc-new-batch-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sc-new-batch-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sc-required { color: var(--mp-text-danger, #a8352d); }
.sc-new-batch-input {
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); background: var(--mp-background-neutral); outline: none;
}
.sc-new-batch-input:focus { border-color: var(--mp-border-focused, #0f6d4d); box-shadow: 0 0 0 2px var(--mp-shadow-focused, rgba(15,109,77,0.2)); }
.sc-new-batch-textarea {
  padding: var(--mp-spacing-2) var(--mp-spacing-3); resize: vertical;
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); background: var(--mp-background-neutral);
  font-family: inherit; line-height: 1.5; outline: none;
}
.sc-new-batch-textarea:focus { border-color: var(--mp-border-focused, #0f6d4d); box-shadow: 0 0 0 2px var(--mp-shadow-focused, rgba(15,109,77,0.2)); }
.sc-new-batch-datepicker { width: 100%; }
.sc-new-batch-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* By SKU section */
.sc-sku-section { padding: var(--mp-spacing-4) var(--mp-spacing-6); }
.sc-loc-tags { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.sc-loc-tag {
  padding: 2px var(--mp-spacing-2); background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); white-space: nowrap;
}
.sc-items-count { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Empty + not found */
.sc-empty { padding: var(--mp-spacing-8) var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.sc-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); height: 100%; color: var(--mp-text-secondary); }

/* ── Buttons ─────────────────────────────────────────────────────────────────── */
.sc-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.sc-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-default); }
.sc-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.sc-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.sc-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.sc-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.sc-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

/* Confirm modal */
.sc-confirm-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-lg); }
.sc-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
