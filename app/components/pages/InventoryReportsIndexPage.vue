<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { MpButton } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
// Inventory → Reports index (Reports module → Inventory submenu). Same card grid as
// Reports › WMS (WmsReportsIndexPage): cards fill the stage width as an equal-column
// grid, the last row is padded with fillers so every column is present top and bottom,
// and the outer right + bottom borders are clipped.
//
// Only "Dual Unit Inventory" is built (PRD Dual Unit Inventory, Story 14). The rest are
// listed so the section reads complete; their "View report" shows the coming-soon
// toast, same as the other report indexes.
const { t } = useLocale()
const router = useRouter()

interface ReportCard {
  slug: string
  title: string
  description: string
  /** false → no report page yet; "View report" shows the coming-soon toast. */
  built: boolean
}
const reports: ReportCard[] = [
  {
    slug: 'dual-unit',
    title: 'Dual unit inventory',
    description: 'Stock mutation and on-hand stock in both base and secondary inventory unit, per batch. For products using a secondary inventory unit.',
    built: true,
  },
  {
    slug: 'stock-mutation',
    title: 'Stock mutation',
    description: 'Every stock movement per product over a period, with the running balance after each transaction.',
    built: false,
  },
  {
    slug: 'inventory-valuation',
    title: 'Inventory valuation',
    description: 'On-hand quantity, average cost, and stock value per product at the end of a period.',
    built: false,
  },
  {
    slug: 'stock-card',
    title: 'Stock card',
    description: 'One product’s full stock history in a single card, from beginning balance to ending balance.',
    built: false,
  },
]

// ── Responsive column count ──────────────────────────────────────────────────
// Reduce columns as the grid narrows; never more columns than cards.
const MIN_CARD_WIDTH = 260
const gridEl = ref<HTMLElement | null>(null)
const cols = ref(reports.length)
function recompute() {
  const w = gridEl.value?.clientWidth ?? 0
  if (!w) return
  cols.value = Math.max(1, Math.min(reports.length, Math.floor(w / MIN_CARD_WIDTH)))
}
// Empty cells needed to complete the final row.
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
  if (r.built) router.push(`/inventory-report/${r.slug}`)
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
  /* Push the outer-right and outer-bottom borders past the clip so the rightmost
     column and last row never show an outer border. */
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
  /* Fixed block so every card's action sits on the same baseline across the row. */
  height: var(--mp-sizes-24, 96px);
  margin: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-regular, 400);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md, 20px);
}

/* Visual comes from .btn-enterprise--secondary (erp.css); only the placement is local. */
.report-view-btn { align-self: flex-start; }

</style>
