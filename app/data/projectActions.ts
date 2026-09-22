/**
 * Project MTO business actions — every operation that touches more than one
 * store lives here, so the data modules stay leaf-level and every action writes
 * its audit entry in one place (PRD §9 / Story 21).
 */
import { TODAY_ISO } from './master'
import {
  projects, phases, workPackages, punchItems, getProject, getPhase, getWorkPackage, projectPhases, projectWorkPackages,
  phaseWorkPackages, weightTotal, persistProjects, newId, clone, type Project,
} from './projects'
import {
  getBudget, addRevision, setBudgetLine, persistBudgets, createBudget, COGM_ACCOUNT, wpBudget, accountName,
  type BudgetRevisionChange, type BudgetLine,
} from './projectBudgets'
import {
  costLines, projectWorkOrders, peggedDocuments, persistLedger, checkBudget, nextWoNumber, woGate,
  type ProjectWorkOrder, type PeggedDocument, type ProjectWoLine,
} from './projectTransactions'
import {
  billingTerms, recognitionPostings, projectInvoices, persistRecognition, nextRecNo, nextInvoiceNo,
  percentComplete, recognisedToDate, recognitionDue, termInvoice, tmEntries,
} from './projectRecognition'
import { changeOrders, engineeringChanges, persistChanges, nextVoNo, pendingChanges, type EcoEffectivity } from './projectChanges'
import { customBoms, getCustomBom, currentVersion, appendVersion, copyMasterBom, persistBoms, bomUnitCost } from './projectBoms'
import {
  reservations, releaseRequests, stockItems, persistReservations, getStockItem, stockItemByName, availableQty, wpReservedQty,
  type Reservation,
} from './projectReservations'
import { approvals, addApproval, persistApprovals, type ApprovalItem } from './projectApprovals'
import { logAudit, type AuditEntry } from './projectAudit'
import { projectPolicy, persistPolicy, type PolicyMode, type PeggedDocType } from './projectPolicy'

export interface Actor { name: string; role: AuditEntry['role'] }

const fmt = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID')
const pct = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'
type Result = { ok: true; message?: string } | { ok: false; error: string }

// ─── Project lifecycle ──────────────────────────────────────────────────────────

/** Draft → Active. Recognition method, measure and production flag lock. */
export function approveProject(projectId: string, actor: Actor): Result {
  const p = getProject(projectId)
  if (!p || p.status !== 'draft') return { ok: false, error: 'Only a draft project can be approved.' }
  // OQ7 (provisional): project release is approved by Finance / Controller, never by the project's own PM.
  if (actor.role !== 'Finance') return { ok: false, error: 'Finance / Controller approves project release. Switch “View as” to approve.' }
  if (actor.name === p.pm) return { ok: false, error: 'You manage this project, so someone else must approve it.' }
  if (p.method === 'output' && p.measure === 'milestone' && weightTotal(p.id) !== 100) {
    return { ok: false, error: `Progress weights total ${pct(weightTotal(p.id))}. Set them to 100% before approving.` }
  }
  p.status = 'active'
  p.approvedAt = TODAY_ISO
  p.approvedBy = actor.name
  persistProjects()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'approval', summary: `Approved project — Draft → Active. Recognition locked to ${methodText(p)}; production flag locked (${p.isProduction ? 'production' : 'service'})` })
  return { ok: true }
}

/** A locked method can only change through re-open approval, which writes an audit entry. */
export function reopenProject(projectId: string, reason: string, actor: Actor): Result {
  const p = getProject(projectId)
  if (!p || p.status !== 'active') return { ok: false, error: 'Only an active project can be re-opened.' }
  if (recognitionPostings.some(r => r.projectId === projectId)) return { ok: false, error: 'Revenue has already been recognised on this project, so the method can’t be re-opened.' }
  p.status = 'draft'
  p.approvedAt = undefined
  p.approvedBy = undefined
  persistProjects()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'method_reopen', summary: 'Re-opened approval — method, measure and production flag unlocked', reason })
  return { ok: true }
}

function methodText(p: Project) {
  return p.method === 'tm' ? 'T&M' : p.method === 'input' ? 'Input (cost-to-cost)' : `Output · ${p.measure}`
}

export function setProjectThreshold(projectId: string, value: number | undefined, actor: Actor): void {
  const p = getProject(projectId)
  if (!p) return
  const from = p.escalationThresholdPct
  p.escalationThresholdPct = value
  persistProjects()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'policy_change', summary: `Escalation threshold ${from === undefined ? 'company default' : pct(from)} → ${value === undefined ? `company default (${pct(projectPolicy.companyThresholdPct)})` : pct(value)}` })
}

export function setCompanyPolicy(data: { companyThresholdPct?: number; docPolicies?: Partial<Record<PeggedDocType, PolicyMode>>; qtyPocOption?: 'A' | 'B'; reservationIssuePolicy?: 'block' | 'warn' }, actor: Actor): void {
  const parts: string[] = []
  if (data.companyThresholdPct !== undefined && data.companyThresholdPct !== projectPolicy.companyThresholdPct) {
    parts.push(`company threshold ${pct(projectPolicy.companyThresholdPct)} → ${pct(data.companyThresholdPct)}`)
    projectPolicy.companyThresholdPct = data.companyThresholdPct
  }
  for (const [k, v] of Object.entries(data.docPolicies ?? {})) {
    const key = k as PeggedDocType
    if (v && projectPolicy.docPolicies[key] !== v) { parts.push(`${key} policy ${projectPolicy.docPolicies[key]} → ${v}`); projectPolicy.docPolicies[key] = v }
  }
  if (data.qtyPocOption && data.qtyPocOption !== projectPolicy.qtyPocOption) { parts.push(`unit-measured Output option ${projectPolicy.qtyPocOption} → ${data.qtyPocOption}`); projectPolicy.qtyPocOption = data.qtyPocOption }
  if (data.reservationIssuePolicy && data.reservationIssuePolicy !== projectPolicy.reservationIssuePolicy) { parts.push(`issue against another project's reservation: ${projectPolicy.reservationIssuePolicy} → ${data.reservationIssuePolicy}`); projectPolicy.reservationIssuePolicy = data.reservationIssuePolicy }
  if (!parts.length) return
  persistPolicy()
  logAudit({ actor: actor.name, role: actor.role, kind: 'policy_change', summary: `Company policy changed: ${parts.join('; ')}` })
}

export function logStructure(projectId: string, summary: string, actor: Actor): void {
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'structure', summary })
}

/** Is anything started against a work package? (Story 20 edit/delete lock) */
export function wpStarted(wpId: string): string | undefined {
  const wp = getWorkPackage(wpId)
  if (!wp) return undefined
  if (wp.status !== 'not_started') return 'Work has started on this work package'
  if (costLines.some(l => l.wpId === wpId)) return 'Transactions are recorded against this work package'
  if (projectWorkOrders.some(w => w.wpId === wpId && w.status !== 'Draft')) return 'A work order is committed against this work package'
  if (reservations.some(r => r.wpId === wpId && r.status !== 'released')) return 'Stock is reserved to this work package'
  if ((wp.confirmedUnits ?? 0) > 0) return 'Units are already confirmed on this work package'
  return undefined
}
export function phaseLockReason(phaseId: string): string | undefined {
  const ph = getPhase(phaseId)
  if (!ph) return undefined
  if (ph.verifiedAt) return 'This phase is verified (BAST recorded), so it can’t be changed'
  for (const w of phaseWorkPackages(phaseId)) {
    const r = wpStarted(w.id)
    if (r) return `A work package in this phase has started (${w.code})`
  }
  return undefined
}

// ─── Recognition & billing (two postings, two clocks) ───────────────────────────

/** Verify a phase by BAST → recognises its weight. Never issues an invoice. */
export function verifyPhase(phaseId: string, bastNo: string, actor: Actor): Result {
  const ph = getPhase(phaseId)
  if (!ph) return { ok: false, error: 'Phase not found' }
  const p = getProject(ph.projectId)!
  if (p.status !== 'active') return { ok: false, error: 'Only an active project can recognise revenue.' }
  const total = weightTotal(p.id)
  if (total !== 100) return { ok: false, error: `Progress weights total ${pct(total)}, not 100%. Fix the weights on the Structure tab before verifying.` }
  if (p.reweightRequired) return { ok: false, error: 'The contract value changed. Reconfirm the unverified weights to 100% of the new value before verifying.' }
  if (!bastNo.trim()) return { ok: false, error: 'Enter the BAST number — a phase is achieved by third-party evidence.' }
  ph.verifiedAt = TODAY_ISO
  ph.bastNo = bastNo.trim()
  const cumulative = projectPhases(p.id).filter(x => x.verifiedAt).reduce((s, x) => s + (x.progressWeightPct ?? 0), 0)
  const target = Math.round((cumulative / 100) * p.contractValue)
  const amount = target - recognisedToDate(p.id)
  const no = nextRecNo(p.id)
  recognitionPostings.push({ id: newId('rec'), no, projectId: p.id, date: TODAY_ISO, kind: 'milestone', phaseId, description: `Phase achieved: ${ph.name} (${ph.bastNo}) — weight ${pct(ph.progressWeightPct ?? 0)}`, cumulativePct: cumulative, amount, by: actor.name })
  persistProjects(); persistRecognition()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'bast', summary: `${ph.bastNo} recorded for phase ${ph.name}`, refNo: ph.bastNo })
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'recognition', summary: `Verified progress: ${ph.name} (${pct(ph.progressWeightPct ?? 0)}) — recognised ${fmt(amount)}. No invoice issued.`, refNo: no })
  return { ok: true, message: `Recognised ${fmt(amount)}. No invoice was issued — billing runs on the contract's own terms.` }
}

/** Input / Output·unit recognition run — posts the difference between live % complete and what's recognised. */
export function runRecognition(projectId: string, actor: Actor): Result {
  const p = getProject(projectId)!
  if (p.status !== 'active') return { ok: false, error: 'Only an active project can recognise revenue.' }
  const due = recognitionDue(p)
  if (!due) return { ok: false, error: 'Nothing to recognise — posted revenue already matches % complete.' }
  const cumulative = percentComplete(p) ?? 0
  const no = nextRecNo(projectId)
  recognitionPostings.push({ id: newId('rec'), no, projectId, date: TODAY_ISO, kind: p.method === 'input' ? 'input' : 'unit', description: `Recognition run — ${pct(cumulative)} complete`, cumulativePct: cumulative, amount: due, by: actor.name })
  persistRecognition()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'recognition', summary: `Recognition run at ${pct(cumulative)} complete — ${due > 0 ? 'recognised' : 'reversed'} ${fmt(Math.abs(due))}`, refNo: no })
  return { ok: true, message: `Recognised ${fmt(due)}.` }
}

/** Issue a contract term invoice — billing only, never recognition. */
export function issueTermInvoice(termId: string, actor: Actor): Result {
  const term = billingTerms.find(t => t.id === termId)
  if (!term) return { ok: false, error: 'Term not found' }
  if (termInvoice(termId)) return { ok: false, error: 'This term is already invoiced.' }
  const p = getProject(term.projectId)!
  if (p.status === 'draft') return { ok: false, error: 'Approve the project before billing.' }
  const amount = Math.round((term.pct / 100) * p.contractValue)
  const no = nextInvoiceNo()
  projectInvoices.push({ id: newId('inv'), no, projectId: p.id, date: TODAY_ISO, termId, description: term.label, amount, status: 'unpaid' })
  persistRecognition()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'billing', summary: `Issued term invoice ${no} — ${term.label} (${fmt(amount)}). No revenue recognised.`, refNo: no })
  return { ok: true, message: `Invoice ${no} issued for ${fmt(amount)}.` }
}

export function setTmDecision(lineId: string, decision: 'bill' | 'write_down' | 'write_up', billAmount: number, actor: Actor): void {
  const l = costLines.find(x => x.id === lineId)
  if (!l?.tm) return
  l.tm.decision = decision
  l.tm.billAmount = decision === 'bill' ? l.tm.hours * l.tm.billRate : billAmount
  persistLedger()
  if (decision !== 'bill') logAudit({ actor: actor.name, role: actor.role, projectId: l.projectId, kind: 'billing', summary: `${decision === 'write_down' ? 'Write-down' : 'Write-up'} on ${l.docNo}: ${fmt(l.tm.hours * l.tm.billRate)} → ${fmt(l.tm.billAmount)}`, refNo: l.docNo })
}

/** T&M: invoice every decided, uninvoiced entry. Recognition = billed for T&M, posted as its own entry. */
export function invoiceTm(projectId: string, actor: Actor): Result {
  const entries = tmEntries(projectId).filter(l => l.tm && l.tm.decision !== 'pending' && !l.tm.invoiceNo)
  const pending = tmEntries(projectId).filter(l => l.tm?.decision === 'pending')
  if (!entries.length) return { ok: false, error: pending.length ? `Decide bill / write-down / write-up on ${pending.length} unbilled entries first.` : 'No unbilled entries.' }
  const amount = entries.reduce((s, l) => s + (l.tm!.billAmount ?? 0), 0)
  const no = nextInvoiceNo()
  for (const l of entries) l.tm!.invoiceNo = no
  projectInvoices.push({ id: newId('inv'), no, projectId, date: TODAY_ISO, description: `Time & materials — ${entries.length} entries`, amount, status: 'unpaid' })
  const rno = nextRecNo(projectId)
  recognitionPostings.push({ id: newId('rec'), no: rno, projectId, date: TODAY_ISO, kind: 'tm', description: `T&M — ${entries.length} entries billed (${no})`, amount, by: actor.name })
  persistLedger(); persistRecognition()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'billing', summary: `T&M invoice ${no} — ${entries.length} entries, ${fmt(amount)}`, refNo: no })
  return { ok: true, message: `Invoice ${no} issued for ${fmt(amount)}.` }
}

export function markInvoicePaid(invoiceId: string): void {
  const inv = projectInvoices.find(i => i.id === invoiceId)
  if (inv) { inv.status = 'paid'; persistRecognition() }
}

// ─── Cost tracking ──────────────────────────────────────────────────────────────

export function classifyCost(lineId: string, classification: 'project' | 'overhead', actor: Actor): void {
  const l = costLines.find(x => x.id === lineId)
  if (!l) return
  l.classification = classification
  persistLedger()
  logAudit({ actor: actor.name, role: actor.role, projectId: l.projectId, kind: 'structure', summary: `Classified ${l.ambiguous} on ${l.docNo} (${fmt(l.amount)}) as ${classification === 'project' ? 'project cost' : 'absorbed overhead'}`, refNo: l.docNo })
}

// ─── Pegged documents (New document) ────────────────────────────────────────────

export interface DocLineInput { description: string; account: string; amount: number; wpId?: string }

/** All-or-nothing pegging (D2): returns the number of untagged lines when partially tagged. */
export function peggingState(lines: DocLineInput[]): { state: 'all' | 'none' | 'partial'; untagged: number } {
  const tagged = lines.filter(l => l.wpId).length
  if (!tagged) return { state: 'none', untagged: lines.length }
  if (tagged === lines.length) return { state: 'all', untagged: 0 }
  return { state: 'partial', untagged: lines.length - tagged }
}

/** Per-work-package budget check for a whole document (lines on the same node are summed). */
export function checkDocument(lines: DocLineInput[]) {
  const byWp = new Map<string, number>()
  for (const l of lines) if (l.wpId) byWp.set(l.wpId, (byWp.get(l.wpId) ?? 0) + l.amount)
  return [...byWp.entries()].map(([wpId, amount]) => ({ wpId, result: checkBudget(wpId, amount) }))
}

const DOC_PREFIX: Record<PeggedDocument['docType'], string> = { PR: 'PR', PO: 'PO', Expense: 'EXP', Timesheet: 'TS' }
function nextDocNo(type: PeggedDocument['docType']) {
  const prefix = `${DOC_PREFIX[type]}/2026/`
  const max = [...peggedDocuments.map(d => d.docNo), ...costLines.map(l => l.docNo)].filter(n => n.startsWith(prefix)).reduce((m, n) => Math.max(m, Number(n.split('/').pop()) || 0), 600)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function saveDocument(input: { docType: PeggedDocument['docType']; vendor?: string; lines: DocLineInput[]; overrideReason?: string }, actor: Actor): Result & { doc?: PeggedDocument } {
  const lines = input.lines.filter(l => l.amount > 0 && l.description.trim())
  if (!lines.length) return { ok: false, error: 'Add at least one line with a description and amount.' }
  const peg = peggingState(lines)
  if (peg.state === 'partial') return { ok: false, error: `${peg.untagged} of ${lines.length} lines have no project. Tag every line with a project, or remove the project from all lines to save as an ordinary expense.` }
  // Story 7: nothing on a Draft project goes firm or consumes budget. A purchase request may be
  // prepared as a draft (no cost lines); firm documents are refused until the project is approved.
  const draftProjects = [...new Set(lines.filter(l => l.wpId).map(l => getProject(getWorkPackage(l.wpId!)!.projectId)!))].filter(p => p.status !== 'active')
  if (draftProjects.length && input.docType !== 'PR') {
    const p = draftProjects[0]!
    return { ok: false, error: `${p.code} is ${p.status === 'closed' ? 'closed' : 'still Draft'}, so documents can’t post to it${p.status === 'draft' ? ' until it’s approved. You can save a purchase request as a draft instead' : ''}.` }
  }
  const docNo = nextDocNo(input.docType)
  const doc: PeggedDocument = { id: newId('doc'), docType: input.docType, docNo, date: TODAY_ISO, vendor: input.vendor, status: 'ordinary', lines, createdBy: actor.name }
  if (draftProjects.length) {
    if (draftProjects.some(p => p.status === 'closed')) return { ok: false, error: `${draftProjects.find(p => p.status === 'closed')!.code} is closed, so documents can’t post to it.` }
    doc.status = 'draft'
    peggedDocuments.unshift(doc)
    persistLedger()
    return { ok: true, doc, message: `${docNo} saved as a draft — nothing is committed until ${draftProjects[0]!.code} is approved.` }
  }
  if (peg.state === 'none') {
    peggedDocuments.unshift(doc)
    persistLedger()
    return { ok: true, doc, message: `${docNo} saved as an ordinary expense — no project budget consumed.` }
  }
  const checks = checkDocument(lines)
  const escalate = checks.filter(c => c.result.verdict === 'escalate')
  const override = checks.filter(c => c.result.verdict === 'override')
  if ((escalate.length || override.length) && !input.overrideReason?.trim()) return { ok: false, error: 'This document exceeds the available budget. Enter a reason to continue.' }
  const worst = [...escalate, ...override].sort((a, b) => (b.result.worst?.overPct ?? 0) - (a.result.worst?.overPct ?? 0))[0]
  if (worst) doc.override = { reason: input.overrideReason!.trim(), by: actor.name, overBy: worst.result.worst!.overBy, overPct: Math.round(worst.result.worst!.overPct * 10) / 10 }
  const projectId = getWorkPackage(lines[0]!.wpId!)!.projectId
  if (escalate.length) {
    doc.status = 'held'
    peggedDocuments.unshift(doc)
    persistLedger()
    const r = worst!.result
    addApproval({ kind: 'overage', projectId, refId: doc.id, refNo: docNo, title: `${lines[0]!.description}${lines.length > 1 ? ` + ${lines.length - 1} more` : ''}`, requestedBy: actor.name, requestedAt: TODAY_ISO, requested: r.requested, available: r.worst!.available, overPct: doc.override!.overPct, reason: doc.override!.reason })
    logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'override', summary: `${docNo} held for Finance — over by ${fmt(r.worst!.overBy)} (${pct(r.worst!.overPct)}), above the ${pct(r.threshold)} threshold`, reason: doc.override!.reason, refNo: docNo })
    return { ok: true, doc, message: `${docNo} is held for Finance approval — it’s above the ${pct(r.threshold)} threshold.` }
  }
  postDocument(doc)
  peggedDocuments.unshift(doc)
  persistLedger()
  if (doc.override) logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'override', summary: `Overrode budget warning on ${docNo} — over by ${fmt(doc.override.overBy)} (${pct(doc.override.overPct)})`, reason: doc.override.reason, refNo: docNo })
  return { ok: true, doc, message: `${docNo} saved and pegged.` }
}

function postDocument(doc: PeggedDocument) {
  doc.status = 'posted'
  for (const l of doc.lines) {
    const wp = getWorkPackage(l.wpId!)!
    const p = getProject(wp.projectId)!
    costLines.push({
      id: newId('cl'), projectId: p.id, wpId: wp.id, account: l.account, docType: doc.docType, docNo: doc.docNo, date: doc.date,
      description: l.description, amount: l.amount, kind: doc.docType === 'PR' || doc.docType === 'PO' ? 'committed' : 'actual',
      vendor: doc.vendor, dimensions: p.dimensions,
    })
  }
}

// ─── Work orders (gate + line budgets) ──────────────────────────────────────────

export function suggestWoLines(customBomId: string | undefined, qty: number): ProjectWoLine[] {
  const b = getCustomBom(customBomId)
  if (!b) return []
  const v = currentVersion(b)
  return [
    ...v.components.map(c => {
      const q = Math.round(c.qty * qty * 100) / 100
      const est = Math.round(q * (c.unitCost ?? 0))
      return { kind: 'material' as const, name: c.name, qty: q, unit: c.unit, unitCost: c.unitCost ?? 0, estimate: est, budget: est }
    }),
    ...v.productionCost.map(pc => ({ kind: pc.kind, name: pc.name, qty, unit: 'Unit', unitCost: pc.perUnit, estimate: pc.perUnit * qty, budget: pc.perUnit * qty })),
  ]
}

/** Line budgets never exceed the set-aside (Story 18): when the estimate is higher, scale them down proportionally. */
export function fitLineBudgets(lines: ProjectWoLine[], setAside: number): ProjectWoLine[] {
  const est = lines.reduce((s, l) => s + l.estimate, 0)
  if (!setAside || est <= setAside || est <= 0) return lines
  let acc = 0
  return lines.map((l, i) => {
    const budget = i === lines.length - 1 ? setAside - acc : Math.floor(l.estimate * (setAside / est))
    acc += budget
    return { ...l, budget }
  })
}

export function createProjectWo(input: { wpId: string; qty: number; budgetSetAside: number; lines: ProjectWoLine[]; overrideReason?: string }, actor: Actor): Result & { wo?: ProjectWorkOrder } {
  const wp = getWorkPackage(input.wpId)
  if (!wp) return { ok: false, error: 'Pick a work package.' }
  const p = getProject(wp.projectId)!
  if (!input.budgetSetAside) return { ok: false, error: 'Enter the budget for this work order.' }
  const allocated = input.lines.reduce((s, l) => s + (l.budget || 0), 0)
  if (allocated > input.budgetSetAside) return { ok: false, error: `Line budgets total ${fmt(allocated)}, which is ${fmt(allocated - input.budgetSetAside)} over the budget set aside.` }
  const gate = woGate(wp.id)
  const over = gate.available === undefined ? 0 : Math.max(input.budgetSetAside - gate.available, 0)
  const total = gate.total ?? 0
  const overPct = total ? (over / total) * 100 : (over ? 100 : 0)
  const threshold = p.escalationThresholdPct ?? projectPolicy.companyThresholdPct
  if (over && !input.overrideReason?.trim()) return { ok: false, error: 'The budget for this work order exceeds what’s available. Enter a reason to continue.' }
  const held = over > 0 && overPct > threshold
  const b = getCustomBom(wp.customBomId)
  const wo: ProjectWorkOrder = {
    id: newId('pwo'), number: nextWoNumber(), projectId: p.id, wpId: wp.id,
    status: held || p.status === 'draft' ? 'Draft' : 'Released',
    qty: input.qty, unit: wp.unit ?? 'Unit', budgetSetAside: input.budgetSetAside,
    estimate: input.lines.reduce((s, l) => s + l.estimate, 0), actual: 0,
    customBomId: wp.customBomId, bomVersion: b ? currentVersion(b).version : undefined,
    lines: input.lines, createdAt: TODAY_ISO, createdBy: actor.name,
    override: over ? { reason: input.overrideReason!.trim(), overBy: over, by: actor.name } : undefined,
  }
  projectWorkOrders.push(wo)
  persistLedger()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'work_order', summary: `Created ${wo.number} on ${wp.code} ${wp.name} — ${fmt(wo.budgetSetAside)} set aside on Cost of production (estimate ${fmt(wo.estimate)})`, refNo: wo.number })
  if (over) {
    logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'override', summary: `${held ? 'Held for Finance' : 'Overrode budget warning'} on ${wo.number} — over available by ${fmt(over)} (${pct(overPct)})`, reason: wo.override!.reason, refNo: wo.number })
  }
  if (held) {
    addApproval({ kind: 'overage', projectId: p.id, refId: wo.id, refNo: wo.number, title: `Work order ${wo.number} — ${wp.code} ${wp.name}`, requestedBy: actor.name, requestedAt: TODAY_ISO, requested: input.budgetSetAside, available: gate.available, overPct: Math.round(overPct * 10) / 10, reason: wo.override!.reason })
    return { ok: true, wo, message: `${wo.number} is held for Finance approval — it’s above the ${pct(threshold)} threshold.` }
  }
  return { ok: true, wo, message: p.status === 'draft' ? `${wo.number} saved as draft — nothing is committed until the project is approved.` : `${wo.number} released. ${fmt(wo.budgetSetAside)} committed to Cost of production.` }
}

export function advanceWo(woId: string, actor: Actor): Result {
  const wo = projectWorkOrders.find(w => w.id === woId)
  if (!wo) return { ok: false, error: 'Work order not found' }
  if (wo.status === 'Released') { wo.status = 'In progress'; wo.actual = Math.round(wo.estimate * 0.35) }
  else if (wo.status === 'In progress') return completeWo(woId, actor)
  persistLedger()
  return { ok: true }
}

/** Completion releases unused set-aside (and unconsumed reservations) with audit entries. */
export function completeWo(woId: string, actor: Actor): Result {
  const wo = projectWorkOrders.find(w => w.id === woId)
  if (!wo || wo.status === 'Completed') return { ok: false, error: 'Work order is already completed.' }
  if (wo.actual === 0) wo.actual = Math.min(wo.estimate, wo.budgetSetAside)
  wo.status = 'Completed'
  wo.completedAt = TODAY_ISO
  wo.released = Math.max(wo.budgetSetAside - wo.actual, 0)
  const wp = getWorkPackage(wo.wpId)
  if (wp && wp.plannedUnits) wp.confirmedUnits = Math.min((wp.confirmedUnits ?? 0) + wo.qty, wp.plannedUnits)
  persistLedger(); persistProjects()
  logAudit({ actor: 'System', role: 'System', projectId: wo.projectId, kind: 'work_order', summary: `${wo.number} completed — actual ${fmt(wo.actual)}; unused set-aside ${fmt(wo.released)} released`, refNo: wo.number })
  return { ok: true, message: `${wo.number} completed. ${fmt(wo.released)} of unused set-aside released.` }
}

// ─── Approvals inbox ────────────────────────────────────────────────────────────

export function decideApproval(id: string, approve: boolean, actor: Actor, note?: string): Result {
  const a = approvals.find(x => x.id === id)
  if (!a || a.status !== 'pending') return { ok: false, error: 'This request is no longer pending.' }
  if (a.requestedBy === actor.name) return { ok: false, error: 'You raised this request, so someone else must decide it.' }
  // OQ23 (provisional): a customer-funded ECO applies after its change order — approve the VO first.
  if (approve && a.kind === 'eco') {
    const eco = engineeringChanges.find(e => e.id === a.refId)
    const vo = eco?.voId ? changeOrders.find(v => v.id === eco.voId) : undefined
    if (vo && vo.status !== 'approved') return { ok: false, error: `This engineering change is funded by ${vo.no}. Approve the change order first — its budget revision applies before this one.` }
  }
  // A budget-revision proposal is a full baseline snapshot: applying it after the budget moved
  // would silently revert the revisions made in between. Refuse and ask for a resubmit.
  if (approve && a.kind === 'budget_revision' && a.payload) {
    const b = getBudget(a.projectId)
    const current = b?.revisions.length ?? 0
    if (a.payload.baseRevisionNo !== undefined && current !== a.payload.baseRevisionNo) {
      return { ok: false, error: `The budget changed after this request was raised (now at revision #${current}). Reject it and ask ${a.requestedBy} to resubmit from Budget setup.` }
    }
  }
  // A release request is decided against the reservation as it is now, not as it was when asked.
  if (approve && a.kind === 'stock_release') {
    const q = releaseRequests.find(x => x.id === a.refId)
    const r = q ? reservations.find(x => x.id === q.fromReservationId) : undefined
    if (q && (!r || (r.status !== 'reserved' && r.status !== 'picked') || r.qty < q.qty)) {
      const item = getStockItem(q.itemId)
      return { ok: false, error: `The reservation changed since this request — ${r ? `${r.qty} ${item?.unit ?? ''} ${r.status}` : 'it no longer exists'}. Reject it and raise a new release request.` }
    }
  }
  a.status = approve ? 'approved' : 'rejected'
  a.decidedBy = actor.name
  a.decidedAt = TODAY_ISO
  a.decisionNote = note
  const verb = approve ? 'Approved' : 'Rejected'
  switch (a.kind) {
    case 'overage': applyOverage(a, approve, actor); break
    case 'change_order': approve ? applyVoApproval(a.refId, actor) : rejectVo(a.refId, actor, note); break
    case 'eco': approve ? applyEcoApproval(a.refId, actor) : rejectEco(a.refId, actor, note); break
    case 'stock_release': applyReleaseDecision(a.refId, approve, actor); break
    case 'budget_revision': if (approve) applyBudgetRequest(a, actor); break
  }
  persistApprovals()
  if (a.kind === 'overage' || a.kind === 'budget_revision') {
    logAudit({ actor: actor.name, role: actor.role, projectId: a.projectId, kind: a.kind === 'overage' ? 'override' : 'budget_revision', summary: `${verb} ${a.kind === 'overage' ? 'held document' : 'budget revision request'} ${a.refNo}`, reason: note, refNo: a.refNo })
  }
  return { ok: true, message: `${verb} ${a.refNo}.` }
}

function applyOverage(a: ApprovalItem, approve: boolean, _actor: Actor) {
  const doc = peggedDocuments.find(d => d.id === a.refId)
  if (doc) {
    if (approve) postDocument(doc)
    else doc.status = 'rejected'
    persistLedger()
    return
  }
  const wo = projectWorkOrders.find(w => w.id === a.refId)
  if (wo) {
    if (approve) wo.status = 'Released'
    else projectWorkOrders.splice(projectWorkOrders.indexOf(wo), 1)
    persistLedger()
  }
}

function applyBudgetRequest(a: ApprovalItem, actor: Actor) {
  if (a.payload) {
    saveBudgetRevision(a.projectId, a.payload, `${a.reason ?? ''} (${a.refNo}, raised by ${a.requestedBy})`, actor)
    return
  }
  // Seed request BR-2606-01 — move reserve to a line. Generic requests just log.
  if (a.refId === 'brq-1') {
    const b = getBudget('ps-2606')
    if (!b) return
    const fromRes = b.reserves['ph-2606-1'] ?? 0
    b.reserves['ph-2606-1'] = Math.max(fromRes - 6_000_000, 0)
    const from = wpBudget('wp-2606-21', '5-50400') ?? 0
    setBudgetLine('ps-2606', 'wp-2606-21', '5-50400', from + 6_000_000)
    persistBudgets()
    addRevision('ps-2606', { date: TODAY_ISO, by: actor.name, reason: a.reason ?? '', source: 'manual', refNo: a.refNo, changes: [
      { phaseId: 'ph-2606-1', field: 'reserve', from: fromRes, to: b.reserves['ph-2606-1']! },
      { wpId: 'wp-2606-21', account: '5-50400', field: 'line', from, to: from + 6_000_000 },
    ] })
  }
}

// ─── Change orders ──────────────────────────────────────────────────────────────

export function captureSiteChange(input: { projectId: string; wpId: string; title: string; description: string; requestedBy: string; executed: boolean; photoCount: number }, actor: Actor): Result & { no?: string } {
  const p = getProject(input.projectId)
  if (!p) return { ok: false, error: 'Pick a project.' }
  if (!input.title.trim() || !input.requestedBy.trim() || !input.wpId) return { ok: false, error: 'Fill in what changed, the work package and who requested it.' }
  const no = nextVoNo(p.code)
  changeOrders.unshift({ id: newId('vo'), no, projectId: p.id, wpId: input.wpId, title: input.title.trim(), description: input.description.trim(), requestedBy: input.requestedBy.trim(), capturedBy: actor.name, source: 'site', status: 'requested', executed: input.executed, distinct: false, createdAt: TODAY_ISO, photoCount: input.photoCount })
  persistChanges()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'change_order', summary: `Site change captured: ${input.title.trim()}${input.executed ? ' (already executed — flagged as unbilled exposure)' : ''}`, refNo: no })
  return { ok: true, no }
}

export function createOfficeVo(input: { projectId: string; wpId: string; title: string; description: string; requestedBy: string }, actor: Actor): Result & { id?: string } {
  const p = getProject(input.projectId)!
  const no = nextVoNo(p.code)
  const id = newId('vo')
  changeOrders.unshift({ id, no, projectId: p.id, wpId: input.wpId, title: input.title, description: input.description, requestedBy: input.requestedBy, capturedBy: actor.name, source: 'office', status: 'requested', executed: false, distinct: false, createdAt: TODAY_ISO })
  persistChanges()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'change_order', summary: `Change order ${no} created: ${input.title}`, refNo: no })
  return { ok: true, id }
}

/** PM prices and raises (step 1 of 2). Finance approves in the inbox (step 2). */
export function raiseVo(voId: string, data: { cost: number; price: number; distinct: boolean; reason: string }, actor: Actor): Result {
  const vo = changeOrders.find(v => v.id === voId)
  if (!vo) return { ok: false, error: 'Change order not found' }
  if (!data.reason.trim()) return { ok: false, error: 'A reason is required.' }
  if (!data.price) return { ok: false, error: 'Enter the customer price.' }
  Object.assign(vo, { cost: data.cost, price: data.price, distinct: data.distinct, reason: data.reason.trim(), status: 'raised', raisedBy: actor.name, raisedAt: TODAY_ISO })
  persistChanges()
  addApproval({ kind: 'change_order', projectId: vo.projectId, refId: vo.id, refNo: vo.no, title: vo.title, requestedBy: actor.name, requestedAt: TODAY_ISO, amount: data.price, reason: data.reason.trim() })
  logAudit({ actor: actor.name, role: actor.role, projectId: vo.projectId, kind: 'change_order', summary: `Raised ${vo.no} for approval — price ${fmt(data.price)}, cost ${fmt(data.cost)}, ${data.distinct ? 'distinct' : 'not distinct'}`, reason: data.reason.trim(), refNo: vo.no })
  return { ok: true, message: `${vo.no} sent to Finance for approval.` }
}

/** Approval: contract value and target budget update through the revision mechanism; not-distinct → cumulative catch-up. */
function applyVoApproval(voId: string, actor: Actor) {
  const vo = changeOrders.find(v => v.id === voId)
  if (!vo) return
  const p = getProject(vo.projectId)!
  const wp = getWorkPackage(vo.wpId)!
  const oldValue = p.contractValue
  p.contractValue = oldValue + (vo.price ?? 0)
  vo.status = 'approved'
  vo.decidedBy = actor.name
  vo.decidedAt = TODAY_ISO
  // Budget: the price always lifts the revenue baseline; a priced cost also lifts the target
  // work package's line. Either way it's one revision with an audit entry.
  const b = getBudget(p.id)
  if (b && (vo.price || vo.cost)) {
    const changes: BudgetRevisionChange[] = []
    const account = wp.type === 'production' ? COGM_ACCOUNT : '5-50400'
    const lineFrom = wpBudget(wp.id, account) ?? 0
    if (vo.cost) {
      setBudgetLine(p.id, wp.id, account, lineFrom + vo.cost)
      changes.push({ wpId: wp.id, account, field: 'line', from: lineFrom, to: lineFrom + vo.cost })
    }
    if (vo.price) {
      changes.push({ field: 'revenue', from: b.revenue, to: b.revenue + vo.price })
      b.revenue += vo.price
    }
    persistBudgets()
    addRevision(p.id, { date: TODAY_ISO, by: actor.name, reason: `Change order ${vo.no}: ${vo.title}`, source: 'change order', refNo: vo.no, changes })
    logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'budget_revision', summary: `Budget revision from ${vo.no}: ${vo.cost ? `${wp.code} ${accountName(account)} ${fmt(lineFrom)} → ${fmt(lineFrom + vo.cost)}; ` : ''}revenue +${fmt(vo.price ?? 0)}`, refNo: vo.no })
  }
  // Recognition: not-distinct → one-time cumulative catch-up; distinct → prospective
  if (!vo.distinct) {
    const pc = percentComplete(p)
    if (pc !== undefined && pc > 0 && p.method !== 'tm') {
      const catchUp = Math.round((pc / 100) * p.contractValue) - recognisedToDate(p.id)
      if (catchUp && !(p.method === 'output' && p.measure === 'milestone')) {
        vo.catchUp = catchUp
        recognitionPostings.push({ id: newId('rec'), no: nextRecNo(p.id), projectId: p.id, date: TODAY_ISO, kind: 'catch_up', description: `Cumulative catch-up — ${vo.no} (${pct(pc)} × new contract value)`, cumulativePct: pc, amount: catchUp, by: actor.name })
      } else if (p.method === 'output' && p.measure === 'milestone') {
        const verifiedPct = projectPhases(p.id).filter(x => x.verifiedAt).reduce((s, x) => s + (x.progressWeightPct ?? 0), 0)
        const cu = Math.round((verifiedPct / 100) * p.contractValue) - recognisedToDate(p.id)
        if (cu) {
          vo.catchUp = cu
          recognitionPostings.push({ id: newId('rec'), no: nextRecNo(p.id), projectId: p.id, date: TODAY_ISO, kind: 'catch_up', description: `Cumulative catch-up — ${vo.no} (verified ${pct(verifiedPct)} × new contract value)`, cumulativePct: verifiedPct, amount: cu, by: actor.name })
        }
      }
      persistRecognition()
    }
  }
  if (p.method === 'output' && p.measure === 'milestone') p.reweightRequired = true
  persistProjects(); persistChanges()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'change_order', summary: `Approved ${vo.no} — contract value ${fmt(oldValue)} → ${fmt(p.contractValue)}${vo.catchUp ? `; catch-up ${fmt(vo.catchUp)} recognised in the current period` : vo.distinct ? '; distinct — treated prospectively' : ''}`, refNo: vo.no })
}

function rejectVo(voId: string, actor: Actor, note?: string) {
  const vo = changeOrders.find(v => v.id === voId)
  if (!vo) return
  vo.status = 'rejected'
  vo.decidedBy = actor.name
  vo.decidedAt = TODAY_ISO
  // An ECO this VO was funding is no longer customer-funded — unlink it so it can still be decided on its own.
  for (const e of engineeringChanges.filter(x => x.voId === vo.id && (x.status === 'draft' || x.status === 'pending'))) {
    e.voId = undefined
    logAudit({ actor: actor.name, role: actor.role, projectId: e.projectId, kind: 'eco', summary: `${e.no} is no longer customer-funded — ${vo.no} was rejected. Any cost delta is now absorbed by the project budget if approved.`, refNo: e.no })
  }
  persistChanges()
  logAudit({ actor: actor.name, role: actor.role, projectId: vo.projectId, kind: 'change_order', summary: `Rejected ${vo.no}`, reason: note, refNo: vo.no })
}

/** Unverified phase weights reconfirmed to 100% of the new contract value (after a VO). */
export function reconfirmWeights(projectId: string, actor: Actor): Result {
  const p = getProject(projectId)!
  if (weightTotal(projectId) !== 100) return { ok: false, error: `Weights total ${pct(weightTotal(projectId))}. They must total 100% of the new contract value.` }
  p.reweightRequired = false
  persistProjects()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'structure', summary: `Reconfirmed progress weights at 100% of the new contract value (${fmt(p.contractValue)})` })
  return { ok: true }
}

// ─── Engineering change (ECO) ───────────────────────────────────────────────────

export function createEco(input: { projectId: string; wpId: string; title: string; reason: string; voId?: string }, actor: Actor): Result & { id?: string } {
  const wp = getWorkPackage(input.wpId)
  const b = getCustomBom(wp?.customBomId)
  if (!wp || !b) return { ok: false, error: 'This work package has no custom BOM to change.' }
  const p = getProject(input.projectId)!
  const cur = currentVersion(b)
  const id = newId('eco')
  const code = p.code.replace('PS-', '')
  const n = engineeringChanges.filter(e => e.projectId === p.id).length + 1
  engineeringChanges.unshift({ id, no: `ECO-${code}-${String(n).padStart(2, '0')}`, projectId: p.id, wpId: wp.id, customBomId: b.id, title: input.title, reason: input.reason, status: 'draft', specificWoIds: [], baseVersion: cur.version, proposed: { components: clone(cur.components), productionCost: clone(cur.productionCost) }, voId: input.voId, raisedBy: actor.name, createdAt: TODAY_ISO })
  persistChanges()
  return { ok: true, id }
}

/** Submit requires an explicit effectivity scope — never defaulted silently. */
export function submitEco(ecoId: string, effectivity: EcoEffectivity | undefined, woIds: string[], actor: Actor): Result {
  const e = engineeringChanges.find(x => x.id === ecoId)
  if (!e) return { ok: false, error: 'ECO not found' }
  if (!effectivity) return { ok: false, error: 'Choose which work orders this change applies to before submitting.' }
  if (effectivity === 'specific' && !woIds.length) return { ok: false, error: 'Pick at least one work order.' }
  if (engineeringChanges.some(x => x.id !== e.id && x.customBomId === e.customBomId && x.status === 'pending')) return { ok: false, error: 'Another ECO is already pending on this BOM. ECOs on one BOM are serialised — wait for it to be decided.' }
  e.effectivity = effectivity
  e.specificWoIds = woIds
  e.status = 'pending'
  persistChanges()
  addApproval({ kind: 'eco', projectId: e.projectId, refId: e.id, refNo: e.no, title: `${e.title} — ${getWorkPackage(e.wpId)?.name}`, requestedBy: actor.name, requestedAt: TODAY_ISO, reason: e.reason })
  logAudit({ actor: actor.name, role: actor.role, projectId: e.projectId, kind: 'eco', summary: `Submitted ${e.no} — effectivity: ${effectivityText(effectivity, woIds)}`, reason: e.reason, refNo: e.no })
  return { ok: true, message: `${e.no} sent for approval.` }
}

export function effectivityText(eff: EcoEffectivity | undefined, woIds: string[] = []): string {
  if (eff === 'new_only') return 'new work orders only'
  if (eff === 'all_open') return 'all open work orders'
  if (eff === 'specific') return `specific work orders (${woIds.map(id => projectWorkOrders.find(w => w.id === id)?.number).filter(Boolean).join(', ')})`
  return 'not chosen'
}

/** Open work orders for ECO effectivity — Draft and Released (OQ20 assumption; In progress excluded). */
export function ecoAffectedWos(e: { wpId: string; effectivity?: EcoEffectivity; specificWoIds: string[] }): ProjectWorkOrder[] {
  const open = projectWorkOrders.filter(w => w.wpId === e.wpId && (w.status === 'Draft' || w.status === 'Released'))
  if (e.effectivity === 'all_open') return open
  if (e.effectivity === 'specific') return projectWorkOrders.filter(w => e.specificWoIds.includes(w.id))
  return []
}

function applyEcoApproval(ecoId: string, actor: Actor) {
  const e = engineeringChanges.find(x => x.id === ecoId)
  if (!e) return
  const b = getCustomBom(e.customBomId)!
  const before = currentVersion(b)
  const v = appendVersion(b.id, { createdAt: TODAY_ISO, createdBy: actor.name, source: 'eco', refNo: e.no, note: e.title, components: e.proposed.components, productionCost: e.proposed.productionCost })!
  e.status = 'approved'
  e.decidedBy = actor.name
  e.decidedAt = TODAY_ISO
  e.resultVersion = v.version
  // Cost delta on affected work orders → budget revision in the budget module
  const unitDelta = bomUnitCost(v) - bomUnitCost(before)
  const affected = ecoAffectedWos(e)
  const wp = getWorkPackage(e.wpId)!
  // Units that get the new version: future work orders (remaining units not yet on any open WO —
  // they'll be built from the new current version) plus the work orders in the effectivity scope.
  // In-progress / unselected work orders keep their version, so their units carry no delta.
  const deltaTotal = Math.round(unitDelta * ecoDeltaUnits(e))
  const overSetAside: string[] = []
  for (const w of affected) {
    w.bomVersion = v.version
    w.lines = fitLineBudgets(suggestWoLines(b.id, w.qty), w.budgetSetAside)
    w.estimate = w.lines.reduce((s, l) => s + l.estimate, 0)
    if (w.budgetSetAside && w.estimate > w.budgetSetAside) overSetAside.push(`${w.number} estimate ${fmt(w.estimate)} > set-aside ${fmt(w.budgetSetAside)}`)
  }
  if (overSetAside.length) logAudit({ actor: 'System', role: 'System', projectId: e.projectId, kind: 'work_order', summary: `${e.no}: line budgets kept within set-aside; ${overSetAside.join('; ')}`, refNo: e.no })
  if (deltaTotal && getBudget(e.projectId)) {
    const from = wpBudget(e.wpId, COGM_ACCOUNT) ?? 0
    setBudgetLine(e.projectId, e.wpId, COGM_ACCOUNT, from + deltaTotal)
    persistBudgets()
    addRevision(e.projectId, { date: TODAY_ISO, by: actor.name, reason: `Engineering change ${e.no}: ${e.title}`, source: 'engineering change', refNo: e.no, changes: [{ wpId: e.wpId, account: COGM_ACCOUNT, field: 'line', from, to: from + deltaTotal }] })
    logAudit({ actor: actor.name, role: actor.role, projectId: e.projectId, kind: 'budget_revision', summary: `Budget revision from ${e.no}: ${wp.code} Cost of production ${fmt(from)} → ${fmt(from + deltaTotal)}`, refNo: e.no })
  }
  // Reservations: removed components free their reservations; added components create requirements
  const removed = before.components.filter(c => !v.components.some(x => x.name === c.name))
  const added = v.components.filter(c => !before.components.some(x => x.name === c.name))
  for (const c of removed) {
    const item = stockItemByName(c.name)
    if (!item) continue
    for (const r of reservations.filter(x => x.wpId === e.wpId && x.itemId === item.id && x.status === 'reserved')) {
      r.status = 'released'; r.releasedAt = TODAY_ISO; r.releaseReason = `Removed by ${e.no}`
      logAudit({ actor: actor.name, role: actor.role, projectId: e.projectId, kind: 'reservation', summary: `Released ${r.qty} ${item.unit} ${item.name} — component removed by ${e.no}`, refNo: e.no })
    }
  }
  persistReservations(); persistLedger(); persistChanges(); persistBoms()
  logAudit({ actor: actor.name, role: actor.role, projectId: e.projectId, kind: 'eco', summary: `Approved ${e.no} — BOM v${before.version} → v${v.version}; effectivity ${effectivityText(e.effectivity, e.specificWoIds)}; ${affected.length} work order(s) updated; ${added.length} new requirement(s) for MRP`, refNo: e.no })
}

/** Units that receive an ECO's new version: future work orders (remaining units not yet on any
 *  open WO — they're built from the new current version) plus the WOs in the effectivity scope.
 *  In-progress and unselected WOs keep their version, so their units carry no cost delta. */
export function ecoDeltaUnits(e: { wpId: string; effectivity?: EcoEffectivity; specificWoIds: string[] }): number {
  const wp = getWorkPackage(e.wpId)
  if (!wp) return 0
  const remainingUnits = Math.max((wp.plannedUnits ?? 0) - (wp.confirmedUnits ?? 0), 0)
  const futureUnits = Math.max(remainingUnits - affectedQty(e.wpId), 0)
  return futureUnits + ecoAffectedWos(e).reduce((s, w) => s + w.qty, 0)
}

function affectedQty(wpId: string) {
  return projectWorkOrders.filter(w => w.wpId === wpId && w.status !== 'Completed').reduce((s, w) => s + w.qty, 0)
}

function rejectEco(ecoId: string, actor: Actor, note?: string) {
  const e = engineeringChanges.find(x => x.id === ecoId)
  if (!e) return
  e.status = 'rejected'
  e.decidedBy = actor.name
  e.decidedAt = TODAY_ISO
  persistChanges()
  logAudit({ actor: actor.name, role: actor.role, projectId: e.projectId, kind: 'eco', summary: `Rejected ${e.no}`, reason: note, refNo: e.no })
}

export function revertBom(bomId: string, toVersion: number, actor: Actor): Result {
  const b = getCustomBom(bomId)
  const target = b?.versions.find(v => v.version === toVersion)
  if (!b || !target) return { ok: false, error: 'Version not found' }
  const v = appendVersion(bomId, { createdAt: TODAY_ISO, createdBy: actor.name, source: 'revert', note: `Reverted to v${toVersion} content`, components: target.components, productionCost: target.productionCost })!
  logAudit({ actor: actor.name, role: actor.role, projectId: b.projectId, kind: 'eco', summary: `Reverted ${b.name} to v${toVersion} content — saved as v${v.version} (history kept)` })
  return { ok: true, message: `Saved as v${v.version}.` }
}

/** Replace or remove a custom BOM — only while no open work order references it. */
export function replaceCustomBom(wpId: string, masterId: string | undefined, reason: string, actor: Actor): Result {
  const wp = getWorkPackage(wpId)!
  const p = getProject(wp.projectId)!
  const cur = getCustomBom(wp.customBomId)
  if (cur && projectWorkOrders.some(w => w.customBomId === cur.id && w.status !== 'Completed')) {
    return { ok: false, error: 'An open work order uses this BOM, so it can’t be replaced. Raise an engineering change instead.' }
  }
  if (cur && !reason.trim()) return { ok: false, error: 'Enter a reason for replacing the BOM.' }
  if (masterId) {
    const res = copyMasterBom(masterId, p.id, wp.id, p.code, actor.name, TODAY_ISO)
    if ('error' in res) return { ok: false, error: res.error }
    wp.customBomId = res.id
  } else {
    wp.customBomId = undefined
  }
  if (cur) { cur.archived = { at: TODAY_ISO, reason: reason.trim() }; persistBoms() }
  persistProjects()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'structure', summary: `${cur ? (masterId ? 'Replaced' : 'Removed') : 'Attached'} BOM on ${wp.code} ${wp.name}${cur ? ` — previous copy archived` : ''}`, reason: reason || undefined })
  return { ok: true }
}

// ─── MRP + reservations ─────────────────────────────────────────────────────────

export interface MrpRow {
  item: string
  unit: string
  gross: number
  alreadyReserved: number
  net: number
  onHand: number
  reservedElsewhere: number
  available: number
  reserve: number
  shortfall: number
}

/** Gross requirement from the BOM × remaining units, netted against available (on hand − reserved to others). */
export function mrpPreview(wpId: string): { rows: MrpRow[]; error?: string } {
  const wp = getWorkPackage(wpId)
  if (!wp) return { rows: [], error: 'Pick a work package.' }
  const b = getCustomBom(wp.customBomId)
  if (!b) {
    const hasAny = projectWorkPackages(wp.projectId).some(w => w.customBomId)
    return { rows: [], error: hasAny ? 'This project has work packages with a BOM, but the selected one isn’t among them. Attach a BOM to it, or pick another work package.' : 'This project has no BOM at all. Attach a BOM to a production work package first.' }
  }
  const remaining = Math.max((wp.plannedUnits ?? 0) - (wp.confirmedUnits ?? 0), 0)
  const rows = currentVersion(b).components.map(c => {
    const item = stockItemByName(c.name)
    const gross = Math.ceil(c.qty * remaining)
    const alreadyReserved = item ? wpReservedQty(wp.id, item.id) : 0
    const net = Math.max(gross - alreadyReserved, 0)
    const onHand = item?.onHand ?? 0
    const available = item ? Math.max(availableQty(item.id), 0) : 0
    const reservedElsewhere = onHand - available - alreadyReserved
    const reserve = Math.min(net, available)
    return { item: c.name, unit: c.unit, gross, alreadyReserved, net, onHand, reservedElsewhere: Math.max(reservedElsewhere, 0), available, reserve, shortfall: net - reserve }
  })
  return { rows }
}

export function runMrp(wpId: string, actor: Actor): Result {
  const wp = getWorkPackage(wpId)!
  const p = getProject(wp.projectId)!
  const { rows, error } = mrpPreview(wpId)
  if (error) return { ok: false, error }
  let reservedCount = 0
  const prLines: PeggedDocument['lines'] = []
  for (const r of rows) {
    let item = stockItemByName(r.item)
    if (r.reserve > 0 && item) {
      reservations.push({ id: newId('rs'), itemId: item.id, projectId: p.id, wpId, qty: r.reserve, status: 'reserved', createdAt: TODAY_ISO, source: 'MRP run' })
      reservedCount++
    }
    if (r.shortfall > 0) {
      if (!item) {
        item = { id: newId('si'), name: r.item, unit: r.unit, onHand: 0, warehouse: p.defaultWarehouse ?? 'Workshop Cileungsi', unitCost: 0 }
        stockItems.push(item)
      }
      const unitCost = currentVersion(getCustomBom(wp.customBomId)!).components.find(c => c.name === r.item)?.unitCost ?? item.unitCost
      prLines.push({ description: `${r.item} — ${r.shortfall} ${r.unit}`, account: COGM_ACCOUNT, amount: Math.round(r.shortfall * unitCost), wpId })
    }
  }
  if (prLines.length) {
    peggedDocuments.unshift({ id: newId('doc'), docType: 'PR', docNo: nextDocNo('PR'), date: TODAY_ISO, status: 'draft', lines: prLines, createdBy: 'MRP' })
  }
  const hasOpenWo = projectWorkOrders.some(w => w.wpId === wpId && w.status !== 'Completed')
  let draftWo = ''
  if (!hasOpenWo && wp.type === 'production') {
    const remaining = Math.max((wp.plannedUnits ?? 0) - (wp.confirmedUnits ?? 0), 0)
    const lines = suggestWoLines(wp.customBomId, remaining)
    const wo: ProjectWorkOrder = { id: newId('pwo'), number: nextWoNumber(), projectId: p.id, wpId, status: 'Draft', qty: remaining, unit: wp.unit ?? 'Unit', budgetSetAside: 0, estimate: lines.reduce((s, l) => s + l.estimate, 0), actual: 0, customBomId: wp.customBomId, bomVersion: currentVersion(getCustomBom(wp.customBomId)!).version, lines, createdAt: TODAY_ISO, createdBy: 'MRP' }
    projectWorkOrders.push(wo)
    draftWo = wo.number
  }
  persistReservations(); persistLedger()
  logAudit({ actor: actor.name, role: actor.role, projectId: p.id, kind: 'reservation', summary: `MRP run on ${wp.code} ${wp.name}: ${reservedCount} reservation(s) created${prLines.length ? `, draft PR for ${prLines.length} shortfall line(s)` : ''}${draftWo ? `, draft ${draftWo}` : ''}` })
  return { ok: true, message: `MRP done: ${reservedCount} reservation(s)${prLines.length ? `, ${prLines.length} shortfall line(s) on a draft PR` : ''}${draftWo ? `, draft ${draftWo}` : ''}. Nothing is firm yet.` }
}

export function advanceReservation(resId: string, actor: Actor): Result {
  const r = reservations.find(x => x.id === resId)
  if (!r) return { ok: false, error: 'Reservation not found' }
  const item = getStockItem(r.itemId)!
  if (r.status === 'reserved') r.status = 'picked'
  else if (r.status === 'picked') { r.status = 'issued'; item.onHand -= r.qty }
  else return { ok: false, error: 'Nothing left to do on this reservation.' }
  persistReservations()
  logAudit({ actor: actor.name, role: actor.role, projectId: r.projectId, kind: 'reservation', summary: `${r.status === 'picked' ? 'Picked' : 'Issued'} ${r.qty} ${item.unit} ${item.name} for ${getWorkPackage(r.wpId)?.code}` })
  return { ok: true }
}

export function releaseReservation(resId: string, reason: string, actor: Actor): Result {
  const r = reservations.find(x => x.id === resId)
  if (!r || (r.status !== 'reserved' && r.status !== 'picked')) return { ok: false, error: 'Only reserved or picked stock can be released.' }
  r.status = 'released'
  r.releasedAt = TODAY_ISO
  r.releaseReason = reason
  persistReservations()
  const item = getStockItem(r.itemId)!
  logAudit({ actor: actor.name, role: actor.role, projectId: r.projectId, kind: 'reservation', summary: `Released ${r.qty} ${item.unit} ${item.name} reserved to ${getProject(r.projectId)?.code} · ${getWorkPackage(r.wpId)?.code}`, reason })
  return { ok: true }
}

/** Issue stock to a work package — checks competing reservations per the company policy. */
export function checkIssue(itemId: string, projectId: string, qty: number) {
  const item = getStockItem(itemId)!
  const own = reservations.filter(r => r.itemId === itemId && r.projectId === projectId && (r.status === 'reserved' || r.status === 'picked')).reduce((s, r) => s + r.qty, 0)
  const free = Math.max(availableQty(itemId), 0)
  const fromOthers = Math.max(qty - own - free, 0)
  const holders = reservations.filter(r => r.itemId === itemId && r.projectId !== projectId && (r.status === 'reserved' || r.status === 'picked'))
    .map(r => ({ project: getProject(r.projectId)!, qty: r.qty }))
  return { item, own, free, fromOthers, holders, policy: projectPolicy.reservationIssuePolicy }
}

/** Issue stock to a work package. Own reservation first, then free stock; taking stock reserved to another
 *  project is blocked or warned per company policy, naming the holding project and its priority. */
export function issueStock(itemId: string, wpId: string, qty: number, acknowledged: boolean, actor: Actor): Result {
  const wp = getWorkPackage(wpId)
  if (!wp) return { ok: false, error: 'Pick a work package.' }
  const item = getStockItem(itemId)!
  if (qty <= 0) return { ok: false, error: 'Enter a quantity.' }
  if (qty > item.onHand) return { ok: false, error: `Only ${item.onHand} ${item.unit} on hand.` }
  const c = checkIssue(itemId, wp.projectId, qty)
  if (c.fromOthers > 0) {
    const holders = c.holders.map(h => `${h.project.code} (priority ${h.project.priority})`).join(', ')
    if (c.policy === 'block') return { ok: false, error: `${c.fromOthers} ${item.unit} of this is reserved to ${holders}. Request a release instead.` }
    if (!acknowledged) return { ok: false, error: `${c.fromOthers} ${item.unit} of this is reserved to ${holders}. Confirm to issue anyway.` }
  }
  let left = qty
  for (const r of reservations.filter(x => x.itemId === itemId && x.projectId === wp.projectId && (x.status === 'reserved' || x.status === 'picked'))) {
    if (!left) break
    const take = Math.min(r.qty, left)
    if (take === r.qty) r.status = 'issued'
    else { r.qty -= take; reservations.push({ ...r, id: newId('rs'), qty: take, status: 'issued' }) }
    left -= take
  }
  left = Math.max(left - c.free, 0)
  const taken: string[] = []
  for (const r of reservations.filter(x => x.itemId === itemId && x.projectId !== wp.projectId && (x.status === 'reserved' || x.status === 'picked'))) {
    if (!left) break
    const take = Math.min(r.qty, left)
    r.qty -= take
    if (!r.qty) { r.status = 'released'; r.releasedAt = TODAY_ISO; r.releaseReason = `Issued to ${getProject(wp.projectId)?.code} over this reservation` }
    taken.push(`${take} from ${getProject(r.projectId)?.code}`)
    left -= take
  }
  item.onHand -= qty
  persistReservations()
  logAudit({ actor: actor.name, role: actor.role, projectId: wp.projectId, kind: 'reservation', summary: `Issued ${qty} ${item.unit} ${item.name} to ${wp.code} ${wp.name}${taken.length ? ` — WARNING: took ${taken.join(', ')} (reserved to another project)` : ''}` })
  return { ok: true, message: `Issued ${qty} ${item.unit} ${item.name}.` }
}

export function requestRelease(input: { fromReservationId: string; toProjectId: string; toWpId: string; qty: number; reason: string }, actor: Actor): Result {
  const r = reservations.find(x => x.id === input.fromReservationId)
  if (!r) return { ok: false, error: 'Reservation not found' }
  if (!input.reason.trim()) return { ok: false, error: 'A reason is required.' }
  if (input.qty <= 0 || input.qty > r.qty) return { ok: false, error: `Enter a quantity between 1 and ${r.qty}.` }
  const id = newId('rr')
  const no = `RR-${String(releaseRequests.length + 1).padStart(4, '0')}`
  const item = getStockItem(r.itemId)!
  releaseRequests.push({ id, itemId: r.itemId, fromProjectId: r.projectId, fromReservationId: r.id, toProjectId: input.toProjectId, toWpId: input.toWpId, qty: input.qty, reason: input.reason.trim(), requestedBy: actor.name, requestedAt: TODAY_ISO, status: 'pending' })
  persistReservations()
  addApproval({ kind: 'stock_release', projectId: r.projectId, refId: id, refNo: no, title: `${input.qty} ${item.unit} ${item.name} — ${getProject(r.projectId)?.code} → ${getProject(input.toProjectId)?.code}`, requestedBy: actor.name, requestedAt: TODAY_ISO, reason: input.reason.trim() })
  logAudit({ actor: actor.name, role: actor.role, projectId: input.toProjectId, kind: 'reservation', summary: `Requested release of ${input.qty} ${item.unit} ${item.name} from ${getProject(r.projectId)?.code}`, reason: input.reason.trim(), refNo: no })
  return { ok: true, message: `Release request ${no} sent. A person decides — nothing is bumped automatically.` }
}

function applyReleaseDecision(reqId: string, approve: boolean, actor: Actor) {
  const q = releaseRequests.find(x => x.id === reqId)
  if (!q) return
  q.status = approve ? 'approved' : 'rejected'
  const item = getStockItem(q.itemId)!
  if (approve) {
    const r = reservations.find(x => x.id === q.fromReservationId)
    if (r) {
      r.qty -= q.qty
      if (r.qty <= 0) { r.qty = 0; r.status = 'released'; r.releasedAt = TODAY_ISO; r.releaseReason = 'Released to another project' }
    }
    const nr: Reservation = { id: newId('rs'), itemId: q.itemId, projectId: q.toProjectId, wpId: q.toWpId, qty: q.qty, status: 'reserved', createdAt: TODAY_ISO, source: 'Manual' }
    reservations.push(nr)
  }
  persistReservations()
  logAudit({ actor: actor.name, role: actor.role, projectId: q.fromProjectId, kind: 'reservation', summary: `${approve ? 'Approved' : 'Rejected'} release of ${q.qty} ${item.unit} ${item.name} to ${getProject(q.toProjectId)?.code}` })
}

// ─── Budget setup module ────────────────────────────────────────────────────────

export function saveBudgetRevision(projectId: string, draft: { lines: BudgetLine[]; reserves: Record<string, number>; revenue: number }, reason: string, actor: Actor): Result {
  const b = getBudget(projectId)
  if (!b) return { ok: false, error: 'No budget to revise.' }
  if (!reason.trim()) return { ok: false, error: 'Enter a reason for this revision.' }
  const changes: BudgetRevisionChange[] = []
  const key = (l: { wpId: string; account: string }) => `${l.wpId}|${l.account}`
  const before = new Map(b.lines.map(l => [key(l), l.amount]))
  const after = new Map(draft.lines.filter(l => l.amount).map(l => [key(l), l.amount]))
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const from = before.get(k) ?? 0, to = after.get(k) ?? 0
    if (from !== to) { const [wpId, account] = k.split('|'); changes.push({ wpId, account, field: 'line', from, to }) }
  }
  for (const phId of new Set([...Object.keys(b.reserves), ...Object.keys(draft.reserves)])) {
    const from = b.reserves[phId] ?? 0, to = draft.reserves[phId] ?? 0
    if (from !== to) changes.push({ phaseId: phId, field: 'reserve', from, to })
  }
  if (draft.revenue !== b.revenue) changes.push({ field: 'revenue', from: b.revenue, to: draft.revenue })
  if (!changes.length) return { ok: false, error: 'Nothing changed.' }
  b.lines = clone(draft.lines.filter(l => l.amount))
  b.reserves = { ...draft.reserves }
  b.revenue = draft.revenue
  persistBudgets()
  const rev = addRevision(projectId, { date: TODAY_ISO, by: actor.name, reason: reason.trim(), source: 'manual', changes })!
  const net = changes.filter(c => c.field !== 'revenue').reduce((s, c) => s + c.to - c.from, 0)
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'budget_revision', summary: `Budget revision #${rev.no} — ${changes.length} change(s), net cost ${net >= 0 ? '+' : ''}${fmt(net)}`, reason: reason.trim() })
  return { ok: true, message: `Revision #${rev.no} saved.` }
}

export function linkBudgetPlan(projectId: string, data: { planRef: string; revenue: number; lines: BudgetLine[]; reserves: Record<string, number> }, actor: Actor): Result {
  if (getBudget(projectId)) return { ok: false, error: 'This project already has a budget. Revise it instead.' }
  if (!data.planRef.trim()) return { ok: false, error: 'Enter the plan reference (RAB/RAP document).' }
  createBudget({ projectId, planRef: data.planRef.trim(), revenue: data.revenue, approvedBy: actor.name, approvedAt: TODAY_ISO, lines: data.lines.filter(l => l.amount), reserves: data.reserves })
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'budget_revision', summary: `Budget baseline set from ${data.planRef.trim()} — revenue ${fmt(data.revenue)}, cost ${fmt(data.lines.reduce((s, l) => s + l.amount, 0) + Object.values(data.reserves).reduce((s, v) => s + v, 0))}` })
  return { ok: true, message: 'Budget baseline saved.' }
}

export function requestBudgetRevision(projectId: string, input: { amount: number; reason: string; refNo?: string; payload?: ApprovalItem['payload'] }, actor: Actor): Result {
  if (!input.reason.trim()) return { ok: false, error: 'A reason is required.' }
  const p = getProject(projectId)!
  const no = `BR-${p.code.replace('PS-', '')}-${String(approvals.filter(a => a.kind === 'budget_revision' && a.projectId === projectId).length + 1).padStart(2, '0')}`
  addApproval({ kind: 'budget_revision', projectId, refId: newId('brq'), refNo: no, title: input.payload ? `Budget revision — net ${input.amount >= 0 ? '+' : ''}${fmt(input.amount)}` : `Budget increase ${fmt(input.amount)}${input.refNo ? ` for ${input.refNo}` : ''}`, requestedBy: actor.name, requestedAt: TODAY_ISO, amount: input.amount, reason: input.reason.trim(), payload: input.payload ? { ...clone(input.payload), baseRevisionNo: getBudget(projectId)?.revisions.length ?? 0 } : undefined })
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'budget_revision', summary: `Requested budget revision ${no} (${fmt(input.amount)})`, reason: input.reason.trim(), refNo: no })
  return { ok: true, message: `Budget revision request ${no} sent to Finance.` }
}

// ─── Completion & close ─────────────────────────────────────────────────────────

/** Partial BAST supports progress billing; 100% sets technically complete and releases remaining commitment. */
export function recordBast(wpId: string, pctAccepted: number, bastNo: string, actor: Actor): Result {
  const wp = getWorkPackage(wpId)
  if (!wp) return { ok: false, error: 'Work package not found' }
  if (!bastNo.trim()) return { ok: false, error: 'Enter the BAST number.' }
  if (pctAccepted <= wp.bastPct || pctAccepted > 100) return { ok: false, error: `Enter a percentage above the last accepted ${wp.bastPct}% (max 100%).` }
  wp.bastPct = pctAccepted
  let releasedText = ''
  if (pctAccepted === 100) {
    wp.status = 'technically_complete'
    wp.actualEnd = TODAY_ISO
    const open = costLines.filter(l => l.wpId === wpId && l.kind === 'committed')
    let released = open.reduce((s, l) => s + l.amount, 0)
    for (const l of open) costLines.splice(costLines.indexOf(l), 1)
    // Open work orders are committed too (their unused set-aside): close them at their actual
    // cost and release the rest — no cost is invented for work that was never consumed.
    for (const w of projectWorkOrders.filter(x => x.wpId === wpId && (x.status === 'Released' || x.status === 'In progress'))) {
      const unused = Math.max(w.budgetSetAside - w.actual, 0)
      w.status = 'Completed'; w.completedAt = TODAY_ISO; w.released = unused
      released += unused
    }
    for (const r of reservations.filter(x => x.wpId === wpId && (x.status === 'reserved' || x.status === 'picked'))) {
      r.status = 'released'; r.releasedAt = TODAY_ISO; r.releaseReason = 'Work package technically complete — unconsumed'
    }
    releasedText = released ? `; remaining commitment ${fmt(released)} released` : ''
    persistLedger(); persistReservations()
  } else if (wp.status === 'not_started') {
    wp.status = 'in_progress'
  }
  persistProjects()
  logAudit({ actor: actor.name, role: actor.role, projectId: wp.projectId, kind: 'bast', summary: `${bastNo.trim()} — ${wp.code} ${wp.name} accepted at ${pctAccepted}%${pctAccepted === 100 ? ' (technically complete)' : ''}${releasedText}`, refNo: bastNo.trim() })
  return { ok: true }
}

export function closePunchItem(id: string, actor: Actor): Result {
  const pi = punchItems.find(x => x.id === id)
  if (!pi || pi.status === 'closed') return { ok: false, error: 'Already closed.' }
  pi.status = 'closed'
  pi.closedAt = TODAY_ISO
  if (pi.reworkCost) {
    costLines.push({ id: newId('cl'), projectId: pi.projectId, wpId: pi.wpId, account: '5-50700', docType: 'Expense', docNo: `PUNCH-${pi.id.toUpperCase()}`, date: TODAY_ISO, description: `Rework: ${pi.description}`, amount: pi.reworkCost, kind: 'actual' })
    persistLedger()
  }
  persistProjects()
  logAudit({ actor: actor.name, role: actor.role, projectId: pi.projectId, kind: 'close', summary: `Closed punch item "${pi.description}"${pi.reworkCost ? ` — rework ${fmt(pi.reworkCost)} posted to the job` : ''}` })
  return { ok: true }
}

export function addPunchItem(projectId: string, wpId: string, description: string, reworkCost: number): void {
  punchItems.push({ id: newId('pi'), projectId, wpId, description, reworkCost, status: 'open' })
  persistProjects()
}

export interface CloseBlocker { n?: number; label: string; detail?: string }

/** Close gate (Story 16). Returned as count + label so the UI can translate it. */
export function closeBlockers(projectId: string): CloseBlocker[] {
  const p = getProject(projectId)!
  const out: CloseBlocker[] = []
  const wps = projectWorkPackages(projectId).filter(w => w.status !== 'technically_complete')
  if (wps.length) out.push({ n: wps.length, label: 'work package(s) not technically complete' })
  const { vos, ecos } = pendingChanges(projectId)
  if (vos.length) out.push({ n: vos.length, label: 'change order(s) pending' })
  if (ecos.length) out.push({ n: ecos.length, label: 'engineering change(s) pending' })
  const openPunch = punchItems.filter(x => x.projectId === projectId && x.status === 'open')
  if (openPunch.length) out.push({ n: openPunch.length, label: 'punch item(s) open' })
  if (p.method !== 'tm') {
    // Final when everything contracted is recognised — not when % complete hits 100, which a
    // cost-to-cost or unit project that finished under plan never reaches (see finaliseRecognition).
    const recognised = recognisedToDate(projectId)
    if (recognised < p.contractValue) out.push({ label: 'Recognition not final', detail: `${pct((recognised / p.contractValue) * 100)} recognised` })
  } else if (tmEntries(projectId).some(l => !l.tm?.invoiceNo)) out.push({ label: 'Unbilled T&M entries remain' })
  const unpaid = projectInvoices.filter(i => i.projectId === projectId && i.status === 'unpaid')
  if (unpaid.length) out.push({ n: unpaid.length, label: 'invoice(s) not collected' })
  const uninvoicedTerms = billingTerms.filter(t => t.projectId === projectId && !termInvoice(t.id))
  if (uninvoicedTerms.length) out.push({ n: uninvoicedTerms.length, label: 'contract term(s) not invoiced' })
  const pendingReq = approvals.filter(a => a.projectId === projectId && a.status === 'pending')
  if (pendingReq.length) out.push({ n: pendingReq.length, label: 'approval request(s) pending' })
  return out
}

/** Completion true-up (Input / Output·unit): once every work package is technically complete the
 *  performance obligation is satisfied, so the rest of the contract value is recognised even when
 *  cost or units came in under plan. Milestone projects finish by verifying each phase's BAST. */
export function finaliseRecognition(projectId: string, actor: Actor): Result {
  const p = getProject(projectId)!
  if (p.status !== 'active') return { ok: false, error: 'Only an active project can recognise revenue.' }
  if (p.method === 'tm') return { ok: false, error: 'T&M projects recognise revenue as time is billed.' }
  if (p.method === 'output' && p.measure === 'milestone') return { ok: false, error: 'Milestone projects finish by verifying each phase by BAST.' }
  const open = projectWorkPackages(projectId).filter(w => w.status !== 'technically_complete')
  if (open.length) return { ok: false, error: `${open.length} work package(s) aren’t technically complete yet. Record their 100% BAST first.` }
  const amount = p.contractValue - recognisedToDate(projectId)
  if (amount <= 0) return { ok: false, error: 'Everything in the contract is already recognised.' }
  const pc = percentComplete(p) ?? 0
  const no = nextRecNo(projectId)
  recognitionPostings.push({ id: newId('rec'), no, projectId, date: TODAY_ISO, kind: 'catch_up', description: `Completion true-up — all work packages complete at ${pct(pc)} measured progress`, cumulativePct: 100, amount, by: actor.name })
  persistRecognition()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'recognition', summary: `Completion true-up: recognised the remaining ${fmt(amount)} (measured progress was ${pct(pc)})`, refNo: no })
  return { ok: true, message: `Recognised the remaining ${fmt(amount)}.` }
}

export function closeProject(projectId: string, actor: Actor): Result {
  const p = getProject(projectId)!
  const blockers = closeBlockers(projectId)
  if (blockers.length) return { ok: false, error: `Can’t close yet: ${blockers.map(b => `${b.n ?? ''} ${b.label}${b.detail ? ` (${b.detail})` : ''}`.trim()).join('; ')}.` }
  let releasedRes = 0
  for (const r of reservations.filter(x => x.projectId === projectId && (x.status === 'reserved' || x.status === 'picked'))) {
    r.status = 'released'; r.releasedAt = TODAY_ISO; r.releaseReason = 'Project closed — unconsumed'; releasedRes++
  }
  let releasedSetAside = 0
  for (const w of projectWorkOrders.filter(x => x.projectId === projectId && x.status !== 'Completed')) {
    releasedSetAside += Math.max(w.budgetSetAside - w.actual, 0)
    w.status = 'Completed'; w.released = Math.max(w.budgetSetAside - w.actual, 0); w.completedAt = TODAY_ISO
  }
  p.status = 'closed'
  p.closedAt = TODAY_ISO
  if (p.longTerm && !p.assetNo) p.assetNo = `FA-${p.code.replace('PS-', '')}-01`
  persistProjects(); persistReservations(); persistLedger()
  logAudit({ actor: actor.name, role: actor.role, projectId, kind: 'close', summary: `Closed project${releasedRes ? ` — ${releasedRes} unconsumed reservation(s) released` : ''}${releasedSetAside ? `; ${fmt(releasedSetAside)} unused WO set-aside released` : ''}${p.assetNo ? `; asset ${p.assetNo} created` : ''}` })
  return { ok: true, message: `${p.code} closed.` }
}

// re-exports used by pages
export { projects, phases, workPackages, customBoms }
