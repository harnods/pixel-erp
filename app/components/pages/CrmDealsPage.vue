<script setup lang="ts">
/**
 * CRM (Qontak) — Deals kanban board. Landing page for the CRM product (/crm).
 * Pixel-mirrors Figma node 4214:11231: title bar → filter bar → 6-column kanban
 * of deal cards. Constant deal fields (size/dates) match the design; per-card
 * code/company/priority/status/owner/aging vary per column.
 */
import { h, ref } from 'vue'
import { MpIcon, toast } from '@mekari/pixel3'

function soon(what: string) {
  toast.notify({ variant: 'info', title: `${what} — coming soon`, maxWidth: 'max-content' })
}

// ── Priority pip (icon + label) ──────────────────────────────────────────────
const PRIO = {
  low:      { label: 'Low',      color: 'var(--mp-text-link, #4b61dc)',      d: 'M6 10l6 6 6-6' },
  medium:   { label: 'Medium',   color: 'var(--mp-text-secondary, #656f80)', d: 'M5 10h14M5 15h14' },
  high:     { label: 'High',     color: 'var(--mp-icon-warning, #e46910)',   d: 'M6 14l6-6 6 6' },
  critical: { label: 'Critical', color: 'var(--mp-icon-danger, #e2483d)',    d: 'M13 2c.5 3-1.5 4.5-2.7 6C9 9.7 8 11 8 13.2a4.2 4.2 0 108.4 0c0-1.6-.6-2.8-1.7-3.8.4 1.6-.7 2.5-1.3 2.5 1.2-3.2-.4-6.4-.4-9.9z' },
} as const
type Prio = keyof typeof PRIO
const PriorityPip = (props: { p: Prio }) => {
  const it = PRIO[props.p]
  const filled = props.p === 'critical'
  return h('span', { class: 'prio' }, [
    h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', class: 'prio__ic', style: { color: it.color } }, [
      h('path', { d: it.d, ...(filled ? { fill: 'currentColor' } : { stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) }),
    ]),
    h('span', { class: 'prio__label' }, it.label),
  ])
}

// ── Deal data ────────────────────────────────────────────────────────────────
interface Status { l: string; t: 'neutral' | 'success' | 'danger' | 'info' }
interface Deal {
  code: string; company: string; priority?: Prio; statuses: Status[]
  owner: string; ownerColor: string; aging: string
  badge?: { l: string; t: 'warning' | 'danger' }; progress?: string
}
interface Column { name: string; count: number; total: string; cards: Deal[] }

const A = { l: 'Approved', t: 'success' as const }
const F = { l: 'Frozen', t: 'info' as const }
const columns: Column[] = [
  { name: 'New', count: 14, total: 'Rp144.449.000', cards: [
    { code: '017ARIEL', company: 'RiverStone Insurance Limited',      priority: 'low',    statuses: [{ l: 'In progress', t: 'neutral' }], owner: 'R', ownerColor: 'teal',   aging: '0d 1h',  badge: { l: '2d 23h', t: 'warning' } },
    { code: '122EARTH', company: 'European Commission',               priority: 'medium', statuses: [{ l: 'Rejected', t: 'danger' }],      owner: 'R', ownerColor: 'purple', aging: '0d 20h', badge: { l: '2d 23h', t: 'warning' } },
    { code: '138VENUS', company: 'Credit Suisse (Hong Kong) Limited', statuses: [A],                                  owner: 'W', ownerColor: 'green',  aging: '1d 7h',  badge: { l: '2d 23h', t: 'warning' } },
    { code: '201MARS',  company: 'Goldman Sachs Group',               priority: 'high',   statuses: [A],              owner: 'S', ownerColor: 'blue',   aging: '0d 3h' },
    { code: '233NEPTUNE', company: 'HSBC Holdings',                   priority: 'critical', statuses: [A],            owner: 'A', ownerColor: 'orange', aging: '0d 5h',  badge: { l: '2d 23h', t: 'warning' } },
  ] },
  { name: 'Qualified', count: 1, total: 'Rp12.000.000', cards: [
    { code: '014MERCURY', company: 'Credit Suisse (Hong Kong) Limited', priority: 'high', statuses: [A, F], owner: 'R', ownerColor: 'red', aging: '3d 19h', badge: { l: 'Rotten', t: 'danger' }, progress: '2/4' },
  ] },
  { name: 'Advanced', count: 2, total: 'Rp24.000.000', cards: [
    { code: '088URANUS',  company: 'Ecopetrol',          priority: 'critical', statuses: [A], owner: 'R', ownerColor: 'purple', aging: '2d 15h', badge: { l: '2d 23h', t: 'warning' } },
    { code: '029JUPITER', company: 'Berkshire Hathaway',  priority: 'critical', statuses: [A], owner: 'R', ownerColor: 'teal',   aging: '5d 16h', badge: { l: 'Rotten', t: 'danger' } },
  ] },
  { name: 'Payment in process', count: 4, total: 'Rp65.700.000', cards: [
    { code: '362PLUTO', company: 'Blue Heron Group',                     priority: 'critical', statuses: [A],    owner: 'R', ownerColor: 'purple', aging: '0d 1h', badge: { l: '2d 23h', t: 'warning' } },
    { code: '180ARIEL', company: 'Orsus Investments Pty Ltmited',        priority: 'critical', statuses: [A],    owner: 'R', ownerColor: 'blue',   aging: '0d 1h' },
    { code: '009PLUTO', company: 'Partner Reinsurance Europe SE, Dubl...', priority: 'critical', statuses: [A, F], owner: 'R', ownerColor: 'red', aging: '0d 1h', badge: { l: '2d 23h', t: 'warning' } },
    { code: '321EARTH', company: 'Blue Heron Bundles',                   priority: 'critical', statuses: [A],    owner: 'R', ownerColor: 'green',  aging: '0d 1h' },
  ] },
  { name: 'Won', count: 2, total: 'Rp12.000.000', cards: [
    { code: '112VENUS', company: 'Parallax Company',                     priority: 'critical', statuses: [A, F], owner: 'R', ownerColor: 'purple', aging: '0d 1h', badge: { l: '2d 23h', t: 'warning' } },
    { code: '009PLUTO', company: 'Partner Reinsurance Europe SE, Dubl...', priority: 'critical', statuses: [A, F], owner: 'R', ownerColor: 'blue', aging: '0d 1h' },
  ] },
  { name: 'Lost', count: 0, total: 'Rp 0', cards: [] },
]

const pipelineOpen = ref(false)
</script>

<template>
  <div class="crm">
    <!-- ── Title bar ── -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Deals</h1>
        <span class="crm-subtitle">242 of 1.280 deals</span>
      </div>
      <div class="crm-titlebar__right">
        <button class="crm-btn crm-btn--secondary" type="button" @click="soon('More actions')">
          More actions
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="crm-btn crm-btn--primary" type="button" @click="soon('Create deal')">
          Create deal
          <span class="crm-btn__divider" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </header>

    <!-- ── Filter bar ── -->
    <div class="crm-filter">
      <div class="crm-filter__left">
        <button class="crm-select" type="button" @click="pipelineOpen = !pipelineOpen">
          Sales pipeline
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="crm-link" type="button" @click="soon('All filters')">All filters</button>
      </div>
      <div class="crm-filter__right">
        <div class="crm-viewtoggle">
          <button class="crm-viewtoggle__btn crm-viewtoggle__btn--active" type="button" :aria-label="'Board view'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="7" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="7" height="10" rx="1.5" fill="currentColor"/></svg>
          </button>
          <button class="crm-viewtoggle__btn" type="button" :aria-label="'List view'" @click="soon('List view')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="crm-search">
          <MpIcon name="search" size="sm" class="crm-search__ic" />
          <input class="crm-search__input" type="text" placeholder="Search deals name...">
        </div>
      </div>
    </div>

    <!-- ── Kanban ── -->
    <div class="kanban">
      <div class="kanban__board">
        <div v-for="col in columns" :key="col.name" class="kcol">
          <div class="kcol__head">
            <span class="kcol__name">{{ col.name }}</span>
            <span class="kcol__count">{{ col.count }}</span>
          </div>
          <div class="kcol__cards">
            <article v-for="(d, i) in col.cards" :key="col.name + i" class="deal" @click="soon('Deal detail')">
              <div class="deal__head">
                <p class="deal__code">{{ d.code }}</p>
                <p class="deal__company">{{ d.company }}</p>
                <div class="deal__badges">
                  <PriorityPip v-if="d.priority" :p="d.priority" />
                  <span v-for="s in d.statuses" :key="s.l" class="badge" :class="`badge--${s.t}`">{{ s.l }}</span>
                </div>
              </div>
              <div class="deal__rows">
                <div class="deal__row"><span class="deal__k">Deal size</span><span class="deal__v">IDR 12.000.000</span></div>
                <div class="deal__row"><span class="deal__k">Created date</span><span class="deal__v">12 Sep 2025, 11:24</span></div>
                <div class="deal__row"><span class="deal__k">Expected close</span><span class="deal__v">17 Sep 2025, 11:24</span></div>
                <div class="deal__row"><span class="deal__k">Last updated</span><span class="deal__v">13 Sep 2025, 14:09</span></div>
              </div>
              <div class="deal__foot">
                <span class="avatar" :class="`avatar--${d.ownerColor}`">{{ d.owner }}</span>
                <div class="deal__sla">
                  <span class="deal__aging">{{ d.aging }}</span>
                  <span v-if="d.badge" class="badge" :class="`badge--${d.badge.t}`">{{ d.badge.l }}</span>
                  <span v-if="d.progress" class="deal__progress"><MpIcon name="checkbox-checklist" size="sm" /> {{ d.progress }}</span>
                </div>
                <div class="assoc">
                  <span class="assoc__chip assoc__chip--icon"><MpIcon name="company" size="sm" /></span>
                  <span class="assoc__chip avatar--red">E</span>
                  <span class="assoc__chip assoc__chip--icon"><MpIcon name="products" size="sm" /></span>
                  <span class="assoc__chip assoc__chip--more">+9</span>
                </div>
              </div>
            </article>
          </div>
          <div class="kcol__foot">
            <span class="kcol__total-k">Total:</span>
            <span class="kcol__total-v">{{ col.total }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crm { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* ── Title bar ── */
.crm-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.crm-titlebar__left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }
.crm-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #656f80); }
.crm-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.crm-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; white-space: nowrap; border: 1px solid transparent;
}
.crm-btn--secondary { background: var(--mp-background-neutral, #fff); border-color: var(--mp-border-bold, #8c9596); color: var(--mp-text-default, #272b32); }
.crm-btn--secondary:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.crm-btn--primary { background: var(--mp-background-crm-bold, #2563eb); color: #fff; padding-right: var(--mp-spacing-3); }
.crm-btn--primary:hover { background: var(--mp-background-crm-bold-hovered, #1d4ed8); }
.crm-btn__divider { width: 1px; height: 20px; background: rgba(255, 255, 255, 0.4); margin-left: var(--mp-spacing-1); }

/* ── Filter bar ── */
.crm-filter {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage, #fff);
}
.crm-filter__left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.crm-filter__right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.crm-select {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  height: 36px; padding: 0 var(--mp-spacing-3); border-radius: var(--mp-radii-md, 6px);
  border: 1px solid var(--mp-border-bold, #8c9596); background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #272b32); cursor: pointer;
}
.crm-link { background: none; border: none; cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #4b61dc); }
.crm-viewtoggle { display: inline-flex; border: 1px solid var(--mp-border-default, #dcdfe4); border-radius: var(--mp-radii-md, 6px); overflow: hidden; }
.crm-viewtoggle__btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: var(--mp-background-neutral, #fff); color: var(--mp-text-secondary, #656f80); cursor: pointer; }
.crm-viewtoggle__btn--active { background: var(--mp-background-brand, #eef0fc); color: var(--mp-text-link, #4b61dc); }
.crm-search { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); height: 36px; padding: 0 var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); border: 1px solid var(--mp-border-bold, #8c9596); background: var(--mp-background-neutral, #fff); width: 240px; }
.crm-search__ic { color: var(--mp-text-secondary, #656f80); flex-shrink: 0; }
.crm-search__input { border: none; outline: none; background: none; flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.crm-search__input::placeholder { color: var(--mp-text-placeholder, #6e7a7c); }

/* ── Kanban ── */
.kanban { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); background: var(--mp-background-stage, #fff); }
.kanban__board { display: flex; gap: var(--mp-spacing-2); height: 100%; }
.kcol {
  width: 300px; flex-shrink: 0; height: 100%;
  display: flex; flex-direction: column;
  background: var(--mp-background-neutral-subtle, #f8f9fb);
  border-radius: var(--mp-radii-md, 6px);
}
.kcol__head { flex-shrink: 0; height: 52px; display: flex; align-items: center; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-4); }
.kcol__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #272b32); }
.kcol__count { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #656f80); }
.kcol__cards { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2); }
.kcol__foot { flex-shrink: 0; height: 44px; display: flex; align-items: center; gap: var(--mp-spacing-1); padding: 0 var(--mp-spacing-4); }
.kcol__total-k { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #656f80); }
.kcol__total-v { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #272b32); }

/* ── Deal card ── */
.deal {
  flex-shrink: 0;
  background: var(--mp-background-stage, #fff); border: 1px solid var(--mp-border-default, #dcdfe4);
  border-radius: var(--mp-radii-md, 6px); overflow: hidden; cursor: pointer;
  display: flex; flex-direction: column;
}
.deal:hover { border-color: var(--mp-border-bold, #8c9596); }
.deal__head { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default-subtle, #f0f1f3); }
.deal__code { margin: 0; font-size: 12px; color: var(--mp-text-secondary, #656f80); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__company { margin: 0; font-size: 14px; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #272b32); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__badges { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; min-height: 20px; }
.prio { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.prio__ic { flex-shrink: 0; }
.prio__label { font-size: 12px; color: var(--mp-text-default, #272b32); }
.badge {
  display: inline-flex; align-items: center; padding: 2px var(--mp-spacing-1); border-radius: var(--mp-radii-full, 999px);
  font-size: 10px; font-weight: var(--mp-font-weights-semi-bold); line-height: 12px; white-space: nowrap;
}
.badge--neutral { background: var(--mp-background-neutral-subtle, #f0f1f3); color: var(--mp-text-secondary, #656f80); }
.badge--success { background: var(--mp-background-success, #f2f9f6); color: var(--mp-text-success, #186f4a); }
.badge--danger  { background: var(--mp-background-danger, #fdecea); color: var(--mp-text-danger, #a8352d); }
.badge--info    { background: var(--mp-background-information, #eaf1fc); color: var(--mp-text-information, #2c5c8f); }
.badge--warning { background: var(--mp-background-warning, #fdf6dd); color: var(--mp-text-warning, #a14a0b); }

.deal__rows { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2); }
.deal__row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.deal__k { font-size: 12px; color: var(--mp-text-secondary, #656f80); white-space: nowrap; }
.deal__v { flex: 1; min-width: 0; font-size: 12px; color: var(--mp-text-default, #272b32); text-align: right; }

.deal__foot { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-2); }
.avatar {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: var(--mp-font-weights-semi-bold); color: #fff;
}
.avatar--teal   { background: var(--mp-chart-cat01, #12a3a3); }
.avatar--purple { background: var(--mp-chart-cat03, #8270db); }
.avatar--red    { background: var(--mp-chart-cat06, #e2483d); }
.avatar--green  { background: var(--mp-chart-cat02, #12a150); }
.avatar--blue   { background: var(--mp-chart-cat04, #3d6fd6); }
.avatar--orange { background: var(--mp-chart-cat05, #e46910); }
.deal__sla { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--mp-spacing-1); }
.deal__aging { font-size: 12px; color: var(--mp-text-secondary, #656f80); white-space: nowrap; }
.deal__progress { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; color: var(--mp-text-secondary, #656f80); }
.assoc { display: inline-flex; align-items: center; flex-shrink: 0; }
.assoc__chip {
  width: 24px; height: 24px; border-radius: 999px; border: 2px solid var(--mp-border-inverse, #fff);
  display: inline-flex; align-items: center; justify-content: center; margin-left: -4px;
  font-size: 12px; font-weight: var(--mp-font-weights-semi-bold); color: #fff;
}
.assoc__chip:first-child { margin-left: 0; }
.assoc__chip--icon { background: var(--mp-background-neutral-subtle, #f0f1f3); color: var(--mp-text-secondary, #656f80); }
.assoc__chip--more { background: var(--mp-background-brand, #eef0fc); color: var(--mp-text-link, #4b61dc); }
.assoc__chip.avatar--red { background: var(--mp-chart-cat06, #e2483d); }
</style>
