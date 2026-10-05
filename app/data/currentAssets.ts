/**
 * Fixed assets (current) — the asset module as it ships in production today
 * (jurnal-accounting-frontend/src/modules/assets). Lives beside the new asset
 * register (fixedAssets.ts / assetStore.ts) and shares nothing with it.
 *
 * Tenant: PT Central Perk Indonesia. Accounts come from the shared mock chart
 * (MAPPING_COA — the same source Settings › Default accounts reads).
 *
 * Depreciation is derived, not stored: every asset keeps its basis (cost, method,
 * rate, opening accumulated depreciation and its cut-off date) plus the last
 * period it was applied through. The history rows, accumulated depreciation,
 * book value and the pending schedule all fall out of those fields, so applying
 * or reverting a period is one field change.
 *
 * Persistence: user-created assets, edited seed assets and deleted seed ids are
 * kept with loadCreated / saveCreated (persist.ts), so everything survives a reload.
 */
import { ref, computed } from 'vue'
import { MAPPING_COA } from './companySettings'
import { TODAY_ISO } from './master'
import { loadCreated, saveCreated } from './persist'

// ── Types ───────────────────────────────────────────────────────────────────

export type CurrentAssetStatus = 'active' | 'pending' | 'disposed'
export type CurrentDepreciationMethod = 'straight_line' | 'reducing_balance'

export interface CurrentAssetDisposal {
  date: string               // ISO
  salePrice: number
  depositAccount: string | null
  gainLossAccount: string
  memo: string
  /** Journal entry number of the disposal entry. */
  entryNo: string
}

export interface CurrentAsset {
  id: string
  /** Bare number, e.g. '10001' — the list renders it as "Fixed Assets #10001". */
  number: string
  name: string
  description: string
  status: CurrentAssetStatus
  acquisitionDate: string    // ISO
  acquisitionCost: number
  assetAccount: string | null
  creditedAccount: string | null
  tags: string[]
  depreciable: boolean
  method: CurrentDepreciationMethod
  usefulLife: number | null  // years
  rate: number | null        // % per year
  depreciationAccount: string | null
  accumulatedAccount: string | null
  /** Opening accumulated depreciation (assets brought over from before Mekari ERP). */
  initialDepreciation: number
  /** Cut-off date of the opening balance; depreciation runs from the month after. */
  initialDepreciationDate: string | null
  /** Last period applied, 'YYYY-MM'. null = nothing applied yet. */
  appliedThrough: string | null
  /** Journal entry number of the acquisition. */
  acquisitionEntryNo: string
  disposal?: CurrentAssetDisposal
  userCreated?: boolean
}

export interface CurrentAssetHistoryRow {
  id: string
  date: string               // ISO
  number: string
  description: string
  kind: 'acquisition' | 'opening' | 'depreciation'
  expense: number | null
  accumulated: number | null
  bookValue: number
}

export interface CurrentDepreciationScheduleRow {
  id: string                 // `${assetId}:${period}`
  assetId: string
  assetNumber: string
  assetName: string
  period: string             // 'YYYY-MM'
  periodLabel: string        // 'May 2026'
  rate: string               // '25%'
  method: string
  amount: number
}

export interface CurrentAssetJournalLine {
  id: string
  date: string
  action: string
  entryNo: string
  account: string
  debit: number | null
  credit: number | null
}

// ── Accounts (shared mock chart) ────────────────────────────────────────────

export interface CurrentAssetAccountOption { value: string; label: string }

function pool(pred: (code: string) => boolean): CurrentAssetAccountOption[] {
  return MAPPING_COA.filter((a) => pred(a.code)).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))
}

/** Fixed asset category accounts. */
export const currentAssetAccountOptions = pool((c) => /^1-107[0-4]\d$/.test(c))
/** Where the acquisition is paid from / owed to. */
export const currentCreditedAccountOptions = pool((c) => /^1-100\d\d$/.test(c) || c === '2-20100' || c === '2-20200' || c === '3-30999')
/** Expense accounts. */
export const currentDepreciationAccountOptions = pool((c) => c.startsWith('6-') || c.startsWith('8-'))
/** Contra-asset accounts. */
export const currentAccumulatedAccountOptions = pool((c) => /^1-1075\d$/.test(c))
/** Cash & bank. */
export const currentDepositAccountOptions = pool((c) => /^1-100\d\d$/.test(c))
/** Gain account list (other income) vs loss account list (other expense). */
export function currentGainLossAccountOptions(kind: 'gain' | 'loss'): CurrentAssetAccountOption[] {
  return kind === 'gain'
    ? pool((c) => c.startsWith('7-') || c === '8-80002')
    : pool((c) => c === '8-80002' || c === '8-80999' || c === '8-80001')
}

export function currentAccountLabel(code: string | null | undefined): string {
  if (!code) return '—'
  const a = MAPPING_COA.find((x) => x.code === code)
  return a ? `${a.code} ${a.name}` : code
}

// ── Period helpers ──────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function periodOf(iso: string): string { return iso.slice(0, 7) }
function nextPeriod(p: string): string {
  const [y, m] = p.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
function prevPeriod(p: string): string {
  const [y, m] = p.split('-').map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
export function caPeriodEnd(p: string): string {
  const [y, m] = p.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${p}-${String(d).padStart(2, '0')}`
}
export function caPeriodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number) as [number, number]
  return `${MONTHS[m - 1]} ${y}`
}

/** The last period whose month-end has passed — the newest one that can be applied. */
export const CURRENT_LAST_CLOSED_PERIOD = prevPeriod(periodOf(TODAY_ISO))
export const CURRENT_ASSET_TODAY = TODAY_ISO

export function caMethodLabel(m: CurrentDepreciationMethod): string {
  return m === 'reducing_balance' ? 'Reducing balance' : 'Straight line'
}

/** First period that depreciates. */
function firstPeriod(a: CurrentAsset): string {
  if (a.initialDepreciation > 0 && a.initialDepreciationDate) return nextPeriod(periodOf(a.initialDepreciationDate))
  return periodOf(a.acquisitionDate)
}

/** Monthly charges from the first period through `through` (inclusive), capped at cost. */
function charges(a: CurrentAsset, through: string | null): { period: string; amount: number; accumulated: number }[] {
  const out: { period: string; amount: number; accumulated: number }[] = []
  if (!a.depreciable || !a.rate || !through) return out
  let acc = a.initialDepreciation
  let p = firstPeriod(a)
  let guard = 0
  while (p <= through && guard < 600) {
    const remaining = a.acquisitionCost - acc
    if (remaining <= 0) break
    const base = a.method === 'reducing_balance' ? remaining : a.acquisitionCost
    const amount = Math.min(remaining, Math.round((base * a.rate) / 100 / 12))
    if (amount <= 0) break
    acc += amount
    out.push({ period: p, amount, accumulated: acc })
    p = nextPeriod(p)
    guard++
  }
  return out
}

export function caAccumulatedOf(a: CurrentAsset): number {
  const c = charges(a, a.appliedThrough)
  return c.length ? c[c.length - 1]!.accumulated : a.initialDepreciation
}
export function caBookValueOf(a: CurrentAsset): number {
  return a.acquisitionCost - caAccumulatedOf(a)
}

/** Accumulated depreciation as of a date — counts every period ending on or before it, applied or not. */
export function caAccumulatedAsOf(a: CurrentAsset, iso: string): number {
  const p = caPeriodEnd(periodOf(iso)) <= iso ? periodOf(iso) : prevPeriod(periodOf(iso))
  const through = a.appliedThrough && a.appliedThrough > p ? a.appliedThrough : p
  const c = charges(a, through)
  return c.length ? c[c.length - 1]!.accumulated : a.initialDepreciation
}

/** "3 years 4 months" left at the applied position. */
export function caRemainingLifeOf(a: CurrentAsset): string | null {
  if (!a.depreciable || !a.usefulLife || a.status !== 'active') return null
  const total = Math.round(a.usefulLife * 12)
  const used = charges(a, a.appliedThrough).length + (a.initialDepreciation > 0 && a.initialDepreciationDate
    ? monthsBetween(periodOf(a.acquisitionDate), periodOf(a.initialDepreciationDate)) + 1 : 0)
  const left = Math.max(0, total - used)
  if (caBookValueOf(a) <= 0) return '0 months'
  const y = Math.floor(left / 12)
  const m = left % 12
  const parts: string[] = []
  if (y) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`)
  if (m || !y) parts.push(`${m} ${m === 1 ? 'month' : 'months'}`)
  return parts.join(' ')
}
function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number) as [number, number]
  const [yb, mb] = b.split('-').map(Number) as [number, number]
  return (yb - ya) * 12 + (mb - ma)
}

/** Depreciation history rows: acquisition, opening balance (if any), then each applied period. */
export function caHistoryOf(a: CurrentAsset): CurrentAssetHistoryRow[] {
  const rows: CurrentAssetHistoryRow[] = [{
    id: `${a.id}-acq`, date: a.acquisitionDate, number: a.acquisitionEntryNo,
    description: 'Asset acquisition', kind: 'acquisition', expense: null, accumulated: null, bookValue: a.acquisitionCost,
  }]
  if (a.initialDepreciation > 0 && a.initialDepreciationDate) {
    rows.push({
      id: `${a.id}-open`, date: a.initialDepreciationDate, number: a.acquisitionEntryNo,
      description: 'Opening accumulated depreciation', kind: 'opening',
      expense: a.initialDepreciation, accumulated: a.initialDepreciation, bookValue: a.acquisitionCost - a.initialDepreciation,
    })
  }
  const base = Number(a.number) * 100
  charges(a, a.appliedThrough).forEach((c, i) => {
    rows.push({
      id: `${a.id}-${c.period}`, date: caPeriodEnd(c.period), number: String(base + i + 1),
      description: `Depreciation ${caPeriodLabel(c.period)}`, kind: 'depreciation',
      expense: c.amount, accumulated: c.accumulated, bookValue: a.acquisitionCost - c.accumulated,
    })
  })
  return rows
}

/** Disposal journal entry (Entry history on the disposal detail page). */
export function caDisposalEntryOf(a: CurrentAsset): CurrentAssetJournalLine[] {
  const d = a.disposal
  if (!d) return []
  const acc = caAccumulatedOf(a)
  const gl = d.salePrice - (a.acquisitionCost - acc)
  const lines: CurrentAssetJournalLine[] = []
  const push = (account: string | null, debit: number | null, credit: number | null) => {
    if (!account || (!debit && !credit)) return
    lines.push({ id: `${a.id}-dl-${lines.length}`, date: d.date, action: 'Asset disposal', entryNo: d.entryNo, account: currentAccountLabel(account), debit, credit })
  }
  push(a.accumulatedAccount, acc || null, null)
  if (d.salePrice > 0) push(d.depositAccount, d.salePrice, null)
  if (gl < 0) push(d.gainLossAccount, -gl, null)
  push(a.assetAccount, null, a.acquisitionCost)
  if (gl > 0) push(d.gainLossAccount, null, gl)
  // Acquisition entry, for context.
  lines.unshift(
    { id: `${a.id}-al-0`, date: a.acquisitionDate, action: 'Asset acquisition', entryNo: a.acquisitionEntryNo, account: currentAccountLabel(a.assetAccount), debit: a.acquisitionCost, credit: null },
    { id: `${a.id}-al-1`, date: a.acquisitionDate, action: 'Asset acquisition', entryNo: a.acquisitionEntryNo, account: currentAccountLabel(a.creditedAccount), debit: null, credit: a.acquisitionCost },
  )
  return lines
}

export function caGainLossOf(a: CurrentAsset): number {
  if (!a.disposal) return 0
  return a.disposal.salePrice - (a.acquisitionCost - caAccumulatedOf(a))
}
export function caGainLossType(n: number): 'gain' | 'loss' | 'break even' {
  return n > 0 ? 'gain' : n < 0 ? 'loss' : 'break even'
}

// ── Seed ────────────────────────────────────────────────────────────────────

function seed(p: Partial<CurrentAsset> & Pick<CurrentAsset, 'id' | 'number' | 'name' | 'acquisitionDate' | 'acquisitionCost'>): CurrentAsset {
  return {
    description: '', status: 'active', assetAccount: '1-10705', creditedAccount: '1-10004', tags: [],
    depreciable: true, method: 'straight_line', usefulLife: 4, rate: 25,
    depreciationAccount: '6-60100', accumulatedAccount: '1-10755',
    initialDepreciation: 0, initialDepreciationDate: null, appliedThrough: CURRENT_LAST_CLOSED_PERIOD,
    acquisitionEntryNo: String(20000 + Number(p.number || 0) % 1000),
    ...p,
  }
}

const SEED: CurrentAsset[] = [
  seed({
    id: 'ca-10001', number: '10001', name: 'La Marzocco Linea PB 3-group espresso machine',
    description: 'Main bar, Senopati outlet.', acquisitionDate: '2024-03-15', acquisitionCost: 185_000_000,
    assetAccount: '1-10704', accumulatedAccount: '1-10754', tags: ['Senopati'], appliedThrough: '2026-04',
    acquisitionEntryNo: '20114',
  }),
  seed({
    id: 'ca-10002', number: '10002', name: 'Probat P12 coffee roaster',
    description: 'Roastery, Jl. Raya Bogor. Brought over from the previous accounting system.',
    acquisitionDate: '2023-07-01', acquisitionCost: 640_000_000, assetAccount: '1-10704', accumulatedAccount: '1-10754',
    usefulLife: 8, rate: 12.5, initialDepreciation: 120_000_000, initialDepreciationDate: '2024-12-31',
    appliedThrough: '2026-02', creditedAccount: '3-30999', tags: ['Roastery'], acquisitionEntryNo: '20003',
  }),
  seed({
    id: 'ca-10003', number: '10003', name: 'Toyota Gran Max delivery van B 9123 KCP',
    acquisitionDate: '2025-01-10', acquisitionCost: 245_000_000, assetAccount: '1-10703', accumulatedAccount: '1-10753',
    method: 'reducing_balance', usefulLife: 8, rate: 25, appliedThrough: '2026-04', creditedAccount: '2-20100',
    tags: ['Logistics'], acquisitionEntryNo: '20187',
  }),
  seed({
    id: 'ca-10004', number: '10004', name: 'MacBook Pro 14" for the finance team (4 units)',
    acquisitionDate: '2025-08-04', acquisitionCost: 132_000_000, tags: ['Finance'], acquisitionEntryNo: '20342',
  }),
  seed({
    id: 'ca-10005', number: '10005', name: 'Kemang flagship store fit-out',
    description: 'Bar counter, seating and lighting.', acquisitionDate: '2024-11-01', acquisitionCost: 520_000_000,
    assetAccount: '1-10702', accumulatedAccount: '1-10752', usefulLife: 10, rate: 10, appliedThrough: '2026-04',
    tags: ['Kemang'], acquisitionEntryNo: '20166',
  }),
  seed({
    id: 'ca-10006', number: '10006', name: 'Land — Jl. Raya Bogor km 27 warehouse plot',
    acquisitionDate: '2022-05-20', acquisitionCost: 2_750_000_000, assetAccount: '1-10700', accumulatedAccount: null,
    depreciable: false, usefulLife: null, rate: null, depreciationAccount: null, appliedThrough: null,
    acquisitionEntryNo: '20001',
  }),
  // Worst case: a 60-character name (the form's limit) and a first period still pending.
  seed({
    id: 'ca-10007', number: '10007', name: 'Mahlkönig EK43 grinders for Senopati, Kemang & PIK outlets x3',
    acquisitionDate: '2026-05-12', acquisitionCost: 96_750_000, assetAccount: '1-10704', accumulatedAccount: '1-10754',
    usefulLife: 5, rate: 20, appliedThrough: null, tags: ['Senopati', 'Kemang', 'PIK'], acquisitionEntryNo: '20518',
  }),
  // Zero record: fully depreciated, book value Rp0, nothing pending.
  seed({
    id: 'ca-10008', number: '10008', name: 'POS tablets (iPad 9th gen, 6 units)',
    acquisitionDate: '2022-01-03', acquisitionCost: 33_000_000, acquisitionEntryNo: '20002',
  }),
  // Draft — created from a purchase, not yet recorded as an asset.
  seed({
    id: 'ca-p-1', number: '10011', name: 'Synesso MVP Hydra espresso machine', status: 'pending',
    acquisitionDate: '2026-06-10', acquisitionCost: 210_000_000, assetAccount: null, creditedAccount: '2-20100',
    depreciable: false, usefulLife: null, rate: null, depreciationAccount: null, accumulatedAccount: null,
    appliedThrough: null, acquisitionEntryNo: '20561',
  }),
  seed({
    id: 'ca-p-2', number: '10012', name: 'Cold room for green bean storage', status: 'pending',
    acquisitionDate: '2026-06-18', acquisitionCost: 87_500_000, assetAccount: null, creditedAccount: '2-20100',
    depreciable: false, usefulLife: null, rate: null, depreciationAccount: null, accumulatedAccount: null,
    appliedThrough: null, acquisitionEntryNo: '20574',
  }),
  // Disposed.
  seed({
    id: 'ca-10009', number: '10009', name: 'Daihatsu Gran Max pick-up B 9876 CPI', status: 'disposed',
    acquisitionDate: '2020-02-01', acquisitionCost: 165_000_000, assetAccount: '1-10703', accumulatedAccount: '1-10753',
    usefulLife: 8, rate: 12.5, appliedThrough: '2026-03', acquisitionEntryNo: '19876',
    disposal: { date: '2026-03-31', salePrice: 70_000_000, depositAccount: '1-10004', gainLossAccount: '8-80002', memo: 'Sold to PT Sumber Rejeki Motor.', entryNo: '20488' },
  }),
  seed({
    id: 'ca-10010', number: '10010', name: 'Rancilio Classe 9 espresso machine', status: 'disposed',
    acquisitionDate: '2021-06-01', acquisitionCost: 98_000_000, assetAccount: '1-10704', accumulatedAccount: '1-10754',
    usefulLife: 5, rate: 20, appliedThrough: '2025-11', acquisitionEntryNo: '19902',
    disposal: { date: '2025-12-15', salePrice: 0, depositAccount: null, gainLossAccount: '8-80002', memo: 'Scrapped after boiler failure.', entryNo: '20401' },
  }),
]

// ── Store (seed + persisted changes) ────────────────────────────────────────

const K_CREATED = 'current-assets'
const K_EDITS = 'current-assets-seed-edits'
const K_DELETED = 'current-assets-deleted'

function build(): CurrentAsset[] {
  const edits = loadCreated<CurrentAsset>(K_EDITS)
  const deleted = new Set(loadCreated<string>(K_DELETED))
  const created = loadCreated<CurrentAsset>(K_CREATED)
  const seeded = SEED.filter((s) => !deleted.has(s.id)).map((s) => structuredClone(edits.find((e) => e.id === s.id) ?? s))
  return [...seeded, ...created.filter((c) => !deleted.has(c.id))]
}

export const currentAssets = ref<CurrentAsset[]>(build())

function persist() {
  const seedIds = new Set(SEED.map((s) => s.id))
  const live = new Set(currentAssets.value.map((a) => a.id))
  saveCreated(K_CREATED, currentAssets.value.filter((a) => a.userCreated))
  saveCreated(K_EDITS, currentAssets.value.filter((a) => seedIds.has(a.id)))
  saveCreated(K_DELETED, [...seedIds].filter((id) => !live.has(id)))
}

export function getCurrentAsset(id: string): CurrentAsset | undefined {
  return currentAssets.value.find((a) => a.id === id)
}

export function nextCurrentAssetNumber(): string {
  const max = currentAssets.value.reduce((m, a) => Math.max(m, Number(a.number) || 0), 10000)
  return String(max + 1)
}

export function currentAssetNumberTaken(number: string, exceptId?: string): boolean {
  return currentAssets.value.some((a) => a.number === number.trim() && a.id !== exceptId)
}

export type CurrentAssetInput = Omit<CurrentAsset, 'id' | 'status' | 'appliedThrough' | 'acquisitionEntryNo' | 'disposal' | 'userCreated'>

export function createCurrentAsset(input: CurrentAssetInput): CurrentAsset {
  const id = `ca-u-${Date.now().toString(36)}`
  const a: CurrentAsset = {
    ...input, id, status: 'active', appliedThrough: null, userCreated: true,
    acquisitionEntryNo: String(20600 + currentAssets.value.length),
  }
  // An opening balance is already depreciated through its cut-off date.
  if (a.depreciable && a.initialDepreciation > 0 && a.initialDepreciationDate) a.appliedThrough = periodOf(a.initialDepreciationDate)
  currentAssets.value = [...currentAssets.value, a]
  persist()
  return a
}

export function updateCurrentAsset(id: string, input: Partial<CurrentAssetInput>): void {
  const a = getCurrentAsset(id)
  if (!a) return
  Object.assign(a, input)
  // Recording a draft makes it an active asset.
  if (a.status === 'pending') a.status = 'active'
  persist()
}

export function deleteCurrentAssets(ids: string[]): void {
  const s = new Set(ids)
  currentAssets.value = currentAssets.value.filter((a) => !s.has(a.id))
  persist()
}

/** Apply every pending period of an asset up to and including `through`. */
export function applyCurrentDepreciation(assetId: string, through: string): void {
  const a = getCurrentAsset(assetId)
  if (!a || a.status !== 'active') return
  if (!a.appliedThrough || a.appliedThrough < through) a.appliedThrough = through
  persist()
}

export function applyCurrentDepreciationRows(rowIds: string[]): void {
  const latest = new Map<string, string>()
  for (const id of rowIds) {
    const [assetId, period] = id.split(':') as [string, string]
    if (!latest.has(assetId) || latest.get(assetId)! < period) latest.set(assetId, period)
  }
  latest.forEach((p, assetId) => applyCurrentDepreciation(assetId, p))
}

export function applyAllCurrentDepreciation(): void {
  for (const a of currentAssets.value) if (a.status === 'active' && a.depreciable) applyCurrentDepreciation(a.id, CURRENT_LAST_CLOSED_PERIOD)
}

/** Whether "Revert depreciation" applies: something has been applied after the opening balance. */
export function caCanRevertDepreciation(a: CurrentAsset): boolean {
  return a.status === 'active' && a.depreciable && charges(a, a.appliedThrough).length > 0
}

/** Reverse the latest applied depreciation period. */
export function revertCurrentDepreciation(ids: string[]): number {
  let n = 0
  for (const id of ids) {
    const a = getCurrentAsset(id)
    if (!a || !caCanRevertDepreciation(a)) continue
    const c = charges(a, a.appliedThrough)
    const last = c[c.length - 1]!.period
    a.appliedThrough = last === firstPeriod(a)
      ? (a.initialDepreciation > 0 && a.initialDepreciationDate ? periodOf(a.initialDepreciationDate) : null)
      : prevPeriod(last)
    n++
  }
  persist()
  return n
}

export function disposeCurrentAsset(id: string, d: Omit<CurrentAssetDisposal, 'entryNo'>): void {
  const a = getCurrentAsset(id)
  if (!a) return
  // Depreciation up to the disposal date is booked with the disposal.
  if (a.depreciable) {
    const p = caPeriodEnd(periodOf(d.date)) <= d.date ? periodOf(d.date) : prevPeriod(periodOf(d.date))
    if (!a.appliedThrough || a.appliedThrough < p) a.appliedThrough = p
  }
  a.status = 'disposed'
  a.disposal = { ...d, entryNo: String(20700 + currentAssets.value.length) }
  persist()
}

export function revertCurrentDisposal(id: string): void {
  const a = getCurrentAsset(id)
  if (!a || a.status !== 'disposed') return
  a.status = 'active'
  delete a.disposal
  persist()
}

// ── Pending depreciation schedule ───────────────────────────────────────────

export const currentDepreciationSchedule = computed<CurrentDepreciationScheduleRow[]>(() => {
  const rows: CurrentDepreciationScheduleRow[] = []
  for (const a of currentAssets.value) {
    if (a.status !== 'active' || !a.depreciable || !a.rate) continue
    const applied = new Set(charges(a, a.appliedThrough).map((c) => c.period))
    for (const c of charges(a, CURRENT_LAST_CLOSED_PERIOD)) {
      if (applied.has(c.period)) continue
      if (a.initialDepreciationDate && c.period <= periodOf(a.initialDepreciationDate)) continue
      rows.push({
        id: `${a.id}:${c.period}`, assetId: a.id, assetNumber: a.number, assetName: a.name,
        period: c.period, periodLabel: caPeriodLabel(c.period), rate: `${a.rate}%`, method: caMethodLabel(a.method), amount: c.amount,
      })
    }
  }
  return rows.sort((x, y) => x.period.localeCompare(y.period) || x.assetNumber.localeCompare(y.assetNumber))
})

export function currentAssetTabCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  const n = (s: CurrentAssetStatus) => currentAssets.value.filter((a) => a.status === s).length
  if (n('active')) out['Active assets'] = n('active')
  if (n('pending')) out['Draft assets'] = n('pending')
  if (n('disposed')) out['Disposed assets'] = n('disposed')
  return out
}

/** Title-bar "Apply all" (rendered by the shell) asks the depreciation page to confirm. */
export const currentApplyAllRequested = ref(false)
