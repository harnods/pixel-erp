/**
 * Price rules — Inventory › Price rules (Purchase Price Rule one-pager,
 * Confluence PD 51412239134 v4; ships in Jurnal and Mekari ERP together).
 *
 * Customer and vendor price rules are IDENTICAL (DECIDED 17 Nov): every rule
 * type, active period, contact/group scope, product/category scope and the
 * "Allow changes on transaction" option work on both. Only the contact side
 * differs (customers vs vendors). Products are stored by id; picking a
 * category is a shortcut that adds its products. Empty `productIds` = all
 * products; empty `contactIds` = all customers / all vendors.
 *
 * No outlet field and no PKP on the rule (DECIDED 17 Nov):
 *   - an outlet's deal is its own named rule, picked in the transaction's
 *     header "Price rule" field;
 *   - PKP / Non-PKP lives on the vendor master (`vendors[].pkp`).
 *
 * Which rule a purchase line gets:
 *   1. Header "Price rule" field: 'auto' (default) | 'none' | a rule id. A
 *      picked rule applies to every line it covers; other lines fall back to
 *      automatic.
 *   2. Automatic = single best match, no stacking:
 *        tier 1 vendor + specific products · tier 2 vendor + all products ·
 *        tier 3 all vendors + specific products. Ties → newest rule.
 * What a rule does (base = the product price the form seeds):
 *   percent → discount %; value → Rp/unit shown as %; tier → qty step %;
 *   subtotal_tier → document-subtotal step %; end_discount ("Last price") →
 *   final unit price = amount (prototype reading, confirm with engineering);
 *   markup_percent / markup_value → unit price raised, discount 0.
 * `allowOverride` false → price + discount read-only on the line.
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
  purchase: ['percent', 'value', 'tier', 'subtotal_tier', 'end_discount', 'markup_percent', 'markup_value'],
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
  /** Tier steps for 'tier' (threshold = qty) and 'subtotal_tier'
   *  (threshold = document subtotal, Rp); discount = %. Max 5. [] otherwise. */
  tiers: { threshold: number; discount: number }[]
  /** "Allow changes on transaction" — default true (DECIDED 17 Nov). */
  allowOverride: boolean
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

function seed(r: Omit<PriceRule, 'createdAt' | 'updatedAt' | 'updatedBy' | 'startDate' | 'endDate' | 'status' | 'tiers' | 'allowOverride'> & Partial<PriceRule>): PriceRule {
  return { startDate: '', endDate: '', status: 'active', tiers: [], allowOverride: true, createdAt: SEED_AT, updatedAt: SEED_AT, updatedBy: 'System', ...r }
}

/** Seeds cover every purchase tier plus one PKP and one Non-PKP vendor. Ids
 *  sort oldest → newest so the "newest wins" tie-break is deterministic. */
const SEED_RULES: PriceRule[] = [
  seed({ id: 'PRL-001', name: 'Wholesale cafés · roasted beans', transactionType: 'sales', ruleType: 'percent', amount: 5, productIds: roasted, contactIds: ['C001', 'C002', 'C004'] }),
  seed({ id: 'PRL-002', name: 'Hotel accounts · equipment markup', transactionType: 'sales', ruleType: 'markup_percent', amount: 3, productIds: ['p13', 'p14', 'p16'], contactIds: ['C003'] }),
  seed({ id: 'PRL-101', name: 'Gayo Highland · all products', transactionType: 'purchase', ruleType: 'percent', amount: 5, productIds: [], contactIds: ['V003'] }),
  seed({ id: 'PRL-102', name: 'Gayo Highland · green beans', transactionType: 'purchase', ruleType: 'percent', amount: 10, productIds: greenBeans, contactIds: ['V003'] }),
  seed({ id: 'PRL-103', name: 'Bajawa Ngada · Flores Bajawa beans', transactionType: 'purchase', ruleType: 'percent', amount: 7, productIds: ['p07'], contactIds: ['V016'] }),
  seed({ id: 'PRL-104', name: 'V60 paper filter · all vendors', transactionType: 'purchase', ruleType: 'value', amount: 5_000, productIds: ['p24'], contactIds: [] }),
  // Outlet deal, picked in the transaction's Price rule field. createdAt is older
  // than PRL-102 so Automatic keeps choosing PRL-102 (10%); picking it gives 12%.
  seed({ id: 'PRL-105', name: 'Gayo Highland · green beans · Bandung outlet deal', transactionType: 'purchase', ruleType: 'percent', amount: 12, productIds: greenBeans, contactIds: ['V003'], createdAt: '2026-09-01T09:00:00', updatedAt: '2026-09-01T09:00:00' }),
  // Parity demo: vendor quantity tiers, locked on the transaction.
  seed({ id: 'PRL-106', name: 'Kemasan Prima · V60 filter volume tiers', transactionType: 'purchase', ruleType: 'tier', amount: 0, productIds: ['p24'], contactIds: ['V006'], tiers: [{ threshold: 10, discount: 5 }, { threshold: 50, discount: 8 }], allowOverride: false }),
]

const STORE_KEY = 'price-rules-v3'
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
    tiers: input.ruleType === 'tier' || input.ruleType === 'subtotal_tier' ? (input.tiers ?? []).map((t) => ({ ...t })) : [],
    allowOverride: input.allowOverride ?? true,
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
  return { name: '', transactionType, ruleType: 'percent', amount: 0, productIds: [], contactIds: [], tiers: [], allowOverride: true, startDate: '', endDate: '', status: 'active' }
}

// ── Purchase engine ────────────────────────────────────────────────────────────
export type PurchaseRuleTier = 1 | 2 | 3
/** English source labels — render through `t()`. */
export const PURCHASE_RULE_TIER_LABEL: Record<PurchaseRuleTier, string> = {
  1: 'Vendor + product',
  2: 'Vendor only',
  3: 'Product only',
}

/** Header "Price rule" field value. */
export type PriceRulePick = 'auto' | 'none' | string

export interface PurchaseRuleMatch {
  rule: PriceRule
  tier: PurchaseRuleTier
  /** Picked in the header Price rule field (vs automatic). */
  picked: boolean
  /** Resulting unit cost (changes only for last price / markups). */
  unitCost: number
  /** Resulting line discount %, 2 decimals, 0–100. */
  discountPct: number
  /** false → price + discount read-only on the line. */
  editable: boolean
}

export interface PurchaseLineInput {
  vendorIdOrName: string
  productId: string
  /** The product price the form seeds (rule base). */
  baseCost: number
  qty: number
  /** Document subtotal before discounts (for subtotal_tier). */
  docSubtotal: number
  isoDate?: string
  pick?: PriceRulePick
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
function covers(r: PriceRule, vendorId: string, productId: string): boolean {
  return (r.contactIds.length === 0 || r.contactIds.includes(vendorId))
    && (r.productIds.length === 0 || r.productIds.includes(productId))
}
const today = () => new Date().toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100

/** Accepts a vendor id or a vendor name (the PO form keys vendors by name). */
export function vendorIdOf(vendorIdOrName: string): string {
  return vendors.find((v) => v.id === vendorIdOrName || v.name === vendorIdOrName)?.id ?? vendorIdOrName
}

function activePurchase(isoDate: string): PriceRule[] {
  return store.filter((r) => r.transactionType === 'purchase' && r.status === 'active' && inPeriod(r, isoDate))
}

/** Options for the header "Price rule" field: active purchase rules for this
 *  vendor (or all vendors), newest first. */
export function purchaseRuleOptions(vendorIdOrName: string, isoDate: string = today()): PriceRule[] {
  if (!vendorIdOrName) return []
  const vendorId = vendorIdOf(vendorIdOrName)
  return activePurchase(isoDate)
    .filter((r) => tierOf(r) !== null && (r.contactIds.length === 0 || r.contactIds.includes(vendorId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

function stepPct(r: PriceRule, measure: number): number {
  return [...r.tiers].sort((a, b) => b.threshold - a.threshold).find((x) => measure >= x.threshold)?.discount ?? 0
}
function apply(r: PriceRule, line: PurchaseLineInput): { unitCost: number; discountPct: number } {
  const base = line.baseCost
  switch (r.ruleType) {
    case 'percent': return { unitCost: base, discountPct: r.amount }
    case 'value': return { unitCost: base, discountPct: base > 0 ? round2((r.amount / base) * 100) : 0 }
    case 'tier': return { unitCost: base, discountPct: stepPct(r, line.qty) }
    case 'subtotal_tier': return { unitCost: base, discountPct: stepPct(r, line.docSubtotal) }
    case 'end_discount': return { unitCost: r.amount, discountPct: 0 }
    case 'markup_percent': return { unitCost: round2(base * (1 + r.amount / 100)), discountPct: 0 }
    case 'markup_value': return { unitCost: base + r.amount, discountPct: 0 }
  }
}

export function resolvePurchaseRule(line: PurchaseLineInput): PurchaseRuleMatch | null {
  const pick = line.pick ?? 'auto'
  if (!line.vendorIdOrName || !line.productId || pick === 'none') return null
  const vendorId = vendorIdOf(line.vendorIdOrName)
  const rules = activePurchase(line.isoDate ?? today())
  let chosen: { rule: PriceRule; tier: PurchaseRuleTier; picked: boolean } | null = null
  if (pick !== 'auto') {
    const r = rules.find((x) => x.id === pick)
    const tier = r ? tierOf(r) : null
    if (r && tier && covers(r, vendorId, line.productId)) chosen = { rule: r, tier, picked: true }
  }
  if (!chosen) {
    const best = rules
      .map((rule) => ({ rule, tier: tierOf(rule) }))
      .filter((c): c is { rule: PriceRule; tier: PurchaseRuleTier } => c.tier !== null && covers(c.rule, vendorId, line.productId))
      .sort((a, b) => a.tier - b.tier || b.rule.createdAt.localeCompare(a.rule.createdAt) || b.rule.id.localeCompare(a.rule.id))[0]
    if (best) chosen = { ...best, picked: false }
  }
  if (!chosen) return null
  const out = apply(chosen.rule, line)
  return { ...chosen, unitCost: out.unitCost, discountPct: Math.min(Math.max(out.discountPct, 0), 100), editable: chosen.rule.allowOverride }
}

/** English source parts for the line note: ['Selected', tier] or [tier]. */
export function purchaseRuleTierParts(match: PurchaseRuleMatch): string[] {
  const tier = PURCHASE_RULE_TIER_LABEL[match.tier]
  return match.picked ? ['Selected', tier] : [tier]
}

/** Vendor master PKP status (DECIDED 17 Nov): true = PKP, false = Non-PKP,
 *  null = vendor not found. Vendors default to PKP. */
export function vendorPkpStatus(vendorIdOrName: string): boolean | null {
  if (!vendorIdOrName) return null
  const v = vendors.find((x) => x.id === vendorIdOrName || x.name === vendorIdOrName)
  return v ? v.pkp !== false : null
}

/** Is a tax label a PPN (VAT) tax — the only kind a Non-PKP vendor removes? */
export function isPpnTax(taxLabel: string): boolean {
  return /^PPN\b/i.test(taxLabel.trim())
}
