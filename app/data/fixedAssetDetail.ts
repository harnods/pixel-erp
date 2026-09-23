/**
 * Per-asset detail, derived rather than stored.
 *
 * The approved design specifies the detail screen against one asset (FA-0031).
 * Every asset in the register has to open, so the figures here are computed
 * from what `fixedAssets.ts` already holds — cost, in-service date, both lives
 * — which also means they stay correct if the register changes.
 *
 * The derivation is the point of the screen. A preparer asking "why is this
 * figure what it is" gets the arithmetic chain, not a number: opening basis,
 * method, rate, months in service, adjustments in the period, resulting
 * charge. That is what lets them stop keeping a parallel spreadsheet.
 */
import {
  fixedAssets, assetChargeYtd, assetChargeSeptember,
  type FixedAsset,
} from './fixedAssets'

export function findAsset(id: string): FixedAsset | undefined {
  return fixedAssets.find((a) => a.id === id)
}

/** dd/mm/yyyy → Date. The register displays Indonesian date order. */
function parseDate(d: string): Date {
  const [dd = '1', mm = '1', yyyy = '1970'] = d.split('/')
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
}

/** Whole months in service, acquisition through the period end. */
export function monthsInService(acquired: string, to = new Date(2026, 8, 30)): number {
  const a = parseDate(acquired)
  return (to.getFullYear() - a.getFullYear()) * 12 + (to.getMonth() - a.getMonth()) + (to.getDate() >= a.getDate() ? 1 : 0)
}

/** The monthly charge on one basis. Null where no schedule exists. */
export function monthlyCharge(cost: number, lifeMonths: number | null): number | null {
  if (!lifeMonths) return null
  return Math.round(cost / lifeMonths)
}

export interface DetailFigure {
  label: string
  value: number | null
  /** How the figure was arrived at. Shown under it, always. */
  note: string
  /** Why it is absent, when it is. Never rendered as a zero. */
  absent?: string
}

/**
 * The headline figures on an asset record.
 *
 * Accumulated depreciation is derived from months in service rather than
 * stored, so it always agrees with the book value beside it.
 */
export function detailFigures(a: FixedAsset): DetailFigure[] {
  const months = monthsInService(a.acquired)
  const accMonthly = monthlyCharge(a.cost, a.commercialLifeMonths)
  const taxMonthly = monthlyCharge(a.cost, a.fiscalLifeMonths)
  const accAccum = a.bookValueCommercial === null ? null : a.cost - a.bookValueCommercial
  const taxAccum = a.bookValueFiscal === null ? null : a.cost - a.bookValueFiscal

  const figures: DetailFigure[] = [
    { label: 'Acquisition cost', value: a.cost, note: 'Both books' },
  ]

  if (a.indefiniteLife) {
    figures.push({
      label: 'Accumulated · accounting', value: null,
      note: 'Indefinite life — no accounting schedule exists',
      absent: 'Not amortised',
    })
  } else {
    figures.push({
      label: 'Accumulated · accounting', value: accAccum,
      note: accMonthly ? `${months} months × ${fmt(accMonthly)}` : 'No schedule',
    })
  }

  figures.push({
    label: 'Book value · accounting',
    value: a.bookValueCommercial,
    note: a.indefiniteLife
      ? 'Carried at cost until impaired'
      : `${lifeYears(a.commercialLifeMonths)} · straight line`,
    absent: a.status === 'Disposed' ? 'Disposed' : undefined,
  })

  figures.push({
    label: 'Accumulated · tax',
    value: taxAccum,
    note: taxMonthly ? `${months} months × ${fmt(taxMonthly)}` : 'No statutory group',
    absent: a.taxGroup ? undefined : 'Not computed',
  })

  figures.push({
    label: 'Tax book value',
    value: a.bookValueFiscal,
    note: a.taxGroup ? `${a.taxGroup} · ${lifeYears(a.fiscalLifeMonths)}` : 'No statutory group',
    absent: a.taxGroup ? undefined : 'Not computed',
  })

  // The number the whole module exists to produce.
  const diff = a.bookValueFiscal !== null && a.bookValueCommercial !== null
    ? a.bookValueCommercial - a.bookValueFiscal
    : null
  figures.push({
    label: 'Cumulative difference',
    value: diff === null ? null : Math.abs(diff),
    note: diff === null
      ? 'Needs both books'
      : `Deferred tax ${fmt(Math.round(Math.abs(diff) * 0.22))} at 22%`,
    absent: diff === null ? 'Not computed' : undefined,
  })

  return figures
}

function lifeYears(months: number | null): string {
  if (!months) return 'No life set'
  return `${Math.round(months / 12)} years`
}
function fmt(n: number): string {
  return 'Rp' + n.toLocaleString('id-ID')
}

// ── The three panes ─────────────────────────────────────────────────────────

export interface DetailPane {
  head: string
  /** Who maintains this pane. Access follows the pane, not the record. */
  owner: string
  fields: { k: string; v: string }[]
}

/**
 * The record splits by audience. General Affairs maintains the physical pane
 * without acquisition cost or book value being visible, which is what keeps
 * custody on one record instead of in a second register.
 */
export function detailPanes(a: FixedAsset): DetailPane[] {
  const panes: DetailPane[] = []

  // Intangibles have no physical presence, so the pane would be empty fields.
  if (a.type === 'Tangible') {
    panes.push({
      head: 'Physical identity',
      owner: 'General Affairs',
      fields: [
        { k: 'Physical tag', v: a.tag ?? 'Not tagged' },
        { k: 'Location', v: a.location ?? 'Not recorded' },
        { k: 'Custodian', v: a.custodian ?? 'Unassigned' },
        { k: 'Branch', v: a.branch },
      ],
    })
  } else {
    panes.push({
      head: 'Identity',
      owner: 'Accounting Manager',
      fields: [
        { k: 'Statutory code', v: a.statutoryCode ?? 'Not set' },
        { k: 'Nature', v: a.location ?? 'Not recorded' },
        { k: 'Branch', v: a.branch },
      ],
    })
  }

  panes.push({
    head: 'Tax parameters',
    owner: 'Tax Manager',
    fields: [
      { k: 'Statutory group', v: a.taxGroup ?? 'Not set' },
      { k: 'Tax life', v: lifeYears(a.fiscalLifeMonths) },
      { k: 'Statutory code', v: a.statutoryCode ?? 'Not set' },
      {
        k: 'In the statutory filing',
        v: a.taxGroup ? `Yes — ${a.taxGroup} line` : 'No — excluded until classified',
      },
    ],
  })

  panes.push({
    head: 'Accounting',
    owner: 'Accounting Manager',
    fields: [
      { k: 'Acquisition cost', v: fmt(a.cost) },
      { k: 'Acquired', v: a.acquired },
      {
        k: 'Useful life',
        v: a.indefiniteLife ? 'Indefinite — not amortised' : `${lifeYears(a.commercialLifeMonths)} · straight line`,
      },
      { k: 'Asset class', v: a.class },
    ],
  })

  return panes
}

// ── Derivation ──────────────────────────────────────────────────────────────

export interface DerivationStep {
  label: string
  value: string
  /** True for the line that is the answer rather than an input to it. */
  isResult?: boolean
}

/**
 * How one period's charge was arrived at, on one basis.
 *
 * Read off the stored parameters rather than recomputed from current ones: a
 * figure produced before a correction must still explain itself afterwards,
 * which is the whole reason schedules are versioned.
 */
export function derivation(a: FixedAsset, basis: 'accounting' | 'tax', period = 'September 2026'): DerivationStep[] {
  const life = basis === 'accounting' ? a.commercialLifeMonths : a.fiscalLifeMonths
  const charge = basis === 'accounting'
    ? assetChargeSeptember[a.id]?.commercial ?? null
    : assetChargeSeptember[a.id]?.fiscal ?? null

  if (basis === 'accounting' && a.indefiniteLife) {
    return [
      { label: 'Useful life', value: 'Indefinite' },
      { label: 'Why there is no charge', value: 'An indefinite-life asset is not amortised. It is tested for impairment annually instead.' },
      { label: `Charge for ${period}`, value: 'Not amortised', isResult: true },
    ]
  }
  if (basis === 'tax' && !a.taxGroup) {
    return [
      { label: 'Statutory group', value: 'Not set' },
      { label: 'Why there is no charge', value: 'Without a statutory group there is no life and no rate, so nothing can be computed.' },
      { label: `Charge for ${period}`, value: 'Not computed', isResult: true },
    ]
  }

  const steps: DerivationStep[] = [
    { label: 'Opening basis', value: fmt(a.cost) },
    { label: 'Method', value: 'Straight line' },
    { label: 'Life', value: lifeYears(life) },
    { label: 'Rate', value: life ? `${(100 / (life / 12)).toFixed(2)}% per year` : '—' },
    { label: 'Period fraction', value: '1 month' },
  ]

  // The one asset whose basis was reset mid-year. Without this line the figure
  // looks wrong against cost ÷ life, which is exactly the question the panel
  // exists to answer.
  if (a.status === 'Impaired' && basis === 'accounting') {
    steps.push({
      label: 'Adjustment in this period',
      value: 'Impaired 30/06/2026 — basis reset, charge recomputed over the remaining life',
    })
  }

  steps.push({
    label: `Charge for ${period}`,
    value: charge === null ? 'Not computed' : fmt(charge),
    isResult: true,
  })
  return steps
}

/** The asset's own schedule rows, for the Depreciation tab. */
export function schedulePreview(a: FixedAsset) {
  const sep = assetChargeSeptember[a.id]
  const ytd = assetChargeYtd[a.id]
  return [
    { period: 'FY2026 to 30/09', accounting: ytd?.commercial ?? null, tax: ytd?.fiscal ?? null },
    { period: 'September 2026', accounting: sep?.commercial ?? null, tax: sep?.fiscal ?? null },
  ]
}

/** What has happened to this asset. Newest first. */
export function assetHistory(a: FixedAsset) {
  const rows: { when: string; who: string; what: string; note: string | null }[] = [
    { when: '30/09/2026', who: 'System', what: `Depreciation posted for September 2026`, note: null },
  ]
  if (a.status === 'Impaired') {
    rows.push({
      when: '30/06/2026', who: 'Rizal Candra',
      what: 'Impairment recognised after a test',
      note: 'Accounting only — tax does not recognise it until realised',
    })
  }
  if (a.status === 'Disposed') {
    rows.push({
      when: '15/08/2026', who: 'Rizal Candra',
      what: 'Disposed',
      note: 'Gain on the accounting basis, loss on the tax basis',
    })
  }
  if (a.taxGroup) {
    rows.push({
      when: a.acquired, who: 'Sari Wulandari',
      what: `Statutory group set to ${a.taxGroup}`,
      note: 'Applied from the asset class default',
    })
  } else {
    rows.push({
      when: a.acquired, who: 'Sari Wulandari',
      what: 'Created without a statutory group',
      note: 'Blocks every tax output until set',
    })
  }
  rows.push({ when: a.acquired, who: 'Sari Wulandari', what: 'Asset created', note: null })
  return rows
}
