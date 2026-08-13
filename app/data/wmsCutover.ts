/**
 * WMS → ERP cutover (Settings → Data migration).
 *
 * Mock data for the net-new screens in the cutover flow:
 *   1. "Set up WMS products"    — WmsCutoverProductsPage.vue
 *   2. "Opening balance"        — WmsCutoverOpeningBalancePage.vue
 *
 * PRD: "WMS Conversion Balance Setup" (Confluence PD/51260326215).
 *
 * ⚠ The opening balance is COMPUTED, not pulled. Per FR5 and assumption A4,
 * WMS tracks quantity only and never supplies a monetary figure — the account
 * total is the sum of each product's user-entered Inventory Value, grouped by
 * its mapped inventory account. There is no WMS valuation API to call, so
 * there is no network fetch and no fetch-failure state anywhere in this flow.
 *
 * Money is stored as a plain number of rupiah; pages format it with
 * Intl.NumberFormat('id-ID', …) per DESIGN.md → Number format (IDR).
 */

import { reactive } from 'vue'
import { productIndexRows } from './productsIndex'

// ── Chart of accounts ────────────────────────────────────────────────────────

/**
 * Which slot a product mapping can route to. Products only ever pick from three
 * of these (inventory / revenue / cogs); 'other' rounds out the chart so an
 * imported "own" COA looks like a real one and the Opening balance step has the
 * usual equity/asset/liability accounts to sit alongside inventory.
 */
export type AccountType = 'inventory' | 'revenue' | 'cogs' | 'other'

export interface CoaAccount {
  code: string
  name: string
  type?: AccountType
}

/** Convenience label for a select trigger / option: "1-10200 Inventory – Raw Material". */
export function accountLabel(a: CoaAccount): string {
  return `${a.code} ${a.name}`
}

// ── Chart-of-accounts SOURCE (Step 1 of the cutover) ─────────────────────────
//
// On upgrade the customer either adopts ERP's default chart, or imports their
// own (accounts only — opening balances are entered later, in Step 3). Either
// way the choice populates one live `coaAccounts` list; the product-mapping
// dropdowns and the opening balance both read from it. The inventory codes are
// kept identical across both sources so the downstream opening-balance math
// (which is keyed by inventory account code) holds regardless of the choice.

export type CoaSource = 'default' | 'own'

/** ERP's built-in chart of accounts (real default, from Figma "Chart of Accounts"). */
export const DEFAULT_COA: CoaAccount[] = [
  { code: '1-10001', name: 'Cash',                                             type: 'other' },
  { code: '1-10002', name: 'Petty Cash',                                       type: 'other' },
  { code: '1-10003', name: 'GIRO',                                             type: 'other' },
  { code: '1-10004', name: 'Bank BCA',                                         type: 'other' },
  { code: '1-10005', name: 'DBS Singapore',                                    type: 'other' },
  { code: '1-10100', name: 'Account Receivable',                               type: 'other' },
  { code: '1-10101', name: 'Unbilled Accounts Receivable',                     type: 'other' },
  { code: '1-10102', name: 'Doubtful Receivable',                              type: 'other' },
  { code: '1-10200', name: 'Inventory',                                        type: 'inventory' },
  { code: '1-10300', name: 'Others Receivables',                               type: 'other' },
  { code: '1-10301', name: 'Employee Receivables',                             type: 'other' },
  { code: '1-10400', name: 'Undeposited Funds',                                type: 'other' },
  { code: '1-10401', name: 'Other Current Assets',                             type: 'other' },
  { code: '1-10402', name: 'Prepaid Expenses',                                 type: 'other' },
  { code: '1-10403', name: 'Advances',                                         type: 'other' },
  { code: '1-10500', name: 'VAT In',                                           type: 'other' },
  { code: '1-10501', name: 'Prepaid Income Tax - PPh 22',                      type: 'other' },
  { code: '1-10502', name: 'Prepaid Income Tax - PPh 23',                      type: 'other' },
  { code: '1-10503', name: 'Prepaid Income Tax - PPh 25',                      type: 'other' },
  { code: '1-10700', name: 'Fixed Assets - Land',                              type: 'other' },
  { code: '1-10701', name: 'Fixed Assets - Building',                          type: 'other' },
  { code: '1-10702', name: 'Fixed Assets - Building Improvements',             type: 'other' },
  { code: '1-10703', name: 'Fixed Assets - Vehicles',                          type: 'other' },
  { code: '1-10704', name: 'Fixed Assets - Machinery & Equipment',             type: 'other' },
  { code: '1-10705', name: 'Fixed Assets - Office Equipment',                  type: 'other' },
  { code: '1-10706', name: 'Fixed Assets - Leased Asset',                      type: 'other' },
  { code: '1-10707', name: 'Intangible Assets',                                type: 'other' },
  { code: '1-10751', name: 'Accumulated Depreciation - Building',              type: 'other' },
  { code: '1-10752', name: 'Accumulated Depreciation - Building Improvements', type: 'other' },
  { code: '1-10753', name: 'Accumulated Depreciation - Vehicles',                      type: 'other' },
  { code: '1-10754', name: 'Accumulated Depreciation - Machinery & Equipment',                      type: 'other' },
  { code: '1-10755', name: 'Accumulated Depreciation - Office Equipment',                      type: 'other' },
  { code: '1-10756', name: 'Accumulated Depreciation - Leased Asset',                      type: 'other' },
  { code: '1-10757', name: 'Accumulated Amortization',                         type: 'other' },
  { code: '1-10800', name: 'Investments',                                      type: 'other' },
  { code: '2-20100', name: 'Trade Payable',                                    type: 'other' },
  { code: '2-20101', name: 'Unbilled Accounts Payable',                        type: 'other' },
  { code: '2-20200', name: 'Other Payables',                                   type: 'other' },
  { code: '2-20201', name: 'Salaries Payable',                                 type: 'other' },
  { code: '2-20202', name: 'Dividends Payable',                                type: 'other' },
  { code: '2-20203', name: 'Unearned Revenue',                                 type: 'other' },
  { code: '2-20205', name: 'Consignor Account',                                type: 'other' },
  { code: '2-20301', name: 'Accrued Utilities',                                type: 'other' },
  { code: '2-20302', name: 'Accrued Interest',                                 type: 'other' },
  { code: '2-20399', name: 'Other Accrued Expenses',                           type: 'other' },
  { code: '2-20400', name: 'Bank Loans',                                       type: 'other' },
  { code: '2-20500', name: 'VAT Out',                                          type: 'other' },
  { code: '2-20501', name: 'Tax Payable - PPh 21',                             type: 'other' },
  { code: '2-20502', name: 'Tax Payable - PPh 22',                             type: 'other' },
  { code: '2-20503', name: 'Tax Payable - PPh 23',                             type: 'other' },
  { code: '2-20504', name: 'Tax Payable - PPh 29',                             type: 'other' },
  { code: '2-20599', name: 'Other Taxes Payable',                              type: 'other' },
  { code: '2-20600', name: 'Loan From Shareholders',                           type: 'other' },
  { code: '2-20601', name: 'Other Current Liabilities',                        type: 'other' },
  { code: '2-20700', name: 'Employee Benefit Liabilities',                     type: 'other' },
  { code: '3-30000', name: 'Paid In Capital',                                  type: 'other' },
  { code: '3-30001', name: 'Additional Paid In Capital',                       type: 'other' },
  { code: '3-30100', name: 'Retained Earnings',                                type: 'other' },
  { code: '3-30200', name: 'Dividends',                                        type: 'other' },
  { code: '3-30300', name: 'Other Comprehensive Income',                       type: 'other' },
  { code: '3-30999', name: 'Opening Balance Equity',                           type: 'other' },
  { code: '4-40000', name: 'Revenues',                                         type: 'revenue' },
  { code: '4-40100', name: 'Sales Discount',                                   type: 'revenue' },
  { code: '4-40200', name: 'Sales Return',                                     type: 'revenue' },
  { code: '4-40201', name: 'Unbilled Revenues',                                type: 'revenue' },
  { code: '5-50000', name: 'Cost of Sales',                                    type: 'cogs' },
  { code: '5-50100', name: 'Purchase Discounts',                               type: 'cogs' },
  { code: '5-50200', name: 'Purchase Returns',                                 type: 'cogs' },
  { code: '5-50300', name: 'Shipping/Freight & Delivery',                      type: 'cogs' },
  { code: '5-50400', name: 'Import Charges',                                   type: 'cogs' },
  { code: '5-50500', name: 'Cost of Production',                               type: 'cogs' },
  { code: '6-60000', name: 'Selling Expenses',                                 type: 'other' },
  { code: '6-60100', name: 'General & Administrative Expenses',                type: 'other' },
  { code: '7-70000', name: 'Interest Income - Bank',                           type: 'other' },
  { code: '7-70001', name: 'Interest Income - Time Deposit',                   type: 'other' },
  { code: '7-70002', name: 'Commission Income From Consignor',                 type: 'other' },
  { code: '7-70003', name: 'Rounding',                                         type: 'other' },
  { code: '7-70099', name: 'Other Income',                                     type: 'other' },
  { code: '8-80000', name: 'Interest Expense',                                 type: 'other' },
  { code: '8-80001', name: 'Provision',                                        type: 'other' },
  { code: '8-80002', name: '(Gain)/Loss On Disposal of Fixed Assets',          type: 'other' },
  { code: '8-80100', name: 'Inventory Adjustments',                            type: 'other' },
  { code: '8-80999', name: 'Other Miscellaneous Expense',                      type: 'other' },
  { code: '9-90000', name: 'Income Taxes - Current',                           type: 'other' },
  { code: '9-90001', name: 'Income Taxes - Deferred',                          type: 'other' },
]

/**
 * A plausible "own" chart the customer would import: the same inventory /
 * revenue / cogs codes ERP expects (so mappings and the opening balance still
 * resolve), renamed to their house style, plus a fuller set of their own
 * asset/liability/equity accounts. Stands in for a parsed upload file.
 */
export const OWN_COA_SAMPLE: CoaAccount[] = [
  { code: '1-10200', name: 'Persediaan – Bahan Baku',     type: 'inventory' },
  { code: '1-10201', name: 'Persediaan – Barang Proses',  type: 'inventory' },
  { code: '1-10202', name: 'Persediaan – Barang Jadi',    type: 'inventory' },
  { code: '1-10203', name: 'Persediaan – Kemasan',        type: 'inventory' },
  { code: '1-10204', name: 'Persediaan – Consumable',     type: 'inventory' },
  { code: '1-10299', name: 'Kliring Retur & Sampel',      type: 'inventory' },
  { code: '4-40000', name: 'Pendapatan Penjualan',        type: 'revenue' },
  { code: '4-40001', name: 'Retur Penjualan',             type: 'revenue' },
  { code: '4-40100', name: 'Pendapatan Lain-lain',        type: 'revenue' },
  { code: '5-20001', name: 'Harga Pokok Penjualan',       type: 'cogs' },
  { code: '5-20002', name: 'HPP – Impor',                 type: 'cogs' },
  { code: '5-20099', name: 'Penyesuaian Persediaan',      type: 'cogs' },
  { code: '1-10000', name: 'Kas',                         type: 'other' },
  { code: '1-10001', name: 'Bank BCA',                    type: 'other' },
  { code: '1-10002', name: 'Bank Mandiri',                type: 'other' },
  { code: '1-10300', name: 'Piutang Usaha',               type: 'other' },
  { code: '1-10400', name: 'Uang Muka Pembelian',         type: 'other' },
  { code: '2-20100', name: 'Utang Usaha',                 type: 'other' },
  { code: '2-20200', name: 'PPN Keluaran',                type: 'other' },
  { code: '2-20201', name: 'PPN Masukan',                 type: 'other' },
  { code: '3-30000', name: 'Modal Disetor',               type: 'other' },
  { code: '1-30099', name: 'Ekuitas Saldo Awal',          type: 'other' },
]

/** The live chart in effect, and the three type-filtered lists the mapping reads. */
export const coaAccounts = reactive<CoaAccount[]>([])
export const inventoryAccounts = reactive<CoaAccount[]>([])
export const revenueAccounts = reactive<CoaAccount[]>([])
export const cogsAccounts = reactive<CoaAccount[]>([])

function replaceAll(target: CoaAccount[], next: CoaAccount[]) {
  target.splice(0, target.length, ...next)
}

/** Swap the live chart to `list` and refresh the type-filtered mapping lists. */
function applyCoa(list: CoaAccount[]) {
  replaceAll(coaAccounts, list)
  replaceAll(inventoryAccounts, list.filter((a) => a.type === 'inventory'))
  replaceAll(revenueAccounts, list.filter((a) => a.type === 'revenue'))
  replaceAll(cogsAccounts, list.filter((a) => a.type === 'cogs'))
}

// Seed the default chart on load so the lists are never empty (preserves the
// products page for a direct visit); the chosen source is tracked separately.
applyCoa(DEFAULT_COA)

export interface CoaSourceState {
  /** null until the customer picks a source — this is the Step 1 completion gate. */
  source: CoaSource | null
  /** Accounts brought in by the "own" import (mirrors coaAccounts once chosen). */
  importedCount: number
}

export const coaSourceState = reactive<CoaSourceState>({
  source: null,
  importedCount: 0,
})

/** Adopt ERP's default chart (the fast path). */
export function useDefaultCoa() {
  applyCoa(DEFAULT_COA)
  coaSourceState.source = 'default'
  coaSourceState.importedCount = 0
}

/** Adopt an imported "own" chart (accounts only). `list` stands in for the parsed file. */
export function importOwnCoa(list: CoaAccount[] = OWN_COA_SAMPLE) {
  applyCoa(list)
  coaSourceState.source = 'own'
  coaSourceState.importedCount = list.length
}

export const taxOptions: string[] = ['PPN 11%', 'Non-PPN', 'Bebas PPN (Exempt)']

// ── Products that need individual set-up ─────────────────────────────────────

export interface CutoverProduct {
  id: string
  name: string
  sku: string
  /** Product thumbnail from the inventory DB (row.img). */
  img: string
  /**
   * The specific row-level import validation failure (NFR6, FR13, Story 2 AC:
   * "a specific reason per row", never a generic failure state).
   */
  reason: string
  /** Account code, '' = not chosen yet. Stays editable — never locked. */
  inventoryAccount: string
  /** Rupiah. null = not filled in. */
  inventoryValue: number | null
  isSold: boolean
  sellPrice: number | null
  revenueAccount: string
  sellTax: string
  isBought: boolean
  buyPrice: number | null
  cogsAccount: string
  buyTax: string
  /**
   * On-hand quantity at the conversion date, supplied by WMS. A4 bars WMS from
   * supplying *value*, not quantity — so this is the divisor that turns the
   * user's Inventory Value total into a per-unit cost basis. See seedCostBasis.
   */
  onHandQty: number
}

// The cutover catalogue IS the real inventory product list (mini-DB), so the
// SKUs match what's in Inventory — nothing is invented here. Every row starts
// BLANK: no account, empty inventory value, sell/buy unchecked, no tax. The
// on-hand quantity comes from the DB and is kept only to derive the cost basis
// on publish (it isn't shown as a column). Mapping is filled by the import (or
// by hand). The DB's cost/price are stashed in `cutoverMeta` for the import.
interface CutoverMeta { avgCost: number; salesPrice: number; purchaseCost: number }
const cutoverMeta = new Map<string, CutoverMeta>()

function buildCutoverProducts(): CutoverProduct[] {
  return productIndexRows().map((row) => {
    cutoverMeta.set(row.id, {
      avgCost: row.averageCost,
      salesPrice: row.defaultSalesPrice,
      purchaseCost: row.defaultPurchaseCost,
    })
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      img: row.img,
      reason: '',
      inventoryAccount: '',
      inventoryValue: null,
      isSold: false,
      sellPrice: null,
      revenueAccount: '',
      sellTax: '',
      isBought: false,
      buyPrice: null,
      cogsAccount: '',
      buyTax: '',
      onHandQty: row.onHand,
    }
  })
}

export const cutoverProducts = reactive<CutoverProduct[]>(buildCutoverProducts())

/** Total WMS products in scope for the cutover — the real inventory catalogue. */
export const CUTOVER_TOTAL_PRODUCTS = cutoverProducts.length

// A few real SKUs the upload leaves unresolved, each with a specific reason.
const IMPORT_REASONS = [
  'Inventory account missing in the uploaded file',
  'Account code not found in the chart of accounts',
  'Inventory value missing in the uploaded file',
]

/**
 * Simulates the spreadsheet upload: fills every still-incomplete product with a
 * valid mapping + value drawn from the inventory DB, EXCEPT a deterministic few
 * the import "could not resolve" — those stay blank with a reason for the user
 * to fix by hand. Returns how many were imported vs left over.
 */
export function applyBulkImport(): { imported: number; skipped: number } {
  const rev = revenueAccounts[0]?.code ?? ''
  const cogs = cogsAccounts[0]?.code ?? ''
  const flagged = new Set(cutoverProducts.filter((_, i) => i % 40 === 7).slice(0, 3).map((p) => p.id))
  let imported = 0
  let flagIdx = 0
  cutoverProducts.forEach((p, i) => {
    if (isCutoverProductComplete(p)) return
    if (flagged.has(p.id)) {
      p.reason = IMPORT_REASONS[flagIdx % IMPORT_REASONS.length]!
      flagIdx++
      return
    }
    const meta = cutoverMeta.get(p.id)
    p.inventoryAccount = inventoryAccounts[i % Math.max(1, inventoryAccounts.length)]?.code ?? ''
    p.inventoryValue = Math.round(p.onHandQty * (meta?.avgCost ?? 0))
    if ((meta?.salesPrice ?? 0) > 0) { p.isSold = true; p.sellPrice = meta!.salesPrice; p.revenueAccount = rev; p.sellTax = 'PPN 11%' }
    if ((meta?.purchaseCost ?? 0) > 0) { p.isBought = true; p.buyPrice = meta!.purchaseCost; p.cogsAccount = cogs; p.buyTax = 'PPN 11%' }
    p.reason = ''
    imported++
  })
  const skipped = cutoverProducts.filter((p) => !isCutoverProductComplete(p)).length
  return { imported, skipped }
}

/**
 * A product is set up when the always-required fields are filled, plus the
 * sell group (if it sells) and the buy group (if it is bought). Fields in a
 * group that is switched off are not applicable and are not required.
 */
export function isCutoverProductComplete(p: CutoverProduct): boolean {
  if (!p.inventoryAccount) return false
  if (p.inventoryValue === null) return false
  // When sold/bought, only the routing ACCOUNT is mandatory — the default
  // price and tax are optional pre-fills.
  if (p.isSold && !p.revenueAccount) return false
  if (p.isBought && !p.cogsAccount) return false
  return true
}

/** The specific fields still missing on a row — drives the cell error state. */
export function missingCutoverFields(p: CutoverProduct): string[] {
  const missing: string[] = []
  if (!p.inventoryAccount) missing.push('inventoryAccount')
  if (p.inventoryValue === null) missing.push('inventoryValue')
  if (p.isSold && !p.revenueAccount) missing.push('revenueAccount')
  if (p.isBought && !p.cogsAccount) missing.push('cogsAccount')
  return missing
}

// ── Cutover run state (shared between the two pages) ─────────────────────────

export interface CutoverState {
  /**
   * ERP's existing "Tanggal Konversi" field, reused as-is (FR4 — no new date
   * input is introduced). The opening balance is computed as of this date.
   */
  conversionDate: string
  /** Set once the opening balance is published — the final step's completion. */
  published: boolean
}

export const cutoverState = reactive<CutoverState>({
  conversionDate: '2026-01-01',
  published: false,
})

// ── Guided stepper: the three steps and where the user should resume ─────────

export type CutoverStep = 'chart-of-accounts' | 'products' | 'opening-balance'

export const CUTOVER_STEPS: { key: CutoverStep; label: string }[] = [
  { key: 'chart-of-accounts', label: 'Chart of accounts' },
  { key: 'products',          label: 'Map products' },
  { key: 'opening-balance',   label: 'Opening balance' },
]

/** Step 1 is done once a COA source has been chosen (default adopted or own imported). */
export function isCoaStepComplete(): boolean {
  return coaSourceState.source !== null
}

/** Step 2 is done once every product is set up (Story 1's 100% gate). */
export function isProductsStepComplete(): boolean {
  return cutoverSetUpCount() >= CUTOVER_TOTAL_PRODUCTS
}

/** Step 3 is done once the opening balance is published. */
export function isOpeningBalanceComplete(): boolean {
  return cutoverState.published
}

export function isCutoverStepComplete(step: CutoverStep): boolean {
  if (step === 'chart-of-accounts') return isCoaStepComplete()
  if (step === 'products') return isProductsStepComplete()
  return isOpeningBalanceComplete()
}

/** The earliest step still incomplete — where "Start / Continue setup" lands. */
export function furthestCutoverStep(): CutoverStep {
  if (!isCoaStepComplete()) return 'chart-of-accounts'
  if (!isProductsStepComplete()) return 'products'
  return 'opening-balance'
}

/**
 * The opening balance is dated the day BEFORE the conversion date — ERP's
 * existing saldo awal convention, which already reads "your opening balance as
 * per 31/12/2025" for a 01/01/2026 conversion date. FR4 reuses the existing
 * date field, so this reuses its existing semantics too (FR5 amended).
 */
export function openingBalanceDate(conversionDateIso: string): Date {
  const d = new Date(conversionDateIso)
  d.setDate(d.getDate() - 1)
  return d
}

/** Products fully set up — every complete row across the whole catalogue. */
export function cutoverSetUpCount(): number {
  return cutoverProducts.filter(isCutoverProductComplete).length
}

// ── Computed opening balance (FR5 / FR6) ────────────────────────────────────

export interface OpeningBalanceLine {
  accountCode: string
  accountName: string
  /** Sum of Inventory Value across every product mapped to this account. */
  debit: number
  /** How many individually set-up products contribute to this line. */
  productCount: number
}

/** The plug account the existing saldo awal flow already uses (FR6). */
export const EKUITAS_SALDO_AWAL: CoaAccount = {
  code: '3-30999',
  name: 'Opening Balance Equity',
}

/**
 * FR5 — per account, sum Inventory Value across all products mapped to it.
 * Only complete products contribute; an incomplete product has no value to add
 * and cannot reach the cutover anyway (Story 1's 100% gate).
 */
export function computeOpeningBalance(): OpeningBalanceLine[] {
  const totals = new Map<string, { debit: number; productCount: number }>()

  for (const p of cutoverProducts) {
    if (!p.inventoryAccount || p.inventoryValue === null) continue
    const entry = totals.get(p.inventoryAccount) ?? { debit: 0, productCount: 0 }
    entry.debit += p.inventoryValue
    entry.productCount += 1
    totals.set(p.inventoryAccount, entry)
  }

  return [...totals.entries()]
    .map(([code, { debit, productCount }]) => ({
      accountCode: code,
      accountName: inventoryAccounts.find((a) => a.code === code)?.name ?? code,
      debit,
      productCount,
    }))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
}

export function openingBalanceTotal(): number {
  return computeOpeningBalance().reduce((sum, l) => sum + l.debit, 0)
}

// ── Post-go-live exception queue (FR10 / FR12 / Story 9) ────────────────────

/**
 * A product created in WMS after go-live. WMS operations are never blocked by
 * ERP setup status (Story 9 locked decision) — stock moves freely — but the
 * resulting journal entries cannot post until the product has an account, so
 * they queue here instead of falling back to any default (FR10, OS3).
 */
export interface PendingSetupProduct {
  id: string
  name: string
  sku: string
  /** When the product first appeared in WMS. */
  discoveredAt: string
  /** Movements held because this product has no GL routing yet. */
  queuedMovements: number
  /** Combined quantity across the queued movements, from WMS. */
  queuedQty: number
  inventoryAccount: string
}

export const pendingSetupProducts = reactive<PendingSetupProduct[]>([
  { id: 'ps-1', name: 'Pallet wrap – heavy duty', sku: 'PLT-WRP-HD', discoveredAt: '2026-02-03', queuedMovements: 7, queuedQty: 240, inventoryAccount: '' },
  { id: 'ps-2', name: 'Label roll 100x150',       sku: 'LBL-100150', discoveredAt: '2026-02-05', queuedMovements: 3, queuedQty:  90, inventoryAccount: '' },
  { id: 'ps-3', name: 'Desiccant sachet 5g',      sku: 'DSC-SCH-5G', discoveredAt: '2026-02-11', queuedMovements: 12, queuedQty: 1_500, inventoryAccount: '' },
])

export function pendingMovementCount(): number {
  return pendingSetupProducts
    .filter((p) => !p.inventoryAccount)
    .reduce((sum, p) => sum + p.queuedMovements, 0)
}

export function pendingProductCount(): number {
  return pendingSetupProducts.filter((p) => !p.inventoryAccount).length
}

/** Releases the queued entries for every product that now has an account. */
export function postQueuedEntries(): number {
  const ready = pendingSetupProducts.filter((p) => p.inventoryAccount)
  const posted = ready.reduce((sum, p) => sum + p.queuedMovements, 0)
  for (let i = pendingSetupProducts.length - 1; i >= 0; i--) {
    if (pendingSetupProducts[i]!.inventoryAccount) pendingSetupProducts.splice(i, 1)
  }
  return posted
}

// ── Cost basis (OQ10 / Risk PR2 — resolved) ─────────────────────────────────

/**
 * Turns the user's Inventory Value lump total into the per-unit cost basis that
 * ERP's existing costing engine already runs on.
 *
 * ERP products already carry `averageCost` (app/data/productsIndex.ts) and ERP
 * already derives total inventory value as `onHand × averageCost`
 * (ProductsPage.vue) and values stock movements at `averageCost`
 * (StockCountingPage.vue, StockAdjustmentDetailsPage.vue). So the cutover does
 * not need a new valuation model — it needs to seed an existing field.
 *
 * Why this closes PR2: after seeding, a product's inventory value is DERIVED
 * (`WMS quantity × averageCost`) rather than remembered. A WMS movement changes
 * quantity, the value follows automatically, and there is nothing left to go
 * stale — so no reconfirmation prompt or drift threshold is required.
 *
 * Story 4's locked decision ("a total, not a per-unit cost") governs what the
 * user TYPES, which is unchanged. This is a derivation, not a new input.
 */
export function costBasisFor(p: CutoverProduct): number | null {
  if (p.inventoryValue === null || p.onHandQty <= 0) return null
  return p.inventoryValue / p.onHandQty
}

export interface SeededCostBasis {
  sku: string
  name: string
  inventoryValue: number
  onHandQty: number
  averageCost: number
}

/** What the cutover would write to each product's `averageCost` on publish. */
export function seedCostBasis(): SeededCostBasis[] {
  return cutoverProducts
    .filter((p) => isCutoverProductComplete(p) && p.onHandQty > 0)
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      inventoryValue: p.inventoryValue!,
      onHandQty: p.onHandQty,
      averageCost: p.inventoryValue! / p.onHandQty,
    }))
}
