<script setup lang="ts">
import { h } from 'vue'
import { infoToast } from '~/utils/toasts'
import { MpIcon } from '@mekari/pixel3'

// ── Reusable AI sparkle (4-point star) · matches the SearchBox / Airene mark.
// Copied verbatim from HrHomePage so the AI notes read as one system.
const SPARKLE_D_A = 'M10.9077 8.22842L10.5112 8.17805C9.1059 7.99858 8.00071 6.89127 7.82266 5.48602L7.77514 5.11147C7.69781 4.49787 7.09344 4.08431 6.45714 4.08431C5.82793 4.08431 5.22497 4.48085 5.1441 5.09232L5.09374 5.48885C4.91427 6.8941 3.80695 7.99929 2.4017 8.17734L2.02716 8.22487C1.40008 8.30645 1 8.90657 1 9.54287C1 10.1792 1.3788 10.7793 2.00801 10.8559L2.40454 10.9063C3.80979 11.0857 4.91498 12.1931 5.09303 13.5983L5.14056 13.9728C5.21788 14.6113 5.82226 15 6.45856 15C7.08776 15 7.69852 14.5715 7.77159 13.992L7.82195 13.5955C8.00142 12.1902 9.10874 11.085 10.514 10.907L10.8885 10.8594C11.5192 10.7793 11.9157 10.1777 11.9157 9.54145C11.9157 8.90515 11.5199 8.30503 10.9077 8.22842Z'
const SPARKLE_D_B = 'M14.4956 3.07205L14.2977 3.04651C13.5955 2.95643 13.0422 2.40312 12.9535 1.70085L12.9301 1.51358C12.8911 1.20643 12.5889 1 12.2711 1C11.9561 1 11.6553 1.19791 11.6142 1.50436L11.5887 1.70227C11.4986 2.40454 10.9453 2.95784 10.243 3.04651L10.0557 3.06992C9.7422 3.11107 9.54216 3.41113 9.54216 3.72892C9.54216 4.04672 9.73156 4.34749 10.0465 4.38579L10.2444 4.41133C10.9467 4.50142 11.5 5.05472 11.5887 5.75699L11.6121 5.94427C11.6504 6.26348 11.9533 6.45785 12.2711 6.45785C12.586 6.45785 12.8911 6.24362 12.9279 5.95349L12.9535 5.75558C13.0436 5.05331 13.5969 4.5 14.2991 4.41133L14.4864 4.38792C14.8021 4.3482 15 4.04672 15 3.72892C15 3.41113 14.8021 3.11107 14.4956 3.07205Z'
const Sparkle = (props: { size?: number }) =>
  h('svg', { width: props.size ?? 16, height: props.size ?? 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, [
    h('path', { d: SPARKLE_D_A, fill: 'currentColor' }),
    h('path', { d: SPARKLE_D_B, fill: 'currentColor' }),
  ])

function soon(what: string) {
  infoToast(`${what} · coming soon`)
}

// ── Greeting ──────────────────────────────────────────────────────────────────
// Anchored to the mock "today" (Tue, 21 Jul 2026) so every figure below stays
// coherent (disbursement run Fri, "+12% vs June", oldest waiting 4 days).
const firstName = 'Nata'
const greeting = 'Good morning'
const todayLabel = 'Tue, 21 Jul 2026'

// ── Quick-action chips ──────────────────────────────────────────────────────
interface Chip { label: string; icon: string }
const chips: Chip[] = [
  { label: 'New claim',        icon: 'reimbursement' },
  { label: 'Request a trip',   icon: 'business-trip' },
  { label: 'Purchase request', icon: 'cart' },
  { label: 'Issue a card',     icon: 'billing' },
  { label: 'Set a budget',     icon: 'finance' },
]

// ── Get-started strip ─────────────────────────────────────────────────────────
// Same layout/icons/tints as the ERP/HR Home strip; copy is Mekari Expense-specific.
interface StripItem { icon: string; bg: string; title: string; desc: string }
const strip: StripItem[] = [
  { icon: '/erp-home/flag.svg',  bg: '#F3FBFA', title: 'Get started',     desc: 'Learn the basics of running expenses on Mekari Expense' },
  { icon: '/erp-home/video.svg', bg: '#ECF7F7', title: 'Tutorial videos', desc: 'Learn how to get the most value out of Mekari Expense' },
  { icon: '/erp-home/help.svg',  bg: '#EBF7F2', title: 'Help center',     desc: 'Explore guides and tips for mastering Mekari Expense' },
  { icon: '/erp-home/new.svg',   bg: '#E6F4EF', title: "What's new",      desc: 'Latest updates and features' },
]

// ── KPI stats ────────────────────────────────────────────────────────────────
interface Stat { label: string; value: string; delta: string; deltaTone: 'up' | 'down' | 'warn' | 'muted'; ai: string }
const stats: Stat[] = [
  { label: 'Needs review',          value: '13',            delta: '6 flagged by policy',      deltaTone: 'warn',  ai: 'AI prioritized for you' },
  { label: 'Awaiting your approval', value: 'Rp18.297.890', delta: 'oldest waiting 4 days',    deltaTone: 'warn',  ai: 'Ask AI what to approve first' },
  { label: 'To disburse',           value: 'Rp8.120.000',  delta: '14 approved · runs Fri',   deltaTone: 'muted', ai: 'See the disbursement run' },
  { label: 'Spend this month',      value: 'Rp46.200.000', delta: '+12% vs June · on budget', deltaTone: 'up',    ai: 'Benchmark with budget' },
]

// ── Waiting on you (review queue) ─────────────────────────────────────────────
interface Waiting { photo: string; name: string; memo: string; flag: string; flagTone: 'warn' | 'muted' | 'danger'; amount: string }
const waiting: Waiting[] = [
  { photo: '/hr-home/people0.png', name: 'Maya Chen',     memo: 'Client dinner · Nobu Downtown',    flag: 'Missing itemization',    flagTone: 'warn',   amount: 'Rp184.000' },
  { photo: '/hr-home/people1.png', name: 'Daniel Reyes',  memo: 'Flight SFO → JFK, onsite week',     flag: 'In policy',              flagTone: 'muted',  amount: 'Rp412.500' },
  { photo: '/hr-home/people2.png', name: 'Priya Sharma',  memo: 'Adobe Creative Cloud renewal',      flag: 'Possible duplicate',     flagTone: 'danger', amount: 'Rp59.990' },
  { photo: '/hr-home/people3.png', name: 'Tom Okafor',    memo: 'Team offsite venue deposit',        flag: 'Over limit +Rp250.000',  flagTone: 'warn',   amount: 'Rp1.250.000' },
]

// ── Copilot digest ────────────────────────────────────────────────────────────
const digest: string[] = [
  'Transport is at 98% of its hard cap · blocks new claims in ~4 days at the current pace.',
  '3 software renewals hit cards this week · Rp5.100.000; one card lacks the balance.',
  '2 claims look like duplicates (same vendor, same amount, 1 day apart) · review those first.',
]

// ── Spend this month (by category) ────────────────────────────────────────────
const spendBars = [
  { label: 'Software',      pct: 92,  value: 'Rp12.4jt', tone: 'orange' as const },
  { label: 'Travel',        pct: 64,  value: 'Rp9.8jt',  tone: 'green' as const },
  { label: 'Meals & ent.',  pct: 48,  value: 'Rp7.2jt',  tone: 'green' as const },
  { label: 'Office',        pct: 20,  value: 'Rp3.1jt',  tone: 'gray' as const },
]

// ── Upcoming ──────────────────────────────────────────────────────────────────
interface EventItem { day: string; month: string; title: string; sub: string }
const events: EventItem[] = [
  { day: '24', month: 'JUL', title: 'Disbursement run',            sub: '14 approved claims · Rp8.120.000' },
  { day: '25', month: 'JUL', title: 'Adobe & Figma renewals',      sub: 'Rp5.100.000 on the Marketing card' },
  { day: '31', month: 'JUL', title: 'July spend closes',           sub: 'Reconcile before the month cutoff' },
  { day: '01', month: 'AUG', title: 'Q3 travel budget resets',     sub: 'New per diem caps take effect' },
]

// ── Spend trend ───────────────────────────────────────────────────────────────
const trendBars = [
  { label: 'Feb', h: 48, active: false },
  { label: 'Mar', h: 60, active: false },
  { label: 'Apr', h: 72, active: false },
  { label: 'May', h: 66, active: false },
  { label: 'Jun', h: 82, active: false },
  { label: 'Jul', h: 100, active: true },
]
</script>

<template>
  <div class="xpmhome">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <section class="hero">
      <p class="hero__date">🌤️ {{ todayLabel }}</p>
      <div class="hero__greeting">
        <h2 class="hero__line">{{ greeting }} {{ firstName }},</h2>
        <h2 class="hero__line">what would you like to do today?</h2>
      </div>
      <SearchBox class="hero__search" placeholder="How can I help you today?" />
      <div class="chips">
        <button v-for="c in chips" :key="c.label" class="chip" type="button" @click="soon(c.label)">
          <MpIcon :name="c.icon" size="sm" class="chip__icon" />
          {{ c.label }}
        </button>
        <button class="chip" type="button" @click="soon('Add actions')">
          <MpIcon name="add" size="sm" class="chip__icon" />
          Add actions
        </button>
      </div>
    </section>

    <!-- ── Get started strip ────────────────────────────────────────────── -->
    <div class="strip">
      <button v-for="s in strip" :key="s.title" class="strip__item" type="button" :style="{ background: s.bg }" @click="soon(s.title)">
        <span class="strip__text">
          <span class="strip__title">{{ s.title }}</span>
          <span class="strip__desc">{{ s.desc }}</span>
        </span>
        <img :src="s.icon" alt="" class="strip__icon">
      </button>
    </div>

    <!-- Below the strip: 8-of-12-column content, centered -->
    <div class="below">
      <!-- ── Review-queue banner ──────────────────────────────────────────── -->
      <div class="banner">
        <svg class="banner__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="var(--mp-icon-warning, #e46910)"/>
          <path d="M12 9v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="16.5" r="1.15" fill="#fff"/>
        </svg>
        <div class="banner__text">
          <p class="banner__title">13 items need your review</p>
          <p class="banner__sub">6 are flagged by policy or AI. Clearing the flagged ones first unblocks Friday's disbursement run.</p>
        </div>
        <button class="banner__btn" type="button" @click="soon('Review queue')">Review queue</button>
      </div>

      <!-- ── KPI stats ────────────────────────────────────────────────────── -->
      <div class="stats">
        <div v-for="s in stats" :key="s.label" class="stat">
          <p class="stat__label">{{ s.label }}</p>
          <p class="stat__value">{{ s.value }}</p>
          <p class="stat__delta" :class="`stat__delta--${s.deltaTone}`">
            <svg v-if="s.deltaTone === 'up'" class="stat__delta-ic" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg v-else-if="s.deltaTone === 'down'" class="stat__delta-ic" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M8 13l-4-4M8 13l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg v-else-if="s.deltaTone === 'warn'" class="stat__delta-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="currentColor"/><path d="M12 9v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.05" fill="#fff"/></svg>
            {{ s.delta }}
          </p>
          <button class="stat__ai" type="button" @click="soon(s.ai)">
            <Sparkle :size="14" />
            {{ s.ai }}
          </button>
        </div>
      </div>

      <!-- ── Widget grid ──────────────────────────────────────────────────── -->
      <div class="grid">
        <!-- LEFT COLUMN -->
        <div class="col">
          <!-- Waiting on you -->
          <section class="card">
            <header class="card__head">
              <h3 class="card__title">Waiting on you</h3>
              <button class="card__link" type="button" @click="soon('Inbox')">Open inbox <MpIcon name="arrows-right" size="sm" /></button>
            </header>
            <div class="ai-note">
              <Sparkle :size="16" />
              <span>Rp9.773.990 is waiting on you · Priya's renewal looks like a duplicate and Tom's deposit is over limit. <a class="ai-note__link" @click.prevent="soon('Review flagged')">Review flagged →</a></span>
            </div>
            <div class="wait-list">
              <div v-for="w in waiting" :key="w.name" class="wait">
                <img :src="w.photo" alt="" class="wait__avatar">
                <div class="wait__main">
                  <p class="wait__name">{{ w.name }}</p>
                  <p class="wait__memo">{{ w.memo }}</p>
                  <span class="wait__flag" :class="`wait__flag--${w.flagTone}`">{{ w.flag }}</span>
                </div>
                <div class="wait__right">
                  <span class="wait__amount">{{ w.amount }}</span>
                  <button class="wait__btn" type="button" @click="soon('Review claim')">Review</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Spend this month -->
          <section class="card card--pad">
            <header class="card__head">
              <h3 class="card__title">Spend this month</h3>
              <button class="card__link" type="button" @click="soon('Spend report')">Full report <MpIcon name="arrows-right" size="sm" /></button>
            </header>
            <div class="ai-note">
              <Sparkle :size="16" />
              <span>Software is at 92% of its monthly cap, driven by renewals landing this week. <a class="ai-note__link" @click.prevent="soon('Investigate spend')">Investigate →</a></span>
            </div>
            <div class="spend-stats">
              <div class="spend-stat">
                <p class="spend-stat__label">Total spend · Jul</p>
                <p class="spend-stat__value">Rp46.200.000</p>
                <p class="spend-stat__delta spend-stat__delta--up">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  +12% vs June
                </p>
              </div>
              <div class="spend-stat">
                <p class="spend-stat__label">Budget used</p>
                <p class="spend-stat__value">74%</p>
                <p class="spend-stat__delta spend-stat__delta--muted">On track for the month</p>
              </div>
            </div>
            <div class="spend-bars">
              <div v-for="bar in spendBars" :key="bar.label" class="spend-bar">
                <span class="spend-bar__label">{{ bar.label }}</span>
                <span class="spend-bar__track"><span class="spend-bar__fill" :class="`spend-bar__fill--${bar.tone}`" :style="{ width: Math.max(bar.pct, 2) + '%' }" /></span>
                <span class="spend-bar__val">{{ bar.value }}</span>
              </div>
            </div>
          </section>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="col">
          <!-- Copilot digest -->
          <section class="card card--pad">
            <header class="card__head">
              <h3 class="card__title"><span class="card__title-ai"><Sparkle :size="16" /></span> Copilot digest</h3>
              <button class="card__link" type="button" @click="soon('Ask Copilot')">Ask Copilot <MpIcon name="arrows-right" size="sm" /></button>
            </header>
            <div class="digest-list">
              <div v-for="(d, i) in digest" :key="i" class="digest">
                <span class="digest__dot" />
                <p class="digest__text">{{ d }}</p>
              </div>
            </div>
            <p class="digest__foot">Every line is traceable · click through to the source.</p>
          </section>

          <!-- Upcoming -->
          <section class="card card--pad">
            <header class="card__head">
              <h3 class="card__title">Upcoming</h3>
              <button class="card__link" type="button" @click="soon('Calendar')">View calendar <MpIcon name="arrows-right" size="sm" /></button>
            </header>
            <div class="ev-list">
              <div v-for="(e, i) in events" :key="e.title" class="ev" :class="{ 'ev--divider': i > 0 }">
                <div class="ev__date">
                  <span class="ev__day">{{ e.day }}</span>
                  <span class="ev__month">{{ e.month }}</span>
                </div>
                <div class="ev__main">
                  <p class="ev__title">{{ e.title }}</p>
                  <p class="ev__sub">{{ e.sub }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Spend trend -->
          <section class="card card--pad">
            <header class="card__head">
              <h3 class="card__title">Spend trend</h3>
              <button class="card__link" type="button" @click="soon('Spend trend report')">Full report <MpIcon name="arrows-right" size="sm" /></button>
            </header>
            <div class="hc-stats">
              <div class="hc-stat">
                <p class="hc-stat__label">Spend · last 6 months</p>
                <p class="hc-stat__value">Rp241jt</p>
                <p class="hc-stat__delta hc-stat__delta--up">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  +12% this month
                </p>
              </div>
              <div class="hc-stat">
                <p class="hc-stat__label">Avg / month</p>
                <p class="hc-stat__value">Rp40.2jt</p>
                <p class="hc-stat__delta hc-stat__delta--muted">Within budget</p>
              </div>
            </div>
            <div class="chart">
              <div v-for="bar in trendBars" :key="bar.label" class="chart__col">
                <div class="chart__bar-wrap">
                  <div class="chart__bar" :class="{ 'chart__bar--active': bar.active }" :style="{ height: bar.h + '%' }" />
                </div>
                <span class="chart__label">{{ bar.label }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- ── Footer ───────────────────────────────────────────────────────── -->
    <button class="manage" type="button" @click="soon('Manage widgets')">
      <MpIcon name="settings" size="sm" />
      Manage widgets
    </button>
  </div>
</template>

<style scoped>
.xpmhome {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6, 24px);
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
.hero {
  margin: 0 calc(var(--mp-spacing-6) * -1) 0;
  background: linear-gradient(180deg, var(--mp-background-surface-cream, #f9f5ef) 0%, var(--mp-background-surface-cream-light, #fffdf8) 100%);
  padding: var(--mp-spacing-8) var(--mp-spacing-6);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hero__date {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
.hero__greeting { text-align: center; margin-top: var(--mp-spacing-2); }
.hero__line {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 28px);
  color: var(--mp-text-default);
}
.hero__search { margin-top: var(--mp-spacing-5); width: 100%; max-width: 560px; }
.chips {
  margin-top: var(--mp-spacing-4);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--mp-spacing-3);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: 6px 16px 6px 12px;
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default, #080d0e);
  cursor: pointer;
  white-space: nowrap;
  transition: background 100ms;
}
.chip:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.chip__icon { width: 16px; height: 16px; color: var(--mp-text-secondary, #3a4749); flex-shrink: 0; }

.below {
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6);
}

/* ── Get started strip ─────────────────────────────────────────────────────── */
.strip {
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid #C8E4DA;
  border-radius: var(--mp-radii-xl, 12px);
  background: var(--mp-background-neutral, #fff);
  overflow: hidden;
}
.strip__item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-5) var(--mp-spacing-6);
  border: none;
  border-left: 1px solid #C8E4DA;
  cursor: pointer;
  text-align: left;
}
.strip__item:first-child { border-left: none; }
.strip__item::after { content: ''; position: absolute; inset: 0; background: rgba(0, 0, 0, 0); transition: background 100ms; pointer-events: none; }
.strip__item:hover::after { background: rgba(0, 0, 0, 0.03); }
.strip__icon { position: relative; z-index: 1; width: 40px; height: 40px; flex-shrink: 0; }
.strip__text { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.strip__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.strip__desc { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }

/* ── Banner ───────────────────────────────────────────────────────────────── */
.banner {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border: 1px solid var(--mp-border-warning, #ebdbbb);
  border-radius: var(--mp-radii-xl, 12px);
  background: var(--mp-background-warning-subtle, #fffaea);
}
.banner__icon { flex-shrink: 0; margin-top: 1px; align-self: flex-start; }
.banner__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.banner__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-warning-bold, #a14a0b); }
.banner__sub { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-warning, #402a15); }
.banner__btn {
  flex-shrink: 0;
  height: 36px;
  padding: 0 var(--mp-spacing-4);
  border: none;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse-bold, #272b32);
  color: #fff;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
  white-space: nowrap;
}
.banner__btn:hover { background: var(--mp-background-inverse-bold-hovered, #3a3f47); }

/* ── KPI stats ────────────────────────────────────────────────────────────── */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-xl, 12px);
  background: var(--mp-background-neutral, #fff);
}
.stat {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-5) var(--mp-spacing-6);
  border-left: 1px solid var(--mp-border-default, #e3e7e9);
}
.stat:first-child { border-left: none; }
.stat__label { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.stat__value { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default); }
.stat__delta { margin: 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); }
.stat__delta-ic { flex-shrink: 0; }
.stat__delta--up { color: var(--mp-text-success, #186f4a); }
.stat__delta--down { color: var(--mp-text-success, #186f4a); }
.stat__delta--warn { color: var(--mp-text-warning-bold, #a14a0b); }
.stat__delta--muted { color: var(--mp-text-secondary); }
.stat__ai {
  margin-top: var(--mp-spacing-1);
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-airene-default, #7c3aed);
}
.stat__ai:hover { text-decoration: underline; }

/* ── Widget grid ──────────────────────────────────────────────────────────── */
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--mp-spacing-6);
  align-items: start;
}
.col { display: flex; flex-direction: column; gap: var(--mp-spacing-6); min-width: 0; }

.card {
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-xl, 12px);
}
.card--pad { padding: var(--mp-spacing-5); }
.card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.card:not(.card--pad) > .card__head { padding: var(--mp-spacing-5) var(--mp-spacing-5) 0; }
.card__title { margin: 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.card__title-ai { display: inline-flex; color: var(--mp-airene-default, #7c3aed); }
.card__link {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  font-weight: var(--mp-font-weights-regular);
}
.card__link:hover { color: var(--mp-text-default); }

/* AI insight note (purple) */
.ai-note {
  margin-top: var(--mp-spacing-3);
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md, 8px);
  background: var(--mp-background-airene-subtle, #f6f3ff);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-airene, #5221a5);
}
.ai-note > svg { flex-shrink: 0; margin-top: 1px; color: var(--mp-airene-default, #7c3aed); }
.card:not(.card--pad) > .ai-note { margin-left: var(--mp-spacing-5); margin-right: var(--mp-spacing-5); }
.ai-note__link { color: var(--mp-text-airene, #5221a5); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.ai-note__link:hover { text-decoration: underline; }

/* ── Waiting on you ───────────────────────────────────────────────────────── */
.wait-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.wait {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.wait__avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; flex-shrink: 0; }
.wait__main { flex: 1; min-width: 0; }
.wait__name { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wait__memo { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wait__flag {
  display: inline-block;
  margin-top: var(--mp-spacing-2);
  padding: 1px 8px;
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
}
.wait__flag--warn { background: var(--mp-background-warning-subtle, #fffaea); color: var(--mp-text-warning-bold, #a14a0b); }
.wait__flag--muted { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-secondary); }
.wait__flag--danger { background: var(--mp-background-danger-subtle, #fdf0ef); color: var(--mp-text-danger, #a8352d); }
.wait__right { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-2); flex-shrink: 0; }
.wait__amount { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wait__btn {
  height: 28px;
  padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-text-default, #080d0e);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  color: var(--mp-text-default, #080d0e);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
}
.wait__btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* ── Spend this month ─────────────────────────────────────────────────────── */
.spend-stats { margin-top: var(--mp-spacing-4); display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.spend-stat__label { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.spend-stat__value { margin: 2px 0 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 30px; color: var(--mp-text-default); }
.spend-stat__delta { margin: 2px 0 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
.spend-stat__delta--up { color: var(--mp-text-success, #186f4a); }
.spend-stat__delta--muted { color: var(--mp-text-secondary); }
.spend-bars { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.spend-bar { display: grid; grid-template-columns: 96px 1fr 72px; align-items: center; gap: var(--mp-spacing-3); }
.spend-bar__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.spend-bar__track { height: 6px; border-radius: 999px; background: var(--mp-background-neutral-pressed, #ebf0f1); overflow: hidden; }
.spend-bar__fill { display: block; height: 100%; border-radius: 999px; }
.spend-bar__fill--green { background: var(--mp-background-success-bold, #186f4a); }
.spend-bar__fill--orange { background: var(--mp-background-warning-bold, #e46910); }
.spend-bar__fill--gray { background: var(--mp-border-bold, #8c9596); }
.spend-bar__val { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); text-align: right; }

/* ── Copilot digest ───────────────────────────────────────────────────────── */
.digest-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.digest { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.digest__dot { flex-shrink: 0; width: 6px; height: 6px; margin-top: 7px; border-radius: 999px; background: var(--mp-airene-default, #7c3aed); }
.digest__text { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.digest__foot { margin: var(--mp-spacing-4) 0 0; padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Upcoming ─────────────────────────────────────────────────────────────── */
.ev-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.ev { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) 0; }
.ev:first-child { padding-top: 0; }
.ev--divider { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.ev__date { flex-shrink: 0; width: 32px; display: flex; flex-direction: column; align-items: flex-start; }
.ev__day { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: 20px; color: var(--mp-text-default); }
.ev__month { font-size: 10px; font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.4px; color: var(--mp-text-secondary); }
.ev__main { min-width: 0; }
.ev__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ev__sub { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Spend trend ──────────────────────────────────────────────────────────── */
.hc-stats { margin-top: var(--mp-spacing-4); display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.hc-stat__label { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.hc-stat__value { margin: 2px 0 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 30px; color: var(--mp-text-default); }
.hc-stat__delta { margin: 2px 0 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
.hc-stat__delta--up { color: var(--mp-text-success, #186f4a); }
.hc-stat__delta--muted { color: var(--mp-text-secondary); }
.chart { margin-top: var(--mp-spacing-5); height: 88px; display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-3); align-items: end; }
.chart__col { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); height: 100%; }
.chart__bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; min-height: 0; }
.chart__bar { width: 100%; max-width: 40px; border-radius: var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0 0; background: var(--mp-background-information-subtle, #dbe7f4); }
.chart__bar--active { background: var(--mp-background-information-bold, #2f6fd6); }
.chart__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Footer ───────────────────────────────────────────────────────────────── */
.manage {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.manage:hover { color: var(--mp-text-default); }

/* ── Mobile (≤640px) ──────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .hero { padding-left: var(--mp-spacing-4); padding-right: var(--mp-spacing-4); }
  .hero__search { max-width: 100%; }
  .chips { align-self: stretch; flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex-shrink: 0; }
  .stats { grid-template-columns: 1fr; }
  .stat { border-left: none; }
  .stat + .stat { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
  .strip { grid-template-columns: 1fr 1fr; }
  .strip__icon { display: none; }
  .grid { grid-template-columns: 1fr; }
  .spend-stats { grid-template-columns: 1fr; }
  .hc-stats { grid-template-columns: 1fr; }
  .banner { flex-wrap: wrap; }
  .banner__btn { flex: 1 1 100%; width: 100%; display: flex; align-items: center; justify-content: center; margin-top: var(--mp-spacing-3); }
}
</style>
