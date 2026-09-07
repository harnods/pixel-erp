<script setup lang="ts">
/**
 * CRM (Qontak) — Reports (/crm/reports).
 *
 * A full-bleed CRM page (owns its `.crm-titlebar` + scrollable `.cc-stage`),
 * mirroring CrmDealsPage's shell. Every number is DERIVED from the real CRM
 * datasets in `~/data/crm` — nothing is invented:
 *   • KPI row       — from dealMetrics + Won/Lost tallies.
 *   • Pipeline funnel — count + value per DEAL_STAGES stage (dealsInStage).
 *   • Deals by owner  — open count + open value per CRM_OWNERS member.
 *   • Won → Sales Orders — converted deals linked to their crmOrders.
 */
import { computed } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  deals,
  dealMetrics,
  dealsInStage,
  isDealOpen,
  DEAL_STAGES,
  CRM_OWNERS,
} from '~/data/crm'

const { t } = useLocale()

const m = dealMetrics

// ── KPI derivations ──
const wonDeals = computed(() => deals.filter((d) => d.stage === 'Won'))
const lostDeals = computed(() => deals.filter((d) => d.stage === 'Lost'))
const wonValue = computed(() => wonDeals.value.reduce((n, d) => n + d.value, 0))
const winRate = computed(() => {
  const decided = wonDeals.value.length + lostDeals.value.length
  return decided ? Math.round((wonDeals.value.length / decided) * 100) : 0
})
const convertedDeals = computed(() =>
  deals.filter((d) => d.conversion === 'converted' && d.salesOrderId),
)

// ── Pipeline funnel — count + value per stage ──
type StageRow = { stage: string; count: number; value: number; pct: number }
const funnel = computed<StageRow[]>(() => {
  const rows = DEAL_STAGES.map((stage) => {
    const inStage = dealsInStage(stage)
    return { stage, count: inStage.length, value: inStage.reduce((n, d) => n + d.value, 0) }
  })
  const maxValue = Math.max(1, ...rows.map((r) => r.value))
  return rows.map((r) => ({ ...r, pct: Math.round((r.value / maxValue) * 100) }))
})

// ── Deals by owner — open count + open value ──
type OwnerRow = { owner: string; open: number; openValue: number; won: number }
const byOwner = computed<OwnerRow[]>(() =>
  CRM_OWNERS.map((owner) => {
    const mine = deals.filter((d) => d.owner === owner)
    const open = mine.filter(isDealOpen)
    return {
      owner,
      open: open.length,
      openValue: open.reduce((n, d) => n + d.value, 0),
      won: mine.filter((d) => d.stage === 'Won').length,
    }
  }).sort((a, b) => b.openValue - a.openValue),
)

function fmtDate(iso: string): string {
  const [y, mo, d] = iso.split('-')
  return `${d}/${mo}/${y}`
}
</script>

<template>
  <div class="crm">
    <!-- ── Title bar ── -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">{{ t('Reports') }}</h1>
        <span class="crm-subtitle">{{ t('Pipeline performance from your live deals') }}</span>
      </div>
    </header>

    <div class="cc-stage">
      <!-- ── KPI row ── -->
      <div class="cc-stats">
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Total pipeline value') }}</div>
            <div class="stat-amount">{{ formatIDR(m.openValue) }}</div>
            <div class="stat-sub">{{ m.active }} {{ t('active deals') }}</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Won value') }}</div>
            <div class="stat-amount">{{ formatIDR(wonValue) }}</div>
            <div class="stat-sub">{{ wonDeals.length }} {{ t('deals won') }}</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Win rate') }}</div>
            <div class="stat-amount">{{ winRate }}%</div>
            <div class="stat-sub">{{ wonDeals.length }} {{ t('won') }} · {{ lostDeals.length }} {{ t('lost') }}</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Converted to Sales Order') }}</div>
            <div class="stat-amount">{{ convertedDeals.length }}</div>
            <div class="stat-sub" :class="{ 'stat-sub--warning': m.conversionAttentionCount > 0 }">
              {{ m.conversionAttentionCount }} {{ t('need attention') }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-title">{{ t('Overdue') }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': m.overdueCount > 0 }">{{ m.overdueCount }}</div>
            <div class="stat-sub">{{ t('Past expected close') }}</div>
          </div>
        </div>
      </div>

      <!-- ── Pipeline funnel ── -->
      <section class="rp-block">
        <h2 class="rp-block-title">{{ t('Pipeline by stage') }}</h2>
        <div class="rp-funnel">
          <div v-for="row in funnel" :key="row.stage" class="rp-funnel-row">
            <span class="rp-funnel-label">{{ t(row.stage) }}</span>
            <div class="rp-funnel-track">
              <div class="rp-funnel-fill" :style="{ width: row.pct + '%' }" />
            </div>
            <span class="rp-funnel-count">{{ row.count }} {{ row.count === 1 ? t('deal') : t('deals') }}</span>
            <span class="rp-funnel-value">{{ formatIDR(row.value) }}</span>
          </div>
        </div>
      </section>

      <!-- ── Deals by owner ── -->
      <section class="rp-block">
        <h2 class="rp-block-title">{{ t('Deals by owner') }}</h2>
        <div class="rp-tablewrap">
          <table class="rp-table">
            <thead>
              <tr>
                <th>{{ t('Owner') }}</th>
                <th class="rp-num">{{ t('Open deals') }}</th>
                <th class="rp-num">{{ t('Open value') }}</th>
                <th class="rp-num">{{ t('Won') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in byOwner" :key="r.owner">
                <td>{{ r.owner }}</td>
                <td class="rp-num">{{ r.open }}</td>
                <td class="rp-num">{{ formatIDR(r.openValue) }}</td>
                <td class="rp-num">{{ r.won }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Won → Sales Orders ── -->
      <section class="rp-block">
        <h2 class="rp-block-title">{{ t('Won deals converted to Sales Orders') }}</h2>
        <div v-if="convertedDeals.length" class="rp-tablewrap">
          <table class="rp-table">
            <thead>
              <tr>
                <th>{{ t('Deal') }}</th>
                <th>{{ t('Customer') }}</th>
                <th class="rp-num">{{ t('Value') }}</th>
                <th>{{ t('Sales Order') }}</th>
                <th>{{ t('Closed') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in convertedDeals" :key="d.id">
                <td>
                  <NuxtLink class="cell-link" :to="`/crm/deals/${d.id}`">{{ d.name }}</NuxtLink>
                  <span class="rp-sub">{{ d.id }}</span>
                </td>
                <td>{{ d.company }}</td>
                <td class="rp-num">{{ formatIDR(d.value) }}</td>
                <td><NuxtLink class="cell-link" :to="`/crm/orders/${d.salesOrderId}`">{{ d.salesOrderId }}</NuxtLink></td>
                <td>{{ fmtDate(d.lastActivity) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="rp-empty">{{ t('No deals have been converted to Sales Orders yet.') }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar (mirrors CrmDealsPage) ── */
.crm-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.crm-titlebar__left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }
.crm-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #656f80); }

/* ── Stage ── */
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

/* ── KPI row (shared stat-card idiom) ── */
.cc-stats { margin-bottom: var(--mp-spacing-10); }
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-sub--warning { color: var(--mp-text-warning, #b54708); }

/* ── Report blocks ── */
.rp-block { margin-bottom: var(--mp-spacing-8); }
.rp-block-title { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: 24px; }

/* ── Funnel ── */
.rp-funnel { display: flex; flex-direction: column; gap: var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 12px); padding: var(--mp-spacing-5); }
.rp-funnel-row { display: grid; grid-template-columns: 140px 1fr 100px 160px; align-items: center; gap: var(--mp-spacing-4); }
.rp-funnel-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.rp-funnel-track { height: 8px; background: var(--mp-background-neutral-subtle, #f1f5f9); border-radius: var(--mp-radii-full, 999px); overflow: hidden; }
.rp-funnel-fill { height: 100%; background: var(--mp-background-brand-bold, #029861); border-radius: var(--mp-radii-full, 999px); min-width: 2px; transition: width 200ms ease; }
.rp-funnel-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: right; white-space: nowrap; }
.rp-funnel-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); text-align: right; white-space: nowrap; }

/* ── Tables (plain styled, mirrors detail-page related tables) ── */
.rp-tablewrap { overflow-x: auto; }
.rp-table { width: 100%; border-collapse: collapse; }
.rp-table thead th { text-align: left; text-transform: uppercase; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f1f5f9); padding: var(--mp-spacing-2) var(--mp-spacing-4); height: var(--mp-sizes-7, 28px); box-sizing: border-box; white-space: nowrap; }
.rp-table tbody td { padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; }
.rp-num { text-align: right; }
.rp-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cell-link { color: var(--mp-text-link, #165082); text-decoration: none; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.rp-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

@media (max-width: 900px) {
  .rp-funnel-row { grid-template-columns: 120px 1fr 90px; }
  .rp-funnel-value { display: none; }
}
</style>
