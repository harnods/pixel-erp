<script setup lang="ts">
/**
 * Subcon orders — Production module index. Lists work handed to an outside
 * vendor (roasting / co-packing), with where each order sits in its document
 * chain and how much has come back.
 *
 * Column rules:
 *   • Received — "received / ordered"; muted while nothing has come back yet.
 *   • Promised — "—" on a draft, which has no promise date yet; a late order
 *     shows the overdue day count beside the date.
 */
import {
  MpButton, MpButtonGroup, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import SubconMethodChip from '~/components/patterns/SubconMethodChip.vue'
import { formatDate } from '~/utils/date'
import {
  subconOrders, SUBCON_METHOD_LABEL, SUBCON_SCOPE_LABEL,
  overdueOrders, ordersDueWithin, componentsAtVendor, custodyBalance, orderLateDays,
  type SubconOrder, type SubconMethod, type SubconOrderStatus,
} from '~/data/subcon'
import { formatIDR } from '~/utils/currency'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const router = useRouter()

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'number',       label: t('Number'),        kind: 'number', sortable: true, sortType: 'text' },
  { key: 'productName',  label: t('Product'),       kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'vendorName',   label: t('Subcon vendor'), kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'method',       label: t('Method')                                                          },
  { key: 'scope',        label: t('Scope')                                                           },
  { key: 'qty',          label: t('Qty'),           align: 'right', sortable: true, sortType: 'number' },
  { key: 'received',     label: t('Received'),      align: 'right'                                   },
  { key: 'promisedDate', label: t('Promised date'), kind: 'date',   sortable: true, sortType: 'date' },
  { key: 'status',       label: t('Status'),        kind: 'status'                                   },
]

// ─── Filters ───────────────────────────────────────────────────────────────────
const METHOD_OPTIONS = (Object.keys(SUBCON_METHOD_LABEL) as SubconMethod[])
  .map(m => ({ value: m, label: t(SUBCON_METHOD_LABEL[m]) }))

const STATUS_OPTIONS: { value: SubconOrderStatus; label: string }[] = [
  { value: 'draft',            label: t('Draft')            },
  { value: 'material sent',    label: t('Material sent')    },
  { value: 'pending approval', label: t('Pending approval') },
  { value: 'fee outstanding',  label: t('Fee outstanding')  },
  { value: 'discrepancy',      label: t('Discrepancy')      },
  { value: 'overdue',          label: t('Overdue')          },
]

const methodFilter = ref('')
const statusFilter = ref('')

// ─── Rows / table state ────────────────────────────────────────────────────────
const previewMode = ref<'data' | 'empty'>('data')
const rows = computed<SubconOrder[]>(() => (previewMode.value === 'empty' ? [] : subconOrders))

/**
 * Summary bar — the four things that go wrong on subcon work, in the order you
 * would want to hear them: the vendor is late, the vendor is nearly late, your
 * stock is sitting at the vendor's site, and output is still owed back.
 *
 * Follows the purchase-invoices stats bar exactly (title / period / figure /
 * count link). The figures are counts and quantities rather than money because a
 * subcon order carries no invoiced value of its own — the money on it is the
 * component stock in the vendor's custody, which is the one card that shows IDR.
 *
 * Every card is empty-safe: the preview's empty state zeroes them out rather
 * than reporting stale figures against a table showing nothing.
 */
const hasData = computed(() => previewMode.value !== 'empty')

const overdue = computed(() => (hasData.value ? overdueOrders() : []))
const overdueWorst = computed(() =>
  overdue.value.reduce((worst, o) => Math.max(worst, orderLateDays(o)), 0))

const dueSoon = computed(() => (hasData.value ? ordersDueWithin(7) : []))

const atVendor = computed(() => (hasData.value ? componentsAtVendor() : []))
const atVendorValue = computed(() => atVendor.value.reduce((sum, l) => sum + l.balanceValue, 0))
const atVendorOrders = computed(() => new Set(atVendor.value.map(l => l.orderId)).size)

/** Ordered but not yet returned by the vendor — output still owed. */
const awaitingReturn = computed(() =>
  hasData.value ? subconOrders.filter(o => o.stage < 5 && o.receivedQty < o.qty) : [])
const awaitingReturnQty = computed(() =>
  awaitingReturn.value.reduce((sum, o) => sum + (o.qty - o.receivedQty), 0))

/** Pluralised count line under each figure — "1 order" / "4 orders". */
function countLabel(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? t(one) : t(many)}`
}

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<SubconOrder>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.number.toLowerCase().includes(s)
      || row.productName.toLowerCase().includes(s)
      || row.vendorName.toLowerCase().includes(s)
      || row.documents.some(d => d.toLowerCase().includes(s))
    const matchesMethod = !methodFilter.value || row.method === methodFilter.value
    const matchesStatus = !statusFilter.value || row.status === statusFilter.value
    return matchesSearch && matchesMethod && matchesStatus
  },
})

watch([methodFilter, statusFilter], () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || !!methodFilter.value || !!statusFilter.value)
function clearFilters() {
  search.value = ''
  methodFilter.value = ''
  statusFilter.value = ''
}

// ─── Column show/hide ──────────────────────────────────────────────────────────
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, true])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))

// ─── Display helpers ───────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

/** An order badge label that reads naturally per status (the badge colour is mapped). */
const STATUS_LABEL: Record<SubconOrderStatus, string> = {
  draft: 'Draft',
  'material sent': 'Material sent',
  'pending approval': 'Pending approval',
  'fee outstanding': 'Fee outstanding',
  discrepancy: 'Discrepancy',
  overdue: 'Overdue return',
}
const STATUS_TYPE: Record<SubconOrderStatus, 'completed' | 'announcement' | 'information' | 'warning' | 'critical'> = {
  draft: 'announcement',
  'material sent': 'completed',
  'pending approval': 'information',
  'fee outstanding': 'warning',
  discrepancy: 'critical',
  overdue: 'critical',
}

// ─── Export ────────────────────────────────────────────────────────────────────
const exportOpen = ref(false)
const exportColumns = columns.map(c => c.label)

// ─── First-load skeleton ───────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 900) })

function viewDetails(row: SubconOrder) { router.push(`/subcon-orders/${row.id}`) }
function createOrder() { router.push('/subcon-orders/new') }

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    :search="search"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Summary ── -->
    <template #stats>
      <div class="stats-section">

        <!-- The vendor has missed the date it promised the goods back. -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Overdue') }}</div>
          <div class="stat-period">{{ t('Past promised return date') }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--danger': overdue.length > 0 }">{{ overdue.length }}</div>
          <span class="stat-link">
            {{ overdueWorst > 0
              ? `${t('Up to')} ${overdueWorst} ${overdueWorst === 1 ? t('day late') : t('days late')}`
              : t('None late') }}
          </span>
        </div>

        <!-- Not late yet, but close enough to chase. -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Due this week') }}</div>
          <div class="stat-period">{{ t('Next 7 days') }}</div>
          <div class="stat-amount">{{ dueSoon.length }}</div>
          <span class="stat-link">{{ countLabel(dueSoon.length, 'order', 'orders') }}</span>
        </div>

        <!-- Company stock physically held at a vendor's site — the money card. -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Components at vendor') }}</div>
          <div class="stat-period">{{ t('Sent, not yet consumed') }}</div>
          <div class="stat-amount">{{ formatIDR(atVendorValue) }}</div>
          <span class="stat-link">
            {{ countLabel(atVendor.length, 'component', 'components') }} ·
            {{ countLabel(atVendorOrders, 'order', 'orders') }}
          </span>
        </div>

        <!-- Output the vendor still owes back. -->
        <div class="stat-card">
          <div class="stat-title">{{ t('Awaiting return') }}</div>
          <div class="stat-period">{{ t('Output still with vendors') }}</div>
          <div class="stat-amount">{{ awaitingReturnQty.toLocaleString('id-ID') }}</div>
          <span class="stat-link">{{ countLabel(awaitingReturn.length, 'order', 'orders') }}</span>
        </div>

      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="sc-method" v-model="methodFilter" :placeholder="t('Method')" :options="METHOD_OPTIONS" />
        <ErpFilterSelect id="sc-status" v-model="statusFilter" :placeholder="t('Status')" :options="STATUS_OPTIONS" width="200px" />
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="sc-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
          </MpTooltip>
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- ── Number — opens the order's document chain ── -->
    <template #cell-number="{ value, row }">
      <span class="cell-link cell-text" @click.stop="viewDetails(row as unknown as SubconOrder)">{{ value }}</span>
    </template>

    <!-- ── Product — name over the BOM it was configured from ── -->
    <template #cell-productName="{ value, row }">
      <div class="sc-stack">
        <span class="sc-stack__name">{{ value }}</span>
        <span class="sc-stack__sub">{{ (row as unknown as SubconOrder).bomNumber }}</span>
      </div>
    </template>

    <!-- ── Method — Basic / Resupply / Dropship ── -->
    <template #cell-method="{ value }">
      <SubconMethodChip :method="(value as SubconMethod)" />
    </template>

    <!-- ── Scope — finished good vs a single component process ── -->
    <template #cell-scope="{ value }">
      {{ t(SUBCON_SCOPE_LABEL[value as keyof typeof SUBCON_SCOPE_LABEL]) }}
    </template>

    <!-- ── Qty ── -->
    <template #cell-qty="{ value, row }">
      {{ formatNum(value as number) }} {{ (row as unknown as SubconOrder).unit }}
    </template>

    <!-- ── Received — received / ordered, muted until something comes back ── -->
    <template #cell-received="{ row }">
      <span :class="{ 'sc-muted': (row as unknown as SubconOrder).receivedQty === 0 }">
        {{ formatNum((row as unknown as SubconOrder).receivedQty) }} / {{ formatNum((row as unknown as SubconOrder).qty) }}
      </span>
    </template>

    <!-- ── Promised date — em dash on a draft; overdue count when late ── -->
    <template #cell-promisedDate="{ row }">
      <span v-if="!(row as unknown as SubconOrder).promisedDate" class="sc-muted">—</span>
      <span v-else class="sc-promised">
        {{ formatDate((row as unknown as SubconOrder).promisedDate) }}
        <span v-if="(row as unknown as SubconOrder).lateDays > 0" class="sc-late">
          +{{ (row as unknown as SubconOrder).lateDays }}d
        </span>
      </span>
    </template>

    <!-- ── Status badge ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge
        :status="(value as string)"
        :label="t(STATUS_LABEL[value as SubconOrderStatus])"
        :type="STATUS_TYPE[value as SubconOrderStatus]"
      />
    </template>

    <!-- ── Actions kebab (sticky right) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`sc-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as SubconOrder)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="router.push('/subcon-custody')">{{ t('View custody') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No subcon orders') }}</p>
        <p class="empty-full-desc">{{ t('Create a subcon order to send production work to an outside vendor.') }}</p>
        <MpButton variant="secondary" is-rounded @click="createOrder">{{ t('Subcon order') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <ExportModal
    :open="exportOpen"
    :title="t('Export subcon orders')"
    entity-label="subcon orders"
    :columns="exportColumns"
    :total="total"
    @close="exportOpen = false"
    @export="exportOpen = false"
  />

  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>
/* ── Summary bar ────────────────────────────────────────────────────────────
   Same card anatomy as the purchase-invoices stats bar, so the two indexes read
   as one family: title, period, figure, count line, dividers between cards. */
.stats-section {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: flex-start;
}
.stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}
.stat-period {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-2xl, 32px);
  white-space: nowrap;
}
.stat-amount--danger { color: var(--mp-text-danger); }
/* Not a link — these figures have no drill-through yet, so the line is plain
   text rather than styling something unclickable as though it were a link. */
.stat-link {
  display: inline-flex;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: var(--mp-sizes-4\.5, 18px); height: var(--mp-sizes-4\.5, 18px);
  padding: 0; border: none; background: transparent; cursor: pointer;
  color: var(--mp-text-subtle, #75808f);
}
.search-clear-btn:hover { color: var(--mp-text-default); }

/* ── Cells ──────────────────────────────────────────────────────────────── */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sc-muted { color: var(--mp-text-secondary); }

/* Product cell — name over the source BOM */
.sc-stack { display: flex; flex-direction: column; min-width: 0; }
.sc-stack__name { color: var(--mp-text-default); white-space: normal; }
.sc-stack__sub {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

/* Promised date — the overdue count rides beside the date */
.sc-promised { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5); }
.sc-late {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-critical, var(--mp-text-danger, #a8352d));
}

/* ── Full empty state ───────────────────────────────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
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
</style>
