<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { MpButton, css } from '@mekari/pixel3'
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

const clipClass = css({ overflow: 'hidden' })

const gridClass = computed(() => css({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols.value}, minmax(0, 1fr))`,
  alignItems: 'stretch',
  margin: '0 -1px -1px 0',
}))

const cardClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  padding: '5',
  borderRight: '1px solid token(colors.border.default)',
  borderBottom: '1px solid token(colors.border.default)',
})

const fillerClass = css({ padding: '0!' })

const bodyClass = css({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '92px',
})

const titleClass = css({
  fontSize: 'xl',
  fontWeight: 'semiBold',
  color: 'text.default',
  lineHeight: 'xl',
  margin: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

const descClass = css({
  height: '96px',
  margin: '0',
  fontSize: 'md',
  fontWeight: 'regular',
  color: 'text.secondary',
  lineHeight: 'md',
})
</script>

<template>
  <div :class="clipClass">
    <div ref="gridEl" :class="gridClass">
      <div v-for="r in reports" :key="r.slug" :class="cardClass">
        <div :class="bodyClass">
          <h2 :class="titleClass">{{ t(r.title) }}</h2>
          <p :class="descClass">{{ t(r.description) }}</p>
        </div>
        <MpButton variant="secondary" size="sm" class="btn-enterprise btn-enterprise--secondary" @click="viewReport(r)">{{ t('View report') }}</MpButton>
      </div>
      <div v-for="n in fillerCount" :key="`filler-${n}`" :class="[cardClass, fillerClass]" aria-hidden="true" />
    </div>
  </div>
</template>
