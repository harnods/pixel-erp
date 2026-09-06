<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { MpButton } from '@mekari/pixel3'
// WMS → Reports index (Reports module → WMS submenu). Lists the four WMS reports;
// each "View report" opens its raw-data table. Design: Figma Reports/WMS/Index
// (node 4543-36259), built with Pixel 3 DT 2.4 enterprise tokens.
//
// Cards fill the full stage width as an equal-column grid. On narrower widths the
// column count drops; the last row is padded with empty filler cells so the grid
// stays a complete rectangle (every column present top and bottom). The outer
// right + bottom borders are clipped, so the rightmost column never shows a border.
const { t } = useLocale()
const router = useRouter()

interface ReportCard {
  slug: string
  title: string
  description: string
}
const reports: ReportCard[] = [
  {
    slug: 'inbound-timeliness',
    title: 'Inbound timeliness',
    description: 'Tracks how quickly inbound shipments are received and processed. Essential for monitoring supplier delivery performance.',
  },
  {
    slug: 'inbound-accuracy',
    title: 'Inbound accuracy',
    description: 'Measures the correctness of inbound shipments against purchase orders. Essential for identifying receiving discrepancies.',
  },
  {
    slug: 'outbound-timeliness',
    title: 'Outbound timeliness',
    description: 'Tracks how quickly outbound orders are picked, packed, and shipped. Essential for meeting customer delivery expectations.',
  },
  {
    slug: 'outbound-accuracy',
    title: 'Outbound accuracy',
    description: 'Measures the correctness of outbound orders shipped to customers. Essential for reducing returns and improving satisfaction.',
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

function viewReport(slug: string) {
  router.push(`/wms-report/${slug}`)
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
        <MpButton variant="secondary" is-rounded class="report-view-btn" @click="viewReport(r.slug)">{{ t('View report') }}</MpButton>
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
