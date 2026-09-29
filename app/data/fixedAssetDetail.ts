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
  /** What this figure is and as of when. Read ABOVE the value. */
  caption: string
  /** Supporting detail read under the value — the accumulated behind a book
   *  value, the deferred tax behind a difference. */
  sub?: string
  /** Why it is absent, when it is. Never rendered as a zero. */
  absent?: string
}

/**
 * The headline figures on an asset record.
 *
 * Four columns, not six: cost, then each book as its own column carrying the
 * book value as the headline and the accumulated behind it, then the number
 * the module exists to produce. Six equal money figures do not fit the stage
 * and wrap into a second row that reads as a separate band.
 *
 * Accumulated depreciation is derived from the book value rather than stored,
 * so it always agrees with the figure above it.
 */
export function detailFigures(a: FixedAsset): DetailFigure[] {
  const asOf = 'at 30/09/2026'
  const accAccum = a.bookValueCommercial === null ? null : a.cost - a.bookValueCommercial
  const taxAccum = a.bookValueFiscal === null ? null : a.cost - a.bookValueFiscal

  const figures: DetailFigure[] = [
    {
      label: 'Acquisition cost',
      value: a.cost,
      caption: `Both books · acquired ${a.acquired}`,
    },
  ]

  figures.push({
    label: 'Book value · accounting',
    value: a.bookValueCommercial,
    caption: a.indefiniteLife
      ? `Carried at cost ${asOf}`
      : `${lifeYears(a.commercialLifeMonths)} straight line · ${asOf}`,
    sub: a.indefiniteLife
      ? 'Indefinite life — not amortised, tested for impairment'
      : accAccum === null
        ? undefined
        : `Accumulated ${fmt(accAccum)}`,
    absent: a.status === 'Disposed' ? 'Disposed' : undefined,
  })

  figures.push({
    label: 'Book value · tax',
    value: a.bookValueFiscal,
    caption: a.taxGroup
      ? `${a.taxGroup}, ${lifeYears(a.fiscalLifeMonths)} · ${asOf}`
      : 'No statutory group set',
    sub: taxAccum === null ? undefined : `Accumulated ${fmt(taxAccum)}`,
    // Disposed and unclassified are different absences and must not share a
    // label: one means no longer held, the other means nothing to compute from.
    absent: a.status === 'Disposed' ? 'Disposed' : a.taxGroup ? undefined : 'Not computed',
  })

  // The number the whole module exists to produce.
  const diff = a.bookValueFiscal !== null && a.bookValueCommercial !== null
    ? a.bookValueCommercial - a.bookValueFiscal
    : null
  figures.push({
    label: 'Cumulative difference',
    value: diff === null ? null : Math.abs(diff),
    caption: `Accounting less tax · ${asOf}`,
    sub: diff === null
      ? undefined
      : `Deferred tax ${fmt(Math.round(Math.abs(diff) * 0.22))} at 22%`,
    absent: diff === null ? 'Needs both books' : undefined,
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
  // Read the charge from the same schedule the table rendered, so the panel
  // always explains the exact number that was clicked.
  const row = monthlySchedule(a).find((r) => r.period === period)
  const charge = basis === 'accounting' ? row?.accounting ?? null : row?.tax ?? null
  const absent = basis === 'accounting' ? row?.accountingAbsent : row?.taxAbsent

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
    value: charge === null ? (absent ?? 'Not computed') : fmt(charge),
    isResult: true,
  })
  return steps
}

/**
 * The asset's own FY2026 schedule, month by month.
 *
 * Two rows — a year-to-date figure and one month — told the reader nothing
 * about shape: whether the charge is level, when it started, when it stopped.
 * Nine rows plus a total do, and they make the events legible where they
 * happen: the month an asset entered service, the month an impairment reset
 * the accounting basis, the month a disposal ended both schedules.
 *
 * Charges are derived from cost ÷ life and the months actually in service, so
 * the total ties to `assetChargeYtd` by construction rather than by
 * transcription.
 */
export interface ScheduleMonth {
  /** 'January 2026' … 'September 2026'. */
  period: string
  /** Short form for a narrow column: 'Jan 2026'. */
  short: string
  accounting: number | null
  tax: number | null
  /** Why a side is absent this month, when it is. Never shown as a zero. */
  accountingAbsent?: string
  taxAbsent?: string
  /** What happened in this month, when something did. */
  event?: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Month index (0-based) an asset's life ends on a given basis, or null. */
function lifeEndMonthIndex(acquired: string, lifeMonths: number | null): number | null {
  if (!lifeMonths) return null
  const d = parseDate(acquired)
  return d.getFullYear() * 12 + d.getMonth() + lifeMonths
}

/** FY2026 January through September, the periods closed so far. */
export function monthlySchedule(a: FixedAsset, months = 9): ScheduleMonth[] {
  const acq = parseDate(a.acquired)
  const acqIdx = acq.getFullYear() * 12 + acq.getMonth()
  const endAcc = lifeEndMonthIndex(a.acquired, a.commercialLifeMonths)
  const endTax = lifeEndMonthIndex(a.acquired, a.fiscalLifeMonths)

  // Rates from cost ÷ life, kept exact here and rounded cumulatively below.
  const rateAcc = a.commercialLifeMonths ? a.cost / a.commercialLifeMonths : null
  const rateTax = a.fiscalLifeMonths ? a.cost / a.fiscalLifeMonths : null

  /**
   * The charge for the n-th month of an asset's life, in whole rupiah.
   *
   * Rounding each month independently leaves a residual the column does not
   * absorb, and dumping that residual into one month makes that month look
   * wrong. Rounding the *cumulative* figure and taking the difference is what
   * a fixed-asset ledger actually does: months differ by at most one rupiah,
   * no month is an outlier, and the run always ties to the accumulated total.
   */
  const monthly = (rate: number, n: number) =>
    Math.round(rate * n) - Math.round(rate * (n - 1))

  // The one asset whose accounting basis was reset mid-year. From July the
  // charge is the recomputed one, which is why the column is not level.
  const impairedFrom = a.status === 'Impaired' ? 2026 * 12 + 6 : null
  const rateAccAfterImpairment = assetChargeSeptember[a.id]?.commercial ?? null

  // Disposal ends both schedules after the month it happened in.
  const disposedAfter = a.status === 'Disposed' ? 2026 * 12 + 7 : null

  const rows = MONTH_NAMES.slice(0, months).map((name, m) => {
    const idx = 2026 * 12 + m
    const row: ScheduleMonth = {
      period: `${name} 2026`,
      short: `${name.slice(0, 3)} 2026`,
      accounting: null,
      tax: null,
    }

    if (idx < acqIdx) {
      row.accountingAbsent = 'Not in service'
      row.taxAbsent = 'Not in service'
      return row
    }
    if (idx === acqIdx) row.event = 'Entered service'
    if (impairedFrom !== null && idx === impairedFrom) {
      row.event = 'Impaired 30/06/2026 — accounting basis reset'
    }
    if (disposedAfter !== null && idx === disposedAfter) {
      row.event = 'Disposed 15/08/2026'
    }

    // ── Accounting ──
    const n = idx - acqIdx + 1 // which month of this asset's life
    if (a.indefiniteLife) {
      row.accountingAbsent = 'Not amortised'
    } else if (disposedAfter !== null && idx > disposedAfter) {
      row.accountingAbsent = 'Disposed'
    } else if (endAcc !== null && idx >= endAcc) {
      row.accountingAbsent = 'Life ended'
    } else if (rateAcc !== null) {
      row.accounting = impairedFrom !== null && idx >= impairedFrom && rateAccAfterImpairment !== null
        ? rateAccAfterImpairment
        : monthly(rateAcc, n)
    }

    // ── Tax ──
    if (!a.taxGroup) {
      row.taxAbsent = 'No statutory group'
    } else if (disposedAfter !== null && idx > disposedAfter) {
      row.taxAbsent = 'Disposed'
    } else if (endTax !== null && idx >= endTax) {
      row.taxAbsent = 'Life ended'
    } else if (rateTax !== null) {
      row.tax = monthly(rateTax, n)
    }

    return row
  })

  return rows
}

/** The FY2026-to-30/09 total under the monthly rows. */
export function scheduleTotal(rows: ScheduleMonth[]) {
  const sum = (pick: (r: ScheduleMonth) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null
  }
  return { accounting: sum((r) => r.accounting), tax: sum((r) => r.tax) }
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
