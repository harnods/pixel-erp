/**
 * Guided tours: the runner.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * It wraps @mekari/pixel3-tour. MpTour mounts its own app into
 * #pixel-tour-portal and positions one panel against a target with Popper. The
 * runner drives it one step at a time (isManual, remounted per step) because
 * each step may change route, switch View as, or wait for a drawer the
 * previous step asked the reader to open.
 *
 * Two things MpTour does are undone here, because every step asks for an
 * action on the screen: it sets pointer-events:none, z-index and position on
 * the target (restored straight after mount), and it draws a full-screen
 * overlay (hidden in TourLauncher.vue's styles).
 */
import { h, nextTick, ref } from 'vue'
import type { Router } from 'vue-router'
import { tour as mountTour } from '@mekari/pixel3-tour'
import { resetAssetStore, setViewAs, type ViewAsRole } from '~/data/assetStore'
import type { AssetTour, TourStep } from './assetTours'
import { TourPanel } from './tourPanel'

const TOUR_ID = 'asset-tour'
const TARGET_CLASS = 'asset-tour-target'
const WAIT_MS = 400

interface Running {
  tour: AssetTour
  /** -1 is the confirmation panel, steps.length is the closing panel. */
  index: number
  router: Router
  /** Bumped on every move so a late wait from an earlier step gives up. */
  token: number
  /** Auto-play steps already run, so Back and Next never repeat the work. */
  ran: Set<number>
}

export const activeTour = ref<{ id: string; index: number } | null>(null)
let running: Running | null = null
let mounted: { app: { unmount: () => void } } | null = null
let restore: (() => void) | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let watchTimer: ReturnType<typeof setInterval> | null = null

// ── Targets ──────────────────────────────────────────────────────────────────

export function selectorFor(marker: string): string {
  return `[data-tour="${marker}"]`
}

/**
 * The live element for a marker. Drawers leave a closing copy in the DOM
 * during their leave transition, so a copy inside one is skipped, and so is
 * anything not laid out.
 */
export function findTarget(marker: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(selectorFor(marker)))
  const live = all.filter((el) => !el.closest('[class*="leave-active"]') && el.getClientRects().length > 0)
  return live[live.length - 1] ?? null
}

// ── Mounting ─────────────────────────────────────────────────────────────────

function unmountPanel() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null }
  restore?.()
  restore = null
  if (mounted) {
    mounted.app.unmount()
    mounted = null
  }
  mountTour(false)
}

function applyRole(t: AssetTour, role: ViewAsRole) {
  if (t.applyRole) t.applyRole(role)
  else setViewAs(role)
}

function roleAt(t: AssetTour, index: number): ViewAsRole {
  let role = t.role
  for (let i = 0; i <= index && i < t.steps.length; i++) {
    const r = t.steps[i]!.role
    if (r) role = r
  }
  return role
}

type PanelProps = {
  kind: 'intro' | 'step' | 'waiting' | 'closing'
  caption: string
  title: string
  body?: string
  action?: string
  watch?: string
  nextLabel?: string
  backLabel?: string
  stepNo?: number
  stepTotal?: number
}

function show(panel: PanelProps, target: HTMLElement | null, step: TourStep | null) {
  unmountPanel()
  // MpTour looks its target up by selector, so give the one live element a
  // unique hook rather than trusting the first match in the document.
  let selector: string | undefined
  if (target) {
    target.setAttribute('data-tour-live', '')
    selector = '[data-tour-live]'
  }
  const saved = target ? { z: target.style.zIndex, pos: target.style.position, pe: target.style.pointerEvents } : null
  const inst = mountTour(true, [{
    target: selector,
    isHighlighted: false,
    isScrollIntoElement: false,
    options: {
      placement: step?.placement ?? 'bottom',
      // Keep the panel inside the window and let it flip when there is no room.
      modifiers: [
        { name: 'preventOverflow', options: { rootBoundary: 'viewport', altAxis: true, tether: false, padding: 12 } },
        { name: 'offset', options: { offset: [0, 12] } },
        { name: 'flip', options: { fallbackPlacements: ['top', 'bottom', 'left', 'right'] } },
      ],
    } as { placement?: TourStep['placement'] },
    render: () => h(TourPanel, {
      ...panel,
      onNext: () => go(1),
      onBack: () => go(-1),
      onClose: () => stopTour(),
    }),
  }], { id: TOUR_ID, isManual: true })
  mounted = inst ? { app: inst.$.appContext.app } : null
  if (target && saved) {
    target.classList.add(TARGET_CLASS)
    // MpTour set these in its mount hook; the reader has to use the target.
    target.style.zIndex = saved.z
    target.style.position = saved.pos
    target.style.pointerEvents = saved.pe
    restore = () => {
      target.classList.remove(TARGET_CLASS)
      target.removeAttribute('data-tour-live')
    }
  }
  const panelEl = document.getElementById(TOUR_ID)
  if (!panelEl) return
  if (!target) {
    // No target: centre on the window, whatever the page has scrolled.
    panelEl.setAttribute('data-centered', '')
    return
  }
  // Popper places the panel beside the target when there is room. A target
  // taller or wider than the space around it (a schedule, a drawer) leaves
  // none, and Popper then pushes the panel over it. In that case pin the
  // panel to the window corner furthest from the target's centre instead,
  // so the part the step is about stays visible and usable.
  // Popper positions on its first update, a frame or two after mount.
  pollTimer = setTimeout(() => {
    pollTimer = null
    const p = panelEl.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    const ox = Math.min(p.right, t.right) - Math.max(p.left, t.left)
    const oy = Math.min(p.bottom, t.bottom) - Math.max(p.top, t.top)
    // A sliver of overlap is fine; a panel over a third of its area is not.
    if (ox <= 0 || oy <= 0 || (ox * oy) / (p.width * p.height) < 0.3) return
    const cx = (t.left + t.right) / 2
    const cy = (t.top + t.bottom) / 2
    const h = cx > window.innerWidth / 2 ? 'l' : 'r'
    const v = cy > window.innerHeight / 2 ? 't' : 'b'
    panelEl.setAttribute('data-pinned', `${v}${h}`)
  }, 150)
}

// ── Moving ───────────────────────────────────────────────────────────────────

function sameRoute(router: Router, route: string): boolean {
  return router.currentRoute.value.fullPath === route
}

async function enterStep(r: Running) {
  const token = ++r.token
  const { tour, index } = r
  activeTour.value = { id: tour.id, index }
  const m = tour.steps.length

  if (index < 0) {
    show({
      kind: 'intro',
      caption: `${tour.code} · ${m} steps · ${tour.persona}`,
      title: tour.name,
      body: `${tour.blurb} Starting this tour resets the session sample data and sets View as to ${tour.role}. Anything you changed in this session is lost.`,
      nextLabel: 'Reset and start',
      backLabel: 'Cancel',
    }, null, null)
    return
  }
  if (index >= m) {
    show({
      kind: 'closing',
      caption: `${tour.code} · complete`,
      title: tour.name,
      body: tour.closing,
      nextLabel: 'Finish',
      backLabel: 'Back',
    }, null, null)
    return
  }

  const step = tour.steps[index]!
  applyRole(tour, roleAt(tour, index))
  if (step.run && !r.ran.has(index)) {
    r.ran.add(index)
    try { step.run() } catch (e) { console.error('tour step failed', e) }
  }
  const route = typeof step.route === 'function' ? step.route() : step.route
  // A page reacting to the role switch (e.g. the payroll inbox dropping a view the new role can't
  // see) can rewrite its URL and cancel this push; try again until the route lands.
  for (let i = 0; route && i < 3 && !sameRoute(r.router, route); i++) {
    await r.router.push(route)
    await nextTick()
  }
  await nextTick()
  const caption = `${tour.code} · Step ${index + 1} of ${m}`
  const panel: PanelProps = {
    kind: 'step',
    caption,
    title: step.title,
    body: step.body,
    action: step.action,
    watch: step.watch,
    nextLabel: index === m - 1 ? 'Finish' : 'Next',
    backLabel: 'Back',
    stepNo: index + 1,
    stepTotal: m,
  }

  let shownWaiting = false
  const started = Date.now()
  const attempt = () => {
    if (!running || running.token !== token) return
    const el = step.find ? step.find() : findTarget(step.target)
    if (el) {
      // A short target is brought to the top so the panel has room under it;
      // a tall one (a schedule, a drawer body) only needs to be on screen.
      const short = el.getBoundingClientRect().height < window.innerHeight * 0.4
      el.scrollIntoView({ block: short ? 'start' : 'nearest', inline: 'nearest' })
      show(panel, el, step)
      // A page that re-renders under the same route (one asset detail to
      // the next) can replace the element after it was found. Watch for
      // that and anchor again rather than point at a detached node.
      watchTimer = setInterval(() => {
        if (!running || running.token !== token) return
        if (!el.isConnected) { shownWaiting = true; attempt() }
      }, WAIT_MS)
      return
    }
    // The target is not on screen yet: a drawer still opening, a page still
    // loading, or an action on the previous step not done. Say so, and keep
    // looking, rather than pointing at nothing.
    // A missing target must never trap the reader: the panel always offers
    // a way on (Skip this step, or Finish on the last step), and it keeps
    // looking so the step anchors as soon as the target appears.
    if (!shownWaiting && Date.now() - started > 1200) {
      shownWaiting = true
      const prev = index > 0 ? tour.steps[index - 1]!.action : undefined
      show({
        kind: 'waiting',
        caption,
        title: step.title,
        body: step.ifMissing ?? 'The part of the screen this step points at is not showing yet.',
        action: step.ifMissing ? undefined : prev ? `Finish the previous step first: ${prev}` : undefined,
        watch: step.ifMissing ? undefined : index === m - 1 ? 'Or select Finish to end the tour.' : 'Or select Skip this step to carry on.',
        nextLabel: index === m - 1 ? 'Finish' : 'Skip this step',
        backLabel: 'Back',
        stepNo: index + 1,
        stepTotal: m,
      }, null, null)
    }
    pollTimer = setTimeout(attempt, WAIT_MS)
  }
  attempt()
}

function go(delta: number) {
  const r = running
  if (!r) return
  if (r.index < 0 && delta < 0) { stopTour(); return }
  if (r.index >= r.tour.steps.length && delta > 0) { stopTour(); return }
  if (r.index < 0 && delta > 0) {
    // The confirmation panel: this is the one reset a tour performs.
    ;(r.tour.onReset ?? resetAssetStore)()
    r.ran.clear()
    applyRole(r.tour, r.tour.role)
  }
  r.index = Math.max(-1, Math.min(r.tour.steps.length, r.index + delta))
  void enterStep(r)
}

// ── Public ───────────────────────────────────────────────────────────────────

export function startTour(t: AssetTour, router: Router) {
  stopTour()
  running = { tour: t, index: -1, router, token: 0, ran: new Set() }
  void enterStep(running)
}

export function stopTour() {
  if (running) running.token++
  running = null
  activeTour.value = null
  unmountPanel()
}
