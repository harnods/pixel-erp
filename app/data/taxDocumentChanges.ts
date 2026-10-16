/**
 * Output Tax Document change management — the change-detection + tax-impact
 * engine behind PRD-05 (SD-03 "Tax Document Change Matrix").
 *
 * When a Sales Invoice that already carries a DJP-APPROVED Output Tax Document
 * is edited, every changed field is classified into one of three tax actions:
 *
 *   • none         — the field has no bearing on the issued faktur pajak
 *                    (internal/administrative data), so the invoice just saves.
 *   • replacement  — the transaction and the counterparty are unchanged, but the
 *                    faktur now states something incorrect. DJP calls for a
 *                    Faktur Pajak Pengganti: a new document that supersedes the
 *                    approved one and carries the corrected content.
 *   • cancellation — the faktur should not stand at all, because the buyer it
 *                    was issued to changed, or the delivery it reports is no
 *                    longer a taxable delivery in that tax period. DJP calls for
 *                    Pembatalan Faktur Pajak, followed by a fresh faktur.
 *
 * Cancellation outranks replacement outranks none: one cancellation-grade change
 * decides the whole edit, however many replacement-grade changes ride along.
 *
 * A fourth action, `return-note`, is NOT reachable from the matrix: it is raised
 * by a sales return rather than by an edited field (see RETURN_NOTE_FOLLOW_UPS).
 * It shares this type because it answers the same question — "what does this
 * oblige me to do about the faktur I already issued?" — and so reuses the same
 * review drawer.
 *
 * TUNING: the matrix below is the single place this classification lives. To move
 * a field between actions, change its rule here — nothing else in the app hardcodes
 * which field means what.
 */
import { formatIDR } from '~/utils/currency'
import type { SalesInvoiceDetail, SILineItem } from './salesInvoiceDetails'

export type TaxAction = 'none' | 'replacement' | 'cancellation' | 'return-note'

/**
 * Rank used to resolve a mixed set of changes — highest wins.
 *
 * `return-note` sits at 0 because it is never ranked: no matrix rule produces it,
 * so it can't appear in a `DetectedTaxChange[]` for `resolveTaxAction` to weigh
 * against the others. A sales return is its own trigger, decided before any
 * comparison happens.
 */
const ACTION_RANK: Record<TaxAction, number> = { none: 0, 'return-note': 0, replacement: 1, cancellation: 2 }

export interface TaxImpactRule {
  /** Snapshot field this rule governs; line items use the `lineItems` key. */
  key: string
  /** English UI label for the change table's "Field" column. */
  label: string
  action: TaxAction
  /** Plain-language justification shown in the review table. */
  reason: string
}

/**
 * SD-03 Tax Document Change Matrix.
 *
 * Cancellation-grade fields are the ones that change WHO the faktur was issued to
 * or WHETHER it belongs in its tax period at all — a replacement can't fix either,
 * because a Faktur Pajak Pengganti keeps the original's buyer and period.
 */
export const TAX_CHANGE_MATRIX: TaxImpactRule[] = [
  // ── Cancellation ────────────────────────────────────────────────────────────
  {
    key: 'customer', label: 'Customer', action: 'cancellation',
    reason: 'The tax document was issued to a different buyer, so it cannot be corrected by a replacement.',
  },
  {
    key: 'taxPeriod', label: 'Tax period', action: 'cancellation',
    reason: 'The transaction date moves the delivery into another tax period, which a replacement cannot carry.',
  },
  {
    key: 'hasPpn', label: 'VAT applicability', action: 'cancellation',
    reason: 'The transaction is no longer a VAT-able delivery, so the issued tax document must be withdrawn.',
  },

  // ── Replacement ─────────────────────────────────────────────────────────────
  {
    key: 'lineItems', label: 'Products', action: 'replacement',
    reason: 'The delivered goods or services reported on the tax document changed.',
  },
  {
    key: 'total', label: 'Sales invoice total', action: 'replacement',
    reason: 'The transaction value reported on the tax document changed.',
  },
  {
    key: 'dpp', label: 'Dasar pengenaan pajak (DPP)', action: 'replacement',
    reason: 'The tax base reported to DJP changed.',
  },
  {
    key: 'ppn', label: 'Pajak pertambahan nilai (PPN)', action: 'replacement',
    reason: 'The VAT amount reported to DJP changed.',
  },
  {
    key: 'globalDiscount', label: 'Global discount', action: 'replacement',
    reason: 'The discount changes the tax base reported on the tax document.',
  },
  {
    key: 'transactionDate', label: 'Transaction date', action: 'replacement',
    reason: 'The transaction date stated on the tax document changed, but stays inside the same tax period.',
  },
  {
    key: 'billingAddress', label: 'Billing address', action: 'replacement',
    reason: 'The buyer address printed on the tax document changed.',
  },

  // ── No action ───────────────────────────────────────────────────────────────
  { key: 'dueDate',      label: 'Due date',        action: 'none', reason: 'Payment scheduling is not reported on the tax document.' },
  { key: 'paymentTerms', label: 'Payment terms',   action: 'none', reason: 'Payment terms are not reported on the tax document.' },
  { key: 'warehouse',    label: 'Warehouse',       action: 'none', reason: 'Fulfilment data is not reported on the tax document.' },
  { key: 'shipTo',       label: 'Ship to',         action: 'none', reason: 'The shipping address is not reported on the tax document.' },
  { key: 'referenceNo',  label: 'Reference no.',   action: 'none', reason: 'Internal references are not reported on the tax document.' },
  { key: 'email',        label: 'Email',           action: 'none', reason: 'Contact details are not reported on the tax document.' },
  { key: 'tags',         label: 'Tags',            action: 'none', reason: 'Tags are internal labels only.' },
  { key: 'message',      label: 'Message',         action: 'none', reason: 'Customer-facing notes are not reported on the tax document.' },
  { key: 'memo',         label: 'Memo',            action: 'none', reason: 'Internal notes are not reported on the tax document.' },
]

const RULES_BY_KEY = new Map(TAX_CHANGE_MATRIX.map(r => [r.key, r]))

function rule(key: string): TaxImpactRule {
  // Every comparator below reads a key that exists in the matrix; this keeps the
  // lookup total instead of forcing a non-null assertion at each call site.
  return RULES_BY_KEY.get(key) ?? { key, label: key, action: 'none', reason: '' }
}

/**
 * The comparable projection of a Sales Invoice — everything the change matrix
 * can rule on, and nothing derived that would flip on its own between reads.
 */
export interface SalesInvoiceTaxSnapshot {
  customerName: string
  transactionDate: string      // ISO
  taxPeriod: string            // YYYY-MM — the masa pajak the faktur belongs to
  hasPpn: boolean
  billingAddress: string
  lineItems: SILineItem[]
  total: number
  dpp: number
  ppn: number
  globalDiscount: number
  dueDate: string              // ISO
  paymentTerms: string
  warehouse: string
  shipTo: string
  referenceNo: string
  email: string[]
  tags: string[]
  message: string
  memo: string
}

export function buildTaxSnapshot(detail: SalesInvoiceDetail): SalesInvoiceTaxSnapshot {
  return {
    customerName: detail.customer.name,
    transactionDate: detail.date,
    taxPeriod: detail.date.slice(0, 7),
    hasPpn: detail.hasPpn,
    billingAddress: detail.billingAddress,
    lineItems: detail.lineItems.map(it => ({ ...it })),
    total: detail.totals.total,
    dpp: detail.totals.total - detail.totals.taxAmount,
    ppn: detail.totals.taxAmount,
    globalDiscount: detail.totals.globalDiscount,
    dueDate: detail.dueDate,
    paymentTerms: detail.paymentTerms,
    warehouse: detail.warehouse,
    shipTo: detail.shipTo,
    referenceNo: detail.referenceNo,
    email: [...detail.email],
    tags: [...(detail.tags ?? [])],
    message: detail.message,
    memo: detail.memo,
  }
}

export interface DetectedTaxChange {
  key: string
  label: string
  action: TaxAction
  reason: string
  before: string
  after: string
}

/** DD MMM YYYY — the same long form the detail page uses for dates. */
function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}
/** "August 2026" — how a masa pajak reads to a tax user. */
function formatTaxPeriod(period: string): string {
  if (!period) return '—'
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${period}-01T00:00:00`))
}
/** One line item as a single comparable sentence: "Arabica — 10 KG × Rp100.000,00". */
function formatLine(it: SILineItem): string {
  const discount = it.discountPct > 0 ? ` − ${it.discountPct}%` : ''
  return `${it.product} — ${it.qty} ${it.unit} × ${formatIDR(it.unitPrice)}${discount} = ${formatIDR(it.amount)}`
}
function emptyDash(text: string): string { return text.trim() ? text : '—' }

/** Push a change row when `before` and `after` differ under `format`. */
function compare<T>(
  out: DetectedTaxChange[], key: string, before: T, after: T,
  format: (v: T) => string,
): void {
  const b = format(before)
  const a = format(after)
  if (b === a) return
  const r = rule(key)
  out.push({ key: r.key, label: r.label, action: r.action, reason: r.reason, before: b, after: a })
}

/**
 * Line items are compared product-by-product rather than as one opaque blob, so
 * the review table can say exactly which line moved. A product appearing in only
 * one snapshot reads as added ("—" → line) or removed (line → "—").
 */
function compareLineItems(out: DetectedTaxChange[], before: SILineItem[], after: SILineItem[]): void {
  const r = rule('lineItems')
  const keyOf = (it: SILineItem) => `${it.sku}|${it.product}`
  const beforeByKey = new Map(before.map(it => [keyOf(it), it]))
  const afterByKey = new Map(after.map(it => [keyOf(it), it]))
  // Preserve the reading order of the edited invoice, then append what it dropped.
  const keys = [...afterByKey.keys(), ...[...beforeByKey.keys()].filter(k => !afterByKey.has(k))]

  for (const k of keys) {
    const b = beforeByKey.get(k)
    const a = afterByKey.get(k)
    const beforeText = b ? formatLine(b) : '—'
    const afterText = a ? formatLine(a) : '—'
    if (beforeText === afterText) continue
    out.push({
      key: `lineItems:${k}`,
      label: (a ?? b)!.product,
      action: r.action,
      reason: !b ? 'A product was added to the invoice after the tax document was issued.'
        : !a ? 'A product was removed from the invoice after the tax document was issued.'
        : r.reason,
      before: beforeText,
      after: afterText,
    })
  }
}

/**
 * Every difference between the approved-at-issuance invoice and the edited one,
 * ordered most-severe first so the review table leads with what matters.
 */
export function detectTaxChanges(
  before: SalesInvoiceTaxSnapshot, after: SalesInvoiceTaxSnapshot,
): DetectedTaxChange[] {
  const out: DetectedTaxChange[] = []

  compare(out, 'customer', before.customerName, after.customerName, emptyDash)
  compare(out, 'taxPeriod', before.taxPeriod, after.taxPeriod, formatTaxPeriod)
  compare(out, 'hasPpn', before.hasPpn, after.hasPpn, v => (v ? 'PPN 11%' : 'No PPN'))

  compareLineItems(out, before.lineItems, after.lineItems)

  compare(out, 'globalDiscount', before.globalDiscount, after.globalDiscount, formatIDR)
  compare(out, 'dpp', before.dpp, after.dpp, formatIDR)
  compare(out, 'ppn', before.ppn, after.ppn, formatIDR)
  compare(out, 'total', before.total, after.total, formatIDR)

  // Only a same-period date move is a replacement — a cross-period move already
  // registered above as a `taxPeriod` cancellation, and reporting both would read
  // as two problems where there is one.
  if (before.taxPeriod === after.taxPeriod) {
    compare(out, 'transactionDate', before.transactionDate, after.transactionDate, formatDate)
  }
  compare(out, 'billingAddress', before.billingAddress, after.billingAddress, emptyDash)

  compare(out, 'dueDate', before.dueDate, after.dueDate, formatDate)
  compare(out, 'paymentTerms', before.paymentTerms, after.paymentTerms, emptyDash)
  compare(out, 'warehouse', before.warehouse, after.warehouse, emptyDash)
  compare(out, 'shipTo', before.shipTo, after.shipTo, emptyDash)
  compare(out, 'referenceNo', before.referenceNo, after.referenceNo, emptyDash)
  compare(out, 'email', before.email, after.email, v => emptyDash(v.join(', ')))
  compare(out, 'tags', before.tags, after.tags, v => emptyDash(v.join(', ')))
  compare(out, 'message', before.message, after.message, emptyDash)
  compare(out, 'memo', before.memo, after.memo, emptyDash)

  return out.sort((a, b) => ACTION_RANK[b.action] - ACTION_RANK[a.action])
}

/** The one action the whole edit requires — the most severe change decides. */
export function resolveTaxAction(changes: DetectedTaxChange[]): TaxAction {
  return changes.reduce<TaxAction>(
    (worst, c) => (ACTION_RANK[c.action] > ACTION_RANK[worst] ? c.action : worst),
    'none',
  )
}

/** Only the changes that actually drove the resolved action — what the review leads with. */
export function decidingChanges(changes: DetectedTaxChange[]): DetectedTaxChange[] {
  const action = resolveTaxAction(changes)
  return action === 'none' ? [] : changes.filter(c => c.action === action)
}

export interface TaxActionConfig {
  /** Badge/heading label for the resolved action. */
  label: string
  /** Review-drawer headline — what the user is being told. */
  title: string
  /** Review-drawer body — what happens on confirm. */
  description: string
  /** Primary button on the review drawer. */
  confirmLabel: string
  /** Banner colour — MpBanner's own variant names. */
  variant: 'info' | 'warning' | 'danger'
  /** Per-change badge colour (ErpStatusBadge `type`). */
  badgeType: 'completed' | 'announcement' | 'information' | 'warning' | 'critical'
}

export const TAX_ACTION_CONFIG: Record<TaxAction, TaxActionConfig> = {
  none: {
    label: 'No tax action',
    title: 'No tax action required',
    description: 'Your changes do not affect the approved tax document, so it stays as it is.',
    confirmLabel: 'Save changes',
    variant: 'info',
    badgeType: 'announcement',
  },
  replacement: {
    label: 'Replacement',
    title: 'Replacement tax document required',
    description: 'Your changes correct information that the approved tax document already reports. Saving generates a replacement tax document draft for you to review and submit to DJP.',
    confirmLabel: 'Save & generate replacement',
    variant: 'warning',
    badgeType: 'warning',
  },
  cancellation: {
    label: 'Cancellation',
    title: 'Tax document cancellation required',
    description: 'Your changes cannot be corrected by a replacement. Saving cancels the approved tax document and generates a new tax document draft for you to review and submit to DJP.',
    confirmLabel: 'Save & generate cancellation',
    variant: 'danger',
    badgeType: 'critical',
  },
  'return-note': {
    label: 'Return note',
    title: 'Return note required from the buyer',
    description: 'A sales return does not correct the tax document you already issued, so no replacement or cancellation is raised. The buyer issues a return note (nota retur) and sends it to you — that is the document that reduces the VAT you report.',
    confirmLabel: 'Create sales return',
    variant: 'warning',
    badgeType: 'warning',
  },
}

/**
 * What the seller has to do about a sales return on an invoice whose faktur DJP
 * already approved — shown in the review drawer instead of a change table,
 * because a return is not an edit and has no before/after to compare.
 *
 * The mechanism is a nota retur raised by the BUYER, not a Faktur Pajak Pengganti
 * raised by the seller: the issued faktur reported the delivery correctly at the
 * time, and the return is a later event that reduces output VAT in the period the
 * return note is received. That is why the approved faktur is left standing here.
 */
export const RETURN_NOTE_FOLLOW_UPS: string[] = [
  'Ask the buyer to issue a return note (nota retur) for the returned goods.',
  'The return note must state the number and date of the tax document being returned against.',
  'Record the return note against this invoice once the buyer sends it.',
  'The VAT reduction is reported in the tax period you receive the return note, not the tax period of the original tax document.',
]
