<script setup lang="ts">
/**
 * WMS Overview — "WMS Analytics" page (WMS PRD 1.4, user stories 1–3 only).
 * Story 1: the shell — WMS ▸ Overview, Inbound/Outbound tabs, an Operational
 * (live) and a Post-Operational (performance) section, per-section filters, a
 * Refresh button + "Updated at hh:mm", on-screen only (no export).
 * Story 2/3: the Operational quick-view cards for Inbound (Pending / On
 * receiving / On putaway / Closed) and Outbound (Pending / On picking / On
 * packing / On shipping). Counts are derived live from the mock data
 * (data/wmsAnalytics.ts), scoped by warehouse + operator + a single date.
 * The Post-Operational section is out of scope for stories 1–3 (placeholder).
 */
import { ref, computed, watch, onMounted } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import { warehouses } from '~/data/warehouses'
import { TODAY } from '~/data/master'
import { inboundQuickview, outboundQuickview, operatorNames } from '~/data/wmsAnalytics'

const router = useRouter()
function goWms() { router.push('/overview') }

const TABS = ['Inbound', 'Outbound'] as const
const activeTab = ref<(typeof TABS)[number]>('Inbound')

// ── Filters (Operational section) ──────────────────────────────────────────────
const activeWarehouses = computed(() => warehouses.filter(w => w.status === 'active' && !w.isDefault))
const warehouse = ref<string>('all')
const MOCK_TODAY = TODAY.toISOString().slice(0, 10) // mock data anchor (2026-06-26)
const date = ref<string>(MOCK_TODAY)
const operator = ref<string>('all')

const whIds = computed<string[] | undefined>(() => (warehouse.value === 'all' ? undefined : [warehouse.value]))
const operatorOptions = computed(() => [
  { value: 'all', label: 'All operators' },
  { value: 'not-assigned', label: 'Not assigned' },
  ...operatorNames(whIds.value).map(n => ({ value: n, label: n })),
])

// ── "Updated at hh:mm" — restamped on mount, refresh, and any filter change ─────
const updatedAt = ref('')
function stamp() {
  const d = new Date()
  updatedAt.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function refresh() { stamp() }
onMounted(stamp)
watch([warehouse, date, operator, activeTab], stamp)

// ── Derived quick-view data ─────────────────────────────────────────────────────
const inbound = computed(() => inboundQuickview(date.value, whIds.value, operator.value))
const outbound = computed(() => outboundQuickview(date.value, whIds.value, operator.value))

interface Qv { key: string; title: string; total: number; unit: string; note?: string; to: string; rows: { label: string; value: number }[] }

const inboundCards = computed<Qv[]>(() => {
  const i = inbound.value
  return [
    { key: 'pending', title: 'Pending inbound', total: i.pending.total, unit: 'pending', note: 'Not yet worked on', to: '/inbound-delivery', rows: [
      { label: 'Should arrive this date', value: i.pending.onDate },
      { label: 'Overdue, not finished', value: i.pending.before },
    ] },
    { key: 'receiving', title: 'On receiving', total: i.receiving.total, unit: 'active', to: '/inbound-delivery', rows: [
      { label: 'Arriving this date', value: i.receiving.onDate },
      { label: 'Arriving earlier', value: i.receiving.before },
      { label: 'Arriving later', value: i.receiving.after },
    ] },
    { key: 'putaway', title: 'On putaway', total: i.putaway.total, unit: 'active', to: '/inbound-delivery', rows: [
      { label: 'Arriving this date', value: i.putaway.onDate },
      { label: 'Arriving earlier', value: i.putaway.before },
      { label: 'Arriving later', value: i.putaway.after },
    ] },
    { key: 'closed', title: 'Closed inbound', total: i.closed.total, unit: 'closed', to: '/inbound-delivery', rows: [
      { label: 'Expected this date', value: i.closed.onDate },
      { label: 'Expected earlier', value: i.closed.before },
      { label: 'Expected later', value: i.closed.after },
    ] },
  ]
})
const outboundCards = computed<Qv[]>(() => {
  const o = outbound.value
  return [
    { key: 'pending', title: 'Pending outbound', total: o.pending.total, unit: 'pending', note: 'Not yet worked on', to: '/outbound-delivery', rows: [
      { label: 'Should complete this date', value: o.pending.onDate },
      { label: 'Overdue, not finished', value: o.pending.before },
    ] },
    { key: 'picking', title: 'On picking', total: o.picking.total, unit: 'active', to: '/outbound-delivery', rows: [
      { label: 'Due this date', value: o.picking.onDate },
      { label: 'Due earlier', value: o.picking.before },
      { label: 'Due later', value: o.picking.after },
    ] },
    { key: 'packing', title: 'On packing', total: o.packing.total, unit: 'active', to: '/outbound-delivery', rows: [
      { label: 'Due this date', value: o.packing.onDate },
      { label: 'Due earlier', value: o.packing.before },
      { label: 'Due later', value: o.packing.after },
    ] },
    { key: 'shipping', title: 'On shipping', total: o.shipping.total, unit: 'active', to: '/outbound-delivery', rows: [
      { label: 'Due this date', value: o.shipping.onDate },
      { label: 'Due earlier', value: o.shipping.before },
      { label: 'Due later', value: o.shipping.after },
    ] },
  ]
})
const cards = computed(() => (activeTab.value === 'Inbound' ? inboundCards.value : outboundCards.value))

function openCard(c: Qv) { router.push(c.to) }
</script>

<template>
  <div class="ov-page">
    <!-- Header (Story 1: WMS ▸ Overview) -->
    <header class="ov-bar">
      <nav class="ov-breadcrumb">
        <button class="ov-crumb" @click="goWms">WMS</button>
        <span class="ov-crumb-sep">/</span>
        <span class="ov-crumb ov-crumb--current">Overview</span>
      </nav>
      <h1 class="ov-title">WMS Analytics</h1>
    </header>

    <!-- Inbound / Outbound tabs -->
    <div class="ov-tabs" role="tablist">
      <button
        v-for="t in TABS" :key="t"
        class="ov-tab" :class="{ 'ov-tab--active': activeTab === t }"
        role="tab" :aria-selected="activeTab === t"
        @click="activeTab = t"
      >{{ t }}</button>
    </div>

    <div class="ov-body">
      <!-- ── Operational section (Story 2 / 3) ── -->
      <section class="ov-section">
        <div class="ov-section-head">
          <div>
            <h2 class="ov-section-title">Operational</h2>
            <p class="ov-section-desc">Today's live {{ activeTab.toLowerCase() }} queue</p>
          </div>
          <div class="ov-section-meta">
            <span class="ov-updated">Updated at {{ updatedAt }}</span>
            <button class="ov-refresh" type="button" @click="refresh"><MpIcon name="refresh" size="sm" /> Refresh</button>
          </div>
        </div>

        <!-- Filters -->
        <div class="ov-filters">
          <label class="ov-field">
            <span class="ov-field-label">Warehouse</span>
            <select v-model="warehouse" class="ov-select">
              <option value="all">All warehouses</option>
              <option v-for="w in activeWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </label>
          <label class="ov-field">
            <span class="ov-field-label">Date</span>
            <input v-model="date" type="date" class="ov-select" />
          </label>
          <label class="ov-field">
            <span class="ov-field-label">Operator</span>
            <select v-model="operator" class="ov-select">
              <option v-for="o in operatorOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>

        <!-- Quick-view cards -->
        <div class="ov-cards">
          <button v-for="c in cards" :key="c.key" class="ov-card" type="button" @click="openCard(c)">
            <div class="ov-card-top">
              <p class="ov-card-title">{{ c.title }}</p>
              <MpIcon name="chevron-right" size="sm" class="ov-card-arrow" />
            </div>
            <p class="ov-card-total">{{ c.total }} <span class="ov-card-unit">{{ c.unit }}</span></p>
            <p v-if="c.note" class="ov-card-note">{{ c.note }}</p>
            <dl class="ov-card-rows">
              <div v-for="r in c.rows" :key="r.label" class="ov-card-row">
                <dt>{{ r.label }}</dt><dd>{{ r.value }}</dd>
              </div>
            </dl>
          </button>
        </div>
      </section>

      <!-- ── Post-Operational section (Story 1 AC#3 — content is stories 4+) ── -->
      <section class="ov-section">
        <div class="ov-section-head">
          <div>
            <h2 class="ov-section-title">Post-operational</h2>
            <p class="ov-section-desc">Performance over a period</p>
          </div>
        </div>
        <div class="ov-placeholder">
          <MpIcon name="chart-bar" size="lg" />
          <p class="ov-placeholder-title">Performance analytics</p>
          <p class="ov-placeholder-desc">Stage timings, timeliness, volume and accuracy appear here.</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ov-page { display: flex; flex-direction: column; min-height: 100%; background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* Header */
.ov-bar { padding: var(--mp-spacing-4) var(--mp-spacing-6) 0; }
.ov-breadcrumb { display: flex; align-items: center; gap: var(--mp-spacing-1); margin-bottom: var(--mp-spacing-1); }
.ov-crumb { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-crumb--current { color: var(--mp-text-default); cursor: default; }
.ov-crumb-sep { color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-sm); }
.ov-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-text-default); }

/* Tabs */
.ov-tabs { display: flex; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-6) 0; border-bottom: 1px solid var(--mp-border-default); }
.ov-tab { background: none; border: none; padding: var(--mp-spacing-2) var(--mp-spacing-3); margin-bottom: -1px; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); border-bottom: 2px solid transparent; }
.ov-tab:hover { color: var(--mp-text-default); }
.ov-tab--active { color: var(--mp-text-brand, #028454); font-weight: var(--mp-font-weights-semi-bold); border-bottom-color: var(--mp-border-brand, #028454); }

/* Body / sections */
.ov-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-8); }
.ov-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ov-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.ov-section-title { margin: 0; font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ov-section-desc { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-section-meta { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.ov-updated { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-refresh { display: inline-flex; align-items: center; gap: 4px; padding: 4px var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral, #fff); cursor: pointer; color: var(--mp-text-default); font-size: var(--mp-font-sizes-sm); }

/* Filters */
.ov-filters { display: flex; gap: var(--mp-spacing-4); flex-wrap: wrap; }
.ov-field { display: flex; flex-direction: column; gap: 4px; }
.ov-field-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-select { height: 36px; min-width: 180px; padding: 0 var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ov-select:focus-visible { outline: none; box-shadow: 0 0 0 1px var(--mp-border-bold); }

/* Cards */
.ov-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.ov-card { display: flex; flex-direction: column; gap: var(--mp-spacing-2); text-align: left; background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-4); cursor: pointer; transition: border-color 100ms, box-shadow 100ms; }
.ov-card:hover { border-color: var(--mp-border-bold); }
.ov-card-top { display: flex; align-items: center; justify-content: space-between; }
.ov-card-title { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ov-card-arrow { color: var(--mp-icon-subtle, var(--mp-text-subtle)); }
.ov-card-total { margin: 0; font-size: 28px; font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.ov-card-unit { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-subtle); }
.ov-card-note { margin: -2px 0 0; font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-subtle); }
.ov-card-rows { margin: var(--mp-spacing-1) 0 0; padding: var(--mp-spacing-2) 0 0; border-top: 1px solid var(--mp-border-subtle, var(--mp-border-default)); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ov-card-row { display: flex; align-items: center; justify-content: space-between; font-size: var(--mp-font-sizes-sm); }
.ov-card-row dt { margin: 0; color: var(--mp-text-secondary); }
.ov-card-row dd { margin: 0; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

/* Post-operational placeholder */
.ov-placeholder { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-8) 0; background: var(--mp-background-neutral, #fff); border: 1px dashed var(--mp-border-default); border-radius: var(--mp-radii-lg, 12px); color: var(--mp-text-subtle); }
.ov-placeholder-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.ov-placeholder-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

@media (max-width: 1180px) {
  .ov-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
