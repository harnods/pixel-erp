<script setup lang="ts">
/**
 * WMS Overview — "WMS Analytics" dashboard (design: 290726 WMS Analytics and
 * Report V2). Inbound-focused analytics with four sections: Live operations
 * (status pipeline), Performance (stage timings + timeliness), Volume, and
 * Accuracy. Pixel 3 DT 2.4 enterprise tokens throughout; demo numbers match the
 * design (illustrative — this is a preview analytics surface).
 */
import { ref } from 'vue'
import { MpSelect, MpIcon } from '@mekari/pixel3'

const router = useRouter()
function goWms() { router.push('/overview') }

// ── Top tabs (WMS Analytics sub-sections; Overview active) ─────────────────────
const TABS = ['Overview', 'Inbound deliveries', 'Outbound deliveries', 'Stock'] as const
const activeTab = ref<(typeof TABS)[number]>('Overview')

// ── Filters (illustrative) ─────────────────────────────────────────────────────
const warehouse = ref('all')
const operator = ref('all')

// ── Live operations — status pipeline ──────────────────────────────────────────
interface StatusCard {
  key: string
  title: string
  count: number
  countUnit: string
  breakdown: { label: string; value: number; tone: 'success' | 'critical' | 'info' }[]
}
const liveStatuses: StatusCard[] = [
  { key: 'not-started', title: 'Has not started', count: 8, countUnit: 'pending', breakdown: [
    { label: 'On time', value: 6, tone: 'success' },
    { label: 'Late', value: 2, tone: 'critical' },
  ] },
  { key: 'receiving', title: 'On receiving', count: 8, countUnit: 'active', breakdown: [
    { label: 'On time', value: 6, tone: 'success' },
    { label: 'Late', value: 2, tone: 'critical' },
    { label: 'Early', value: 0, tone: 'info' },
  ] },
  { key: 'putaway', title: 'On putaway', count: 5, countUnit: 'active', breakdown: [
    { label: 'On time', value: 2, tone: 'success' },
    { label: 'Late', value: 2, tone: 'critical' },
    { label: 'Early', value: 1, tone: 'info' },
  ] },
  { key: 'closed', title: 'Closed', count: 23, countUnit: 'closed', breakdown: [
    { label: 'On time', value: 18, tone: 'success' },
    { label: 'Late', value: 0, tone: 'critical' },
    { label: 'Early', value: 5, tone: 'info' },
  ] },
]
const noAction = [
  { label: 'No task', value: 4 },
  { label: 'Open receiving', value: 2 },
  { label: 'Open putaway', value: 0 },
]

// ── Performance — time spent per inbound stage ─────────────────────────────────
const stageMetric = ref<'average' | 'median'>('average')
// pct = share of the full inbound cycle time (bars sit under the cycle bar).
const stages = [
  { label: 'Inbound created → receiving started', sub: 'Waiting time before the goods are touched', value: '3h 12m', pct: 58.2 },
  { label: 'Receiving', sub: 'Receiving start until receiving finish', value: '46m', pct: 13.9 },
  { label: 'Putaway', sub: 'Receiving finish until putaway finish', value: '1h 22m', pct: 24.8 },
]
const cycle = { label: 'Inbound cycle time', sub: 'Inbound created until putaway finish', value: '5h 30m' }

const timeliness = [
  { label: 'Inbound → expected arrival', sub: 'Inbound created until the expected arrival date', avg: '1h 48m', median: '1h 20m' },
  { label: 'Inbound timeliness', sub: 'Expected closed time vs actual closed time', avg: '+2h 15m', median: '+45m' },
]

// ── Volume ──────────────────────────────────────────────────────────────────────
interface VolumeCard { title: string; big: string; bigUnit: string; rows: { label: string; value: string }[] }
const volume: VolumeCard[] = [
  { title: 'Total inbound created', big: '142', bigUnit: 'Inbound', rows: [
    { label: 'Distinct SKU', value: '68' }, { label: 'Total qty', value: '12.480' },
  ] },
  { title: 'Total closed inbound', big: '128', bigUnit: 'Inbound', rows: [
    { label: 'Distinct SKU', value: '63' }, { label: 'Total qty', value: '11.020' },
  ] },
  { title: 'Total receiving', big: '196', bigUnit: 'Receivings', rows: [
    { label: 'Distinct SKU', value: '71' }, { label: 'Avg SKU / receiving', value: '2,4' },
    { label: 'Total qty received', value: '11.310' }, { label: 'Avg qty / receiving', value: '57,7' },
    { label: 'Of inbound qty', value: '99,0%' },
  ] },
  { title: 'Total putaway', big: '181', bigUnit: 'Putaways', rows: [
    { label: 'Distinct SKU', value: '69' }, { label: 'Avg SKU / putaway', value: '2,2' },
    { label: 'Total qty put away', value: '10.940' }, { label: 'Avg qty / putaway', value: '60,4' },
    { label: 'Of inbound qty', value: '96,5%' },
  ] },
]
const ratios = [
  { label: 'Receiving / inbound', value: '1,5' },
  { label: 'Putaway / receiving', value: '1,1' },
]

// ── Accuracy — inbound completion state ────────────────────────────────────────
const completion = [
  { label: 'Match expected', value: 96, pct: 75, tone: 'success' as const },
  { label: 'Short expected', value: 22, pct: 17, tone: 'critical' as const },
  { label: 'Over expected', value: 10, pct: 8, tone: 'info' as const },
]
</script>

<template>
  <div class="ov-page">
    <!-- ── Header: breadcrumb + title + filters ── -->
    <header class="ov-bar">
      <div class="ov-bar-left">
        <nav class="ov-breadcrumb">
          <button class="ov-crumb" @click="goWms">WMS</button>
          <span class="ov-crumb-sep">/</span>
          <span class="ov-crumb ov-crumb--current">Overview</span>
        </nav>
        <div class="ov-titlerow">
          <h1 class="ov-title">WMS Analytics</h1>
          <div class="ov-summary">
            <span class="ov-chip"><span class="ov-chip-label">Inbound</span><span class="ov-chip-value">21</span></span>
            <span class="ov-chip"><span class="ov-chip-label">Outbound</span><span class="ov-chip-value">33</span></span>
          </div>
        </div>
      </div>
      <div class="ov-filters">
        <MpSelect id="ov-warehouse" v-model="warehouse" :class="{}">
          <option value="all">All warehouses</option>
        </MpSelect>
        <MpSelect id="ov-operator" v-model="operator">
          <option value="all">All operators</option>
        </MpSelect>
      </div>
    </header>

    <!-- ── Tabs ── -->
    <div class="ov-tabs" role="tablist">
      <button
        v-for="t in TABS" :key="t"
        class="ov-tab" :class="{ 'ov-tab--active': activeTab === t }"
        role="tab" :aria-selected="activeTab === t"
        @click="activeTab = t"
      >{{ t }}</button>
    </div>

    <!-- ── Overview tab ── -->
    <div v-if="activeTab === 'Overview'" class="ov-body">
      <!-- Live operations -->
      <section class="ov-section">
        <div class="ov-section-head">
          <h2 class="ov-section-title">Live operations</h2>
          <div class="ov-section-meta">
            <span>Today · 24 Jul 2026</span>
            <span class="ov-dot">·</span>
            <span>Updated 14:32</span>
            <button class="ov-refresh" type="button"><MpIcon name="refresh" size="sm" /> Refresh</button>
          </div>
        </div>
        <div class="ov-live-grid">
          <article v-for="s in liveStatuses" :key="s.key" class="ov-card ov-status">
            <p class="ov-status-title">{{ s.title }}</p>
            <p class="ov-status-count">{{ s.count }} <span class="ov-status-unit">{{ s.countUnit }}</span></p>
            <ul class="ov-status-breakdown">
              <li v-for="b in s.breakdown" :key="b.label" class="ov-bd-row">
                <span class="ov-bd-dot" :class="`ov-bd-dot--${b.tone}`" />
                <span class="ov-bd-label">{{ b.label }}</span>
                <span class="ov-bd-value" :class="`ov-bd-value--${b.tone}`">{{ b.value }}</span>
              </li>
            </ul>
          </article>
          <article class="ov-card ov-status ov-status--muted">
            <p class="ov-status-title">No ongoing action</p>
            <ul class="ov-status-breakdown ov-status-breakdown--top">
              <li v-for="n in noAction" :key="n.label" class="ov-bd-row">
                <span class="ov-bd-label">{{ n.label }}</span>
                <span class="ov-bd-value">{{ n.value }}</span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <!-- Performance -->
      <section class="ov-section">
        <div class="ov-section-head">
          <h2 class="ov-section-title">Performance</h2>
          <span class="ov-section-meta">Period 18 – 24 Jul 2026</span>
        </div>
        <div class="ov-perf-grid">
          <article class="ov-card ov-perf-main">
            <div class="ov-card-head">
              <div>
                <p class="ov-card-title">Time spent per inbound stage</p>
                <p class="ov-card-sub">Average time each stage takes, laid out in the order they happen. The bottom bar is the full cycle; idle time sits between the stages.</p>
              </div>
              <div class="ov-toggle">
                <button class="ov-toggle-btn" :class="{ 'ov-toggle-btn--on': stageMetric === 'average' }" @click="stageMetric = 'average'">Average</button>
                <button class="ov-toggle-btn" :class="{ 'ov-toggle-btn--on': stageMetric === 'median' }" @click="stageMetric = 'median'">Median</button>
              </div>
            </div>
            <ul class="ov-stages">
              <li v-for="st in stages" :key="st.label" class="ov-stage">
                <div class="ov-stage-info">
                  <span class="ov-stage-label">{{ st.label }}</span>
                  <span class="ov-stage-sub">{{ st.sub }}</span>
                </div>
                <div class="ov-stage-barwrap">
                  <div class="ov-stage-track"><div class="ov-stage-fill" :style="{ width: st.pct + '%' }" /></div>
                  <span class="ov-stage-value">{{ st.value }}</span>
                </div>
              </li>
              <li class="ov-stage ov-stage--total">
                <div class="ov-stage-info">
                  <span class="ov-stage-label">{{ cycle.label }}</span>
                  <span class="ov-stage-sub">{{ cycle.sub }}</span>
                </div>
                <div class="ov-stage-barwrap">
                  <div class="ov-stage-track"><div class="ov-stage-fill ov-stage-fill--total" style="width:100%" /></div>
                  <span class="ov-stage-value ov-stage-value--strong">{{ cycle.value }}</span>
                </div>
              </li>
            </ul>
          </article>
          <article class="ov-card ov-perf-side">
            <p class="ov-card-title">Timeliness</p>
            <ul class="ov-timeliness">
              <li v-for="t in timeliness" :key="t.label" class="ov-tl-row">
                <p class="ov-tl-label">{{ t.label }}</p>
                <p class="ov-tl-sub">{{ t.sub }}</p>
                <div class="ov-tl-stats">
                  <div><span class="ov-tl-cap">Average</span><span class="ov-tl-val">{{ t.avg }}</span></div>
                  <div><span class="ov-tl-cap">Median</span><span class="ov-tl-val">{{ t.median }}</span></div>
                </div>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <!-- Volume -->
      <section class="ov-section">
        <div class="ov-section-head"><h2 class="ov-section-title">Volume</h2></div>
        <div class="ov-stat-grid">
          <article v-for="v in volume" :key="v.title" class="ov-card ov-vol">
            <p class="ov-card-title">{{ v.title }}</p>
            <p class="ov-vol-big">{{ v.big }} <span class="ov-vol-unit">{{ v.bigUnit }}</span></p>
            <dl class="ov-vol-rows">
              <div v-for="r in v.rows" :key="r.label" class="ov-vol-row">
                <dt>{{ r.label }}</dt><dd>{{ r.value }}</dd>
              </div>
            </dl>
          </article>
        </div>
        <div class="ov-ratios">
          <span class="ov-ratios-title">Activity ratios</span>
          <span v-for="r in ratios" :key="r.label" class="ov-ratio">
            <span class="ov-ratio-label">{{ r.label }}</span>
            <span class="ov-ratio-value">{{ r.value }}</span>
          </span>
        </div>
      </section>

      <!-- Accuracy -->
      <section class="ov-section">
        <div class="ov-section-head"><h2 class="ov-section-title">Accuracy</h2></div>
        <article class="ov-card ov-accuracy">
          <p class="ov-card-title">Inbound completion state</p>
          <p class="ov-card-sub">Actual stock in vs the inbound qty</p>
          <div class="ov-acc-bar">
            <div
              v-for="c in completion" :key="c.label"
              class="ov-acc-seg" :class="`ov-acc-seg--${c.tone}`"
              :style="{ width: c.pct + '%' }"
            />
          </div>
          <ul class="ov-acc-legend">
            <li v-for="c in completion" :key="c.label" class="ov-acc-item">
              <span class="ov-bd-dot" :class="`ov-bd-dot--${c.tone}`" />
              <span class="ov-acc-label">{{ c.label }}</span>
              <span class="ov-acc-value">{{ c.value }} <span class="ov-acc-pct">· {{ c.pct }}%</span></span>
            </li>
          </ul>
        </article>
      </section>
    </div>

    <!-- ── Other tabs (placeholder) ── -->
    <div v-else class="ov-placeholder">
      <p class="ov-placeholder-title">{{ activeTab }}</p>
      <p class="ov-placeholder-desc">Analytics for {{ activeTab.toLowerCase() }} appear here.</p>
    </div>
  </div>
</template>

<style scoped>
.ov-page { display: flex; flex-direction: column; min-height: 100%; background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* ── Header ── */
.ov-bar {
  display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4) var(--mp-spacing-6) 0;
}
.ov-breadcrumb { display: flex; align-items: center; gap: var(--mp-spacing-1); margin-bottom: var(--mp-spacing-1); }
.ov-crumb { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-crumb--current { color: var(--mp-text-default); cursor: default; }
.ov-crumb-sep { color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-sm); }
.ov-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.ov-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-text-default); }
.ov-summary { display: flex; gap: var(--mp-spacing-2); }
.ov-chip { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: 2px var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); }
.ov-chip-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-chip-value { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-filters { display: flex; gap: var(--mp-spacing-2); }

/* ── Tabs ── */
.ov-tabs { display: flex; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-6) 0; border-bottom: 1px solid var(--mp-border-default); }
.ov-tab { background: none; border: none; padding: var(--mp-spacing-2) var(--mp-spacing-3); margin-bottom: -1px; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); border-bottom: 2px solid transparent; }
.ov-tab:hover { color: var(--mp-text-default); }
.ov-tab--active { color: var(--mp-text-brand, #028454); font-weight: var(--mp-font-weights-semi-bold); border-bottom-color: var(--mp-border-brand, #028454); }

/* ── Body / sections ── */
.ov-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-8); }
.ov-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ov-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.ov-section-title { margin: 0; font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-section-meta { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-dot { color: var(--mp-text-subtle); }
.ov-refresh { display: inline-flex; align-items: center; gap: 4px; margin-left: var(--mp-spacing-2); padding: 4px var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral, #fff); cursor: pointer; color: var(--mp-text-default); font-size: var(--mp-font-sizes-sm); }

/* ── Cards ── */
.ov-card { background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-4); }
.ov-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
.ov-card-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-card-sub { margin: 4px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 18px); max-width: 520px; }

/* ── Live operations ── */
.ov-live-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.ov-status { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ov-status--muted { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.ov-status-title { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-status-count { margin: 0; font-size: 28px; font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-text-default); }
.ov-status-unit { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-subtle); }
.ov-status-breakdown { list-style: none; margin: 0; padding: var(--mp-spacing-2) 0 0; border-top: 1px solid var(--mp-border-subtle, var(--mp-border-default)); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ov-status-breakdown--top { border-top: none; padding-top: 0; }
.ov-bd-row { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); }
.ov-bd-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: var(--mp-text-subtle); }
.ov-bd-dot--success { background: var(--mp-icon-success, #028454); }
.ov-bd-dot--critical { background: var(--mp-icon-critical, #a8352d); }
.ov-bd-dot--info { background: var(--mp-icon-informative, #4a7fb5); }
.ov-bd-label { flex: 1; color: var(--mp-text-secondary); }
.ov-bd-value { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-bd-value--success { color: var(--mp-text-success, #028454); }
.ov-bd-value--critical { color: var(--mp-text-critical, #a8352d); }
.ov-bd-value--info { color: var(--mp-text-informative, #4a7fb5); }

/* ── Performance ── */
.ov-perf-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--mp-spacing-3); }
.ov-toggle { display: inline-flex; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; flex-shrink: 0; }
.ov-toggle-btn { background: var(--mp-background-neutral, #fff); border: none; padding: 4px var(--mp-spacing-3); cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-toggle-btn--on { background: var(--mp-background-neutral-subtle-pressed, #e2e8f0); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.ov-stages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ov-stage { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--mp-spacing-4); align-items: center; }
.ov-stage--total { padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); }
.ov-stage-info { display: flex; flex-direction: column; }
.ov-stage-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.ov-stage-sub { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-subtle); }
.ov-stage-barwrap { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.ov-stage-track { flex: 1; height: 12px; border-radius: 999px; background: var(--mp-background-neutral-subtle-pressed, #ebf0f1); overflow: hidden; }
.ov-stage-fill { height: 100%; border-radius: 999px; background: var(--mp-background-success-subtle-hovered, #96d6ba); }
.ov-stage-fill--total { background: var(--mp-background-success-bold, #029861); }
.ov-stage-value { width: 64px; text-align: right; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.ov-stage-value--strong { font-weight: var(--mp-font-weights-bold, 700); }
.ov-perf-side { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ov-timeliness { list-style: none; margin: var(--mp-spacing-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ov-tl-label { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-tl-sub { margin: 2px 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-subtle); }
.ov-tl-stats { display: flex; gap: var(--mp-spacing-6); }
.ov-tl-stats > div { display: flex; flex-direction: column; }
.ov-tl-cap { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-subtle); }
.ov-tl-val { font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

/* ── Volume ── */
.ov-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.ov-vol { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ov-vol-big { margin: 0; font-size: 28px; font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-text-default); }
.ov-vol-unit { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-subtle); }
.ov-vol-rows { margin: var(--mp-spacing-1) 0 0; padding: var(--mp-spacing-2) 0 0; border-top: 1px solid var(--mp-border-subtle, var(--mp-border-default)); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ov-vol-row { display: flex; align-items: center; justify-content: space-between; font-size: var(--mp-font-sizes-sm); }
.ov-vol-row dt { color: var(--mp-text-secondary); margin: 0; }
.ov-vol-row dd { margin: 0; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.ov-ratios { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 12px); }
.ov-ratios-title { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-ratio { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.ov-ratio-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-ratio-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-text-default); }

/* ── Accuracy ── */
.ov-accuracy { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ov-acc-bar { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: var(--mp-background-neutral-subtle-pressed, #ebf0f1); }
.ov-acc-seg { height: 100%; }
.ov-acc-seg--success { background: var(--mp-background-success-bold, #029861); }
.ov-acc-seg--critical { background: var(--mp-background-critical-bold, #a8352d); }
.ov-acc-seg--info { background: var(--mp-background-informative-bold, #4a7fb5); }
.ov-acc-legend { list-style: none; margin: 0; padding: 0; display: flex; gap: var(--mp-spacing-6); }
.ov-acc-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); }
.ov-acc-label { color: var(--mp-text-secondary); }
.ov-acc-value { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-acc-pct { color: var(--mp-text-subtle); font-weight: var(--mp-font-weights-regular); }

/* ── Placeholder tabs ── */
.ov-placeholder { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: var(--mp-spacing-10, 40px) 0; }
.ov-placeholder-title { margin: 0; font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-placeholder-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

@media (max-width: 1280px) {
  .ov-live-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ov-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ov-perf-grid { grid-template-columns: 1fr; }
}
</style>
