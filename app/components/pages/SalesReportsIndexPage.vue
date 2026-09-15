<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { MpButton } from '@mekari/pixel3'
// Reports → Sales index (Reports module → Sales submenu). Lists the Sales
// reports; each "View report" opens its raw-data table. Design: Figma Reports/
// Sales/Index (node 4534-76212). Same flush edge-to-edge card grid as the WMS
// reports index (WmsReportsIndexPage), Pixel 3 DT 2.4 enterprise tokens.
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
  { slug: 'sales-list',            title: 'Sales list',            description: 'Displays your total income, expenses, and net profit over a specific period. Essential for understanding business performance.' },
  { slug: 'product-profitability', title: 'Product profitability', description: "A snapshot of your company's financial position—including assets, liabilities, and equity—at a specific point in time." },
  { slug: 'sales-order-completion',title: 'Sales order completion',description: 'Tracks the movement of cash in and out of your business to help you analyze liquidity and cash availability.' },
  { slug: 'sales-delivery',        title: 'Sales delivery',        description: 'A complete record of all transactions posted to your accounts, sorted by date. Useful for detailed transaction auditing.' },
  { slug: 'sales-by-customer',     title: 'Sales by customer',     description: 'A summary of closing balances for all accounts in your chart of accounts to ensure debits and credits match.' },
  { slug: 'sales-by-product',      title: 'Sales by product',      description: 'Displays the chronological record of all journal entries, showing the debits and credits affected by each transaction.' },
  { slug: 'customer-balance',      title: 'Customer balance',      description: 'A high-level overview of key financial ratios and performance indicators designed for business owners and stakeholders.' },
  { slug: 'aged-receivable',       title: 'Aged receivable',       description: "Details the changes in the owner's equity throughout the period, including capital injections and retained earnings." },
  { slug: 'credit-memo',           title: 'Credit memo',           description: 'Shows the comparison between actual transaction amount and arranged budget per account.' },
  { slug: 'proforma-invoice-list', title: 'Proforma invoice list', description: 'Set up and manage monthly or yearly budgets for your income and expense accounts.' },
  { slug: 'join-invoice-list',     title: 'Join invoice list',     description: 'Finds unusual patterns in your transactions and accounts (COA) based on AI analysis.' },
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

// Built report detail pages navigate; the rest show a coming-soon toast for now.
const BUILT: Record<string, string> = { 'credit-memo': '/sales-report/credit-memo' }
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
        <MpButton variant="secondary" is-rounded class="report-view-btn" @click="viewReport(r)">{{ t('View report') }}</MpButton>
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
/* layout only — the button look comes from MpButton (secondary) */
.report-view-btn { align-self: flex-start; }
</style>
