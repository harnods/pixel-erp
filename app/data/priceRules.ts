/**
 * Price rules — Inventory › Price rules (Purchase Price Rule one-pager,
 * Confluence PD 51412239134; same feature ships in Jurnal and Mekari ERP).
 *
 * A rule is either SALES (customers) or PURCHASE (vendors). Both store the
 * products they cover by id; picking a product CATEGORY in the form is only a
 * shortcut that selects its products (decided 12 Nov 2026), so the rule never
 * has to be re-resolved when a category changes. Empty `productIds` = all
 * products; empty `contactIds` = all customers / all vendors.
 *
 * Purchase rules add the vendor's PKP status (`vendorPkp`):
 *   true  = PKP     → the line's PPN applies as today
 *   false = Non-PKP → PPN is not applied (PPh untouched)
 *   null  = not set (all-vendor rule) → tax follows the product, as today
 * One vendor must carry the same PKP value on every rule (`purchasePkpConflict`).
 *
 * Purchase engine (`resolvePurchaseRule`) — single best match, no stacking:
 *   tier 1  vendor + specific products
 *   tier 2  vendor + all products
 *   tier 3  all vendors + specific products
 * Ties inside a tier → the newest rule. A rule with neither vendors nor
 * products never applies to purchases (a blanket discount is out of scope).
 * Base price = the unit cost the purchase form already seeds from the product
 * master (`products[].price`); the rule discount applies on top of it. The
 * Vendor Products tab's last price stays reference-only here.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { vendors } from './vendors'
import { products } from './products'

export type PriceRuleTransactionType = 'sales' | 'purchase'
export const PRICE_RULE_TRANSACTION_TYPES: PriceRuleTransactionType[] = ['sales', 'purchase']
/** English source labels — render through `t()`. */
export const PRICE_RULE_TRANSACTION_TYPE_LABEL: Record<PriceRuleTransactionType, string> = {
  sales: 'Sales',
  purchase: 'Purchase',
}

export type PriceRuleType =
  | 'percent' | 'value' | 'tier' | 'subtotal_tier' | 'end_discount'
  | 'markup_percent' | 'markup_value'
/** Labels and order mirror production Mekari ERP (Create Price Rule › Rule type). */
export const PRICE_RULE_TYPE_LABEL: Record<PriceRuleType, string> = {
  percent: 'Percentage discount',
  value: 'Price amount discount',
  tier: 'Tier percentage discount',
  subtotal_tier: 'Sales subtotal discount',
  end_discount: 'Last price discount',
  markup_percent: 'Percentage markup',
  markup_value: 'Price amount markup',
}
/** Production groups the two markups under a "MARKUP" heading. */
export const PRICE_RULE_MARKUP_TYPES: PriceRuleType[] = ['markup_percent', 'markup_value']
/** Which rule types each transaction type offers. Purchase = the two discount
 *  shapes the one-pager scopes in (percentage / price amount per unit). The
 *  sales tier / subtotal / last-price types exist in production; this prototype
 *  lists them but doesn't model their tier tables. */
export const PRICE_RULE_TYPES_BY_TRANSACTION: Record<PriceRuleTransactionType, PriceRuleType[]> = {
  sales: ['percent', 'value', 'tier', 'subtotal_tier', 'end_discount', 'markup_percent', 'markup_value'],
  purchase: ['percent', 'value'],
}

export type PriceRuleStatus = 'active' | 'inactive'

export interface PriceRule {
  id: string
  name: string
  transactionType: PriceRuleTransactionType
  ruleType: PriceRuleType
  /** % for percent/markup_percent, Rp per unit for value/markup_value. */
  amount: number
  /** Product ids; empty = all products. */
  productIds: string[]
  /** Customer ids (sales) or vendor ids (purchase); empty = all. */
  contactIds: string[]
  /** Purchase rules with ≥1 vendor only; null otherwise. */
  vendorPkp: boolean | null
  /** `YYYY-MM-DD`; '' = open-ended. */
  startDate: string
  endDate: string
  status: PriceRuleStatus
  createdAt: string
  updatedAt: string
  updatedBy: string
}

export type PriceRuleInput = Omit<PriceRule, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>

const SEED_AT = '2026-10-01T09:00:00'
const greenBeans = products.filter((p) => p.category === 'Green Beans').map((p) => p.id)
const roasted = products.filter((p) => p.category === 'Roasted Beans').map((p) => p.id)

function seed(r: Omit<PriceRule, 'createdAt' | 'updatedAt' | 'updatedBy' | 'startDate' | 'endDate' | 'status'> & Partial<PriceRule>): PriceRule {
  return { startDate: '', endDate: '', status: 'active', createdAt: SEED_AT, updatedAt: SEED_AT, updatedBy: 'System', ...r }
}

/** Seeds cover every purchase tier plus one PKP and one Non-PKP vendor. Ids
 *  sort oldest → newest so the "newest wins" tie-break is deterministic. */
const SEED_RULES: PriceRule[] = [
  seed({ id: 'PRL-001', name: 'Wholesale cafés · roasted beans', transactionType: 'sales', ruleType: 'percent', amount: 5, productIds: roasted, contactIds: ['C001', 'C002', 'C004'], vendorPkp: null }),
  seed({ id: 'PRL-002', name: 'Hotel accounts · equipment markup', transactionType: 'sales', ruleType: 'markup_percent', amount: 3, productIds: ['p13', 'p14', 'p16'], contactIds: ['C003'], vendorPkp: null }),
  seed({ id: 'PRL-101', name: 'Gayo Highland · all products', transactionType: 'purchase', ruleType: 'percent', amount: 5, productIds: [], contactIds: ['V003'], vendorPkp: true }),
  seed({ id: 'PRL-102', name: 'Gayo Highland · green beans', transactionType: 'purchase', ruleType: 'percent', amount: 10, productIds: greenBeans, contactIds: ['V003'], vendorPkp: true }),
  seed({ id: 'PRL-103', name: 'Bajawa Ngada · Flores Bajawa beans', transactionType: 'purchase', ruleType: 'percent', amount: 7, productIds: ['p07'], contactIds: ['V016'], vendorPkp: false }),
  seed({ id: 'PRL-104', name: 'V60 paper filter · all vendors', transactionType: 'purchase', ruleType: 'value', amount: 5_000, productIds: ['p24'], contactIds: [], vendorPkp: null }),
]

const STORE_KEY = 'price-rules-v1'
const store = reactive<PriceRule[]>(loadSnapshot<PriceRule>(STORE_KEY) ?? SEED_RULES.map((r) => ({ ...r })))
function persist() { saveSnapshot(STORE_KEY, store) }
function now(): string { return new Date().toISOString() }

// ── Reads ──────────────────────────────────────────────────────────────────────
/** Newest first (the list's default order). */
export function priceRules(): PriceRule[] {
  return [...store].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}
export function priceRuleById(id: string): PriceRule | undefined {
  return store.find((r) => r.id === id)
}

// ── Writes ─────────────────────────────────────────────────────────────────────
/** PKP only means something on a purchase rule that names its vendors. */
function normalise(input: PriceRuleInput): PriceRuleInput {
  const allowed = PRICE_RULE_TYPES_BY_TRANSACTION[input.transactionType]
  return {
    ...input,
    name: input.name.trim(),
    ruleType: allowed.includes(input.ruleType) ? input.ruleType : allowed[0]!,
    productIds: [...input.productIds],
    contactIds: [...input.contactIds],
    vendorPkp: input.transactionType === 'purchase' && input.contactIds.length > 0 ? (input.vendorPkp ?? true) : null,
  }
}

let seq = store.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, '')) || 0), 200)
export function createPriceRule(input: PriceRuleInput, by = 'You'): PriceRule {
  seq += 1
  const at = now()
  const rule: PriceRule = { id: `PRL-${String(seq).padStart(3, '0')}`, ...normalise(input), createdAt: at, updatedAt: at, updatedBy: by }
  store.push(rule)
  persist()
  return rule
}
export function updatePriceRule(id: string, input: PriceRuleInput, by = 'You'): PriceRule | undefined {
  const i = store.findIndex((r) => r.id === id)
  if (i === -1) return undefined
  const next: PriceRule = { ...store[i]!, ...normalise(input), updatedAt: now(), updatedBy: by }
  store.splice(i, 1, next)
  persist()
  return next
}
export function deletePriceRule(id: string): void {
  const i = store.findIndex((r) => r.id === id)
  if (i !== -1) { store.splice(i, 1); persist() }
}
export function emptyPriceRuleInput(transactionType: PriceRuleTransactionType = 'sales'): PriceRuleInput {
  return { name: '', transactionType, ruleType: 'percent', amount: 0, productIds: [], contactIds: [], vendorPkp: null, startDate: '', endDate: '', status: 'active' }
}

// ── Purchase engine ────────────────────────────────────────────────────────────
export type PurchaseRuleTier = 1 | 2 | 3
/** English source labels — render through `t()`. */
export const PURCHASE_RULE_TIER_LABEL: Record<PurchaseRuleTier, string> = {
  1: 'Vendor + product',
  2: 'Vendor only',
  3: 'Product only',
}

export interface PurchaseRuleMatch {
  rule: PriceRule
  tier: PurchaseRuleTier
  /** The rule as a line discount % (purchase lines only carry a %). A value
   *  rule converts against the line's unit cost, rounded to 2 decimals, capped
   *  at 100. */
  discountPct: number
}

function inPeriod(r: PriceRule, isoDate: string): boolean {
  if (r.startDate && isoDate < r.startDate) return false
  if (r.endDate && isoDate > r.endDate) return false
  return true
}
function tierOf(r: PriceRule): PurchaseRuleTier | null {
  const v = r.contactIds.length > 0
  const p = r.productIds.length > 0
  if (v && p) return 1
  if (v) return 2
  if (p) return 3
  return null
}

/** Accepts a vendor id or a vendor name (the PO form keys vendors by name). */
export function vendorIdOf(vendorIdOrName: string): string {
  return vendors.find((v) => v.id === vendorIdOrName || v.name === vendorIdOrName)?.id ?? vendorIdOrName
}

export function resolvePurchaseRule(
  vendorIdOrName: string,
  productId: string,
  unitCost: number,
  isoDate: string = new Date().toISOString().slice(0, 10),
): PurchaseRuleMatch | null {
  if (!vendorIdOrName || !productId) return null
  const vendorId = vendorIdOf(vendorIdOrName)
  const best = store
    .filter((r) => r.transactionType === 'purchase' && r.status === 'active' && inPeriod(r, isoDate))
    .map((rule) => ({ rule, tier: tierOf(rule) }))
    .filter((c): c is { rule: PriceRule; tier: PurchaseRuleTier } =>
      c.tier !== null
      && (c.rule.contactIds.length === 0 || c.rule.contactIds.includes(vendorId))
      && (c.rule.productIds.length === 0 || c.rule.productIds.includes(productId)))
    .sort((a, b) => a.tier - b.tier || b.rule.createdAt.localeCompare(a.rule.createdAt) || b.rule.id.localeCompare(a.rule.id))[0]
  if (!best) return null
  const raw = best.rule.ruleType === 'value'
    ? (unitCost > 0 ? Math.round((best.rule.amount / unitCost) * 10_000) / 100 : 0)
    : best.rule.amount
  return { rule: best.rule, tier: best.tier, discountPct: Math.min(raw, 100) }
}

/** true = PKP, false = Non-PKP, null = not set (tax follows the product). */
export function vendorPkpStatus(vendorIdOrName: string): boolean | null {
  if (!vendorIdOrName) return null
  const vendorId = vendorIdOf(vendorIdOrName)
  const r = store.find((x) => x.transactionType === 'purchase' && x.vendorPkp !== null && x.contactIds.includes(vendorId))
  return r ? r.vendorPkp : null
}

/** The first other purchase rule recording one of `vendorIds` with the
 *  opposite PKP status — saving must be blocked while one exists. */
export function purchasePkpConflict(
  vendorIds: string[],
  pkp: boolean,
  excludeId?: string,
): { rule: PriceRule; vendorId: string; vendorName: string } | null {
  for (const r of store) {
    if (r.transactionType !== 'purchase' || r.vendorPkp === null || r.vendorPkp === pkp) continue
    if (excludeId && r.id === excludeId) continue
    const vendorId = vendorIds.find((v) => r.contactIds.includes(v))
    if (vendorId) return { rule: r, vendorId, vendorName: vendors.find((v) => v.id === vendorId)?.name ?? vendorId }
  }
  return null
}

/** Is a tax label a PPN (VAT) tax — the only kind a Non-PKP vendor removes? */
export function isPpnTax(taxLabel: string): boolean {
  return /^PPN\b/i.test(taxLabel.trim())
}
