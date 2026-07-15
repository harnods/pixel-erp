import { resolveNavigationAttempt } from '~/composables/useUnsavedChangesGuard'

/**
 * Registered exactly once, app-wide. See useUnsavedChangesGuard.ts for why this
 * has to be a global router.beforeEach rather than a per-page onBeforeRouteLeave
 * (this app has a single catch-all route — component-level route guards never fire).
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  router.beforeEach(async () => resolveNavigationAttempt())
})
