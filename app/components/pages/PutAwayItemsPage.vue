<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { formatDateTimeLong } from '~/utils/date'
import {
  MpSpinner,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { getPutAwayTask, savePutAwayDraft, endPutAway as endPutAwayTask } from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'
import { stockLocationPaths } from '~/data/storageLocations'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task            = computed(() => getPutAwayTask(props.orderId))
const lineItems       = computed(() => task.value ? getPutAwayLineItems(props.orderId) : [])
const locationOptions = computed(() => task.value ? stockLocationPaths(task.value.warehouseId) : [])

// ── Draft rows — one per displayed table line (can be split into multiple) ────
interface DraftRow {
  id: string
  skuCode: string
  qty: number
  binLocation: string
}

let rowCounter = 0
function newRowId() { return `row-${++rowCounter}` }

const draftRows = ref<DraftRow[]>([])
const search    = ref('')

watch([() => props.orderId, lineItems], () => {
  rowCounter = 0
  // Deduplicate by skuCode — one row per SKU, merging qty from multiple receiving tasks
  const seen = new Map<string, string>()
  lineItems.value.forEach(it => { if (!seen.has(it.skuCode)) seen.set(it.skuCode, it.binLocation) })
  draftRows.value = [...seen.entries()].map(([skuCode, binLocation]) => ({
    id: newRowId(), skuCode, qty: 0, binLocation,
  }))
  search.value = ''
}, { immediate: true })

// Lookup map: skuCode → line item (for product info)
const itemBySkuCode = computed(() => new Map(lineItems.value.map(it => [it.skuCode, it])))

// Summed received qty per SKU across all receiving tasks
const totalQtyBySkuCode = computed(() => {
  const map = new Map<string, number>()
  lineItems.value.forEach(it => { map.set(it.skuCode, (map.get(it.skuCode) ?? 0) + it.qty) })
  return map
})

// ── Summary ───────────────────────────────────────────────────────────────────
const skuQty           = computed(() => new Set(lineItems.value.map(it => it.skuCode)).size)
const receivedQty      = computed(() => lineItems.value.reduce((s, it) => s + it.qty, 0))
const draftHandled     = computed(() => draftRows.value.reduce((s, r) => s + (r.qty || 0), 0))
const draftOutstanding = computed(() => Math.max(0, receivedQty.value - draftHandled.value))

// ── Filter ────────────────────────────────────────────────────────────────────
const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return draftRows.value
  return draftRows.value.filter(r => {
    const it = itemBySkuCode.value.get(r.skuCode)
    return it?.productName.toLowerCase().includes(q)
      || r.skuCode.toLowerCase().includes(q)
      || r.binLocation.toLowerCase().includes(q)
  })
})

// ── Progressive pagination ────────────────────────────────────────────────────
const PAGE_SIZE     = 10
const shownCount    = ref(PAGE_SIZE)
const loadingMore   = ref(false)
const pagedRows     = computed(() => filteredRows.value.slice(0, shownCount.value))
const hasMoreItems  = computed(() => shownCount.value < filteredRows.value.length)
const isProgressive = computed(() => filteredRows.value.length > PAGE_SIZE)

// Group consecutive rows by skuCode for rowspan merging
type RowWithMeta = DraftRow & { groupSize: number; groupIndex: number }
const rowsWithMeta = computed<RowWithMeta[]>(() => {
  const rows = pagedRows.value
  const result: RowWithMeta[] = []
  let i = 0
  while (i < rows.length) {
    const skuCode = rows[i]!.skuCode
    let j = i
    while (j < rows.length && rows[j]!.skuCode === skuCode) j++
    const groupSize = j - i
    for (let k = i; k < j; k++) {
      result.push({ ...rows[k]!, groupSize, groupIndex: k - i })
    }
    i = j
  }
  return result
})

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredRows.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl   = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null

function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    entries => { if (entries[0]?.isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}

watch(search, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

// ── Qty to handle input ───────────────────────────────────────────────────────
function onQtyInput(rowId: string, max: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > max) n = max
  draftRows.value = draftRows.value.map(r => r.id === rowId ? { ...r, qty: n } : r)
}

// ── Split line ────────────────────────────────────────────────────────────────
function splitRow(rowId: string) {
  const idx = draftRows.value.findIndex(r => r.id === rowId)
  if (idx === -1) return
  const row = draftRows.value[idx]!
  const totalQty = totalQtyBySkuCode.value.get(row.skuCode) ?? 0
  const totalAssigned = draftRows.value
    .filter(r => r.skuCode === row.skuCode)
    .reduce((s, r) => s + (r.qty || 0), 0)
  const remainder = Math.max(0, totalQty - totalAssigned)
  const newRow: DraftRow = { id: newRowId(), skuCode: row.skuCode, qty: remainder, binLocation: row.binLocation }
  const next = [...draftRows.value]
  next.splice(idx + 1, 0, newRow)
  draftRows.value = next
}

// ── Storage location picker ───────────────────────────────────────────────────
const activeLocRowId = ref<string | null>(null)
const locSearch      = ref('')

function openLocPicker(rowId: string)  { activeLocRowId.value = rowId; locSearch.value = '' }
function closeLocPicker(rowId: string) { if (activeLocRowId.value === rowId) { activeLocRowId.value = null; locSearch.value = '' } }
function locOptionsFiltered(rowId: string) {
  const q = activeLocRowId.value === rowId ? locSearch.value.trim().toLowerCase() : ''
  if (!q) return locationOptions.value
  return locationOptions.value.filter(loc => loc.toLowerCase().includes(q))
}

function updateLocation(rowId: string, loc: string) {
  draftRows.value = draftRows.value.map(r => r.id === rowId ? { ...r, binLocation: loc } : r)
}

function fmt(n: number) { return n.toLocaleString('id-ID') }

function postPutAway() {
  if (draftOutstanding.value > 0) {
    toast.notify({ variant: 'danger', title: `${fmt(draftOutstanding.value)} units still need to be put away` })
    return
  }
  const items = draftRows.value.map(r => ({
    skuCode: r.skuCode,
    qty: r.qty,
    binLocation: r.binLocation,
  }))
  endPutAwayTask(props.orderId, items)
  toast.notify({ variant: 'success', title: 'Put-away finished' })
  router.push(`/put-away/${props.orderId}`)
}

function saveDraft() {
  const items = draftRows.value.map(r => ({
    skuCode: r.skuCode,
    qty: r.qty,
    binLocation: r.binLocation,
  }))
  savePutAwayDraft(props.orderId, items)
  toast.notify({ variant: 'success', title: 'Put-away draft saved' })
  router.push(`/put-away/${props.orderId}`)
}

function goBack()    { router.push(`/put-away/${props.orderId}`) }
function goPutAway() { router.push('/inbound-delivery?tab=Put-away') }

// ── Start date label ──────────────────────────────────────────────────────────
const startDateLabel = computed(() => formatDateTimeLong(task.value?.startDate))

// ── Footer overflow divider ───────────────────────────────────────────────────
const stageEl          = ref<HTMLElement | null>(null)
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
    setupItemsObserver()
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  itemsObserver?.disconnect()
})
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPutAway">Put-away</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Put away items</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <div class="pi-header">
        <ContentList label="Warehouse" :value="task.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Start date" :value="startDateLabel" />
      </div>

      <div class="pi-summary">
        <div class="pi-stat">
          <span class="pi-stat-label">SKU qty</span>
          <span class="pi-stat-val">{{ fmt(skuQty) }}</span>
        </div>
        <div class="pi-stat">
          <span class="pi-stat-label">Received qty</span>
          <span class="pi-stat-val">{{ fmt(receivedQty) }}</span>
        </div>
        <div class="pi-stat">
          <span class="pi-stat-label">Put away qty</span>
          <span class="pi-stat-val">{{ fmt(draftHandled) }}</span>
        </div>
      </div>

      <div class="pi-sku-section">

        <div class="pi-filter-bar">
          <span class="pi-editing-hint">Scan or enter the put away qty and confirm the storage location for each item.</span>
          <div class="pi-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pi-search" type="text" placeholder="Search product, SKU, or location…" />
          </div>
        </div>

        <section class="pi-items-section" :class="{ 'pi-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="pi-items-scroll">
            <table class="pi-items">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="pi-th">Product</th>
                  <th class="pi-th">SKU</th>
                  <th class="pi-th pi-th--num">Received qty</th>
                  <th class="pi-th pi-th--num">Put away qty</th>
                  <th class="pi-th">Unit</th>
                  <th class="pi-th">Storage location</th>
                  <th class="pi-th pi-th--action" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rowsWithMeta" :key="row.id" class="pi-row">
                  <!-- Product — merged across split rows -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged" :rowspan="row.groupSize">
                    <ProductCell
                      :name="itemBySkuCode.get(row.skuCode)?.productName ?? ''"
                      :desc="itemBySkuCode.get(row.skuCode)?.productDesc"
                      :image="itemBySkuCode.get(row.skuCode)?.image"
                    />
                  </td>
                  <!-- SKU — merged -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged" :rowspan="row.groupSize">{{ row.skuCode }}</td>
                  <!-- Received qty — merged, summed across all receiving tasks -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged pi-td--num" :rowspan="row.groupSize">{{ fmt(totalQtyBySkuCode.get(row.skuCode) ?? 0) }}</td>
                  <!-- Put away qty (editable — per split row) -->
                  <td class="pi-td pi-td--input">
                    <input
                      class="pi-qty-input"
                      type="number" min="0" :max="totalQtyBySkuCode.get(row.skuCode) ?? 0"
                      :value="row.qty"
                      :aria-label="`Put away qty for ${itemBySkuCode.get(row.skuCode)?.productName}`"
                      @input="onQtyInput(row.id, totalQtyBySkuCode.get(row.skuCode) ?? 0, $event)"
                    />
                  </td>
                  <!-- Unit — merged -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged" :rowspan="row.groupSize">{{ itemBySkuCode.get(row.skuCode)?.unit }}</td>
                  <!-- Storage location (popover picker, per split row) -->
                  <td class="pi-td pi-td--location">
                    <MpPopover :id="`pi-loc-${row.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="closeLocPicker(row.id)">
                      <MpPopoverTrigger>
                        <div class="pi-loc-trigger">
                          <input
                            class="pi-loc-input"
                            type="text"
                            autocomplete="off"
                            :value="activeLocRowId === row.id ? locSearch : row.binLocation"
                            placeholder="Select location"
                            @focus="openLocPicker(row.id)"
                            @input="activeLocRowId = row.id; locSearch = ($event.target as HTMLInputElement).value"
                          />
                          <svg class="pi-loc-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '360px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
                        <MpPopoverList>
                          <MpPopoverListItem v-for="loc in locOptionsFiltered(row.id)" :key="loc" :is-active="loc === row.binLocation" @click="updateLocation(row.id, loc)">{{ loc }}</MpPopoverListItem>
                          <p v-if="!locOptionsFiltered(row.id).length" class="pi-loc-none">No locations found.</p>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <!-- Actions -->
                  <td class="pi-td pi-td--action">
                    <MpPopover :id="`pi-row-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                      <MpPopoverTrigger>
                        <button class="pi-row-kebab" aria-label="More actions">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                        <MpPopoverList>
                          <MpPopoverListItem @click="splitRow(row.id)">Split storage location</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                </tr>
                <tr v-if="!filteredRows.length">
                  <td class="pi-td pi-empty" colspan="7">No products match your search.</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pi-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pi-loading">
              <MpSpinner size="sm" /> Loading items…
            </div>
          </div>
          <div class="pi-items-count">
            Showing {{ pagedRows.length }} of {{ filteredRows.length }} items
          </div>
        </section>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="pi-btn pi-btn--ghost" @click="goBack">Cancel</button>
      <button class="pi-btn pi-btn--secondary" @click="saveDraft">Save as draft</button>
      <button class="pi-btn pi-btn--primary" @click="postPutAway">Finish put-away</button>
    </footer>
  </div>

  <div v-else class="pi-not-found">
    <p>Put-away task not found.</p>
    <button class="detail-breadcrumb" @click="goPutAway">Back to Put-away</button>
  </div>


</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; line-height: var(--mp-line-heights-sm); }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Task header ─────────────────────────────────────────────────────────────── */
.pi-header {
  display: flex; gap: var(--mp-spacing-10);
  padding-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.pi-header :deep(.content-list) { padding-top: 0; }

/* ── Summary stats ───────────────────────────────────────────────────────────── */
.pi-summary { display: flex; gap: var(--mp-spacing-10); align-self: flex-start; }
.pi-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 96px; }
.pi-stat-val {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.pi-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Section wrapper ─────────────────────────────────────────────────────────── */
.pi-sku-section { display: flex; flex-direction: column; }

/* ── Filter bar ──────────────────────────────────────────────────────────────── */
.pi-filter-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5);
}
.pi-editing-hint {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-normal);
  color: var(--mp-text-default); white-space: nowrap;
}
.pi-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 260px;
}
.pi-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.pi-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.pi-search::placeholder { color: var(--mp-text-placeholder); }

/* ── Items table section ─────────────────────────────────────────────────────── */
.pi-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.pi-items-section--bordered {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden;
}
.pi-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pi-items thead .pi-th { position: sticky; top: 0; z-index: 1; }
.pi-items { width: 100%; border-collapse: collapse; table-layout: auto; }

.pi-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-default, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.pi-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pi-th--action { padding: 0; width: 48px; min-width: 48px; position: sticky; right: 0; z-index: 2; background: var(--mp-background-default, #fff); }

.pi-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.pi-td:last-child { border-right: none; }
.pi-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.pi-td--action { padding: 0; width: 48px; min-width: 48px; position: sticky; right: 0; z-index: 2; background: var(--mp-background-neutral-hovered); }

/* ── Product cell ─────────────────────────────────────────────────────────────── */
/* ── Qty to handle input ─────────────────────────────────────────────────────── */
.pi-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pi-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pi-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
  line-height: var(--mp-line-heights-md);
}

/* ── Storage location cell (popover picker) ──────────────────────────────────── */
.pi-td--location { padding: 0; background: var(--mp-background-neutral, #fff); }
.pi-td--location:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pi-loc-trigger { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%; min-height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3); cursor: text; }
.pi-loc-input { flex: 1; min-width: 0; border: none; outline: none; background: none; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; }
.pi-loc-input::placeholder { color: var(--mp-text-placeholder); }
.pi-loc-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.pi-loc-none { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; }

/* ── Row actions (kebab) ─────────────────────────────────────────────────────── */
.pi-row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; min-height: 40px;
  border: none; background: none; cursor: pointer;
  color: var(--mp-text-secondary);
}
.pi-row-kebab:hover { color: var(--mp-text-default); }

/* ── Pagination & misc ───────────────────────────────────────────────────────── */
.pi-sentinel { height: 1px; }
.pi-loading {
  display: flex; align-items: center; justify-content: center;
  gap: var(--mp-spacing-2); padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.pi-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.pi-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

/* ── Footer buttons ──────────────────────────────────────────────────────────── */
.pi-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
  line-height: var(--mp-line-heights-md); transition: background 0.15s;
}
.pi-btn--ghost     { background: transparent; border-color: transparent; color: var(--mp-text-secondary); }
.pi-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.pi-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.pi-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.pi-btn--primary   { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.pi-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

/* ── Not found ───────────────────────────────────────────────────────────────── */
.pi-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1; height: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
