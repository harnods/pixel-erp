/**
 * useContactTaxScenario — which result the New contact form's `Validate` button
 * gets back from the (mocked) DJP lookup, so the tax-info states can be demoed
 * without memorising which NPWP/NITKU numbers are "registered".
 *
 * Narrower than useScenario (ERP/WMS Standalone/...) — this doesn't reshape the
 * nav or routing, only the outcome of one button. A module-level ref makes it a
 * shared singleton. Not persisted: same as the other page-local demo-FAB
 * toggles in this app (e.g. [[useApprovalWorkflowScenario]]'s Project
 * Accounting component), this is a "flip while testing" preview, not a durable
 * setting.
 */

/** The three outcomes drawn in the Figma. */
export type DjpValidationOutcome = 'valid' | 'npwp-not-found' | 'combination-not-found'

const djpOutcome = ref<DjpValidationOutcome>('valid')

export function useContactTaxScenario() {
  function setDjpOutcome(outcome: DjpValidationOutcome) {
    djpOutcome.value = outcome
  }

  return { djpOutcome, setDjpOutcome }
}
