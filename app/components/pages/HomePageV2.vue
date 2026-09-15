<script setup lang="ts">
/**
 * ERP Home — v2. Same unified layout/format as the HR (Talenta) home
 * (HrHomePage.vue) — AI-native hero, quick chips, get-started strip, KPI stats
 * with AI hints, and a two-column widget grid — but with ERP context spanning
 * Accounting, WMS, and Production. Toggled from the Home FAB.
 *
 * Widget content lives in HomeWidgetV2.vue (rendered by key) so the placed grid
 * and the edit-mode "Add widgets" gallery show identical cards.
 */
import { h, ref, computed, onMounted } from 'vue'
import { infoToast } from '~/utils/toasts'
import { MpIcon, MpButton, toast } from '@mekari/pixel3'
import HomeActionsDrawer from '~/components/HomeActionsDrawer.vue'
import HomeWidgetV2 from '~/components/pages/HomeWidgetV2.vue'
import WhatsNewModal from '~/components/WhatsNewModal.vue'
import { selectedActions, type HomeActionDef } from '~/data/homeActions'

const router = useRouter()

// Reusable AI sparkle (matches SearchBox / Airene mark, same as HrHomePage).
const SPARKLE_D_A = 'M10.9077 8.22842L10.5112 8.17805C9.1059 7.99858 8.00071 6.89127 7.82266 5.48602L7.77514 5.11147C7.69781 4.49787 7.09344 4.08431 6.45714 4.08431C5.82793 4.08431 5.22497 4.48085 5.1441 5.09232L5.09374 5.48885C4.91427 6.8941 3.80695 7.99929 2.4017 8.17734L2.02716 8.22487C1.40008 8.30645 1 8.90657 1 9.54287C1 10.1792 1.3788 10.7793 2.00801 10.8559L2.40454 10.9063C3.80979 11.0857 4.91498 12.1931 5.09303 13.5983L5.14056 13.9728C5.21788 14.6113 5.82226 15 6.45856 15C7.08776 15 7.69852 14.5715 7.77159 13.992L7.82195 13.5955C8.00142 12.1902 9.10874 11.085 10.514 10.907L10.8885 10.8594C11.5192 10.7793 11.9157 10.1777 11.9157 9.54145C11.9157 8.90515 11.5199 8.30503 10.9077 8.22842Z'
const SPARKLE_D_B = 'M14.4956 3.07205L14.2977 3.04651C13.5955 2.95643 13.0422 2.40312 12.9535 1.70085L12.9301 1.51358C12.8911 1.20643 12.5889 1 12.2711 1C11.9561 1 11.6553 1.19791 11.6142 1.50436L11.5887 1.70227C11.4986 2.40454 10.9453 2.95784 10.243 3.04651L10.0557 3.06992C9.7422 3.11107 9.54216 3.41113 9.54216 3.72892C9.54216 4.04672 9.73156 4.34749 10.0465 4.38579L10.2444 4.41133C10.9467 4.50142 11.5 5.05472 11.5887 5.75699L11.6121 5.94427C11.6504 6.26348 11.9533 6.45785 12.2711 6.45785C12.586 6.45785 12.8911 6.24362 12.9279 5.95349L12.9535 5.75558C13.0436 5.05331 13.5969 4.5 14.2991 4.41133L14.4864 4.38792C14.8021 4.3482 15 4.04672 15 3.72892C15 3.41113 14.8021 3.11107 14.4956 3.07205Z'
const Sparkle = (props: { size?: number }) =>
  h('svg', { width: props.size ?? 16, height: props.size ?? 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, [
    h('path', { d: SPARKLE_D_A, fill: 'currentColor' }),
    h('path', { d: SPARKLE_D_B, fill: 'currentColor' }),
  ])

function soon(what: string) {
  infoToast(`${what} — coming soon`)
}

const firstName = 'Rizal'
const greeting = 'Good morning'
const todayLabel = 'Wed, 18 Aug 2026'

// Quick-action chips — same user-managed shortcut set as v1 (persisted mini-DB);
// "Add actions" opens the shared HomeActionsDrawer.
function runAction(a: HomeActionDef) {
  if (a.path === '#') soon(a.label)
  else router.push(a.path)
}
const manageActionsOpen = ref(false)
// Purple AI glow behind the hero search, toggled by SearchBox's AI Mode.
const heroAi = ref(false)

// AI anomaly alerts (same as Home v1) — a collapsed deck; "Show more" expands.
interface Anomaly { id: string; title: string; body: string }
const anomalies: Anomaly[] = [
  { id: 'a1', title: 'Unusual amount in Sales invoice #33201', body: 'The transaction value of Sales Invoice #33201 is Rp500.000.000 — 5× above average for customer Anomali Coffee. Double-check the sales invoice and ensure that components such as amount, quantity, and payment terms are correct.' },
  { id: 'a2', title: 'Possible duplicate payment in Purchase invoice #12088', body: 'Purchase Invoice #12088 to EXPAT Roasters (Rp33.000.000) matches a payment already recorded 3 days ago. Confirm this is not a duplicate before approving the disbursement.' },
  { id: 'a3', title: 'Unexpected stock write-off in Gudang Jakarta Pusat', body: 'A 120 kg write-off of Arabica Gayo Grade 1 was recorded in Gudang Jakarta Pusat — 8× the usual monthly adjustment. Review the stock adjustment and confirm the reason code.' },
]
const anomalyExpanded = ref(false)

// "What's new" opens a feature-announcement modal; the others are placeholders.
const whatsNewOpen = ref(false)
function onStripClick(s: { title: string }) {
  if (s.title === "What's new") whatsNewOpen.value = true
  else soon(s.title)
}

// Each card carries its own pastel tint matching its icon blob (flag=slate,
// video=teal, help=mint, new=lavender), lightened so the icon still reads.
const strip = [
  { icon: '/erp-home/flag.svg',  bg: '#F3FBFA', title: 'Get started',     desc: 'Set up Accounting, WMS & Production in a few steps' },
  { icon: '/erp-home/video.svg', bg: '#ECF7F7', title: 'Tutorial videos', desc: 'Learn how to get the most value out of Mekari ERP' },
  { icon: '/erp-home/help.svg',  bg: '#EBF7F2', title: 'Help center',     desc: 'Explore guides and tips for mastering Mekari ERP' },
  { icon: '/erp-home/new.svg',   bg: '#E6F4EF', title: "What's new",      desc: 'Latest updates and features' },
]

// KPI stats — cross-module.
const stats = [
  { label: 'Revenue (MTD)',        value: 'Rp1.24 M', delta: '+8.2% vs Jul',        deltaTone: 'up' as const,    ai: 'Ask AI what drove growth' },
  { label: 'Cash balance',         value: 'Rp486 M',  delta: 'Across 8 accounts',   deltaTone: 'muted' as const, ai: 'Forecast next 30 days' },
  { label: 'Overdue receivables',  value: 'Rp92 M',   delta: '11 invoices past due', deltaTone: 'warn' as const,  ai: 'Draft reminders with AI' },
  { label: 'Low-stock SKUs',       value: '14',       delta: '3 below reorder point', deltaTone: 'warn' as const, ai: 'AI suggested reorder plan' },
]

// ── Widget layout (Manage widgets): drag to reorder, add/remove, persisted ──────
type WidgetKey = 'approvals' | 'cash-flow' | 'recent-tx' | 'due-soon' | 'warehouse' | 'production' | 'pnl' | 'expenses' | 'bank-accounts'
const WIDGET_TITLES: Record<WidgetKey, string> = {
  'approvals': 'Pending approvals', 'cash-flow': 'Cash flow', 'recent-tx': 'Recent transactions',
  'due-soon': 'Due soon', 'warehouse': 'Warehouse overview', 'production': 'Production output',
  'pnl': 'Profit & loss', 'expenses': 'Expenses', 'bank-accounts': 'Bank accounts',
}
const DEFAULT_LAYOUT: { left: WidgetKey[]; right: WidgetKey[] } = {
  left: ['approvals', 'cash-flow', 'recent-tx'],
  right: ['due-soon', 'warehouse', 'production'],
}
const layout = ref<{ left: WidgetKey[]; right: WidgetKey[] }>({ left: [...DEFAULT_LAYOUT.left], right: [...DEFAULT_LAYOUT.right] })
function persistLayout() { try { localStorage.setItem('erp-home-v2-layout-v1', JSON.stringify(layout.value)) } catch { /* ignore */ } }

const editing = ref(false)
function toggleManage() { editing.value = !editing.value }

// Widgets not currently placed — shown as addable preview cards in the gallery,
// followed by an empty "Custom widget" placeholder.
const availableWidgets = computed(() =>
  (Object.keys(WIDGET_TITLES) as WidgetKey[]).filter((k) => !layout.value.left.includes(k) && !layout.value.right.includes(k)),
)
const galleryItems = computed<(WidgetKey | 'custom')[]>(() => [...availableWidgets.value, 'custom'])
function addFromGallery(k: WidgetKey | 'custom') {
  if (k === 'custom') { soon('Custom widget'); return }
  // Drop the new widget into the shorter column so both stay balanced.
  const col = layout.value.left.length <= layout.value.right.length ? 'left' : 'right'
  layout.value[col].push(k)
  persistLayout()
}
function removeWidget(col: 'left' | 'right', i: number) { layout.value[col].splice(i, 1); persistLayout() }

// Drag & drop reorder — iOS-style: the layout reorders live as you drag over a
// target so the other widgets visibly slide out of the way (FLIP-animated by the
// <TransitionGroup> in the template). Native HTML5 dnd drives the pointer.
const dragging = ref<{ col: 'left' | 'right'; i: number } | null>(null)
function onDragStart(col: 'left' | 'right', i: number, e: DragEvent) {
  dragging.value = { col, i }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox needs data set for a drag to start.
    try { e.dataTransfer.setData('text/plain', String(i)) } catch { /* ignore */ }
  }
}
function onDragEnd() { if (dragging.value) { dragging.value = null; persistLayout() } }
// Drag entered another widget → move the dragged one into that exact slot.
function onEnterWidget(col: 'left' | 'right', i: number) {
  const from = dragging.value
  if (!from || (from.col === col && from.i === i)) return
  const key = layout.value[from.col].splice(from.i, 1)[0]!
  layout.value[col].splice(i, 0, key)
  dragging.value = { col, i }
}
// Drag entered the empty area of the *other* column → append there.
function onEnterColumn(col: 'left' | 'right') {
  const from = dragging.value
  if (!from || from.col === col) return
  const key = layout.value[from.col].splice(from.i, 1)[0]!
  layout.value[col].push(key)
  dragging.value = { col, i: layout.value[col].length - 1 }
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('erp-home-v2-layout-v1') || 'null')
    if (saved?.left && saved?.right) layout.value = saved
  } catch { /* ignore */ }
})
</script>

<template>
  <div class="hrhome">
    <!-- Hero -->
    <section class="hero" :class="{ 'hero--ai': heroAi }">
      <div class="hero__glow" aria-hidden="true" />
      <p class="hero__date">🌤️ {{ todayLabel }}</p>
      <div class="hero__greeting">
        <h2 class="hero__line">{{ greeting }} {{ firstName }},</h2>
        <h2 class="hero__line">what would you like to do today?</h2>
      </div>
      <SearchBox class="hero__search" placeholder="How can I help you today?" @aimode="v => heroAi = v" />
      <div class="chips">
        <button v-for="a in selectedActions.slice(0, 4)" :key="a.key" class="chip" type="button" @click="runAction(a)">
          <MpIcon :name="a.icon" size="sm" class="chip__icon" />
          {{ a.label }}
        </button>
        <button class="chip" type="button" @click="manageActionsOpen = true">
          <MpIcon name="add" size="sm" class="chip__icon" />
          Add actions
        </button>
      </div>
    </section>

    <!-- Get started strip -->
    <div class="strip">
      <button v-for="s in strip" :key="s.title" class="strip__item" type="button" :style="{ background: s.bg }" @click="onStripClick(s)">
        <span class="strip__text">
          <span class="strip__title">{{ s.title }}</span>
          <span class="strip__desc">{{ s.desc }}</span>
        </span>
        <img :src="s.icon" alt="" class="strip__icon">
      </button>
    </div>

    <div class="below">
      <!-- AI anomaly alerts — collapsed deck when there's more than one (same as Home v1) -->
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
              <MpButton variant="ghost" is-rounded @click="soon('Ignore')">Ignore</MpButton>
              <MpButton variant="secondary" is-rounded @click="soon('Review')">Review</MpButton>
            </div>
          </div>
          <div v-if="anomalies.length > 1 && !anomalyExpanded" class="anomaly-peek" aria-hidden="true" />
        </div>
        <button v-if="anomalies.length > 1" class="anomaly-toggle" type="button" @click="anomalyExpanded = !anomalyExpanded">
          <MpIcon :name="anomalyExpanded ? 'caret-up' : 'caret-down'" size="sm" />
          {{ anomalyExpanded ? 'Show less' : 'Show more' }}
        </button>
      </div>

      <!-- KPI stats -->
      <div class="stats">
        <div v-for="s in stats" :key="s.label" class="stat">
          <p class="stat__label">{{ s.label }}</p>
          <p class="stat__value">{{ s.value }}</p>
          <p class="stat__delta" :class="`stat__delta--${s.deltaTone}`">
            <svg v-if="s.deltaTone === 'up'" class="stat__delta-ic" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg v-else-if="s.deltaTone === 'warn'" class="stat__delta-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="currentColor"/><path d="M12 9v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.05" fill="#fff"/></svg>
            {{ s.delta }}
          </p>
          <button class="stat__ai" type="button" @click="soon(s.ai)">
            <Sparkle :size="14" />
            {{ s.ai }}
          </button>
        </div>
      </div>

      <!-- Widget grid — data-driven; Manage widgets enables live drag-reorder + remove -->
      <div class="grid" :class="{ 'grid--edit': editing, 'grid--dragging': !!dragging }">
        <TransitionGroup
          v-for="col in (['left', 'right'] as ('left' | 'right')[])" :key="col"
          tag="div" name="wig" class="col"
          @dragover.prevent @dragenter.prevent="onEnterColumn(col)" @drop.prevent
        >
          <div
            v-for="(w, i) in layout[col]" :key="w"
            class="widget" :class="{ 'widget--dragging': dragging?.col === col && dragging?.i === i }"
            :draggable="editing"
            @dragstart="onDragStart(col, i, $event)" @dragend="onDragEnd"
            @dragenter.prevent.stop="onEnterWidget(col, i)" @dragover.prevent
          >
            <!-- Edit-mode controls: drag grip + minus remove -->
            <div v-if="editing" class="widget__edit">
              <span class="widget__grip"><MpIcon name="drag" size="sm" /> {{ WIDGET_TITLES[w] }}</span>
              <button class="widget__remove" type="button" aria-label="Remove widget" @click="removeWidget(col, i)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
            </div>

            <HomeWidgetV2 :which="w" />
          </div>
        </TransitionGroup>
      </div>

      <!-- Add widgets gallery (edit mode): each addable widget shown as its real
           card with a (+) top-right; dashed frame = not yet added. -->
      <div v-if="editing" class="gallery">
        <p class="gallery__title"><Sparkle :size="14" /> Add widgets</p>
        <div class="gallery__grid">
          <div v-for="k in galleryItems" :key="k" class="gallery-card">
            <button class="gallery-card__add" type="button" aria-label="Add widget" @click="addFromGallery(k)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
            <div class="gallery-card__preview"><HomeWidgetV2 :which="k" /></div>
          </div>
          <p v-if="!availableWidgets.length" class="gallery__hint">All widgets are on your dashboard. Add a custom one above.</p>
        </div>
      </div>
    </div>

    <button class="manage" type="button" :class="{ 'manage--active': editing }" @click="toggleManage">
      <MpIcon :name="editing ? 'check' : 'settings'" size="sm" />
      {{ editing ? 'Done' : 'Manage widgets' }}
    </button>

    <HomeActionsDrawer v-model:isOpen="manageActionsOpen" />
    <WhatsNewModal v-model:isOpen="whatsNewOpen" />
  </div>
</template>

<style scoped>
.hrhome { position: relative; display: flex; flex-direction: column; gap: var(--mp-spacing-6, 24px); }
/* Full-bleed mint→white backdrop behind the masthead, tall enough to reach about
   the middle of the get-started strip before fading to the white stage. */
.hrhome::before { content: ''; position: absolute; z-index: 0; top: 0; left: 50%; transform: translateX(-50%); width: 100vw; height: 350px; background: linear-gradient(180deg, #E1F6F0 0%, var(--mp-background-stage, #ffffff) 100%); pointer-events: none; }
/* Lift the content sections above the backdrop — scoped to these so it never
   overrides the positioning of the teleported drawer's root element. The hero
   sits a level higher so its expanded search dropdown overlays the strip/below. */
.strip, .below, .manage { position: relative; z-index: 1; }

/* Hero — content sits on the shared mint backdrop above. */
.hero { position: relative; z-index: 2; margin: 0 calc(var(--mp-spacing-6) * -1) 0; padding: var(--mp-spacing-8) var(--mp-spacing-6); display: flex; flex-direction: column; align-items: center; }
/* Content sits above the AI glow. */
.hero > :not(.hero__glow) { position: relative; z-index: 1; }
/* Soft purple AI glow behind the search when AI Mode is on (same as Home v1). */
.hero__glow {
  position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity 400ms ease;
  background:
    radial-gradient(46% 62% at 50% 46%, rgba(130, 112, 219, 0.28) 0%, rgba(130, 112, 219, 0) 70%),
    radial-gradient(60% 78% at 50% 48%, rgba(150, 178, 255, 0.30) 0%, rgba(150, 178, 255, 0) 72%);
}
.hero--ai .hero__glow { opacity: 1; }
.hero__date { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }
.hero__greeting { text-align: center; margin-top: var(--mp-spacing-2); }
.hero__line { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 28px); color: var(--mp-text-default); }
.hero__search { margin-top: var(--mp-spacing-5); width: 100%; max-width: 560px; }
/* z-index above the chips so the expanded search dropdown overlays them (specificity
   matches the .hero > :not(.hero__glow) layering rule, and wins by source order). */
.hero > .hero__search { position: relative; z-index: 3; }
.chips { margin-top: var(--mp-spacing-4); display: flex; flex-wrap: wrap; justify-content: center; gap: var(--mp-spacing-3); }
.chip { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: 6px 16px 6px 12px; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default, #080d0e); cursor: pointer; white-space: nowrap; transition: background 100ms; }
.chip:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.chip__icon { width: 16px; height: 16px; color: var(--mp-text-secondary, #3a4749); flex-shrink: 0; }

.below { width: 100%; max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

/* ── AI anomaly alerts (same as Home v1) ─────────────────────────────────────── */
.anomaly-block { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.anomaly-stack { display: flex; flex-direction: column; }
.anomaly-stack--deck { position: relative; padding-bottom: 10px; isolation: isolate; }
.anomaly-stack--deck .anomaly { position: relative; z-index: 2; border: 2px solid #fff; }
.anomaly-peek { position: absolute; left: 8px; right: 8px; bottom: 0; height: 40px; z-index: 1; border-radius: var(--mp-radii-xl, 12px); background: linear-gradient(90deg, #dbe4f5 0%, #e2def4 100%); }
.anomaly-stack:not(.anomaly-stack--deck) { gap: 4px; }
.anomaly-stack:not(.anomaly-stack--deck) .anomaly { border-radius: 0; }
.anomaly-stack:not(.anomaly-stack--deck) .anomaly:first-child { border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; }
.anomaly-stack:not(.anomaly-stack--deck) .anomaly:last-child { border-radius: 0 0 var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px); }
.anomaly-toggle { align-self: center; display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-3); background: none; border: none; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
.anomaly-toggle:hover { color: var(--mp-text-default, #080d0e); }
.anomaly { background: linear-gradient(90deg, #ecf1fc 0%, #f2f1ff 100%); border-radius: var(--mp-radii-xl, 12px); padding: var(--mp-spacing-4) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.anomaly__head { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.anomaly__icon { flex-shrink: 0; }
.anomaly__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.anomaly__body { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.anomaly__actions { display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); }

/* Get started strip */
/* Constrained to the same 880px content width as everything below, so the four
   cards read as an 8-column band rather than stretching full-bleed. */
.strip { width: 100%; max-width: 880px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #C8E4DA; border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #fff); overflow: hidden; }
/* Per-card pastel tint comes from the inline :style; a subtle darken overlay on
   hover keeps that tint visible instead of washing it to grey. */
.strip__item { position: relative; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-5) var(--mp-spacing-6); border: none; border-left: 1px solid #C8E4DA; cursor: pointer; text-align: left; }
.strip__item:first-child { border-left: none; }
.strip__item::after { content: ''; position: absolute; inset: 0; background: rgba(0, 0, 0, 0); transition: background 100ms; pointer-events: none; }
.strip__item:hover::after { background: rgba(0, 0, 0, 0.03); }
.strip__icon { position: relative; z-index: 1; width: 40px; height: 40px; flex-shrink: 0; }
.strip__text { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.strip__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.strip__desc { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }

/* KPI stats */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #fff); }
.stat { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-5) var(--mp-spacing-6); border-left: 1px solid var(--mp-border-default, #e3e7e9); }
.stat:first-child { border-left: none; }
.stat__label { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.stat__value { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default); }
.stat__delta { margin: 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); }
.stat__delta-ic { flex-shrink: 0; }
.stat__delta--up { color: var(--mp-text-success, #186f4a); }
.stat__delta--warn { color: var(--mp-text-warning-bold, #a14a0b); }
.stat__delta--muted { color: var(--mp-text-secondary); }
.stat__ai { margin-top: var(--mp-spacing-1); display: inline-flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-airene-default, #7c3aed); }
.stat__ai:hover { text-decoration: underline; }

/* Grid */
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-6); align-items: start; }
.col { position: relative; display: flex; flex-direction: column; gap: var(--mp-spacing-6); min-width: 0; }

/* ── Manage widgets: widget wrapper + drag/remove ────────────────────────────── */
.widget { position: relative; }
/* iCloud-style edit cue: placed widgets wiggle gently (no dashed border — that's
   reserved for the not-yet-added gallery cards). Slight per-item phase/duration
   variation so they're out of sync. Amplitude kept small (subtle, not busy). */
.grid--edit .widget { cursor: grab; transform-origin: 50% 50%; animation: widget-wiggle 0.62s ease-in-out infinite; }
.grid--edit .widget:nth-child(2n) { animation-duration: 0.56s; animation-delay: -0.16s; }
.grid--edit .widget:nth-child(3n) { animation-duration: 0.68s; animation-delay: -0.1s; }
@keyframes widget-wiggle {
  0%   { transform: rotate(-0.28deg) translateY(-0.2px); }
  50%  { transform: rotate(0.28deg)  translateY(0.2px); }
  100% { transform: rotate(-0.28deg) translateY(-0.2px); }
}
/* While actively dragging, calm the wiggle so the FLIP slide is clean, and lift
   the grabbed widget (iOS-style). The reordering itself is animated by the
   TransitionGroup below — siblings slide to make room in real time. */
.grid--dragging .widget { animation: none; cursor: grabbing; }
.widget--dragging { opacity: 0.55; }
.wig-move { transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1); }
.wig-move.widget--dragging { transition: none; }
.wig-leave-active { position: absolute; width: calc(100% - 0px); }
.wig-enter-from, .wig-leave-to { opacity: 0; }
.wig-enter-active { transition: opacity 160ms ease; }
@media (prefers-reduced-motion: reduce) { .grid--edit .widget { animation: none; } .wig-move { transition: none; } }
.widget__edit { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: 0 0 var(--mp-spacing-2); }
.widget__grip { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.widget__remove { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: var(--mp-background-neutral, #fff); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18); cursor: pointer; color: var(--mp-text-default); border-radius: var(--mp-radii-full, 999px); }
.widget__remove:hover { color: var(--mp-text-danger, #dc2626); }

/* ── Add widgets gallery ─────────────────────────────────────────────────────── */
.gallery { display: flex; flex-direction: column; gap: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); padding-top: var(--mp-spacing-6); }
.gallery__title { margin: 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.gallery__title > svg { color: var(--mp-airene-default, #7c3aed); }
.gallery__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-6); align-items: start; }
.gallery__hint { margin: 0; grid-column: 1 / -1; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.gallery-card { position: relative; border: 1.5px dashed var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-xl, 12px); padding: var(--mp-spacing-2); background: var(--mp-background-neutral-subtle, #f8f9f9); }
/* The preview card is a non-interactive sample — the only control is the (+). */
.gallery-card__preview { pointer-events: none; opacity: 0.92; }
.gallery-card__add { position: absolute; top: -12px; right: -12px; z-index: 2; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: var(--mp-radii-full, 999px); cursor: pointer; background: var(--mp-background-airene-bold, #7c3aed); color: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22); transition: transform 100ms; }
.gallery-card__add:hover { transform: scale(1.08); }

.manage { align-self: center; display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); background: none; border: none; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.manage:hover { color: var(--mp-text-default); }
.manage--active { color: var(--mp-text-link, #165082); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Mobile (≤640px) — stack the multi-column grids, tame the full-bleed hero ── */
@media (max-width: 640px) {
  .hero { padding-left: var(--mp-spacing-4); padding-right: var(--mp-spacing-4); }
  .hero__search { max-width: 100%; }
  /* Shortcut chips: one horizontal swipe row instead of wrapping */
  .chips { align-self: stretch; flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex-shrink: 0; }
  /* Get-started cards: drop the decorative icon on mobile */
  .strip { grid-template-columns: 1fr 1fr; }
  .strip__icon { display: none; }
  /* KPI cards: one per row, stacked with a top divider */
  .stats { grid-template-columns: 1fr; }
  .stat { border-left: none; }
  .stat + .stat { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
  .grid, .gallery__grid { grid-template-columns: 1fr; }
}
</style>
