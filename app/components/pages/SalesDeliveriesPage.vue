<script setup lang="ts">
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import { salesDeliveries } from '~/data'
import type { SalesDelivery } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',              label: 'Date',              width: '120px'                                 },
  { key: 'number',            label: 'Number',            width: '210px', sortable: true                 },
  { key: 'processed',         label: '',                  width: '44px',  align: 'center', noHeader: true },
  { key: 'customerName',      label: 'Customer',          width: '240px', sortable: true                 },
  { key: 'fulfillmentStatus', label: 'Fulfillment status',width: '180px'                                 },
  { key: 'billingStatus',     label: 'Billing status',    width: '160px'                                 },
  { key: 'total',             label: 'Total',             width: '160px', align: 'right', sortable: true },
  { key: 'tags',              label: 'Tags',              width: '160px'                                 },
]

// ─── Row type + flatten ─────────────────────────────────────────────────────────
type Row = SalesDelivery & { customerName: string }

// Prototype preview toggle (FAB, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : salesDeliveries.map(sd => ({ ...sd, customerName: sd.customer.name })),
)

// ─── Second quick filter (Billing status) — combined inside filterFn ────────────
// useTableState owns a single `statusFilter` (used here for Fulfillment status);
// Billing status is a local ref read inside filterFn so the `filtered` computed
// tracks it reactively.
const billingFilter = ref('')

// ─── Table state ──────────────────────────────────────────────────────────────
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s, fulfillment) =>
    (String(row.number).includes(s) || row.customerName.toLowerCase().includes(s)) &&
    (!fulfillment || row.fulfillmentStatus === fulfillment) &&
    (!billingFilter.value || row.billingStatus === billingFilter.value),
})

// Billing filter change → back to page 1 (useTableState already watches statusFilter)
watch(billingFilter, () => setPage(1))

// ─── Filter options ───────────────────────────────────────────────────────────
// Quick-filter options — NO "All …" entry; clearing (x) resets to show-all.
const fulfillmentOptions = [
  { label: 'In transit', value: 'in transit' },
  { label: 'Direct',     value: 'direct'     },
  { label: 'Delivered',  value: 'delivered'  },
]

const billingOptions = [
  { label: 'Unbilled', value: 'unbilled' },
  { label: 'Invoiced', value: 'invoiced' },
]

const fulfillmentLabel = computed(
  () => fulfillmentOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)
const billingLabel = computed(
  () => billingOptions.find(o => o.value === billingFilter.value)?.label ?? '',
)

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ────
const loading = ref(true)
onMounted(() => {
  setTimeout(() => { loading.value = false }, 1200)
})

// Empty-state illustration — public path (drop the file at app/public/illustrations/)
const emptyIllustration = '/illustrations/empty-folder.png'

// Reset all filters (from the inline "Clear all filters" empty-state link)
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  billingFilter.value = ''
}
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="!!search || !!statusFilter || !!billingFilter"
    has-checkbox
    :context-label="(row) => `Sales Delivery #${row.number}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @clear-filters="clearFilters"
  >

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Fulfillment + Billing status selects (MpSelect + MpPopover) + All filters -->
      <div class="filter-left">
        <!-- Fulfillment status -->
        <MpPopover id="sd-fulfillment-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="sd-fulfillment-select"
              placeholder="Fulfillment status"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ fulfillmentLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in fulfillmentOptions"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Billing status -->
        <MpPopover id="sd-billing-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="sd-billing-select"
              placeholder="Billing status"
              :model-value="billingFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="billingFilter = ''"
            >
              <option v-if="billingFilter" :value="billingFilter">{{ billingLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in billingOptions"
                :key="opt.value"
                :is-active="opt.value === billingFilter"
                @click="billingFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
          All filters
        </button>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="tt-airene" label="Ask Airene" placement="bottom" use-portal>
          <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
          </button>
          </MpTooltip>
          <!-- Column settings -->
          <MpTooltip id="tt-columns" label="Column settings" placement="bottom" use-portal>
          <button class="filter-icon-btn" aria-label="Column settings">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M6.97345 1.26335C7.1777 1.25434 7.38659 1.25 7.6 1.25H12.4C12.6134 1.25 12.8223 1.25434 13.0265 1.26335C13.0315 1.26352 13.0365 1.26374 13.0415 1.26401C14.8152 1.34425 16.2378 1.77715 17.2303 2.76967C18.3398 3.87914 18.75 5.52603 18.75 7.6V12.4C18.75 14.474 18.3398 16.1209 17.2303 17.2303C16.2378 18.2229 14.8152 18.6558 13.0415 18.736C13.0365 18.7363 13.0316 18.7365 13.0266 18.7367C12.8223 18.7457 12.6134 18.75 12.4 18.75H7.6C7.38658 18.75 7.17769 18.7457 6.97344 18.7367C6.96845 18.7365 6.96347 18.7363 6.95851 18.736C5.1848 18.6557 3.76219 18.2228 2.76967 17.2303C1.6602 16.1209 1.25 14.474 1.25 12.4V7.6C1.25 5.52603 1.6602 3.87914 2.76967 2.76967C3.76219 1.77715 5.18479 1.34425 6.9585 1.26401C6.96347 1.26374 6.96845 1.26352 6.97345 1.26335ZM6.25 2.82736C5.10607 2.97282 4.34147 3.31919 3.83033 3.83033C3.1398 4.52086 2.75 5.67397 2.75 7.6V12.4C2.75 14.326 3.1398 15.4791 3.83033 16.1697C4.34147 16.6808 5.10607 17.0272 6.25 17.1726V2.82736ZM7.75 17.25V2.75H12.25V17.25H7.75ZM13.75 17.1726C14.8939 17.0272 15.6585 16.6808 16.1697 16.1697C16.8602 15.4791 17.25 14.326 17.25 12.4V7.6C17.25 5.67397 16.8602 4.52086 16.1697 3.83033C15.6585 3.31919 14.8939 2.97282 13.75 2.82736V17.1726Z" fill="currentColor"/>
            </svg>
          </button>
          </MpTooltip>
          <!-- Export -->
          <MpTooltip id="tt-export" label="Export" placement="bottom" use-portal>
          <button class="filter-icon-btn" aria-label="Export">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M9.46959 1.46967C9.76249 1.17678 10.2374 1.17678 10.5303 1.46967L13.2103 4.14967C13.5031 4.44256 13.5031 4.91744 13.2103 5.21033C12.9174 5.50322 12.4425 5.50322 12.1496 5.21033L10.7499 3.81066L10.7499 14C10.7499 14.4142 10.4141 14.75 9.99992 14.75C9.58571 14.75 9.24992 14.4142 9.24992 14L9.24992 3.81066L7.85025 5.21033C7.55736 5.50322 7.08249 5.50322 6.78959 5.21033C6.4967 4.91744 6.4967 4.44256 6.78959 4.14967L9.46959 1.46967ZM6.74991 7.59397C6.75618 8.00814 6.42551 8.34896 6.01134 8.35523C4.89312 8.37214 4.40103 8.44902 4.04508 8.63928C3.61773 8.8677 3.26772 9.21772 3.03929 9.64507C2.91834 9.87135 2.83764 10.1672 2.79453 10.674C2.75063 11.1901 2.75 11.8532 2.75 12.8C2.75 13.338 2.75031 14.0116 2.79529 14.6356C2.81773 14.947 2.85042 15.232 2.89613 15.4717C2.94371 15.7212 2.99719 15.8761 3.03929 15.9549C3.26772 16.3823 3.61773 16.7323 4.04508 16.9607C4.27137 17.0816 4.56722 17.1623 5.07403 17.2055C5.59016 17.2494 6.25324 17.25 7.2 17.25H12.8C13.7468 17.25 14.4098 17.2494 14.926 17.2055C15.4328 17.1623 15.7286 17.0816 15.9549 16.9607C16.3823 16.7323 16.7323 16.3823 16.9607 15.9549C17.0028 15.8761 17.0563 15.7212 17.1039 15.4717C17.1496 15.232 17.1823 14.947 17.2047 14.6356C17.2497 14.0116 17.25 13.338 17.25 12.8C17.25 11.8532 17.2494 11.1901 17.2055 10.674C17.1624 10.1672 17.0817 9.87135 16.9607 9.64507C16.7323 9.21772 16.3823 8.8677 15.9549 8.63928C15.599 8.44902 15.1069 8.37214 13.9887 8.35523C13.5745 8.34896 13.2438 8.00814 13.2501 7.59397C13.2564 7.17981 13.5972 6.84914 14.0113 6.8554C15.1044 6.87193 15.9457 6.93351 16.662 7.3164C17.351 7.68467 17.9153 8.24898 18.2836 8.93797C18.5405 9.41859 18.6487 9.94312 18.7001 10.5469C18.75 11.1341 18.75 11.861 18.75 12.7662V12.81C18.75 13.3388 18.75 14.0612 18.7008 14.7434C18.676 15.0874 18.6379 15.4351 18.5773 15.7527C18.5186 16.0605 18.4304 16.3873 18.2836 16.662C17.9153 17.351 17.351 17.9153 16.662 18.2836C16.1814 18.5405 15.6569 18.6487 15.0531 18.7001C14.4659 18.75 13.7389 18.75 12.8337 18.75H7.16634C6.26106 18.75 5.53409 18.75 4.9469 18.7001C4.34314 18.6487 3.81861 18.5405 3.33798 18.2836C2.64899 17.9153 2.08468 17.351 1.71641 16.662C1.56958 16.3873 1.48138 16.0605 1.42268 15.7527C1.36213 15.4351 1.32396 15.0874 1.29917 14.7434C1.25 14.0612 1.25 13.3388 1.25 12.81L1.25 12.7663C1.24999 11.861 1.24999 11.1341 1.29993 10.5469C1.35129 9.94312 1.45951 9.41859 1.71641 8.93797C2.08468 8.24898 2.64899 7.68467 3.33798 7.3164C4.05432 6.93351 4.89561 6.87193 5.98866 6.8554C6.40282 6.84914 6.74365 7.17981 6.74991 7.59397Z" fill="currentColor"/>
            </svg>
          </button>
          </MpTooltip>
        </div>

        <!-- Pill search -->
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            placeholder="Search..."
          />
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number — "View details" on row hover (record has a detail page) ── -->
    <template #cell-number="{ value }">
      <div class="cell-with-action">
        <span class="cell-text cell-number">Sales Delivery #{{ value }}</span>
        <button class="row-hover-btn" @click.stop>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Cell: Processed in fulfillment — icon-only column (no header), tooltip on hover.
         Hidden for "Direct" deliveries (handed over directly, no fulfillment step). ── -->
    <template #cell-processed="{ row }">
      <MpTooltip
        v-if="row.fulfillmentStatus !== 'direct'"
        :id="`tt-fulfillment-${row.id}`"
        label="Processed in Fulfillment"
        placement="top"
        use-portal
      >
        <button class="row-truck-btn" aria-label="Processed in Fulfillment">
          <MpIcon name="truck" size="sm" />
        </button>
      </MpTooltip>
    </template>

    <!-- ── Cell: Customer — "Open preview" on row hover (customer/vendor always previewable) ── -->
    <template #cell-customerName="{ value }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.2"/>
            <path d="M4.5 1.5v9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span class="row-hover-btn__label">OPEN PREVIEW</span>
        </button>
      </div>
    </template>

    <!-- ── Cell: Fulfillment status ── -->
    <template #cell-fulfillmentStatus="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Billing status ── -->
    <template #cell-billingStatus="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Total ── -->
    <template #cell-total="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Tags — clamped to 2 lines, "More" link on overflow ── -->
    <template #cell-tags="{ value }">
      <ErpTagList :tags="(value as string[])" />
    </template>

    <!-- ── Full empty state (no sales deliveries yet) — illustration + title + CTA ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No sales deliveries</p>
        <p class="empty-full-desc">Sales deliveries will appear here.</p>
        <button class="empty-cta">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          New sales delivery
        </button>
      </div>
    </template>

    <!-- ── Actions — kebab → MpPopover dropdown (View details always first;
         share-via group separated by a divider) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`sd-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
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
            <MpPopoverListItem>View details</MpPopoverListItem>
            <MpPopoverListItem>Create sales invoice</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem>Share via WhatsApp</MpPopoverListItem>
            <MpPopoverListItem>Share via email</MpPopoverListItem>
            <MpPopoverListItem>Copy link</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

  </ErpTablePage>

  <!-- ── Prototype preview FAB (bottom-right): toggle data vs empty-state view ── -->
  <div class="preview-fab-wrap">
    <MpPopover id="preview-fab" placement="top-end" use-portal :is-keep-alive="false">
      <MpPopoverTrigger>
        <button class="preview-fab" aria-label="Preview options">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
      </MpPopoverTrigger>
      <MpPopoverContent is-dark is-close-on-select :class="css({ minWidth: '220px' })">
        <MpPopoverList>
          <MpPopoverListItem
            :class="css({ color: 'white', _hover: { background: 'transparent' } })"
            @click="previewMode = 'data'"
          >
            View table with data
          </MpPopoverListItem>
          <MpPopoverListItem
            :class="css({ color: 'white', _hover: { background: 'transparent' } })"
            @click="previewMode = 'empty'"
          >
            View empty state
          </MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
/* ── Cell helpers ───────────────────────────────────────────────────────── */
.cell-number {
  color: var(--mp-text-default);
}

/* Cell with hover action button (View details / Open preview) */
.cell-with-action {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.row-hover-btn {
  position: absolute;
  right: 0;
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
  white-space: nowrap;
  line-height: 1;
}

.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
}

:global(.erp-tr:hover .row-hover-btn) {
  display: flex;
}

/* Truck icon button — "Processed in Fulfillment" column */
.row-truck-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-7, 28px);
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.row-truck-btn:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

.row-kebab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Prototype preview FAB ──────────────────────────────────────────────── */
.preview-fab-wrap {
  position: fixed;
  right: var(--mp-spacing-6);
  bottom: var(--mp-spacing-6);
  z-index: 1000;
}
.preview-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-12, 48px);
  height: var(--mp-sizes-12, 48px);
  border: none;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse);
  color: var(--mp-text-inverse);
  box-shadow: var(--mp-shadows-lg);
  cursor: pointer;
  transition: transform 0.1s ease;
}
.preview-fab:hover { transform: scale(1.05); }

/* ── Full empty state ───────────────────────────────────────────────────── */
.empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-illustration {
  width: auto;
  height: 240px;
  object-fit: contain;
  margin-bottom: 0;
}
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.empty-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
}
.empty-cta:hover { background: var(--mp-background-neutral-hovered); }

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
}

.filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.filter-all-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }

.filter-btn-group {
  display: flex;
  align-items: center;
}

.filter-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}

.filter-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
</style>
