import { reactive } from 'vue'

/**
 * Title-bar → page signals for the prod-parity settings pages (Tax rates,
 * Currencies, Custom fields, Contact groups). The shell's title bar
 * ([...slug].vue) bumps a counter; the page watches it and opens its own
 * create modal/drawer. Same mechanism as `courierAddSignal`, without a
 * provide/inject per page.
 */
const signals = reactive({
  newTax: 0,
  newCurrency: 0,
  newCustomField: 0,
  reorderCustomFields: 0,
  newContactGroup: 0,
})

export function useParityActions() {
  return signals
}
