<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
// Reports → Financials index (Reports module → Financials submenu). Lists the
// financial reports; each "View report" opens its report page. Same flush
// edge-to-edge card grid as the Sales reports index (SalesReportsIndexPage) —
// Pixel 3 DT 2.4 enterprise tokens.
//
// Cards fill the full stage width as an equal-column grid. On narrower widths the
// column count drops; the last row is padded with empty filler cells so the grid
// stays a complete rectangle. The outer right + bottom borders are clipped, so the
// rightmost column never shows a border.
import { infoToast } from '~/utils/toasts'
const { t } = useLocale()
const router = useRouter()

interface ReportCard {
  slug: string
  title: string
  description: string
}
const reports: ReportCard[] = [
  { slug: 'profit-and-loss',    title: 'Profit & Loss',    description: 'Displays your total income, expenses, and net profit over a specific period. Essential for understanding business performance.' },
  { slug: 'balance-sheet',      title: 'Balance Sheet',    description: "A snapshot of your company's financial position—including assets, liabilities, and equity—at a specific point in time." },
  { slug: 'cash-flows',         title: 'Cash Flows',       description: 'Tracks the movement of cash in and out of your business to help you analyze liquidity and cash availability.' },
  { slug: 'general-ledger',     title: 'General Ledger',   description: 'A complete record of all transactions posted to your accounts, sorted by date. Useful for detailed transaction auditing.' },
  { slug: 'trial-balance',      title: 'Trial Balance',    description: 'A summary of closing balances for all accounts in your chart of accounts to ensure debits and credits match.' },
  { slug: 'journal-report',     title: 'Journal Report',   description: 'Displays the chronological record of all journal entries, showing the debits and credits affected by each transaction.' },
  { slug: 'executive-summary',  title: 'Executive Summary', description: 'A high-level overview of key financial ratios and performance indicators designed for business owners and stakeholders.' },
  { slug: 'changes-in-equity',  title: 'Statement of Changes in Equity', description: "Details the changes in the owner's equity throughout the period, including capital injections and retained earnings." },
  { slug: 'budget-variance',    title: 'Budget Variance',  description: 'Compares your actual financial performance against your planned budget to identify overspending or revenue gaps.' },
  { slug: 'budget-manager',     title: 'Budget Manager',   description: 'Set up and manage monthly or yearly budgets for your income and expense accounts.' },
  { slug: 'anomaly-detection',  title: 'Anomaly Detection', description: 'Identifies potential anomalies in transactions and accounts based on AI analysis, such as unusual amounts, excessive data changes, etc.' },
  { slug: 'multidimensional',   title: 'Multidimensional', description: 'Displays your total income, expenses, and net profit over a specific period. Essential for understanding business performance.' },
]

// ── Responsive column count ──────────────────────────────────────────────────
const MIN_CARD_WIDTH = 260
const gridEl = ref<HTMLElement | null>(null)
const cols = ref(4)
function recompute() {
  const w = gridEl.value?.clientWidth ?? 0
  if (!w) return
  cols.value = Math.max(1, Math.min(4, Math.floor(w / MIN_CARD_WIDTH)))
}
const fillerCount = computed(() => {
  const rem = reports.length % cols.value
  return rem === 0 ? 0 : cols.value - rem
})

let ro: ResizeObserver | null = null
onMounted(async () => {
  await nextTick()
  recompute()
  if (gridEl.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver(recompute)
    ro.observe(gridEl.value)
  }
})
onUnmounted(() => ro?.disconnect())

// Built report pages navigate; the rest show a coming-soon toast for now.
const BUILT: Record<string, string> = {
  multidimensional: '/financial-report/multidimensional',
  'general-ledger': '/financial-report/general-ledger',
  'budget-variance': '/financial-report/budget-variance',
}
function viewReport(r: ReportCard) {
  const to = BUILT[r.slug]
  if (to) router.push(to)
  else infoToast(`${t(r.title)} report — coming soon`)
}
</script>

<template>
  <div class="reports-clip">
    <div ref="gridEl" class="reports-grid" :style="{ '--cols': cols }">
      <div v-for="r in reports" :key="r.slug" class="report-card">
        <div class="report-card-body">
          <h2 class="report-card-title">{{ t(r.title) }}</h2>
          <p class="report-card-desc">{{ t(r.description) }}</p>
        </div>
        <button type="button" class="report-view-btn" @click="viewReport(r)">{{ t('View report') }}</button>
      </div>
      <!-- Empty filler cells keep the last row's columns present (complete grid). -->
      <div v-for="n in fillerCount" :key="`filler-${n}`" class="report-card report-card--filler" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
/* Clips the grid's 1px-overhang outer right + bottom borders. */
.reports-clip { overflow: hidden; }
.reports-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
  align-items: stretch;
  margin: 0 -1px -1px 0;
}
.report-card {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3, 12px);
  padding: var(--mp-spacing-5, 20px);
  border-right: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.report-card--filler { padding: 0; }

.report-card-body { display: flex; flex-direction: column; min-height: 92px; }
.report-card-title {
  font-family: var(--mp-font-family-title, inherit);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-xl, 32px);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.report-card-desc {
  height: 96px;
  margin: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-regular, 400);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md, 20px);
}

/* Secondary pill button (Pixel enterprise): white fill, bold border, rounded-full. */
.report-view-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4, 16px);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  line-height: var(--mp-line-heights-md, 20px);
  cursor: pointer;
}
.report-view-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
