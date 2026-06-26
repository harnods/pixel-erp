<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpDatePicker, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { TODAY } from '~/data/master'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const warehouse = computed(() => getWarehouseDetail(props.orderId))

// WMS Ops + Ops 2 operate within a single warehouse — hide the "Warehouses"
// breadcrumb (no list to go back to) and the Transactions tab in those scenarios.
const { activeScenario } = useScenario()
const isWmsOps = computed(
  () => activeScenario.value === 'WMS Ops' || activeScenario.value === 'WMS Ops 2',
)
const showBreadcrumb = computed(() => !isWmsOps.value)

// empty-state illustration (runtime public path, not a build-time import)
const emptyIllustration = '/illustrations/empty-folder.png'

const toggleAirene = inject<() => void>('toggleAirene')

// ── Warehouse info rows (horizontal label / value, per Figma) ──────────────────
const infoRows = computed(() => {
  const w = warehouse.value
  if (!w) return []
  return [
    { key: 'name', label: 'Warehouse name', value: w.name },
    { key: 'code', label: 'Warehouse code', value: w.code },
    { key: 'pic', label: 'PIC', value: w.pic },
    { key: 'address', label: 'Address', value: w.address },
    { key: 'description', label: 'Description', value: w.description },
  ]
})

// ── Actions dropdown (top-right): Edit · Archive/Unarchive · Delete (if applicable)
const canArchive = computed(() => warehouse.value && !warehouse.value.isDefault)
const isArchived = computed(() => warehouse.value?.status === 'archived')
const canDelete = computed(
  () => warehouse.value && !warehouse.value.isDefault && !warehouse.value.hasTransactions,
)

const deleteModalOpen = ref(false)
const archiveModalOpen = ref(false)

function goEdit() {
  // edit form not in scope for this story — navigate to the (future) edit route
  router.push(`/warehouses/${props.orderId}/edit`)
}
function confirmArchive() {
  archiveModalOpen.value = false
  toast.notify({
    variant: 'success',
    title: isArchived.value ? 'Warehouse unarchived' : 'Warehouse archived',
  })
}
function confirmDelete() {
  deleteModalOpen.value = false
  toast.notify({ variant: 'success', title: 'Warehouse deleted' })
  router.push('/warehouses')
}

// ── Products table (Products tab) — ErpTablePage (read-only, single page) ──────
const stockColumns: TableColumn[] = [
  { key: 'name',                label: 'Name',                 width: '320px' },
  { key: 'sku',                 label: 'SKU',                  width: '120px' },
  { key: 'barcode',             label: 'Barcode',              width: '170px' },
  { key: 'category',            label: 'Category',             width: '150px' },
  { key: 'onHand',              label: 'On hand',              width: '120px', align: 'right' },
  { key: 'reserved',            label: 'Reserved',             width: '120px', align: 'right' },
  { key: 'available',           label: 'Available',            width: '120px', align: 'right' },
  { key: 'onTheWay',            label: 'On the way',           width: '130px', align: 'right' },
  { key: 'minStock',            label: 'Min. stock',           width: '130px', align: 'right' },
  { key: 'unit',                label: 'Unit',                 width: '90px'  },
  { key: 'locations',           label: 'Location',             width: '230px' },
  { key: 'defaultSalesPrice',   label: 'Default sales price',  width: '180px', align: 'right' },
  { key: 'averageCost',         label: 'Average cost',         width: '170px', align: 'right' },
  { key: 'lastPurchaseCost',    label: 'Last purchase cost',   width: '180px', align: 'right' },
  { key: 'defaultPurchaseCost', label: 'Default purchase cost', width: '190px', align: 'right' },
]

const search = ref('')
const filteredStock = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = warehouse.value?.stock ?? []
  if (!q) return list
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.sku.toLowerCase().includes(q) ||
      s.barcode.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q),
  )
})
// real pagination — only render the current page (warehouses can hold 1000+ SKUs)
const productsPage = ref(1)
const productsPerPage = ref(25)
const pagedStock = computed(() => {
  const start = (productsPage.value - 1) * productsPerPage.value
  return filteredStock.value.slice(start, start + productsPerPage.value)
})
function onProductsPageChange(page: number) { productsPage.value = page }
function onProductsPerPageChange(per: number) { productsPerPage.value = per; productsPage.value = 1 }
// reset to page 1 when the search or the warehouse changes
watch([search, () => props.orderId], () => { productsPage.value = 1 })

// ── Batches table (Batches tab) — custom table with merged (rowspan) Product/SKU
const batchSearch = ref('')
const batchProducts = computed(() =>
  (warehouse.value?.stock ?? []).filter((s) => s.batches && s.batches.length > 0),
)
// expand state — default-expand the first batch product (matches the design)
const expandedBatches = ref<Set<string>>(new Set())
watch(batchProducts, (list) => {
  if (list.length && expandedBatches.value.size === 0) expandedBatches.value = new Set([list[0].id])
}, { immediate: true })

function toggleBatch(id: string) {
  const s = new Set(expandedBatches.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedBatches.value = s
}

// expiry-date filter (MpDatePicker) — show batches expiring on/before the date.
// MpDatePicker emits the value in its display format (DD/MM/YYYY), so parse it
// to a Date rather than relying on value-type.
const expiryFilter = ref('')
function parseExpiry(v: string): Date | null {
  if (!v) return null
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v)        // DD/MM/YYYY (datepicker display)
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1])
  const d = new Date(v)                                     // ISO fallback
  return Number.isNaN(d.getTime()) ? null : d
}
function visibleBatches(p: { batches?: { expiryDate: string }[] }) {
  const batches = p.batches ?? []
  const sel = parseExpiry(expiryFilter.value)
  if (!sel) return batches
  sel.setHours(23, 59, 59, 999)
  return batches.filter((b) => new Date(b.expiryDate) <= sel)
}

const filteredBatchProducts = computed(() => {
  const q = batchSearch.value.trim().toLowerCase()
  return batchProducts.value.filter((s) => {
    const matchesQuery = !q || s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q)
    return matchesQuery && visibleBatches(s).length > 0
  })
})

function isBatchExpanded(id: string) { return expandedBatches.value.has(id) }
function batchCountLabel(n: number) { return `${n} ${n === 1 ? 'batch' : 'batches'}` }

// ── Serial numbers tab (grouped, expandable per product) ───────────────────────
const serialSearch = ref('')
const serialProducts = computed(() =>
  (warehouse.value?.stock ?? []).filter((s) => s.serials &&
    (s.serials.available.length > 0 || s.serials.reserved.length > 0)),
)
const expandedSerials = ref<Set<string>>(new Set())
watch(serialProducts, (list) => {
  if (list.length && expandedSerials.value.size === 0) expandedSerials.value = new Set([list[0].id])
}, { immediate: true })
function toggleSerial(id: string) {
  const s = new Set(expandedSerials.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedSerials.value = s
}
function isSerialExpanded(id: string) { return expandedSerials.value.has(id) }
const filteredSerialProducts = computed(() => {
  const q = serialSearch.value.trim().toLowerCase()
  if (!q) return serialProducts.value
  return serialProducts.value.filter(
    (s) => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q),
  )
})
function serialCountLabel(n: number) { return `${n} ${n === 1 ? 'serial number' : 'serial numbers'}` }

function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function isExpiryWarning(iso: string) {
  return (new Date(iso).getTime() - TODAY.getTime()) / 86_400_000 < 30
}

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 2,
  }).format(amount)
}
function formatNum(n: number) {
  return n.toLocaleString('id-ID')
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time} (GMT+7)`
}

function goBack() { router.push('/warehouses') }

// ── Scroll-position-aware sticky columns ───────────────────────────────────────
// The kebab (actions) column is sticky-right from the start (wide table); at the
// far-right scroll end it un-sticks. The Name column is NOT sticky at the start;
// it becomes sticky-left (with a right separator) once the user scrolls right.
// ErpTablePage only detects overflow, not scroll position — so we track it here
// and toggle `wh-scroll-start` / `wh-scroll-end` classes on the table wrapper.
const productsTableEl = ref<HTMLElement | null>(null)

function applyStickyState(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth
  el.classList.toggle('wh-scroll-start', el.scrollLeft <= 0)
  el.classList.toggle('wh-scroll-end', el.scrollLeft >= max - 1)
}
// scroll events don't bubble but DO propagate in the capture phase — one capturing
// listener on the wrapper div catches the inner table's scroll regardless of when
// ErpTablePage mounts its scroll container.
function onTableScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el?.classList?.contains('erp-table-wrapper')) applyStickyState(el)
}
function refreshStickyState() {
  const el = productsTableEl.value?.querySelector<HTMLElement>('.erp-table-wrapper')
  if (el) applyStickyState(el)
}
function initStickyState(tries = 0) {
  const el = productsTableEl.value?.querySelector<HTMLElement>('.erp-table-wrapper')
  if (el) { applyStickyState(el); return }
  if (tries < 30) requestAnimationFrame(() => initStickyState(tries + 1))
}

onMounted(() => {
  initStickyState()
  window.addEventListener('resize', refreshStickyState)
})
onUnmounted(() => window.removeEventListener('resize', refreshStickyState))
// recompute when rows change (filter, warehouse switch, tab re-render)
watch(filteredStock, () => nextTick(() => initStickyState()))
</script>

<template>
  <div v-if="warehouse" class="detail-page">

    <!-- ── Title bar (breadcrumb + title + Actions dropdown) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button v-if="showBreadcrumb" class="detail-breadcrumb" @click="goBack">Warehouses</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ warehouse.name }}</h1>
        </div>
      </div>

      <!-- Actions dropdown: Edit · Archive/Unarchive · Delete (if applicable) -->
      <MpPopover id="wh-detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--primary">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goEdit">Edit</MpPopoverListItem>
            <MpPopoverListItem v-if="canArchive" @click="archiveModalOpen = true">
              {{ isArchived ? 'Unarchive' : 'Archive' }}
            </MpPopoverListItem>
            <MpPopoverListItem
              v-if="canDelete"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="deleteModalOpen = true"
            >
              Delete
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Warehouse info ── -->
      <section class="wh-info">
        <h2 class="wh-info-title">Warehouse info</h2>
        <dl class="wh-info-list">
          <div v-for="row in infoRows" :key="row.label" class="wh-info-row">
            <dt class="wh-info-label">{{ row.label }}</dt>
            <dd v-if="row.key === 'pic'" class="wh-info-value">
              <span v-if="warehouse.pics.length" class="wh-pic-tags">
                <span v-for="p in warehouse.pics" :key="p.id" class="wh-pic-tag">{{ p.name }}</span>
              </span>
              <template v-else>—</template>
            </dd>
            <dd v-else class="wh-info-value">{{ row.value }}</dd>
          </div>
        </dl>
        <a class="detail-updated" @click.prevent>
          Last updated by {{ warehouse.updatedBy }} on {{ formatUpdatedAt(warehouse.updatedAt) }}
        </a>
      </section>

      <!-- ── Tabs ── -->
      <MpTabs id="wh-detail-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="wh-tab-products" value="products">Products</MpTab>
          <MpTab id="wh-tab-batches" value="batches">Batches</MpTab>
          <MpTab id="wh-tab-serial" value="serial">Serial numbers</MpTab>
          <MpTab v-if="!isWmsOps" id="wh-tab-transactions" value="transactions">Transactions</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="products">
            <div ref="productsTableEl" class="wh-products-table" @scroll.capture="onTableScroll">
            <ErpTablePage
              :columns="stockColumns"
              :rows="pagedStock"
              :total="filteredStock.length"
              :current-page="productsPage"
              :per-page="productsPerPage"
              :has-active-filter="!!search"
              @page-change="onProductsPageChange"
              @per-page-change="onProductsPerPageChange"
              @clear-filters="search = ''"
            >
              <!-- toolbar: airene · columns · export · search (right-aligned) -->
              <template #filters>
                <div class="wh-toolbar">
                  <MpTooltip id="wh-tt-airene" label="Ask Airene" placement="bottom" use-portal>
                    <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                        <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                      </svg>
                    </button>
                  </MpTooltip>
                  <MpTooltip id="wh-tt-columns" label="Column settings" placement="bottom" use-portal>
                    <button class="wh-tool-btn" aria-label="Column settings">
                      <MpIcon name="column-settings" size="md" />
                    </button>
                  </MpTooltip>
                  <MpTooltip id="wh-tt-export" label="Export" placement="bottom" use-portal>
                    <button class="wh-tool-btn" aria-label="Export">
                      <MpIcon name="download" size="md" />
                    </button>
                  </MpTooltip>
                  <div class="wh-search">
                    <MpIcon name="search" size="md" />
                    <input v-model="search" class="wh-search-input" type="text" placeholder="Search..." />
                  </div>
                </div>
              </template>

              <!-- Name: product photo + name + subtitle, with "View details" on row hover -->
              <template #cell-name="{ row }">
                <div class="cell-with-action">
                  <div class="wh-product">
                    <img class="wh-thumb" :src="(row as any).photo" :alt="(row as any).name" loading="lazy" />
                    <span class="wh-product-text">
                      <span class="wh-product-name">{{ (row as any).name }}</span>
                      <span class="wh-product-sub">{{ (row as any).subtitle }}</span>
                    </span>
                  </div>
                  <button class="row-hover-btn" @click.stop>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </button>
                </div>
              </template>

              <!-- numeric stock columns -->
              <template #cell-onHand="{ value }">{{ formatNum(value as number) }}</template>
              <template #cell-reserved="{ value }">{{ formatNum(value as number) }}</template>
              <template #cell-available="{ value }">{{ formatNum(value as number) }}</template>
              <template #cell-onTheWay="{ value }">{{ formatNum(value as number) }}</template>
              <template #cell-minStock="{ value }">{{ formatNum(value as number) }}</template>

              <!-- location: one line per bin -->
              <template #cell-locations="{ value }">
                <span v-for="loc in (value as string[])" :key="loc" class="wh-loc">{{ loc }}</span>
              </template>

              <!-- money columns -->
              <template #cell-defaultSalesPrice="{ value }">{{ formatIDR(value as number) }}</template>
              <template #cell-averageCost="{ value }">{{ formatIDR(value as number) }}</template>
              <template #cell-lastPurchaseCost="{ value }">{{ formatIDR(value as number) }}</template>
              <template #cell-defaultPurchaseCost="{ value }">{{ formatIDR(value as number) }}</template>

              <!-- per-row kebab (sticky-right actions column; un-sticks at scroll end) -->
              <template #actions="{ row }">
                <MpPopover :id="`wh-stock-${(row as any).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <button class="row-kebab" aria-label="More actions">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem>View product</MpPopoverListItem>
                      <MpPopoverListItem>Adjust stock</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </template>

              <!-- full empty state -->
              <template #empty>
                <div class="empty-full">
                  <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
                  <p class="empty-full-title">No products</p>
                  <p class="empty-full-desc">Products in this warehouse will appear here.</p>
                </div>
              </template>
            </ErpTablePage>
            </div>
          </MpTabPanel>

          <MpTabPanel value="batches">
            <!-- toolbar: expiry filter (left) + airene · columns · export · search (right) -->
            <div class="wh-filter-bar">
              <div class="wh-expiry-filter">
                <MpDatePicker
                  id="wh-expiry-filter"
                  v-model="expiryFilter"
                  placeholder="Select expiry date"
                  format="DD/MM/YYYY"
                  is-clearable
                  use-portal
                />
              </div>
              <div class="wh-toolbar">
                <MpTooltip id="wh-bt-airene" label="Ask Airene" placement="bottom" use-portal>
                  <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                      <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                    </svg>
                  </button>
                </MpTooltip>
                <MpTooltip id="wh-bt-columns" label="Column settings" placement="bottom" use-portal>
                  <button class="wh-tool-btn" aria-label="Column settings"><MpIcon name="column-settings" size="md" /></button>
                </MpTooltip>
                <MpTooltip id="wh-bt-export" label="Export" placement="bottom" use-portal>
                  <button class="wh-tool-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
                </MpTooltip>
                <div class="wh-search">
                  <MpIcon name="search" size="md" />
                  <input v-model="batchSearch" class="wh-search-input" type="text" placeholder="Search..." />
                </div>
              </div>
            </div>

            <!-- custom table: Product & SKU are merged (rowspan) across each group's batch rows -->
            <div v-if="filteredBatchProducts.length" class="wh-batch-scroll">
              <table class="wh-batch-table">
                <colgroup>
                  <col style="width: 320px" />
                  <col style="width: 130px" />
                  <col style="width: 160px" />
                  <col style="width: 210px" />
                  <col style="width: 170px" />
                  <col style="width: 120px" />
                  <col style="width: 120px" />
                  <col style="width: 120px" />
                  <col style="width: 90px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="wh-bth">Product</th>
                    <th class="wh-bth">SKU</th>
                    <th class="wh-bth">Batch</th>
                    <th class="wh-bth">Location</th>
                    <th class="wh-bth">Expiry date</th>
                    <th class="wh-bth wh-bth--num">On hand</th>
                    <th class="wh-bth wh-bth--num">Reserved</th>
                    <th class="wh-bth wh-bth--num">Available</th>
                    <th class="wh-bth">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="p in filteredBatchProducts" :key="p.id">
                    <!-- group summary row — Product & SKU span the whole group -->
                    <tr class="wh-batch-group-row">
                      <td
                        class="wh-btd wh-btd--product wh-batch-cell"
                        :rowspan="isBatchExpanded(p.id) ? visibleBatches(p).length + 1 : 1"
                      >
                        <div class="wh-batch-product">
                          <button
                            class="wh-expand-btn"
                            :aria-label="isBatchExpanded(p.id) ? 'Collapse' : 'Expand'"
                            @click="toggleBatch(p.id)"
                          >
                            <svg
                              width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                              class="wh-expand-chevron" :class="{ 'wh-expand-chevron--open': isBatchExpanded(p.id) }"
                            >
                              <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                          <div class="wh-product">
                            <img class="wh-thumb" :src="p.photo" :alt="p.name" loading="lazy" />
                            <span class="wh-product-text">
                              <span class="wh-product-name">{{ p.name }}</span>
                              <span class="wh-product-sub">{{ p.subtitle }}</span>
                            </span>
                          </div>
                        </div>
                        <button class="row-hover-btn row-hover-btn--top" @click.stop>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </td>
                      <td class="wh-btd wh-btd--sku" :rowspan="isBatchExpanded(p.id) ? visibleBatches(p).length + 1 : 1">
                        {{ p.sku }}
                      </td>
                      <td class="wh-btd"><span class="wh-batch-summary">{{ batchCountLabel(visibleBatches(p).length) }}</span></td>
                      <td class="wh-btd"></td><!-- Location (per batch row) -->
                      <td class="wh-btd"></td><!-- Expiry date -->
                      <td class="wh-btd wh-btd--num">{{ formatNum(p.onHand) }}</td>
                      <td class="wh-btd wh-btd--num">{{ formatNum(p.reserved) }}</td>
                      <td class="wh-btd wh-btd--num">{{ formatNum(p.available) }}</td>
                      <td class="wh-btd">{{ p.unit }}</td>
                    </tr>
                    <!-- batch rows (only when expanded) -->
                    <tr v-for="b in (isBatchExpanded(p.id) ? visibleBatches(p) : [])" :key="b.batchNo" class="wh-batch-child-row">
                      <td class="wh-btd wh-batch-cell">
                        <span>{{ b.batchNo }}</span>
                        <button class="row-hover-btn" @click.stop>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </td>
                      <td class="wh-btd wh-loc-cell">{{ b.location }}</td>
                      <td class="wh-btd">
                        <span class="wh-expiry-cell">
                          {{ formatDateNumeric(b.expiryDate) }}
                          <MpIcon v-if="isExpiryWarning(b.expiryDate)" name="warning-triangle" size="sm" class="wh-expiry-warn" />
                        </span>
                      </td>
                      <td class="wh-btd wh-btd--num">{{ formatNum(b.onHand) }}</td>
                      <td class="wh-btd wh-btd--num">{{ formatNum(b.reserved) }}</td>
                      <td class="wh-btd wh-btd--num">{{ formatNum(b.available) }}</td>
                      <td class="wh-btd">{{ p.unit }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- empty state (no horizontal scroll — replaces the table entirely) -->
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No batches</p>
              <p class="empty-full-desc">Batch-tracked products in this warehouse will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredBatchProducts.length"
              :current-page="1"
              :per-page="25"
              :total="filteredBatchProducts.length"
            />
          </MpTabPanel>
          <MpTabPanel value="serial">
            <!-- toolbar: airene · columns · export · search (right-aligned) -->
            <div class="wh-filter-bar wh-filter-bar--end">
              <div class="wh-toolbar">
                <MpTooltip id="wh-st-airene" label="Ask Airene" placement="bottom" use-portal>
                  <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                      <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                    </svg>
                  </button>
                </MpTooltip>
                <MpTooltip id="wh-st-columns" label="Column settings" placement="bottom" use-portal>
                  <button class="wh-tool-btn" aria-label="Column settings"><MpIcon name="column-settings" size="md" /></button>
                </MpTooltip>
                <MpTooltip id="wh-st-export" label="Export" placement="bottom" use-portal>
                  <button class="wh-tool-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
                </MpTooltip>
                <div class="wh-search">
                  <MpIcon name="search" size="md" />
                  <input v-model="serialSearch" class="wh-search-input" type="text" placeholder="Search..." />
                </div>
              </div>
            </div>

            <!-- custom table: Product & SKU merged (rowspan); expanded row lists serials -->
            <div v-if="filteredSerialProducts.length" class="wh-batch-scroll">
              <table class="wh-batch-table">
                <colgroup>
                  <col style="width: 320px" />
                  <col style="width: 150px" />
                  <col />
                  <col style="width: 260px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="wh-bth">Product</th>
                    <th class="wh-bth">SKU</th>
                    <th class="wh-bth">Available</th>
                    <th class="wh-bth">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="p in filteredSerialProducts" :key="p.id">
                    <!-- summary row — Product & SKU span the group -->
                    <tr class="wh-batch-group-row">
                      <td class="wh-btd wh-btd--product wh-batch-cell" :rowspan="isSerialExpanded(p.id) ? 2 : 1">
                        <div class="wh-batch-product">
                          <button
                            class="wh-expand-btn"
                            :aria-label="isSerialExpanded(p.id) ? 'Collapse' : 'Expand'"
                            @click="toggleSerial(p.id)"
                          >
                            <svg
                              width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                              class="wh-expand-chevron" :class="{ 'wh-expand-chevron--open': isSerialExpanded(p.id) }"
                            >
                              <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                          <div class="wh-product">
                            <img class="wh-thumb" :src="p.photo" :alt="p.name" loading="lazy" />
                            <span class="wh-product-text">
                              <span class="wh-product-name">{{ p.name }}</span>
                              <span class="wh-product-sub">{{ p.subtitle }}</span>
                            </span>
                          </div>
                        </div>
                        <button class="row-hover-btn row-hover-btn--top" @click.stop>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </td>
                      <td class="wh-btd wh-btd--sku" :rowspan="isSerialExpanded(p.id) ? 2 : 1">{{ p.sku }}</td>
                      <td class="wh-btd"><span class="wh-batch-summary">{{ serialCountLabel(p.serials.available.length) }}</span></td>
                      <td class="wh-btd"><span class="wh-batch-summary">{{ serialCountLabel(p.serials.reserved.length) }}</span></td>
                    </tr>
                    <!-- detail row (when expanded): serial lists -->
                    <tr v-if="isSerialExpanded(p.id)" class="wh-batch-child-row">
                      <td class="wh-btd wh-btd--top">
                        <ul class="wh-serial-list">
                          <li v-for="u in p.serials.available" :key="u.serial" class="wh-serial-unit">
                            <a class="wh-serial-link" @click.prevent>{{ u.serial }}</a>
                            <span class="wh-serial-loc">{{ u.location }}</span>
                          </li>
                        </ul>
                      </td>
                      <td class="wh-btd wh-btd--top">
                        <div class="wh-serial-reserved">
                          <div v-for="u in p.serials.reserved" :key="u.serial" class="wh-serial-unit">
                            <a class="wh-serial-link" @click.prevent>{{ u.serial }}</a>
                            <span class="wh-serial-loc">{{ u.location }}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- empty state (no horizontal scroll — replaces the table entirely) -->
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No serial numbers</p>
              <p class="empty-full-desc">Serial-tracked products in this warehouse will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredSerialProducts.length"
              :current-page="1"
              :per-page="25"
              :total="filteredSerialProducts.length"
            />
          </MpTabPanel>
          <MpTabPanel v-if="!isWmsOps" value="transactions">
            <div class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No transactions</p>
              <p class="empty-full-desc">Transactions in this warehouse will appear here.</p>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div><!-- /detail-stage -->

    <!-- ── Archive confirmation modal ── -->
    <MpModal
      id="wh-detail-archive-modal"
      :is-open="archiveModalOpen"
      size="sm"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="archiveModalOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ isArchived ? 'Unarchive warehouse?' : 'Archive warehouse?' }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          {{ isArchived
            ? 'This warehouse will be active again and available for new transactions.'
            : 'Archived warehouses are hidden from selection but their data is kept.' }}
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--secondary" @click="archiveModalOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="confirmArchive">
              {{ isArchived ? 'Unarchive' : 'Archive' }}
            </button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Delete confirmation modal ── -->
    <MpModal
      id="wh-detail-delete-modal"
      :is-open="deleteModalOpen"
      size="sm"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="deleteModalOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          Delete warehouse?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          Deleted warehouse cannot be restored.
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--secondary" @click="deleteModalOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">Delete</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>
</template>

<style scoped>
.detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.detail-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 12px;
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* Actions button (primary, emerald) */
.detail-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
  font-family: inherit;
}
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861);
  border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a);
  border-color: var(--mp-colors-emerald-800, #186f4a);
}

/* ── Stage ── */
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);
}

/* ── Warehouse info ── */
.wh-info { display: flex; flex-direction: column; }
.wh-info-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.wh-info-list { margin: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.wh-info-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-4); }
.wh-info-label {
  flex-shrink: 0;
  width: 160px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.wh-info-value {
  margin: 0;
  flex: 1;
  max-width: 640px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* Last updated link */
.detail-updated {
  margin-top: var(--mp-spacing-4);
  align-self: flex-start;
  font-size: 12px;
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Tabs ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) {
  color: var(--mp-text-selected) !important;
}
/* colour the underline ONLY on the active tab (each tab ships its own border node) */
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) {
  margin-bottom: var(--mp-spacing-5) !important;
}
.wh-tab-empty {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Batches filter bar (expiry filter left, toolbar right) ── */
.wh-filter-bar {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  margin-bottom: var(--mp-spacing-5);   /* 20px gap to the table */
}
.wh-filter-bar .wh-toolbar { width: auto; }
/* serial tab has only the toolbar (no expiry filter) → push it to the right */
.wh-filter-bar--end { justify-content: flex-end; }
/* expiry-date filter — just a width wrapper; MpDatePicker brings its own input + border */
.wh-expiry-filter { width: 240px; }
.wh-expiry-filter :deep(.mp-datepicker__root) { width: 100%; }

/* ── Products toolbar (right-aligned inside ErpTablePage's #filters slot) ── */
.wh-toolbar {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
}
.wh-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mp-icon-default);
}
.wh-tool-btn:hover { background: var(--mp-background-neutral-hovered); }
.wh-tool-btn--airene { color: var(--mp-airene-default, #651fff); }
.wh-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  min-width: 220px;
}
/* neutral slate focus, consistent with all ERP form fields (border-bold = #8C9596) */
.wh-search:focus-within {
  border-color: var(--mp-border-bold);
  box-shadow: 0 0 0 1px var(--mp-border-bold);
}
.wh-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  outline: none;
}
.wh-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Product cell (Name column: product photo + name + subtitle) ── */
.cell-with-action { position: relative; display: flex; align-items: flex-start; width: 100%; min-width: 0; }
.wh-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); min-width: 0; }
/* "View details" chip — revealed on row hover (ErpTablePage row-hover pattern) */
.row-hover-btn {
  position: absolute;
  right: var(--mp-spacing-4);   /* 16px gap from the cell's right edge */
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  color: var(--mp-text-secondary);
}
/* reveal on hovering the Name cell — self-contained (same scope), so it works
   even though the Name column is position:sticky and rendered via a slot */
.cell-with-action:hover .row-hover-btn { display: flex; }
/* also reveal on full-row hover where that selector resolves (parity with index) */
:global(.erp-tr:hover .row-hover-btn) { display: flex; }
.wh-thumb {
  flex-shrink: 0;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-sm);
  object-fit: cover;
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
}
.wh-product-text { display: flex; flex-direction: column; }
.wh-product-name { color: var(--mp-text-default); }
.wh-product-sub {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
  margin-top: var(--mp-spacing-0\.5);
}
.wh-loc { display: block; }

/* ── Batch table cells ── */
.wh-batch-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-1); min-width: 0; }
.wh-expand-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-6, 24px);
  height: var(--mp-sizes-6, 24px);
  margin-top: var(--mp-spacing-1);
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-icon-default);
}
.wh-expand-btn:hover { background: var(--mp-background-neutral-hovered); }
.wh-expand-chevron { transition: transform 0.15s ease; }
.wh-expand-chevron--open { transform: rotate(90deg); }
/* summary row: "N batches" semibold; child row: batch no. default */
.wh-batch-summary { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
/* top-align the expanded serial detail cells (2 classes → beats base .wh-btd) */
.wh-btd.wh-btd--top { vertical-align: top; }
/* Available serials: bulleted list flowing into 2 columns */
.wh-serial-list {
  margin: 0;
  padding-left: var(--mp-spacing-4);
  columns: 2;
  column-gap: var(--mp-spacing-8);
  list-style: disc;
}
.wh-serial-list li { break-inside: avoid; }
/* Reserved serials: stacked, no bullets */
.wh-serial-reserved { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* one serialized unit = clickable serial number + its bin location below */
.wh-serial-unit { margin-bottom: var(--mp-spacing-2); break-inside: avoid; }
.wh-serial-reserved .wh-serial-unit { margin-bottom: 0; }
.wh-serial-link {
  display: block;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  cursor: pointer;
  text-decoration: none;
}
.wh-serial-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.wh-serial-loc {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
/* "View details" chip on hover — Product cell + each Batch cell */
.wh-batch-cell { position: relative; }
.wh-batch-cell:hover .row-hover-btn { display: flex; }
/* the Product cell is a tall (rowspan) merged cell → anchor the chip near the
   top so it sits beside the product name, not the middle of the whole group */
.row-hover-btn--top { top: var(--mp-spacing-2-5, 10px); transform: none; }
.wh-batch-no { color: var(--mp-text-default); }
.wh-expiry-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); white-space: nowrap; }
.wh-expiry-warn { color: var(--mp-icon-warning, #c2701f); flex-shrink: 0; }

.row-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-md);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mp-icon-default);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* ── Products empty state (full, illustrated — matches index pages) ── */
.empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;   /* spacing set per element below, no flex gap */
}
.empty-illustration {
  width: auto;
  height: 240px;         /* natural 288×240 → keep aspect ratio */
  object-fit: contain;
}
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);   /* 2px → description */
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Batches custom table (merged Product/SKU via rowspan) ── */
/* horizontal overflow → just a scroll container, NO outer bordered panel
   (the bordered panel is only for the vertical internal-scroll case, >10 rows) */
.wh-batch-scroll {
  overflow-x: auto;
}
.wh-batch-table {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
}
/* header — ErpTablePage spec: neutral-subtle gray, 28px, 12px/600 uppercase */
.wh-bth {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.wh-bth--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
/* rows — 10px vertical padding; dividers between every row (right columns) */
.wh-btd {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
  white-space: nowrap;
  background: var(--mp-background-neutral);
}
.wh-btd--num { text-align: right; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); }
/* merged Product/SKU cells: top-aligned, right divider so the group reads as one block */
.wh-btd--product, .wh-btd--sku {
  vertical-align: top;
  white-space: normal;
  border-right: 1px solid var(--mp-border-default);
}
.wh-btd--empty { color: var(--mp-text-secondary); white-space: normal; text-align: center; padding: var(--mp-spacing-6); }
/* last group has no trailing border (panel border closes it) */
.wh-batch-table tbody tr:last-child .wh-btd { border-bottom: none; }
.wh-batch-table tbody tr:hover .wh-btd { background: var(--mp-background-neutral-hovered); }

/* ── PIC tag chips (warehouse info) ── */
.wh-pic-tags { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.wh-pic-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--mp-spacing-2);
  height: var(--mp-sizes-6, 24px);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Scroll-position-aware sticky columns ─────────────────────────────────────
 * Name (first) column is pinned left, but its right separator only appears once
 * the user has scrolled right (`wh-scroll-start` toggled off). The kebab (actions)
 * column is sticky-right by default and un-sticks at the far-right end
 * (`wh-scroll-end`). Classes are toggled in JS (ErpTablePage only knows overflow). */
.detail-tabs :deep(.erp-th:first-child) {
  position: sticky;
  left: 0;
  z-index: 4;
  background: var(--mp-background-neutral-subtle);
}
.detail-tabs :deep(.erp-td:first-child) {
  position: sticky;
  left: 0;
  z-index: 1;
  background: inherit;
}
/* sticky cell uses `inherit` (row bg) which would override ErpTablePage's hover
   rule — re-apply the hovered bg so the Name cell matches the rest of the row */
.detail-tabs :deep(.erp-tr:hover .erp-td:first-child) {
  background: var(--mp-background-neutral-hovered);
}
/* Name right separator — only while scrolled away from the left edge */
.detail-tabs :deep(.erp-table-wrapper.is-overflowing:not(.wh-scroll-start) .erp-th:first-child),
.detail-tabs :deep(.erp-table-wrapper.is-overflowing:not(.wh-scroll-start) .erp-td:first-child) {
  box-shadow: inset -2px 0 var(--mp-border-default);
}
/* Actions column un-sticks (and drops its separator) at the far-right scroll end */
.detail-tabs :deep(.erp-table-wrapper.wh-scroll-end .erp-th--fixed),
.detail-tabs :deep(.erp-table-wrapper.wh-scroll-end .erp-td--fixed) {
  position: static !important;
  box-shadow: none !important;
}

/* ── Modal footer ── */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
