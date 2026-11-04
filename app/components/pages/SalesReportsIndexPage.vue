<!-- prod-parity: quickbook/app/services/reports/report_authorization_service.rb (sales_tab) + jurnal-frontend-app/src/pages/reports/index/i18n.json -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { MpButton } from '@mekari/pixel3'
// Reports → Sales index (page key 'Sales report'). Card order follows prod's
// ERP report list for this tab; titles and descriptions are prod's English copy.
// Same flush edge-to-edge card grid as every Reports index: cards fill the stage
// width as an equal-column grid, the last row is padded with empty filler cells so
// the grid stays a complete rectangle, and the outer right + bottom borders are
// clipped so the rightmost column never shows a border.
import { infoToast } from '~/utils/toasts'
const { t } = useLocale()
const router = useRouter()

interface ReportCard {
  slug: string
  title: string
  description: string
  /** Route of the built report; cards without one show "Not in this prototype". */
  to?: string
  /** Button label when prod's card action is not "View report". */
  action?: string
}
const reports: ReportCard[] = [
  { slug: 'sales-list', title: 'Sales list', description: 'Shows sales transactions chronologically based on type in a certain period. This report template is customizable.', to: '/sales-report/sales-list' },
  { slug: 'sales-by-customer', title: 'Sales by customer', description: 'Shows all sales transactions from each customer in a certain period.', to: '/sales-report/sales-by-customer' },
  { slug: 'customer-balance', title: 'Customer balance', description: 'Shows all unpaid invoices and credit memo balances of customers in a specific date.' },
  { slug: 'aged-receivable', title: 'Aged receivable', description: 'Shows the account receivable total from each customer based on various ages (30, 60, 90, and after 90 days).' },
  { slug: 'sales-delivery', title: 'Sales delivery', description: 'Shows all delivered products for sales transactions in a certain period.' },
  { slug: 'sales-by-product', title: 'Sales by product', description: 'Shows all sold product quantities, return quantities, net sales, and average selling price in a certain period.', to: '/sales-report/sales-by-product' },
  { slug: 'sales-order-completion', title: 'Sales order completion', description: 'Shows business process summary of this company. You can identify each sales quote and order completion until its invoice and payment are made.' },
  { slug: 'product-profitability', title: 'Product profitability', description: 'Shows gained total profit from sold products in a certain period.' },
  { slug: 'proforma-invoice-list', title: 'Proforma invoice list', description: 'Shows all created proforma invoices in a certain period.' },
  { slug: 'join-invoice-list', title: 'Join invoice list', description: 'Shows all join invoices in a certain period.' },
  { slug: 'credit-memo', title: 'Credit memo', description: 'Shows all credit memos of each customer with their status and remaining balance in a certain period.', to: '/sales-report/credit-memo' },
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

function viewReport(r: ReportCard) {
  if (r.to) router.push(r.to)
  else infoToast(t('Not in this prototype'))
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
        <MpButton variant="secondary" is-rounded class="report-view-btn" @click="viewReport(r)">{{ t(r.action ?? 'View report') }}</MpButton>
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
  height: var(--mp-sizes-24, 96px);
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
