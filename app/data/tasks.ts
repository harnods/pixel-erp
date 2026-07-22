import { reactive } from 'vue'

export type TaskDocType =
  | 'Sales Quote' | 'Sales Order' | 'Sales Delivery' | 'Sales Invoice'
  | 'Purchase Request' | 'Purchase Order' | 'Purchase Delivery' | 'Purchase Invoice'
  | 'Expense' | 'Warehouse Transfer' | 'Production Plan' | 'Stock In/Out'

export type TaskStatus = 'awaiting approval' | 'action required'

// Doc types with no meaningful Total / Balance due / Due date — internal
// movements/plans rather than billable transactions.
const NON_FINANCIAL_DOC_TYPES: TaskDocType[] = ['Warehouse Transfer', 'Production Plan', 'Stock In/Out']

export interface Task {
  id: string
  docType: TaskDocType
  number: number
  /** Details column fallback — contact name, or a docType-specific description (see buildDetails). Unused for Stock In/Out (see productName/qtyDesc). */
  details: string
  /** Stock In/Out only — product name shown as the Details column's title line. */
  productName?: string
  /** Stock In/Out only — signed quantity description shown under the product name. */
  qtyDesc?: string
  requestedBy: string
  date: string
  dueDate: string
  total: number
  balanceDue: number
  status: TaskStatus
}

const docTypes: TaskDocType[] = [
  'Sales Quote', 'Sales Order', 'Sales Delivery', 'Sales Invoice',
  'Purchase Request', 'Purchase Order', 'Purchase Delivery', 'Purchase Invoice',
  'Expense', 'Warehouse Transfer', 'Production Plan', 'Stock In/Out',
]

const contacts = [
  'PT Sumber Makmur Sejahtera', 'CV Abadi Jaya Teknik', 'PT Mitra Global Solusi',
  'PT Karya Cipta Mandiri', 'CV Berkah Utama Indonesia', 'PT Teknindo Nusantara',
  'PT Solusi Pratama Abadi', 'CV Harapan Bangsa Jaya', 'PT Dinamika Usaha Bersama',
  'CV Prima Sentosa Raya',
]

const requesters = [
  'Jenny Wu', 'Andi Saputra', 'Rina Kartika', 'Budi Hartono', 'Sarah Amelia',
  'Dimas Prakoso', 'Maya Anggraini', 'Fajar Nugroho',
]

const warehouses = ['Jababeka 1', 'Karawang', 'Cikarang', 'Bandung', 'Surabaya', 'Semarang']

const products: { name: string; unit: string }[] = [
  { name: 'Arabica Aceh Gayo', unit: 'Kg' },
  { name: 'Robusta Lampung', unit: 'Kg' },
  { name: 'Printer Toner Cartridge', unit: 'Pcs' },
  { name: 'A4 Paper Ream', unit: 'Box' },
  { name: 'Packaging Tape', unit: 'Roll' },
  { name: 'Mineral Water 600ml', unit: 'Liter' },
]

// Contact / describing text shown in the "Details" column — most doc types show
// the counterparty contact, but Warehouse Transfer describes the movement itself
// instead (there's no single "contact" for those). Stock In/Out is handled
// separately via productName/qtyDesc (see buildTasks) since it renders as a
// two-line product cell rather than plain text.
function buildDetails(docType: TaskDocType, n: number): string {
  if (docType === 'Warehouse Transfer') {
    const from = warehouses[n % warehouses.length]!
    let to = warehouses[(n + 1 + (n % (warehouses.length - 1))) % warehouses.length]!
    if (to === from) to = warehouses[(warehouses.indexOf(to) + 1) % warehouses.length]!
    return `${from} → ${to}`
  }
  return contacts[n % contacts.length]!
}

// Deterministic pseudo-random shuffle (fixed seed) so the demo data is stable
// across reloads instead of re-shuffling every render.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

function buildTasks(count: number, status: TaskStatus, seed: number): Task[] {
  // Cycle doc types through a shuffled order so they appear in random order but
  // every type gets roughly even coverage across `count` rows.
  const order: TaskDocType[] = []
  while (order.length < count) order.push(...seededShuffle(docTypes, seed + order.length))
  order.length = count

  return order.map((docType, i) => {
    const n = seed * 100 + i + 1
    const isNonFinancial = NON_FINANCIAL_DOC_TYPES.includes(docType)
    const total = isNonFinancial ? 0 : 1_000_000 + ((n * 37) % 60) * 1_000_000
    const paidRatio = status === 'awaiting approval' ? 1 : ((n * 13) % 3 === 0 ? 0.5 : 1)

    let productName: string | undefined
    let qtyDesc: string | undefined
    let details = buildDetails(docType, n)
    if (docType === 'Stock In/Out') {
      const p = products[n % products.length]!
      const sign = n % 3 === 0 ? '-' : '+'
      const qty = 5 + (n * 7) % 200
      productName = p.name
      qtyDesc = `${sign}${qty} ${p.unit}`
      details = `${productName} ${qtyDesc}`
    }

    return {
      id: `TASK-${status === 'awaiting approval' ? 'AA' : 'AR'}-${n}`,
      docType,
      number: n,
      details,
      productName,
      qtyDesc,
      requestedBy: requesters[n % requesters.length]!,
      date: `2026-07-${String((n % 20) + 1).padStart(2, '0')}`,
      dueDate: isNonFinancial ? '' : `2026-08-${String((n % 25) + 1).padStart(2, '0')}`,
      total,
      balanceDue: isNonFinancial ? 0 : Math.round(total * paidRatio),
      status,
    }
  })
}

export const awaitingApprovalTasks = reactive<Task[]>(buildTasks(25, 'awaiting approval', 7))

export function formatTaskNumber(task: Task): string {
  return `${task.docType} #${String(task.number).padStart(5, '0')}`
}

// ─── Approval log + comments (mock, keyed off the task's own fields so it's
// deterministic across reloads) — feeds ApprovalLogPopover / ApprovalCommentPopover. ───

export interface ApprovalStep {
  name: string
  role: string
  status: 'approved' | 'awaiting approval' | 'rejected'
  timestamp?: string
  comment?: string
}
export interface ApprovalLevel {
  label: string
  /** 'all' = every approver in this level must approve; 'any' = one is enough. */
  rule: 'all' | 'any'
  /** Aggregate status for the level's summary row/badge. */
  status: 'approved' | 'awaiting approval' | 'rejected'
  /** How many approvers in this level have approved so far, out of the total. */
  approvedCount: number
  steps: ApprovalStep[]
}
export interface TaskComment {
  id: string
  author: string
  timestamp: string
  text: string
}

const roles = ['Finance Manager', 'Department Head', 'Operations Lead', 'Controller']
const commentTexts = [
  'Please double-check the amount before approving.',
  'Looks good to me, approving now.',
  'Can we get the supporting document attached?',
  'This matches the PO — no issues here.',
  'Following up — this is overdue for review.',
]

/** Requester timeline entry — always the first row in ApprovalLogPopover. */
export function approvalRequestedBy(task: Task): { name: string; timestamp: string } {
  return { name: task.requestedBy, timestamp: `${task.date}T09:00:00` }
}

export function approvalLevelsFor(task: Task): ApprovalLevel[] {
  const n = task.number
  const levelCount = (n % 3 === 0) ? 2 : 1
  const levels: ApprovalLevel[] = []
  for (let lvl = 0; lvl < levelCount; lvl++) {
    const approverCount = ((n + lvl) % 4 === 0) ? 3 : ((n + lvl) % 2 === 0 ? 2 : 1)
    const rule: 'all' | 'any' = ((n + lvl) % 2 === 0) ? 'all' : 'any'
    const isPastLevel = lvl < levelCount - 1
    const steps: ApprovalStep[] = []
    for (let a = 0; a < approverCount; a++) {
      const idx = (n + lvl * 3 + a) % requesters.length
      const isFirstApproverThisLevel = a === 0
      let status: ApprovalStep['status'] = 'awaiting approval'
      if (isPastLevel) status = 'approved'
      else if (task.status === 'action required' && isFirstApproverThisLevel && (n % 5 === 0)) status = 'rejected'
      else if (task.status === 'action required') status = 'awaiting approval'
      else status = isFirstApproverThisLevel ? 'approved' : 'awaiting approval'
      steps.push({
        name: requesters[idx]!,
        role: roles[(n + idx) % roles.length]!,
        status,
        timestamp: status !== 'awaiting approval' ? `${task.date}T${String(9 + (idx % 8)).padStart(2, '0')}:${String((idx * 7) % 60).padStart(2, '0')}:00` : undefined,
        comment: status === 'rejected' ? commentTexts[n % commentTexts.length] : undefined,
      })
    }
    const approvedCount = steps.filter((s) => s.status === 'approved').length
    const hasRejected = steps.some((s) => s.status === 'rejected')
    const isLevelDone = rule === 'any' ? approvedCount > 0 : approvedCount === steps.length
    const levelStatus: ApprovalLevel['status'] = hasRejected ? 'rejected' : isLevelDone ? 'approved' : 'awaiting approval'
    levels.push({ label: `Approval stage ${lvl + 1}`, rule, status: levelStatus, approvedCount, steps })
  }
  return levels
}

/** Overall status shown in the popover header ("Approval log - {status}"). */
export function overallApprovalStatus(levels: ApprovalLevel[]): 'approved' | 'awaiting approval' | 'rejected' {
  if (levels.some((l) => l.status === 'rejected')) return 'rejected'
  if (levels.every((l) => l.status === 'approved')) return 'approved'
  return 'awaiting approval'
}

export function commentsFor(task: Task): TaskComment[] {
  const n = task.number
  const count = n % 4 // 0-3 comments
  return Array.from({ length: count }, (_, i) => {
    const idx = (n + i) % requesters.length
    return {
      id: `${task.id}-C${i + 1}`,
      author: requesters[idx]!,
      timestamp: `${task.date}T${String(10 + i).padStart(2, '0')}:${String((idx * 11) % 60).padStart(2, '0')}:00`,
      text: commentTexts[(n + i) % commentTexts.length]!,
    }
  })
}

// Doc-type filter tabs shown above the table — "All" plus every TaskDocType, in
// the fixed order the tab strip should render (not alphabetical/random).
export const taskDocTypeTabs: { label: string; docType: TaskDocType | null }[] = [
  { label: 'All', docType: null },
  { label: 'Sales quotes', docType: 'Sales Quote' },
  { label: 'Sales orders', docType: 'Sales Order' },
  { label: 'Sales deliveries', docType: 'Sales Delivery' },
  { label: 'Sales invoices', docType: 'Sales Invoice' },
  { label: 'Purchase requests', docType: 'Purchase Request' },
  { label: 'Purchase orders', docType: 'Purchase Order' },
  { label: 'Purchase deliveries', docType: 'Purchase Delivery' },
  { label: 'Purchase invoices', docType: 'Purchase Invoice' },
  { label: 'Expenses', docType: 'Expense' },
  { label: 'Warehouse transfers', docType: 'Warehouse Transfer' },
  { label: 'Production plans', docType: 'Production Plan' },
  { label: 'Stock In/Out', docType: 'Stock In/Out' },
]
