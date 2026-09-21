import { reactive } from 'vue'

/**
 * Company-level budget-check policy (PRD §5, D6). Phase 1 ships warn + override
 * for every document type; the block/warn/off field is stored so hard block can
 * be switched on later without migration. There is no per-project policy
 * override — only the escalation threshold may be overridden per project.
 */

export type PolicyMode = 'block' | 'warn' | 'off'
export type PeggedDocType = 'PR' | 'PO' | 'WO' | 'Expense' | 'Timesheet'

export interface CompanyProjectPolicy {
  docPolicies: Record<PeggedDocType, PolicyMode>
  /** default escalation threshold (% over available) — above it Finance must sign off */
  companyThresholdPct: number
  /** Open question 6 — unit-measured Output × service work package. A: all planned units count. B: production only. */
  qtyPocOption: 'A' | 'B'
  /** Open question 10 — issue against another project's reservation */
  reservationIssuePolicy: 'block' | 'warn'
}

const KEY = 'erp-db:pm-policy'
const DEFAULT: CompanyProjectPolicy = {
  docPolicies: { PR: 'warn', PO: 'warn', WO: 'warn', Expense: 'warn', Timesheet: 'warn' },
  companyThresholdPct: 20,
  qtyPocOption: 'A',
  reservationIssuePolicy: 'warn',
}

function load(): CompanyProjectPolicy {
  if (!import.meta.client) return structuredClone(DEFAULT)
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...structuredClone(DEFAULT), ...JSON.parse(raw) } : structuredClone(DEFAULT)
  } catch { return structuredClone(DEFAULT) }
}

export const projectPolicy = reactive<CompanyProjectPolicy>(load())

export function persistPolicy(): void {
  if (!import.meta.client) return
  try { localStorage.setItem(KEY, JSON.stringify(projectPolicy)) } catch { /* non-fatal */ }
}

/** Phase-1 effective mode: hard block is deferred — a stored "block" still behaves as warn. */
export function effectiveMode(doc: PeggedDocType): Exclude<PolicyMode, 'block'> {
  const m = projectPolicy.docPolicies[doc]
  return m === 'off' ? 'off' : 'warn'
}
