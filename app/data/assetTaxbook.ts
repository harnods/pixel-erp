/**
 * FG-1 tax outputs on the engine: the class master (TS-01), the statutory
 * classification and its constraints (OD-02, FG1-AC6), a class change that
 * re-inherits the class defaults, the Lampiran 9 schedule per asset
 * (OD-05, OD-48) and the roll-forward (TS-06).
 *
 * Nothing money-valued is stored here. Every figure is read from the ledgers
 * the store replays, so any event recorded anywhere moves these rows.
 */
import { computed, ref } from 'vue'
import {
  assetRecords, ledgers, fixedAssets, recordEvent, updateAssetRecord, eventsOf,
  earliestEffectivePeriod, viewAs, actingUser, onAssetStoreReset, CURRENT_PERIOD, FY_START,
  type EventResult,
} from './assetStore'
import {
  STATUTORY_GROUPS, type AssetType, type FixedAsset,
} from './fixedAssets'
import { classMaster as CLASS_MASTER_SEED } from './fixedAssetScreens'
import {
  addPeriods, isAfter, isBefore, costAt, chargesBetween, bookValueAt, isHeldAt, formatLife,
  METHOD_LABEL, periodLabel, periodOfDate,
  type AccountingMethod, type AssetLedger, type Book, type BookLedger, type Period,
  type EstimateRevisionEvent, type TaxClassificationEvent,
} from './assetEngine'

// ── The class master (TS-01) ────────────────────────────────────────────────

export interface AssetClassDef {
  class: string
  type: AssetType
  /** The statutory group an asset of this class arrives with. */
  defaultTaxGroup: string
  /** Default accounting life. The tax life is the group's, never the class's. */
  commercialLifeMonths: number
  method: AccountingMethod
  accounts: string
}

function seedClasses(): AssetClassDef[] {
  return [
    ...CLASS_MASTER_SEED.map((c) => ({
      class: c.class,
      type: 'Tangible' as const,
      defaultTaxGroup: c.defaultTaxGroup,
      commercialLifeMonths: parseInt(c.commercialLife, 10) * 12,
      method: 'straight-line' as const,
      accounts: c.accounts,
    })),
    {
      class: 'Intangible assets', type: 'Intangible', defaultTaxGroup: 'Tax group 2',
      commercialLifeMonths: 120, method: 'straight-line', accounts: '1-1670 / 6-5170',
    },
  ]
}

export const assetClassMaster = ref<AssetClassDef[]>(seedClasses())
onAssetStoreReset(() => { assetClassMaster.value = seedClasses() })

export function classDef(cls: string): AssetClassDef | undefined {
  return assetClassMaster.value.find((c) => c.class === cls)
}

/** The tax life a group fixes, in months. */
export function groupLifeMonths(group: string): number | null {
  return STATUTORY_GROUPS[group]?.lifeMonths ?? null
}

// ── Statutory constraints (OD-02, FG-1.5) ───────────────────────────────────

export const BUILDING_GROUPS = ['Permanent building', 'Non-permanent building']
export const ORDINARY_GROUPS = ['Tax group 1', 'Tax group 2', 'Tax group 3', 'Tax group 4']

/**
 * The groups an asset may take. A building code carries permanent or
 * non-permanent and never Kelompok 1 to 4; an intangible is amortised on the
 * four ordinary groups and can never be given a building group. The rule
 * belongs at entry, so the picker only ever offers what the filing accepts.
 */
export function allowedGroupsFor(type: AssetType, cls: string): string[] {
  if (type === 'Intangible') return ORDINARY_GROUPS
  if (cls === 'Buildings') return BUILDING_GROUPS
  return ORDINARY_GROUPS
}

export function groupRefusal(type: AssetType, cls: string, group: string): string | null {
  if (!STATUTORY_GROUPS[group]) return `${group} is not a statutory group`
  if (allowedGroupsFor(type, cls).includes(group)) return null
  if (type === 'Intangible') return `${group} is a building group. An intangible takes one of Tax group 1 to 4.`
  if (cls === 'Buildings') return `A building takes Permanent building or Non-permanent building, never ${group}.`
  return `${group} is for buildings only. A ${cls.toLowerCase()} asset takes one of Tax group 1 to 4.`
}

/** The eleven intangible statutory codes (Daftar Amortisasi). */
export const INTANGIBLE_CODES: { code: string; label: string }[] = [
  { code: '0601', label: 'Patent' }, { code: '0602', label: 'Copyright' },
  { code: '0603', label: 'Brand or trademark' }, { code: '0604', label: 'Licence' },
  { code: '0605', label: 'Franchise' }, { code: '0606', label: 'Concession or mining right' },
  { code: '0607', label: 'Goodwill' }, { code: '0608', label: 'Software' },
  { code: '0609', label: 'Formula or recipe' }, { code: '0610', label: 'Customer list' },
  { code: '0699', label: 'Other intangible' },
]
export const intangibleCodeOptions = INTANGIBLE_CODES.map((c) => `${c.code} ${c.label}`)

/** Roles that may set a statutory classification (FG-1.6). */
export const canClassify = computed(() => viewAs.value === 'Owner' || viewAs.value === 'Accounting' || viewAs.value === 'Tax')
/** LM authority: only it may move a fiscal life away from the group (FG1-AC6). */
export const hasLmAuthority = computed(() => viewAs.value === 'Owner')

export const FISCAL_LIFE_FIXED = (group: string, months: number) =>
  `The fiscal life is fixed by ${group} at ${formatLife(months)}. Changing it away from the group needs LM authority, which ${viewAs.value} does not hold.`

export interface ClassificationInput {
  group: string
  /** Intangibles only. */
  statutoryCode?: string | null
  /** Months. Omitted or equal to the group's life keeps the statutory life. */
  fiscalLifeMonths?: number | null
}

export type ClassifyResult = { ok: true; eventId: string | null; message: string } | { ok: false; reason: string; field?: string }

/**
 * Set or change an asset's statutory classification. The checks are here, in
 * the store, and not only in the drawer, so no screen can reach round them.
 * The tax book is rebuilt from the in-service date on the group's life.
 */
export function classifyAsset(id: string, input: ClassificationInput): ClassifyResult {
  const s = assetRecords.value.find((x) => x.id === id)
  const l = ledgers.value[id]
  if (!s || !l) return { ok: false, reason: `No asset ${id}` }
  if (!canClassify.value) return { ok: false, reason: `Viewing as ${viewAs.value}. A statutory classification needs the Owner, Accounting or Tax role.` }
  const refusal = groupRefusal(s.type, s.class, input.group)
  if (refusal) return { ok: false, reason: refusal, field: 'group' }
  const statutory = groupLifeMonths(input.group)!
  const life = input.fiscalLifeMonths ?? statutory
  if (life !== statutory && !hasLmAuthority.value) return { ok: false, reason: FISCAL_LIFE_FIXED(input.group, statutory), field: 'fiscalLife' }
  if (!(life > 0)) return { ok: false, reason: 'Enter the fiscal life in years', field: 'fiscalLife' }
  let code = s.statutoryCode
  if (s.type === 'Intangible') {
    code = input.statutoryCode ?? s.statutoryCode
    if (!code || !intangibleCodeOptions.includes(code)) return { ok: false, reason: 'Choose the statutory code', field: 'statutoryCode' }
  }
  const tax = l.books.tax
  const curLife = tax ? tax.bases[tax.bases.length - 1]!.lifeMonths : null
  const groupChanged = l.taxGroup !== input.group || curLife !== life
  if (!groupChanged && code === s.statutoryCode) return { ok: false, reason: 'Nothing has changed: the group, fiscal life and code are as recorded' }
  let eventId: string | null = null
  if (groupChanged) {
    const e: Omit<TaxClassificationEvent, 'id'> = {
      kind: 'tax-classification', period: CURRENT_PERIOD, date: '30/09/2026', recordedBy: actingName(),
      taxGroup: input.group, tax: { method: 'straight-line', lifeMonths: life, residual: 0, ...migratedOpening(id) },
    }
    const r = recordEvent(id, e)
    if (!r.ok) return { ok: false, reason: r.reason }
    eventId = r.event.id
  }
  if (code !== s.statutoryCode) updateAssetRecord(id, { statutoryCode: code })
  return { ok: true, eventId, message: `${id} classified to ${input.group}, fiscal life ${formatLife(life)}` }
}

/** A fiscal opening agreed at migration survives a later reclassification. */
function migratedOpening(id: string): { opening?: { period: Period; accumulated: number } } {
  const last = [...eventsOf(id)].reverse().find((e): e is TaxClassificationEvent => e.kind === 'tax-classification')
  return last?.tax.opening ? { opening: last.tax.opening } : {}
}

function actingName(): string {
  return actingUser.value
}

// ── Class change (TS-01) ────────────────────────────────────────────────────

export interface FieldChange { field: string; before: string; after: string }

export interface ClassChangePlan {
  ok: boolean
  reason?: string
  changes: FieldChange[]
  /** The events the change records. They post nothing. */
  events: (Omit<TaxClassificationEvent, 'id'> | Omit<EstimateRevisionEvent, 'id'>)[]
}

const firstOf = (p: Period) => `01/${p.slice(5)}/${p.slice(0, 4)}`

/**
 * What moving an asset to another class does: the class's statutory group
 * and accounting life and method are inherited. The group rebuilds the tax
 * book from in-service; the life and method are a change in estimate from
 * the earliest open period, so no posted period moves.
 */
export function planClassChange(id: string, cls: string): ClassChangePlan {
  const s = assetRecords.value.find((x) => x.id === id)
  const l = ledgers.value[id]
  const def = classDef(cls)
  const none = (reason: string): ClassChangePlan => ({ ok: false, reason, changes: [], events: [] })
  if (!s || !l) return none(`No asset ${id}`)
  if (!def) return none(`No class ${cls}`)
  if (l.disposedIn || l.splitIn) return none(`${id} is no longer held. Its class cannot change.`)
  if (def.type !== s.type) return none(`${cls} holds ${def.type.toLowerCase()} assets and ${id} is ${s.type.toLowerCase()}.`)
  if (s.class === cls) return none(`${id} is already in ${cls}`)
  const changes: FieldChange[] = [{ field: 'Class', before: s.class, after: cls }]
  const events: ClassChangePlan['events'] = []
  const P = earliestEffectivePeriod.value
  if (l.taxGroup !== def.defaultTaxGroup) {
    changes.push({ field: 'Statutory group', before: l.taxGroup ?? 'Not set', after: def.defaultTaxGroup })
    changes.push({ field: 'Tax life', before: l.books.tax ? formatLife(l.books.tax.bases.at(-1)!.lifeMonths) : 'Not set', after: formatLife(groupLifeMonths(def.defaultTaxGroup)) })
    events.push({
      kind: 'tax-classification', period: CURRENT_PERIOD, date: '30/09/2026', recordedBy: actingName(),
      taxGroup: def.defaultTaxGroup, tax: { method: 'straight-line', lifeMonths: groupLifeMonths(def.defaultTaxGroup), residual: 0, ...migratedOpening(id) },
    })
  }
  const acc = l.books.accounting.bases.at(-1)!
  if (!s.indefiniteLife && (acc.lifeMonths !== def.commercialLifeMonths || acc.method !== def.method)) {
    const e: Omit<EstimateRevisionEvent, 'id'> = { kind: 'estimate-revision', book: 'accounting', period: P, date: firstOf(P), recordedBy: actingName() }
    if (acc.lifeMonths !== def.commercialLifeMonths) {
      e.lifeMonths = def.commercialLifeMonths
      changes.push({ field: 'Accounting life', before: formatLife(acc.lifeMonths), after: `${formatLife(def.commercialLifeMonths)} from ${periodLabel(P)}` })
    }
    if (acc.method !== def.method) {
      e.method = def.method
      changes.push({ field: 'Method', before: METHOD_LABEL[acc.method], after: METHOD_LABEL[def.method] })
    }
    events.push(e)
  }
  return { ok: true, changes, events }
}

export const canChangeClass = computed(() => viewAs.value === 'Owner' || viewAs.value === 'Accounting')

export type ClassChangeResult = { ok: true; eventIds: string[]; previousClass: string } | { ok: false; reason: string }

export function changeAssetClass(id: string, cls: string): ClassChangeResult {
  if (!canChangeClass.value) return { ok: false, reason: `Viewing as ${viewAs.value}. Changing a class needs the Owner or Accounting role.` }
  const plan = planClassChange(id, cls)
  if (!plan.ok) return { ok: false, reason: plan.reason! }
  const previousClass = assetRecords.value.find((x) => x.id === id)!.class
  const eventIds: string[] = []
  for (const e of plan.events) {
    const r: EventResult = recordEvent(id, e)
    if (!r.ok) return { ok: false, reason: r.reason }
    eventIds.push(r.event.id)
  }
  updateAssetRecord(id, { class: cls })
  return { ok: true, eventIds, previousClass }
}

/** Change a class definition. Assets already in the class keep what they have. */
export function updateClassDef(cls: string, patch: Partial<Pick<AssetClassDef, 'defaultTaxGroup' | 'commercialLifeMonths' | 'method'>>): string | null {
  const def = classDef(cls)
  if (!def) return `No class ${cls}`
  if (!canChangeClass.value) return `Viewing as ${viewAs.value}. The class master needs the Owner or Accounting role.`
  if (patch.defaultTaxGroup) {
    const r = groupRefusal(def.type, def.class, patch.defaultTaxGroup)
    if (r) return r
  }
  if (patch.commercialLifeMonths !== undefined && !(patch.commercialLifeMonths > 0)) return 'Enter the accounting life in years'
  assetClassMaster.value = assetClassMaster.value.map((c) => (c.class === cls ? { ...c, ...patch } : c))
  return null
}

/** How many assets on the register carry each class. */
export function classCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of fixedAssets.value) if (a.status !== 'Disposed' && a.status !== 'Split') out[a.class] = (out[a.class] ?? 0) + 1
  return out
}

// ── Lampiran 9 per asset (OD-05, OD-48, FG9-AC4) ────────────────────────────

export interface LampiranRow {
  id: string
  name: string
  /** Half 1: the statutory group. Half 2: the statutory code and its group. */
  group: string
  /** mm/yyyy */
  acquired: string
  cost: number
  /** Null for an asset acquired in the year: it had no opening value. */
  openingFiscal: number | null
  commercialMethod: string
  fiscalMethod: string
  charge: number
  /** Null once disposed of in the year. */
  closingFiscal: number | null
  note: string | null
}

/** On the tax book and on the register at some point in FY2026 to `p`. */
function inFiling(l: AssetLedger, p: Period): boolean {
  if (!l.books.tax || isAfter(l.registeredFrom, p)) return false
  return !(l.disposedIn && isBefore(l.disposedIn, FY_START))
}

function methodText(b: BookLedger | null, p: Period): string {
  if (!b) return 'Not set'
  const basis = b.bases.filter((x) => !isAfter(x.fromPeriod, p)).at(-1) ?? b.bases[0]!
  if (basis.lifeMonths === null) return 'Not amortised'
  return `${METHOD_LABEL[basis.method]}, ${formatLife(basis.lifeMonths)}`
}

export function lampiranRows(type: AssetType, p: Period = CURRENT_PERIOD): LampiranRow[] {
  const out: LampiranRow[] = []
  const opening = addPeriods(FY_START, -1)
  for (const s of assetRecords.value) {
    if (s.type !== type) continue
    const l = ledgers.value[s.id]!
    if (!inFiling(l, p)) continue
    const group = type === 'Tangible' ? l.taxGroup! : `${s.statutoryCode ?? 'Code not set'} · ${l.taxGroup}`
    const disposedNote = l.disposedIn && !isAfter(l.disposedIn, p) ? `Disposed ${l.books.accounting.disposal!.date}` : null
    const splitNote = l.splitIn && !isAfter(l.splitIn, p) ? `Split ${periodLabel(l.splitIn)}` : null
    const childNote = l.splitFrom ? `Split from ${l.splitFrom}` : null
    out.push({
      id: s.id,
      name: s.name,
      group,
      acquired: l.inServiceDate.slice(3),
      cost: isHeldAt(l, p) || l.disposedIn ? costAt(l.books.accounting, p) : costAt(l.books.accounting, addPeriods(l.splitIn ?? p, -1)),
      openingFiscal: isHeldAt(l, opening) ? bookValueAt(l, 'tax', opening) : null,
      commercialMethod: methodText(l.books.accounting, p),
      fiscalMethod: methodText(l.books.tax, p),
      charge: chargesBetween(l, 'tax', FY_START, p) ?? 0,
      closingFiscal: bookValueAt(l, 'tax', p),
      note: disposedNote ?? splitNote ?? childNote,
    })
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id))
}

export interface LampiranStatus {
  tangible: number
  intangible: number
  /** Held in the year with no statutory group: the filing refuses while any exist. */
  unclassified: FixedAsset[]
  unreportedCost: number
  ready: boolean
}

export function lampiranStatus(p: Period = CURRENT_PERIOD): LampiranStatus {
  const tangible = lampiranRows('Tangible', p).length
  const intangible = lampiranRows('Intangible', p).length
  const unclassified = fixedAssets.value.filter((a) => {
    const l = ledgers.value[a.id]!
    if (l.books.tax || isAfter(l.registeredFrom, p)) return false
    return !(l.disposedIn && isBefore(l.disposedIn, FY_START)) && !(l.splitIn && !isAfter(l.splitIn, FY_START))
  })
  const unreportedCost = unclassified.reduce((s, a) => s + costAt(ledgers.value[a.id]!.books.accounting, p), 0)
  return { tangible, intangible, unclassified, unreportedCost, ready: unclassified.length === 0 }
}

// ── Roll-forward (TS-06) ────────────────────────────────────────────────────

export interface RollForwardRow {
  class: string
  assets: number
  opening: number
  additions: number
  /** Carrying amount moved in or out by a split. Net zero across the register. */
  transfers: number
  disposals: number
  depreciation: number
  /** Losses less reversals. Always 0 on the tax book, which does not recognise them. */
  impairment: number
  closing: number
  /** opening + additions + transfers - disposals - depreciation - impairment - closing. 0 when it ties. */
  unexplained: number
}

const inRange = (x: { period: Period }, from: Period, to: Period) => !isBefore(x.period, from) && !isAfter(x.period, to)

function movementFor(l: AssetLedger, s: { splitFrom?: string }, book: Book, from: Period, to: Period) {
  const b = book === 'accounting' ? l.books.accounting : l.books.tax
  const prev = addPeriods(from, -1)
  if (!b) return null
  const opening = isHeldAt(l, prev) ? bookValueAt(l, book, prev) ?? 0 : 0
  const closing = isHeldAt(l, to) ? bookValueAt(l, book, to) ?? 0 : 0
  let additions = 0
  let transfers = 0
  if (inRange({ period: l.registeredFrom }, from, to)) {
    if (s.splitFrom) transfers += b.costHistory[0]!.cost - (b.bases[0]?.openingAccumulated ?? 0)
    else additions += b.costHistory[0]!.cost - (b.bases[0]?.openingAccumulated ?? 0)
  }
  for (const e of l.events) {
    if (e.kind === 'improvement' && inRange(e, from, to)) additions += e.amount
  }
  for (const c of b.corrections) if (inRange(c, from, to)) additions += c.correctedCost - c.previousCost
  if (b.split && inRange(b.split, from, to)) transfers -= b.split.cost - b.split.accumulated
  let disposals = 0
  if (b.disposal && inRange(b.disposal, from, to)) disposals += b.disposal.carrying
  for (const d of b.partialDisposals) if (inRange(d, from, to)) disposals += d.carrying
  const depreciation = chargesBetween(l, book, from, to) ?? 0
  let impairment = 0
  for (const i of b.impairments) if (inRange(i, from, to)) impairment += i.loss
  for (const r of b.reversals) if (inRange(r, from, to)) impairment -= r.applied
  return { opening, closing, additions, transfers, disposals, depreciation, impairment }
}

/**
 * The carrying amount per class from the start of the year to `to`, on one
 * book. Every column is summed from its own source, so the unexplained
 * column is a check that can fail rather than a plug.
 */
export function rollForward(book: Book, to: Period = CURRENT_PERIOD, from: Period = FY_START): { rows: RollForwardRow[]; total: RollForwardRow; excluded: string[] } {
  const rows = new Map<string, RollForwardRow>()
  const excluded: string[] = []
  for (const s of assetRecords.value) {
    const l = ledgers.value[s.id]!
    if (isAfter(l.registeredFrom, to)) continue
    if (l.disposedIn && isBefore(l.disposedIn, from)) continue
    const m = movementFor(l, s, book, from, to)
    if (!m) { excluded.push(s.id); continue }
    const r = rows.get(s.class) ?? { class: s.class, assets: 0, opening: 0, additions: 0, transfers: 0, disposals: 0, depreciation: 0, impairment: 0, closing: 0, unexplained: 0 }
    r.assets += 1
    r.opening += m.opening
    r.additions += m.additions
    r.transfers += m.transfers
    r.disposals += m.disposals
    r.depreciation += m.depreciation
    r.impairment += m.impairment
    r.closing += m.closing
    rows.set(s.class, r)
  }
  const list = [...rows.values()]
  for (const r of list) r.unexplained = r.opening + r.additions + r.transfers - r.disposals - r.depreciation - r.impairment - r.closing
  const total = list.reduce<RollForwardRow>((t, r) => ({
    class: 'Total', assets: t.assets + r.assets, opening: t.opening + r.opening, additions: t.additions + r.additions,
    transfers: t.transfers + r.transfers, disposals: t.disposals + r.disposals, depreciation: t.depreciation + r.depreciation,
    impairment: t.impairment + r.impairment, closing: t.closing + r.closing, unexplained: t.unexplained + r.unexplained,
  }), { class: 'Total', assets: 0, opening: 0, additions: 0, transfers: 0, disposals: 0, depreciation: 0, impairment: 0, closing: 0, unexplained: 0 })
  const order = assetClassMaster.value.map((c) => c.class)
  list.sort((a, b) => order.indexOf(a.class) - order.indexOf(b.class))
  return { rows: list, total, excluded }
}

// ── P&L impact (OD-40) and difference by dimension (OD-04) ──────────────────

export interface ImpactLine {
  key: string
  assets: number
  /** Charged to profit on the accounting book: depreciation, impairment, loss on disposal. */
  accounting: number
  /** Deductible on the fiscal book: impairment is never, disposal on the tax carrying amount. */
  fiscal: number
  /** fiscal less accounting: positive is a further deduction, negative is added back. */
  difference: number
}

/**
 * Every figure the asset module puts through profit in FY2026 to `p`, on both
 * books, grouped by class or by statutory group. A gain on disposal is a
 * negative charge. Only classified assets are in it, so both columns describe
 * the same population; the rest is counted separately.
 */
export function impactBy(dim: 'class' | 'group' | 'line', p: Period = CURRENT_PERIOD): { rows: ImpactLine[]; total: ImpactLine; excludedAccounting: number; excluded: number } {
  const rows = new Map<string, ImpactLine>()
  const add = (key: string, id: string | null, acc: number, fis: number) => {
    const r = rows.get(key) ?? { key, assets: 0, accounting: 0, fiscal: 0, difference: 0, ids: new Set<string>() } as ImpactLine & { ids: Set<string> }
    r.accounting += acc
    r.fiscal += fis
    if (id) (r as ImpactLine & { ids: Set<string> }).ids.add(id)
    rows.set(key, r)
  }
  const inFy = (x: { period: Period }) => !isBefore(x.period, FY_START) && !isAfter(x.period, p)
  let excludedAccounting = 0
  let excluded = 0
  for (const s of assetRecords.value) {
    const l = ledgers.value[s.id]!
    const acc = chargesBetween(l, 'accounting', FY_START, p) ?? 0
    if (!l.books.tax) {
      if (acc) { excludedAccounting += acc; excluded += 1 }
      continue
    }
    const tax = chargesBetween(l, 'tax', FY_START, p) ?? 0
    const k = (line: string) => (dim === 'class' ? s.class : dim === 'group' ? l.taxGroup! : line)
    add(k(s.type === 'Tangible' ? 'Depreciation' : 'Amortisation'), s.id, acc, tax)
    for (const i of l.books.accounting.impairments) if (inFy(i) && i.loss) add(k('Impairment loss'), s.id, i.loss, 0)
    for (const r of l.books.accounting.reversals) if (inFy(r) && r.applied) add(k('Impairment loss'), s.id, -r.applied, 0)
    const dA = l.books.accounting.disposal
    const dT = l.books.tax.disposal
    if (dA && inFy(dA)) add(k('Loss (gain) on disposal'), s.id, -dA.gainLoss, -(dT?.gainLoss ?? 0))
    l.books.accounting.partialDisposals.forEach((d, i) => {
      if (inFy(d)) add(k('Loss (gain) on disposal'), s.id, -d.gainLoss, -(l.books.tax!.partialDisposals[i]?.gainLoss ?? 0))
    })
  }
  const order = ['Depreciation', 'Amortisation', 'Impairment loss', 'Loss (gain) on disposal']
  const out = [...rows.values()].map((r) => {
    const ids = (r as ImpactLine & { ids?: Set<string> }).ids
    return { key: r.key, assets: ids?.size ?? 0, accounting: r.accounting, fiscal: r.fiscal, difference: r.fiscal - r.accounting }
  }).sort((a, b) => (dim === 'line' ? order.indexOf(a.key) - order.indexOf(b.key) : a.key.localeCompare(b.key)))
  const total = out.reduce<ImpactLine>((t, r) => ({
    key: 'Total', assets: t.assets + r.assets, accounting: t.accounting + r.accounting, fiscal: t.fiscal + r.fiscal, difference: t.difference + r.difference,
  }), { key: 'Total', assets: 0, accounting: 0, fiscal: 0, difference: 0 })
  if (dim === 'line') total.assets = new Set(assetRecords.value.filter((s) => ledgers.value[s.id]!.books.tax).map((s) => s.id)).size
  return { rows: out, total, excludedAccounting, excluded }
}

// ── Incomplete parameters (OD-35) ───────────────────────────────────────────

/**
 * What an asset still held is missing for one of the outputs that depend on
 * it: the tax book and filing (group, code), or the count (location,
 * custodian). Each is named so the register can say which, not just that.
 */
export function missingParameters(a: FixedAsset): string[] {
  if (a.status === 'Disposed' || a.status === 'Split') return []
  const out: string[] = []
  if (!a.taxGroup) out.push('Statutory group')
  if (a.type === 'Intangible' && !a.statutoryCode) out.push('Statutory code')
  if (a.commercialLifeMonths === null && !a.indefiniteLife) out.push('Useful life')
  if (a.type === 'Tangible' && !a.location) out.push('Location')
  if (a.type === 'Tangible' && !a.custodian) out.push('Custodian')
  return out
}

/** The period an asset's history begins, for the classification drawer. */
export function inServicePeriod(id: string): Period {
  return periodOfDate(ledgers.value[id]!.inServiceDate)
}

/** The events recorded on an asset, for a reversal check. */
export { eventsOf }
