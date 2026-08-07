import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'

/**
 * Warns before unsaved form data is lost — refresh/close-tab via the browser's
 * own beforeunload prompt (native, can't be customized — no way to offer
 * "Save as draft" there, browsers block that by design), and in-app navigation
 * (link clicks, Cancel buttons, the browser Back/Forward buttons) via a global
 * router guard that blocks the navigation until the operator picks
 * Cancel / Leave / Save as draft in a modal rendered at the app root.
 *
 * This app has exactly one real Vue Router route (app/pages/[...slug].vue, a
 * catch-all) — every "page" is a component swapped in via <component :is>
 * inside it, not a distinct route. So onBeforeRouteLeave/onBeforeRouteUpdate
 * never fire (the matched route never changes, only its internal dispatch
 * does). A global router.beforeEach (registered once, see
 * plugins/unsaved-changes-guard.client.ts) intercepts every navigation attempt
 * regardless of route-matching semantics, so it works here where the
 * component-level guards can't.
 */
export interface UnsavedChangesGuardOptions {
  /** Called at the moment of navigating away — return true while there's
   *  something that would be lost. */
  hasUnsavedChanges: () => boolean
  /** Omit for forms with no draft concept — the modal then offers only Leave/Cancel. */
  saveDraft?: () => void | Promise<void>
}

type Choice = 'leave' | 'draft' | 'cancel'

// Shared singleton — the form page currently mounted "claims" this slot for its
// lifetime; only one form is ever on screen at a time in this SPA. shallowRef,
// not ref: a plain ref() deep-wraps whatever's assigned to it in a reactive()
// proxy, so `activeGuard.value === options` in onUnmounted below would compare
// a proxy against the raw object and never match — the slot would never
// actually clear. shallowRef keeps the assigned value exactly as given.
const activeGuard = shallowRef<UnsavedChangesGuardOptions | null>(null)
const isOpen = ref(false)
let resolveChoice: ((choice: Choice) => void) | null = null

/** Called once, by the global plugin's router.beforeEach — not by page components. */
export async function resolveNavigationAttempt(): Promise<boolean> {
  const guard = activeGuard.value
  if (!guard || !guard.hasUnsavedChanges()) return true
  isOpen.value = true
  const choice = await new Promise<Choice>((resolve) => { resolveChoice = resolve })
  isOpen.value = false
  if (choice === 'cancel') return false
  if (choice === 'draft') await guard.saveDraft?.()
  // The operator already answered "leave this page behind?" for THIS guard —
  // clear it right away rather than waiting for the still-mounting-out page's
  // own onUnmounted. A redirect/second beforeEach pass that lands before that
  // unmount finishes (e.g. the destination normalizing its own URL/query on
  // mount) would otherwise see the same still-registered guard and pop this
  // exact "Leave without saving?" modal straight back up for a question that
  // was just answered. (Guarded by identity, not a blind null, in case a new
  // page has already mounted and registered its own guard in the interim.)
  if (activeGuard.value === guard) activeGuard.value = null
  return true
}

/** Root-level modal state — rendered exactly once, in [...slug].vue, since it
 *  must survive whichever virtual page is currently mounted. */
export function useUnsavedChangesModalState() {
  return {
    isOpen,
    hasSaveDraft: computed(() => !!activeGuard.value?.saveDraft),
    chooseLeave: () => resolveChoice?.('leave'),
    chooseDraft: () => resolveChoice?.('draft'),
    chooseCancel: () => resolveChoice?.('cancel'),
  }
}

/** Called by each form page — registers/unregisters itself as "the form with
 *  something to lose" for the lifetime of that page. Returns `disableGuard()` —
 *  call it right before a Save/Finish handler's own `router.push`, so the
 *  navigation it deliberately triggers isn't misread as "leaving unsaved work
 *  behind" (the operator just saved/finished; hasUnsavedChanges() would
 *  otherwise still read true, since nothing else clears the underlying draft
 *  state before that push). Once disabled it stays disabled for this page
 *  instance's remaining lifetime — there's no scenario where a page that just
 *  committed and navigated away would need the guard back on. */
export function useUnsavedChangesGuard(options: UnsavedChangesGuardOptions) {
  const disabled = ref(false)
  const wrapped: UnsavedChangesGuardOptions = {
    hasUnsavedChanges: () => !disabled.value && options.hasUnsavedChanges(),
    saveDraft: options.saveDraft,
  }
  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (!wrapped.hasUnsavedChanges()) return
    e.preventDefault()
    e.returnValue = ''
  }
  onMounted(() => {
    activeGuard.value = wrapped
    window.addEventListener('beforeunload', handleBeforeUnload)
  })
  onUnmounted(() => {
    if (activeGuard.value === wrapped) activeGuard.value = null
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
  return {
    disableGuard: () => { disabled.value = true },
  }
}
