<script setup lang="ts">
/**
 * DevChangesOverlay — an engineer-facing "what changed & where" layer.
 *
 * When toggled on, it scans the current page for elements tagged with
 * `data-devchange="<id>"`, and draws a pulsing marker on each. Hovering/clicking a
 * marker opens a coachmark describing the change (from the DEV_CHANGES registry:
 * title, description, date, PR, files). This is a prototype/demo aid so engineers
 * reviewing the app know exactly which spots moved in the latest push — it is NOT a
 * customer-facing feature (that's WhatsNewModal).
 *
 * Anchoring uses live getBoundingClientRect on an rAF loop while active, so markers
 * track scrolling, drawers sliding in, and layout shifts. The overlay container is
 * pointer-events:none; only the markers and cards capture the pointer, so it never
 * blocks interaction with the page underneath.
 */
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import { getDevChange, DEV_CHANGES_REPO, type DevChange } from '~/data/devChanges'

// All shared state (per-user resolved set, dismiss/mute, derived on/off) lives in
// the composable so the overlay and the user-menu "Changes" toggle stay in sync.
const { active, resolved, resolveChange: markResolved, unresolveIds, mute } = useDevChanges()
const openKey = ref<string | null>(null)

function resolveChange(id: string) {
  markResolved(id)
  openKey.value = null
  scan() // reflect immediately, don't wait for the next interval tick
}

interface Marker {
  key: string
  change: DevChange
  x: number
  y: number
  visible: boolean
}
const markers = ref<Marker[]>([])
// All change-ids physically present on the page (before the resolved filter) — lets
// us offer a "show resolved" affordance for what this user has hidden here.
const presentIds = ref<Set<string>>(new Set())
const route = useRoute()

// ── Scan + position ────────────────────────────────────────────────────────
function scan() {
  if (typeof document === 'undefined') return
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-devchange]'))
  const seen = new Map<string, number>()
  const present = new Set<string>()
  const next: Marker[] = []
  for (const el of els) {
    const id = el.getAttribute('data-devchange')
    if (!id) continue
    const change = getDevChange(id)
    if (!change) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue // not rendered
    present.add(id)
    if (resolved.value.has(id)) continue // this user marked it resolved → hide
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    // Anchor the marker at the element's top-right corner, inset a touch.
    const x = Math.min(r.right - 6, window.innerWidth - 12)
    const y = Math.max(r.top + 6, 12)
    const visible = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
    next.push({ key: `${id}#${n}`, change, x, y, visible })
  }
  markers.value = next
  presentIds.value = present
}

// Re-scan on scroll/resize (immediate) plus a light interval to catch async
// content (rows added, drawers sliding in). We deliberately avoid requestAnimationFrame
// as the sole driver — rAF is paused in background tabs, so markers would never appear
// until the tab is focused.
let intervalId: ReturnType<typeof setInterval> | 0 = 0
function startLoop() {
  if (intervalId) return
  scan()
  window.addEventListener('scroll', scan, { capture: true, passive: true })
  window.addEventListener('resize', scan, { passive: true })
  intervalId = setInterval(scan, 150)
}
function stopLoop() {
  if (intervalId) { clearInterval(intervalId); intervalId = 0 }
  window.removeEventListener('scroll', scan, { capture: true } as any)
  window.removeEventListener('resize', scan)
  markers.value = []
}

// Persistence lives in useDevChanges; here we only drive the scan loop.
watch(active, (on) => {
  if (on) startLoop()
  else { stopLoop(); openKey.value = null }
}, { immediate: true })

// Re-close any pinned card when navigating (positions/ids change).
watch(() => route.fullPath, () => { openKey.value = null })

onBeforeUnmount(stopLoop)

// ── Toggle button label ─────────────────────────────────────────────────────
// Count distinct UNRESOLVED changes present on the current page (dedupe instances).
const pageCount = computed(() => new Set(markers.value.map(m => m.change.id)).size)
// How many changes on this page the current user has already resolved (hidden).
const resolvedOnPage = computed(() => [...presentIds.value].filter(id => resolved.value.has(id)).length)
function showResolvedOnPage() {
  unresolveIds([...presentIds.value].filter(id => resolved.value.has(id)))
  scan() // bring the markers back immediately
}

function hideOverlay() { mute() }
function openCard(key: string) { openKey.value = openKey.value === key ? null : key }

const openMarker = computed(() => markers.value.find(m => m.key === openKey.value) || null)

// Card placement: to the left of the marker if it's near the right edge, else right.
const cardStyle = computed(() => {
  const m = openMarker.value
  if (!m) return {}
  const CARD_W = 320
  const spaceRight = window.innerWidth - m.x
  const left = spaceRight < CARD_W + 24 ? m.x - CARD_W - 12 : m.x + 16
  const top = Math.min(m.y + 8, window.innerHeight - 220)
  return { left: `${Math.max(12, left)}px`, top: `${Math.max(12, top)}px`, width: `${CARD_W}px` }
})

function prHref(pr?: string) {
  if (!pr) return undefined
  const n = pr.replace('#', '').trim()
  return /^\d+$/.test(n) ? `${DEV_CHANGES_REPO}/pull/${n}` : undefined
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
</script>

<template>
  <Teleport to="body">
    <!-- FAB — shown only while the layer is on AND there are unresolved changes on
         this page. Once everything here is resolved it hides itself; re-enable the
         layer from the user menu → "Changes". Click hides the layer for the session. -->
    <button
      v-if="active && pageCount > 0"
      type="button"
      class="wn-fab wn-fab--on"
      title="Hide code changes (re-enable from the user menu)"
      @click="hideOverlay"
    >
      <MpIcon name="code" size="sm" />
      <span class="wn-fab-label">Changes</span>
      <span class="wn-fab-count">{{ pageCount }}</span>
    </button>

    <!-- Restore markers this user resolved on the current page. -->
    <button
      v-if="active && resolvedOnPage"
      type="button"
      class="wn-restore"
      title="Show changes you marked resolved on this page"
      @click="showResolvedOnPage"
    >
      <MpIcon name="refresh" size="sm" />
      Show {{ resolvedOnPage }} resolved
    </button>

    <!-- The marker + coachmark layer (pointer-events pass through except markers). -->
    <div v-if="active" class="wn-layer" aria-hidden="false">
      <button
        v-for="m in markers"
        v-show="m.visible"
        :key="m.key"
        type="button"
        class="wn-marker"
        :class="{ 'wn-marker--open': openKey === m.key }"
        :style="{ left: m.x + 'px', top: m.y + 'px' }"
        :title="m.change.title"
        @click="openCard(m.key)"
        @mouseenter="openKey === null ? (openKey = m.key) : null"
      >
        <span class="wn-dot" />
      </button>

      <div v-if="openMarker" class="wn-card" :style="cardStyle">
        <div class="wn-card-head">
          <span class="wn-card-badge">New</span>
          <span class="wn-card-date">{{ fmtDate(openMarker.change.date) }}</span>
          <button
            type="button"
            class="wn-card-resolve"
            aria-label="Mark as resolved"
            title="Mark as resolved"
            @click="resolveChange(openMarker.change.id)"
          >
            <MpIcon name="done" size="sm" />
          </button>
          <button type="button" class="wn-card-close" aria-label="Close" @click="openKey = null">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
        <h4 class="wn-card-title">{{ openMarker.change.title }}</h4>
        <p class="wn-card-desc">{{ openMarker.change.description }}</p>
        <div v-if="openMarker.change.files?.length" class="wn-card-files">
          <span v-for="f in openMarker.change.files" :key="f" class="wn-card-file">{{ f }}</span>
        </div>
        <a
          v-if="prHref(openMarker.change.pr)"
          class="wn-card-pr"
          :href="prHref(openMarker.change.pr)"
          target="_blank"
          rel="noopener"
        >
          <MpIcon name="newtab" size="sm" /> {{ openMarker.change.pr }}
        </a>
        <span v-else-if="openMarker.change.pr" class="wn-card-pr wn-card-pr--plain">{{ openMarker.change.pr }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Purple (Airene) so the dev layer never reads as ERP product chrome. */
.wn-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147483001;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--mp-airene-badge-border, #8270db);
  border-radius: 9999px;
  background: #ffffff;
  color: var(--mp-airene-bold, #5a41d6);
  font-family: var(--mp-fonts-body);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--mp-shadows-md, 0 8px 24px rgba(0, 0, 0, 0.1));
}
.wn-fab:hover { background: var(--mp-airene-badge-bg, #f3f1fc); }

/* "Show N resolved" — sits just above the FAB. */
.wn-restore {
  position: fixed;
  right: 24px;
  bottom: 72px;
  z-index: 2147483001;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: 9999px;
  background: #ffffff;
  color: var(--mp-text-secondary, #3a4749);
  font-family: var(--mp-fonts-body);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--mp-shadows-md, 0 8px 24px rgba(0, 0, 0, 0.1));
}
.wn-restore:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.wn-fab--on {
  background: var(--mp-airene-default, #651fff);
  border-color: var(--mp-airene-default, #651fff);
  color: #ffffff;
}
.wn-fab--on:hover { background: var(--mp-airene-hovered, #7c3aed); border-color: var(--mp-airene-hovered, #7c3aed); }
.wn-fab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9999px;
  background: #ffffff;
  color: var(--mp-airene-bold, #5a41d6);
  font-size: 11px;
  font-weight: 700;
}

.wn-layer {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}

.wn-marker {
  position: fixed;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}
.wn-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--mp-airene-default, #651fff);
  box-shadow: 0 0 0 2px #ffffff;
}
.wn-dot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--mp-airene-default, #651fff);
  animation: wn-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.wn-marker--open .wn-dot::before { animation: none; }
@keyframes wn-ping {
  75%,
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}

.wn-card {
  position: fixed;
  z-index: 2147483002;
  pointer-events: auto;
  background: #ffffff;
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: 12px;
  box-shadow: var(--mp-shadows-lg, 0 4px 16px rgba(0, 0, 0, 0.12));
  padding: 14px 16px;
  font-family: var(--mp-fonts-body);
}
.wn-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.wn-card-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 9999px;
  background: var(--mp-airene-subtle, #ede9fe);
  color: var(--mp-airene-bold, #5a41d6);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.wn-card-date { font-size: 12px; color: var(--mp-text-subtle, #6e7a7c); }
.wn-card-resolve {
  margin-left: auto;
  display: inline-flex;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--mp-text-selected, #0f6d4d);
  cursor: pointer;
  border-radius: 6px;
}
.wn-card-resolve:hover { background: var(--mp-background-nav-stack-hovered, #d6f4e9); }
.wn-card-close {
  display: inline-flex;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--mp-text-subtle, #6e7a7c);
  cursor: pointer;
  border-radius: 6px;
}
.wn-card-close:hover { background: var(--mp-background-neutral-pressed, #ebf0f1); }
.wn-card-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--mp-text-default, #080d0e);
}
.wn-card-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--mp-text-secondary, #3a4749);
}
.wn-card-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.wn-card-file {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  color: var(--mp-text-secondary, #3a4749);
}
.wn-card-pr {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mp-text-link, #165082);
  text-decoration: none;
}
.wn-card-pr:hover { text-decoration: underline; }
.wn-card-pr--plain { color: var(--mp-text-subtle, #6e7a7c); font-weight: 500; }
</style>
