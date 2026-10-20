<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { MpButton } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
// Production → Reports index (Reports module → Production submenu, and the
// Production menu's "Production reports" shortcut). Same card grid as Reports ›
// Inventory. The Subcon order card exports straight to Excel: its button opens
// SubconOrderExportModal (date range, product, vendor) instead of a report page
// (2026-10-20). The page at /production-report/subcon-order stays routable.
import SubconOrderExportModal from '~/components/patterns/SubconOrderExportModal.vue'
const { t } = useLocale()

interface ReportCard {
  slug: string
  title: string
  description: string
  /** false → no report page yet; "View report" shows the coming-soon toast. */
  built: boolean
}
const reports: ReportCard[] = [
  {
    slug: 'subcon-order',
    title: 'Subcon order',
    description: 'Every subcontracting work order with its vendor, supply method, quantity received and promised return date.',
    built: true,
  },
]

// ── Responsive column count ──────────────────────────────────────────────────
// Reduce columns as the grid narrows. Capped at the 4 the other report indexes
// show, not at the card count: with one card, capping at the count stretched it
// across the whole stage. Fillers complete the row instead.
const MIN_CARD_WIDTH = 260
const MAX_COLS = 4
const gridEl = ref<HTMLElement | null>(null)
const cols = ref(MAX_COLS)
function recompute() {
  const w = gridEl.value?.clientWidth ?? 0
  if (!w) return
  cols.value = Math.max(1, Math.min(MAX_COLS, Math.floor(w / MIN_CARD_WIDTH)))
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

const exportOpen = ref(false)
function exportReport(r: ReportCard) {
  if (r.built) exportOpen.value = true
  else infoToast(`${t(r.title)} report — coming soon`)
}
</script>

<template>
  <div class="reports-clip">
    <div ref="gridEl" class="reports-grid" :style="{ '--cols': cols }">
      <div v-for="r in reports" :key="r.slug" class="report-card" :data-devchange="r.slug === 'subcon-order' ? 'subcon-order-report' : undefined">
        <div class="report-card-body">
          <h2 class="report-card-title">{{ t(r.title) }}</h2>
          <p class="report-card-desc">{{ t(r.description) }}</p>
        </div>
        <MpButton variant="secondary" is-rounded class="report-view-btn" data-devchange="subcon-report-export-button" @click="exportReport(r)">{{ t('Export report') }}</MpButton>
      </div>
      <!-- Empty filler cells keep the last row's columns present (complete grid). -->
      <div v-for="n in fillerCount" :key="`filler-${n}`" class="report-card report-card--filler" aria-hidden="true" />
    </div>
    <SubconOrderExportModal :is-open="exportOpen" @close="exportOpen = false" />
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
