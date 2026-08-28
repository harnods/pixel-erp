<script setup lang="ts">
/**
 * CRM (Qontak) — Orders (/crm/orders). Duplicated from the ERP Sales orders index
 * (SalesOrdersPage.vue): same columns, number/date formats, filter bar, column
 * settings, actions kebab and behaviour — MINUS Balance due & Tags, PLUS an Owner
 * column (employee avatar + name from the HR directory). Reads the CRM mini-DB.
 */
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css, toast,
} from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { crmOrders, type CrmOrder, type OrderStatus } from '~/data/crm'
import { employees } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const router = useRouter()
function soon(what: string) { infoToast(`${what} — coming soon`) }
function viewDetails(id: string) { router.push(`/crm/orders/${id}`) }

function ownerPhoto(name: string): string | undefined { return employees.find((e) => e.fullName === name)?.photo }
function ownerInitials(name: string): string { return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() }

const STATUS: Record<OrderStatus, { label: string; type: 'completed' | 'warning' | 'information' | 'announcement' }> = {
  'draft':            { label: 'Draft',            type: 'announcement' },
  'awaiting-payment': { label: 'Awaiting payment', type: 'warning' },
  'paid':             { label: 'Paid',             type: 'completed' },
  'fulfilled':        { label: 'Fulfilled',        type: 'information' },
  'cancelled':        { label: 'Cancelled',        type: 'announcement' },
}
const statusOptions = Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label }))
const statusLabel = computed(() => statusOptions.find((o) => o.value === statusFilter.value)?.label ?? '')

// ── Columns (mirror Sales orders; Balance due & Tags removed, Owner added) ──
const columns: TableColumn[] = [
  { key: 'date',         label: t('Date'),     width: '120px',                                sortType: 'date'   },
  { key: 'id',           label: t('Number'),   width: '160px', sortable: true,                sortType: 'text'   },
  { key: 'customerName', label: t('Customer'), width: '240px', sortable: true,                sortType: 'text'   },
  { key: 'dueDate',      label: t('Due date'), width: '120px',                                sortType: 'date'   },
  { key: 'status',       label: t('Status'),   width: '180px',                                sortType: 'text'   },
  { key: 'amount',       label: t('Total'),    width: '160px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'owner',        label: t('Owner'),    width: '200px',                                sortType: 'text'   },
]

function addDays(iso: string, n: number): string {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}
type Row = CrmOrder & { customerName: string; dueDate: string }
const rows = computed<Row[]>(() => crmOrders.map((o) => ({ ...o, customerName: o.customer, dueDate: addDays(o.date, 14) })))

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s, status) => {
    const matchesSearch = row.id.toLowerCase().includes(s) || row.customerName.toLowerCase().includes(s) || row.product.toLowerCase().includes(s)
    return matchesSearch && (!status || row.status === status)
  },
})
sortKey.value = 'date'; sortDir.value = 'desc'

// First-load skeleton (ERP guideline: 3 solid rows, ~1.2s).
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ── Date format — identical to Sales orders (id-ID dd/mm/yyyy) ──
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function clearFilters() { search.value = ''; statusFilter.value = '' }

// Column show/hide (first column always on)
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Orders</h1>
      </div>
      <div class="crm-titlebar__right">
        <button class="crm-btn crm-btn--primary" type="button" @click="soon('New order')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
          New order
        </button>
      </div>
    </header>

    <div class="crm-tablewrap">
      <ErpTablePage
        :columns="visibleColumns"
        :rows="(paginated as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        has-checkbox
        filter-empty-label="order"
        :search="search"
        :has-active-filter="!!search || !!statusFilter"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @hide-column="hideColumn"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <MpPopover id="crm-order-status-filter" is-close-on-select>
              <MpPopoverTrigger>
                <MpSelect id="crm-order-status-select" :placeholder="t('Status')" :model-value="statusFilter" is-clearable :class="css({ width: '160px' })" @mousedown.prevent @clear="statusFilter = ''">
                  <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="opt in statusOptions" :key="opt.value" :is-active="opt.value === statusFilter" @click="statusFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
            <button class="filter-all-btn" @click="soon('All filters')">
              <MpIcon name="filter" size="sm" />
              {{ t('All filters') }}
            </button>
          </div>

          <div class="filter-right">
            <div class="filter-btn-group">
              <MpTooltip id="crm-order-tt-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
                <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                    <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                  </svg>
                </button>
              </MpTooltip>
              <ColumnSettingsMenu id="crm-order-columns" :items="columnItems" :visibility="columnVisibility" />
              <MpTooltip id="crm-order-tt-export" :label="t('Export')" placement="bottom" use-portal>
                <button class="filter-icon-btn" :aria-label="t('Export')" @click="soon('Export')">
                  <MpIcon name="download" size="md" />
                </button>
              </MpTooltip>
            </div>

            <div class="filter-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')">
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
        </template>

        <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
        <template #cell-id="{ row }">
          <a class="cell-link cell-text cell-number" @click.stop="viewDetails((row as Row).id)">{{ (row as Row).id }}</a>
        </template>
        <template #cell-customerName="{ value }">
          <a class="cell-link cell-text" @click.stop>{{ value }}</a>
        </template>
        <template #cell-dueDate="{ value }">{{ formatDate(value as string) }}</template>
        <template #cell-status="{ row }">
          <ErpStatusBadge :status="(row as Row).status" :label="STATUS[(row as Row).status].label" :type="STATUS[(row as Row).status].type" />
        </template>
        <template #cell-amount="{ value }">{{ formatIDR(value as number) }}</template>
        <template #cell-owner="{ row }">
          <span class="owner-cell">
            <span class="owner-avatar">
              <img v-if="ownerPhoto((row as Row).owner)" :src="ownerPhoto((row as Row).owner)" :alt="(row as Row).owner">
              <template v-else>{{ ownerInitials((row as Row).owner) }}</template>
            </span>
            <span class="cell-text">{{ (row as Row).owner }}</span>
          </span>
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`crm-order-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="row-kebab" :aria-label="t('More actions')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="viewDetails((row as Row).id)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Edit order')">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Duplicate')">{{ t('Duplicate') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
.crm-tablewrap {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 0;
}
.crm-tablewrap :deep(.erp-table-page) { height: 100%; }

/* Cell helpers — mirror Sales orders (all regular weight). */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-number { color: var(--mp-text-default) !important; }
.owner-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.owner-avatar { flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); font-size: 11px; }
.owner-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* Filter bar — copied from Sales orders. */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: 999px; }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-text-subtle); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
</style>
