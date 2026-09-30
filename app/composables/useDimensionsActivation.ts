/**
 * useDimensionsActivation — whether this tenant has activated the Dimensions
 * feature yet. A module-level ref makes it a shared singleton across the
 * Settings > Dimensions wrapper (which switches between the paywall and the
 * management table), the page title bar (which only shows "+ New dimension"
 * once activated), the transaction forms (which gate their Dimensions column
 * and the cross-sell caption on it) and the Financials reports.
 *
 * Persisted under the `erp-db:` prefix, so activation survives a refresh — the
 * paywall is a FIRST-RUN screen, not something that reappears every reload.
 * "Reset demo data" (resetDb) wipes that prefix, which brings the paywall back
 * exactly as a fresh tenant would see it.
 */
import { loadFlag, saveFlag } from '~/data/persist'

const ACTIVATION_KEY = 'dimensions-activated-v1'

const dimensionsActivated = ref(loadFlag(ACTIVATION_KEY))

export function useDimensionsActivation() {
  function activateDimensions() {
    dimensionsActivated.value = true
    saveFlag(ACTIVATION_KEY, true)
  }

  return { dimensionsActivated, activateDimensions }
}
