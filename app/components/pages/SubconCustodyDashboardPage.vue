<script setup lang="ts">
/**
 * Subcon custody & WIP dashboard — Reports › Subcon.
 *
 * The one screen that answers "where is my stock, and whose books is it on?"
 * while work sits at an outside vendor. Two tables, deliberately shown together
 * rather than behind tabs, because they answer halves of the same question:
 *
 *   • Subcon orders    — how far each order has moved along its document chain,
 *                        what came back, and what is blocking it.
 *   • Material custody — company-owned stock physically at a vendor: sent,
 *                        consumed into output, returned, and still outstanding.
 *
 * Every figure derives from `~/data/subcon` — this page renders, it does not
 * compute business rules of its own.
 */
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import SubconMethodChip from '~/components/patterns/SubconMethodChip.vue'
import SubconStageChain from '~/components/patterns/SubconStageChain.vue'
import { formatDate } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import {
  subconOrders, subconCustody, custodyBalance,
  ordersInFlight, methodBreakdown, overdueOrders, pendingApprovalOrders,
  needsAttentionOrders, custodyValueTotal,
  SUBCON_METHOD_LABEL,
  type SubconOrder, type SubconCustodyLine, type SubconMethod, type SubconOrderStatus,
} from '~/data/subcon'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const router = useRouter()

// ─── Scenario ──────────────────────────────────────────────────────────────────
const previewMode = ref<'data' | 'empty'>('data')

// ─── KPI cards ─────────────────────────────────────────────────────────────────
// Each KPI names the specific record behind it wherever there is exactly one —
// a bare count sends the reader hunting through the table for the cause.
const kpis = computed(() => {
  if (previewMode.value === 'empty') return []
  const inFlight = ordersInFlight()
  const overdue = overdueOrders()
  const pending = pendingApprovalOrders()
  const attention = needsAttentionOrders()

  return [
    {
      key: 'in-flight',
      title: t('Orders in flight'),
      caption: t('Not yet closed'),
      value: String(inFlight.length),
      tone: 'default' as const,
      note: methodBreakdown(inFlight),
      noteTone: 'muted' as const,
    },
    {
      key: 'overdue',
      title: t('Overdue at vendor'),
      caption: t('Past the promised return date'),
      value: String(overdue.length),
      tone: 'danger' as const,
      note: overdue.length === 1
        ? `${overdue[0]!.number} · ${t('promise missed by')} ${overdue[0]!.lateDays} ${t('days')}`
        : overdue.map(o => o.number).join(' · '),
      noteTone: 'danger' as const,
    },
    {
      key: 'pending',
      title: t('Pending inbound approval'),
      caption: t('Goods received, not yet posted'),
      value: String(pending.length),
      tone: 'default' as const,
      note: t('Inventory and journals are held until approved'),
      noteTone: 'muted' as const,
    },
    {
      key: 'attention',
      title: t('Needs attention'),
      caption: t('Blocked or short'),
      value: String(attention.length),
      tone: 'warning' as const,
      note: attention.map(o => `${o.number} · ${t(STATUS_LABEL[o.status])}`).join(' · '),
      noteTone: 'warning' as const,
    },
  ]
})

// ─── Status vocabulary (shared by both tables) ─────────────────────────────────
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

// ─── Orders table ──────────────────────────────────────────────────────────────
const orderColumns: TableColumn[] = [
  { key: 'number',       label: t('Order'),         kind: 'number',  sortable: true, sortType: 'text' },
  // Layout-only column: the chain is a fixed-size graphic (5 × 24px nodes + 4 ×
  // 14px links), so it takes an explicit width rather than a semantic `kind`.
  { key: 'chain',        label: t('Document chain'), width: '208px', noSkeleton: true                    },
  { key: 'productName',  label: t('Product'),       kind: 'name'                                      },
  { key: 'method',       label: t('Method')                                                           },
  { key: 'stageCaption', label: t('Where it is'),   kind: 'address'                                   },
  { key: 'received',     label: t('Received'),      align: 'right'                                    },
  { key: 'disposition',  label: t('Disposition')                                                      },
  { key: 'promisedDate', label: t('Promised date'), kind: 'date',    sortable: true, sortType: 'date' },
  { key: 'status',       label: t('Status'),        kind: 'status'                                    },
]

const METHOD_OPTIONS = (Object.keys(SUBCON_METHOD_LABEL) as SubconMethod[])
  .map(m => ({ value: m, label: t(SUBCON_METHOD_LABEL[m]) }))

const methodFilter = ref('')
const orderRows = computed<SubconOrder[]>(() => (previewMode.value === 'empty' ? [] : subconOrders))

const {
  search: orderSearch, currentPage: orderPage, paginated: orderPaginated,
  total: orderTotal, perPage: orderPerPage, setPage: setOrderPage,
  setPerPage: setOrderPerPage, sortKey: orderSortKey, sortDir: orderSortDir,
  toggleSort: toggleOrderSort,
} = useTableState<SubconOrder>(orderRows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.number.toLowerCase().includes(s)
      || row.vendorName.toLowerCase().includes(s)
      || row.documents.some(d => d.toLowerCase().includes(s))
    return matchesSearch && (!methodFilter.value || row.method === methodFilter.value)
  },
})
watch(methodFilter, () => setOrderPage(1))

const orderHasFilter = computed(() => !!orderSearch.value || !!methodFilter.value)
function clearOrderFilters() { orderSearch.value = ''; methodFilter.value = '' }

// ─── Custody table ─────────────────────────────────────────────────────────────
const custodyColumns: TableColumn[] = [
  { key: 'productName',  label: t('Material'),     kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'orderNumber',  label: t('Subcon order'), kind: 'number'                                     },
  { key: 'sourceLabel',  label: t('Supplied by'),  kind: 'address'                                    },
  { key: 'docNumber',    label: t('Document'),     kind: 'number'                                     },
  { key: 'sentQty',      label: t('Sent'),         align: 'right'                                     },
  { key: 'consumedQty',  label: t('Consumed'),     align: 'right'                                     },
  { key: 'returnedQty',  label: t('Returned'),     align: 'right'                                     },
  { key: 'balance',      label: t('Balance'),      align: 'right', sortable: true, sortType: 'number' },
  { key: 'balanceValue', label: t('Value'),        kind: 'amount', align: 'right'                     },
]

const custodyRows = computed<SubconCustodyLine[]>(() => (previewMode.value === 'empty' ? [] : [...subconCustody]))

const {
  search: custodySearch, currentPage: custodyPage, paginated: custodyPaginated,
  total: custodyTotal, perPage: custodyPerPage, setPage: setCustodyPage,
  setPerPage: setCustodyPerPage, sortKey: custodySortKey, sortDir: custodySortDir,
  toggleSort: toggleCustodySort,
} = useTableState<SubconCustodyLine>(custodyRows, {
  perPage: 25,
  filterFn: (row, s) => !s
    || row.productName.toLowerCase().includes(s)
    || row.orderNumber.toLowerCase().includes(s)
    || row.docNumber.toLowerCase().includes(s),
})

const custodyTotalValue = computed(() => (previewMode.value === 'empty' ? 0 : custodyValueTotal()))

// ─── Export ────────────────────────────────────────────────────────────────────
const exportOpen = ref(false)
const exportColumns = orderColumns.map(c => c.label)

// ─── First-load skeleton ───────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 900) })

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function openOrder(row: SubconOrder) { router.push(`/subcon-orders/${row.id}`) }

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="subcon-dash">

    <!-- ══ Subcon orders — chain progress, what came back, what is blocking ══ -->
    <ErpTablePage
      :columns="orderColumns"
      :rows="(orderPaginated as Record<string, unknown>[])"
      :total="orderTotal"
      :current-page="orderPage"
      :per-page="orderPerPage"
      :sort-key="orderSortKey"
      :sort-dir="orderSortDir"
      :loading="loading"
      :has-active-filter="orderHasFilter"
      :search="orderSearch"
      filter-empty-label="subcon order"
      @page-change="setOrderPage"
      @per-page-change="setOrderPerPage"
      @sort="toggleOrderSort"
      @clear-filters="clearOrderFilters"
    >
      <!-- ── KPI cards ── -->
      <template #stats>
        <div class="stats-section">
          <div v-for="k in kpis" :key="k.key" class="stat-card stat-card--bordered">
            <div class="stat-title">{{ k.title }}</div>
            <div class="stat-period">{{ k.caption }}</div>
            <div class="stat-amount" :class="`stat-amount--${k.tone}`">{{ k.value }}</div>
            <div class="stat-note" :class="`stat-note--${k.noteTone}`">{{ k.note || '—' }}</div>
          </div>
        </div>
      </template>

      <!-- ── Filter bar ── -->
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="scd-method" v-model="methodFilter" :placeholder="t('Method')" :options="METHOD_OPTIONS" />
        </div>
        <div class="filter-right">
          <MpButtonGroup class="filter-btn-group">
            <MpTooltip :label="t('Ask Airene')" placement="bottom">
              <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
            </MpTooltip>
            <MpTooltip :label="t('Export')" placement="bottom">
              <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
            </MpTooltip>
          </MpButtonGroup>
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="orderSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            <button v-if="orderSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="orderSearch = ''">
              <MpIcon name="close" size="sm" />
            </button>
          </div>
        </div>
      </template>

      <!-- ── Order number, over the documents raised so far ── -->
      <template #cell-number="{ value, row }">
        <div class="sc-stack">
          <span class="cell-link" @click.stop="openOrder(row as unknown as SubconOrder)">{{ value }}</span>
          <span class="sc-stack__sub">{{ (row as unknown as SubconOrder).documents.join(' · ') }}</span>
        </div>
      </template>

      <!-- ── Five-node document chain ── -->
      <template #cell-chain="{ row }">
        <SubconStageChain
          :stage="(row as unknown as SubconOrder).stage"
          :method="(row as unknown as SubconOrder).method"
        />
      </template>

      <template #cell-productName="{ value, row }">
        <div class="sc-stack">
          <span class="sc-stack__name">{{ value }}</span>
          <span class="sc-stack__sub">{{ formatNum((row as unknown as SubconOrder).qty) }} {{ (row as unknown as SubconOrder).unit }} · {{ (row as unknown as SubconOrder).vendorName }}</span>
        </div>
      </template>

      <template #cell-method="{ value }">
        <SubconMethodChip :method="(value as SubconMethod)" />
      </template>

      <template #cell-stageCaption="{ value }">
        <span class="sc-wrap">{{ value }}</span>
      </template>

      <template #cell-received="{ row }">
        <span :class="{ 'sc-muted': (row as unknown as SubconOrder).receivedQty === 0 }">
          {{ formatNum((row as unknown as SubconOrder).receivedQty) }} / {{ formatNum((row as unknown as SubconOrder).qty) }}
        </span>
      </template>

      <!-- ── QC disposition — only exists once goods have actually arrived ── -->
      <template #cell-disposition="{ row }">
        <span v-if="!(row as unknown as SubconOrder).disposition" class="sc-muted">—</span>
        <span v-else class="sc-disp">
          <span class="sc-disp__part sc-disp__part--accepted">{{ formatNum((row as unknown as SubconOrder).disposition!.accepted) }} {{ t('accepted') }}</span>
          <span v-if="(row as unknown as SubconOrder).disposition!.rework" class="sc-disp__part sc-disp__part--rework">{{ formatNum((row as unknown as SubconOrder).disposition!.rework) }} {{ t('rework') }}</span>
          <span v-if="(row as unknown as SubconOrder).disposition!.scrap" class="sc-disp__part sc-disp__part--scrap">{{ formatNum((row as unknown as SubconOrder).disposition!.scrap) }} {{ t('scrap') }}</span>
        </span>
      </template>

      <template #cell-promisedDate="{ row }">
        <span v-if="!(row as unknown as SubconOrder).promisedDate" class="sc-muted">—</span>
        <span v-else class="sc-promised">
          {{ formatDate((row as unknown as SubconOrder).promisedDate) }}
          <span v-if="(row as unknown as SubconOrder).lateDays > 0" class="sc-late">+{{ (row as unknown as SubconOrder).lateDays }}d</span>
        </span>
      </template>

      <template #cell-status="{ value }">
        <ErpStatusBadge
          :status="(value as string)"
          :label="t(STATUS_LABEL[value as SubconOrderStatus])"
          :type="STATUS_TYPE[value as SubconOrderStatus]"
        />
      </template>

      <template #empty>
        <div class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('Nothing at a vendor right now') }}</p>
          <p class="empty-full-desc">{{ t('Subcon orders appear here once work is sent out.') }}</p>
          <MpButton variant="secondary" is-rounded @click="router.push('/subcon-orders/new')">{{ t('Subcon order') }}</MpButton>
        </div>
      </template>
    </ErpTablePage>

    <!-- ══ Material custody — company stock physically held at a vendor ══ -->
    <section class="subcon-dash__section">
      <div class="subcon-dash__heading">
        <h2 class="subcon-dash__title">{{ t('Materials in vendor custody') }}</h2>
        <p class="subcon-dash__desc">
          {{ t('Company-owned stock that has left your warehouse but has not been consumed into an output yet — still on your books.') }}
        </p>
      </div>

      <ErpTablePage
        :columns="custodyColumns"
        :rows="(custodyPaginated as Record<string, unknown>[])"
        :total="custodyTotal"
        :current-page="custodyPage"
        :per-page="custodyPerPage"
        :sort-key="custodySortKey"
        :sort-dir="custodySortDir"
        :loading="loading"
        :has-active-filter="!!custodySearch"
        :search="custodySearch"
        filter-empty-label="material"
        no-row-hover
        @page-change="setCustodyPage"
        @per-page-change="setCustodyPerPage"
        @sort="toggleCustodySort"
        @clear-filters="custodySearch = ''"
      >
        <template #filters>
          <div class="filter-left">
            <span class="subcon-dash__total">
              {{ t('Total value in custody') }}
              <strong>{{ formatIDR(custodyTotalValue) }}</strong>
            </span>
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="custodySearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              <button v-if="custodySearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="custodySearch = ''">
                <MpIcon name="close" size="sm" />
              </button>
            </div>
          </div>
        </template>

        <template #cell-productName="{ value, row }">
          <div class="sc-stack">
            <span class="sc-stack__name">{{ value }}</span>
            <span class="sc-stack__sub">SKU {{ (row as unknown as SubconCustodyLine).sku }}</span>
          </div>
        </template>

        <template #cell-orderNumber="{ value, row }">
          <span class="cell-link" @click.stop="router.push(`/subcon-orders/${(row as unknown as SubconCustodyLine).orderId}`)">{{ value }}</span>
        </template>

        <template #cell-sourceLabel="{ value }">
          <span class="sc-wrap">{{ value }}</span>
        </template>

        <template #cell-sentQty="{ value, row }">
          {{ formatNum(value as number) }} {{ (row as unknown as SubconCustodyLine).unit }}
        </template>

        <!-- Consumed / returned read as "—" at zero: a hard 0 implies a measured
             result, where nothing has happened yet. -->
        <template #cell-consumedQty="{ value, row }">
          <span v-if="!value" class="sc-muted">—</span>
          <span v-else>{{ formatNum(value as number) }} {{ (row as unknown as SubconCustodyLine).unit }}</span>
        </template>

        <template #cell-returnedQty="{ value, row }">
          <span v-if="!value" class="sc-muted">—</span>
          <span v-else>{{ formatNum(value as number) }} {{ (row as unknown as SubconCustodyLine).unit }}</span>
        </template>

        <template #cell-balance="{ row }">
          <strong>{{ formatNum(custodyBalance(row as unknown as SubconCustodyLine)) }} {{ (row as unknown as SubconCustodyLine).unit }}</strong>
        </template>

        <template #cell-balanceValue="{ value }">{{ formatIDR(value as number) }}</template>

        <template #empty>
          <div class="empty-full">
            <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
            <p class="empty-full-title">{{ t('No materials at a vendor') }}</p>
            <p class="empty-full-desc">{{ t('Stock you transfer or dropship to a subcon vendor is tracked here until it is consumed or returned.') }}</p>
          </div>
        </template>
      </ErpTablePage>
    </section>

    <ExportModal
      :open="exportOpen"
      :title="t('Export subcon orders')"
      entity-label="subcon orders"
      :columns="exportColumns"
      :total="orderTotal"
      @close="exportOpen = false"
      @export="exportOpen = false"
    />

    <ScenarioFab v-model="previewMode" />
  </div>
</template>

<style scoped>
.subcon-dash { display: flex; flex-direction: column; }

/* 32px between the two report regions — the standard large region gap. */
.subcon-dash__section { margin-top: var(--mp-spacing-8); }

.subcon-dash__heading { margin-bottom: var(--mp-spacing-3); }
.subcon-dash__title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.subcon-dash__desc {
  margin: var(--mp-spacing-0\.5) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.subcon-dash__total {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.subcon-dash__total strong {
  margin-left: var(--mp-spacing-2);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  font-variant-numeric: tabular-nums;
}

/* ── KPI cards ──────────────────────────────────────────────────────────── */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: stretch; }
.stat-card {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-card:last-child { border-right: none; padding-right: 0; }

.stat-title {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.stat-period {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px);
  font-variant-numeric: tabular-nums;
}
.stat-amount--default { color: var(--mp-text-default); }
.stat-amount--danger { color: var(--mp-text-critical, var(--mp-text-danger, #a8352d)); }
.stat-amount--warning { color: var(--mp-text-warning, #b54708); }

.stat-note {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
}
.stat-note--muted { color: var(--mp-text-secondary); }
.stat-note--danger { color: var(--mp-text-critical, var(--mp-text-danger, #a8352d)); font-weight: var(--mp-font-weights-semi-bold); }
.stat-note--warning { color: var(--mp-text-warning, #b54708); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
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
.sc-muted { color: var(--mp-text-secondary); }
.sc-wrap { white-space: normal; }

.sc-stack { display: flex; flex-direction: column; min-width: 0; }
.sc-stack__name { color: var(--mp-text-default); white-space: normal; }
.sc-stack__sub {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
  white-space: normal;
}

/* Disposition — the three QC outcomes stacked, colour-coded by outcome */
.sc-disp { display: flex; flex-direction: column; }
.sc-disp__part {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}
.sc-disp__part--accepted { color: var(--mp-text-success, #18794e); }
.sc-disp__part--rework { color: var(--mp-text-warning, #b54708); }
.sc-disp__part--scrap { color: var(--mp-text-critical, var(--mp-text-danger, #a8352d)); }

.sc-promised { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5); }
.sc-late {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-critical, var(--mp-text-danger, #a8352d));
}

/* ── Empty state ────────────────────────────────────────────────────────── */
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
