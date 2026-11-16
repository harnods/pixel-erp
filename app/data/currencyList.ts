import { reactive } from 'vue'

/**
 * Settings › Currencies — the company's currency list (quickbook
 * `multi_currency`). Every list is one foreign currency against the base
 * currency (IDR), with a rate provider and a dated rate history. The index
 * shows, per currency, the latest rate on or before the selected date.
 *
 *   Base to Rate  = 1 IDR expressed in the foreign currency
 *   Rate to Base  = 1 unit of the foreign currency expressed in IDR
 */

export const BASE_CURRENCY = 'IDR'

export type CurrencyProviderName = 'Bank Indonesia' | 'Kurs Pajak' | 'Custom Rates'

/** Providers offered when adding a currency, with prod's tooltip copy. */
export const CURRENCY_PROVIDERS: { name: CurrencyProviderName; tooltip: string }[] = [
  { name: 'Bank Indonesia', tooltip: 'Bank Indonesia updates its exchange rate on working days.' },
  { name: 'Kurs Pajak', tooltip: 'Kementerian Keuangan updates Kurs Pajak every Wednesday and it applies for a week.' },
  { name: 'Custom Rates', tooltip: 'Custom exchange rate can be filled in based on your needs and must be updated manually.' },
]

export interface CurrencyRate {
  /** ISO date the rate applies from. */
  date: string
  /** 1 unit of the foreign currency in IDR. */
  rateToBase: number
  provider: CurrencyProviderName
  /** Set when a user overrides the provider's rate. */
  editedBy?: string
}

/** Prod's description column: "rate by: <provider>[ edited by: <user>]". */
export function rateDescription(r: CurrencyRate | null, list: CurrencyListItem): string {
  const base = `rate by: ${(r?.provider ?? list.provider)}`
  return r?.editedBy ? `${base} edited by: ${r.editedBy}` : base
}

export interface CurrencyListItem {
  id: string
  code: string
  country: string
  symbol: string
  provider: CurrencyProviderName
  rates: CurrencyRate[]
}

/** Currencies a company can add (code-country, as prod's select lists them). */
export const AVAILABLE_CURRENCIES: { code: string; country: string; symbol: string; rateToBase: number }[] = [
  { code: 'USD', country: 'United States', symbol: '$', rateToBase: 16_245 },
  { code: 'SGD', country: 'Singapore', symbol: 'S$', rateToBase: 12_580.42 },
  { code: 'EUR', country: 'European Union', symbol: '€', rateToBase: 17_802.15 },
  { code: 'JPY', country: 'Japan', symbol: '¥', rateToBase: 108.37 },
  { code: 'AUD', country: 'Australia', symbol: 'A$', rateToBase: 10_612.9 },
  { code: 'CNY', country: 'China', symbol: '¥', rateToBase: 2_281.6 },
  { code: 'MYR', country: 'Malaysia', symbol: 'RM', rateToBase: 3_642.11 },
  { code: 'GBP', country: 'United Kingdom', symbol: '£', rateToBase: 21_090.5 },
  { code: 'HKD', country: 'Hong Kong', symbol: 'HK$', rateToBase: 2_088.75 },
  { code: 'KRW', country: 'South Korea', symbol: '₩', rateToBase: 11.82 },
]

function hist(base: number, provider: CurrencyProviderName, dates: string[]): CurrencyRate[] {
  // Small day-to-day drift so the date filter visibly changes the figures.
  return dates.map((date, i) => ({ date, rateToBase: Math.round(base * (1 - i * 0.0021) * 100) / 100, provider }))
}

// Bank Indonesia publishes on working days (SIM today 2026-08-22 is a Saturday).
const RECENT = ['2026-08-21', '2026-08-20', '2026-08-19', '2026-08-18', '2026-08-17']

export const currencyLists = reactive<CurrencyListItem[]>([
  { id: 'CL001', code: 'USD', country: 'United States', symbol: '$', provider: 'Bank Indonesia', rates: hist(16_245, 'Bank Indonesia', RECENT) },
  { id: 'CL002', code: 'SGD', country: 'Singapore', symbol: 'S$', provider: 'Bank Indonesia', rates: hist(12_580.42, 'Bank Indonesia', RECENT) },
  { id: 'CL003', code: 'EUR', country: 'European Union', symbol: '€', provider: 'Kurs Pajak', rates: hist(17_802.15, 'Kurs Pajak', ['2026-08-19', '2026-08-12', '2026-08-05']) },
  { id: 'CL004', code: 'JPY', country: 'Japan', symbol: '¥', provider: 'Bank Indonesia', rates: hist(108.37, 'Bank Indonesia', RECENT) },
  { id: 'CL005', code: 'AUD', country: 'Australia', symbol: 'A$', provider: 'Custom Rates', rates: [{ date: '2026-08-03', rateToBase: 10_500, provider: 'Custom Rates' }] },
  // Worst case: added today, provider has not published yet → no rate on any date.
  { id: 'CL006', code: 'CNY', country: 'China', symbol: '¥', provider: 'Bank Indonesia', rates: [] },
])

/** Latest rate on or before `isoDate` (null = Exchange rate unavailable). */
export function rateOn(list: CurrencyListItem, isoDate: string): CurrencyRate | null {
  const eligible = list.rates.filter((r) => r.date <= isoDate).sort((a, b) => (a.date < b.date ? 1 : -1))
  return eligible[0] ?? null
}

/** Set (or replace) the rate for a date. */
export function setRate(list: CurrencyListItem, rate: CurrencyRate): void {
  const i = list.rates.findIndex((r) => r.date === rate.date)
  if (i >= 0) list.rates.splice(i, 1, rate)
  else list.rates.push(rate)
}

let seq = currencyLists.length
export function addCurrencyList(code: string, provider: CurrencyProviderName, isoDate: string): CurrencyListItem | null {
  const src = AVAILABLE_CURRENCIES.find((c) => c.code === code)
  if (!src || currencyLists.some((c) => c.code === code)) return null
  seq += 1
  const item: CurrencyListItem = {
    id: `CL${String(seq).padStart(3, '0')}`,
    code: src.code, country: src.country, symbol: src.symbol, provider,
    // Custom rates start empty until the user fills one in.
    rates: provider === 'Custom Rates' ? [] : [{ date: isoDate, rateToBase: src.rateToBase, provider }],
  }
  currencyLists.push(item)
  return item
}
