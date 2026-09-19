/**
 * Subcontracting — the accounting layer.
 *
 * This module is to journals what `buildDocumentPlan` is to documents: the one
 * place the rules live. It is PURE — no Vue, no stores, no side effects — so the
 * finance fixtures can be run against it directly, and so a page can never quietly
 * grow a second version of a rule.
 *
 * The shape of it: you hand it everything that has happened on a subcon work order
 * (what was bought, handed over, received, invoiced) and it returns the journal
 * entries that should exist. Nothing is posted anywhere; the caller decides what to
 * do with them.
 *
 * ── The invariant ────────────────────────────────────────────────────────────
 * All three supply methods converge on the SAME finished-goods value. Basic,
 * Resupply and Dropship differ in how materials reach the vendor, not in what the
 * output costs. Every entry balances, and a fully received order ends with WIP = 0
 * and every clearing account at 0. `tests/subcon-accounting.spec.ts` asserts all of it.
 *
 * ── OPEN QUESTIONS (not settled by the finance simulations) ──────────────────
 * Raised here rather than guessed at silently:
 *
 *  1. Cost driver `Batch`. The simulations did not cover it. It is treated here
 *     exactly like `Amount` — a whole-batch charge spread pro rata across the
 *     quantity received — on the reasoning that a batch fee is incurred for the
 *     run as a whole. The alternative (charge 100% to the first receipt) is
 *     equally defensible and materially different for staged receipts.
 *
 *  2. Receipts against a PARTIAL handover. The fixtures always hand over every
 *     component before any finished goods come back, so "materials per unit"
 *     is unambiguous there. Where materials are still outstanding, this module
 *     values a receipt at `materialsActuallyInWip / plannedOutputQty` per unit —
 *     so WIP can only release what was really put into it. The consequence is
 *     that cost per unit drifts if goods are received before materials finish
 *     arriving. Finance has not ruled on which side should give.
 *
 *  3. The clearing account is named `Expense Subcon - <line>` per the brief, but
 *     it behaves as a clearing account, not an expense — it nets to zero. See
 *     SUBCON_ACCOUNTING_SETTINGS; a rename is expected.
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
  | 'accountsPayable'
  | 'subconClearing'
  | 'vatInput'
  | 'withholdingTaxPayable'
  | 'wasteAccount'

/** A resolved account: the code and name a journal line prints. */
export interface SubconAccount {
  code: string
  name: string
}

/**
 * Role → account. Two roles are per-thing rather than fixed: material inventory is
 * held per component product, and a clearing account exists per subcon cost line,
 * so both take the thing's name and build the account from it.
 *
 * Codes follow the chart already in use (1- asset, 2- liability, 5-/6- expense).
 */
const ACCOUNT_SEED: Record<SubconAccountRole, { code: string; name: (key?: string) => string }> = {
  materialInventory:     { code: '1-30100', name: (k) => `Persediaan Bahan Baku${k ? ` - ${k}` : ''}` },
  wip:                   { code: '1-30200', name: () => 'WIP' },
  finishedGoods:         { code: '1-30300', name: () => 'Persediaan Barang Jadi' },
  vatInput:              { code: '1-40100', name: () => 'PPN Masukan' },
  accountsPayable:       { code: '2-10000', name: () => 'Utang Usaha' },
  withholdingTaxPayable: { code: '2-20100', name: () => 'Utang PPh 23' },
  subconClearing:        { code: '5-20100', name: (k) => `Expense Subcon${k ? ` - ${k}` : ''}` },
  wasteAccount:          { code: '6-30100', name: () => 'Kerugian Scrap' },
}

/** Resolve a role (plus the component/cost-line name, where the role is per-thing). */
export function subconAccount(role: SubconAccountRole, key?: string): SubconAccount {
  const seed = ACCOUNT_SEED[role]
  return { code: seed.code, name: seed.name(key) }
}

/** "1-30200 WIP" — the format `JournalEntryRow.account` expects. */
export function accountLabel(role: SubconAccountRole, key?: string): string {
  const a = subconAccount(role, key)
  return `${a.code} ${a.name}`
}

// ── Settings still open with Finance (§6 of the brief) ────────────────────────

export interface SubconAccountingSettings {
  /** Hold vendor-held stock in a separate WIP-at-vendor account, or leave it in
   *  material inventory separated only by warehouse. */
  vendorWarehouseUsesSeparateWipAccount: boolean
  /** Whether Basic runs through WIP at all, or posts straight to finished goods. */
  basicPassesThroughWip: boolean
  /** How an unproduced balance is valued when an order is closed short. */
  shortfallValuation: 'cost'
  /** Withholding tax (PPh 23) on jasa maklon — Resupply and Dropship only. */
  withholdingRate: number
  /** VAT (PPN) on the vendor's invoice. */
  vatRate: number
}

/** Defaults are what the three finance simulations used. */
export const SUBCON_ACCOUNTING_SETTINGS: SubconAccountingSettings = {
  vendorWarehouseUsesSeparateWipAccount: false,
  basicPassesThroughWip: true,
  shortfallValuation: 'cost',
  withholdingRate: 0.02,
  vatRate: 0.11,
}

/**
 * Withholding is jasa maklon only. Under PMK 141/2015 a Basic order is a purchase
 * of GOODS — the vendor supplies the materials and owns the output until handover —
 * so no PPh 23 applies.
 */
export function withholdingApplies(method: SubconMethod): boolean {
  return method !== 'basic'
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
  /** Stable key — also names this line's clearing account. */
  id: string
  name: string
  costDriver: SubconCostDriver
  /** Total charge for the full planned output quantity. */
  amount: number
}

/** Components issued into the vendor's process. */
export interface SubconHandoverInput {
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

/** Finished goods coming back from the vendor (a purchase delivery). */
export interface SubconReceiptInput {
  id: string
  date: string
  documentNumber?: string
  qty: number
}

/** The vendor's bill. Amounts are per cost line, before VAT. */
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
  receipts?: SubconReceiptInput[]
  invoices?: SubconInvoiceInput[]
  /**
   * Units the order was closed short by. Whatever is left in WIP once every
   * receipt is accounted for is swept to the waste account.
   */
  closedShort?: boolean
  settings?: Partial<SubconAccountingSettings>
}

// ── Output ────────────────────────────────────────────────────────────────────

export type SubconJournalEvent =
  | 'componentPurchase'
  | 'materialHandover'
  | 'vendorInvoice'
  | 'capitalisation'
  | 'goodsReceived'
  | 'shortCompletion'

export interface SubconJournalLine {
  role: SubconAccountRole
  /** "1-30200 WIP" */
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

// ── Cost allocation ───────────────────────────────────────────────────────────

/**
 * What one cost line contributes to one receipt.
 *
 *  • `Unit`   — a per-unit rate: (total ÷ planned output) × quantity received.
 *  • `Amount` — a lump sum spread pro rata on quantity received.
 *  • `Batch`  — treated as `Amount`. See OPEN QUESTIONS 1.
 *
 * All three reduce to the same arithmetic today; they are kept apart because they
 * are different commercial ideas and will not stay identical.
 */
export function allocateCostLine(
  line: SubconCostLineInput,
  receivedQty: number,
  plannedOutputQty: number,
): number {
  if (plannedOutputQty <= 0) return 0
  switch (line.costDriver) {
    case 'Unit': {
      const rate = line.amount / plannedOutputQty
      return Math.round(rate * receivedQty)
    }
    case 'Amount':
    case 'Batch':
      return Math.round(line.amount * (receivedQty / plannedOutputQty))
  }
}

/** Total value of components actually issued into the vendor's process. */
export function handedOverValue(input: SubconAccountingInput): number {
  const cost = new Map(input.components.map(c => [c.sku, c.unitCost]))
  return (input.handovers ?? []).reduce((sum, h) =>
    sum + h.lines.reduce((s, l) => s + (cost.get(l.sku) ?? 0) * l.qty, 0), 0)
}

/** Planned material value — what the BOM says the run should consume. */
export function plannedMaterialValue(input: SubconAccountingInput): number {
  return input.components.reduce((s, c) => s + c.unitCost * c.plannedQty, 0)
}

/** Planned subcon cost — every cost line at its full amount. */
export function plannedSubconCost(input: SubconAccountingInput): number {
  return input.costLines.reduce((s, l) => s + l.amount, 0)
}

// ── The rules ─────────────────────────────────────────────────────────────────

/**
 * Every journal entry a subcon work order should have produced, in the order the
 * events happened.
 *
 * Method differences, all of which come from §2 of the finance brief:
 *
 *  • Resupply — the warehouse transfer to the vendor raises NOTHING. The goods
 *    change location, not owner. Value moves only when materials are issued into
 *    the vendor's process.
 *  • Dropship — identical, except the components are bought rather than moved:
 *    they land in the vendor's warehouse but are ours from that moment.
 *  • Basic   — the vendor's own materials, so there is no material inventory and
 *    no handover at all. Its invoice folds the material value into the service
 *    cost line, and carries no withholding.
 */
export function buildSubconJournals(input: SubconAccountingInput): SubconJournalEntry[] {
  const settings = { ...SUBCON_ACCOUNTING_SETTINGS, ...input.settings }
  const entries: SubconJournalEntry[] = []
  const cost = new Map(input.components.map(c => [c.sku, c]))
  const doc = input.workOrderNumber

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

  // 2. Materials issued into the vendor's process. Posted on HANDOVER, not on
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

  // 3. The vendor's invoice.
  const takesWithholding = withholdingApplies(input.method)
  for (const invoice of input.invoices ?? []) {
    const service = invoice.lines.reduce((s, l) => s + l.amount, 0)
    if (!service) continue
    const vat = Math.round(service * settings.vatRate)
    const withheld = takesWithholding ? Math.round(service * settings.withholdingRate) : 0
    const payable = service + vat - withheld

    const lines: SubconJournalLine[] = invoice.lines.map((l) => {
      const costLine = input.costLines.find(c => c.id === l.costLineId)
      return debit('subconClearing', l.amount, costLine?.name ?? l.costLineId)
    })
    lines.push(debit('vatInput', vat))
    if (withheld) lines.push(credit('withholdingTaxPayable', withheld))
    lines.push(credit('accountsPayable', payable))

    entries.push({
      id: `${invoice.id}-invoice`,
      event: 'vendorInvoice',
      date: invoice.date,
      // Withholding is computed per invoice: a vendor billing twice produces two
      // withholding entries, never one rolled-up figure.
      description: `Subcon vendor invoice — ${doc}`,
      documentNumber: invoice.documentNumber,
      lines,
    })
  }

  // 4 & 5. Each receipt capitalises its share of the subcon cost into WIP, then
  //        releases finished goods out of it.
  const receipts = input.receipts ?? []
  const materialsInWip = input.method === 'basic' ? 0 : handedOverValue(input)
  const totalReceived = receipts.reduce((s, r) => s + r.qty, 0)

  let subconCapitalised = 0
  let materialsReleased = 0

  receipts.forEach((receipt, i) => {
    const isLast = i === receipts.length - 1 && totalReceived >= input.plannedOutputQty

    // ── Capitalise this receipt's subcon cost ──
    // The final receipt of a fully delivered order absorbs any rounding drift, so
    // the clearing accounts land exactly on zero.
    const subconTotal = plannedSubconCost(input)
    const subconLines = input.costLines.map((line) => {
      const amount = allocateCostLine(line, receipt.qty, input.plannedOutputQty)
      return { line, amount }
    })
    let subconForReceipt = subconLines.reduce((s, l) => s + l.amount, 0)
    if (isLast) {
      const drift = subconTotal - (subconCapitalised + subconForReceipt)
      if (drift !== 0 && subconLines.length) {
        subconLines[subconLines.length - 1]!.amount += drift
        subconForReceipt += drift
      }
    }
    if (subconForReceipt) {
      entries.push({
        id: `${receipt.id}-capitalisation`,
        event: 'capitalisation',
        date: receipt.date,
        description: `Subcon cost capitalised into WIP — ${doc}`,
        documentNumber: receipt.documentNumber,
        lines: [
          debit('wip', subconForReceipt),
          ...subconLines
            .filter(l => l.amount !== 0)
            .map(l => credit('subconClearing', l.amount, l.line.name)),
        ],
      })
      subconCapitalised += subconForReceipt
    }

    // ── Release finished goods ──
    // Materials come out at the rate they went in, so cost per unit holds across
    // staged receipts (see OPEN QUESTIONS 2 for the partial-handover case).
    let materialsForReceipt = input.plannedOutputQty > 0
      ? Math.round(materialsInWip * (receipt.qty / input.plannedOutputQty))
      : 0
    if (isLast) materialsForReceipt = materialsInWip - materialsReleased
    materialsReleased += materialsForReceipt

    const finishedGoods = materialsForReceipt + subconForReceipt
    if (finishedGoods) {
      entries.push({
        id: `${receipt.id}-receipt`,
        event: 'goodsReceived',
        date: receipt.date,
        description: `Finished goods received from the vendor — ${doc}`,
        documentNumber: receipt.documentNumber,
        lines: [debit('finishedGoods', finishedGoods), credit('wip', finishedGoods)],
      })
    }
  })

  // 6. Closed short — whatever is still sitting in WIP is written off.
  if (input.closedShort) {
    const remaining = wipBalanceFrom(entries)
    if (remaining > 0) {
      const last = receipts[receipts.length - 1]
      entries.push({
        id: `${input.workOrderNumber}-shortfall`,
        event: 'shortCompletion',
        date: last?.date ?? new Date().toISOString().slice(0, 10),
        description: `Work order closed short — WIP written off — ${doc}`,
        lines: [debit('wasteAccount', remaining), credit('wip', remaining)],
      })
    }
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
  actualSubcon: number
  actualTotal: number
  actualPerUnit: number
  receivedQty: number
}

/**
 * Plan vs actual. "Planned" is what the BOM and cost lines say the run should
 * cost; "actual" is what has really been posted — materials issued, subcon cost
 * capitalised. The two legitimately diverge: reducing a component's planned
 * quantity after part of it has already gone to the vendor changes the plan and
 * posts nothing (see the adjustment rules), and that gap is the point of showing
 * both.
 */
export function subconCostSummary(input: SubconAccountingInput): SubconCostSummary {
  const entries = buildSubconJournals(input)
  const receivedQty = (input.receipts ?? []).reduce((s, r) => s + r.qty, 0)
  const plannedMaterial = input.method === 'basic' ? 0 : plannedMaterialValue(input)
  const plannedSubcon = plannedSubconCost(input)
  const plannedTotal = plannedMaterial + plannedSubcon

  const actualMaterial = input.method === 'basic' ? 0 : handedOverValue(input)
  const actualSubcon = entries
    .filter(e => e.event === 'capitalisation')
    .reduce((s, e) => s + e.lines.reduce((x, l) => x + (l.debit ?? 0), 0), 0)
  const actualTotal = actualMaterial + actualSubcon

  return {
    plannedMaterial,
    plannedSubcon,
    plannedTotal,
    plannedPerUnit: input.plannedOutputQty > 0 ? plannedTotal / input.plannedOutputQty : 0,
    actualMaterial,
    actualSubcon,
    actualTotal,
    actualPerUnit: receivedQty > 0
      ? balanceOf(entries, 'finishedGoods') / receivedQty
      : (input.plannedOutputQty > 0 ? actualTotal / input.plannedOutputQty : 0),
    receivedQty,
  }
}

// ── Component quantity adjustment (§4 of the brief) ───────────────────────────

export type SubconAdjustmentOutcome =
  /** Raise a new shipment: the extra material has to physically reach the vendor. */
  | { kind: 'requiresShipment'; extraQty: number }
  /** Plan-only change. NOT a journal event — only the outstanding quantity moves. */
  | { kind: 'planOnly' }
  /** Below what has already gone out; the way back is a material return. */
  | { kind: 'rejected'; alreadySentQty: number; message: string }
  /** Basic: the materials are the vendor's, so there is nothing to adjust. */
  | { kind: 'notApplicable' }

/**
 * What changing a component's planned quantity should do.
 *
 * The boundary is `alreadySentQty`, and it decides whether a journal exists at all:
 *
 *  • Increasing past what has been sent needs a NEW shipment document — a transfer
 *    (Resupply) or a purchase (Dropship). Editing the planned number alone moves no
 *    goods, so it must not post anything on its own.
 *  • Decreasing to anywhere at or above what has already gone out posts NOTHING.
 *    The material is legitimately with the vendor; only the outstanding quantity
 *    still to send changes. A correcting entry here would invent a movement that
 *    never happened.
 *  • Decreasing BELOW what has gone out is refused: the goods are already there and
 *    the honest route is a material return from the vendor.
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

  if (args.newPlannedQty > args.alreadySentQty && args.newPlannedQty > args.plannedQty) {
    const extraQty = args.newPlannedQty - Math.max(args.plannedQty, args.alreadySentQty)
    if (args.alreadySentQty >= args.plannedQty) return { kind: 'requiresShipment', extraQty }
  }

  if (args.newPlannedQty < args.alreadySentQty) {
    return {
      kind: 'rejected',
      alreadySentQty: args.alreadySentQty,
      message: `${args.alreadySentQty} ${args.unit} of ${args.componentName} has already gone to the vendor. Return it from the vendor first, then reduce the plan.`,
    }
  }

  return { kind: 'planOnly' }
}
