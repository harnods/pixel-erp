/**
 * Whether the signed-in user may submit tax documents to DJP (PRD-05 BR-006 /
 * AC-009). There is no roles/permissions module in the prototype yet, so this
 * stands in for one — a single shared flag, flipped from the Tax document tab's
 * "Scenario state" control, the same demo-toggle convention InvoiceReviewPage
 * and CreateTaxDocumentDrawer already use.
 *
 * When the real permission model lands, only this file changes: every call site
 * asks `canSubmitTaxDocument`, never the toggle.
 */
const STORAGE_KEY = 'erp-tax-submission-permission'

/** Module-level ref → one shared value across every component that asks. */
const canSubmitTaxDocument = ref(true)
let hydrated = false

export function useTaxSubmissionPermission() {
  if (!hydrated && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) canSubmitTaxDocument.value = saved === 'true'
    hydrated = true
  }

  function setCanSubmitTaxDocument(value: boolean) {
    canSubmitTaxDocument.value = value
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, String(value))
  }

  return { canSubmitTaxDocument, setCanSubmitTaxDocument }
}
