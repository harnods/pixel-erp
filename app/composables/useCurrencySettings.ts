/**
 * useCurrencySettings — how money is displayed app-wide.
 *
 * Driven by Company → Accounting settings ("Amount display", "Base currency").
 * A module-level ref makes it a shared singleton so every money display reacts
 * live when the setting changes. Persisted to localStorage so the choice
 * survives a refresh (this is an SPA — ssr:false). Same pattern as useScenario.
 *
 *   amountDisplay 'with-decimals'    → 2 decimals   Rp4.000.000,00
 *   amountDisplay 'without-decimals' → 0 decimals   Rp4.000.000
 *   amountDisplay 'abbreviated'      → id-ID short   Rp2 jt
 *
 * `formatIDR` (app/utils/currency.ts) reads this ref to render money.
 */
import { ref } from "vue";

export type AmountDisplay = "with-decimals" | "without-decimals" | "abbreviated";
export type CurrencySymbol = "Rp";

const AMOUNT_DISPLAYS: AmountDisplay[] = ["with-decimals", "without-decimals", "abbreviated"];

const STORAGE_KEY_DISPLAY = "erp-amount-display";
const STORAGE_KEY_SYMBOL = "erp-currency-symbol";

const amountDisplay = ref<AmountDisplay>("with-decimals");
const currencySymbol = ref<CurrencySymbol>("Rp");
let hydrated = false;

export function useCurrencySettings() {
  // Restore the saved settings once, on the client.
  if (!hydrated && import.meta.client) {
    const savedDisplay = localStorage.getItem(STORAGE_KEY_DISPLAY) as AmountDisplay | null;
    if (savedDisplay && AMOUNT_DISPLAYS.includes(savedDisplay)) {
      amountDisplay.value = savedDisplay;
    }
    const savedSymbol = localStorage.getItem(STORAGE_KEY_SYMBOL) as CurrencySymbol | null;
    if (savedSymbol) currencySymbol.value = savedSymbol;
    hydrated = true;
  }

  function setAmountDisplay(value: AmountDisplay) {
    amountDisplay.value = value;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY_DISPLAY, value);
  }

  function setCurrencySymbol(value: CurrencySymbol) {
    currencySymbol.value = value;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY_SYMBOL, value);
  }

  return { amountDisplay, currencySymbol, setAmountDisplay, setCurrencySymbol };
}
