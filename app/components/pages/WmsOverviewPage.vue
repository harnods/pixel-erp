<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { warehouses } from '~/data/warehouses'
import { TODAY } from '~/data/master'
import {
  inboundAnalytics, outboundAnalytics, operatorOptions, fmtDur, fmtSignedDur,
  type AnalyticsFilter, type StageCard,
} from '~/data/wmsAnalytics'

const props = defineProps<{ direction: 'inbound' | 'outbound' }>()
const { t } = useLocale()
const router = useRouter()

// Clicking a live-operations card opens the matching operational list, filtered
// to its stage + status. Status casing matches each target page's own filter
// (Receipts/Requests filter by capitalized stage; task lists by lowercase status).
const STAGE_TARGETS: Record<'inbound' | 'outbound', Record<string, { tab: string; status: string }>> = {
  inbound: {
    pending:   { tab: 'Receipts',  status: 'Pending' },
    receiving: { tab: 'Receiving', status: 'in progress' },
    putaway:   { tab: 'Put-away',  status: 'in progress' },
    closed:    { tab: 'Receipts',  status: 'Completed' },
    noaction:  { tab: 'Receipts',  status: 'Open' },
  },
  outbound: {
    pending:  { tab: 'Requests', status: 'Pending' },
    picking:  { tab: 'Picking',  status: 'in progress' },
    packing:  { tab: 'Packing',  status: 'in progress' },
    shipping: { tab: 'Ready to ship', status: 'out for delivery' },
    closed:   { tab: 'Requests', status: 'Completed' },
    noaction: { tab: 'Requests', status: 'Open' },
  },
}
const sectionPath = computed(() => props.direction === 'inbound' ? '/inbound-delivery' : '/outbound-delivery')
function openStage(key: string) {
  const target = STAGE_TARGETS[props.direction][key]
  if (!target) return
  router.push({ path: sectionPath.value, query: { tab: target.tab, status: target.status } })
}

// ── Filters ───────────────────────────────────────────────────────────────────
const warehouseId = ref<string>('all')
const operator = ref<string>('all')
const periodDays = ref<number>(30)
const statMode = ref<'avg' | 'median'>('avg')
// A refresh nudge — bumping it re-stamps the "Updated" time (and, since the data
// is reactive, re-reads the live datasets).
const refreshedAt = ref<string>(TODAY.toTimeString().slice(0, 5))
function refresh() { refreshedAt.value = new Date().toTimeString().slice(0, 5) }

// Live operations reference day — Today / Yesterday / 2–3 days ago.
const liveDay = ref<number>(0)
const dayOptions = [
  { value: 0, label: 'Today' },
  { value: 1, label: 'Yesterday' },
  { value: 2, label: '2 days ago' },
  { value: 3, label: '3 days ago' },
]
const liveDate = computed(() => new Date(TODAY.getTime() - liveDay.value * 86_400_000))
const liveDayLabel = computed(() => {
  const opt = dayOptions.find((o) => o.value === liveDay.value)?.label ?? 'Today'
  return `${t(opt)} · ${liveDate.value.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}`
})

const filter = computed<AnalyticsFilter>(() => ({
  warehouseId: warehouseId.value,
  operator: operator.value,
  periodDays: periodDays.value,
  // Live operations reference day (Today / Yesterday / N days ago) — local date,
  // not toISOString (which would shift a day in +07:00).
  asOf: `${liveDate.value.getFullYear()}-${String(liveDate.value.getMonth() + 1).padStart(2, '0')}-${String(liveDate.value.getDate()).padStart(2, '0')}`,
}))
const model = computed(() => props.direction === 'inbound' ? inboundAnalytics(filter.value) : outboundAnalytics(filter.value))
const live = computed(() => model.value.live)
const perf = computed(() => model.value.performance)
// Volume/Activity/Accuracy share one column grid sized to the number of volume
// cards, so the cards fill the row and every card is the same width.
const metricCols = computed(() => `repeat(${perf.value.volume.length}, minmax(0, 1fr))`)

// ── Filter options ─────────────────────────────────────────────────────────────
const warehouseOptions = computed(() => [
  { value: 'all', label: t('All warehouses') },
  ...warehouses.map((w) => ({ value: w.id, label: w.name })),
])
const warehouseLabel = computed(() => warehouseOptions.value.find((o) => o.value === warehouseId.value)?.label ?? '')

const operatorList = computed(() => operatorOptions(props.direction, warehouseId.value))
const operatorOpts = computed(() => [{ value: 'all', label: t('All operators') }, ...operatorList.value.map((n) => ({ value: n, label: n }))])
const operatorLabel = computed(() => operator.value === 'all' ? t('All operators') : operator.value)

// Period presets shown as concrete date ranges (D-n … today), matching the design.
function rangeLabel(days: number): string {
  const to = TODAY
  const from = new Date(TODAY.getTime() - days * 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  return `${fmt(from)} – ${fmt(to)} ${to.getFullYear()}`
}
const periodOptions = computed(() => [
  { value: 7, label: 'Last 7 days', range: rangeLabel(7) },
  { value: 14, label: 'Last 14 days', range: rangeLabel(14) },
  { value: 30, label: 'Last 30 days', range: rangeLabel(30) },
  { value: 90, label: 'Last 90 days', range: rangeLabel(90) },
])
const periodLabel = computed(() => periodOptions.value.find((o) => o.value === periodDays.value)?.label ?? '')
// ── Stage bar scaling (Time spent per stage) ───────────────────────────────────
function stageVal(s: { avg: number | null; median: number | null }): number | null {
  return statMode.value === 'avg' ? s.avg : s.median
}
const barStages = computed(() => perf.value.stages.filter((s) => !s.total))
const cycleStage = computed(() => perf.value.stages.find((s) => s.total))
const cycleVal = computed(() => stageVal(cycleStage.value ?? { avg: null, median: null }))
const stagesSum = computed(() => barStages.value.reduce((sum, s) => sum + (stageVal(s) ?? 0), 0))
// Idle time inside the cycle not covered by the measured stages.
const idleMin = computed(() => cycleVal.value != null ? Math.max(0, cycleVal.value - stagesSum.value) : 0)

// Waterfall scale: everything is a proportion of the FULL cycle, and each stage
// starts where the previous one ended (offset = cumulative time before it), so the
// stage bars laid end-to-end line up with the full-width cycle bar at the bottom.
const stageTotal = computed(() => (cycleVal.value && cycleVal.value > 0 ? cycleVal.value : stagesSum.value || 1))
const stageBars = computed(() => {
  let acc = 0
  return barStages.value.map((s) => {
    const v = stageVal(s) ?? 0
    const left = (acc / stageTotal.value) * 100
    const width = (v / stageTotal.value) * 100
    acc += v
    return { s, left, width }
  })
})

function toneDot(kind: 'onTime' | 'late' | 'early'): string {
  return kind === 'onTime' ? 'dot--ontime' : kind === 'late' ? 'dot--late' : 'dot--early'
}
function stageAccent(s: StageCard): string {
  return s.tone === 'closed' ? 'card--closed' : s.tone === 'active' ? 'card--active' : 'card--pending'
}
</script>

<template>
  <div class="wms-analytics">
    <!-- ── Filter bar ── -->
    <div class="filter-bar">
      <MpPopover :id="`ovw-wh-${direction}`" is-close-on-select>
        <MpPopoverTrigger>
          <button type="button" class="filter-trigger" :style="{ width: '200px' }">
            <span class="filter-trigger-label">{{ warehouseLabel }}</span>
            <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', maxWidth: '320px' })">
          <MpPopoverList>
            <MpPopoverListItem v-for="opt in warehouseOptions" :key="opt.value"
              :is-active="opt.value === warehouseId" @click="warehouseId = opt.value">{{ opt.label }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>

      <MpPopover :id="`ovw-op-${direction}`" is-close-on-select>
        <MpPopoverTrigger>
          <button type="button" class="filter-trigger" :style="{ width: '190px' }">
            <span class="filter-trigger-label">{{ operatorLabel }}</span>
            <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '190px', width: 'max-content', maxWidth: '320px' })">
          <MpPopoverList>
            <MpPopoverListItem v-for="opt in operatorOpts" :key="opt.value"
              :is-active="opt.value === operator" @click="operator = opt.value">{{ opt.label }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>

    <!-- ══ Live operations ══ -->
    <section class="section">
      <div class="section-head">
        <div class="section-head-left">
          <h2 class="section-title">{{ t('Live operations') }}</h2>
          <MpPopover :id="`ovw-day-${direction}`" is-close-on-select>
            <MpPopoverTrigger>
              <button type="button" class="filter-trigger filter-trigger--auto filter-trigger--ghost">
                <span class="filter-trigger-label">{{ liveDayLabel }}</span>
                <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="opt in dayOptions" :key="opt.value"
                  :is-active="opt.value === liveDay" @click="liveDay = opt.value">{{ t(opt.label) }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <div class="section-head-right">
          <span class="updated">{{ t('Updated') }} {{ refreshedAt }}</span>
          <button class="link-btn" @click="refresh">
            <svg class="link-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66M17.5 3.5V8H13M6.5 20.5V16H11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {{ t('Refresh') }}
          </button>
        </div>
      </div>

      <div class="funnel">
        <div v-for="s in live.stages" :key="s.key" class="stat-card stat-card--clickable" :class="stageAccent(s)" role="button" tabindex="0" @click="openStage(s.key)" @keydown.enter="openStage(s.key)">
          <div class="stat-card-top">
            <span class="stat-card-title">{{ t(s.label) }}</span>
            <svg class="ext-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="stat-card-count">{{ s.count }}</div>
          <div class="stat-card-caption">{{ t(s.caption) }}</div>
          <div class="stat-card-divider" />
          <div class="stat-card-splits">
            <div class="split-row"><span>{{ t('On time') }}</span><b>{{ s.onTime }}</b></div>
            <div class="split-row split-row--late"><span>{{ t('Late') }}</span><b>{{ s.late }}</b></div>
            <div v-if="s.early !== undefined" class="split-row"><span>{{ t('Early') }}</span><b>{{ s.early }}</b></div>
          </div>
        </div>

        <!-- No ongoing action -->
        <div class="stat-card stat-card--clickable card--noaction" role="button" tabindex="0" @click="openStage('noaction')" @keydown.enter="openStage('noaction')">
          <div class="stat-card-top">
            <span class="stat-card-title">{{ t('No ongoing action') }}</span>
            <svg class="ext-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="stat-card-splits stat-card-splits--noaction">
            <div v-for="r in live.noAction.rows" :key="r.label" class="split-row"><span>{{ t(r.label) }}</span><b>{{ r.value }}</b></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ Performance ══ -->
    <section class="section">
      <div class="section-head">
        <div class="section-head-left">
          <h2 class="section-title">{{ t('Performance') }}</h2>
          <MpPopover :id="`ovw-period-${direction}`" is-close-on-select>
            <MpPopoverTrigger>
              <button type="button" class="filter-trigger filter-trigger--auto filter-trigger--ghost">
                <span class="filter-trigger-label">{{ t('Period') }}: {{ t(periodLabel) }}</span>
                <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '260px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="opt in periodOptions" :key="opt.value"
                  :is-active="opt.value === periodDays" @click="periodDays = opt.value">
                  <span class="period-opt"><span>{{ t(opt.label) }}</span><span class="period-opt-range">{{ opt.range }}</span></span>
                </MpPopoverListItem>
                <MpPopoverListItem :is-active="false">{{ t('Custom range…') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Overview (time spent per stage) — boxed -->
      <div class="sub-panel sub-panel--box">
        <div class="ov-head">
          <div class="ov-head-text">
            <h3 class="sub-title">{{ t(direction === 'inbound' ? 'Time spent per inbound stage' : 'Time spent per outbound stage') }}</h3>
            <p class="sub-desc">{{ t('Average time each stage takes, laid out in the order they happen. The bottom bar is the full cycle; time not covered by the stages is idle time between them.') }}</p>
          </div>
          <div class="ov-head-actions">
            <div class="seg-toggle">
              <button :class="{ active: statMode === 'avg' }" @click="statMode = 'avg'">{{ t('Average') }}</button>
              <button :class="{ active: statMode === 'median' }" @click="statMode = 'median'">{{ t('Median') }}</button>
            </div>
            <button type="button" class="ov-shortcut" :aria-label="t('Open report')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>

        <div class="stage-list">
          <div v-for="row in stageBars" :key="row.s.key" class="stage-row">
            <div class="stage-info">
              <span class="stage-name">{{ t(row.s.label) }}</span>
              <span class="stage-hint">{{ t(row.s.desc) }}</span>
            </div>
            <div class="stage-track">
              <!-- offset so this stage starts where the previous one ended; a 0m
                   stage renders no bar at all -->
              <div v-if="row.width > 0" class="stage-fill" :style="{ marginLeft: row.left + '%', width: row.width + '%' }" />
            </div>
            <span class="stage-val">{{ fmtDur(stageVal(row.s) ?? 0) }}</span>
          </div>

          <!-- Cycle bar — the whole span, one solid bar -->
          <div v-if="cycleStage" class="stage-row stage-row--cycle">
            <div class="stage-info">
              <span class="stage-name">{{ t(cycleStage.label) }}</span>
              <span class="stage-hint">{{ t(cycleStage.desc) }}</span>
            </div>
            <div class="stage-track">
              <div class="stage-fill stage-fill--cycle" :style="{ width: '100%' }" />
            </div>
            <span class="stage-val stage-val--strong">{{ fmtDur(cycleVal) }}</span>
          </div>
        </div>
      </div>

      <!-- Timeliness -->
      <div class="sub-panel">
        <h3 class="section-eyebrow">{{ t('Timeliness') }}</h3>
        <div class="metric-grid" :style="{ gridTemplateColumns: metricCols }">
          <div v-for="b in perf.timeliness" :key="b.label" class="metric-card">
            <div class="metric-card-head">
              <div class="metric-card-titles">
                <span class="metric-card-title">{{ t(b.label) }}</span>
                <span class="metric-card-desc">{{ t(b.desc) }}</span>
              </div>
              <button type="button" class="metric-shortcut" :aria-label="t('Open report')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
            <div class="metric-card-divider" />
            <div class="tl-stats">
              <div class="tl-stat">
                <span class="tl-stat-label">{{ t('Average') }}</span>
                <span class="tl-stat-val" :class="{ 'tl-stat-val--warn': b.signed }">{{ b.signed ? fmtSignedDur(b.avg) : fmtDur(b.avg) }}</span>
              </div>
              <div class="tl-stat">
                <span class="tl-stat-label">{{ t('Median') }}</span>
                <span class="tl-stat-val">{{ b.signed ? fmtSignedDur(b.median) : fmtDur(b.median) }}</span>
              </div>
            </div>
            <div v-if="b.signed" class="tl-note">{{ t('Positive means it closed later than its expected date; negative means earlier. The closer to zero, the more reliable the expected dates are.') }}</div>
          </div>
        </div>
      </div>

      <!-- Volume -->
      <div class="sub-panel">
        <h3 class="section-eyebrow">{{ t('Volume') }}</h3>
        <div class="metric-grid metric-grid--vol" :style="{ gridTemplateColumns: metricCols }">
          <div v-for="v in perf.volume" :key="v.label" class="stat-card stat-card--plain">
            <div class="stat-card-top">
              <span class="stat-card-title">{{ t(v.label) }}</span>
              <svg class="ext-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="stat-card-count">{{ v.main.toLocaleString('id-ID') }}</div>
            <div class="stat-card-caption">{{ t(v.rows[0].label) }}</div>
            <div class="stat-card-divider" />
            <div class="stat-card-splits">
              <div v-for="r in v.rows.slice(1)" :key="r.label" class="split-row" :class="{ 'split-row--pos': r.label.startsWith('Of ') }"><span>{{ t(r.label) }}</span><b>{{ r.value }}</b></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity ratios — a single card (same format as the volume cards) -->
      <div class="sub-panel">
        <div class="metric-grid metric-grid--single" :style="{ gridTemplateColumns: metricCols }">
          <div class="stat-card stat-card--plain">
            <div class="stat-card-top">
              <span class="stat-card-title">{{ t('Activity ratios') }}</span>
              <svg class="ext-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="stat-card-divider" />
            <div class="stat-card-splits">
              <div v-for="r in perf.activityRatios" :key="r.label" class="split-row"><span>{{ t(r.label) }}</span><b>{{ r.value.toLocaleString('id-ID') }}</b></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Accuracy — completion state, one bar per state -->
      <div class="sub-panel">
        <h3 class="section-eyebrow">{{ t('Accuracy') }}</h3>
        <div class="metric-grid metric-grid--wide" :style="{ gridTemplateColumns: metricCols }">
          <div class="stat-card stat-card--plain">
            <div class="stat-card-top">
              <div class="acc-titles">
                <span class="stat-card-title stat-card-title--strong">{{ t(direction === 'inbound' ? 'Inbound completion state' : 'Outbound fulfillment state') }}</span>
                <span class="acc-desc">{{ t(direction === 'inbound' ? 'Actual stock in vs the inbound qty' : 'Actual shipped vs the outbound qty') }}</span>
              </div>
              <svg class="ext-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="stat-card-divider" />
            <div class="acc-states">
              <div v-for="st in perf.accuracy.states" :key="st.key" class="acc-state">
                <div class="acc-state-head">
                  <span class="acc-state-label">{{ t(st.label) }}</span>
                  <span class="acc-state-val"><b>{{ st.count }}</b> · {{ st.pct }}%</span>
                </div>
                <div class="acc-state-track">
                  <div class="acc-state-fill" :class="`acc-fill--${st.key}`" :style="{ width: `${st.pct}%` }" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wms-analytics {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Filter bar ── */
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
/* Custom bordered dropdown trigger (fixed width → chevron never bleeds) */
.filter-trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 40px; padding: 0 12px;
  border: 1px solid var(--mp-border-form, var(--mp-border-default)); border-radius: 8px;
  background: var(--mp-background-default, #fff);
  font-size: 14px; color: var(--mp-text-default); cursor: pointer; text-align: left;
}
.filter-trigger--auto { width: auto; }
.filter-trigger:hover { border-color: var(--mp-border-bold); }
/* borderless variant — the Live operations date picker sits inline next to the title */
/* Overview date/period pickers: no box, just a bottom border (underline style). */
.filter-trigger--ghost { border-color: transparent; border-radius: 0; border-bottom-color: var(--mp-border-form, var(--mp-border-default)); background: transparent; padding-left: 4px; padding-right: 4px; }
.filter-trigger--ghost:hover { border-color: transparent; border-bottom-color: var(--mp-border-bold); background: var(--mp-background-neutral-subtle); }
.filter-trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filter-trigger .chev { color: var(--mp-icon-default); flex: none; }

/* ── Section (no box — open on the stage) ── */
.section-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap; margin-bottom: 16px;
}
.section-head-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.section-title { font-size: var(--mp-font-sizes-xl, 18px); font-weight: var(--mp-font-weights-semi-bold, 600); line-height: var(--mp-line-heights-xl, 26px); color: var(--mp-text-default); margin: 0; }
.section-head-right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.updated { font-size: 12px; color: var(--mp-text-subtle); }

.link-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 13px; font-weight: 500; color: var(--mp-text-link);
}
.link-btn:hover { text-decoration: underline; }
.link-btn .link-ico { flex: none; }

/* segmented Average/Median toggle — Pixel 3 ERP pill pattern (mirrors the
   Combined/By-orders toggle in PickingTaskDetailsPage): gray track, white active
   pill with shadow. Track uses --mp-background-neutral so it reads on the gray box. */
.seg-toggle { display: inline-flex; align-items: center; background: #ECEFF1; border-radius: var(--mp-radii-full, 999px); padding: 2px; gap: 2px; }
.seg-toggle button {
  height: 28px; padding: 0 var(--mp-spacing-3, 12px); border: none; border-radius: var(--mp-radii-full, 999px);
  background: none; font-size: var(--mp-font-sizes-sm, 13px); font-weight: var(--mp-font-weights-regular, 400);
  color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap;
}
.seg-toggle button:hover { color: var(--mp-text-default); }
.seg-toggle button.active { background: var(--mp-background-stage, #fff); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold, 600); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }

/* ── Live operations cards ── */
.funnel { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.stat-card {
  flex: 1 1 0; min-width: 176px;
  border: 1px solid var(--mp-border-default); border-radius: 10px;
  padding: 16px; display: flex; flex-direction: column; gap: 8px;
}
.stat-card--clickable { cursor: pointer; transition: border-color 0.12s ease; }
/* Hover affordance = a bolder shade of the card's OWN tone, not a drop-shadow. */
.stat-card--clickable:hover { border-color: var(--mp-border-bold, #758195); }
.stat-card--clickable.card--pending:hover  { border-color: var(--mp-background-warning-bold, #d98634); }
.stat-card--clickable.card--active:hover   { border-color: var(--mp-border-bold, #758195); }
.stat-card--clickable.card--closed:hover   { border-color: var(--mp-icon-success, #028454); }
.stat-card--clickable.card--noaction:hover { border-color: var(--mp-text-danger, #c4362b); }
.stat-card--clickable:focus-visible { outline: 2px solid var(--mp-border-focused, #4b61dc); outline-offset: 1px; }
.card--pending  { background: var(--mp-background-warning-subtle, #fdf7e7); border-color: var(--mp-border-warning, #ecd9a3); }
.card--active   { background: var(--mp-background-neutral-subtle, #f8f9f9); border-color: var(--mp-border-default); }
.card--closed   { background: var(--mp-background-success-subtle, #e9f5ed); border-color: var(--mp-border-success, #b6dcc1); }
.card--noaction { background: var(--mp-background-danger-subtle, #fdeeec); border-color: var(--mp-border-danger, #f1cbc5); }

.stat-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.stat-card-title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.card--noaction .stat-card-title { color: var(--mp-text-danger, #c4362b); }
.ext-ico { color: var(--mp-icon-subtle, #96a0a4); flex: none; }
.card--noaction .ext-ico { color: var(--mp-text-danger, #c4362b); }

.stat-card-count { font-size: 30px; font-weight: 700; color: var(--mp-text-default); line-height: 1.1; margin-top: 2px; }
.card--closed .stat-card-count { color: var(--mp-text-success, #028454); }
.stat-card-caption { font-size: 13px; font-weight: 400; color: var(--mp-text-secondary); margin-top: -2px; }

.stat-card-divider { height: 1px; background: color-mix(in srgb, currentColor 12%, transparent); margin-top: 4px; }
.stat-card-splits { display: flex; flex-direction: column; gap: 7px; }
.stat-card-splits--noaction { margin-top: 2px; }
.split-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--mp-text-secondary); }
.split-row b { color: var(--mp-text-default); font-weight: 700; }
.split-row--late b { color: var(--mp-text-danger, #c4362b); }
.card--closed .split-row:not(.split-row--late) b { color: var(--mp-text-success, #028454); }
.card--noaction .split-row b { color: var(--mp-text-danger, #c4362b); }

/* accuracy legend swatches */
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }
.dot--match { background: var(--mp-icon-success, #028454); }
.dot--short { background: var(--mp-background-warning-bold, #d98634); }
.dot--over  { background: var(--mp-background-brand-bold, #4b61dc); }

/* ── Performance sub-panels ── */
.sub-panel { padding: 24px 0 0; }
.sub-panel:first-of-type { padding-top: 0; }
/* Overview box — the time-per-stage chart lives in a white bordered card */
.sub-panel--box {
  padding: 20px;
  background: var(--mp-background-default, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: 10px;
}
.ov-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.ov-head-text { display: flex; flex-direction: column; gap: 4px; }
.ov-head-actions { display: flex; align-items: center; gap: 12px; flex: none; }
.ov-shortcut {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 4px; border: none; background: none; color: var(--mp-icon-default); cursor: pointer;
}
.ov-shortcut:hover { color: var(--mp-text-default); }
.sub-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); margin: 0; }
.sub-desc { font-size: 12px; color: var(--mp-text-secondary); margin: 0; max-width: 620px; line-height: 1.5; }
.period-opt { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; width: 100%; }
.period-opt-range { font-size: 12px; color: var(--mp-text-subtle); }
/* H3, black — Timeliness / Volume / Accuracy sub-headings. */
.section-eyebrow { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); margin: 0 0 8px; }
.cal-ico { color: var(--mp-icon-default); flex: none; }

/* stage bars — fixed label, flexible bar (fills), fixed time. The bar track
   (1fr) fills all the space between the label and the time, no side gaps. */
.stage-list { display: flex; flex-direction: column; gap: 14px; }
/* Time column is a FIXED width (each row is its own grid, so max-content would
   size the track differently per row and leave the track ends ragged). */
.stage-row { display: grid; grid-template-columns: 280px 1fr 76px; gap: 16px; align-items: center; }
.stage-info { display: flex; flex-direction: column; gap: 2px; }
.stage-name { font-size: 13px; font-weight: 500; color: var(--mp-text-default); }
.stage-hint { font-size: 11px; color: var(--mp-text-subtle); }
.stage-track { position: relative; height: 12px; background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: 999px; display: flex; align-items: center; }
/* Each stage is offset (margin-left, inline) so the bars lay end-to-end and the
   cumulative run matches the full-width cycle bar below. Light green for stages. */
.stage-fill { height: 100%; background: #93d3a6; border-radius: 999px; }
.stage-fill--cycle { background: #2f9e5f; }
.stage-val { text-align: right; font-size: 13px; font-weight: 400; color: var(--mp-text-secondary); white-space: nowrap; }
.stage-val--strong { color: var(--mp-text-default); font-weight: 500; }
.stage-row--cycle { margin-top: 4px; padding-top: 12px; border-top: 1px dashed var(--mp-border-default); }

/* Timeliness / Volume / Activity ratios — each stat is a white bordered card:
   title + shortcut, divider, then body. Cards in a grid stretch to equal height. */
/* auto-fill (not auto-fit) so empty tracks stay: a single card occupies exactly
   one column, the same width as a Volume card. Fits up to ~5 per row. */
.metric-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; align-items: stretch; }
.metric-grid--pair { grid-template-columns: repeat(2, minmax(0, 340px)); justify-content: start; }
/* --vol / --single / --wide inherit the base grid so every card is one column wide */
.metric-card {
  background: var(--mp-background-default, #fff); border: 1px solid var(--mp-border-default); border-radius: 12px; padding: 20px;
  display: flex; flex-direction: column; transition: border-color 0.12s ease;
}
.metric-card:hover { border-color: var(--mp-border-bold, #758195); }
.metric-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.metric-card-titles { display: flex; flex-direction: column; gap: 2px; }
.metric-card-title { font-size: 15px; font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.metric-card-desc { font-size: 12px; color: var(--mp-text-secondary); line-height: 1.4; }
.metric-card-divider { height: 1px; background: var(--mp-border-subtle, #EBF0F1); margin: 14px 0; }
.metric-card-rows { display: flex; flex-direction: column; gap: 8px; }

/* Timeliness body — Average / Median side by side + optional note */
.tl-stats { display: flex; gap: 40px; }
.tl-stat { display: flex; flex-direction: column; gap: 6px; }
.tl-stat-label { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--mp-text-subtle); }
.tl-stat-val { font-size: 26px; font-weight: 700; color: var(--mp-text-default); line-height: 1; }
.tl-stat-val--warn { color: var(--mp-text-warning, #c26a12); }
.tl-note { margin-top: 16px; padding: 12px 14px; background: var(--mp-background-warning-subtle, #fdf7e3); border-radius: 8px; font-size: 12px; color: var(--mp-text-warning, #8a6d1a); line-height: 1.5; }

/* Volume / Activity / Accuracy cards reuse the live-operations card format but
   stay white; hover boldens the border (matching the live-ops cards). */
.stat-card--plain { background: var(--mp-background-default, #fff); transition: border-color 0.12s ease; }
.stat-card--plain:hover { border-color: var(--mp-border-bold, #758195); }
.split-row--pos b { color: var(--mp-text-success, #028454); }

/* large rows (activity ratios) */
.metric-line-lg { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.metric-line-lg span { font-size: 14px; color: var(--mp-text-secondary); }
.metric-line-lg b { font-size: 18px; font-weight: 700; color: var(--mp-text-default); }
.metric-shortcut {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px; border: none; background: none; color: var(--mp-icon-default); cursor: pointer; flex: none;
}
.metric-shortcut:hover { color: var(--mp-text-default); }

/* accuracy — completion state, one progress bar per state */
.acc-titles { display: flex; flex-direction: column; gap: 2px; }
.stat-card-title--strong { font-size: 17px; font-weight: var(--mp-font-weights-semi-bold, 600); }
.acc-desc { font-size: 13px; color: var(--mp-text-secondary); }
.acc-states { display: flex; flex-direction: column; gap: 18px; }
.acc-state { display: flex; flex-direction: column; gap: 8px; }
.acc-state-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.acc-state-label { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.acc-state-val { font-size: 14px; color: var(--mp-text-secondary); }
.acc-state-val b { color: var(--mp-text-default); font-weight: 700; }
.acc-state-track { height: 10px; border-radius: 999px; background: var(--mp-background-neutral-subtle, #eef0f1); overflow: hidden; }
.acc-state-fill { height: 100%; border-radius: 999px; }
.acc-fill--match { background: var(--mp-icon-success, #028454); }
.acc-fill--short { background: #a8352d; }
.acc-fill--over  { background: var(--mp-background-warning-bold, #d98634); }
</style>
