/**
 * Payroll reconciliation (FG-6): UI helpers built on payrollStore.
 *
 * The engine's reconciliation() reads payroll journals only. The PRD defines
 * Ledger = Payroll journals + Manual entries (OD-22), so this module keeps the manual
 * entries an Accountant records on a payroll account, folds them into the report rows,
 * and derives what the PRD hangs off them: the "Suggested, not confirmed" note from the
 * memo, "Repeated manual fix: update the mapping?" (TN-04), "Possible duplicate claim"
 * (TN-27) and "Out of date" after sign-off. Old Talenta Expense sync calls that posted
 * show under Manual entries with a warning.
 *
 * Persists under erp-db:payroll:ui-recon-v1 and empties when the payroll sample resets.
 */
import { reactive, watch, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import {
  payroll, reconciliation, runs, liveJournals, accountLabel, tagsLabel, monthLabel, actingPerson, can, nowWib,
  setVarianceNote, signOffMonth, markReadyForSignOff, monthOf, pph21Monthly, markPph21Reconciled, rupiah, type Tags, type Result,
} from './payrollStore'

export interface ManualEntry { id: string; number: string; month: string; date: string; account: string; tags: Tags; debit: number; credit: number; offset: string; memo: string; by: string; at: string }
interface UiReconState { entries: ManualEntry[]; reSignOffs: Record<string, { by: string; at: string }>; nonStaff: Record<string, true>; seq: number }

const KEY = 'payroll:ui-recon-v1'
const state = reactive<UiReconState>({ entries: [], reSignOffs: {}, nonStaff: {}, seq: 0 })
const snap = loadSnapshot<UiReconState>(KEY)
if (snap?.[0]) Object.assign(state, { nonStaff: {} }, snap[0])
watch(state, () => saveSnapshot(KEY, [state]), { deep: true })
// resetPayroll() replaces the journal list: the sample is back, so manual entries go too.
watch(() => payroll.journals, () => { state.entries = []; state.reSignOffs = {}; state.nonStaff = {}; state.seq = 0 })

const tagsKey = (t: Tags) => `${t.Organization ?? ''}|${t.Branch ?? ''}`
const rowKey = (account: string, t: Tags) => `${account}#${tagsKey(t)}`
const isCost = (code: string) => { const a = payroll.accounts.find((x) => x.code === code); return a?.type === 'expense' || a?.type === 'cogs' }

export const manualEntries = computed(() => state.entries)
export function manualFor(month: string): ManualEntry[] { return state.entries.filter((e) => e.month === month) }

/** Payroll accounts a manual entry may hit, and the offset accounts. */
export const payrollLedgerAccounts = computed(() => payroll.accounts.filter((a) => a.type !== 'cash' && !a.archived))
export const offsetAccounts = computed(() => payroll.accounts.filter((a) => !a.archived))

export function recordManualEntry(o: { date: string; account: string; tags: Tags; side: 'debit' | 'credit'; amount: number; offset: string; memo: string }): Result {
  if (!can('recon.note')) return { ok: false, message: 'Only the Accountant records manual entries here.' }
  if (!o.date) return { ok: false, message: 'Pick a date.' }
  if (!o.account || !o.offset) return { ok: false, message: 'Pick both accounts.' }
  if (o.account === o.offset) return { ok: false, message: 'The offset account must differ.' }
  if (!(o.amount > 0)) return { ok: false, message: 'Type an amount above Rp0.' }
  if (o.memo.trim().length < 5) return { ok: false, message: 'Write a memo of 5 characters or more.' }
  state.seq += 1
  // Same sample clock rule as the engine's now(): each recorded action moves it one minute.
  payroll.clock = new Date(Date.parse(payroll.clock) + 60_000).toISOString()
  const e: ManualEntry = {
    id: `man${state.seq}`, number: `JV-${String(state.seq).padStart(4, '0')}`, month: monthOf(o.date), date: o.date, account: o.account, tags: o.tags,
    debit: o.side === 'debit' ? Math.round(o.amount) : 0, credit: o.side === 'credit' ? Math.round(o.amount) : 0, offset: o.offset, memo: o.memo.trim(), by: actingPerson(), at: payroll.clock,
  }
  state.entries.push(e)
  return { ok: true, number: e.number }
}

/** Reimbursement debit accounts in the current mapping (TN-27). */
const claimAccounts = computed(() => new Set(payroll.settings.mapping.filter((m) => m.role === 'Reimbursement' && m.debit).map((m) => m.debit!)))

/** Claims the month's runs posted, by account and tag. */
function runClaimsByKey(month: string) {
  const out = new Map<string, number>()
  for (const r of runs.value.filter((x) => x.month === month && liveJournals(x.id).length)) {
    for (const j of liveJournals(r.id)) for (const l of j.lines) for (const s of l.sources) {
      if (s.role === 'Reimbursement' && s.side === 'D') out.set(rowKey(l.account, l.tags), (out.get(rowKey(l.account, l.tags)) ?? 0) + Math.round(s.cents / 100))
    }
  }
  return out
}
function prevMonth(m: string) { const [y, mm] = m.split('-').map(Number) as [number, number]; return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}` }

export interface ReconRow { key: string; account: string; label: string; talenta: number; ledger: number; manual: number; variance: number; rounding: boolean; note: { reason: string; note: string; by: string; at: string } | null; suggested: string | null; repeated: boolean; duplicateClaim: { manual: number; runClaims: number } | null; payItem?: boolean; section?: string }

/** The month's report with manual entries folded into the ledger column. */
export function reconView(month: string) {
  const r = reconciliation(month)
  const man = manualFor(month)
  const prevKeys = new Set(manualFor(prevMonth(month)).map((e) => rowKey(e.account, e.tags)))
  const claims = runClaimsByKey(month)
  const byKey = new Map<string, ManualEntry[]>()
  for (const e of man) { const k = rowKey(e.account, e.tags); byKey.set(k, [...(byKey.get(k) ?? []), e]) }

  const fold = (row: { key: string; account: string; label: string; talenta: number; ledger: number; variance: number; rounding: boolean; note: ReconRow['note'] }): ReconRow => {
    const es = byKey.get(row.key) ?? []
    const net = es.reduce((s, e) => s + e.debit - e.credit, 0)
    const signed = (isCost(row.account) ? row.ledger : -row.ledger) + net
    const ledger = Math.abs(signed)
    const variance = ledger - row.talenta
    const isClaim = claimAccounts.value.has(row.account) && net > 0
    return {
      ...row, ledger, manual: net, variance,
      suggested: es.length && variance !== 0 && !row.note ? es.map((e) => e.memo).join('; ') : null,
      repeated: es.length > 0 && prevKeys.has(row.key),
      duplicateClaim: isClaim ? { manual: net, runClaims: claims.get(row.key) ?? 0 } : null,
    }
  }
  const known = new Set([...r.accountRows, ...r.payableRows].map((x) => x.key))
  const extra = [...byKey.keys()].filter((k) => !known.has(k)).map((k) => {
    const e = byKey.get(k)![0]!
    const tl = tagsLabel(e.tags)
    return { key: k, account: e.account, label: `${accountLabel(e.account)}${tl ? ` | ${tl}` : ''}`, talenta: 0, ledger: 0, variance: 0, rounding: false, note: payroll.recon.find((x) => x.month === month)?.notes[k] ?? null }
  })
  const accountRows = [...r.accountRows, ...extra.filter((x) => isCost(x.account))].map(fold).sort((a, b) => a.label.localeCompare(b.label))
  const payableRows = [...r.payableRows, ...extra.filter((x) => !isCost(x.account))].map(fold).sort((a, b) => a.label.localeCompare(b.label))
  const payItemRows: ReconRow[] = r.payItemRows.map((x) => ({ key: x.key, account: '', label: x.name, section: x.section, talenta: x.talenta, ledger: x.ledger, manual: 0, variance: x.variance, rounding: false, note: x.note, suggested: null, repeated: false, duplicateClaim: null, payItem: true }))
  const all = [...accountRows, ...payableRows, ...payItemRows]
  const unexplained = all.filter((x) => x.variance !== 0 && !(x.rounding && Math.abs(x.variance) <= 1_000) && !x.note)
  const oldSync = payroll.oldSync.filter((o) => monthOf(o.date) === month && o.outcome !== 'Blocked')
  const resign = state.reSignOffs[month]
  const lastManual = man.map((e) => e.at).sort().pop()
  const changedAfter = !!r.signOff && !!lastManual && lastManual > r.signOff.at && (!resign || lastManual > resign.at)
  const status = r.status === 'Signed off' && changedAfter ? 'Out of date' : r.status === 'Ready for sign-off' && unexplained.length ? 'Open' : r.status
  return { ...r, accountRows, payableRows, payItemRows, unexplained: unexplained.length, unexplainedRows: unexplained, status, manual: man, oldSync, reSignOff: resign ?? null, manualAfterSignOff: changedAfter }
}

/** Confirm a suggested note: it counts only after a user confirms or edits it. */
export function confirmSuggested(month: string, key: string, note: string): Result {
  return setVarianceNote(month, key, { reason: 'Manual entry', note })
}

/** Ready for sign-off: every variance row, manual entries included, needs a reason and a note. */
export function markReady(month: string): Result {
  if (!can('recon.ready')) return { ok: false, message: 'Only the Accountant sets Ready for sign-off.' }
  const v = reconView(month)
  if (v.unexplained) return { ok: false, message: `${v.unexplained} row${v.unexplained > 1 ? 's need' : ' needs'} a reason and a note.` }
  return markReadyForSignOff(month)
}

/**
 * Sign off. The engine stores signer, time, HR tick and the snapshot. When the engine's
 * record is current but a manual entry came after it, the Finance Manager's new sign-off
 * is recorded here so the month reads Signed off again.
 */
export function signOff(month: string, hrConfirmed: boolean): Result {
  const v = reconView(month)
  if (!can('recon.signoff')) return { ok: false, message: 'Only the Finance Manager signs off.' }
  if (!hrConfirmed) return { ok: false, message: 'Tick "HR confirmed no payroll changes after the last send".' }
  if (v.unexplained) return { ok: false, message: `${v.unexplained} row${v.unexplained > 1 ? 's need' : ' needs'} a reason and a note.` }
  const off = v.checks.find((c) => c.status === 'Off')
  if (off) return { ok: false, message: `${off.label} is off with no confirmed note.` }
  if (v.manualAfterSignOff && reconciliation(month).status === 'Signed off') {
    payroll.clock = new Date(Date.parse(payroll.clock) + 60_000).toISOString()
    state.reSignOffs[month] = { by: actingPerson(), at: payroll.clock }
    return { ok: true, warnings: [] }
  }
  return signOffMonth(month, { hrConfirmed })
}

/** Months to reconcile: every month with a live run or a payroll journal, newest first. */
export const reconMonths = computed(() => {
  const s = new Set<string>()
  for (const r of payroll.runs) if (r.mode === 'Live') s.add(r.month)
  for (const j of payroll.journals) s.add(j.taxMonth)
  for (const e of state.entries) s.add(e.month)
  return [...s].sort().reverse()
})

// ── PPh 21 (OD-23) ─────────────────────────────────────────────────────────

/** Tax Staff marks a manual credit on Hutang PPh 21 as a non-staff source (freelancer bills, TN-32). */
export function markNonStaff(entryId: string, on: boolean): Result {
  if (!can('pph21.reconcile')) return { ok: false, message: 'Only Tax Staff marks non-staff sources.' }
  const e = state.entries.find((x) => x.id === entryId)
  if (!e) return { ok: false }
  if (on) state.nonStaff[entryId] = true
  else delete state.nonStaff[entryId]
  return { ok: true }
}
export function isNonStaff(entryId: string): boolean { return !!state.nonStaff[entryId] }

/**
 * The PPh 21 tax month: the engine's LR-10 rows (regular, severance, DTP, PPh 26) plus a
 * non-staff row. Manual entries on Hutang PPh 21 count in the regular ledger until Tax Staff
 * moves them to the non-staff row. The e-Bupot check compares the filed total with that ledger.
 */
export function pph21View(month: string) {
  const m = pph21Monthly(month)
  const acct = payroll.settings.taxPresets.pph21
  const man = manualFor(month).filter((e) => e.account === acct)
  const net = (es: ManualEntry[]) => es.reduce((s, e) => s + e.credit - e.debit, 0)
  const staffManual = net(man.filter((e) => !state.nonStaff[e.id]))
  const nonStaff = man.filter((e) => state.nonStaff[e.id])
  const rows = m.rows.map((r) => (r.key === 'regular' ? { ...r, ledger: r.ledger + staffManual, variance: r.ledger + staffManual - r.expected } : r))
  rows.push({ key: 'nonstaff', label: 'PPh 21 non-staff', account: acct, expected: net(nonStaff), ledger: net(nonStaff), variance: 0 } as (typeof rows)[number])
  const regular = rows[0]!
  const filedDiff = m.ebupotFiled == null ? null : m.ebupotFiled - regular.ledger
  const filedMessage = filedDiff == null || Math.abs(filedDiff) <= 1_000 ? null : `Filed ${rupiah(Math.abs(filedDiff))} ${filedDiff > 0 ? 'above' : 'below'} ledger. Ask HR to re-send ${monthLabel(month)}.`
  const lastChange = [...payroll.journals.filter((j) => j.taxMonth === month && ['Payroll', 'Difference', 'Reversal'].includes(j.type)).map((j) => j.postedAt), ...man.map((e) => e.at)].sort().pop() ?? ''
  const outOfDate = !!m.reconciled && lastChange > m.reconciled.at
  return { ...m, rows, filedMessage, manual: man, staffManual, outOfDate }
}

/** Mark reconciled with the manual entries counted: blocks when the filed total is off by more than Rp1.000 without a note. */
export function markPph21(month: string, note: string): Result {
  if (!can('pph21.reconcile')) return { ok: false, message: 'Only Tax Staff or the Finance Manager marks PPh 21 reconciled.' }
  const v = pph21View(month)
  if (v.ebupotFiled == null) return { ok: false, message: 'Enter the PPh 21 filed in e-Bupot first.' }
  if (v.filedMessage && note.trim().length < 5) return { ok: false, message: v.filedMessage }
  return markPph21Reconciled(month, note.trim() || undefined)
}

export const REASONS = ['Timing', 'Rounding', 'HR change not re-sent', 'Manual entry', 'Mapping change', 'Other']
export { monthLabel, nowWib }
