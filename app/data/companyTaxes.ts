import { reactive } from 'vue'

/**
 * Settings › Tax rates — the company's tax list (quickbook `company_taxes`).
 *
 * A tax is either SINGLE (its own rate + sell/buy tax accounts) or a GROUP
 * composed of single taxes, where each child can be compounded (applied to the
 * total after the previous taxes). A group's effective rate is derived from its
 * children, never stored.
 *
 * Distinct from `wmsCutover.taxRates`, which is the lean name-keyed list the
 * WMS cutover product table picks from.
 */

export type TaxKind = 'single' | 'group'

export interface CompanyTaxChild {
  taxId: string
  compounded: boolean
}

export interface CompanyTax {
  id: string
  kind: TaxKind
  name: string
  /** Percent. Single taxes only (a group's rate is derived — see effectiveRate). */
  rate: number
  /** 11/12 multiplier for DPP (PMK-131/2024, DPP Nilai Lain). Single only. */
  otherDpp: boolean
  /** Deducts from the payment instead of adding to it (e.g. PPh 23). Single only. */
  isWithholding: boolean
  /** Sell tax account label (code + name), '' = none. */
  sellAccount: string
  /** Buy tax account label (code + name), '' = none. */
  buyAccount: string
  /** Group only — ordered children. */
  children: CompanyTaxChild[]
}

/** Liability accounts offered as the Sell tax account. */
export const SELL_TAX_ACCOUNT_OPTIONS = [
  '2-20500 VAT Out',
  '2-20501 Tax Payable - PPh 21',
  '2-20502 Tax Payable - PPh 22',
  '2-20503 Tax Payable - PPh 23',
  '2-20504 Tax Payable - PPh 29',
]

/** Asset accounts offered as the Buy tax account. */
export const BUY_TAX_ACCOUNT_OPTIONS = [
  '1-10500 VAT In',
  '1-10501 Prepaid Income Tax - PPh 22',
  '1-10502 Prepaid Income Tax - PPh 23',
  '1-10503 Prepaid Income Tax - PPh 25',
]

function single(id: string, name: string, rate: number, sell: string, buy: string, extra: Partial<CompanyTax> = {}): CompanyTax {
  return { id, kind: 'single', name, rate, otherDpp: false, isWithholding: false, sellAccount: sell, buyAccount: buy, children: [], ...extra }
}

export const companyTaxes = reactive<CompanyTax[]>([
  single('TX001', 'PPN 11%', 11, '2-20500 VAT Out', '1-10500 VAT In'),
  single('TX002', 'PPN 12% (barang mewah)', 12, '2-20500 VAT Out', '1-10500 VAT In'),
  single('TX003', 'PPh 23', 2, '2-20503 Tax Payable - PPh 23', '1-10502 Prepaid Income Tax - PPh 23', { isWithholding: true }),
  single('TX004', 'PPh 22', 1.5, '2-20502 Tax Payable - PPh 22', '1-10501 Prepaid Income Tax - PPh 22', { isWithholding: true }),
  single('TX005', 'Non-PPN', 0, '', ''),
  single('TX006', 'PPN Dibebaskan untuk Penyerahan Barang Kebutuhan Pokok Tertentu', 0, '2-20500 VAT Out', '1-10500 VAT In'),
  {
    id: 'TX007', kind: 'group', name: 'PPN 11% + PPh 23', rate: 0, otherDpp: false, isWithholding: false,
    sellAccount: '', buyAccount: '',
    children: [{ taxId: 'TX001', compounded: false }, { taxId: 'TX003', compounded: false }],
  },
])

/** PPN 12% with the 11/12 DPP multiplier exists → the PPN 12% banner retires. */
export function hasPpn12(): boolean {
  return companyTaxes.some((t) => t.kind === 'single' && t.rate === 12 && t.otherDpp)
}

export function getCompanyTax(id: string): CompanyTax | undefined {
  return companyTaxes.find((t) => t.id === id)
}

/**
 * Effective rate. Single: its own rate. Group: children applied in order — a
 * plain child adds its rate on the base, a compounded child applies to the base
 * plus every tax before it. Withholding children subtract.
 */
export function effectiveRate(tax: CompanyTax): number {
  if (tax.kind === 'single') return tax.rate
  let running = 0
  for (const c of tax.children) {
    const child = getCompanyTax(c.taxId)
    if (!child) continue
    const sign = child.isWithholding ? -1 : 1
    const base = c.compounded ? 100 + running : 100
    running += sign * (base * child.rate) / 100
  }
  return Math.round(running * 10000) / 10000
}

/** Rate as prod prints it: no trailing zeros (11, 1.5, 0). */
export function formatRate(n: number): string {
  return String(Number(n.toFixed(4)))
}

let seq = companyTaxes.length
export function nextTaxId(): string {
  seq += 1
  return `TX${String(seq).padStart(3, '0')}`
}

export function isTaxNameUsed(name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase()
  return companyTaxes.some((t) => t.id !== exceptId && t.name.toLowerCase() === n)
}

/** A single tax that is a child of a group cannot be deleted. */
export function taxUsedInGroup(id: string): CompanyTax | undefined {
  return companyTaxes.find((t) => t.kind === 'group' && t.children.some((c) => c.taxId === id))
}
