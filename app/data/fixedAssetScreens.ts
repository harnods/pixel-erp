/**
 * The tables behind the fixed-asset screens other than the register.
 *
 * Every figure here is computed from the session store (`assetStore.ts`),
 * which replays each asset's event log through the engine. Nothing money-
 * valued is stored in this file, so an action on any screen moves these rows.
 * What remains static is reference data: custody, counts, leases, the class
 * master and the settings switches.
 *
 * Where the design renders an em dash for a field that does not apply, the
 * value is `null` here. The dash is a display decision and belongs to the
 * component, not to the data.
 */
import { computed } from 'vue'
import {
  fixedAssets, ledgers, chargeRange, fyFigures, statutoryLines, tieRows,
  CURRENT_PERIOD, FY_START,
  type TieRow,
} from './assetStore'
import { STATUTORY_GROUPS, type FixedAsset } from './fixedAssets'
import { formatLife, isAfter, isBefore, rupiah, pct, type Period } from './assetEngine'

// ── Asset profit and loss impact ────────────────────────────────────────────

/**
 * The sign convention every difference in the module uses, stated once so
 * each screen can say it in the same words.
 */
export const DIFFERENCE_CONVENTION = 'Difference is accounting less tax. Positive is added back as a tax adjustment (koreksi fiskal). Negative is a further deduction.'

/** One line of the impact statement: the same event on both bases. */
export interface ImpactRow {
  label: string
  /** `null` where that basis does not recognise the event at all. */
  commercial: number | null
  fiscal: number | null
  /**
   * The accounting charge less the tax charge (DIFFERENCE_CONVENTION). For
   * a disposal the columns are gains, so this is the tax gain less the
   * accounting gain; for an impairment it is the loss the tax book ignores.
   */
  difference: number
  /** How the figure was arrived at, shown under the label. */
  basis?: string | null
  assets?: number
  /** The asset a single-asset line is about, for a link. */
  assetId?: string
}

/** Assets the fiscal statement covers: on the register this FY and on both books. */
function inStatement(a: FixedAsset, type: FixedAsset['type'], p: Period): boolean {
  const l = ledgers.value[a.id]!
  if (a.type !== type || !l.books.tax) return false
  // A right-of-use asset is reported on the statement's own lease line
  // (FG-8.5), so it is kept out of the tangible and intangible halves here
  // too. Otherwise the per-asset view and the statement describe different
  // populations and cannot tie.
  if (a.leaseId) return false
  if (isAfter(l.registeredFrom, p)) return false
  return !(l.disposedIn && isBefore(l.disposedIn, FY_START))
}

function grouped(key: (a: FixedAsset) => string, p: Period): ImpactRow[] {
  const rows = new Map<string, ImpactRow>()
  for (const a of fixedAssets.value) {
    if (!inStatement(a, 'Tangible', p)) continue
    const k = key(a)
    const r = rows.get(k) ?? { label: k, commercial: 0, fiscal: 0, difference: 0, assets: 0 }
    r.commercial = (r.commercial ?? 0) + (chargeRange(a.id, 'accounting', FY_START, p) ?? 0)
    r.fiscal = (r.fiscal ?? 0) + (chargeRange(a.id, 'tax', FY_START, p) ?? 0)
    r.difference = r.commercial - r.fiscal
    r.assets = (r.assets ?? 0) + 1
    rows.set(k, r)
  }
  return [...rows.values()].sort((x, y) => (y.commercial ?? 0) - (x.commercial ?? 0))
}

/** Depreciation, FY2026 to the period, grouped by asset class. Tangible, classified. */
export function impactByClass(p: Period = CURRENT_PERIOD): ImpactRow[] {
  return grouped((a) => a.class, p)
}

/**
 * The same depreciation grouped by statutory group. This is the grouping the
 * tax return expects, which is why both views exist.
 */
export function impactByTaxGroup(p: Period = CURRENT_PERIOD): ImpactRow[] {
  return grouped((a) => STATUTORY_GROUPS[a.taxGroup!]?.label ?? a.taxGroup!, p)
}

function yearsLabel(months: number | null): string {
  if (months === null) return 'Indefinite life'
  return formatLife(months)
}

/**
 * Amortisation, FY2026 to the period, one line per intangible.
 *
 * An indefinite-life asset carries `commercial: null`: no commercial schedule
 * exists, not one that happens to charge nothing. Rendering 0 would claim the
 * opposite.
 */
export function amortisationRows(from: Period = FY_START, to: Period = CURRENT_PERIOD): ImpactRow[] {
  return fixedAssets.value
    .filter((a) => inStatement(a, 'Intangible', to))
    .map((a) => {
      const commercial = a.commercialLifeMonths === null ? null : chargeRange(a.id, 'accounting', from, to) ?? 0
      const fiscal = chargeRange(a.id, 'tax', from, to) ?? 0
      return {
        label: `${a.id} ${a.name}`,
        assetId: a.id,
        basis: `Accounting: ${yearsLabel(a.commercialLifeMonths)} · Tax: ${yearsLabel(a.fiscalLifeMonths)}, ${a.taxGroup}`,
        commercial,
        fiscal,
        // Not amortised in the accounts while tax amortises is a temporary
        // difference too: the whole tax charge is a further deduction.
        difference: (commercial ?? 0) - fiscal,
      }
    })
}

/** FY2026 amortisation to the current period. */
export const amortisationYtd = computed(() => amortisationRows())

/** Gains and losses on disposal in the year, both books. */
export function disposalImpactRows(p: Period = CURRENT_PERIOD): ImpactRow[] {
  const out: ImpactRow[] = []
  for (const a of fixedAssets.value) {
    const l = ledgers.value[a.id]!
    const dA = l.books.accounting.disposal
    // A right-of-use asset stays on the lease line (see leaseImpactRow).
    if (a.leaseId || !l.books.tax || !dA || isBefore(dA.period, FY_START) || isAfter(dA.period, p)) continue
    out.push({
      label: 'Gain or loss on disposal',
      basis: `${a.id} ${a.name} · sold ${dA.date}`,
      assetId: a.id,
      commercial: dA.gainLoss,
      fiscal: l.books.tax.disposal?.gainLoss ?? null,
      difference: (l.books.tax.disposal?.gainLoss ?? 0) - dA.gainLoss,
    })
  }
  for (const a of fixedAssets.value) {
    const l = ledgers.value[a.id]!
    if (!l.books.tax || a.leaseId) continue
    l.books.accounting.partialDisposals.forEach((d, i) => {
      if (isBefore(d.period, FY_START) || isAfter(d.period, p)) return
      out.push({
        label: 'Gain or loss on partial disposal',
        basis: `${a.id} ${a.name} · ${pct(d.proportion)} disposed ${d.date}`,
        assetId: a.id,
        commercial: d.gainLoss,
        fiscal: l.books.tax!.partialDisposals[i]?.gainLoss ?? null,
        difference: (l.books.tax!.partialDisposals[i]?.gainLoss ?? 0) - d.gainLoss,
      })
    })
  }
  return out
}

/** Impairment losses in the year. The tax book does not recognise them. */
export function impairmentImpactRows(p: Period = CURRENT_PERIOD): ImpactRow[] {
  const out: ImpactRow[] = []
  for (const a of fixedAssets.value) {
    const l = ledgers.value[a.id]!
    if (!l.books.tax || a.leaseId) continue
    for (const i of l.books.accounting.impairments) {
      if (i.loss === 0 || isBefore(i.period, FY_START) || isAfter(i.period, p)) continue
      out.push({
        label: 'Impairment',
        basis: `${a.id} ${a.name} · written down ${i.date}`,
        assetId: a.id,
        commercial: -i.loss,
        fiscal: null,
        difference: i.loss,
      })
    }
    for (const r of l.books.accounting.reversals) {
      if (r.applied === 0 || isBefore(r.period, FY_START) || isAfter(r.period, p)) continue
      out.push({
        label: 'Impairment reversal',
        basis: `${a.id} ${a.name} · written back ${r.date}${r.capApplied ? ', limited to book value without impairment' : ''}`,
        assetId: a.id,
        commercial: r.applied,
        fiscal: null,
        difference: -r.applied,
      })
    }
  }
  return out
}

/**
 * The right-of-use line: depreciation in the accounts against the lease
 * payments deducted for tax. Shown with its difference, but not part of the
 * net temporary difference (see fyFigures).
 */
export function leaseImpactRow(p: Period = CURRENT_PERIOD): ImpactRow {
  const lease = fyFigures(p).lease
  const assets = fixedAssets.value.filter((a) => a.leaseId && ledgers.value[a.id]!.books.tax
    && !isAfter(ledgers.value[a.id]!.registeredFrom, p)).length
  return {
    label: 'Right-of-use depreciation against lease payments',
    basis: 'Tax deducts the lease payments when due',
    commercial: lease.accounting, fiscal: lease.tax, difference: lease.accounting - lease.tax, assets,
  }
}

export interface StatementFigures extends ReturnType<typeof fyFigures> {
  /** Each section's difference, as the statement subtotals it. */
  sections: { depreciation: number; amortisation: number; disposalAndImpairment: number }
  /** The lease line, shown and excluded. */
  leaseLine: ImpactRow
}

/**
 * The statement's headline figures, derived from the statement's own lines
 * (PRD FG-1.2: deferred tax from the statement's own total, so the two
 * cannot disagree). The net temporary difference is the sum of the section
 * differences; the deferred tax is that sum at the rate.
 */
export function statementFiguresAt(p: Period = CURRENT_PERIOD): StatementFigures {
  const f = fyFigures(p)
  const sum = (rows: ImpactRow[]) => rows.reduce((s, r) => s + r.difference, 0)
  const sections = {
    depreciation: sum(impactByClass(p)),
    amortisation: sum(amortisationRows(FY_START, p)),
    disposalAndImpairment: sum(disposalImpactRows(p)) + sum(impairmentImpactRows(p)),
  }
  const net = sections.depreciation + sections.amortisation + sections.disposalAndImpairment
  return {
    ...f,
    sections,
    leaseLine: leaseImpactRow(p),
    netTemporaryDifference: net,
    netFiscalCorrection: net,
    deferredTax: Math.round(net * f.taxRate),
  }
}

/** The statement's headline figures: difference, deferred tax, exclusions. */
export const statementFigures = computed(() => statementFiguresAt())

// ── Commercial to fiscal difference ─────────────────────────────────────────

export interface DifferenceRow {
  id: string | null
  name: string
  /** The gap between the two books, in rupiah. Summed, it is the net temporary difference. */
  difference: number | null
  /** Why they disagree. The report exists to answer this, not to state the gap. */
  reason: string
  /** Set where the difference arises from an event rather than from the lives. */
  tag: string | null
}

/**
 * Per asset and event, tangible and intangible, classified, largest
 * divergence first. Each difference is the accounting charge less the tax
 * charge (DIFFERENCE_CONVENTION), so the rows sum to the statement's net
 * temporary difference. Right-of-use assets are on the statement's lease
 * line, outside that total, so they are not here either.
 */
export function differenceByAsset(p: Period = CURRENT_PERIOD): DifferenceRow[] {
  const rows: DifferenceRow[] = []
  for (const a of fixedAssets.value) {
    const intangible = inStatement(a, 'Intangible', p)
    if (!intangible && !inStatement(a, 'Tangible', p)) continue
    const l = ledgers.value[a.id]!
    const acc = chargeRange(a.id, 'accounting', FY_START, p) ?? 0
    const tax = chargeRange(a.id, 'tax', FY_START, p) ?? 0
    if (intangible && acc !== tax) {
      const reason = a.commercialLifeMonths === null
        ? `Indefinite life, not amortised in accounting · tax amortises over ${yearsLabel(a.fiscalLifeMonths)}`
        : `Different lives · accounting ${yearsLabel(a.commercialLifeMonths)}, tax ${yearsLabel(a.fiscalLifeMonths)}`
      rows.push({ id: a.id, name: a.name, difference: acc - tax, reason, tag: 'Amortisation' })
    } else if (acc !== tax) {
      const accLife = a.commercialLifeMonths
      const taxLife = a.fiscalLifeMonths
      let reason: string
      if (acc === 0) reason = `Accounting life ended · tax still depreciating over ${yearsLabel(taxLife)}`
      else if (tax === 0) reason = `Tax life ended · accounting still depreciating over ${yearsLabel(accLife)}`
      else if (a.status === 'Impaired') reason = `Impairment lowered the accounting charge · tax charge unchanged`
      else reason = `Tax life ${taxLife! < accLife! ? 'shorter' : 'longer'} than accounting · tax ${yearsLabel(taxLife)}, accounting ${yearsLabel(accLife)}`
      rows.push({ id: a.id, name: a.name, difference: acc - tax, reason, tag: null })
    }
    for (const i of l.books.accounting.impairments) {
      if (i.loss === 0 || isBefore(i.period, FY_START) || isAfter(i.period, p)) continue
      rows.push({
        id: a.id, name: a.name, difference: i.loss, tag: 'Impairment',
        reason: `Written down to ${rupiah(i.recoverable)} in accounting only · not deductible for tax`,
      })
    }
    for (const r of l.books.accounting.reversals) {
      if (r.applied === 0 || isBefore(r.period, FY_START) || isAfter(r.period, p)) continue
      rows.push({
        id: a.id, name: a.name, difference: -r.applied, tag: 'Impairment reversal',
        reason: `Impairment reversal of ${rupiah(r.applied)} in accounting only · tax book unchanged`,
      })
    }
    l.books.accounting.partialDisposals.forEach((d, i) => {
      const t = l.books.tax?.partialDisposals[i]
      if (!t || isBefore(d.period, FY_START) || isAfter(d.period, p)) return
      rows.push({
        id: a.id, name: a.name, difference: t.gainLoss - d.gainLoss, tag: 'Partial disposal',
        reason: `${pct(d.proportion)} disposed · accounting ${d.gainLoss >= 0 ? 'gain' : 'loss'} ${rupiah(Math.abs(d.gainLoss))}, tax ${t.gainLoss >= 0 ? 'gain' : 'loss'} ${rupiah(Math.abs(t.gainLoss))}`,
      })
    })
    const dA = l.books.accounting.disposal
    const dT = l.books.tax?.disposal
    if (dA && dT && !isBefore(dA.period, FY_START) && !isAfter(dA.period, p)) {
      rows.push({
        id: a.id, name: a.name, difference: dT.gainLoss - dA.gainLoss, tag: 'Disposal',
        reason: `Accounting ${dA.gainLoss >= 0 ? 'gain' : 'loss'} ${rupiah(Math.abs(dA.gainLoss))}, tax ${dT.gainLoss >= 0 ? 'gain' : 'loss'} ${rupiah(Math.abs(dT.gainLoss))} · book values differed at disposal`,
      })
    }
  }
  return rows.sort((x, y) => Math.abs(y.difference ?? 0) - Math.abs(x.difference ?? 0))
}

// ── Statutory export (Lampiran 9) ───────────────────────────────────────────

export interface StatutoryRow {
  [k: string]: string | number | null
}

/** Half 1: tangible assets, by statutory group. */
export function statutoryHalf1(p: Period = CURRENT_PERIOD): StatutoryRow[] {
  return statutoryLines(p, 'Tangible').map((l) => ({
    taxGroup: l.key, assets: l.assets, cost: l.cost, charge2026: l.charge, fiscalBookValue: l.bookValue,
  }))
}

/**
 * Half 2: intangible assets (Daftar Amortisasi).
 *
 * The filing has two halves. An export covering only the first completes half
 * a return, which is a different promise from completing one.
 */
export function statutoryHalf2(p: Period = CURRENT_PERIOD): StatutoryRow[] {
  return statutoryLines(p, 'Intangible').map((l) => ({
    statutoryCode: l.key, assets: l.assets, cost: l.cost, charge2026: l.charge, fiscalBookValue: l.bookValue,
  }))
}

/** The eleven statutory intangible codes. Buildings groups do not apply. */
export const intangibleTaxonomy: string[] = [
  'Patent',
  'Copyright',
  'Brand or trademark',
  'Licence',
  'Franchise',
  'Concession or mining right',
  'Goodwill',
  'Software',
  'Formula or recipe',
  'Customer list',
  'Other intangible',
]

// ── Custody and counts ──────────────────────────────────────────────────────

/** How a counted asset compared with the register. */
export type CountTone = 'ok' | 'warn' | 'bad' | 'muted'

export interface CountRow {
  tag: string | null
  asset: string
  location: string
  result: string
  tone: CountTone
}

/** SO-2026-03 · Medan Warehouse · started 01/09/2026 · 6 assets · counter Rudi Santoso */
export const countSession = 'SO-2026-03 · Medan Warehouse · started 01/09/2026 · 6 assets · counter Rudi Santoso'

export const countRows: CountRow[] = [
  { tag: 'TAG-MDN-068', asset: 'Forklift Toyota 3T', location: 'Medan Warehouse', result: 'Here, as recorded', tone: 'ok' },
  { tag: 'TAG-MDN-023', asset: 'Warehouse Racking Medan', location: 'Medan Warehouse', result: 'Here, as recorded', tone: 'ok' },
  { tag: 'TAG-MDN-064', asset: 'Backup 100kVA Generator', location: 'Medan Warehouse', result: 'Different location', tone: 'warn' },
  { tag: 'TAG-MDN-083', asset: 'Medan Warehouse Renovation', location: 'Medan Warehouse', result: 'Not countable', tone: 'muted' },
  { tag: 'TAG-VEH-029', asset: 'Toyota Hilux B 9087 KLM', location: 'Medan pool', result: 'Not found', tone: 'bad' },
  { tag: null, asset: 'Air compressor (untagged)', location: 'Medan Warehouse', result: 'Unrecorded · found on site', tone: 'bad' },
]

/** Custody, who holds what. */
export const custodyRows = [
  { custodian: 'Fitri Handayani', department: 'General Affairs', branch: 'Central Jakarta', assets: 5, location: 'HQ floors 1–5, plant room B1' },
  { custodian: 'Agus Priyanto', department: 'Production', branch: 'Surabaya', assets: 5, location: 'Plant Rungkut bays 3 & 5, Surabaya pool' },
  { custodian: 'Rudi Santoso', department: 'Warehouse', branch: 'Medan', assets: 6, location: 'Medan Warehouse, Medan pool' },
  { custodian: 'IT Support', department: 'Technology', branch: 'Central Jakarta', assets: 3, location: 'HQ floor 3, server room B1' },
]

/**
 * Variance resolution. Each finding becomes something the ledger understands:
 * a location change, a capitalisation, a write-off or a partial disposal. A
 * count that ends in a list of discrepancies has not finished.
 */
export const varianceRows = [
  { id: 'V-01', asset: 'TAG-VEH-029 Toyota Hilux', kind: 'Not found', explanation: 'Moved to the Surabaya branch without a handover record', status: 'Open', action: 'Reclassify location' },
  { id: 'V-02', asset: 'Air compressor (untagged)', kind: 'Unrecorded', explanation: 'Bought from petty cash and expensed instead of capitalised', status: 'Open', action: 'Capitalise as new asset' },
  { id: 'V-03', asset: 'TAG-MDN-064 Genset Backup', kind: 'Wrong location', explanation: 'Recorded in Medan Warehouse, found in the Medan pool', status: 'Resolved', action: 'Location updated' },
  { id: 'V-04', asset: 'TAG-HQ-004 AC Central', kind: 'Not found', explanation: 'Removed in 2025, never written off', status: 'Open', action: 'Write off · needs approval' },
  { id: 'V-05', asset: 'TAG-SBY-051 Office Chairs ×60', kind: 'Short by 6 of 60', explanation: 'Six units damaged and discarded without a record', status: 'Open', action: 'Partial disposal' },
  { id: 'V-06', asset: 'TAG-IT-018 Server Rack', kind: 'Here, as recorded', explanation: 'Mis-scan, since confirmed', status: 'Resolved', action: 'No action' },
]

// ── Approvals ───────────────────────────────────────────────────────────────

export interface ApprovalRow {
  id: string
  what: string
  raisedBy: string
  raisedOn: string
  detail: string
  status: string
}

/**
 * Authorisation attaches to the decision, not to the asset. The figures in
 * each request are read from the engine, so they are the figures the
 * decision would post.
 */
export const approvalRows = computed<ApprovalRow[]>(() => {
  const l71 = ledgers.value['FA-0071']!
  const dA = l71.books.accounting.disposal
  const dT = l71.books.tax?.disposal
  const fa04 = fixedAssets.value.find((a) => a.id === 'FA-0004')!
  const gl = (n: number | undefined) => (n === undefined ? 'not computed' : `${n >= 0 ? 'gain' : 'loss'} ${Math.abs(n).toLocaleString('id-ID')}`)
  return [
    {
      id: 'AP-0031', what: 'Disposal · FA-0071 Cummins 250kVA Generator', raisedBy: 'Rizal Candra', raisedOn: '15/08/2026',
      detail: `Proceeds ${(dA?.proceeds ?? 0).toLocaleString('id-ID')} · accounting ${gl(dA?.gainLoss)}, tax ${gl(dT?.gainLoss)}`,
      status: 'Awaiting you',
    },
    {
      id: 'AP-0032', what: 'Write-off · FA-0004 Building Central AC', raisedBy: 'Fitri Handayani', raisedOn: '03/09/2026',
      detail: `Book value ${(fa04.bookValueCommercial ?? 0).toLocaleString('id-ID')} accounting · ${(fa04.bookValueFiscal ?? 0).toLocaleString('id-ID')} tax`,
      status: 'Awaiting you',
    },
    { id: 'AP-0033', what: 'Partial disposal · FA-0051 Office Chairs (6 of 60)', raisedBy: 'Rudi Santoso', raisedOn: '10/09/2026', detail: 'Raised from count session SO-2026-03', status: 'Awaiting you' },
  ]
})

// ── Leases ──────────────────────────────────────────────────────────────────

/**
 * A lease produces a right-of-use asset that depreciates through the same
 * engine as everything else, rather than living in a parallel register.
 */
export const leaseRows = [
  { id: 'LS-004', name: 'Cakung Leased Warehouse', term: '01/02/2025 – 31/01/2030', liability: 1850000000, rouAsset: 'ROU-0004', rouBookValue: 1418750000 },
  { id: 'LS-005', name: 'Medan Branch Office', term: '01/07/2024 – 30/06/2029', liability: 960000000, rouAsset: 'ROU-0005', rouBookValue: 624000000 },
  { id: 'LS-006', name: 'Fleet — 4 × Hino Dutro', term: '01/03/2026 – 28/02/2031', liability: 1240000000, rouAsset: 'ROU-0006', rouBookValue: 1116000000 },
]

// ── Period self-check ───────────────────────────────────────────────────────

export type { TieRow }

/**
 * The sub-ledger against the ledger, account by account, at the current
 * period end. The ledger side is built from the journals the module posted,
 * so a journal the register does not explain shows here as a difference.
 */
export const tieCheckRows = computed<TieRow[]>(() => tieRows())

// ── Asset settings ──────────────────────────────────────────────────────────

/**
 * The class master. Selecting a class sets the statutory group, both lives,
 * the method and the accounts — which is how an asset arrives classified
 * rather than needing to be fixed later.
 */
export const classMaster = [
  { class: 'Buildings', defaultTaxGroup: 'Permanent building', fiscalLife: '20 years', commercialLife: '25 years', method: 'Straight line', accounts: '1-1610 / 6-5110' },
  { class: 'Production machinery', defaultTaxGroup: 'Tax group 3', fiscalLife: '16 years', commercialLife: '16 years', method: 'Straight line', accounts: '1-1620 / 6-5120' },
  { class: 'Vehicles', defaultTaxGroup: 'Tax group 2', fiscalLife: '8 years', commercialLife: '8 years', method: 'Straight line', accounts: '1-1630 / 6-5130' },
  { class: 'Equipment', defaultTaxGroup: 'Tax group 2', fiscalLife: '8 years', commercialLife: '8 years', method: 'Straight line', accounts: '1-1640 / 6-5140' },
  { class: 'IT equipment', defaultTaxGroup: 'Tax group 1', fiscalLife: '4 years', commercialLife: '4 years', method: 'Straight line', accounts: '1-1650 / 6-5150' },
  { class: 'Furniture', defaultTaxGroup: 'Tax group 1', fiscalLife: '4 years', commercialLife: '8 years', method: 'Straight line', accounts: '1-1660 / 6-5160' },
]

/**
 * Behaviour switches, grouped as the settings screen presents them.
 *
 * `isOn` is derived here rather than in the component: the design carried
 * the state inside a CSS string, and a screen should not have to parse a
 * colour to know whether a setting is enabled.
 */
export interface SettingToggle {
  label: string
  /** What the alternative is, so the reader knows what the switch costs. */
  detail: string
  isOn: boolean
}

export const settingToggles: { head: string; items: SettingToggle[] }[] = [
  {
    head: 'Depreciation policy',
    items: [
      { label: 'Journal date is the last day of the period', detail: '', isOn: true },
      { label: 'Post automatically after review', detail: 'A draft is always created first', isOn: true },
      { label: 'Pro-rata the first period by day', detail: 'When off, the first period counts as a full month', isOn: false },
    ],
  },
  {
    head: 'Approval rules',
    items: [
      // LR-5: off by default, per event. The live switches are in assetApprovals.ts.
      { label: 'Disposal needs approval', detail: 'Off by default', isOn: false },
      { label: 'Write-off needs approval', detail: 'Off by default', isOn: false },
      { label: 'Value change needs approval', detail: 'Off by default', isOn: false },
    ],
  },
]
