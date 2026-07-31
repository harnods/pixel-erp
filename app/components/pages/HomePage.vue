<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { MpIcon, toast } from '@mekari/pixel3'
import { useWarehouseContext } from '~/composables/useWarehouseContext'
import { picForWarehouse } from '~/data/warehouses'
import HomeActionsModal from '~/components/HomeActionsModal.vue'
import { selectedActions, type HomeActionDef } from '~/data/homeActions'

// What's-new card art — cropped from the Figma design (the mock-UI preview band).
import whatsnewReconciliation from '~/assets/images/home/whatsnew-reconciliation.png?url'
import whatsnewAnomaly from '~/assets/images/home/whatsnew-anomaly.png?url'
import whatsnewProduction from '~/assets/images/home/whatsnew-production.png?url'
import setupBuilding from '~/assets/images/home/setup-building.png?url'

const router = useRouter()
const { navigate } = useNavigation()
// Open the Airene chat panel (provided by [...slug].vue) from the Useful links.
const toggleAirene = inject<() => void>('toggleAirene', () => {})
// Drives the hero glow — the SearchBox emits its AI-mode state up.
const heroAi = ref(false)

// ── Greeting ────────────────────────────────────────────────────────────────
// Name follows the signed-in user (same rule as the top-bar user menu): the
// back-office admin (Rizal Candra) for ERP / WMS Standalone, the warehouse PIC
// in an Ops scenario. Date uses the mock DB's "today" anchor so it stays
// coherent with every dated record elsewhere in the app.
const { activeWarehouse, hasWarehouseContext } = useWarehouseContext()
const fullName = computed(() =>
  hasWarehouseContext.value && activeWarehouse.value
    ? picForWarehouse(activeWarehouse.value.id, 0)
    : 'Rizal Candra',
)
const firstName = computed(() => fullName.value.split(' ')[0])
// Actual current date (not the mock DB anchor).
const todayLabel = new Date().toLocaleDateString('en-GB', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
})

// ── Quick-action chips ────────────────────────────────────────────────────────
// Pills are user-managed: pick up to 6 from a catalog + drag to reorder via the
// "Add actions" modal (opened by the "Actions" pill). Selection persists (mini-DB).
function soon(what: string) {
  toast.notify({ variant: 'info', title: `${what} — coming soon`, maxWidth: 'max-content' })
}
function runAction(a: HomeActionDef) {
  if (a.path === '#') soon(a.label)
  else router.push(a.path)
}
const manageActionsOpen = ref(false)

// ── Tasks: anomaly alerts ─────────────────────────────────────────────────────
// A collapsed stack (deck) when there's more than one; "Show more" expands the list.
interface Anomaly { id: string; title: string; body: string }
const anomalies: Anomaly[] = [
  {
    id: 'a1',
    title: 'Unusual amount in Sales invoice #33201',
    body: 'The transaction value of Sales Invoice #33201 is Rp500,000,000 — 5× above average for customer Anomali Coffee. Double-check the sales invoice and ensure that components such as amount, quantity, and payment terms are correct.',
  },
  {
    id: 'a2',
    title: 'Possible duplicate payment in Purchase invoice #12088',
    body: 'Purchase Invoice #12088 to EXPAT Roasters (Rp33,000,000) matches a payment already recorded 3 days ago. Confirm this is not a duplicate before approving the disbursement.',
  },
  {
    id: 'a3',
    title: 'Unexpected stock write-off in Gudang Jakarta Pusat',
    body: 'A 120 Kg write-off of Arabica Gayo Grade 1 was recorded in Gudang Jakarta Pusat — 8× the usual monthly adjustment. Review the stock adjustment and confirm the reason code.',
  },
]
const anomalyExpanded = ref(false)

// ── Tasks: awaiting approvals ─────────────────────────────────────────────────
// Grounded in the real mock DB (vendors, staff, warehouses, products) so it stays
// coherent with the rest of the app.
interface Approval {
  icon: string
  title: string
  party?: string
  by: string
  amount: string
  amountSub?: string
  go: () => void
}
const approvals: Approval[] = [
  { icon: 'sales', title: 'Sales Order #10100',      party: 'Anomali Coffee',           by: 'Sari Indah',      amount: 'Rp100.000.000,00', go: () => router.push('/sales-orders') },
  { icon: 'sales', title: 'Sales Invoice #10200',    party: 'Tanamera Coffee Roastery', by: 'Dewi Rahayu',     amount: 'Rp100.000.000,00', go: () => router.push('/sales-invoices') },
  { icon: 'cart',  title: 'Purchase Invoice #12239', party: 'EXPAT Roasters',           by: 'Budi Santoso',    amount: 'Rp33.000.000,00',  go: () => router.push('/purchase-invoices') },
  { icon: 'warehouse', title: 'Stock In/Out #10133',      by: 'Agus Firmansyah', amount: 'Arabica Gayo Grade 1', amountSub: '+ 100 Kg', go: () => router.push('/stock-adjustments') },
  { icon: 'transfer',  title: 'Warehouse Transfer #10655', by: 'Rizki Pratama',   amount: 'Jakarta Pusat → Bandung Selatan', go: () => router.push('/warehouse-transfers') },
]
const actionsRequiredCount = 10

function approve(a: Approval) {
  toast.notify({ variant: 'success', title: `${a.title} approved`, maxWidth: 'max-content' })
}

// ── What's new ────────────────────────────────────────────────────────────────
interface NewsCard { key: string; title: string[]; desc: string; art: string }
const news: NewsCard[] = [
  { key: 'blue',   title: ['Smarter reconciliation', 'is now available'], desc: 'Speed up bank reconciliation with our AI tool for accurate matching.', art: whatsnewReconciliation },
  { key: 'yellow', title: ['Detect your financial', 'anomalies earlier'],  desc: 'Identify unusual transactions in 1 click.',                            art: whatsnewAnomaly },
  { key: 'green',  title: ['Plan production with', 'confidence'],          desc: 'Stay ahead with clear schedules and real-time visibility.',            art: whatsnewProduction },
]

// ── Set up Mekari ERP ─────────────────────────────────────────────────────────
interface SetupStep { label: string; time: string; done: boolean }
const setupSteps: SetupStep[] = [
  { label: 'Complete company settings',       time: 'APPROX. 2 MINUTES', done: true },
  { label: 'Set up opening balances',         time: 'APPROX. 5 MINUTES', done: false },
  { label: 'Add or import products',          time: 'APPROX. 4 MINUTES', done: false },
  { label: 'Add or import contacts',          time: 'APPROX. 4 MINUTES', done: false },
  { label: 'Add or import sales transactions', time: 'APPROX. 5 MINUTES', done: false },
  { label: 'Connect your bank account',       time: 'APPROX. 3 MINUTES', done: false },
  { label: 'Invite your team',                time: 'APPROX. 2 MINUTES', done: false },
]
const setupDone = computed(() => setupSteps.filter(s => s.done).length)
const setupPercent = computed(() => Math.round((setupDone.value / setupSteps.length) * 100))

// ── Learn Mekari ERP ────────────────────────────────────────────────────────
interface LearnCard { tag: string; tone: 'blue' | 'neutral' | 'yellow'; title: string; desc: string; cta: string }
const learn: LearnCard[] = [
  { tag: 'Online training',  tone: 'blue',    title: 'Reporting & bookkeeping',    desc: 'Learn how to prepare and run the accounting process in Mekari ERP from start to finish.', cta: 'Sign up' },
  { tag: 'Offline training', tone: 'neutral', title: 'Mekari ERP offline training', desc: 'Learn how to get started with Mekari ERP face to face with our product consultants.',      cta: 'Sign up' },
  { tag: 'Tutorial video',   tone: 'yellow',  title: 'Demo: Mekari ERP',            desc: 'Watch a guided tutorial on how to get started with Mekari ERP.',                            cta: 'Watch video' },
]
</script>

<template>
  <div class="home">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <section class="hero" :class="{ 'hero--ai': heroAi }">
      <div class="hero__glow" aria-hidden="true" />
      <div class="hero__inner">
        <p class="hero__date">{{ todayLabel }}</p>
        <div class="hero__greeting">
          <h2 class="hero__line">Hello, {{ firstName }}</h2>
          <h2 class="hero__line">What would you like to do today?</h2>
        </div>

        <SearchBox class="hero__search" @aimode="v => heroAi = v" />

        <div class="chips">
          <div class="chips__row">
            <button v-for="a in selectedActions" :key="a.key" class="chip" type="button" @click="runAction(a)">
              <MpIcon :name="a.icon" size="md" class="chip__icon" />
              {{ a.label }}
            </button>
            <button class="chip" type="button" @click="manageActionsOpen = true">
              <MpIcon name="add" size="md" class="chip__icon" />
              Actions
            </button>
          </div>
        </div>
      </div>
    </section>

    <div class="home__col">
      <!-- ── Tasks ──────────────────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">Tasks</h3>

        <!-- Anomaly alerts — a collapsed deck when there's more than one -->
        <div v-if="anomalies.length" class="anomaly-block">
          <div class="anomaly-stack" :class="{ 'anomaly-stack--deck': anomalies.length > 1 && !anomalyExpanded }">
            <div
              v-for="a in (anomalyExpanded || anomalies.length === 1 ? anomalies : anomalies.slice(0, 1))"
              :key="a.id"
              class="anomaly"
            >
              <div class="anomaly__head">
                <svg class="anomaly__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="#e46910"/>
                  <path d="M12 9v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                  <circle cx="12" cy="16.5" r="1.15" fill="#fff"/>
                </svg>
                <span class="anomaly__title">{{ a.title }}</span>
              </div>
              <p class="anomaly__body">{{ a.body }}</p>
              <div class="anomaly__actions">
                <button class="btn btn--ghost" type="button" @click="soon('Ignore')">Ignore</button>
                <button class="btn btn--secondary" type="button" @click="soon('Review')">Review</button>
              </div>
            </div>

            <!-- One peeking layer behind the top card (collapsed deck only) → the
                 deck always reads as exactly two cards, regardless of the count. -->
            <div v-if="anomalies.length > 1 && !anomalyExpanded" class="anomaly-peek" aria-hidden="true" />
          </div>

          <button
            v-if="anomalies.length > 1"
            class="anomaly-toggle"
            type="button"
            @click="anomalyExpanded = !anomalyExpanded"
          >
            <MpIcon :name="anomalyExpanded ? 'caret-up' : 'caret-down'" size="sm" />
            {{ anomalyExpanded ? 'Show less' : 'Show more' }}
          </button>
        </div>

        <!-- Awaiting approval -->
        <div class="card approvals">
          <div class="approvals__tabs">
            <button class="apptab apptab--active" type="button">
              Awaiting approval <span class="apptab__count apptab__count--active">{{ approvals.length }}</span>
            </button>
            <button class="apptab" type="button" @click="soon('Actions required')">
              Actions required <span class="apptab__count">{{ actionsRequiredCount }}</span>
            </button>
          </div>

          <div class="approvals__list">
            <div v-for="a in approvals" :key="a.title" class="appr" @click="a.go()">
              <div class="appr__thumb">
                <MpIcon :name="a.icon" size="md" />
              </div>
              <div class="appr__main">
                <p class="appr__title">{{ a.title }}</p>
                <p v-if="a.party" class="appr__party">{{ a.party }}</p>
                <p class="appr__by">Requested by {{ a.by }}</p>
              </div>
              <div class="appr__amount">
                <p class="appr__amount-main">{{ a.amount }}</p>
                <p v-if="a.amountSub" class="appr__amount-sub">{{ a.amountSub }}</p>
              </div>
              <button class="btn btn--secondary btn--sm" type="button" @click.stop="approve(a)">Approve</button>
              <button class="appr__kebab" type="button" @click.stop>
                <MpIcon name="menu-kebab" size="md" />
              </button>
            </div>
          </div>

          <button class="approvals__all" type="button" @click="router.push('/warehouse-transfers')">
            View all awaiting approvals
          </button>
        </div>
      </section>

      <!-- ── What's new ─────────────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">What's new</h3>
        <div class="whatsnew">
          <div class="whatsnew__track">
            <article v-for="n in news" :key="n.key" class="wn" :class="`wn--${n.key}`">
              <div class="wn__head">
                <h4 class="wn__title"><span v-for="(l, i) in n.title" :key="i">{{ l }}<br v-if="i < n.title.length - 1"></span></h4>
                <p class="wn__desc">{{ n.desc }}</p>
              </div>
              <img :src="n.art" alt="" class="wn__art">
              <div class="wn__foot">
                <button class="wn__link" type="button" @click="soon('Learn more')">Learn more</button>
                <button class="btn btn--secondary btn--sm" type="button" @click="soon('Try feature')">Try feature</button>
              </div>
            </article>
          </div>
          <button class="whatsnew__next" type="button" aria-label="Next" @click="soon('More updates')">
            <MpIcon name="chevrons-right" size="md" />
          </button>
        </div>
        <div class="whatsnew__dots">
          <span class="dot dot--active" />
          <span class="dot" />
          <span class="dot" />
        </div>
      </section>

      <!-- ── Set up Mekari ERP ──────────────────────────────────────────── -->
      <section class="sec">
        <div class="setup-head">
          <h3 class="sec__title">Set up Mekari ERP</h3>
          <div class="setup-progress">
            <div class="setup-progress__bar"><div class="setup-progress__fill" :style="{ width: setupPercent + '%' }" /></div>
            <div class="setup-progress__meta">
              <span class="setup-progress__pct">{{ setupPercent }}%</span>
              <span class="setup-progress__steps">{{ setupDone }} of {{ setupSteps.length }} steps completed</span>
            </div>
          </div>
        </div>

        <div class="card setup">
          <div class="setup__list">
            <button
              v-for="(s, i) in setupSteps"
              :key="s.label"
              class="setup-step"
              :class="{ 'setup-step--active': i === 0 }"
              type="button"
              @click="navigate('Company profile')"
            >
              <span class="setup-step__check" :class="{ 'setup-step__check--done': s.done }">
                <MpIcon v-if="s.done" name="check" size="sm" />
              </span>
              <span class="setup-step__text">
                <span class="setup-step__label">{{ s.label }}</span>
                <span class="setup-step__time">{{ s.time }}</span>
              </span>
            </button>
          </div>

          <div class="setup__detail">
            <div class="setup__copy">
              <h4 class="setup__heading">Fill in important information<br>about your company</h4>
              <p class="setup__sub">Organize company info to activate features like multi-currency, formats, and tax inclusive.</p>
              <div class="setup__actions">
                <button class="btn btn--brand" type="button" @click="navigate('Company profile')">Set up now</button>
                <button class="btn btn--secondary btn--icon" type="button" @click="soon('Watch video')">
                  <MpIcon name="play-video" size="md" />
                  Watch video
                </button>
              </div>
            </div>
            <img :src="setupBuilding" alt="" class="setup__illus">
          </div>
        </div>
      </section>

      <!-- ── Learn Mekari ERP ───────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">Learn Mekari ERP</h3>
        <div class="learn">
          <article v-for="l in learn" :key="l.title" class="card learn-card">
            <span class="learn-tag" :class="`learn-tag--${l.tone}`">{{ l.tag }}</span>
            <h4 class="learn-card__title">{{ l.title }}</h4>
            <p class="learn-card__desc">{{ l.desc }}</p>
            <div class="learn-card__foot">
              <button class="btn btn--secondary btn--sm" type="button" @click="soon(l.cta)">{{ l.cta }}</button>
            </div>
          </article>
        </div>
      </section>

      <!-- ── Useful links ───────────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">Useful links</h3>
        <div class="useful">
          <button class="useful-link" type="button" @click="toggleAirene()">
            <MpIcon name="chat" size="md" class="useful-link__icon" />
            <span class="useful-link__text">
              <span class="useful-link__title">Live chat</span>
              <span class="useful-link__desc">Chat with our customer support for any questions or inquiries.</span>
            </span>
          </button>
          <button class="useful-link" type="button" @click="soon('Help center')">
            <MpIcon name="book" size="md" class="useful-link__icon" />
            <span class="useful-link__text">
              <span class="useful-link__title">Help center</span>
              <span class="useful-link__desc">Guidelines for all features in Mekari ERP.</span>
            </span>
          </button>
        </div>
      </section>
    </div>

    <HomeActionsModal v-model:isOpen="manageActionsOpen" />
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-10, 40px);
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
/* An inset rounded gradient block — the stage's own 24px side padding keeps the
   white margin between it and the stage edge. */
.hero {
  position: relative;
  background: linear-gradient(180deg, var(--mp-background-neutral-subtle, #f8f9f9) 0%, #ffffff 15.4%);
  border-radius: var(--mp-radii-xl, 12px);
  padding: var(--mp-spacing-6);
}
/* Soft AI glow behind the search when AI Mode is on. */
.hero__glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms ease;
  background:
    radial-gradient(46% 62% at 50% 46%, rgba(130, 112, 219, 0.28) 0%, rgba(130, 112, 219, 0) 70%),
    radial-gradient(60% 78% at 50% 48%, rgba(150, 178, 255, 0.30) 0%, rgba(150, 178, 255, 0) 72%);
}
.hero--ai .hero__glow { opacity: 1; }
.hero__inner {
  position: relative;
  z-index: 1;
  max-width: 884px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hero__date {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary);
}
.hero__greeting {
  text-align: center;
}
.hero__line {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  color: var(--mp-text-default);
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
}

/* Search box spacing in the hero */
.hero__search { margin-top: var(--mp-spacing-5); }

/* Chips */
.chips {
  margin-top: var(--mp-spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  align-items: center;
}
.chips__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--mp-spacing-3);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  height: 36px;
  padding: 0 var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default, #080d0e);
  cursor: pointer;
  white-space: nowrap;
  transition: background 100ms;
}
.chip:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.chip__icon { color: var(--mp-text-default, #080d0e); flex-shrink: 0; }

/* ── Centered column ──────────────────────────────────────────────────────── */
.home__col {
  width: 100%;
  max-width: 884px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-10, 40px);
}

.sec { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.sec__title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}

.card {
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-xl, 12px);
}

/* ── Shared buttons ───────────────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-2);
  height: 36px;
  padding: 0 var(--mp-spacing-4);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
  transition: background 100ms;
}
.btn--sm { height: 32px; padding: 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); }
.btn--secondary {
  background: var(--mp-background-neutral, #fff);
  border-color: var(--mp-border-bold, #8c9596);
  color: var(--mp-text-default, #080d0e);
}
/* Small secondary buttons use the default (light) border, not the bold one. */
.btn--secondary.btn--sm { border-color: var(--mp-border-default, #e3e7e9); }
.btn--secondary:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.btn--brand {
  background: var(--mp-background-brand-bold, #029861);
  color: #fff;
}
.btn--brand:hover { background: var(--mp-background-brand-bold-hovered, #0f6d4d); }
.btn--ghost {
  background: transparent;
  color: var(--mp-text-default, #080d0e);
}
.btn--ghost:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.btn--icon { padding-left: var(--mp-spacing-3); }

/* ── Anomaly alert ────────────────────────────────────────────────────────── */
/* Anomaly deck / stack */
.anomaly-block { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.anomaly-stack { display: flex; flex-direction: column; }

/* Collapsed deck: one card on top + one peeking layer (reads as two cards).
   `isolation` keeps the inner z-index local so it can't cover the hero search. */
.anomaly-stack--deck { position: relative; padding-bottom: 10px; isolation: isolate; }
/* Only the top card carries the white border — it separates it from the peek. */
.anomaly-stack--deck .anomaly {
  position: relative;
  z-index: 2;
  border: 2px solid #fff;
}
.anomaly-peek {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 0;
  height: 40px;
  z-index: 1;
  border-radius: var(--mp-radii-xl, 12px);
  background: linear-gradient(90deg, #dbe4f5 0%, #e2def4 100%);
}

/* Expanded (and single): connected segments — small gaps, only the first item's
   top corners and the last item's bottom corners are rounded. */
.anomaly-stack:not(.anomaly-stack--deck) { gap: 4px; }
.anomaly-stack:not(.anomaly-stack--deck) .anomaly { border-radius: 0; }
.anomaly-stack:not(.anomaly-stack--deck) .anomaly:first-child { border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; }
.anomaly-stack:not(.anomaly-stack--deck) .anomaly:last-child { border-radius: 0 0 var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px); }

.anomaly-toggle {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary, #3a4749);
}
.anomaly-toggle:hover { color: var(--mp-text-default, #080d0e); }

.anomaly {
  background: linear-gradient(90deg, #ecf1fc 0%, #f2f1ff 100%);
  border-radius: var(--mp-radii-xl, 12px);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
}
.anomaly__head { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.anomaly__icon { color: #e5810f; flex-shrink: 0; }
.anomaly__title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.anomaly__body {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-default);
}
.anomaly__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--mp-spacing-3);
}

/* ── Approvals ────────────────────────────────────────────────────────────── */
.approvals { display: flex; flex-direction: column; overflow: hidden; }
.approvals__tabs {
  display: flex;
  gap: var(--mp-spacing-5);
  padding: 0 var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.apptab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.apptab--active { color: var(--mp-text-selected, #0f6d4d); font-weight: var(--mp-font-weights-semi-bold); }
.apptab--active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: var(--mp-text-selected, #0f6d4d);
  border-radius: 2px 2px 0 0;
}
.apptab__count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-pressed, #ebf0f1);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-align: center;
}
.apptab__count--active {
  background: var(--mp-background-warning, #fdf6dd);
  color: #a14a0b;
}

.approvals__list { display: flex; flex-direction: column; }
.appr {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  cursor: pointer;
  transition: background 100ms;
}
.appr:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.appr__thumb {
  flex-shrink: 0;
  align-self: flex-start;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  color: var(--mp-text-secondary, #3a4749);
}
.appr__main { flex: 1; min-width: 0; }
.appr__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); }
.appr__party { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); }
.appr__by { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.appr__amount { text-align: right; white-space: nowrap; }
.appr__amount-main { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.appr__amount-sub { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.appr__kebab {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  background: none; border: none; cursor: pointer;
  color: var(--mp-text-secondary, #3a4749);
  border-radius: 4px;
}
.appr__kebab:hover { background: var(--mp-background-neutral-pressed, #ebf0f1); }
.approvals__all {
  background: none; border: none; cursor: pointer;
  padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link, #165082);
}

/* ── What's new ───────────────────────────────────────────────────────────── */
.whatsnew { position: relative; }
.whatsnew__track {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--mp-spacing-6);
}
.wn {
  height: 400px;
  border-radius: var(--mp-radii-xl, 12px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.wn--green    { background: #edf9f2; }
.wn--yellow   { background: #fdf6dd; }
.wn--blue     { background: #eaf4fc; }
.wn__head { padding: var(--mp-spacing-6) var(--mp-spacing-6) 0; }
.wn__title {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px);
  color: var(--mp-text-default);
}
.wn__desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary);
}
/* Fill the space between the head and the foot, showing the artwork's bottom edge
   (object-position bottom) — so the cover stays bottom-aligned and the Learn more /
   Try feature foot is never pushed out of the fixed-height card. */
.wn__art { display: block; width: 100%; flex: 1 1 0; min-height: 0; object-fit: cover; object-position: center bottom; }
.wn__foot {
  padding: var(--mp-spacing-4) var(--mp-spacing-6) var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wn__link {
  background: none; border: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  padding: 0;
}
.wn__link:hover { text-decoration: underline; }
.whatsnew__next {
  position: absolute;
  right: -18px; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  box-shadow: var(--mp-shadows-xs, 0 2px 4px rgba(0,0,0,.06));
  color: var(--mp-text-default);
  cursor: pointer;
}
.whatsnew__dots {
  display: flex;
  justify-content: center;
  gap: var(--mp-spacing-2);
}
.dot { width: 8px; height: 8px; border-radius: 999px; background: var(--mp-background-neutral-pressed, #ebf0f1); }
.dot--active { background: var(--mp-background-brand-bold, #029861); }

/* ── Set up ───────────────────────────────────────────────────────────────── */
.setup-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.setup-progress { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.setup-progress__bar {
  width: 160px; height: 6px;
  border-radius: 999px;
  background: var(--mp-background-neutral-pressed, #ebf0f1);
  overflow: hidden;
}
.setup-progress__fill { height: 100%; border-radius: 999px; background: var(--mp-background-brand-bold, #029861); }
.setup-progress__meta { display: flex; flex-direction: column; align-items: flex-end; }
.setup-progress__pct { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.setup-progress__steps { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.setup { display: flex; overflow: hidden; }
.setup__list {
  width: 328px;
  flex-shrink: 0;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-right: 1px solid var(--mp-border-default, #e3e7e9);
  padding: var(--mp-spacing-3);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  max-height: 296px;
  overflow-y: auto;
}
.setup-step {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md, 8px);
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.setup-step:hover { background: rgba(0,0,0,0.02); }
.setup-step--active {
  background: var(--mp-background-neutral, #fff);
}
.setup-step__check {
  flex-shrink: 0;
  width: 24px; height: 24px;
  border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px dashed var(--mp-border-bold, #8c9596);
  color: #fff;
}
.setup-step__check--done {
  border: none;
  background: var(--mp-background-brand-bold, #029861);
}
.setup-step__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.setup-step__label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.setup-step__time { font-size: var(--mp-font-sizes-sm); letter-spacing: 0.4px; color: var(--mp-text-secondary); }

.setup__detail {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-8);
}
.setup__copy { flex: 1; min-width: 0; }
.setup__heading {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px);
  color: var(--mp-text-default);
}
.setup__sub {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary);
}
.setup__actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.setup__illus { width: 140px; height: 140px; flex-shrink: 0; object-fit: contain; }

/* ── Learn ────────────────────────────────────────────────────────────────── */
.learn {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--mp-spacing-6);
}
.learn-card {
  min-height: 280px;
  padding: var(--mp-spacing-6);
  display: flex;
  flex-direction: column;
}
.learn-tag {
  align-self: flex-start;
  padding: 2px var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  margin-bottom: var(--mp-spacing-4);
}
.learn-tag--blue    { background: #eaf1fd; color: #3d5bcc; }
.learn-tag--neutral { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-secondary, #3a4749); }
.learn-tag--yellow  { background: #fdf6dd; color: #a14a0b; }
.learn-card__title {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.learn-card__desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary);
}
.learn-card__foot { margin-top: auto; display: flex; justify-content: flex-end; }

/* ── Useful links ─────────────────────────────────────────────────────────── */
.useful {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--mp-spacing-6);
}
.useful-link {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-4);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.useful-link__icon { color: var(--mp-text-default, #080d0e); flex-shrink: 0; margin-top: 2px; width: 24px; height: 24px; }
.useful-link__text { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.useful-link__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.useful-link__desc { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); max-width: 280px; }
.useful-link:hover .useful-link__title { text-decoration: underline; }
</style>
