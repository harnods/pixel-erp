<script setup lang="ts">
/**
 * ERP Home v2 widget content, rendered by key. Used both for placed widgets and
 * the edit-mode gallery of addable widgets (so previews look identical). All data
 * is static mock. Layout/edit chrome lives in HomePageV2.
 */
import { h } from 'vue'
import {
  MpIcon, toast,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'

defineProps<{ which: string }>()

const SPARKLE_D_A = 'M10.9077 8.22842L10.5112 8.17805C9.1059 7.99858 8.00071 6.89127 7.82266 5.48602L7.77514 5.11147C7.69781 4.49787 7.09344 4.08431 6.45714 4.08431C5.82793 4.08431 5.22497 4.48085 5.1441 5.09232L5.09374 5.48885C4.91427 6.8941 3.80695 7.99929 2.4017 8.17734L2.02716 8.22487C1.40008 8.30645 1 8.90657 1 9.54287C1 10.1792 1.3788 10.7793 2.00801 10.8559L2.40454 10.9063C3.80979 11.0857 4.91498 12.1931 5.09303 13.5983L5.14056 13.9728C5.21788 14.6113 5.82226 15 6.45856 15C7.08776 15 7.69852 14.5715 7.77159 13.992L7.82195 13.5955C8.00142 12.1902 9.10874 11.085 10.514 10.907L10.8885 10.8594C11.5192 10.7793 11.9157 10.1777 11.9157 9.54145C11.9157 8.90515 11.5199 8.30503 10.9077 8.22842Z'
const SPARKLE_D_B = 'M14.4956 3.07205L14.2977 3.04651C13.5955 2.95643 13.0422 2.40312 12.9535 1.70085L12.9301 1.51358C12.8911 1.20643 12.5889 1 12.2711 1C11.9561 1 11.6553 1.19791 11.6142 1.50436L11.5887 1.70227C11.4986 2.40454 10.9453 2.95784 10.243 3.04651L10.0557 3.06992C9.7422 3.11107 9.54216 3.41113 9.54216 3.72892C9.54216 4.04672 9.73156 4.34749 10.0465 4.38579L10.2444 4.41133C10.9467 4.50142 11.5 5.05472 11.5887 5.75699L11.6121 5.94427C11.6504 6.26348 11.9533 6.45785 12.2711 6.45785C12.586 6.45785 12.8911 6.24362 12.9279 5.95349L12.9535 5.75558C13.0436 5.05331 13.5969 4.5 14.2991 4.41133L14.4864 4.38792C14.8021 4.3482 15 4.04672 15 3.72892C15 3.41113 14.8021 3.11107 14.4956 3.07205Z'
const Sparkle = (props: { size?: number }) =>
  h('svg', { width: props.size ?? 16, height: props.size ?? 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, [
    h('path', { d: SPARKLE_D_A, fill: 'currentColor' }),
    h('path', { d: SPARKLE_D_B, fill: 'currentColor' }),
  ])
function soon(what: string) { toast.notify({ variant: 'info', title: `${what} — coming soon`, maxWidth: 'max-content' }) }

const approvals = [
  { icon: 'document',  tone: 'blue',   type: 'Purchase order',    time: '12 min ago', text: 'PO-2026-0184 — CV Sumber Rejeki',      meta: 'Rp45.200.000' },
  { icon: 'wallet',    tone: 'amber',  type: 'Expense',           time: '38 min ago', text: 'Expense #00231 — Marketing campaign',  meta: 'Rp12.500.000' },
  { icon: 'bank',      tone: 'violet', type: 'Internal transfer', time: '2 h ago',    text: 'TRF-2026-0009 — BCA → Petty Cash',     meta: 'Rp5.000.000' },
  { icon: 'warehouse', tone: 'green',  type: 'Stock adjustment',  time: 'Yesterday',  text: 'ADJ-2026-0052 — Gudang Jakarta Pusat', meta: '−120 pcs' },
]
const recentTx = [
  { icon: 'document',  tone: 'blue',   type: 'Sales invoice',    no: 'INV-2026-0912', party: 'Anomali Coffee',     amount: '+Rp18.400.000', when: '9 min ago', pos: true },
  { icon: 'bank',      tone: 'violet', type: 'Payment received', no: 'RCV-2026-0488', party: 'Kopi Kenangan Pusat', amount: '+Rp62.500.000', when: '1 h ago',   pos: true },
  { icon: 'wallet',    tone: 'amber',  type: 'Expense paid',     no: 'Expense #00228', party: 'PLN — Utilities',   amount: '−Rp7.200.000',  when: '3 h ago',   pos: false },
  { icon: 'truck',     tone: 'green',  type: 'Goods shipped',    no: 'OUT-2026-0803', party: 'Fore Coffee Thamrin', amount: '42 pcs',       when: 'Yesterday', pos: null },
  { icon: 'document',  tone: 'blue',   type: 'Purchase order',   no: 'PO-2026-0183',  party: 'CV Sumber Rejeki',    amount: '−Rp31.900.000', when: 'Yesterday', pos: false },
]
const cashStats = [
  { label: 'Receivable', value: 'Rp318 M', sub: '11 overdue',  subTone: 'danger' },
  { label: 'Payable',    value: 'Rp204 M', sub: 'Due this wk', subTone: 'muted' },
  { label: 'Net cash',   value: 'Rp114 M', sub: '+Rp22 M MoM', subTone: 'green' },
]
const cashBars = [
  { label: 'Current',    pct: 62, value: '62%', tone: 'green' },
  { label: '1–30 days',  pct: 24, value: '24%', tone: 'green' },
  { label: '31–60 days', pct: 9,  value: '9%',  tone: 'orange' },
  { label: '60+ days',   pct: 5,  value: '5%',  tone: 'gray' },
]
const wmsStats = [
  { label: 'In stock',     value: '2,431', sub: 'SKUs',           subTone: 'muted',  link: false },
  { label: 'Low stock',    value: '14',    sub: 'Reorder soon',   subTone: 'danger', link: true },
  { label: 'Out of stock', value: '3',     sub: 'Blocking sales', subTone: 'danger', link: true },
]
const wmsBars = [
  { label: 'Inbound',  pct: 40, value: '8 tasks',  tone: 'green' },
  { label: 'Put-away', pct: 25, value: '5 tasks',  tone: 'green' },
  { label: 'Picking',  pct: 55, value: '11 tasks', tone: 'orange' },
  { label: 'Packing',  pct: 30, value: '6 tasks',  tone: 'gray' },
]
const prodBars = [
  { label: 'Mar', h: 48, active: false }, { label: 'Apr', h: 60, active: false }, { label: 'May', h: 52, active: false },
  { label: 'Jun', h: 74, active: false }, { label: 'Jul', h: 66, active: false }, { label: 'Aug', h: 100, active: true },
]
const events = [
  { title: '11 receivables past due',      sub: 'Rp92 M outstanding',    action: 'Send reminders',    due: 'Overdue',   tone: 'danger' },
  { title: '5 bills to pay',               sub: 'Rp78 M due to vendors', action: 'Schedule payments', due: 'In 2 days', tone: 'warn' },
  { title: 'Cycle count — Gudang Jakarta', sub: '1,240 SKUs to count',   action: 'Assign counters',   due: 'In 6 days', tone: 'muted' },
  { title: '3 more bills to pay',          sub: 'Rp24 M to vendors',     action: 'Schedule payments', due: 'In 9 days', tone: 'warn' },
  { title: 'Month-end close',              sub: '3 accounts unreconciled', action: 'Start close',     due: 'Aug 31',    tone: 'muted' },
  { title: 'PPN masa filing opens',        sub: 'August sales invoices', action: 'Review invoices',   due: 'Sep 1',     tone: 'muted' },
]
const pnlBars = [
  { label: 'Income',   pct: 100, tone: 'teal' },
  { label: 'Expenses', pct: 34,  tone: 'gray' },
]
const expenseCats = [
  { label: 'Cost of goods', value: 'Rp312 M', pct: 52, tone: 'teal' },
  { label: 'Payroll',       value: 'Rp168 M', pct: 28, tone: 'teal' },
  { label: 'Marketing',     value: 'Rp72 M',  pct: 12, tone: 'orange' },
  { label: 'Utilities',     value: 'Rp48 M',  pct: 8,  tone: 'gray' },
]
// Unconnected accounts pulled from cash management (BCA + CIMB Niaga are already
// connected there) — same names so the two screens stay coherent.
const unlinkedBanks = [
  { name: 'DBS Singapore',      short: 'DBS' },
  { name: 'Mandiri Office',     short: 'MO' },
  { name: 'BCA Corporate Card', short: 'BCA' },
]
</script>

<template>
  <!-- Pending approvals -->
  <section v-if="which === 'approvals'" class="card">
    <header class="card__head">
      <h3 class="card__title">Pending approvals</h3>
      <button class="card__link" type="button" @click="soon('Inbox')">View inbox <MpIcon name="arrows-right" size="sm" /></button>
    </header>
    <div class="ai-note">
      <Sparkle :size="16" />
      <span>2 approvals are time-sensitive — PO-2026-0184 blocks a customer shipment and Expense #00231 is past its policy SLA. Consider clearing those first.</span>
    </div>
    <div class="req-list">
      <div v-for="a in approvals" :key="a.text" class="req">
        <span class="req__icon" :class="`req__icon--${a.tone}`"><MpIcon :name="a.icon" size="md" /></span>
        <div class="req__main">
          <p class="req__top"><span class="req__type">{{ a.type }}</span> <span class="req__time">{{ a.time }}</span></p>
          <p class="req__text">{{ a.text }}</p>
          <p v-if="a.meta" class="req__meta">{{ a.meta }}</p>
        </div>
        <MpPopover :id="`appr-menu-${a.text}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="icon-btn" type="button" aria-label="Actions"><MpIcon name="menu-kebab" size="md" /></button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="soon('View details')">View details</MpPopoverListItem>
              <MpPopoverListItem @click="soon('Approve')">Approve</MpPopoverListItem>
              <MpPopoverListItem @click="soon('Reject')">Reject</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </div>
  </section>

  <!-- Cash flow -->
  <section v-else-if="which === 'cash-flow'" class="card card--pad">
    <header class="card__head">
      <h3 class="card__title">Cash flow</h3>
      <button class="card__link" type="button" @click="soon('Cash management')">Cash management <MpIcon name="arrows-right" size="sm" /></button>
    </header>
    <div class="ai-note">
      <Sparkle :size="16" />
      <span>Rp92 M of receivables are overdue, most from 2 customers. Collecting the top 3 invoices would cover this week's payables. <a class="ai-note__link" @click.prevent="soon('Draft reminders')">Draft reminders →</a></span>
    </div>
    <div class="att-stats">
      <div v-for="c in cashStats" :key="c.label" class="att-stat">
        <p class="att-stat__label">{{ c.label }}</p>
        <p class="att-stat__value">{{ c.value }}</p>
        <p class="att-stat__sub" :class="`att-stat__sub--${c.subTone}`">{{ c.sub }}</p>
      </div>
    </div>
    <div class="att-bars">
      <div v-for="bar in cashBars" :key="bar.label" class="att-bar">
        <span class="att-bar__label">{{ bar.label }}</span>
        <span class="att-bar__track"><span class="att-bar__fill" :class="`att-bar__fill--${bar.tone}`" :style="{ width: Math.max(bar.pct, 2) + '%' }" /></span>
        <span class="att-bar__pct">{{ bar.value }}</span>
      </div>
    </div>
  </section>

  <!-- Recent transactions -->
  <section v-else-if="which === 'recent-tx'" class="card">
    <header class="card__head">
      <h3 class="card__title">Recent transactions</h3>
      <button class="card__link" type="button" @click="soon('All transactions')">View all <MpIcon name="arrows-right" size="sm" /></button>
    </header>
    <div class="req-list">
      <div v-for="tx in recentTx" :key="tx.no" class="req">
        <span class="req__icon" :class="`req__icon--${tx.tone}`"><MpIcon :name="tx.icon" size="md" /></span>
        <div class="req__main">
          <p class="req__top"><span class="req__type">{{ tx.type }}</span> <span class="req__time">{{ tx.when }}</span></p>
          <p class="req__text">{{ tx.no }} — {{ tx.party }}</p>
        </div>
        <span class="tx__amount" :class="{ 'tx__amount--pos': tx.pos === true, 'tx__amount--neg': tx.pos === false }">{{ tx.amount }}</span>
      </div>
    </div>
  </section>

  <!-- Due soon -->
  <section v-else-if="which === 'due-soon'" class="card card--pad">
    <header class="card__head"><h3 class="card__title">Due soon</h3></header>
    <div class="ai-note">
      <Sparkle :size="16" />
      <span>Rp102 M of bills fall due before month-end while Rp92 M in receivables is overdue — collecting the top overdue invoices first would cover this week's payments. <a class="ai-note__link" @click.prevent="soon('Schedule payments')">Schedule payments →</a></span>
    </div>
    <div class="due-list">
      <div v-for="(e, i) in events" :key="e.title" class="due" :class="{ 'due--divider': i > 0 }">
        <div class="due__main">
          <p class="due__title">{{ e.title }}</p>
          <p class="due__sub">{{ e.sub }}</p>
          <a class="due__action" @click.prevent="soon(e.action)">{{ e.action }} →</a>
        </div>
        <span class="due__badge" :class="`due__badge--${e.tone}`">{{ e.due }}</span>
      </div>
    </div>
  </section>

  <!-- Warehouse -->
  <section v-else-if="which === 'warehouse'" class="card card--pad">
    <header class="card__head">
      <h3 class="card__title">Warehouse overview</h3>
      <button class="card__link" type="button" @click="soon('WMS overview')">Full report <MpIcon name="arrows-right" size="sm" /></button>
    </header>
    <div class="ai-note">
      <Sparkle :size="16" />
      <span>3 SKUs are out of stock and blocking open sales orders. AI drafted a reorder plan covering the next 4 weeks of demand. <a class="ai-note__link" @click.prevent="soon('Review reorder plan')">Review plan →</a></span>
    </div>
    <div class="att-stats">
      <div v-for="ws in wmsStats" :key="ws.label" class="att-stat">
        <p class="att-stat__label">{{ ws.label }}</p>
        <p class="att-stat__value">{{ ws.value }}</p>
        <a v-if="ws.link" class="att-stat__link" :class="`att-stat__sub--${ws.subTone}`" @click.prevent="soon(ws.sub)">{{ ws.sub }}</a>
        <p v-else class="att-stat__sub" :class="`att-stat__sub--${ws.subTone}`">{{ ws.sub }}</p>
      </div>
    </div>
    <div class="att-bars">
      <div v-for="bar in wmsBars" :key="bar.label" class="att-bar">
        <span class="att-bar__label">{{ bar.label }}</span>
        <span class="att-bar__track"><span class="att-bar__fill" :class="`att-bar__fill--${bar.tone}`" :style="{ width: Math.max(bar.pct, 2) + '%' }" /></span>
        <span class="att-bar__pct">{{ bar.value }}</span>
      </div>
    </div>
  </section>

  <!-- Production -->
  <section v-else-if="which === 'production'" class="card card--pad">
    <header class="card__head">
      <h3 class="card__title">Production output</h3>
      <button class="card__link" type="button" @click="soon('Production')">Full report <MpIcon name="arrows-right" size="sm" /></button>
    </header>
    <div class="hc-stats">
      <div class="hc-stat">
        <p class="hc-stat__label">Work orders open</p>
        <p class="hc-stat__value">23</p>
        <p class="hc-stat__delta hc-stat__delta--up"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>+5 this week</p>
      </div>
      <div class="hc-stat">
        <p class="hc-stat__label">On-time rate</p>
        <p class="hc-stat__value">91%</p>
        <p class="hc-stat__delta hc-stat__delta--up"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Up from 87%</p>
      </div>
    </div>
    <div class="chart">
      <div v-for="bar in prodBars" :key="bar.label" class="chart__col">
        <div class="chart__bar-wrap"><div class="chart__bar" :class="{ 'chart__bar--active': bar.active }" :style="{ height: bar.h + '%' }" /></div>
        <span class="chart__label">{{ bar.label }}</span>
      </div>
    </div>
  </section>

  <!-- Profit & loss -->
  <section v-else-if="which === 'pnl'" class="card card--pad">
    <header class="card__head">
      <h3 class="card__title">Profit &amp; loss</h3>
      <button class="card__link" type="button" @click="soon('P&L report')">Last month <MpIcon name="caret-down" size="sm" /></button>
    </header>
    <p class="pnl__label">Net profit for August</p>
    <p class="pnl__value">Rp1.24 M <span class="pnl__pct">100%</span></p>
    <p class="pnl__delta"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Up 8% from prior month</p>
    <div class="pnl-rows">
      <div v-for="p in pnlBars" :key="p.label" class="att-bar pnl-row">
        <span class="att-bar__label">{{ p.label }}</span>
        <span class="att-bar__track"><span class="att-bar__fill" :class="`att-bar__fill--${p.tone}`" :style="{ width: Math.max(p.pct, 2) + '%' }" /></span>
      </div>
    </div>
    <a class="due__action pnl__link" @click.prevent="soon('P&L report')">See profit and loss report →</a>
  </section>

  <!-- Expenses -->
  <section v-else-if="which === 'expenses'" class="card card--pad">
    <header class="card__head">
      <h3 class="card__title">Expenses</h3>
      <button class="card__link" type="button" @click="soon('Expenses')">This month <MpIcon name="caret-down" size="sm" /></button>
    </header>
    <p class="pnl__value">Rp600 M</p>
    <p class="pnl__label">Total this month</p>
    <div class="att-bars">
      <div v-for="c in expenseCats" :key="c.label" class="att-bar">
        <span class="att-bar__label">{{ c.label }}</span>
        <span class="att-bar__track"><span class="att-bar__fill" :class="`att-bar__fill--${c.tone}`" :style="{ width: Math.max(c.pct, 2) + '%' }" /></span>
        <span class="att-bar__pct">{{ c.value }}</span>
      </div>
    </div>
  </section>

  <!-- Bank accounts (unconnected) -->
  <section v-else-if="which === 'bank-accounts'" class="card card--pad">
    <header class="card__head"><h3 class="card__title">Bank accounts</h3></header>
    <p class="bank__lead">Link your banks to see your balances in one place.</p>
    <div class="bank__list">
      <div v-for="b in unlinkedBanks" :key="b.name" class="bank__row">
        <span class="bank__logo">{{ b.short }}</span>
        <span class="bank__name">{{ b.name }}</span>
        <button class="bank__link" type="button" @click="soon(`Connect ${b.name}`)">Connect</button>
      </div>
    </div>
  </section>

  <!-- Custom widget (empty placeholder) -->
  <section v-else-if="which === 'custom'" class="card card--pad custom-widget">
    <div class="custom-widget__icon"><MpIcon name="add" size="md" /></div>
    <p class="custom-widget__title">Custom widget</p>
    <p class="custom-widget__desc">Build your own widget from any report or metric.</p>
  </section>
</template>

<style scoped>
.card { background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); }
.card--pad { padding: var(--mp-spacing-5); }
.card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.card:not(.card--pad) > .card__head { padding: var(--mp-spacing-5) var(--mp-spacing-5) 0; }
.card__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.card__link { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); background: none; border: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); font-weight: var(--mp-font-weights-regular); }
.card__link:hover { color: var(--mp-text-default); }

.ai-note { margin-top: var(--mp-spacing-3); display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-airene-subtle, #f6f3ff); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-airene, #5221a5); }
.ai-note > svg { flex-shrink: 0; margin-top: 1px; color: var(--mp-airene-default, #7c3aed); }
.ai-note__link { color: var(--mp-text-airene, #5221a5); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.ai-note__link:hover { text-decoration: underline; }
.card:not(.card--pad) > .ai-note { margin-left: var(--mp-spacing-5); margin-right: var(--mp-spacing-5); }

.icon-btn { flex-shrink: 0; align-self: flex-start; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: none; border: none; cursor: pointer; color: var(--mp-text-secondary, #3a4749); border-radius: var(--mp-radii-md, 6px); }
.icon-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

.req-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.req { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.req__icon { width: 36px; height: 36px; border-radius: var(--mp-radii-md, 8px); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.req__icon--blue { background: var(--mp-background-information-subtle, #eaf1fb); color: var(--mp-icon-information, #2f6fd6); }
.req__icon--amber { background: var(--mp-background-warning-subtle, #fffaea); color: var(--mp-icon-warning, #e46910); }
.req__icon--violet { background: var(--mp-background-airene-subtle, #f6f3ff); color: var(--mp-airene-default, #7c3aed); }
.req__icon--green { background: var(--mp-background-success-subtle, #e7f4ee); color: var(--mp-icon-success, #186f4a); }
.req__main { flex: 1; min-width: 0; }
.req__top { margin: 0; }
.req__type { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.req__time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.req__text { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.req__meta { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.tx__amount { flex-shrink: 0; align-self: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tx__amount--pos { color: var(--mp-text-success, #186f4a); }

.att-stats { margin-top: var(--mp-spacing-4); display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-3); }
.att-stat__label { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.att-stat__value { margin: 2px 0 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 30px; color: var(--mp-text-default); }
.att-stat__sub { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); }
.att-stat__link { display: inline-block; margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.att-stat__link:hover { text-decoration: underline; text-underline-offset: 2px; }
.att-stat__sub--green { color: var(--mp-text-success, #186f4a); }
.att-stat__sub--muted { color: var(--mp-text-secondary); }
.att-stat__sub--danger { color: var(--mp-text-danger, #a8352d); }
.att-bars { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.att-bar { display: grid; grid-template-columns: 92px 1fr 56px; align-items: center; gap: var(--mp-spacing-3); }
.att-bar__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.att-bar__track { height: 6px; border-radius: 999px; background: var(--mp-background-neutral-pressed, #ebf0f1); overflow: hidden; }
.att-bar__fill { display: block; height: 100%; border-radius: 999px; }
.att-bar__fill--green, .att-bar__fill--teal { background: var(--mp-background-teal-bold, #0d9488); }
.att-bar__fill--orange { background: var(--mp-background-warning-bold, #e46910); }
.att-bar__fill--gray { background: var(--mp-border-bold, #8c9596); }
.att-bar__pct { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); text-align: right; white-space: nowrap; }

.due-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.due { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) 0; }
.due:first-child { padding-top: 0; }
.due--divider { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.due__main { min-width: 0; }
.due__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.due__sub { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.due__action { display: inline-block; margin-top: 4px; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); cursor: pointer; }
.due__action:hover { text-decoration: underline; text-underline-offset: 2px; }
.due__badge { flex-shrink: 0; padding: 2px var(--mp-spacing-2); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap; }
.due__badge--danger { background: var(--mp-background-danger-subtle, #fdeceb); color: var(--mp-text-danger, #a8352d); }
.due__badge--warn { background: var(--mp-background-warning-subtle, #fffaea); color: var(--mp-text-warning-bold, #a14a0b); }
.due__badge--muted { background: var(--mp-background-neutral-subtle, #f1f3f3); color: var(--mp-text-secondary, #3a4749); }

.hc-stats { margin-top: var(--mp-spacing-4); display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.hc-stat__label { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.hc-stat__value { margin: 2px 0 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 30px; color: var(--mp-text-default); }
.hc-stat__delta { margin: 2px 0 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
.hc-stat__delta--up { color: var(--mp-text-success, #186f4a); }
.chart { margin-top: var(--mp-spacing-5); height: 88px; display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-3); align-items: end; }
.chart__col { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); height: 100%; }
.chart__bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; min-height: 0; }
.chart__bar { width: 100%; max-width: 40px; border-radius: var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0 0; background: var(--mp-background-information-subtle, #dbe7f4); }
.chart__bar--active { background: var(--mp-background-information-bold, #2f6fd6); }
.chart__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pnl__label { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pnl__value { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pnl__pct { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-success, #186f4a); padding: 2px var(--mp-spacing-2); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-success-subtle, #e7f4ee); }
.pnl__delta { margin: var(--mp-spacing-1) 0 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-success, #186f4a); }
.pnl-rows { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.pnl-row { grid-template-columns: 92px 1fr; }
.pnl__link { margin-top: var(--mp-spacing-4); }

.bank__lead { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }
.bank__list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.bank__row { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) 0; border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.bank__row:first-child { border-top: none; }
.bank__logo { flex-shrink: 0; width: 32px; height: 32px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-information-subtle, #eaf1fb); color: var(--mp-icon-information, #2f6fd6); }
.bank__name { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bank__link { flex-shrink: 0; background: none; border: none; cursor: pointer; padding: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); }
.bank__link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Custom widget — empty placeholder */
.custom-widget { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); min-height: 160px; justify-content: center; }
.custom-widget__icon { width: 40px; height: 40px; border-radius: var(--mp-radii-full, 999px); display: flex; align-items: center; justify-content: center; background: var(--mp-background-neutral-subtle, #f1f3f3); color: var(--mp-text-secondary); }
.custom-widget__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.custom-widget__desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 220px; }
</style>
