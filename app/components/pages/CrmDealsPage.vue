<script setup lang="ts">
/**
 * CRM (Qontak) — Deals kanban board. Landing page for the CRM product (/crm).
 * Pixel-mirrors Figma node 4214:11231: title bar → filter bar → 6-column kanban
 * of deal cards. Constant deal fields (size/dates) match the design; per-card
 * code/company/priority/status/owner/aging vary per column.
 */
import { h, ref, reactive, watch } from 'vue'
import { infoToast } from '~/utils/toasts'
import { MpButton, MpIcon, MpSegmentedControl, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { employees } from '~/data'
import { formatIDR } from '~/utils/currency'
import CrmDealPreviewDrawer, { type DealPreviewCtx } from '~/components/CrmDealPreviewDrawer.vue'

function soon(what: string) {
  infoToast(`${what} — coming soon`)
}

// Deal owners are real Central Perk sales/marketing staff — resolve their photo
// (and initials fallback) from the HR employee directory so the avatar matches.
function ownerPhoto(name: string): string | undefined {
  return employees.find((e) => e.fullName === name)?.photo
}
function ownerInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// Per-deal size / dates / times — derived deterministically from the deal code so
// each card varies (no more identical size & timestamps) yet stays stable.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr']
const pad = (x: number) => String(x).padStart(2, '0')
function dealMeta(code: string) {
  const n = parseInt(code.replace(/\D/g, ''), 10) || 0
  const size = (7 + (n * 7) % 55) * 1_000_000            // ~Rp7jt–62jt
  const cMon = (n * 3) % 2                                // created Jan/Feb 2026
  const cDay = 1 + (n * 3) % 26, cH = 8 + (n % 9), cMin = (n * 13) % 60
  const eMon = 1 + (n % 3), eDay = 1 + (n * 5) % 26       // expected close Feb–Apr
  const uDay = 12 + (n * 2) % 16, uH = 9 + (n % 8), uMin = (n * 17) % 60
  return {
    size: formatIDR(size),
    sizeValue: size,
    created: `${pad(cDay)} ${MONTHS[cMon]} 2026, ${pad(cH)}:${pad(cMin)}`,
    close: `${pad(eDay)} ${MONTHS[eMon]} 2026`,
    updated: `${pad(uDay)} Feb 2026, ${pad(uH)}:${pad(uMin)}`,
  }
}

// ── Priority pip (icon + label) ──────────────────────────────────────────────
const PRIO = {
  low:      { label: 'Low',      color: 'var(--mp-text-link, #165082)',      d: 'M6 10l6 6 6-6' },
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
// Central Perk's coffee wholesale pipeline — companies mirror the ERP customer
// master, owners are Central Perk sales staff (D = Dewi Lestari, F = Fajar
// Nugroho, R = Rizal Candra). Stage names/counts/totals match crm.ts so the Home
// "Pipeline overview" and this board agree.
const columns = reactive<Column[]>([
  { name: 'New', count: 8, total: 'Rp186.000.000', cards: [
    { code: 'DEAL-1042', company: 'Distributor Sentra Boga',   priority: 'high',   statuses: [{ l: 'In progress', t: 'neutral' }], owner: 'Fajar Nugroho', ownerColor: 'green', aging: '0d 3h',  badge: { l: '2d 23h', t: 'warning' } },
    { code: 'DEAL-1043', company: 'Kopi Kenangan Pusat',       priority: 'medium', statuses: [{ l: 'In progress', t: 'neutral' }], owner: 'Dewi Lestari', ownerColor: 'green', aging: '0d 20h' },
    { code: 'DEAL-1044', company: 'GoWork Office Tower',       priority: 'low',    statuses: [A],                                  owner: 'Dewi Lestari', ownerColor: 'green', aging: '1d 7h',  badge: { l: '2d 23h', t: 'warning' } },
  ] },
  { name: 'Qualified', count: 5, total: 'Rp142.000.000', cards: [
    { code: 'DEAL-1051', company: 'Excelso Grand Indonesia',   priority: 'high',   statuses: [A], owner: 'Fajar Nugroho', ownerColor: 'green', aging: '1d 2h', badge: { l: '2d 23h', t: 'warning' } },
    { code: 'DEAL-1052', company: 'Maxx Coffee Lippo Mall',    priority: 'medium', statuses: [A], owner: 'Fajar Nugroho', ownerColor: 'green', aging: '2d 5h' },
  ] },
  { name: 'Proposal sent', count: 4, total: 'Rp98.000.000', cards: [
    { code: 'DEAL-1061', company: 'Hotel Mulia Senayan',       priority: 'high',   statuses: [A],    owner: 'Dewi Lestari', ownerColor: 'green', aging: '0d 9h', badge: { l: '2d 23h', t: 'warning' } },
    { code: 'DEAL-1062', company: 'Tanamera Coffee Roastery',  priority: 'medium', statuses: [A, F], owner: 'Fajar Nugroho', ownerColor: 'green', aging: '3d 4h', progress: '2/4' },
  ] },
  { name: 'Negotiation', count: 3, total: 'Rp76.000.000', cards: [
    { code: 'DEAL-1071', company: 'Santika Premiere Hotel',    priority: 'high',     statuses: [A], owner: 'Fajar Nugroho', ownerColor: 'green', aging: '1d 12h', badge: { l: '2d 23h', t: 'warning' } },
    { code: 'DEAL-1072', company: 'Anomali Coffee',            priority: 'critical', statuses: [A], owner: 'Dewi Lestari', ownerColor: 'green', aging: '5d 6h',  badge: { l: 'Rotten', t: 'danger' } },
  ] },
  { name: 'Won', count: 6, total: 'Rp214.000.000', cards: [
    { code: 'DEAL-1081', company: 'Distributor Sentra Boga',   statuses: [A], owner: 'Fajar Nugroho', ownerColor: 'green', aging: '0d 2h' },
    { code: 'DEAL-1082', company: 'Kopi Kenangan Pusat',       statuses: [A], owner: 'Dewi Lestari', ownerColor: 'green', aging: '0d 8h' },
  ] },
  { name: 'Lost', count: 2, total: 'Rp31.000.000', cards: [
    { code: 'DEAL-1091', company: 'Coffee Cult Bali',          statuses: [{ l: 'Lost', t: 'danger' }], owner: 'Fajar Nugroho', ownerColor: 'green', aging: '12d 4h' },
  ] },
])

const pipeline = ref('Sales pipeline')
const dealSearch = ref('')

// First-load skeleton (ERP guideline: solid, ~1.2s).
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Deal quick-preview drawer (opens on card click).
const previewOpen = ref(false)
const previewCtx = ref<DealPreviewCtx | null>(null)
function openPreview(d: Deal, stage: string) {
  const m = dealMeta(d.code)
  previewCtx.value = { code: d.code, company: d.company, owner: d.owner, priority: d.priority, stage, amount: m.size, amountValue: m.sizeValue, closeDate: m.close }
  previewOpen.value = true
}

// ── Drag & drop: move a deal card between stage columns ───────────────────────
const draggingCode = ref<string | null>(null)
const dragOverCol = ref<string | null>(null)
function onDealDragStart(code: string) { draggingCode.value = code }
function onDealDrop(target: Column) {
  const code = draggingCode.value
  draggingCode.value = null; dragOverCol.value = null
  if (!code) return
  const from = columns.find((c) => c.cards.some((d) => d.code === code))
  if (!from || from === target) return
  const idx = from.cards.findIndex((d) => d.code === code)
  const [card] = from.cards.splice(idx, 1)
  target.cards.push(card!)
  from.count = Math.max(0, from.count - 1)
  target.count += 1
}

// View switch (pipeline board / table). Table view isn't built yet → revert + toast.
const view = ref('board')
const viewOptions = [
  { id: 'sc-board', value: 'board', icon: 'table-view-column' },
  { id: 'sc-table', value: 'table', icon: 'table-view-list' },
]
watch(view, (v) => {
  if (v === 'table') { soon('Table view'); view.value = 'board' }
})
</script>

<template>
  <div class="crm">
    <!-- ── Title bar ── -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Deals</h1>
      </div>
      <div class="crm-titlebar__right">
        <!-- Primary action: New deal only (no split) -->
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="soon('New deal')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
          New deal
        </button>

        <!-- More actions → icon button (Import / Bulk edit / Edit properties) -->
        <MpPopover id="deal-more-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon" type="button" aria-label="More actions">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="soon('Import deals')">Import deals</MpPopoverListItem>
              <MpPopoverListItem @click="soon('Bulk edit deals')">Bulk edit deals</MpPopoverListItem>
              <MpPopoverListItem @click="soon('Edit deals property')">Edit deals property</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <!-- ── Filter bar ── -->
    <div class="crm-filter">
      <div class="crm-filter__left">
        <ErpFilterSelect
          id="deal-pipeline-select"
          :model-value="pipeline"
          placeholder="Sales pipeline"
          :options="['Sales pipeline', 'Wholesale pipeline', 'Retail pipeline']"
          width="176px"
          @update:model-value="(v: string) => (pipeline = v)"
        />
        <MpButton class="filter-all-btn" variant="tertiary" @click="soon('All filters')">
          <MpIcon name="filter" size="sm" />
          All filters
        </MpButton>
      </div>
      <div class="crm-filter__right">
        <!-- Segmented control (Pixel MpSegmentedControl) — left of the search -->
        <MpSegmentedControl id="deal-view-switch" name="deal-view-switch" v-model="view" :data="viewOptions" />
        <!-- Canonical pill search (matches HR/ERP index tables) -->
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input v-model="dealSearch" class="filter-search-input" type="text" placeholder="Search...">
          <button v-if="dealSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="dealSearch = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ── First-load skeleton board ── -->
    <div v-if="loading" class="kanban">
      <div class="kanban__board">
        <div v-for="col in columns" :key="`sk-${col.name}`" class="kcol">
          <div class="kcol__head"><MpSkeleton class="crm-skeleton" width="88px" height="14px" rounded="sm" duration="0s" /></div>
          <div class="kcol__cards">
            <div v-for="n in 3" :key="n" class="deal deal--skeleton">
              <MpSkeleton class="crm-skeleton" width="70%" height="12px" rounded="sm" duration="0s" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Kanban ── -->
    <div v-else class="kanban">
      <div class="kanban__board">
        <div
          v-for="col in columns"
          :key="col.name"
          class="kcol"
          :class="{ 'kcol--over': dragOverCol === col.name }"
          @dragover.prevent="dragOverCol = col.name"
          @dragleave="dragOverCol === col.name && (dragOverCol = null)"
          @drop="onDealDrop(col)"
        >
          <div class="kcol__head">
            <span class="kcol__name">{{ col.name }}</span>
            <span class="kcol__count">{{ col.count }}</span>
          </div>
          <div class="kcol__cards">
            <article
              v-for="(d, i) in col.cards"
              :key="col.name + i"
              class="deal"
              draggable="true"
              @dragstart="onDealDragStart(d.code)"
              @dragend="draggingCode = null"
              @click="openPreview(d, col.name)"
            >
              <div class="deal__head">
                <p class="deal__code">{{ d.code }}</p>
                <p class="deal__company">{{ d.company }}</p>
                <div v-if="d.priority" class="deal__badges">
                  <PriorityPip :p="d.priority" />
                </div>
              </div>
              <div class="deal__rows">
                <div class="deal__row"><span class="deal__k">Deal size</span><span class="deal__v">{{ dealMeta(d.code).size }}</span></div>
                <div class="deal__row"><span class="deal__k">Created date</span><span class="deal__v">{{ dealMeta(d.code).created }}</span></div>
                <div class="deal__row"><span class="deal__k">Expected close</span><span class="deal__v">{{ dealMeta(d.code).close }}</span></div>
                <div class="deal__row"><span class="deal__k">Last updated</span><span class="deal__v">{{ dealMeta(d.code).updated }}</span></div>
              </div>
              <div class="deal__foot">
                <span class="avatar" :title="`Deal owner: ${d.owner}`">
                  <img v-if="ownerPhoto(d.owner)" :src="ownerPhoto(d.owner)" :alt="d.owner">
                  <template v-else>{{ ownerInitials(d.owner) }}</template>
                </span>
                <span class="deal__aging" title="Time in current stage">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {{ d.aging }} in stage
                </span>
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

    <CrmDealPreviewDrawer :open="previewOpen" :ctx="previewCtx" @close="previewOpen = false" />
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

/* ── Filter bar ── */
.crm-filter {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage, #fff);
}
.crm-filter__left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.crm-filter__right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* "All filters" — secondary pill button (identical to HR directory filter bar). */
.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important; border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary) !important; cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }

/* Canonical pill search — identical to HR/ERP index tables. */
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer;
  color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

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
.kcol--over { outline: 2px solid var(--mp-text-selected, #0f6d4d); outline-offset: -2px; background: var(--mp-background-nav-stack-hovered, #d6f4e9); }
.deal {
  flex-shrink: 0;
  background: var(--mp-background-stage, #fff); border: 1px solid var(--mp-border-default, #dcdfe4);
  border-radius: var(--mp-radii-md, 6px); overflow: hidden; cursor: grab;
  display: flex; flex-direction: column;
}
.deal:active { cursor: grabbing; }
.deal:hover { border-color: var(--mp-border-bold, #8c9596); }
/* First-load skeleton — solid, no shimmer/animation (ERP guideline). */
.crm-skeleton { background-image: none !important; background-color: var(--mp-border-default) !important; animation: none !important; }
.deal--skeleton { cursor: default; padding: var(--mp-spacing-4); min-height: 96px; }
.deal--skeleton:hover { border-color: var(--mp-border-default, #dcdfe4); }
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

/* Foot: deal owner avatar (left) + a single time-in-stage timestamp. */
.deal__foot { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-2); }
.avatar {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: var(--mp-font-weights-semi-bold);
  background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d);
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.deal__aging { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: 12px; color: var(--mp-text-secondary, #656f80); white-space: nowrap; }
.deal__aging svg { flex-shrink: 0; }
</style>
