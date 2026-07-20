import { resolveNavigationAttempt } from '~/composables/useUnsavedChangesGuard'

/**
 * Registered exactly once, app-wide. See useUnsavedChangesGuard.ts for why this
 * has to be a global router.beforeEach rather than a per-page onBeforeRouteLeave
 * (this app has a single catch-all route — component-level route guards never fire).
 *
 * The module-level flag guards against a duplicate registration (e.g. a stale
 * dev-server HMR pass re-running this plugin without tearing down the previous
 * one first) — two concurrent beforeEach guards each awaiting their own promise
 * would race resolveChoice, leaving one navigation permanently stuck and the
 * modal looking broken/unclickable.
 */
let registered = false
export default defineNuxtPlugin(() => {
  if (registered) return
  registered = true
  const router = useRouter()
  router.beforeEach(async () => resolveNavigationAttempt())
})
