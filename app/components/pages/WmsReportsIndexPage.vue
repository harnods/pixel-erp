<script setup lang="ts">
// WMS → Reports index (Reports module → WMS submenu). Lists the four WMS reports;
// each "View report" opens its raw-data table. Design: Figma Reports/WMS/Index
// (node 4543-36259), built with Pixel 3 DT 2.4 enterprise tokens.
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

function viewReport(slug: string) {
  router.push(`/wms-report/${slug}`)
}
</script>

<template>
  <div class="reports-grid">
    <div v-for="r in reports" :key="r.slug" class="report-card">
      <div class="report-card-body">
        <h2 class="report-card-title">{{ t(r.title) }}</h2>
        <p class="report-card-desc">{{ t(r.description) }}</p>
      </div>
      <button type="button" class="report-view-btn" @click="viewReport(r.slug)">{{ t('View report') }}</button>
    </div>
  </div>
</template>

<style scoped>
/* Cards laid out in a wrapping grid, divided by 1px borders (like the Figma
   List Group). Each card is a fixed 300px; a right + bottom border draws the
   grid lines. The last card in a row keeps its right border only when another
   card follows — handled with :not(:last-child) for the final card. */
.reports-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
}
.report-card {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3, 12px);
  padding: var(--mp-spacing-5, 20px);
  border-right: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.report-card:last-child { border-right: none; }

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
