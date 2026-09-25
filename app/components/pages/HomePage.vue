<script setup lang="ts">
import { computed, inject, ref, onMounted } from 'vue'
import {
  MpIcon, MpButton, toast,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import HomePageV2 from '~/components/pages/HomePageV2.vue'
import { useWarehouseContext } from '~/composables/useWarehouseContext'
import { picForWarehouse } from '~/data/warehouses'
import HomeActionsDrawer from '~/components/HomeActionsDrawer.vue'
import { selectedActions, type HomeActionDef } from '~/data/homeActions'
import { infoToast } from '~/utils/toasts'
import { isOpeningBalanceComplete } from '~/data/wmsCutover'

// What's-new card art — cropped from the Figma design (the mock-UI preview band).
import whatsnewReconciliation from '~/assets/images/home/whatsnew-reconciliation.png?url'
import whatsnewAnomaly from '~/assets/images/home/whatsnew-anomaly.png?url'
import whatsnewProduction from '~/assets/images/home/whatsnew-production.png?url'
import setupBuilding from '~/assets/images/home/setup-building.png?url'
import openingBalanceIllus from '~/assets/images/home/opening-balance.png?url'
import productsIllus from '~/assets/images/home/products.png?url'
import contactsIllus from '~/assets/images/home/contacts.png?url'
import transactionsIllus from '~/assets/images/home/transactions.png?url'
import bankIllus from '~/assets/images/home/bank.png?url'
import teamIllus from '~/assets/images/home/team.png?url'

const router = useRouter()
const { t } = useLocale()

// ── Home version (v1 / v2) — switched from the FAB, persisted ──────────────────
// Home v2 is the default; a stored '1' opts back into the legacy layout.
const homeVersion = ref<1 | 2>(2)
onMounted(() => { try { if (localStorage.getItem('erp-home-version') === '1') homeVersion.value = 1 } catch { /* ignore */ } })
function setHomeVersion(v: 1 | 2) { homeVersion.value = v; try { localStorage.setItem('erp-home-version', String(v)) } catch { /* ignore */ } }
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
  infoToast(`${what} — ${t('coming soon')}`)
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
    body: 'The transaction value of Sales Invoice #33201 is Rp500.000.000 — 5× above average for customer Anomali Coffee. Double-check the sales invoice and ensure that components such as amount, quantity, and payment terms are correct.',
  },
  {
    id: 'a2',
    title: 'Possible duplicate payment in Purchase invoice #12088',
    body: 'Purchase Invoice #12088 to EXPAT Roasters (Rp33.000.000) matches a payment already recorded 3 days ago. Confirm this is not a duplicate before approving the disbursement.',
  },
  {
    id: 'a3',
    title: 'Unexpected stock write-off in Gudang Jakarta Pusat',
    body: 'A 120 kg write-off of Arabica Gayo Grade 1 was recorded in Gudang Jakarta Pusat — 8× the usual monthly adjustment. Review the stock adjustment and confirm the reason code.',
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
  toast.notify({ variant: 'success', title: `${a.title} ${t('approved')}`, maxWidth: 'max-content' })
}

// ── What's new ────────────────────────────────────────────────────────────────
interface NewsCard { key: string; title: string[]; desc: string; art: string }
const news: NewsCard[] = [
  { key: 'blue',   title: [t('Smarter reconciliation'), t('is now available')], desc: t('Speed up bank reconciliation with Airene for accurate matching.'), art: whatsnewReconciliation },
  { key: 'yellow', title: [t('Detect your financial'), t('anomalies earlier')],  desc: t('Identify unusual transactions in 1 click.'),                            art: whatsnewAnomaly },
  { key: 'green',  title: [t('Plan production with'), t('confidence')],          desc: t('Stay ahead with clear schedules and real-time visibility.'),            art: whatsnewProduction },
]
// ─── Demo scenario state (FAB) ───────────────────────────────────────────────
type WhatsNewDemoState = 'default' | 'more'
const whatsNewDemoState = ref<WhatsNewDemoState>('default')
const whatsNewDemoStates: { value: WhatsNewDemoState; label: string }[] = [
  { value: 'default', label: t("What's new — Default") },
  { value: 'more', label: t("What's new — >3") },
]
const whatsNewHasPagination = computed(() => whatsNewDemoState.value === 'more')

// ── Set up Mekari ERP ─────────────────────────────────────────────────────────
// Clicking a step swaps the right-hand detail panel; a step with `to` deep-links
// into its setup flow when "Set up now" is clicked.
interface SetupStep { label: string; time: string; done: boolean; heading: string; sub: string; cta: string; to?: string; illus?: string }
// Computed so a step auto-completes when its flow is done elsewhere — e.g. once
// the WMS→ERP opening balance is published in Settings → Data migration.
const setupSteps = computed<SetupStep[]>(() => [
  {
    label: t('Complete company settings'), time: t('APPROX. 2 MINUTES'), done: true,
    heading: t('Fill in important information about your company'),
    sub: t('Organize company info to activate features like multi-currency, formats, and tax inclusive.'),
    cta: t('Review'),
    to: '/company-profile',
  },
  {
    label: t('Set up opening balances'), time: t('APPROX. 5 MINUTES'), done: isOpeningBalanceComplete(),
    heading: t('Set up your opening balances'),
    sub: t('Bring your chart of accounts, product mapping, and opening balances into ERP before you start recording.'),
    cta: t('Set up opening balances'),
    to: '/data-migration',
    illus: openingBalanceIllus,
  },
  {
    label: t('Add or import products'), time: t('APPROX. 4 MINUTES'), done: false,
    heading: t('Add or import your products'),
    sub: t('Build your product catalogue so you can start selling and tracking stock.'),
    cta: t('Import products'),
    illus: productsIllus,
  },
  {
    label: t('Add or import contacts'), time: t('APPROX. 4 MINUTES'), done: false,
    heading: t('Add or import your contacts'),
    sub: t('Bring in customers and vendors to speed up your transactions.'),
    cta: t('Import contacts'),
    illus: contactsIllus,
  },
  {
    label: t('Add or import sales transactions'), time: t('APPROX. 5 MINUTES'), done: false,
    heading: t('Add or import your sales transactions'),
    sub: t('Record outstanding invoices and orders so your books stay accurate.'),
    cta: t('Import transactions'),
    illus: transactionsIllus,
  },
  {
    label: t('Connect your bank account'), time: t('APPROX. 3 MINUTES'), done: false,
    heading: t('Connect your bank account'),
    sub: t('Reconcile transactions automatically by linking your bank.'),
    cta: t('Connect bank'),
    illus: bankIllus,
  },
  {
    label: t('Invite your team'), time: t('APPROX. 2 MINUTES'), done: false,
    heading: t('Invite your team'),
    sub: t('Give your colleagues access with the right roles.'),
    cta: t('Invite user'),
    illus: teamIllus,
  },
])
// A step counts as done if its flow completed OR the user skipped it.
const skipped = ref<Set<string>>(new Set())
function stepDone(s: SetupStep): boolean { return s.done || skipped.value.has(s.label) }
const setupDone = computed(() => setupSteps.value.filter(stepDone).length)
const setupPercent = computed(() => Math.round((setupDone.value / setupSteps.value.length) * 100))
// FAB demo state; the whole "Set up Mekari ERP" section disappears once every
// step is done (all completed / skipped).
const setupComplete = ref(false)
const allSetupDone = computed(() => setupComplete.value || setupDone.value >= setupSteps.value.length)
const activeSetupStep = ref(0)
const currentSetup = computed(() => setupSteps.value[activeSetupStep.value]!)
function setupNow() {
  const to = currentSetup.value.to
  if (to) router.push(to)
  else soon(t('Set up now'))
}
function skipStep() {
  const next = new Set(skipped.value)
  next.add(currentSetup.value.label)
  skipped.value = next
}

// ── Learn Mekari ERP ────────────────────────────────────────────────────────
interface LearnCard { tag: string; tone: 'blue' | 'neutral' | 'yellow'; title: string; desc: string; cta: string }
const learn: LearnCard[] = [
  { tag: t('Online training'),  tone: 'blue',    title: t('Reporting & bookkeeping'),    desc: t('Learn how to prepare and run the accounting process in Mekari ERP from start to finish.'), cta: t('Sign up') },
  { tag: t('Offline training'), tone: 'neutral', title: t('Mekari ERP offline training'), desc: t('Learn how to get started with Mekari ERP face to face with our product consultants.'),      cta: t('Sign up') },
  { tag: t('Tutorial video'),   tone: 'yellow',  title: t('Demo: Mekari ERP'),            desc: t('Watch a guided tutorial on how to get started with Mekari ERP.'),                            cta: t('Watch video') },
]
</script>

<template>
  <div class="home">
    <!-- ── ERP Home v2 (unified format) — swapped in from the FAB ── -->
    <HomePageV2 v-if="homeVersion === 2" />

    <template v-else>
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <section class="hero" :class="{ 'hero--ai': heroAi }">
      <div class="hero__glow" aria-hidden="true" />
      <div class="hero__inner">
        <p class="hero__date">{{ todayLabel }}</p>
        <div class="hero__greeting">
          <h2 class="hero__line">{{ t('Hello') }}, {{ firstName }}</h2>
          <h2 class="hero__line">{{ t('What would you like to do today?') }}</h2>
        </div>

        <SearchBox class="hero__search" @aimode="v => heroAi = v" />

        <div class="chips">
          <div class="chips__row">
            <MpButton v-for="a in selectedActions" :key="a.key" class="chip" type="button" @click="runAction(a)">
              <MpIcon :name="a.icon" size="md" class="chip__icon" />
              {{ a.label }}
            </MpButton>
            <MpButton class="chip" type="button" @click="manageActionsOpen = true">
              <MpIcon name="add" size="md" class="chip__icon" />
              {{ t('Actions') }}
            </MpButton>
          </div>
        </div>
      </div>
    </section>

    <div class="home__col">
      <!-- ── Tasks ──────────────────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">{{ t('Tasks') }}</h3>

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
                <MpButton variant="ghost" is-rounded @click="soon(t('Ignore'))">{{ t('Ignore') }}</MpButton>
                <MpButton variant="secondary" is-rounded @click="soon(t('Review'))">{{ t('Review') }}</MpButton>
              </div>
            </div>

            <!-- One peeking layer behind the top card (collapsed deck only) → the
                 deck always reads as exactly two cards, regardless of the count. -->
            <div v-if="anomalies.length > 1 && !anomalyExpanded" class="anomaly-peek" aria-hidden="true" />
          </div>

          <MpButton
            v-if="anomalies.length > 1"
            class="anomaly-toggle"
            type="button"
            :left-icon="anomalyExpanded ? 'caret-up' : 'caret-down'"
            @click="anomalyExpanded = !anomalyExpanded"
          >
            {{ anomalyExpanded ? t('Show less') : t('Show more') }}
          </MpButton>
        </div>

        <!-- Awaiting approval -->
        <div class="card approvals">
          <div class="approvals__tabs">
            <MpButton class="apptab apptab--active" type="button">
              {{ t('Awaiting approval') }} <span class="apptab__count apptab__count--active">{{ approvals.length }}</span>
            </MpButton>
            <MpButton class="apptab" type="button" @click="soon(t('Actions required'))">
              {{ t('Actions required') }} <span class="apptab__count">{{ actionsRequiredCount }}</span>
            </MpButton>
          </div>

          <div class="approvals__list">
            <div v-for="a in approvals" :key="a.title" class="appr" @click="a.go()">
              <div class="appr__thumb">
                <MpIcon :name="a.icon" size="md" />
              </div>
              <div class="appr__main">
                <p class="appr__title">{{ a.title }}</p>
                <p v-if="a.party" class="appr__party">{{ a.party }}</p>
                <p class="appr__by">{{ t('Requested by') }} {{ a.by }}</p>
              </div>
              <div class="appr__amount">
                <p class="appr__amount-main">{{ a.amount }}</p>
                <p v-if="a.amountSub" class="appr__amount-sub">{{ a.amountSub }}</p>
              </div>
              <MpButton variant="secondary" is-rounded @click.stop="approve(a)">{{ t('Approve') }}</MpButton>
              <MpButton class="appr__kebab" type="button" left-icon="menu-kebab" @click.stop />
            </div>
          </div>

          <MpButton class="approvals__all" type="button" @click="router.push('/warehouse-transfers')">
            {{ t('View all awaiting approvals') }}
          </MpButton>
        </div>
      </section>

      <!-- ── What's new ─────────────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">{{ t("What's new") }}</h3>
        <div class="whatsnew">
          <div class="whatsnew__track">
            <article v-for="n in news" :key="n.key" class="wn" :class="`wn--${n.key}`">
              <div class="wn__head">
                <h4 class="wn__title"><span v-for="(l, i) in n.title" :key="i">{{ l }}<br v-if="i < n.title.length - 1"></span></h4>
                <p class="wn__desc">{{ n.desc }}</p>
              </div>
              <img :src="n.art" alt="" class="wn__art">
              <div class="wn__foot">
                <MpButton class="wn__link" type="button" @click="soon(t('Learn more'))">{{ t('Learn more') }}</MpButton>
                <MpButton variant="secondary" is-rounded @click="soon(t('Try feature'))">{{ t('Try feature') }}</MpButton>
              </div>
            </article>
          </div>
          <MpButton v-if="whatsNewHasPagination" class="whatsnew__next" type="button" :aria-label="t('Next')" left-icon="chevrons-right" @click="soon(t('More updates'))" />
        </div>
        <div v-if="whatsNewHasPagination" class="whatsnew__dots">
          <span class="dot dot--active" />
          <span class="dot" />
          <span class="dot" />
        </div>
      </section>

      <!-- ── Set up Mekari ERP (hidden once every step is completed) ─────── -->
      <section v-if="!allSetupDone" class="sec">
        <div class="setup-head">
          <h3 class="sec__title">{{ t('Set up Mekari ERP') }}</h3>
          <div class="setup-progress">
            <div class="setup-progress__bar"><div class="setup-progress__fill" :style="{ width: setupPercent + '%' }" /></div>
            <div class="setup-progress__meta">
              <span class="setup-progress__pct">{{ setupPercent }}%</span>
              <span class="setup-progress__steps">{{ setupDone }} {{ t('of') }} {{ setupSteps.length }} {{ t('steps completed') }}</span>
            </div>
          </div>
        </div>

        <div class="card setup">
          <div class="setup__list">
            <MpButton
              v-for="(s, i) in setupSteps"
              :key="s.label"
              class="setup-step"
              :class="{ 'setup-step--active': i === activeSetupStep }"
              type="button"
              @click="activeSetupStep = i"
            >
              <span class="setup-step__check" :class="{ 'setup-step__check--done': stepDone(s) }">
                <MpIcon name="check" size="sm" />
              </span>
              <span class="setup-step__text">
                <span class="setup-step__label">{{ s.label }}</span>
                <span class="setup-step__time">{{ s.time }}</span>
              </span>
            </MpButton>
          </div>

          <div class="setup__detail">
            <a v-if="!stepDone(currentSetup)" class="setup__skip" @click.prevent="skipStep">{{ t('Skip') }}</a>
            <div class="setup__copy">
              <h4 class="setup__heading">{{ currentSetup.heading }}</h4>
              <p class="setup__sub">{{ currentSetup.sub }}</p>
              <div class="setup__actions">
                <MpButton variant="primary" is-rounded @click="setupNow">{{ currentSetup.cta }}</MpButton>
                <MpButton class="btn btn--secondary btn--icon" type="button" left-icon="play-video" @click="soon(t('Watch video'))">
                  {{ t('Watch video') }}
                </MpButton>
              </div>
            </div>
            <img :src="currentSetup.illus ?? setupBuilding" alt="" class="setup__illus">
          </div>
        </div>
      </section>

      <!-- ── Learn Mekari ERP ───────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">{{ t('Learn Mekari ERP') }}</h3>
        <div class="learn">
          <article v-for="l in learn" :key="l.title" class="card learn-card">
            <span class="learn-tag" :class="`learn-tag--${l.tone}`">{{ l.tag }}</span>
            <h4 class="learn-card__title">{{ l.title }}</h4>
            <p class="learn-card__desc">{{ l.desc }}</p>
            <div class="learn-card__foot">
              <MpButton variant="secondary" is-rounded @click="soon(l.cta)">{{ l.cta }}</MpButton>
            </div>
          </article>
        </div>
      </section>

      <!-- ── Useful links ───────────────────────────────────────────────── -->
      <section class="sec">
        <h3 class="sec__title">{{ t('Useful links') }}</h3>
        <div class="useful">
          <MpButton class="useful-link" type="button" @click="toggleAirene()">
            <MpIcon name="chat" size="md" class="useful-link__icon" />
            <span class="useful-link__text">
              <span class="useful-link__title">{{ t('Live chat') }}</span>
              <span class="useful-link__desc">{{ t('Chat with our customer support for any questions or inquiries.') }}</span>
            </span>
          </MpButton>
          <MpButton class="useful-link" type="button" @click="soon(t('Help center'))">
            <MpIcon name="book" size="md" class="useful-link__icon" />
            <span class="useful-link__text">
              <span class="useful-link__title">{{ t('Help center') }}</span>
              <span class="useful-link__desc">{{ t('Guidelines for all features in Mekari ERP.') }}</span>
            </span>
          </MpButton>
        </div>
      </section>
    </div>

    <HomeActionsDrawer v-model:isOpen="manageActionsOpen" />
    </template>

    <!-- ── Demo scenario FAB ── -->
    <MpPopover id="home-demo-fab" is-close-on-select use-portal placement="top-end">
      <MpPopoverTrigger>
        <MpButton class="demo-fab" :aria-label="t('Change scenario state')"><MpIcon name="sliders" size="md" color="icon.inverse" /></MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
        <p class="demo-fab-heading">{{ t('Home version') }}</p>
        <MpPopoverList>
          <MpPopoverListItem :is-active="homeVersion === 1" @click="setHomeVersion(1)">{{ t('Version 1') }}</MpPopoverListItem>
          <MpPopoverListItem :is-active="homeVersion === 2" @click="setHomeVersion(2)">{{ t('Version 2') }}</MpPopoverListItem>
        </MpPopoverList>
        <template v-if="homeVersion === 1">
          <p class="demo-fab-heading">{{ t("What's new") }}</p>
          <MpPopoverList>
            <MpPopoverListItem
              v-for="s in whatsNewDemoStates"
              :key="s.value"
              :is-active="s.value === whatsNewDemoState"
              @click="whatsNewDemoState = s.value"
            >
              {{ s.label }}
            </MpPopoverListItem>
          </MpPopoverList>
          <p class="demo-fab-heading">{{ t('Set up Mekari ERP') }}</p>
          <MpPopoverList>
            <MpPopoverListItem :is-active="!setupComplete" @click="setupComplete = false">{{ t('In progress') }}</MpPopoverListItem>
            <MpPopoverListItem :is-active="setupComplete" @click="setupComplete = true">{{ t('All completed') }}</MpPopoverListItem>
          </MpPopoverList>
        </template>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-10, 40px);
}

/* Demo FAB */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: var(--mp-colors-white); cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Hero ─────────────────────────────────────────────────────────────────── */
/* An inset rounded gradient block — the stage's own 24px side padding keeps the
   white margin between it and the stage edge. */
.hero {
  position: relative;
  /* Full-bleed: escape the stage's side padding so the header reaches the edges;
     the stage drops its top padding + rounding for Home so it's flush to the top. */
  margin: 0 calc(var(--mp-spacing-6) * -1) 0;
  /* Soft header backdrop that fades into the white stage — spans the full hero so
     it stays visible now that the header is full-bleed (was fading out by 15%). */
  background: linear-gradient(180deg, var(--mp-background-hero-tint, #eaf0f6) 0%, var(--mp-background-stage, #ffffff) 100%);
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
  color: var(--mp-colors-white);
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
  border: 2px solid var(--mp-colors-white);
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
.anomaly__icon { color: var(--mp-colors-warning-default); flex-shrink: 0; }
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
/* Truncate with ellipsis when the row is tight — never let the text collapse to
   one-character-per-line (min-width:0 flex child + long unbroken content). */
.appr__title,
.appr__party,
.appr__by { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  /* Reflow: keep a readable min card width and wrap to fewer columns when the
     content area narrows (tablet/mobile) — never squish below 240px. */
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--mp-spacing-6);
}
.wn {
  position: relative;
  height: 400px;
  border-radius: var(--mp-radii-xl, 12px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.wn--green    { --wn-bg: var(--mp-colors-success-weaker); background: var(--wn-bg); }
.wn--yellow   { --wn-bg: var(--mp-colors-warning-weaker); background: var(--wn-bg); }
.wn--blue     { --wn-bg: var(--mp-colors-info-weaker); background: var(--wn-bg); }
.wn__head { position: relative; z-index: 1; padding: var(--mp-spacing-6) var(--mp-spacing-6) 0; }
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
/* Full card width, natural aspect ratio (the PNGs already carry their own
   rounded-card + shadow look). Bottom-anchored via absolute positioning
   (not a flex margin-top: auto) so it's always aligned center-bottom even
   when an art asset is taller than the space below the head — any excess
   height extends upward and is clipped by .wn's overflow: hidden, keeping
   the bottom of the artwork (where the foot floats) always visible. */
.wn__art {
  display: block;
  position: absolute;
  left: 0; right: 0; bottom: 0;
  width: 100%;
  height: auto;
}
/* Pinned to the card's bottom edge (absolute, out of flow — so it overlaps
   the bottom of .wn__art rather than pushing below it), floating on top of
   the art. A gradient in the card's own pastel color (::before) fades from
   solid at the very bottom up to transparent over the art, so the buttons
   read as sitting on the card background rather than directly on the artwork. */
.wn__foot {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 1;
  padding: var(--mp-spacing-4) var(--mp-spacing-6) var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-4);
}
.wn__foot::before {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  top: -40px;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(to top, var(--wn-bg) 0%, var(--wn-bg) 30%, transparent 100%);
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
}
/* Not-done: a subtle grey check inside the dashed ring. */
.setup-step__check :deep(svg) { color: var(--mp-text-secondary, #8c9596); }
.setup-step__check--done {
  border: none;
  background: var(--mp-background-brand-bold, #029861);
}
/* Done: white check on the green fill (MpIcon otherwise keeps its own colour). */
.setup-step__check--done :deep(svg) { color: var(--mp-text-inverse-static, #fff); }
.setup-step__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.setup-step__label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.setup-step__time { font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); font-weight: var(--mp-font-weights-regular); letter-spacing: 0.4px; color: var(--mp-text-secondary); }

.setup__detail {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-8);
}
.setup__skip {
  position: absolute;
  top: var(--mp-spacing-4);
  right: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm, 12px);
  line-height: var(--mp-line-heights-sm, 16px);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-link);
  cursor: pointer;
}
.setup__skip:hover { text-decoration: underline; text-underline-offset: 2px; }
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
.learn-tag--yellow  { background: #fdf6dd; color: var(--mp-colors-warning-bolder); }
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
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
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

/* ── Responsive ───────────────────────────────────────────────────────────────
   Cards/sections reflow (grids wrap via auto-fit above; splits stack here). Data
   tables are NOT touched — they keep their own horizontal scroll so columns stay
   full-width and readable (see ErpTablePage .erp-table-wrapper). */

/* Tablet — the two-pane Set up card can't hold a 328px list + detail side by side */
@media (max-width: 900px) {
  .setup { flex-direction: column; }
  .setup__list {
    width: 100%;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  }
}

/* Mobile — tighten spacing, shrink the hero, stack the setup detail */
@media (max-width: 600px) {
  .home { gap: var(--mp-spacing-6); }

  .hero { padding: var(--mp-spacing-4); }
  .hero__line { font-size: var(--mp-font-sizes-xl); line-height: 28px; }

  /* Quick shortcuts: compact so they pack horizontally and wrap (2–3 per row on
     a phone) instead of stacking one-per-line. */
  .chips { margin-top: var(--mp-spacing-4); }
  .chips__row { gap: var(--mp-spacing-2); justify-content: center; }
  .chip {
    height: 32px;
    padding: 0 var(--mp-spacing-3);
    font-size: var(--mp-font-sizes-sm);
    gap: var(--mp-spacing-1);
  }
  .chip__icon { width: 16px; height: 16px; }

  .setup__detail {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--mp-spacing-4);
    padding: var(--mp-spacing-5);
  }
  .setup__illus { display: none; }
  .setup__actions { flex-wrap: wrap; }

  .setup-progress { width: 100%; }

  /* Awaiting-approval is a list, not a table — stack each item vertically:
     title (+ kebab pinned top-right), then party, requester, amount, Approve. */
  .appr {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--mp-spacing-1);
    position: relative;
    padding-right: var(--mp-spacing-10, 40px);   /* clear the top-right kebab */
  }
  .appr__thumb { display: none; }
  .appr__main { width: 100%; }
  .appr__amount { text-align: left; margin-left: 0; }
  .appr__amount-main { font-weight: var(--mp-font-weights-semi-bold); }
  .appr__kebab { position: absolute; top: var(--mp-spacing-3); right: var(--mp-spacing-4); }
  .appr > .btn { align-self: flex-start; margin-top: var(--mp-spacing-2); }
}
</style>
