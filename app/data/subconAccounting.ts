/**
 * Subcontracting — the accounting layer (PRD Rev 5, R13 / R14).
 *
 * This module is to journals what `buildDocumentPlan` is to documents: the one
 * place the rules live. It is PURE — no Vue, no stores, no side effects — so the
 * finance fixtures can be run against it directly, and so a page can never quietly
 * grow a second version of a rule.
 *
 * You hand it everything that has happened on a subcon work order (what was
 * bought, issued, produced, returned, invoiced) and it returns the journal entries
 * that should exist. Nothing is posted anywhere; the caller decides what to do.
 *
 * ── The rules (R13) ──────────────────────────────────────────────────────────
 * Subcon costing follows the company's existing purchase transaction:
 *
 *  • A warehouse transfer to the vendor posts NOTHING — location changes, not owner.
 *  • A component issue (stock OUT of the vendor's warehouse) is the handover:
 *    Dr WIP / Cr Material inventory.
 *  • Purchase order approval posts NOTHING.
 *  • Output recorded (a partial record, or completion): Dr Finished goods /
 *    Cr WIP at the value of the materials issued for it — never more than was
 *    really put into WIP.
 *  • Unused components returned: Dr Material inventory / Cr WIP.
 *  • Purchase invoice: the vendor's service cost reaches the books here and only
 *    here — Dr Finished goods (the share still in stock) and Dr Cost of goods sold
 *    (the share already sold) / Cr Accounts payable.
 *
 * Basic has no materials of ours: output is recorded at zero value and the
 * invoice carries the whole value. All three methods converge on the same
 * finished-goods value once every invoice is in.
 *
 * ── R14: no tax ──────────────────────────────────────────────────────────────
 * No PPN and no PPh 23 on any subcon entry. The price-basis and withholding rules
 * live on in `subconPricing.ts`, switched off by `taxHandling: false`.
 *
 * ── OPEN (Finance) ───────────────────────────────────────────────────────────
 *  1. How an invoice splits between stock on hand and cost of goods sold. The
 *     default — `splitInvoiceStockVsSold` — follows each output record's cost
 *     share and how much of that record has been sold.
 *  2. An invoice whose value differs from the purchase order is not handled: the
 *     invoice is posted at its own value.
 *  3. Cost per unit drifts when goods are recorded before their materials are
 *     issued; WIP can only release what was really issued.
 */

import type { SubconMethod } from './subcon'

// ── Account roles ─────────────────────────────────────────────────────────────

/**
 * Journals address accounts by ROLE, never by name. A company maps roles onto its
 * own chart of accounts; the names below are seed data for this prototype.
 */
export type SubconAccountRole =
  | 'materialInventory'
  | 'wip'
  | 'finishedGoods'
  | 'costOfGoodsSold'
  | 'accountsPayable'

/** A resolved account: the code and name a journal line prints. */
export interface SubconAccount {
  code: string
  name: string
}

/**
 * Role → account. Material inventory is held per component product, so that role
 * takes the component's name and builds the account from it.
 */
const ACCOUNT_SEED: Record<SubconAccountRole, { code: string; name: string }> = {
  materialInventory: { code: '1-10200', name: 'Raw Material Inventory' },
  wip:               { code: '1-10201', name: 'WIP Inventory' },
  finishedGoods:     { code: '1-10202', name: 'Finish Goods Inventory' },
  accountsPayable:   { code: '2-10000', name: 'Utang Usaha' },
  costOfGoodsSold:   { code: '5-10000', name: 'Cost of goods sold' },
}

/**
 * Resolve a role. `key` names the component for the per-thing role: it
 * distinguishes the lines WITHIN an entry, while the account code stays the same,
 * so a summary that groups by code merges them back into one row.
 */
export function subconAccount(role: SubconAccountRole, key?: string): SubconAccount {
  const seed = ACCOUNT_SEED[role]
  return { code: seed.code, name: key ? `${seed.name} - ${key}` : seed.name }
}

/** "1-10201 – WIP Inventory" — the chart's own display format. */
export function accountLabel(role: SubconAccountRole, key?: string): string {
  const a = subconAccount(role, key)
  return `${a.code} – ${a.name}`
}

// ── Input ─────────────────────────────────────────────────────────────────────

export interface SubconComponentInput {
  sku: string
  name: string
  /** Quantity the work order plans to consume. */
  plannedQty: number
  unitCost: number
}

export type SubconCostDriver = 'Unit' | 'Amount' | 'Batch'

export interface SubconCostLineInput {
  /** Stable key — the cost line's id. */
  id: string
  name: string
  /** A label from the service product's unit; it does not select a formula (R12). */
  costDriver: SubconCostDriver
  /** Total charge for the full planned output quantity. */
  amount: number
}

/** Components issued into the vendor's process (a stock adjustment OUT). */
export interface SubconHandoverInput {
  id: string
  date: string
  documentNumber?: string
  lines: { sku: string; qty: number }[]
}

/** Components that came back unused (a stock adjustment IN). */
export interface SubconReturnInput {
  id: string
  date: string
  documentNumber?: string
  lines: { sku: string; qty: number }[]
}

/** Dropship only — components bought from a 3rd party, delivered to the vendor. */
export interface SubconComponentPurchaseInput {
  id: string
  date: string
  documentNumber?: string
  lines: { sku: string; qty: number }[]
}

/**
 * Output recorded on the work order — a partial production record, or the
 * remainder produced at completion. The ONLY source of produced quantity (R5).
 */
export interface SubconOutputInput {
  id: string
  date: string
  documentNumber?: string
  qty: number
  /** Subcon cost taken onto this record (R12) — its share of the invoice. */
  cost: number
  /** Units of this record already sold. Absent → none, so the invoice stays in stock. */
  soldQty?: number
}

/** The vendor's service invoice, per cost line. No tax (R14). */
export interface SubconInvoiceInput {
  id: string
  date: string
  documentNumber?: string
  lines: { costLineId: string; amount: number }[]
}

export interface SubconAccountingInput {
  workOrderNumber: string
  method: SubconMethod
  plannedOutputQty: number
  components: SubconComponentInput[]
  costLines: SubconCostLineInput[]
  componentPurchases?: SubconComponentPurchaseInput[]
  handovers?: SubconHandoverInput[]
  returns?: SubconReturnInput[]
  outputs?: SubconOutputInput[]
  invoices?: SubconInvoiceInput[]
}

// ── Output ────────────────────────────────────────────────────────────────────

export type SubconJournalEvent =
  | 'componentPurchase'
  | 'materialHandover'
  | 'materialReturn'
  | 'goodsProduced'
  | 'vendorInvoice'

export interface SubconJournalLine {
  role: SubconAccountRole
  /** "1-10201 – WIP Inventory" */
  account: string
  debit?: number
  credit?: number
}

export interface SubconJournalEntry {
  id: string
  event: SubconJournalEvent
  date: string
  description: string
  documentNumber?: string
  lines: SubconJournalLine[]
}

const debit = (role: SubconAccountRole, amount: number, key?: string): SubconJournalLine =>
  ({ role, account: accountLabel(role, key), debit: amount })
const credit = (role: SubconAccountRole, amount: number, key?: string): SubconJournalLine =>
  ({ role, account: accountLabel(role, key), credit: amount })

// ── Helpers ───────────────────────────────────────────────────────────────────

const valueOf = (
  cost: Map<string, SubconComponentInput>,
  lines: { sku: string; qty: number }[],
) => lines.reduce((s, l) => s + Math.round((cost.get(l.sku)?.unitCost ?? 0) * l.qty), 0)

/** Total value of components actually issued into the vendor's process. */
export function handedOverValue(input: SubconAccountingInput): number {
  const cost = new Map(input.components.map(c => [c.sku, c]))
  return (input.handovers ?? []).reduce((sum, h) => sum + valueOf(cost, h.lines), 0)
}

/** Planned material value — what the BOM says the run should consume. */
export function plannedMaterialValue(input: SubconAccountingInput): number {
  return input.components.reduce((s, c) => s + c.unitCost * c.plannedQty, 0)
}

/** Planned subcon cost — every cost line at its full amount. */
export function plannedSubconCost(input: SubconAccountingInput): number {
  return input.costLines.reduce((s, l) => s + l.amount, 0)
}

/**
 * OPEN (Finance) — how an invoice splits between stock still on hand and stock
 * already sold. Default: follow the cost share recorded on each output record, and
 * the fraction of that record that has been sold. With nothing sold — or no output
 * recorded yet — the whole invoice stays in finished goods.
 */
export function splitInvoiceStockVsSold(
  total: number,
  outputs: SubconOutputInput[],
): { stock: number; sold: number } {
  const weight = (o: SubconOutputInput) => o.cost > 0 ? o.cost : 0
  let totalWeight = outputs.reduce((s, o) => s + weight(o), 0)
  const byQty = totalWeight <= 0
  if (byQty) totalWeight = outputs.reduce((s, o) => s + o.qty, 0)
  if (totalWeight <= 0) return { stock: total, sold: 0 }
  const soldShare = outputs.reduce((s, o) => {
    const fraction = o.qty > 0 ? Math.min(1, Math.max(0, (o.soldQty ?? 0) / o.qty)) : 0
    return s + ((byQty ? o.qty : weight(o)) / totalWeight) * fraction
  }, 0)
  const sold = Math.round(total * soldShare)
  return { stock: total - sold, sold }
}

// ── The rules ─────────────────────────────────────────────────────────────────

/**
 * Every journal entry a subcon work order should have produced, in the order the
 * events happened.
 */
export function buildSubconJournals(input: SubconAccountingInput): SubconJournalEntry[] {
  const entries: SubconJournalEntry[] = []
  const cost = new Map(input.components.map(c => [c.sku, c]))
  const doc = input.workOrderNumber
  const outputs = input.outputs ?? []

  // 1. Dropship — components bought from a 3rd party, shipped to the vendor.
  for (const purchase of input.componentPurchases ?? []) {
    const lines: SubconJournalLine[] = []
    let total = 0
    for (const l of purchase.lines) {
      const c = cost.get(l.sku)
      if (!c) continue
      const value = Math.round(c.unitCost * l.qty)
      total += value
      lines.push(debit('materialInventory', value, c.name))
    }
    if (!total) continue
    lines.push(credit('accountsPayable', total))
    entries.push({
      id: `${purchase.id}-purchase`,
      event: 'componentPurchase',
      date: purchase.date,
      description: `Components purchased to the vendor warehouse — ${doc}`,
      documentNumber: purchase.documentNumber,
      lines,
    })
  }

  // 2. Materials issued into the vendor's process. Posted on the ISSUE, not on
  //    consumption — once they are in the vendor's process they are work in progress.
  for (const handover of input.handovers ?? []) {
    const lines: SubconJournalLine[] = []
    let total = 0
    for (const l of handover.lines) {
      const c = cost.get(l.sku)
      if (!c) continue
      const value = Math.round(c.unitCost * l.qty)
      if (!value) continue
      total += value
      lines.push(credit('materialInventory', value, c.name))
    }
    if (!total) continue
    entries.push({
      id: `${handover.id}-handover`,
      event: 'materialHandover',
      date: handover.date,
      description: `Materials issued to the subcon vendor — ${doc}`,
      documentNumber: handover.documentNumber,
      lines: [debit('wip', total), ...lines],
    })
  }

  // 3. Unused components returned: out of WIP, back into material inventory.
  for (const ret of input.returns ?? []) {
    const lines: SubconJournalLine[] = []
    let total = 0
    for (const l of ret.lines) {
      const c = cost.get(l.sku)
      if (!c) continue
      const value = Math.round(c.unitCost * l.qty)
      if (!value) continue
      total += value
      lines.push(debit('materialInventory', value, c.name))
    }
    if (!total) continue
    entries.push({
      id: `${ret.id}-return`,
      event: 'materialReturn',
      date: ret.date,
      description: `Unused components returned — ${doc}`,
      documentNumber: ret.documentNumber,
      lines: [...lines, credit('wip', total)],
    })
  }

  // 4. Output recorded. Finished goods take the value of the materials issued for
  //    it — everything issued up to that record, less what earlier records and any
  //    returns already took out of WIP. WIP can only release what was really put
  //    into it, so goods recorded ahead of their materials carry less; Basic has no
  //    materials of ours, so its output is at zero value until the invoice.
  if (input.method !== 'basic') {
    const handovers = input.handovers ?? []
    const returns = input.returns ?? []
    let released = 0
    for (const output of outputs) {
      const issuedToDate = handovers
        .filter(h => h.date <= output.date)
        .reduce((s, h) => s + valueOf(cost, h.lines), 0)
      const returnedToDate = returns
        .filter(r => r.date <= output.date)
        .reduce((s, r) => s + valueOf(cost, r.lines), 0)
      const value = Math.max(0, issuedToDate - returnedToDate - released)
      if (!value) continue
      released += value
      entries.push({
        id: `${output.id}-output`,
        event: 'goodsProduced',
        date: output.date,
        description: `Finished goods recorded — ${doc}`,
        documentNumber: output.documentNumber,
        lines: [debit('finishedGoods', value), credit('wip', value)],
      })
    }
  }

  // 5. The vendor's invoice — the one point the service cost reaches the books.
  for (const invoice of input.invoices ?? []) {
    const total = invoice.lines.reduce((s, l) => s + l.amount, 0)
    if (!total) continue
    const { stock, sold } = splitInvoiceStockVsSold(total, outputs)
    entries.push({
      id: `${invoice.id}-invoice`,
      event: 'vendorInvoice',
      date: invoice.date,
      description: `Subcon vendor invoice recorded — ${doc}`,
      documentNumber: invoice.documentNumber,
      lines: [
        ...(stock ? [debit('finishedGoods', stock)] : []),
        ...(sold ? [debit('costOfGoodsSold', sold)] : []),
        credit('accountsPayable', total),
      ],
    })
  }

  return entries
}

// ── Derived figures ───────────────────────────────────────────────────────────

/** Net movement on one role across a set of entries (debits positive). */
export function balanceOf(entries: SubconJournalEntry[], role: SubconAccountRole): number {
  return entries.reduce((sum, e) =>
    sum + e.lines.reduce((s, l) =>
      s + (l.role === role ? (l.debit ?? 0) - (l.credit ?? 0) : 0), 0), 0)
}

/** What is currently in the vendor's hands, in money. Drives the WIP balance figure. */
export function wipBalanceFrom(entries: SubconJournalEntry[]): number {
  return balanceOf(entries, 'wip')
}

/** Convenience: the WIP balance for an input, without building entries twice. */
export function subconWipBalance(input: SubconAccountingInput): number {
  return wipBalanceFrom(buildSubconJournals(input))
}

export interface SubconAccountTotal {
  code: string
  name: string
  role: SubconAccountRole
  debit: number
  credit: number
}

/**
 * The journal summarised one row per ACCOUNT — what the work order's journal view
 * shows. Lines are grouped by account CODE, so the per-component material lines
 * and the per-cost-line clearing lines merge back into a single row each; the
 * individual movements stay visible on the documents themselves.
 *
 * Debit and credit are both carried rather than netted: an account that was
 * debited and credited over the run (WIP always is) should show both sides, which
 * is also why the totals of the two columns agree.
 */
export function accountTotals(entries: SubconJournalEntry[]): SubconAccountTotal[] {
  const byCode = new Map<string, SubconAccountTotal>()
  for (const entry of entries) {
    for (const line of entry.lines) {
      const account = subconAccount(line.role)
      const row = byCode.get(account.code) ?? {
        code: account.code, name: account.name, role: line.role, debit: 0, credit: 0,
      }
      row.debit += line.debit ?? 0
      row.credit += line.credit ?? 0
      byCode.set(account.code, row)
    }
  }
  // Chart order — assets, then liabilities, then expenses.
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/** True when every entry's debits equal its credits. */
export function entriesBalance(entries: SubconJournalEntry[]): boolean {
  return entries.every((e) => {
    const d = e.lines.reduce((s, l) => s + (l.debit ?? 0), 0)
    const c = e.lines.reduce((s, l) => s + (l.credit ?? 0), 0)
    return d === c
  })
}

export interface SubconCostSummary {
  plannedMaterial: number
  plannedSubcon: number
  plannedTotal: number
  plannedPerUnit: number
  actualMaterial: number
  /** The vendor's service cost as invoiced — zero until an invoice is recorded. */
  actualSubcon: number
  actualTotal: number
  actualPerUnit: number
  producedQty: number
  /** True until the service invoice is recorded: cost per unit holds material value only. */
  awaitingInvoice: boolean
}

/**
 * Plan vs actual. "Planned" is what the BOM and cost lines say the run should
 * cost; "actual" is what has really been posted — materials issued, and the
 * vendor's service cost once it is invoiced (R13).
 */
export function subconCostSummary(input: SubconAccountingInput): SubconCostSummary {
  const entries = buildSubconJournals(input)
  const producedQty = (input.outputs ?? []).reduce((s, o) => s + o.qty, 0)
  const plannedMaterial = input.method === 'basic' ? 0 : plannedMaterialValue(input)
  const plannedSubcon = plannedSubconCost(input)
  const plannedTotal = plannedMaterial + plannedSubcon

  const actualMaterial = input.method === 'basic' ? 0 : handedOverValue(input)
  const actualSubcon = entries
    .filter(e => e.event === 'vendorInvoice')
    .reduce((s, e) => s + e.lines.reduce((x, l) => x + (l.credit ?? 0), 0), 0)
  const actualTotal = actualMaterial + actualSubcon

  return {
    plannedMaterial,
    plannedSubcon,
    plannedTotal,
    plannedPerUnit: input.plannedOutputQty > 0 ? plannedTotal / input.plannedOutputQty : 0,
    actualMaterial,
    actualSubcon,
    actualTotal,
    actualPerUnit: input.plannedOutputQty > 0 ? actualTotal / input.plannedOutputQty : 0,
    producedQty,
    awaitingInvoice: actualSubcon === 0,
  }
}

// ── Component quantity adjustment (R7, R8) ────────────────────────────────────

export type SubconAdjustmentOutcome =
  /** The vendor does not hold enough for the new quantity: supply is reopened for the difference. */
  | { kind: 'requiresShipment'; extraQty: number }
  /** A plan-only change: the vendor already holds enough. NOT a journal event. */
  | { kind: 'planOnly' }
  /** Lower than the current plan — quantities can only increase (R7). */
  | { kind: 'rejected'; currentQty: number; message: string }
  /** Basic: the materials are the vendor's, so there is nothing to adjust. */
  | { kind: 'notApplicable' }

/**
 * What changing a component's planned quantity should do.
 *
 *  • A LOWER figure is refused, naming the current value. Quantities only increase
 *    (R7), so nothing is ever "reduced back" and no shortfall is written off.
 *  • A higher figure the vendor already holds is a plan-only change and posts
 *    nothing — only the outstanding quantity changes.
 *  • A higher figure beyond what the vendor holds reopens supply for the
 *    DIFFERENCE only (R8): a transfer on Resupply, a component purchase on Dropship.
 *    Editing the number alone moves no goods, so it posts nothing on its own.
 */
export function evaluateComponentAdjustment(args: {
  method: SubconMethod
  plannedQty: number
  newPlannedQty: number
  alreadySentQty: number
  componentName: string
  unit: string
}): SubconAdjustmentOutcome {
  if (args.method === 'basic') return { kind: 'notApplicable' }

  if (args.newPlannedQty < args.plannedQty) {
    return {
      kind: 'rejected',
      currentQty: args.plannedQty,
      message: `${args.componentName} cannot be lower than the current ${args.plannedQty} ${args.unit}.`,
    }
  }

  const extraQty = args.newPlannedQty - Math.max(args.alreadySentQty, args.plannedQty)
  if (args.newPlannedQty > args.plannedQty && extraQty > 0) return { kind: 'requiresShipment', extraQty }
  return { kind: 'planOnly' }
}
