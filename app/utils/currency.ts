/**
 * ERP currency formatting — the single source of truth for how money renders.
 *
 * 🏆 GOLDEN RULE — money is `Rp4.000.000,00`:
 *   • NO space after the symbol   (id-ID `style:'currency'` injects an NBSP — never use it)
 *   • `.` thousands separator, `,` decimal separator  (id-ID grouping)
 *   • magnitude dictated by the "Amount display" setting (2 / 0 decimals or abbreviated)
 *   • negatives sign BEFORE the symbol → `-Rp4.000.000,00`
 *
 * Settings-driven via useCurrencySettings() — changing "Amount display" in
 * Company → Accounting settings updates every money display live, because the
 * template reads the reactive ref at render time.
 *
 *   formatIDR(4000000)   → "Rp4.000.000,00"   (with-decimals)
 *   formatIDR(4000000)   → "Rp4.000.000"      (without-decimals)
 *   formatIDR(2000000)   → "Rp2 jt"           (abbreviated)
 *   formatIDR(-4000000)  → "-Rp4.000.000,00"
 *
 * See docs/patterns/currency-format.md. Never hand-roll `Intl … style:'currency'`
 * in a component — call formatIDR (or formatMoney for multi-currency).
 */
import { useCurrencySettings } from "~/composables/useCurrencySettings";

/** Currency symbols for the multi-currency cash module (id-ID rendering). */
const CURRENCY_SYMBOLS: Record<string, string> = {
  IDR: "Rp",
  SGD: "SGD",
  USD: "US$",
  AUD: "AUS$",
};

/** id-ID magnitude abbreviations, largest first. */
const ABBREVIATION_TIERS = [
  { limit: 1e12, suffix: " T" }, // triliun
  { limit: 1e9, suffix: " M" }, // miliar
  { limit: 1e6, suffix: " jt" }, // juta
  { limit: 1e3, suffix: " rb" }, // ribu
];

/** Format the magnitude of `n` with id-ID grouping and the given decimals. */
function groupedDigits(n: number, decimals: number): string {
  const value = Number.isFinite(n) ? Math.abs(n) : 0;
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Abbreviated magnitude, id-ID style: `2 jt`, `1,5 jt`, `500 rb`, `2,5 M`.
 * 1 decimal max (comma separator, trailing `,0` trimmed); values < 1000 stay plain.
 */
function abbreviatedDigits(n: number): string {
  const value = Number.isFinite(n) ? Math.abs(n) : 0;
  for (const { limit, suffix } of ABBREVIATION_TIERS) {
    if (value >= limit) {
      const scaled = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value / limit);
      return `${scaled}${suffix}`;
    }
  }
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}

/** The settings-driven magnitude string for `n` (no symbol, no sign). */
function magnitudeForSetting(n: number): string {
  const { amountDisplay } = useCurrencySettings();
  const mode = amountDisplay.value;
  if (mode === "abbreviated") return abbreviatedDigits(n);
  return groupedDigits(n, mode === "without-decimals" ? 0 : 2);
}

/**
 * Format an IDR amount as `Rp4.000.000,00` — no space, settings-driven magnitude
 * (with/without decimals or abbreviated), sign before the symbol for negatives.
 */
export function formatIDR(amount: number): string {
  const { currencySymbol } = useCurrencySettings();
  const sign = Number.isFinite(amount) && amount < 0 ? "-" : "";
  return `${sign}${currencySymbol.value}${magnitudeForSetting(amount)}`;
}

/**
 * Format a multi-currency amount (cash module: IDR / SGD / USD) as
 * `Rp15.000.000,00` / `SGD6.000,00` — no space after the symbol, with negatives
 * in accounting parentheses `(Rp32.000.000,00)`. Magnitude follows the setting
 * (with/without decimals or abbreviated, e.g. `Rp15 jt`).
 */
export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const text = `${symbol}${magnitudeForSetting(amount)}`;
  return Number.isFinite(amount) && amount < 0 ? `(${text})` : text;
}
