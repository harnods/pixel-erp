import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Project audit trail (PRD §9, D4, Story 21). Written by every budget revision,
 * override with reason, policy change, method re-open, change order, ECO and
 * reservation release. Read on its own cross-project page, filterable per
 * project — a trail that cannot be read is equivalent to no trail.
 */

export type AuditKind =
  | 'budget_revision' | 'override' | 'policy_change' | 'method_reopen' | 'approval'
  | 'change_order' | 'eco' | 'reservation' | 'recognition' | 'billing'
  | 'structure' | 'work_order' | 'bast' | 'close'

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  budget_revision: 'Budget revision',
  override: 'Override with reason',
  policy_change: 'Policy change',
  method_reopen: 'Method re-open',
  approval: 'Project approval',
  change_order: 'Change order',
  eco: 'Engineering change',
  reservation: 'Reservation',
  recognition: 'Recognition',
  billing: 'Billing',
  structure: 'Structure',
  work_order: 'Work order',
  bast: 'BAST',
  close: 'Completion & close',
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  role: 'PM' | 'Finance' | 'Warehouse' | 'Site supervisor' | 'System'
  projectId?: string
  kind: AuditKind
  summary: string
  reason?: string
  refNo?: string
}

const SEED: AuditEntry[] = [
  { id: 'au-1', at: '2026-03-27T09:12:00', actor: 'Rizal Candra', role: 'PM', projectId: 'ps-2603', kind: 'structure', summary: 'Created project PS-2603 with 5 phases and 9 work packages' },
  { id: 'au-2', at: '2026-04-02T14:40:00', actor: 'Maya Kartika', role: 'Finance', projectId: 'ps-2603', kind: 'approval', summary: 'Approved project — Draft → Active. Recognition locked to Output · milestone' },
  { id: 'au-3', at: '2026-04-08T10:05:00', actor: 'Maya Kartika', role: 'Finance', projectId: 'ps-2603', kind: 'billing', summary: 'Issued term invoice INV/2026/0831 — DP 30% (Rp250.568.251)', refNo: 'INV/2026/0831' },
  { id: 'au-4', at: '2026-04-24T16:20:00', actor: 'Rizal Candra', role: 'PM', projectId: 'ps-2603', kind: 'bast', summary: 'BAST/IPB/01 recorded for phase Persiapan — 100%', refNo: 'BAST/IPB/01' },
  { id: 'au-5', at: '2026-04-24T16:22:00', actor: 'Rizal Candra', role: 'PM', projectId: 'ps-2603', kind: 'recognition', summary: 'Verified progress: Persiapan (2,0%) — recognised Rp16.704.550', refNo: 'REC-2603-01' },
  { id: 'au-6', at: '2026-05-18T11:00:00', actor: 'Maya Kartika', role: 'Finance', projectId: 'ps-2603', kind: 'budget_revision', summary: 'Budget revision #1 — re-split civil works (net Rp0)', reason: 'Re-split civil works after site survey: flooring scope confirmed at 40 jt.' },
  { id: 'au-7', at: '2026-05-29T15:10:00', actor: 'Rizal Candra', role: 'PM', projectId: 'ps-2603', kind: 'recognition', summary: 'Verified progress: Pekerjaan sipil (15,0%) — recognised Rp125.284.125', refNo: 'REC-2603-02' },
  { id: 'au-8', at: '2026-06-09T09:30:00', actor: 'Rizal Candra', role: 'PM', projectId: 'ps-2603', kind: 'override', summary: 'Overrode budget warning on PR/2026/0213 — Subcontractor over by Rp1.500.000 (5,0%)', reason: 'Vendor quote includes ducting that was missing from RAP; within reserve.', refNo: 'PR/2026/0213' },
  { id: 'au-9', at: '2026-06-12T13:45:00', actor: 'Maya Kartika', role: 'Finance', kind: 'policy_change', summary: 'Company escalation threshold confirmed at 20% (phase 1: warn + override for all documents)' },
  { id: 'au-10', at: '2026-06-19T08:50:00', actor: 'Budi Santoso', role: 'Warehouse', projectId: 'ps-2606', kind: 'reservation', summary: 'Released 6 lembar HPL motif walnut reserved to PS-2606 · 1.1 (WO-PS-0004 completed)' },
  { id: 'au-11', at: '2026-06-19T08:51:00', actor: 'System', role: 'System', projectId: 'ps-2606', kind: 'work_order', summary: 'WO-PS-0004 completed — unused set-aside Rp8.000.000 released', refNo: 'WO-PS-0004' },
  { id: 'au-12', at: '2026-06-24T17:05:00', actor: 'Agus Wibowo', role: 'Site supervisor', projectId: 'ps-2603', kind: 'change_order', summary: 'Site change captured: Tambah panel akustik ruang auditorium', refNo: 'VO-2603-01' },
]

const KEY = 'pm-audit'
export const auditLog = reactive<AuditEntry[]>(loadSnapshot<AuditEntry>(KEY) ?? structuredClone(SEED))

export function logAudit(entry: Omit<AuditEntry, 'id' | 'at'> & { at?: string }): AuditEntry {
  const e: AuditEntry = { ...entry, id: `au-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: entry.at ?? nowIso() }
  auditLog.unshift(e)
  saveSnapshot(KEY, auditLog)
  return e
}

/** Prototype clock: the app's fixed TODAY (2026-06-26) + the real wall-clock time. */
export function nowIso(): string {
  const t = new Date()
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const ss = String(t.getSeconds()).padStart(2, '0')
  return `2026-06-26T${hh}:${mm}:${ss}`
}
