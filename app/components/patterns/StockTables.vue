<script setup lang="ts">
/**
 * Stock tables — the Products / Batches / Serial numbers tabbed tables, driven by a
 * `stock` array (a warehouse's or a single storage location's). Ported from the
 * warehouse detail page so both can share it. An optional `#extra` slot adds a
 * trailing tab (e.g. a location's "Storage location" sub-tree) with `extra-label`.
 */
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpTooltip, MpDatePicker, MpIcon, MpSelect,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import StockSerialDrawer from '~/components/patterns/StockSerialDrawer.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { TODAY } from '~/data/master'
import type { WarehouseStockItem } from '~/data/warehouseDetails'

const props = withDefaults(defineProps<{
  stock: WarehouseStockItem[]
  /** noun for empty-state copy, e.g. "this location" */
  subject?: string
  /** label for the optional trailing tab, rendered when the #extra slot is filled */
  extraLabel?: string
  /** column keys to hide from the products table (e.g. ['minStock']) */
  excludeColumns?: string[]
}>(), { subject: 'this location', extraLabel: 'Storage location', excludeColumns: () => [] })

const slots = useSlots()
const hasExtra = computed(() => !!slots.extra)
const toggleAirene = inject<() => void>('toggleAirene')
const emptyIllustration = '/illustrations/empty-folder.png'

// ── Products table ──────────────────────────────────────────────────────────────
const allStockColumns: TableColumn[] = [
  { key: 'name',                label: 'Name',                 width: '320px' },
  { key: 'sku',                 label: 'SKU',                  width: '200px' },
  { key: 'barcode',             label: 'Barcode',              width: '170px' },
  { key: 'category',            label: 'Category',             width: '150px' },
  { key: 'onHand',              label: 'On hand qty',          width: '120px', align: 'right' },
  { key: 'reserved',            label: 'Reserved qty',         width: '120px', align: 'right' },
  { key: 'available',           label: 'Available qty',        width: '120px', align: 'right' },
  { key: 'onTheWay',            label: 'On the way qty',       width: '130px', align: 'right' },
  { key: 'minStock',            label: 'Min. stock',           width: '130px', align: 'right' },
  { key: 'unit',                label: 'Unit',                 width: '90px'  },
  { key: 'locations',           label: 'Location',             width: '230px' },
]
const allStockCols: TableColumn[] = [...allStockColumns, { key: 'lastUpdated', label: 'Last updated', width: '200px' }]
const stockColVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allStockCols.map(c => [c.key, c.key !== 'lastUpdated'])),
)
const stockColItems = allStockCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const stockColumns = computed<TableColumn[]>(() =>
  allStockCols.filter(c => stockColVisibility[c.key] && !props.excludeColumns!.includes(c.key))
)

const batchColItems = [
  { key: 'product', label: 'Product', disabled: true },
  { key: 'sku', label: 'SKU', disabled: true },
  { key: 'batch', label: 'Batch' },
  { key: 'location', label: 'Location' },
  { key: 'expiry', label: 'Expiry date' },
  { key: 'onHand', label: 'On hand qty' },
  { key: 'reserved', label: 'Reserved qty' },
  { key: 'available', label: 'Available qty' },
  { key: 'minStock', label: 'Min. stock' },
  { key: 'unit', label: 'Unit' },
  { key: 'lastUpdated', label: 'Last updated' },
]
const batchColVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(batchColItems.map(c => [c.key, c.key !== 'lastUpdated' && !props.excludeColumns!.includes(c.key)]))
)
const batchColItemsVisible = computed(() => batchColItems.filter(c => !props.excludeColumns!.includes(c.key)))
const serialColItems = [
  { key: 'product', label: 'Product', disabled: true },
  { key: 'sku', label: 'SKU', disabled: true },
  { key: 'available', label: 'Available qty' },
  { key: 'reserved', label: 'Reserved qty' },
  { key: 'minStock', label: 'Min. stock' },
  { key: 'unit', label: 'Unit' },
  { key: 'lastUpdated', label: 'Last updated' },
]
const serialColVisibility = reactive<Record<string, boolean>>(Object.fromEntries(serialColItems.map(c => [c.key, c.key !== 'lastUpdated'])))

const search = ref('')
const filteredStock = computed(() => {
  const q = search.value.trim().toLowerCase()
  // Batch-tracked products belong only in Batches tab; serial-tracked only in Serial numbers tab
  const list = props.stock.filter(s => !s.batches?.length && !s.serials)
  if (!q) return list
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.sku.toLowerCase().includes(q) ||
      s.barcode.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q),
  )
})
const productsPage = ref(1)
const productsPerPage = ref(25)
const pagedStock = computed(() => {
  const start = (productsPage.value - 1) * productsPerPage.value
  return filteredStock.value.slice(start, start + productsPerPage.value)
})
function onProductsPageChange(page: number) { productsPage.value = page }
function onProductsPerPageChange(per: number) { productsPerPage.value = per; productsPage.value = 1 }
watch([search, () => props.stock], () => { productsPage.value = 1 })

// ── Batches ─────────────────────────────────────────────────────────────────────
const batchSearch = ref('')
const batchProducts = computed(() => props.stock.filter((s) => s.batches && s.batches.length > 0))
const expandedBatches = ref<Set<string>>(new Set())
watch(batchProducts, (list) => {
  if (list.length && expandedBatches.value.size === 0) expandedBatches.value = new Set([list[0]!.id])
}, { immediate: true })
function toggleBatch(id: string) {
  const s = new Set(expandedBatches.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedBatches.value = s
}
// ── Expiry range filter (Batches tab) ─────────────────────────────────────────
const expiryPreset = ref('')
const expiryFrom  = ref('')
const expiryTo    = ref('')

const expiryPresets = [
  { label: 'Already expired',  value: 'expired'    },
  { label: 'This month',       value: 'thismonth'  },
  { label: 'Next 2 months',    value: 'next2m'     },
  { label: 'Next 3 months',    value: 'next3m'     },
  { label: 'Custom range',     value: 'custom'     },
]
const expiryLabel = computed(() => {
  if (expiryPreset.value === 'custom')
    return expiryFrom.value && expiryTo.value ? `${expiryFrom.value} – ${expiryTo.value}` : 'Custom range'
  return expiryPresets.find((o) => o.value === expiryPreset.value)?.label ?? ''
})

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}

const expiryRange = computed<[Date, Date] | null>(() => {
  const today = dayStart(TODAY)
  switch (expiryPreset.value) {
    case 'expired':   return [new Date(0), new Date(today.getTime() - 1)]
    case 'thismonth': return [
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 0),
    ]
    case 'next2m': return [today, new Date(today.getFullYear(), today.getMonth() + 2, today.getDate())]
    case 'next3m': return [today, new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())]
    case 'custom': {
      const from = parseDMY(expiryFrom.value)
      const to   = parseDMY(expiryTo.value)
      return from && to ? [dayStart(from), dayStart(to)] : null
    }
    default: return null
  }
})

function clearExpiryFilter() { expiryPreset.value = ''; expiryFrom.value = ''; expiryTo.value = '' }

function visibleBatches(p: { batches?: { expiryDate: string }[] }) {
  const batches = p.batches ?? []
  const range = expiryRange.value
  if (!range) return batches
  const [from, to] = range
  to.setHours(23, 59, 59, 999)
  return batches.filter((b) => { const d = new Date(b.expiryDate); return d >= from && d <= to })
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

// ── Serial numbers ────────────────────────────────────────────────────────────────
const serialSearch = ref('')
const serialProducts = computed(() =>
  props.stock.filter((s) => s.serials && (s.serials.available.length > 0 || s.serials.reserved.length > 0)),
)
const filteredSerialProducts = computed(() => {
  const q = serialSearch.value.trim().toLowerCase()
  if (!q) return serialProducts.value
  return serialProducts.value.filter((s) => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q))
})
function serialCountLabel(n: number) { return `${n} ${n === 1 ? 'serial number' : 'serial numbers'}` }

// Borders on all columns when any row has merged cells (rowspan > 1 = expanded product)
const hasBatchMergedRows  = computed(() => filteredBatchProducts.value.length > 0)
const hasSerialMergedRows = computed(() => filteredSerialProducts.value.length > 0)
const hasBatchTab  = computed(() => batchProducts.value.length > 0)
const hasSerialTab = computed(() => serialProducts.value.length > 0)

const serialDrawerProduct = ref<WarehouseStockItem | null>(null)
const serialDrawerOpen    = ref(false)
const serialDrawerTab     = ref<'available' | 'reserved'>('available')
function openSerialDrawer(p: WarehouseStockItem, tab: 'available' | 'reserved' = 'available') {
  serialDrawerProduct.value = p
  serialDrawerTab.value     = tab
  serialDrawerOpen.value    = true
}

// ── Formatters + expiry helpers ────────────────────────────────────────────────────
function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function daysToExpiry(iso: string) { return Math.ceil((new Date(iso).getTime() - TODAY.getTime()) / 86_400_000) }
function isExpiryWarning(iso: string) { return daysToExpiry(iso) < 30 }
function expiryTooltip(iso: string) {
  const d = formatDateNumeric(iso)
  const days = daysToExpiry(iso)
  if (days < 0) return `Expired on ${d}`
  if (days === 0) return `Expires today (${d})`
  return `Expiring in ${days} day${days === 1 ? '' : 's'} (${d})`
}
function formatNum(n: number) { return n.toLocaleString('id-ID') }

// ── Scroll-aware sticky columns (Products table) ────────────────────────────────────
const productsTableEl = ref<HTMLElement | null>(null)
function applyStickyState(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth
  el.classList.toggle('wh-scroll-start', el.scrollLeft <= 0)
  el.classList.toggle('wh-scroll-end', el.scrollLeft >= max - 1)
}
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
onMounted(() => { initStickyState(); window.addEventListener('resize', refreshStickyState) })
onUnmounted(() => window.removeEventListener('resize', refreshStickyState))
watch(filteredStock, () => nextTick(() => initStickyState()))
</script>

<template>
  <MpTabs id="stock-tabs" :default-value="0" variant-color="green" class="detail-tabs stock-tabs">
    <MpTabList>
      <MpTab id="st-tab-products" value="products">Products</MpTab>
      <MpTab v-if="hasBatchTab" id="st-tab-batches" value="batches">Batches</MpTab>
      <MpTab v-if="hasSerialTab" id="st-tab-serial" value="serial">Serial numbers</MpTab>
      <MpTab v-if="hasExtra" id="st-tab-extra" value="extra">{{ extraLabel }}</MpTab>
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
            <template #filters>
              <div class="wh-toolbar">
                <MpTooltip id="st-tt-airene" label="Ask Airene" placement="bottom" use-portal>
                  <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                      <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                    </svg>
                  </button>
                </MpTooltip>
                <ColumnSettingsMenu id="st-tt-columns" :items="stockColItems" :visibility="stockColVisibility" />
                <MpTooltip id="st-tt-export" label="Export" placement="bottom" use-portal>
                  <button class="wh-tool-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
                </MpTooltip>
                <div class="wh-search">
                  <MpIcon name="search" size="md" />
                  <input v-model="search" class="wh-search-input" type="text" placeholder="Search..." />
                </div>
              </div>
            </template>

            <template #cell-name="{ row }">
              <div class="cell-with-action">
                <div class="wh-product">
                  <img class="wh-thumb" :src="(row as any).photo" :alt="(row as any).name" loading="lazy" />
                  <span class="wh-product-text">
                    <span class="wh-product-name">{{ (row as any).name }}</span>
                    <ClampText class="wh-product-sub" :text="(row as any).subtitle" />
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

            <template #cell-onHand="{ value }">{{ formatNum(value as number) }}</template>
            <template #cell-reserved="{ value }">{{ formatNum(value as number) }}</template>
            <template #cell-available="{ value }">{{ formatNum(value as number) }}</template>
            <template #cell-onTheWay="{ value }">{{ formatNum(value as number) }}</template>
            <template #cell-minStock="{ value }">{{ formatNum(value as number) }}</template>
            <template #cell-locations="{ value }">
              <span v-for="loc in (value as string[])" :key="loc" class="wh-loc">{{ loc }}</span>
            </template>
            <template #cell-lastUpdated="{ row }">
              <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
            </template>

            <template #actions="{ row }">
              <MpPopover :id="`st-stock-${(row as any).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <button class="row-kebab" aria-label="More actions">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
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

            <template #empty>
              <div class="empty-full">
                <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
                <p class="empty-full-title">No products</p>
                <p class="empty-full-desc">Products stored at {{ subject }} will appear here.</p>
              </div>
            </template>
          </ErpTablePage>
        </div>
      </MpTabPanel>

      <MpTabPanel v-if="hasBatchTab" value="batches">
        <div class="wh-filter-bar">
          <div class="wh-expiry-filter">
            <MpPopover id="st-expiry-preset" :is-close-on-select="false" use-portal placement="bottom-start">
              <MpPopoverTrigger>
                <MpSelect
                  id="st-expiry-select"
                  placeholder="Expiry date range"
                  :model-value="expiryPreset"
                  is-clearable
                  @mousedown.prevent
                  @clear="clearExpiryFilter"
                >
                  <option v-if="expiryPreset" :value="expiryPreset">{{ expiryLabel }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="opt in expiryPresets"
                    :key="opt.value"
                    :is-active="opt.value === expiryPreset"
                    @click="expiryPreset = opt.value"
                  >{{ opt.label }}</MpPopoverListItem>
                </MpPopoverList>
                <div v-if="expiryPreset === 'custom'" class="wh-expiry-custom">
                  <MpDatePicker id="st-expiry-from" v-model="expiryFrom" placeholder="From" format="DD/MM/YYYY" use-portal />
                  <MpDatePicker id="st-expiry-to"   v-model="expiryTo"   placeholder="To"   format="DD/MM/YYYY" use-portal />
                </div>
              </MpPopoverContent>
            </MpPopover>
          </div>
          <div class="wh-toolbar">
            <MpTooltip id="st-bt-airene" label="Ask Airene" placement="bottom" use-portal>
              <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                  <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                </svg>
              </button>
            </MpTooltip>
            <ColumnSettingsMenu id="st-bt-columns" :items="batchColItemsVisible" :visibility="batchColVisibility" />
            <MpTooltip id="st-bt-export" label="Export" placement="bottom" use-portal>
              <button class="wh-tool-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
            </MpTooltip>
            <div class="wh-search">
              <MpIcon name="search" size="md" />
              <input v-model="batchSearch" class="wh-search-input" type="text" placeholder="Search..." />
            </div>
          </div>
        </div>

        <div v-if="filteredBatchProducts.length" class="wh-batch-scroll">
          <table :class="['wh-batch-table', { 'wh-batch-table--bordered': hasBatchMergedRows }]">
            <colgroup>
              <col style="width: 320px" />
              <col v-if="batchColVisibility.sku" style="width: 200px" />
              <col v-if="batchColVisibility.batch" style="width: 160px" />
              <col v-if="batchColVisibility.location" style="width: 210px" />
              <col v-if="batchColVisibility.expiry" style="width: 170px" />
              <col v-if="batchColVisibility.onHand" style="width: 120px" />
              <col v-if="batchColVisibility.reserved" style="width: 120px" />
              <col v-if="batchColVisibility.available" style="width: 120px" />
              <col v-if="batchColVisibility.minStock" style="width: 130px" />
              <col v-if="batchColVisibility.unit" style="width: 90px" />
              <col v-if="batchColVisibility.lastUpdated" style="width: 200px" />
            </colgroup>
            <thead>
              <tr>
                <th class="wh-bth">Product</th>
                <th v-if="batchColVisibility.sku" class="wh-bth">SKU</th>
                <th v-if="batchColVisibility.batch" class="wh-bth">Batch</th>
                <th v-if="batchColVisibility.location" class="wh-bth">Location</th>
                <th v-if="batchColVisibility.expiry" class="wh-bth">Expiry date</th>
                <th v-if="batchColVisibility.onHand" class="wh-bth wh-bth--num">On hand qty</th>
                <th v-if="batchColVisibility.reserved" class="wh-bth wh-bth--num">Reserved qty</th>
                <th v-if="batchColVisibility.available" class="wh-bth wh-bth--num">Available qty</th>
                <th v-if="batchColVisibility.minStock" class="wh-bth wh-bth--num">Min. stock</th>
                <th v-if="batchColVisibility.unit" class="wh-bth">Unit</th>
                <th v-if="batchColVisibility.lastUpdated" class="wh-bth">Last updated</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="p in filteredBatchProducts" :key="p.id">
                <tr class="wh-batch-group-row" @click="toggleBatch(p.id)">
                  <td class="wh-btd wh-btd--product wh-batch-cell" :rowspan="isBatchExpanded(p.id) ? visibleBatches(p).length + 1 : 1">
                    <div class="wh-batch-product">
                      <button class="wh-expand-btn" :aria-label="isBatchExpanded(p.id) ? 'Collapse' : 'Expand'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="wh-expand-chevron" :class="{ 'wh-expand-chevron--open': isBatchExpanded(p.id) }">
                          <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <div class="wh-product">
                        <img class="wh-thumb" :src="p.photo" :alt="p.name" loading="lazy" />
                        <span class="wh-product-text">
                          <span class="wh-product-name">{{ p.name }}</span>
                          <ClampText class="wh-product-sub" :text="p.subtitle" />
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
                  <td v-if="batchColVisibility.sku" class="wh-btd wh-btd--sku" :rowspan="isBatchExpanded(p.id) ? visibleBatches(p).length + 1 : 1">{{ p.sku }}</td>
                  <td v-if="batchColVisibility.batch" class="wh-btd" :colspan="batchColVisibility.location ? 2 : 1"><span class="wh-batch-summary">{{ batchCountLabel(visibleBatches(p).length) }}</span></td>
                  <td v-if="!batchColVisibility.batch && batchColVisibility.location" class="wh-btd"></td>
                  <td v-if="batchColVisibility.expiry" class="wh-btd"></td>
                  <td v-if="batchColVisibility.onHand" class="wh-btd wh-btd--num">{{ formatNum(p.onHand) }}</td>
                  <td v-if="batchColVisibility.reserved" class="wh-btd wh-btd--num">{{ formatNum(p.reserved) }}</td>
                  <td v-if="batchColVisibility.available" class="wh-btd wh-btd--num">{{ formatNum(p.available) }}</td>
                  <td v-if="batchColVisibility.minStock" class="wh-btd wh-btd--num" :rowspan="isBatchExpanded(p.id) ? visibleBatches(p).length + 1 : 1">{{ formatNum(p.minStock) }}</td>
                  <td v-if="batchColVisibility.unit" class="wh-btd">{{ p.unit }}</td>
                  <td v-if="batchColVisibility.lastUpdated" class="wh-btd"><LastUpdatedCell v-bind="lastUpdatedFor(p.id)" /></td>
                </tr>
                <tr v-for="b in (isBatchExpanded(p.id) ? visibleBatches(p) : [])" :key="b.batchNo" class="wh-batch-child-row">
                  <td v-if="batchColVisibility.batch" class="wh-btd wh-batch-cell">
                    <span>{{ b.batchNo }}</span>
                    <button class="row-hover-btn" @click.stop>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      <span class="row-hover-btn__label">VIEW DETAILS</span>
                    </button>
                  </td>
                  <td v-if="batchColVisibility.location" class="wh-btd wh-loc-cell">{{ b.location }}</td>
                  <td v-if="batchColVisibility.expiry" class="wh-btd">
                    <span class="wh-expiry-cell" :class="{ 'wh-expiry-cell--danger': isExpiryWarning(b.expiryDate) }">
                      {{ formatDateNumeric(b.expiryDate) }}
                      <MpTooltip v-if="isExpiryWarning(b.expiryDate)" :id="`st-tt-exp-${p.id}-${b.batchNo}`" :label="expiryTooltip(b.expiryDate)" placement="top" use-portal>
                        <span class="wh-expiry-warn" @click.stop><MpIcon name="warning-triangle" size="sm" /></span>
                      </MpTooltip>
                    </span>
                  </td>
                  <td v-if="batchColVisibility.onHand" class="wh-btd wh-btd--num">{{ formatNum(b.onHand) }}</td>
                  <td v-if="batchColVisibility.reserved" class="wh-btd wh-btd--num">{{ formatNum(b.reserved) }}</td>
                  <td v-if="batchColVisibility.available" class="wh-btd wh-btd--num">{{ formatNum(b.available) }}</td>
                  <td v-if="batchColVisibility.unit" class="wh-btd">{{ p.unit }}</td>
                  <td v-if="batchColVisibility.lastUpdated" class="wh-btd" />
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">No batches</p>
          <p class="empty-full-desc">Batch-tracked products stored at {{ subject }} will appear here.</p>
        </div>
        <ErpPagination v-if="filteredBatchProducts.length" :current-page="1" :per-page="25" :total="filteredBatchProducts.length" />
      </MpTabPanel>

      <MpTabPanel v-if="hasSerialTab" value="serial">
        <div class="wh-filter-bar wh-filter-bar--end">
          <div class="wh-toolbar">
            <MpTooltip id="st-st-airene" label="Ask Airene" placement="bottom" use-portal>
              <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                  <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                </svg>
              </button>
            </MpTooltip>
            <ColumnSettingsMenu id="st-st-columns" :items="serialColItems" :visibility="serialColVisibility" />
            <MpTooltip id="st-st-export" label="Export" placement="bottom" use-portal>
              <button class="wh-tool-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
            </MpTooltip>
            <div class="wh-search">
              <MpIcon name="search" size="md" />
              <input v-model="serialSearch" class="wh-search-input" type="text" placeholder="Search..." />
            </div>
          </div>
        </div>

        <div v-if="filteredSerialProducts.length" class="wh-batch-scroll">
          <table class="wh-batch-table">
            <colgroup>
              <col style="width: 320px" />
              <col v-if="serialColVisibility.sku" style="width: 200px" />
              <col v-if="serialColVisibility.available" style="width: 260px" />
              <col v-if="serialColVisibility.reserved" style="width: 260px" />
              <col v-if="serialColVisibility.minStock" style="width: 130px" />
              <col v-if="serialColVisibility.unit" style="width: 90px" />
              <col v-if="serialColVisibility.lastUpdated" style="width: 200px" />
            </colgroup>
            <thead>
              <tr>
                <th class="wh-bth">Product</th>
                <th v-if="serialColVisibility.sku" class="wh-bth">SKU</th>
                <th v-if="serialColVisibility.available" class="wh-bth">Available qty</th>
                <th v-if="serialColVisibility.reserved" class="wh-bth">Reserved qty</th>
                <th v-if="serialColVisibility.minStock" class="wh-bth wh-bth--num">Min. stock</th>
                <th v-if="serialColVisibility.unit" class="wh-bth">Unit</th>
                <th v-if="serialColVisibility.lastUpdated" class="wh-bth">Last updated</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="p in filteredSerialProducts" :key="p.id">
                <tr class="wh-batch-group-row">
                  <td class="wh-btd wh-btd--product wh-batch-cell">
                    <div class="wh-batch-product">
                      <div class="wh-product">
                        <img class="wh-thumb" :src="p.photo" :alt="p.name" loading="lazy" />
                        <span class="wh-product-text">
                          <span class="wh-product-name">{{ p.name }}</span>
                          <ClampText class="wh-product-sub" :text="p.subtitle" />
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
                  <td v-if="serialColVisibility.sku" class="wh-btd wh-btd--sku">{{ p.sku }}</td>
                  <td v-if="serialColVisibility.available" class="wh-btd">
                    <div class="cell-with-action">
                      <span class="wh-serial-count">{{ serialCountLabel(p.serials.available.length) }}</span>
                      <button class="row-hover-btn" @click.stop="openSerialDrawer(p, 'available')">
                        <span class="row-hover-btn__label">VIEW DETAILS</span>
                      </button>
                    </div>
                  </td>
                  <td v-if="serialColVisibility.reserved" class="wh-btd">
                    <div class="cell-with-action">
                      <span class="wh-serial-count">{{ serialCountLabel(p.serials.reserved.length) }}</span>
                      <button class="row-hover-btn" @click.stop="openSerialDrawer(p, 'reserved')">
                        <span class="row-hover-btn__label">VIEW DETAILS</span>
                      </button>
                    </div>
                  </td>
                  <td v-if="serialColVisibility.minStock" class="wh-btd wh-btd--num">{{ formatNum(p.minStock) }}</td>
                  <td v-if="serialColVisibility.unit" class="wh-btd">{{ p.unit }}</td>
                  <td v-if="serialColVisibility.lastUpdated" class="wh-btd"><LastUpdatedCell v-bind="lastUpdatedFor(p.id)" /></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">No serial numbers</p>
          <p class="empty-full-desc">Serial-tracked products stored at {{ subject }} will appear here.</p>
        </div>
        <ErpPagination v-if="filteredSerialProducts.length" :current-page="1" :per-page="25" :total="filteredSerialProducts.length" />
      </MpTabPanel>

      <MpTabPanel v-if="hasExtra" value="extra">
        <slot name="extra" />
      </MpTabPanel>
    </MpTabPanels>
  </MpTabs>

  <StockSerialDrawer
    :open="serialDrawerOpen"
    :product="serialDrawerProduct"
    :initial-tab="serialDrawerTab"
    @update:open="serialDrawerOpen = $event"
  />
</template>

<style scoped>
.detail-tabs { margin-top: 0; }
/* active tab text colour (was missing → active tab showed the wrong colour) */
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
/* colour the underline ONLY on the active tab */
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

/* Batches filter bar */
.wh-filter-bar { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.wh-filter-bar .wh-toolbar { width: auto; }
.wh-filter-bar--end { justify-content: flex-end; }
.wh-expiry-filter { flex-shrink: 0; width: 240px; }
.wh-expiry-custom {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default);
}

/* Toolbar */
.wh-toolbar { display: flex; width: 100%; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); }
.wh-tool-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.wh-tool-btn:hover { background: var(--mp-background-neutral-hovered); }
.wh-tool-btn--airene { color: var(--mp-airene-default, #651fff); }
.wh-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 220px; }
.wh-search:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.wh-search-input { flex: 1; border: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); outline: none; }
.wh-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Product cell */
.cell-with-action { position: relative; display: flex; align-items: flex-start; width: 100%; min-width: 0; }
.wh-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); min-width: 0; }
.row-hover-btn { position: absolute; right: var(--mp-spacing-4); top: 50%; transform: translateY(-50%); display: none; align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); }
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary); }
.cell-with-action:hover .row-hover-btn { display: flex; }
:global(.erp-tr:hover .row-hover-btn) { display: flex; }
.wh-thumb { flex-shrink: 0; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-sm); object-fit: cover; background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default); }
.wh-product-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.wh-product-name { color: var(--mp-text-default); }
.wh-product-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); margin-top: var(--mp-spacing-0\.5); }
.wh-loc { display: block; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }

/* Batch/serial table cells */
.wh-batch-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-1); min-width: 0; }
.wh-expand-btn { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px); margin-top: var(--mp-spacing-1); border: none; background: none; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-icon-default); }
.wh-expand-btn:hover { background: var(--mp-background-neutral-hovered); }
.wh-expand-chevron { transition: transform 0.15s ease; }
.wh-expand-chevron--open { transform: rotate(90deg); }
.wh-batch-summary { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wh-serial-count { color: var(--mp-text-default); }
.wh-btd.wh-btd--top { vertical-align: top; }
.wh-batch-cell { position: relative; }
.wh-batch-cell:hover .row-hover-btn { display: flex; }
.row-hover-btn--top { top: var(--mp-spacing-2-5, 10px); transform: none; }
.wh-expiry-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); white-space: nowrap; }
.wh-expiry-cell--danger { color: var(--mp-text-danger, #a8352d); }
.wh-expiry-warn { display: inline-flex; align-items: center; color: var(--mp-text-danger, #a8352d); flex-shrink: 0; cursor: default; }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* Batch/serial table */
.wh-batch-scroll { overflow-x: auto; }
.wh-batch-table { width: 100%; min-width: max-content; border-collapse: collapse; }
.wh-bth { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.wh-bth--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.wh-btd { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; white-space: nowrap; background: var(--mp-background-neutral); }
.wh-btd--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.wh-btd--product, .wh-btd--sku { vertical-align: top; white-space: normal; }
/* All-column borders when merged rows are present. border-collapse merges adjacent rights → no doubling.
   No border-left on first col (table edge), no border-right on last col (table edge). */
.wh-batch-table--bordered .wh-btd,
.wh-batch-table--bordered .wh-bth { border-right: 1px solid var(--mp-border-default); }
.wh-batch-table--bordered .wh-btd:last-child,
.wh-batch-table--bordered .wh-bth:last-child { border-right: none; }
.wh-batch-table tbody tr:hover .wh-btd { background: var(--mp-background-neutral-hovered); }
.wh-batch-group-row { cursor: pointer; }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: auto; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0 0 var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Sticky columns (Products) */
.detail-tabs :deep(.erp-th:first-child) { position: sticky; left: 0; z-index: 4; background: var(--mp-background-neutral-subtle); }
.detail-tabs :deep(.erp-td:first-child) { position: sticky; left: 0; z-index: 1; background: inherit; }
.detail-tabs :deep(.erp-tr:hover .erp-td:first-child) { background: var(--mp-background-neutral-hovered); }
.detail-tabs :deep(.erp-table-wrapper.is-overflowing:not(.wh-scroll-start) .erp-th:first-child),
.detail-tabs :deep(.erp-table-wrapper.is-overflowing:not(.wh-scroll-start) .erp-td:first-child) { box-shadow: inset -2px 0 var(--mp-border-default); }
.detail-tabs :deep(.erp-table-wrapper.wh-scroll-end .erp-th--fixed),
.detail-tabs :deep(.erp-table-wrapper.wh-scroll-end .erp-td--fixed) { position: static !important; box-shadow: none !important; }
</style>
