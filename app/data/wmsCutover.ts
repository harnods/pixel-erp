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

// ── Chart-of-accounts options ────────────────────────────────────────────────

export interface CoaAccount {
  code: string
  name: string
}

/** Convenience label for a select trigger / option: "1-10200 Inventory – Raw Material". */
export function accountLabel(a: CoaAccount): string {
  return `${a.code} ${a.name}`
}

export const inventoryAccounts: CoaAccount[] = [
  { code: '1-10200', name: 'Inventory – Raw Material' },
  { code: '1-10201', name: 'Inventory – WIP' },
  { code: '1-10202', name: 'Inventory – Finished Goods' },
  { code: '1-10203', name: 'Inventory – Packaging' },
  { code: '1-10204', name: 'Inventory – Consumables' },
  { code: '1-10299', name: 'Returns & Samples Clearing' },
]

export const revenueAccounts: CoaAccount[] = [
  { code: '4-40000', name: 'Sales Revenue' },
  { code: '4-40001', name: 'Sales Revenue – Returns' },
  { code: '4-40100', name: 'Other Income' },
]

export const cogsAccounts: CoaAccount[] = [
  { code: '5-20001', name: 'Cost of Goods Sold' },
  { code: '5-20002', name: 'Cost of Goods Sold – Import' },
  { code: '5-20099', name: 'Inventory Adjustment' },
]

export const taxOptions: string[] = ['PPN 11%', 'Non-PPN', 'Bebas PPN (Exempt)']

// ── Products that need individual set-up ─────────────────────────────────────

export interface CutoverProduct {
  id: string
  name: string
  sku: string
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

/** Total WMS products in scope for the cutover (the bulk arrives via import). */
export const CUTOVER_TOTAL_PRODUCTS = 350

const SEED_CUTOVER_PRODUCTS: CutoverProduct[] = [
  {
    id: 'cp-1',
    name: 'Packaging box – large',
    sku: 'PKG-BOX-L',
    reason: 'Account code not found: "1-10250"',
    inventoryAccount: '',
    inventoryValue: 4_250_000,
    isSold: false,
    sellPrice: null,
    revenueAccount: '',
    sellTax: '',
    isBought: true,
    buyPrice: 6_200,
    cogsAccount: '5-20001',
    buyTax: 'PPN 11%',
    onHandQty: 500,
  },
  {
    id: 'cp-2',
    name: 'Cleaning solvent 5L',
    sku: 'CLN-SLV-5L',
    reason: 'Buy Price required when I Buy This Item = Yes',
    inventoryAccount: '',
    inventoryValue: 5_400_000,
    isSold: false,
    sellPrice: null,
    revenueAccount: '',
    sellTax: '',
    isBought: true,
    buyPrice: null,
    cogsAccount: '',
    buyTax: '',
    onHandQty: 180,
  },
  {
    id: 'cp-3',
    name: 'Return batch – Model X',
    sku: 'RET-MDLX',
    reason: 'Default Inventory Account Code is empty',
    inventoryAccount: '',
    inventoryValue: 4_800_000,
    isSold: true,
    sellPrice: 150_000,
    revenueAccount: '4-40000',
    sellTax: 'PPN 11%',
    isBought: false,
    buyPrice: null,
    cogsAccount: '',
    buyTax: '',
    onHandQty: 32,
  },
  {
    id: 'cp-4',
    name: 'QA sample unit',
    sku: 'QA-SMP-01',
    reason: '"5-20001" is not an Inventory-type account',
    inventoryAccount: '',
    inventoryValue: 780_000,
    isSold: false,
    sellPrice: null,
    revenueAccount: '',
    sellTax: '',
    isBought: true,
    buyPrice: 18_000,
    cogsAccount: '5-20001',
    buyTax: 'PPN 11%',
    onHandQty: 60,
  },
]

export const cutoverProducts = reactive<CutoverProduct[]>(
  SEED_CUTOVER_PRODUCTS.map((p) => ({ ...p })),
)

/**
 * A product is set up when the always-required fields are filled, plus the
 * sell group (if it sells) and the buy group (if it is bought). Fields in a
 * group that is switched off are not applicable and are not required.
 */
export function isCutoverProductComplete(p: CutoverProduct): boolean {
  if (!p.inventoryAccount) return false
  if (p.inventoryValue === null) return false
  if (p.isSold && (p.sellPrice === null || !p.revenueAccount || !p.sellTax)) return false
  if (p.isBought && (p.buyPrice === null || !p.cogsAccount || !p.buyTax)) return false
  return true
}

/** The specific fields still missing on a row — drives the cell error state. */
export function missingCutoverFields(p: CutoverProduct): string[] {
  const missing: string[] = []
  if (!p.inventoryAccount) missing.push('inventoryAccount')
  if (p.inventoryValue === null) missing.push('inventoryValue')
  if (p.isSold) {
    if (p.sellPrice === null) missing.push('sellPrice')
    if (!p.revenueAccount) missing.push('revenueAccount')
    if (!p.sellTax) missing.push('sellTax')
  }
  if (p.isBought) {
    if (p.buyPrice === null) missing.push('buyPrice')
    if (!p.cogsAccount) missing.push('cogsAccount')
    if (!p.buyTax) missing.push('buyTax')
  }
  return missing
}

// ── Cutover run state (shared between the two pages) ─────────────────────────

export interface CutoverState {
  /** Products covered by the bulk import so far. */
  importedCount: number
  /**
   * ERP's existing "Tanggal Konversi" field, reused as-is (FR4 — no new date
   * input is introduced). The opening balance is computed as of this date.
   */
  conversionDate: string
}

export const cutoverState = reactive<CutoverState>({
  importedCount: 0,
  conversionDate: '2026-01-01',
})

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

/** Products fully set up = the imported bulk + the individually completed rows. */
export function cutoverSetUpCount(): number {
  const individually = cutoverProducts.filter(isCutoverProductComplete).length
  return Math.min(CUTOVER_TOTAL_PRODUCTS, cutoverState.importedCount + individually)
}

// ── Computed opening balance (FR5 / FR6) ────────────────────────────────────

/**
 * Inventory Value contributed by the products that came in through the bulk
 * import, already grouped by their mapped inventory account. The individually
 * set-up products in `cutoverProducts` add to these totals as the user routes
 * them — which is the whole point: the account total is a live sum over
 * product setup, not a figure fetched from anywhere.
 */
export const importedValueByAccount: Record<string, number> = {
  '1-10200': 812_500_000,
  '1-10201': 245_000_000,
  '1-10202': 390_750_000,
  '1-10203':   2_000_000,
  '1-10204':   1_170_000,
}

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
  code: '1-30099',
  name: 'Ekuitas Saldo Awal',
}

/**
 * FR5 — per account, sum Inventory Value across all products mapped to it.
 * Only complete products contribute; an incomplete product has no value to add
 * and cannot reach the cutover anyway (Story 1's 100% gate).
 */
export function computeOpeningBalance(): OpeningBalanceLine[] {
  const totals = new Map<string, { debit: number; productCount: number }>()

  for (const [code, value] of Object.entries(importedValueByAccount)) {
    totals.set(code, { debit: value, productCount: 0 })
  }

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
