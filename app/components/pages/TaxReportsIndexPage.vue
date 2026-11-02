<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { MpButton } from '@mekari/pixel3'
// Reports → Tax index (Reports module → Tax submenu). Same flush edge-to-edge
// card grid as the Sales reports index (SalesReportsIndexPage) — Pixel 3 DT 2.4
// enterprise tokens.
//
// VAT reconciliation is the only built card — it opens the module at
// /vat-reconciliation. The rest are placeholders (coming-soon toast), same as
// the unbuilt cards on the sibling report indexes.
import { infoToast } from '~/utils/toasts'
const { t } = useLocale()
const router = useRouter()

interface ReportCard {
  slug: string
  title: string
  description: string
}
const reports: ReportCard[] = [
  { slug: 'vat-reconciliation',      title: 'VAT reconciliation',      description: 'Matches your sales and purchase invoices against the faktur pajak recorded in DJP Coretax, per tax period, and shows what is still unreconciled.' },
  { slug: 'output-tax-invoice-list', title: 'Output tax invoice list', description: 'Every faktur pajak you issued in a period, with its transaction code, DPP, and PPN. The working list behind your SPT Masa PPN.' },
  { slug: 'input-tax-invoice-list',  title: 'Input tax invoice list',  description: 'Every faktur pajak you received in a period, showing which ones are creditable and which are still waiting on a vendor.' },
  { slug: 'value-added-tax',         title: 'Value added tax (PPN)',   description: 'Calculates net VAT obligations by comparing Output Tax (from sales) and Input Tax (from purchases) within the period.' },
  { slug: 'withholding-tax-summary', title: 'Withholding tax summary', description: 'Details all withholding tax (PPh) deductions recorded on sales and purchases, including taxable amounts and tax rates.' },
  { slug: 'tax-payment-list',        title: 'Tax payment list',        description: 'All tax payments made in a period, with their billing codes, so you can tie every payment back to a return.' },
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
const BUILT: Record<string, string> = { 'vat-reconciliation': '/vat-reconciliation' }
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

/* flex:1 makes the body fill the card, which the grid has already stretched to
   the tallest card in its row — so every "View report" in a row still lines up,
   without pinning the description to a fixed height it can overflow out of at
   narrow widths (one column, six wrapped lines). */
.report-card-body { display: flex; flex-direction: column; flex: 1; min-height: 92px; }
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
  min-height: var(--mp-sizes-24, 96px);
  margin: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-regular, 400);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md, 20px);
}

/* layout only — the button look comes from MpButton (secondary) */
.report-view-btn { align-self: flex-start; }
</style>
