<script setup lang="ts">
import { h, ref } from 'vue'
import { infoToast } from '~/utils/toasts'
import { MpButton, MpIcon, toast } from '@mekari/pixel3'

// ── Reusable AI sparkle (4-point star) — matches the SearchBox / Airene mark ──
const SPARKLE_D_A = 'M10.9077 8.22842L10.5112 8.17805C9.1059 7.99858 8.00071 6.89127 7.82266 5.48602L7.77514 5.11147C7.69781 4.49787 7.09344 4.08431 6.45714 4.08431C5.82793 4.08431 5.22497 4.48085 5.1441 5.09232L5.09374 5.48885C4.91427 6.8941 3.80695 7.99929 2.4017 8.17734L2.02716 8.22487C1.40008 8.30645 1 8.90657 1 9.54287C1 10.1792 1.3788 10.7793 2.00801 10.8559L2.40454 10.9063C3.80979 11.0857 4.91498 12.1931 5.09303 13.5983L5.14056 13.9728C5.21788 14.6113 5.82226 15 6.45856 15C7.08776 15 7.69852 14.5715 7.77159 13.992L7.82195 13.5955C8.00142 12.1902 9.10874 11.085 10.514 10.907L10.8885 10.8594C11.5192 10.7793 11.9157 10.1777 11.9157 9.54145C11.9157 8.90515 11.5199 8.30503 10.9077 8.22842Z'
const SPARKLE_D_B = 'M14.4956 3.07205L14.2977 3.04651C13.5955 2.95643 13.0422 2.40312 12.9535 1.70085L12.9301 1.51358C12.8911 1.20643 12.5889 1 12.2711 1C11.9561 1 11.6553 1.19791 11.6142 1.50436L11.5887 1.70227C11.4986 2.40454 10.9453 2.95784 10.243 3.04651L10.0557 3.06992C9.7422 3.11107 9.54216 3.41113 9.54216 3.72892C9.54216 4.04672 9.73156 4.34749 10.0465 4.38579L10.2444 4.41133C10.9467 4.50142 11.5 5.05472 11.5887 5.75699L11.6121 5.94427C11.6504 6.26348 11.9533 6.45785 12.2711 6.45785C12.586 6.45785 12.8911 6.24362 12.9279 5.95349L12.9535 5.75558C13.0436 5.05331 13.5969 4.5 14.2991 4.41133L14.4864 4.38792C14.8021 4.3482 15 4.04672 15 3.72892C15 3.41113 14.8021 3.11107 14.4956 3.07205Z'
const Sparkle = (props: { size?: number }) =>
  h('svg', { width: props.size ?? 16, height: props.size ?? 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, [
    h('path', { d: SPARKLE_D_A, fill: 'currentColor' }),
    h('path', { d: SPARKLE_D_B, fill: 'currentColor' }),
  ])

const router = useRouter()
function soon(what: string) {
  infoToast(`${what} — coming soon`)
}

// ── Greeting ──────────────────────────────────────────────────────────────────
// Date is anchored to the mock's "today" (28 Feb 2026) so every widget below —
// "payroll due 1 Mar", "On leave today", "Today" birthdays — stays coherent.
const firstName = 'Rizal'
const greeting = 'Good morning'
const todayLabel = 'Tue, 28 Feb 2026'

// ── Quick-action chips ──────────────────────────────────────────────────────
interface Chip { label: string; icon: string }
const chips: Chip[] = [
  { label: 'Add employee',         icon: 'employee' },
  { label: 'Import data',          icon: 'download' },
  { label: 'Post announcement',    icon: 'broadcast' },
  { label: 'Manage shift schedule', icon: 'calendar' },
]

// ── Set-up / learn strip ─────────────────────────────────────────────────────
// Icons, pastel tints and layout mirror the ERP Home v2 strip exactly; only the
// copy is HR-specific (Talenta).
interface StripItem { icon: string; bg: string; title: string; desc: string }
const strip: StripItem[] = [
  { icon: '/erp-home/flag.svg',  bg: '#F3FBFA', title: 'Get started',     desc: 'Learn every basics of how to run & operate Talenta' },
  { icon: '/erp-home/video.svg', bg: '#ECF7F7', title: 'Tutorial videos', desc: 'Learn how to get the most value out of Talenta' },
  { icon: '/erp-home/help.svg',  bg: '#EBF7F2', title: 'Help center',     desc: 'Explore guides and tips for mastering Talenta' },
  { icon: '/erp-home/new.svg',   bg: '#E6F4EF', title: "What's new",      desc: 'Latest updates and features' },
]

// ── KPI stats ────────────────────────────────────────────────────────────────
interface Stat { label: string; value: string; delta: string; deltaTone: 'up' | 'down' | 'warn' | 'muted'; ai: string }
const stats: Stat[] = [
  { label: 'Total employees',  value: '1,248', delta: '+12 this month',          deltaTone: 'up',    ai: 'Ask AI about headcount' },
  { label: 'Awaiting approval', value: '7',     delta: '2 need action now', deltaTone: 'warn',  ai: 'AI prioritized for you' },
  { label: 'On leave today',   value: '18',    delta: '3 unconfirmed',           deltaTone: 'muted', ai: 'See team coverage' },
  { label: 'Turnover rate',    value: '2.1%',  delta: '0.4% vs Jan — improving', deltaTone: 'down',  ai: 'Benchmark with industry' },
]

// ── Pending requests ─────────────────────────────────────────────────────────
interface Request { photo: string; type: string; time: string; text: string; meta: string }
const requests: Request[] = [
  { photo: '/hr-home/people0.png', type: 'Time off',              time: '10 min ago', text: 'Indah Permata is requesting Sick Leave',        meta: '15 Apr - 16 Apr 2026 (2d)' },
  { photo: '/hr-home/people1.png', type: 'Overtime',              time: '27 Feb',     text: 'Galih Prakoso is requesting overtime',          meta: '26 Feb 2026, 2h' },
  { photo: '/hr-home/people2.png', type: 'Time off',              time: '27 Feb',     text: 'Daud Dimas is requesting Cuti Tahunan',          meta: '10 May - 15 May 2026 (6d)' },
  { photo: '/hr-home/people3.png', type: 'Benefit reimbursement', time: '25 Feb',     text: 'Christin Sari is requesting Medical Outpatient', meta: 'Rp450.000' },
  { photo: '/hr-home/people4.png', type: 'Change data',           time: '10 Feb',     text: 'Eka Setiawan is requesting change data',        meta: '' },
]

// ── Attendance today ─────────────────────────────────────────────────────────
const attendanceStats = [
  { label: 'Present',  value: '1,174', sub: '94.1%',        subTone: 'green' as const },
  { label: 'On leave', value: '18',    sub: 'Approved',     subTone: 'muted' as const },
  { label: 'Absent',   value: '56',    sub: '3 unconfirmed', subTone: 'danger' as const },
]
const attendanceBars = [
  { label: 'Present',       pct: 94,  value: '94%',  tone: 'green' as const },
  { label: 'On leave',      pct: 1.4, value: '1.4%', tone: 'green' as const },
  { label: 'Absent',        pct: 4.5, value: '4.5%', tone: 'orange' as const },
  { label: 'Late clock in', pct: 8,   value: '8%',   tone: 'gray' as const },
]

// ── Announcements ────────────────────────────────────────────────────────────
interface Announcement { title: string; body: string; meta: string }
const announcements: Announcement[] = [
  { title: 'Reminder: Annual tax document submission', body: 'All employees must submit SPT documents before April 30. Contact Finance if you have questions about your bukti potong.', meta: 'Posted 10 Feb by Rizal Candra' },
  { title: 'Welcome 12 new employees joining this Feb!', body: 'The team is growing. Warm welcome to our newest colleagues across Marketing, Engineering, and Operations.', meta: 'Posted 2 Feb by Cinta Ayu' },
  { title: 'Remote work policy update — hybrid schedule Q2 2026', body: 'Starting May, all departments move to 3 days in-office, 2 days remote. Department heads should update shift configurations accordingly.', meta: 'Posted 25 Jan by Cinta Ayu' },
]

// ── Upcoming events ──────────────────────────────────────────────────────────
interface EventItem { day: string; month: string; title: string; sub: string }
const events: EventItem[] = [
  { day: '11', month: 'FEB', title: 'February payroll deadline',      sub: 'Finalize & submit to finance' },
  { day: '14', month: 'FEB', title: 'Q1 KPI review deadline',         sub: "12 employees haven't submitted" },
  { day: '17', month: 'FEB', title: 'Lunar New Year - Public holiday', sub: 'Ensure shift schedule is adjusted' },
  { day: '20', month: 'FEB', title: '2 fixed-term contracts expiring', sub: 'Review renewal or off-boarding' },
]

// ── Headcount trend ──────────────────────────────────────────────────────────
const trendBars = [
  { label: 'Sep', h: 42, active: false },
  { label: 'Oct', h: 54, active: false },
  { label: 'Nov', h: 70, active: false },
  { label: 'Dec', h: 62, active: false },
  { label: 'Jan', h: 76, active: false },
  { label: 'Feb', h: 100, active: true },
]

// ── Birthday & anniversaries ─────────────────────────────────────────────────
interface Celebration { photo: string; name: string; role: string; when: string; anniversary?: string }
const celebrations: Celebration[] = [
  { photo: '/hr-home/people0.png', name: 'Indah Permata', role: 'CP067 - Sous Chef - Kitchen',      when: 'Today' },
  { photo: '/hr-home/people5.png', name: 'Jessie Tan',    role: 'CP038 - Sales Manager - Sales',    when: '2 Mar', anniversary: '3 years' },
  { photo: '/hr-home/people4.png', name: 'Eka Setiawan',  role: 'CP065 - Barista - Front of House', when: '5 Mar' },
]
</script>

<template>
  <div class="hrhome">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <section class="hero">
      <p class="hero__date">🌤️ {{ todayLabel }}</p>
      <div class="hero__greeting">
        <h2 class="hero__line">{{ greeting }} {{ firstName }},</h2>
        <h2 class="hero__line">what would you like to do today?</h2>
      </div>
      <SearchBox class="hero__search" placeholder="How can I help you today?" />
      <div class="chips">
        <MpButton v-for="c in chips" :key="c.label" class="chip" type="button" :left-icon="c.icon" @click="soon(c.label)">
          {{ c.label }}
        </MpButton>
        <MpButton class="chip" type="button" left-icon="add" @click="soon('Add actions')">
          Add actions
        </MpButton>
      </div>
    </section>

    <!-- ── Get started strip ────────────────────────────────────────────── -->
    <div class="strip">
      <MpButton v-for="s in strip" :key="s.title" class="strip__item" type="button" :style="{ background: s.bg }" @click="soon(s.title)">
        <span class="strip__text">
          <span class="strip__title">{{ s.title }}</span>
          <span class="strip__desc">{{ s.desc }}</span>
        </span>
        <img :src="s.icon" alt="" class="strip__icon">
      </MpButton>
    </div>

    <!-- Below the strip: 8-of-12-column content, centered (banner + stats + grid) -->
    <div class="below">
    <!-- ── Payroll warning banner ───────────────────────────────────────── -->
    <div class="banner">
      <svg class="banner__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="var(--mp-icon-warning, #e46910)"/>
        <path d="M12 9v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="16.5" r="1.15" fill="#fff"/>
      </svg>
      <div class="banner__text">
        <p class="banner__title">February payroll hasn't been finalized yet</p>
        <p class="banner__sub">Due date: 1 Mar - 1 day away. Make sure all attendance data is complete before running payroll.</p>
      </div>
      <MpButton class="banner__btn" type="button" @click="soon('Review payroll')">Review payroll</MpButton>
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
        <MpButton class="stat__ai" type="button" @click="soon(s.ai)">
          <Sparkle :size="14" />
          {{ s.ai }}
        </MpButton>
      </div>
    </div>

    <!-- ── Widget grid ──────────────────────────────────────────────────── -->
    <div class="grid">
      <!-- LEFT COLUMN -->
      <div class="col">
        <!-- Pending requests -->
        <section class="card">
          <header class="card__head">
            <h3 class="card__title">Pending requests</h3>
            <MpButton class="card__filter" type="button" left-icon="caret-down" @click="soon('All requests')">
              All requests
            </MpButton>
          </header>
          <div class="ai-note">
            <Sparkle :size="16" />
            <span>2 requests are time-sensitive — Indah's leave starts in 8 days and Galih's overtime period has already passed. Consider approving or rejecting those first.</span>
          </div>
          <div class="req-list">
            <div v-for="r in requests" :key="r.text" class="req">
              <img :src="r.photo" alt="" class="req__avatar">
              <div class="req__main">
                <p class="req__top"><span class="req__type">{{ r.type }}</span> <span class="req__time">{{ r.time }}</span></p>
                <p class="req__text">{{ r.text }}</p>
                <p v-if="r.meta" class="req__meta">{{ r.meta }}</p>
              </div>
              <MpButton class="icon-btn" type="button" left-icon="menu-kebab" @click="soon('Request actions')" />
            </div>
          </div>
        </section>

        <!-- Attendance today -->
        <section class="card card--pad">
          <header class="card__head">
            <h3 class="card__title">Attendance today</h3>
            <MpButton class="card__link" type="button" left-icon="arrows-right" @click="soon('Attendance report')">Full report</MpButton>
          </header>
          <div class="ai-note">
            <Sparkle :size="16" />
            <span>Absence rate in the Engineering team is 3x higher than usual today. <a class="ai-note__link" @click.prevent="soon('Investigate')">Investigate →</a></span>
          </div>
          <div class="att-stats">
            <div v-for="a in attendanceStats" :key="a.label" class="att-stat">
              <p class="att-stat__label">{{ a.label }}</p>
              <p class="att-stat__value">{{ a.value }}</p>
              <p class="att-stat__sub" :class="`att-stat__sub--${a.subTone}`">{{ a.sub }}</p>
            </div>
          </div>
          <div class="att-bars">
            <div v-for="bar in attendanceBars" :key="bar.label" class="att-bar">
              <span class="att-bar__label">{{ bar.label }}</span>
              <span class="att-bar__track"><span class="att-bar__fill" :class="`att-bar__fill--${bar.tone}`" :style="{ width: Math.max(bar.pct, 2) + '%' }" /></span>
              <span class="att-bar__pct">{{ bar.value }}</span>
            </div>
          </div>
        </section>

        <!-- Announcement -->
        <section class="card card--pad">
          <header class="card__head">
            <h3 class="card__title">Announcement</h3>
            <MpButton class="card__link" type="button" left-icon="arrows-right" @click="soon('Manage announcements')">Manage announcements</MpButton>
          </header>
          <div class="ann-list">
            <article v-for="(a, i) in announcements" :key="a.title" class="ann" :class="{ 'ann--divider': i > 0 }">
              <h4 class="ann__title">{{ a.title }}</h4>
              <p class="ann__body">{{ a.body }}</p>
              <p class="ann__meta">{{ a.meta }}</p>
            </article>
          </div>
        </section>
      </div>

      <!-- RIGHT COLUMN -->
      <div class="col">
        <!-- Upcoming events -->
        <section class="card card--pad">
          <header class="card__head">
            <h3 class="card__title">Upcoming events</h3>
            <MpButton class="card__link" type="button" left-icon="arrows-right" @click="soon('Calendar')">View calendar</MpButton>
          </header>
          <div class="ai-note">
            <Sparkle :size="16" />
            <span>You have 3 critical HR deadlines in the next 14 days. Feb payroll and Q1 KPI submissions overlap — consider running payroll by Feb 28 to stay ahead.</span>
          </div>
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

        <!-- Headcount trend -->
        <section class="card card--pad">
          <header class="card__head">
            <h3 class="card__title">Headcount trend</h3>
            <MpButton class="card__link" type="button" left-icon="arrows-right" @click="soon('Headcount report')">Full report</MpButton>
          </header>
          <div class="hc-stats">
            <div class="hc-stat">
              <p class="hc-stat__label">Total headcount</p>
              <p class="hc-stat__value">1,248</p>
              <p class="hc-stat__delta hc-stat__delta--up">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                +12 this month
              </p>
            </div>
            <div class="hc-stat">
              <p class="hc-stat__label">Turnover (Jan)</p>
              <p class="hc-stat__value">2.1%</p>
              <p class="hc-stat__delta hc-stat__delta--up">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Improved from 2.5%
              </p>
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

        <!-- Birthday & anniversaries -->
        <section class="card card--pad">
          <header class="card__head">
            <h3 class="card__title">Birthday &amp; anniversaries</h3>
            <MpButton class="card__link" type="button" left-icon="arrows-right" @click="soon('All celebrations')">View all</MpButton>
          </header>
          <div class="cel-list">
            <div v-for="c in celebrations" :key="c.name" class="cel">
              <img :src="c.photo" alt="" class="cel__avatar">
              <div class="cel__main">
                <p class="cel__name">{{ c.name }}</p>
                <p class="cel__role">{{ c.role }}</p>
                <p v-if="c.anniversary" class="cel__anniv">🎉 {{ c.anniversary }}</p>
              </div>
              <span class="cel__when">{{ c.when }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
    </div>

    <!-- ── Footer ───────────────────────────────────────────────────────── -->
    <MpButton class="manage" type="button" left-icon="settings" @click="soon('Manage widgets')">
      Manage widgets
    </MpButton>
  </div>
</template>

<style scoped>
.hrhome {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6, 24px);
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
.hero {
  /* Full-bleed: the stage drops its top border + side padding is cancelled here so
     the cream header reaches the top and both side edges (square, no gap). */
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

/* Below the strip the dashboard narrows to 8/12 columns (880px), centered — the
   hero + strip stay full-width above it. */
.below {
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6);
}

/* ── Get started strip (mirrors ERP Home v2: 8/12-col width, teal border,
   per-item pastel tint, 40px icon on the right) ────────────────────────────── */
.strip {
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--mp-colors-success-weaker);
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
  border-left: 1px solid var(--mp-colors-success-weaker);
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

/* ── Payroll banner ───────────────────────────────────────────────────────── */
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
  color: var(--mp-colors-white);
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
.card__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.card__link, .card__filter {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.card__link { color: var(--mp-text-default); font-weight: var(--mp-font-weights-regular); }
.card__link:hover, .card__filter:hover { color: var(--mp-text-default); }

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
/* In a non-padded card (e.g. Pending requests) the card has no padding of its own,
   so inset the AI note to match the header/rows instead of touching the border. */
.card:not(.card--pad) > .ai-note { margin-left: var(--mp-spacing-5); margin-right: var(--mp-spacing-5); }
.ai-note__link { color: var(--mp-text-airene, #5221a5); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.ai-note__link:hover { text-decoration: underline; }

/* Shared kebab / icon button */
.icon-btn {
  flex-shrink: 0;
  align-self: flex-start;
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  background: none; border: none; cursor: pointer;
  color: var(--mp-text-secondary, #3a4749);
  border-radius: var(--mp-radii-md, 6px);
}
.icon-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* ── Pending requests ─────────────────────────────────────────────────────── */
.req-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.req {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.req__avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; flex-shrink: 0; }
.req__main { flex: 1; min-width: 0; }
.req__top { margin: 0; }
.req__type { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.req__time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.req__text { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.req__meta { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Attendance today ─────────────────────────────────────────────────────── */
.att-stats { margin-top: var(--mp-spacing-4); display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-3); }
.att-stat__label { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.att-stat__value { margin: 2px 0 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 30px; color: var(--mp-text-default); }
.att-stat__sub { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); }
.att-stat__sub--green { color: var(--mp-text-success, #186f4a); }
.att-stat__sub--muted { color: var(--mp-text-secondary); }
.att-stat__sub--danger { color: var(--mp-text-danger, #a8352d); }
.att-bars { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.att-bar { display: grid; grid-template-columns: 92px 1fr 44px; align-items: center; gap: var(--mp-spacing-3); }
.att-bar__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.att-bar__track { height: 6px; border-radius: 999px; background: var(--mp-background-neutral-pressed, #ebf0f1); overflow: hidden; }
.att-bar__fill { display: block; height: 100%; border-radius: 999px; }
.att-bar__fill--green { background: var(--mp-background-success-bold, #186f4a); }
.att-bar__fill--orange { background: var(--mp-background-warning-bold, #e46910); }
.att-bar__fill--gray { background: var(--mp-border-bold, #8c9596); }
.att-bar__pct { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); text-align: right; }

/* ── Announcement ─────────────────────────────────────────────────────────── */
.ann-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.ann { padding: var(--mp-spacing-4) 0; }
.ann:first-child { padding-top: 0; }
.ann:last-child { padding-bottom: 0; }
.ann--divider { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.ann__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ann__body { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }
.ann__meta { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Upcoming events ──────────────────────────────────────────────────────── */
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

/* ── Headcount trend ──────────────────────────────────────────────────────── */
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

/* ── Birthday & anniversaries ─────────────────────────────────────────────── */
.cel-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; }
.cel { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) 0; }
.cel:first-child { padding-top: 0; }
.cel + .cel { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.cel__avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; flex-shrink: 0; }
.cel__main { flex: 1; min-width: 0; }
.cel__name { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cel__role { margin: 1px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cel__anniv { margin: 1px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cel__when { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); align-self: flex-start; }

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

/* ── Mobile (≤640px) — stack the multi-column grids, tame the full-bleed hero ── */
@media (max-width: 640px) {
  .hero { padding-left: var(--mp-spacing-4); padding-right: var(--mp-spacing-4); }
  .hero__search { max-width: 100%; }
  /* Shortcut chips: one horizontal swipe row instead of wrapping */
  .chips { align-self: stretch; flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex-shrink: 0; }
  /* KPI cards: one per row, stacked with a top divider */
  .stats { grid-template-columns: 1fr; }
  .stat { border-left: none; }
  .stat + .stat { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
  /* Get-started cards: drop the decorative icon on mobile */
  .strip { grid-template-columns: 1fr 1fr; }
  .strip__icon { display: none; }
  .grid { grid-template-columns: 1fr; }
  .att-stats { grid-template-columns: 1fr; }
  .hc-stats { grid-template-columns: 1fr; }
  /* Payroll banner: move the action below the text instead of beside it */
  .banner { flex-wrap: wrap; }
  .banner__btn { flex: 1 1 100%; width: 100%; display: flex; align-items: center; justify-content: center; margin-top: var(--mp-spacing-3); }
}
</style>
