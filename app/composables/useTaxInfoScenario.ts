/**
 * useTaxInfoScenario — which tax-info gap the Sales Invoice "Create tax
 * document" action runs into, so each blocking state can be demoed without
 * hand-editing a company profile, a contact and a product first.
 *
 * Narrower than useScenario (ERP/WMS Standalone/...) — this doesn't reshape the
 * nav or routing, only which of the two tax-document drawers opens and what it
 * reports as missing. Same shape as [[useContactTaxScenario]]: a module-level
 * ref makes it a shared singleton, and it isn't persisted — a "flip while
 * testing" preview, not a durable setting.
 *
 * Every one of the four listed scenarios FORCES its state, including "All tax
 * info complete", which opens the create form whatever the invoice's own
 * products say. Anything less isn't a scenario switcher: picking "complete" on
 * an invoice whose products have no DJP code used to leave the blocker up,
 * which reads as the toggle being broken.
 *
 * 'auto' is the unlisted default the app starts on: nothing forced, so the
 * invoice's own data decides (`canGenerateTaxDocument`) exactly as it did
 * before this toggle existed — a product genuinely missing its DJP code still
 * blocks, and classifying it on the product page still unblocks the invoice.
 * There's no way back to 'auto' from the popover; a reload returns to it.
 */

export type TaxInfoScenario =
  /** Nothing forced — the invoice's own data decides. The default. */
  | 'auto'
  /** Company's own PKP identity isn't validated → fix in Settings ▸ Company profile. */
  | 'company-missing'
  /** Buyer's NPWP/NITKU isn't validated → fix on the contact record. */
  | 'contact-missing'
  /** A line item's product has no DJP code/unit → fix on the product record. */
  | 'product-missing'
  /** Everything's in place → straight to the create form to pick a kode transaksi. */
  | 'complete'

/** The four the popover offers. 'auto' is deliberately not among them. */
export const TAX_INFO_SCENARIOS: { value: Exclude<TaxInfoScenario, 'auto'>; label: string }[] = [
  { value: 'company-missing', label: 'Company tax info missing' },
  { value: 'contact-missing', label: 'Contact tax info missing' },
  { value: 'product-missing', label: 'Product tax info missing' },
  { value: 'complete',        label: 'All tax info complete'    },
]

const scenario = ref<TaxInfoScenario>('auto')

export function useTaxInfoScenario() {
  function setTaxInfoScenario(next: TaxInfoScenario) {
    scenario.value = next
  }
  return { taxInfoScenario: scenario, setTaxInfoScenario }
}
