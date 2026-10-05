<!-- prod-parity: jurnal-frontend-app/src/pages/dashboard/business-overview -->
<script setup lang="ts">
/**
 * Dashboard › Business performance — prod "Business overview" widget grid.
 * Default widgets + order from prod dummyWidget.json; wording from its i18n.json.
 * Figures come from app/data/businessPerformance.ts, which reads the same mock
 * data the Cash management / invoices / reports screens read (and asserts the
 * tie-outs). The layout — order, added/removed account widgets, per-widget
 * period and accounts — is persisted.
 */
import { ref, computed } from 'vue'
import {
  MpButton, MpIcon, MpTooltip, MpSegmentedControl, MpCheckbox,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton, MpModalOverlay,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR, formatMoney } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import {
  type BpWidget, BP_TITLES, BP_MAX_WIDGETS, BP_MAX_WATCHLIST, BP_RANGE_PERIODS, BP_LINE_PERIODS,
  loadBpLayout, saveBpLayout, bpPeriods,
  bpCashFlow, bpProfitLoss, bpReceivable, bpPayable, bpExpenses, bpWatchlist, bpWatchlistOptions,
  bpTopProducts, bpAccountOptions, bpAccountLine, type BarRow, type SummaryBox,
} from '~/data/businessPerformance'

const { t } = useLocale()
const router = useRouter()
const notInPrototype = () => infoToast(t('Not in this prototype'))

// ── Layout + mode ─────────────────────────────────────────────────────────────
const widgets = ref<BpWidget[]>(loadBpLayout())
const mode = ref<'view' | 'edit'>('view')
let beforeEdit: BpWidget[] = []
const clone = (w: BpWidget[]) => JSON.parse(JSON.stringify(w)) as BpWidget[]

function persistIfViewing() { if (mode.value === 'view') saveBpLayout(widgets.value) }
function onEditDashboard() { beforeEdit = clone(widgets.value); mode.value = 'edit' }
function cancelEdit() { widgets.value = clone(beforeEdit); mode.value = 'view' }
function onSaveWidget() { saveBpLayout(widgets.value); mode.value = 'view'; successToast(t('Dashboard changes saved')) }

// "Last updated … (GMT+7)" + Update
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const lastUpdated = ref(stamp())
const updating = ref(false)
function handleRefresh() {
  updating.value = true
  setTimeout(() => { lastUpdated.value = stamp(); updating.value = false }, 600)
}

// ── Move widget (prod move.vue: arrows-up/left/right/down) ───────────────────
function canMove(i: number, dir: 'up' | 'down' | 'left' | 'right') {
  const w = widgets.value[i]!
  if (dir === 'left' || dir === 'right') {
    if (w.w !== 6) return false
    return dir === 'left' ? i > 0 && widgets.value[i - 1]!.w === 6 : i < widgets.value.length - 1 && widgets.value[i + 1]!.w === 6
  }
  return dir === 'up' ? i > 0 : i < widgets.value.length - 1
}
function moveWidget(i: number, dir: 'up' | 'down' | 'left' | 'right') {
  if (!canMove(i, dir)) return
  const j = dir === 'up' || dir === 'left' ? i - 1 : i + 1
  const list = [...widgets.value]
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  widgets.value = list
}

// ── Periods / view per widget ────────────────────────────────────────────────
const periodOptions = bpPeriods()
function setPeriod(w: BpWidget, v: string) { if (!v) return; w.period = v; persistIfViewing(); successToast(t('Filter applied')) }
function setView(w: BpWidget, v: 'grafik' | 'table') { w.view = v; persistIfViewing() }
const modeOptions = (id: number) => [
  { id: `bp-mode-${id}-chart`, value: 'grafik', label: t('Chart view') },
  { id: `bp-mode-${id}-table`, value: 'table', label: t('Table view') },
]

// ── Data per widget (computed once per render pass) ──────────────────────────
const title = (w: BpWidget) => {
  if (w.content === 'jurnalpay') return 'Mekari Pay'
  if (w.content === 'account') return bpAccountLine(w.accountId ?? '', 'monthly')?.label ?? t('Select account')
  return t(BP_TITLES[w.content])
}
const barRows = (w: BpWidget): BarRow[] => (w.content === 'cashflow' ? bpCashFlow(w.period ?? 'monthly') : bpProfitLoss(w.period ?? 'monthly'))
const barLegend = (w: BpWidget) => (w.content === 'cashflow'
  ? [t('Total cash in'), t('Total cash out'), t('Net cash flow')]
  : [t('Revenue'), t('Expense'), t('Net profit')])
const barHeader = (w: BpWidget) => [t('Period'), ...barLegend(w)]

function barScale(rows: BarRow[]) {
  const pos = Math.max(1, ...rows.map(r => Math.max(r.a, r.net, 0)))
  const neg = Math.max(0, ...rows.map(r => Math.max(-r.b, -r.net, 0)))
  const span = pos + neg || 1
  return { zero: (pos / span) * 100, pct: (v: number) => (Math.abs(v) / span) * 100 }
}

const summary = (w: BpWidget): SummaryBox[] => (w.content === 'receivable' ? bpReceivable(w.period ?? 'this_month') : bpPayable(w.period ?? 'this_month'))
const summaryLabel = (w: BpWidget, key: SummaryBox['key']) => {
  if (key === 'unpaid') return t('Unpaid')
  if (key === 'overdue') return t('Overdue')
  return w.content === 'receivable' ? t('Payments received') : t('Payments sent')
}
function moreInfo(w: BpWidget) { router.push(w.content === 'receivable' ? '/sales-invoices' : '/purchase-invoices') }

const SLICE_CLASSES = ['s1', 's2', 's3', 's4', 's5', 's6']
function donut(w: BpWidget) {
  const r = bpExpenses(w.period ?? 'this_month')
  const C = 2 * Math.PI * 40
  let acc = 0
  const arcs = r.slices.map((s, i) => {
    const len = r.total ? (s.value / r.total) * C : 0
    const arc = { ...s, cls: SLICE_CLASSES[i % SLICE_CLASSES.length]!, dash: `${len} ${C - len}`, offset: -acc }
    acc += len
    return arc
  })
  return { ...r, arcs }
}

function lineChart(w: BpWidget) {
  const d = bpAccountLine(w.accountId ?? '', w.period ?? 'monthly')
  if (!d) return null
  const vals = d.points.map(p => p.value)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = hi - lo || 1
  const pts = d.points.map((p, i) => `${(i / Math.max(1, d.points.length - 1)) * 100},${36 - ((p.value - lo) / span) * 32}`).join(' ')
  return { ...d, pts }
}

// ── Account widgets: add / change / delete (prod widget-modal.vue) ───────────
const accountOptions = bpAccountOptions()
const widgetModal = ref<{ open: boolean; isAdd: boolean; id: number | null; account: string; error: string }>({ open: false, isAdd: true, id: null, account: '', error: '' })
const disabledAddWidget = computed(() => widgets.value.length >= BP_MAX_WIDGETS)
function addWidget() { if (disabledAddWidget.value) return; widgetModal.value = { open: true, isAdd: true, id: null, account: '', error: '' } }
function editAccountWidget(w: BpWidget) { widgetModal.value = { open: true, isAdd: false, id: w.id, account: w.accountId ?? '', error: '' } }
function closeWidgetModal() { widgetModal.value.open = false }
function saveWidgetModal() {
  const m = widgetModal.value
  if (!m.account) { m.error = t('Select account'); return }
  if (m.isAdd) {
    const id = Math.max(0, ...widgets.value.map(w => w.id)) + 1
    widgets.value = [...widgets.value, { id, content: 'account', chart: 'line', w: 6, accountId: m.account, period: 'monthly' }]
    persistIfViewing()
  } else {
    const w = widgets.value.find(x => x.id === m.id)
    if (w) w.accountId = m.account
    persistIfViewing()
    successToast(t('Account in widget changed'))
  }
  m.open = false
}

const deleteId = ref<number | null>(null)
function confirmDeleteWidget() {
  widgets.value = widgets.value.filter(w => w.id !== deleteId.value)
  deleteId.value = null
  persistIfViewing()
  successToast(t('Widget deleted'))
}

// ── Account watchlist: edit accounts (max 5) ─────────────────────────────────
const watchOptions = bpWatchlistOptions()
const watchEdit = ref<{ id: number | null; ids: string[]; query: string }>({ id: null, ids: [], query: '' })
const watchFiltered = computed(() => {
  const q = watchEdit.value.query.trim().toLowerCase()
  return q ? watchOptions.filter(o => o.label.toLowerCase().includes(q)) : watchOptions
})
function openWatchEdit(w: BpWidget) { watchEdit.value = { id: w.id, ids: [...(w.accountIds ?? [])], query: '' } }
function toggleWatch(id: string) {
  const ids = watchEdit.value.ids
  if (ids.includes(id)) watchEdit.value.ids = ids.filter(x => x !== id)
  else if (ids.length < BP_MAX_WATCHLIST) watchEdit.value.ids = [...ids, id]
}
function saveWatchEdit() {
  const w = widgets.value.find(x => x.id === watchEdit.value.id)
  if (w) w.accountIds = [...watchEdit.value.ids]
  watchEdit.value.id = null
  persistIfViewing()
  successToast(t('Widget changes saved'))
}

const money = (v: number) => formatIDR(v)
</script>

<template>
  <div class="bp" :class="{ 'bp--edit': mode === 'edit' }">
    <!-- Toolbar (prod: Last updated + Update + Edit dashboard / Add account widget) -->
    <div class="bp__toolbar">
      <template v-if="mode === 'view'">
        <span class="bp__updated">{{ t('Last updated:') }} {{ lastUpdated }} (GMT+7)</span>
        <MpButton variant="secondary" :is-loading="updating" @click="handleRefresh">{{ updating ? t('Updating') : t('Update') }}</MpButton>
        <MpTooltip :label="t('Edit dashboard')" position="top">
          <button class="bp__iconbtn" type="button" :aria-label="t('Edit dashboard')" @click="onEditDashboard">
            <MpIcon name="edit" size="md" />
          </button>
        </MpTooltip>
      </template>
      <MpTooltip v-else :label="t('You have reached the adding limit of 15 widgets.')" position="left" :is-disabled="!disabledAddWidget">
        <MpButton variant="secondary" @click="addWidget">{{ t('Add account widget') }}</MpButton>
      </MpTooltip>
    </div>

    <div class="bp__grid">
      <section
        v-for="(w, i) in widgets" :key="w.id"
        class="bp-card" :class="[`bp-card--w${w.w}`, { 'bp-card--edit': mode === 'edit' }]"
        :data-widget="w.content"
      >
        <header class="bp-card__head">
          <span class="bp-card__title">
            <MpIcon v-if="mode === 'edit'" name="drag" size="md" class="bp-card__grip" />
            {{ title(w) }}
          </span>
          <div class="bp-card__tools">
            <MpSegmentedControl
              v-if="w.chart === 'bar'" :id="`bp-mode-${w.id}`" :name="`bp-mode-${w.id}`"
              :model-value="w.view ?? 'grafik'" :data="modeOptions(w.id)"
              @update:model-value="(v: string) => setView(w, v as 'grafik' | 'table')"
            />
            <ErpFilterSelect
              v-if="w.content !== 'account_watchlist'"
              :id="`bp-period-${w.id}`"
              :model-value="w.period ?? ''"
              :placeholder="t('Period')"
              :options="w.chart === 'bar' ? BP_RANGE_PERIODS : w.chart === 'line' ? BP_LINE_PERIODS : periodOptions"
              :is-clearable="false"
              width="220px"
              @update:model-value="(v: string) => setPeriod(w, v)"
            />
            <MpTooltip v-if="w.chart !== 'line' && w.content !== 'account_watchlist'" :label="t('Filter')">
              <button class="bp__iconbtn bp__iconbtn--ghost" type="button" :aria-label="t('Filter')" @click="notInPrototype">
                <MpIcon name="filter" size="md" />
              </button>
            </MpTooltip>
            <MpPopover v-if="w.content === 'account' || w.content === 'account_watchlist'" :id="`bp-more-${w.id}`" is-close-on-select use-portal placement="bottom-end">
              <MpPopoverTrigger>
                <button class="bp__iconbtn bp__iconbtn--ghost" type="button" :aria-label="t('Other actions')">
                  <MpIcon name="menu-kebab" size="md" />
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent>
                <MpPopoverList>
                  <MpPopoverListItem @click="w.content === 'account' ? editAccountWidget(w) : openWatchEdit(w)">{{ t('Edit widget') }}</MpPopoverListItem>
                  <MpPopoverListItem v-if="w.content === 'account'" @click="deleteId = w.id">{{ t('Delete widget') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </header>

        <div class="bp-card__body">
          <!-- Bar: Cash flow / Profit & loss -->
          <template v-if="w.chart === 'bar'">
            <template v-if="(w.view ?? 'grafik') === 'grafik'">
              <div class="bar">
                <div v-for="r in barRows(w)" :key="r.label" class="bar__col">
                  <div class="bar__plot">
                    <span class="bar__zero" :style="{ top: barScale(barRows(w)).zero + '%' }" />
                    <span class="bar__bar bar__bar--a" :title="`${barLegend(w)[0]}: ${money(r.a)}`" :style="{ bottom: (100 - barScale(barRows(w)).zero) + '%', height: barScale(barRows(w)).pct(r.a) + '%' }" />
                    <span class="bar__bar bar__bar--b" :title="`${barLegend(w)[1]}: ${money(r.b)}`" :style="{ top: barScale(barRows(w)).zero + '%', height: barScale(barRows(w)).pct(r.b) + '%' }" />
                    <span
                      class="bar__bar bar__bar--net" :title="`${barLegend(w)[2]}: ${money(r.net)}`"
                      :style="r.net >= 0
                        ? { bottom: (100 - barScale(barRows(w)).zero) + '%', height: barScale(barRows(w)).pct(r.net) + '%' }
                        : { top: barScale(barRows(w)).zero + '%', height: barScale(barRows(w)).pct(r.net) + '%' }"
                    />
                  </div>
                  <span class="bar__label">{{ r.label }}</span>
                </div>
              </div>
              <div class="legend">
                <span v-for="(l, li) in barLegend(w)" :key="l" class="legend__item"><span class="legend__dot" :class="`legend__dot--${['a', 'b', 'net'][li]}`" />{{ l }}</span>
              </div>
            </template>
            <div v-else class="mini mini--4">
              <div class="mini__row mini__row--head"><span v-for="h in barHeader(w)" :key="h">{{ h }}</span></div>
              <div v-for="r in barRows(w)" :key="r.label" class="mini__row">
                <span>{{ r.label }}</span><span>{{ money(r.a) }}</span><span>{{ money(r.b) }}</span>
                <span :class="{ 'is-neg': r.net < 0 }">{{ money(r.net) }}</span>
              </div>
            </div>
          </template>

          <!-- Card: Sales receivable / Bills to Pay -->
          <div v-else-if="w.chart === 'card'" class="boxes">
            <a
              v-for="s in summary(w)" :key="s.key"
              class="box" :class="[`box--${s.key}`, { 'box--wide': s.key === 'paid' }]"
              @click="moreInfo(w)"
            >
              <span class="box__top">
                <span class="box__label">{{ summaryLabel(w, s.key) }}</span>
                <span class="box__badge">{{ s.count }}</span>
              </span>
              <span class="box__sub">{{ t('Total') }}</span>
              <span class="box__amount">{{ money(s.amount) }}</span>
              <span class="box__link">{{ t('Get more info') }}</span>
            </a>
          </div>

          <!-- Doughnut: Operational expenses -->
          <template v-else-if="w.chart === 'doughnut'">
            <div v-if="donut(w).total" class="donut">
              <div class="donut__chart">
                <svg viewBox="0 0 100 100" class="donut__svg" aria-hidden="true">
                  <circle cx="50" cy="50" r="40" class="donut__track" />
                  <circle
                    v-for="a in donut(w).arcs" :key="a.id" cx="50" cy="50" r="40"
                    class="donut__arc" :class="`donut__arc--${a.cls}`"
                    :stroke-dasharray="a.dash" :stroke-dashoffset="a.offset"
                  />
                </svg>
                <div class="donut__center">
                  <span class="donut__pct">{{ donut(w).max?.percentage ?? 0 }}%</span>
                  <span class="donut__name">{{ donut(w).max?.name }}</span>
                </div>
              </div>
              <div class="donut__legend">
                <div class="donut__total"><span>{{ t('Total') }}</span><strong>{{ money(donut(w).total) }}</strong></div>
                <div v-for="a in donut(w).arcs" :key="a.id" class="donut__row">
                  <span class="legend__dot" :class="`donut__dot--${a.cls}`" />
                  <span class="donut__row-name">{{ a.name }}</span>
                  <span class="donut__row-pct">{{ a.percentage }}%</span>
                  <span class="donut__row-val">{{ money(a.value) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="bp-empty">{{ t('No data yet') }}</p>
          </template>

          <!-- Table: Account watchlist -->
          <template v-else-if="w.content === 'account_watchlist'">
            <div v-if="bpWatchlist(w.accountIds ?? []).length" class="mini mini--3">
              <div class="mini__row mini__row--head"><span>{{ t('Account') }}</span><span>{{ t('This month') }}</span><span>{{ t('This year') }}</span></div>
              <div v-for="r in bpWatchlist(w.accountIds ?? [])" :key="r.id" class="mini__row">
                <span class="mini__link" @click="router.push(`/chart-of-accounts/${r.id}`)">{{ r.label }}</span>
                <span :class="{ 'is-neg': r.month < 0 }">{{ money(r.month) }}</span>
                <span :class="{ 'is-neg': r.year < 0 }">{{ money(r.year) }}</span>
              </div>
            </div>
            <p v-else class="bp-empty">{{ t('No data yet') }}</p>
          </template>

          <!-- Table: Top selling product -->
          <template v-else-if="w.content === 'product_profitability'">
            <div v-if="bpTopProducts(w.period ?? 'this_month').length" class="mini mini--3">
              <div class="mini__row mini__row--head"><span>{{ t('Product name') }}</span><span>{{ t('Qty sold') }}</span><span>{{ t('Total sales amount') }}</span></div>
              <div v-for="r in bpTopProducts(w.period ?? 'this_month')" :key="r.sku" class="mini__row">
                <span class="mini__link" @click="router.push(`/product-list/${r.sku}`)">{{ r.name }}</span>
                <span>{{ r.qty.toLocaleString('id-ID') }} {{ r.unit }}</span>
                <span>{{ money(r.total) }}</span>
              </div>
            </div>
            <p v-else class="bp-empty">{{ t('No data yet') }}</p>
          </template>

          <!-- Line: Mekari Pay (not registered) -->
          <div v-else-if="w.content === 'jurnalpay'" class="pay">
            <MpIcon name="wallet" size="lg" class="pay__icon" />
            <p class="pay__title">{{ t('Receive payments faster with Mekari Pay') }}</p>
            <MpButton variant="secondary" @click="notInPrototype">{{ t('Get more info') }}</MpButton>
          </div>

          <!-- Line: account balance -->
          <template v-else-if="w.content === 'account'">
            <div v-if="lineChart(w)" class="acct">
              <div class="acct__balances">
                <template v-if="lineChart(w)!.statementBalance !== null">
                  <div><span class="acct__label">{{ t('Balance in bank') }}</span><span class="acct__val">{{ formatMoney(lineChart(w)!.statementBalance!, lineChart(w)!.currency) }}</span></div>
                  <div><span class="acct__label">{{ t('Balance in Jurnal') }}</span><span class="acct__val">{{ formatMoney(lineChart(w)!.bookBalance, lineChart(w)!.currency) }}</span></div>
                </template>
                <div v-else><span class="acct__label">{{ t('Account balance') }}</span><span class="acct__val">{{ formatMoney(lineChart(w)!.bookBalance, lineChart(w)!.currency) }}</span></div>
              </div>
              <a v-if="lineChart(w)!.unreconciled" class="acct__reconcile" @click="router.push(`/cash-management/${w.accountId}`)">
                {{ lineChart(w)!.unreconciled }} {{ lineChart(w)!.unreconciled === 1 ? t('transaction needs to be reconciled') : t('transactions needs to be reconciled') }}
              </a>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="acct__svg" aria-hidden="true">
                <polyline :points="lineChart(w)!.pts" class="acct__line" vector-effect="non-scaling-stroke" />
              </svg>
              <div class="acct__axis"><span v-for="p in lineChart(w)!.points" :key="p.label" :title="formatMoney(p.value, lineChart(w)!.currency)">{{ p.label }}</span></div>
            </div>
            <p v-else class="bp-empty">{{ t('Unable to load data.') }}</p>
          </template>
        </div>

        <!-- Move widget overlay (edit mode) -->
        <div v-if="mode === 'edit'" class="move">
          <span class="move__title">{{ t('Move widget') }}</span>
          <div class="move__pad">
            <button class="move__btn move__btn--up" type="button" :aria-label="t('Up')" :disabled="!canMove(i, 'up')" @click="moveWidget(i, 'up')"><MpIcon name="arrows-up" size="md" /></button>
            <button class="move__btn move__btn--left" type="button" :aria-label="t('Left')" :disabled="!canMove(i, 'left')" @click="moveWidget(i, 'left')"><MpIcon name="arrows-left" size="md" /></button>
            <button class="move__btn move__btn--right" type="button" :aria-label="t('Right')" :disabled="!canMove(i, 'right')" @click="moveWidget(i, 'right')"><MpIcon name="arrows-right" size="md" /></button>
            <button class="move__btn move__btn--down" type="button" :aria-label="t('Down')" :disabled="!canMove(i, 'down')" @click="moveWidget(i, 'down')"><MpIcon name="arrows-down" size="md" /></button>
          </div>
        </div>
      </section>
    </div>

    <!-- Edit-mode footer -->
    <div v-if="mode === 'edit'" class="bp__footer">
      <MpButton variant="ghost" @click="cancelEdit">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" @click="onSaveWidget">{{ t('Save changes') }}</MpButton>
    </div>

    <!-- Add / change account widget -->
    <MpModal
      id="bp-widget-modal" :is-open="widgetModal.open" size="md" :is-keep-alive="false"
      :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="closeWidgetModal"
    >
      <MpModalContent>
        <MpModalHeader>{{ widgetModal.isAdd ? t('Add account widget to dashboard') : t('Change account in widget') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <label class="bp-field__label" for="bp-widget-account">{{ t('Select account') }}</label>
          <ErpFilterSelect
            id="bp-widget-account" v-model="widgetModal.account" :placeholder="t('Select account')"
            :options="accountOptions" :is-clearable="false" width="100%" :empty-text="t('No account found')"
          />
          <p v-if="widgetModal.error" class="bp-field__error">{{ widgetModal.error }}</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="bp-modal__btns">
            <MpButton variant="ghost" @click="closeWidgetModal">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" @click="saveWidgetModal">{{ widgetModal.isAdd ? t('Add') : t('Change') }}</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Edit account monitoring widget -->
    <MpModal
      id="bp-watch-modal" :is-open="watchEdit.id !== null" size="md" :is-keep-alive="false"
      :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="watchEdit.id = null"
    >
      <MpModalContent>
        <MpModalHeader>{{ t('Edit account monitoring widget') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="bp-field__hint">{{ t('You can monitor 5 accounts at a maximum in this widget.') }}</p>
          <label class="bp-field__label" for="bp-watch-search">{{ t('Select account') }}</label>
          <input id="bp-watch-search" v-model="watchEdit.query" class="bp-search" type="text" autocomplete="off">
          <div class="bp-watch">
            <MpCheckbox
              v-for="o in watchFiltered" :id="`bp-watch-${o.value}`" :key="o.value"
              :is-checked="watchEdit.ids.includes(o.value)"
              :is-disabled="!watchEdit.ids.includes(o.value) && watchEdit.ids.length >= BP_MAX_WATCHLIST"
              @change="toggleWatch(o.value)"
            >{{ o.label }}</MpCheckbox>
            <p v-if="!watchFiltered.length" class="bp-field__hint">{{ t('No account found') }}</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <div class="bp-modal__btns">
            <MpButton variant="ghost" @click="watchEdit.id = null">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" @click="saveWatchEdit">{{ t('Save changes') }}</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Delete account widget -->
    <MpModal
      id="bp-delete-modal" :is-open="deleteId !== null" size="md" :is-keep-alive="false"
      :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="deleteId = null"
    >
      <MpModalContent>
        <MpModalHeader>{{ t('Delete account widget?') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ t('Deleting the widget will not delete the data inside. You can add the deleted widget again.') }}</MpModalBody>
        <MpModalFooter>
          <div class="bp-modal__btns">
            <MpButton variant="ghost" @click="deleteId = null">{{ t('Cancel') }}</MpButton>
            <MpButton variant="danger" @click="confirmDeleteWidget">{{ t('Delete') }}</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.bp { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.bp--edit { padding-bottom: var(--mp-spacing-16, 64px); }
.bp__toolbar { display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); }
.bp__updated { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bp__iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-default); color: var(--mp-colors-icon-default); cursor: pointer;
}
.bp__iconbtn--ghost { border-color: transparent; background: transparent; }
.bp__iconbtn:hover { background: var(--mp-background-neutral-subtle); }

.bp__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.bp-card {
  position: relative; display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-6); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md); background: var(--mp-background-default); min-width: 0;
}
.bp-card--w12 { grid-column: span 2; min-height: 340px; }
.bp-card--w6 { min-height: 384px; }
.bp-card--edit:hover { border-color: var(--mp-colors-blue-600); }
.bp-card--edit:hover .bp-card__body, .bp-card--edit:hover .bp-card__tools { opacity: 0.05; }
.bp-card__head { display: flex; justify-content: space-between; align-items: center; gap: var(--mp-spacing-3); min-height: var(--mp-sizes-9, 36px); }
.bp-card__title { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bp-card__grip { color: var(--mp-colors-icon-default); }
.bp-card__tools { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bp-card__body { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
.bp-empty { margin: 0; text-align: center; color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md); }

/* Bar chart */
.bar { display: flex; gap: var(--mp-spacing-2); height: 220px; align-items: stretch; }
.bar__col { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.bar__plot { position: relative; flex: 1; }
.bar__zero { position: absolute; left: 0; right: 0; border-top: 1px solid var(--mp-border-default); }
.bar__bar { position: absolute; width: 28%; min-height: 1px; border-radius: var(--mp-radii-sm); }
.bar__bar--a { left: 4%; background: var(--mp-colors-blue-500); }
.bar__bar--b { left: 36%; background: var(--mp-colors-orange-400); }
.bar__bar--net { left: 68%; background: var(--mp-colors-green-500); }
.bar__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.legend { display: flex; justify-content: center; gap: var(--mp-spacing-5); margin-top: var(--mp-spacing-3); }
.legend__item { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.legend__dot { width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px); border-radius: var(--mp-radii-full); flex-shrink: 0; }
.legend__dot--a { background: var(--mp-colors-blue-500); }
.legend__dot--b { background: var(--mp-colors-orange-400); }
.legend__dot--net { background: var(--mp-colors-green-500); }

/* Mini tables (widget-sized, not page tables) */
.mini { display: flex; flex-direction: column; align-self: stretch; }
.mini__row { display: grid; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.mini--3 .mini__row { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); }
.mini--4 .mini__row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.mini__row > span:not(:first-child) { text-align: right; }
.mini__row--head { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.mini__link { color: var(--mp-text-link); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-neg { color: var(--mp-text-danger); }

/* Summary boxes */
.boxes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-3); align-self: stretch; }
.box {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); cursor: pointer; text-decoration: none;
}
.box--wide { grid-column: span 2; }
.box:hover { background: var(--mp-background-neutral-subtle); }
.box__top { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.box__label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.box__badge { padding: 0 var(--mp-spacing-2); border-radius: var(--mp-radii-full); font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.box--overdue .box__badge { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.box--paid .box__badge { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }
.box__sub { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.box__amount { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow-wrap: anywhere; }
.box__link { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); }

/* Doughnut */
.donut { display: flex; align-items: center; gap: var(--mp-spacing-8, 32px); }
.donut__chart { position: relative; width: 200px; height: 200px; flex-shrink: 0; }
.donut__svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.donut__track { fill: none; stroke: var(--mp-border-default); stroke-width: 14; }
.donut__arc { fill: none; stroke-width: 14; }
.donut__arc--s1, .donut__dot--s1 { stroke: var(--mp-colors-blue-500); background: var(--mp-colors-blue-500); }
.donut__arc--s2, .donut__dot--s2 { stroke: var(--mp-colors-orange-400); background: var(--mp-colors-orange-400); }
.donut__arc--s3, .donut__dot--s3 { stroke: var(--mp-colors-green-500); background: var(--mp-colors-green-500); }
.donut__arc--s4, .donut__dot--s4 { stroke: var(--mp-colors-violet-400); background: var(--mp-colors-violet-400); }
.donut__arc--s5, .donut__dot--s5 { stroke: var(--mp-colors-teal-400); background: var(--mp-colors-teal-400); }
.donut__arc--s6, .donut__dot--s6 { stroke: var(--mp-colors-gray-100); background: var(--mp-colors-gray-100); }
.donut__center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: var(--mp-spacing-8, 32px); }
.donut__pct { font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.donut__name { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.donut__legend { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.donut__total { display: flex; justify-content: space-between; padding-bottom: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.donut__row { display: grid; grid-template-columns: auto minmax(0, 1fr) 56px minmax(0, 160px); align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.donut__row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.donut__row-pct { color: var(--mp-text-secondary); text-align: right; }
.donut__row-val { text-align: right; }

/* Account line */
.acct { display: flex; flex-direction: column; gap: var(--mp-spacing-2); align-self: stretch; }
.acct__balances { display: flex; gap: var(--mp-spacing-6); }
.acct__balances > div { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.acct__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.acct__val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.acct__reconcile { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.acct__svg { width: 100%; height: 160px; margin-top: var(--mp-spacing-2); }
.acct__line { fill: none; stroke: var(--mp-colors-blue-500); stroke-width: 2; }
.acct__axis { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); }

/* Mekari Pay */
.pay { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-4); text-align: center; }
.pay__icon { color: var(--mp-colors-blue-500); }
.pay__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* Move widget */
.move { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); }
.bp-card--edit:hover .move { display: flex; }
.move__title { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.move__pad { display: grid; grid-template-columns: repeat(3, var(--mp-sizes-9, 36px)); grid-template-rows: repeat(3, var(--mp-sizes-9, 36px)); gap: var(--mp-spacing-2); }
.move__btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-default); color: var(--mp-colors-icon-default); cursor: pointer;
}
.move__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.move__btn--up { grid-column: 2; grid-row: 1; }
.move__btn--left { grid-column: 1; grid-row: 2; }
.move__btn--right { grid-column: 3; grid-row: 2; }
.move__btn--down { grid-column: 2; grid-row: 3; }

.bp__footer {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default); background: var(--mp-background-default);
}

.bp-field__label { display: block; margin-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bp-field__error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.bp-field__hint { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bp-search {
  width: 100%; height: var(--mp-sizes-9, 36px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md);
}
.bp-watch { display: flex; flex-direction: column; gap: var(--mp-spacing-3); max-height: 280px; overflow-y: auto; margin-top: var(--mp-spacing-3); }
.bp-modal__btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
