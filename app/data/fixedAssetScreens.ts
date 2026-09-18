/**
 * The tables behind the fixed-asset screens other than the register.
 *
 * Same sample company and the same figures as `fixedAssets.ts`: everything
 * here ties to the headline totals in that file. Several rows exist to show a
 * divergence between the two books rather than to fill a table, so the values
 * should not be recomputed or rounded.
 *
 * Where the design renders an em dash for a field that does not apply, the
 * value is `null` here. The dash is a display decision and belongs to the
 * component, not to the data.
 */

// ── Asset profit and loss impact ────────────────────────────────────────────

/** One line of the impact statement: the same event on both bases. */
export interface ImpactRow {
  label: string
  /** `null` where that basis does not recognise the event at all. */
  commercial: number | null
  fiscal: number | null
  /** How the figure was arrived at, shown under the label. */
  basis?: string | null
  assets?: number
}

/** Depreciation grouped by asset class. */
export const impactByClass: ImpactRow[] = [
  { label: 'Buildings', commercial: 159500000, fiscal: 195500000, assets: 2 },
  { label: 'Production machinery', commercial: 120000000, fiscal: 84843750, assets: 2 },
  { label: 'Vehicles', commercial: 129187500, fiscal: 92765625, assets: 3 },
  { label: 'Equipment', commercial: 106671875, fiscal: 128187500, assets: 6 },
  { label: 'IT equipment', commercial: 36468750, fiscal: 36468750, assets: 3 },
  { label: 'Furniture', commercial: 13921875, fiscal: 17718750, assets: 3 },
]

/**
 * The same depreciation grouped by statutory group. This is the grouping the
 * tax return expects, which is why both views exist.
 */
export const impactByTaxGroup: ImpactRow[] = [
  { label: 'Permanent building · 20 yr', commercial: 144000000, fiscal: 180000000, assets: 1 },
  { label: 'Non-permanent building · 10 yr', commercial: 15500000, fiscal: 15500000, assets: 1 },
  { label: 'Tax group 1 · 4 yr', commercial: 64359375, fiscal: 68156250, assets: 7 },
  { label: 'Tax group 2 · 8 yr', commercial: 145406250, fiscal: 147375000, assets: 5 },
  { label: 'Tax group 3 · 16 yr', commercial: 196484375, fiscal: 144453125, assets: 5 },
]

/**
 * Amortisation, FY2026 to September.
 *
 * Goodwill and the registered brand carry `commercial: null` — an indefinite
 * life means no commercial schedule exists, not one that happens to charge
 * nothing. Rendering 0 would claim the opposite.
 */
export const amortisationYtd: ImpactRow[] = [
  { label: 'FA-0091 Goodwill — PT Mitra Logistik', basis: 'Indefinite life accountingly · Tax group 4, 20 years taxly', commercial: null, fiscal: 90000000 },
  { label: 'FA-0093 Registered brand — Sinar Kencana', basis: 'Indefinite life accountingly · Tax group 4, 20 years taxly', commercial: null, fiscal: 33750000 },
  { label: 'FA-0092 Software licence — WMS', basis: '5 years accountingly · Tax group 1, 4 years taxly', commercial: 72000000, fiscal: 90000000 },
  { label: 'FA-0094 Patent — conveyor mechanism', basis: '10 years accountingly · Tax group 2, 8 years taxly', commercial: 24000000, fiscal: 30000000 },
]

/** The same four intangibles, September only. */
export const amortisationSeptember: ImpactRow[] = [
  { label: 'FA-0091 Goodwill — PT Mitra Logistik', basis: 'Indefinite life accountingly · Tax group 4, 20 years taxly', commercial: null, fiscal: 10000000 },
  { label: 'FA-0093 Registered brand — Sinar Kencana', basis: 'Indefinite life accountingly · Tax group 4, 20 years taxly', commercial: null, fiscal: 3750000 },
  { label: 'FA-0092 Software licence — WMS', basis: '5 years accountingly · Tax group 1, 4 years taxly', commercial: 8000000, fiscal: 10000000 },
  { label: 'FA-0094 Patent — conveyor mechanism', basis: '10 years accountingly · Tax group 2, 8 years taxly', commercial: 2666667, fiscal: 3333333 },
]

// ── Commercial to fiscal difference ─────────────────────────────────────────

export interface DifferenceRow {
  id: string | null
  name: string
  /** The gap between the two books, in rupiah. */
  difference: number | null
  /** Why they disagree. The report exists to answer this, not to state the gap. */
  reason: string
  /** Set where the difference arises from an event rather than from the lives. */
  tag: string | null
}

/** Per asset, largest divergence first. */
export const differenceByAsset: DifferenceRow[] = [
  {
    id: 'FA-0071',
    name: 'Cummins 250kVA Generator',
    difference: 122343750,
    reason: 'Accounting gain of 51.250.000 against a tax loss of 71.093.750 — the tax basis was far higher at disposal',
    tag: 'Disposal',
  },
  {
    id: 'FA-0012',
    name: 'Head Office Building',
    difference: 36000000,
    reason: 'Tax life shorter than accounting — 20 years against 25',
    tag: null,
  },
  {
    id: 'FA-0004',
    name: 'Building Central AC',
    difference: 22500000,
    reason: 'Accounting life exhausted in 2024, tax still depreciating until 2027',
    tag: null,
  },
  {
    id: 'FA-0021',
    name: 'Medan Partitions & Desks',
    difference: 3796875,
    reason: 'Tax group 1 gives 4 tax years against 8 accounting',
    tag: null,
  },
  {
    id: 'FA-0068',
    name: 'Forklift Toyota 3T',
    difference: 1125000,
    reason: 'Post-impairment accounting charge of 4.000.000 runs below the tax 4.375.000',
    tag: null,
  },
  {
    id: 'FA-0068',
    name: 'Forklift Toyota 3T',
    difference: -17250000,
    reason: 'Impairment to 184.000.000 recognised accountingly only — not deductible',
    tag: 'Impairment',
  },
  {
    id: 'FA-0071',
    name: 'Cummins 250kVA Generator',
    difference: -16875000,
    reason: 'Depreciation to disposal — tax life 16 years against 10 accounting',
    tag: null,
  },
  {
    id: 'FA-0031',
    name: 'Production Machine Line A',
    difference: -35156250,
    reason: 'Tax life longer than accounting — 16 years against 10',
    tag: null,
  },
  {
    id: 'FA-0047',
    name: 'Toyota Innova B 1234 XYZ',
    difference: -21656250,
    reason: 'Tax life longer than accounting — 8 years against 5',
    tag: null,
  },
]

// ── Statutory export (Lampiran 9) ───────────────────────────────────────────

export interface StatutoryRow {
  [k: string]: string | number | null
}

/** Half 1: tangible assets. */
export const statutoryHalf1: StatutoryRow[] = [
  { taxGroup: 'Tax group 1 · 4 yr', assets: 7, cost: 727500000, charge2026: 68156250, fiscalBookValue: 189708333 },
  { taxGroup: 'Tax group 2 · 8 yr', assets: 5, cost: 1572000000, charge2026: 147375000, fiscalBookValue: 716677083 },
  { taxGroup: 'Tax group 3 · 16 yr', assets: 5, cost: 3210000000, charge2026: 144453125, fiscalBookValue: 2149661458 },
  { taxGroup: 'Permanent building · 20 yr', assets: 1, cost: 4800000000, charge2026: 180000000, fiscalBookValue: 3220000000 },
  { taxGroup: 'Non-permanent building · 10 yr', assets: 1, cost: 310000000, charge2026: 15500000, fiscalBookValue: 294500000 },
]

/**
 * Half 2: intangible assets (Daftar Amortisasi).
 *
 * The filing has two halves. An export covering only the first completes half
 * a return, which is a different promise from completing one.
 */
export const statutoryHalf2: StatutoryRow[] = [
  { statutoryCode: '0607 Goodwill', assets: 1, cost: 2400000000, charge2026: 90000000, fiscalBookValue: 2090000000 },
  { statutoryCode: '0603 Brand', assets: 1, cost: 900000000, charge2026: 33750000, fiscalBookValue: 750000000 },
  { statutoryCode: '0699 Other intangible', assets: 1, cost: 480000000, charge2026: 90000000, fiscalBookValue: 270000000 },
  { statutoryCode: '0601 Patent', assets: 1, cost: 320000000, charge2026: 30000000, fiscalBookValue: 236666667 },
]

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

/** SO-2026-03 · Medan Warehouse · population frozen 01/09/2026 · 6 assets · counter Rudi Santoso */
export const countSession = 'SO-2026-03 · Medan Warehouse · population frozen 01/09/2026 · 6 assets · counter Rudi Santoso'

export const countRows: CountRow[] = [
  { tag: 'TAG-MDN-068', asset: 'Forklift Toyota 3T', location: 'Medan Warehouse', result: 'Here, as recorded', tone: 'ok' },
  { tag: 'TAG-MDN-023', asset: 'Warehouse Racking Medan', location: 'Medan Warehouse', result: 'Here, as recorded', tone: 'ok' },
  { tag: 'TAG-MDN-064', asset: 'Backup 100kVA Generator', location: 'Medan Warehouse', result: 'Different location', tone: 'warn' },
  { tag: 'TAG-MDN-083', asset: 'Medan Warehouse Renovation', location: 'Medan Warehouse', result: 'Not countable', tone: 'muted' },
  { tag: 'TAG-VEH-029', asset: 'Toyota Hilux B 9087 KLM', location: 'Medan pool', result: 'Not found', tone: 'bad' },
  { tag: null, asset: 'Air compressor (untagged)', location: 'Medan Warehouse', result: 'Unrecorded — found on the floor', tone: 'bad' },
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
  { id: 'V-04', asset: 'TAG-HQ-004 AC Central', kind: 'Not found', explanation: 'Removed in 2025, never written off', status: 'Open', action: 'Write off — needs approval' },
  { id: 'V-05', asset: 'TAG-SBY-051 Office Chairs ×60', kind: 'Short by 6 of 60', explanation: 'Six units damaged and discarded without a record', status: 'Open', action: 'Partial disposal' },
  { id: 'V-06', asset: 'TAG-IT-018 Server Rack', kind: 'Here, as recorded', explanation: 'Mis-scan, since confirmed', status: 'Resolved', action: 'No action' },
]

// ── Approvals ───────────────────────────────────────────────────────────────

/** Authorisation attaches to the decision, not to the asset. */
export const approvalRows = [
  { id: 'AP-0031', what: 'Disposal · FA-0071 Cummins 250kVA Generator', raisedBy: 'Rizal Candra', raisedOn: '15/08/2026', detail: 'Proceeds 400.000.000 · accounting gain 51.250.000, tax loss 71.093.750', status: 'Awaiting you' },
  { id: 'AP-0032', what: 'Write-off · FA-0004 Building Central AC', raisedBy: 'Fitri Handayani', raisedOn: '03/09/2026', detail: 'Book value 0 · 10.000.000 still on the tax basis', status: 'Awaiting you' },
  { id: 'AP-0033', what: 'Partial disposal · FA-0051 Office Chairs (6 of 60)', raisedBy: 'Rudi Santoso', raisedOn: '10/09/2026', detail: 'Raised from count session SO-2026-03', status: 'Awaiting you' },
]

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

export interface TieRow {
  account: string
  name: string
  subLedger: number
  generalLedger: number
  /** Non-zero means the two disagree and the check has found something. */
  difference: number
}

/**
 * The sub-ledger against the ledger, account by account.
 *
 * One row deliberately does not tie: depreciation expense is out by 4.000.000,
 * which is the impairment-adjusted charge on FA-0068. A self-check that always
 * passes proves nothing, so the sample data contains something to find.
 */
export const tieCheckRows: TieRow[] = [
  { account: '1-1600', name: 'Fixed assets — at cost', subLedger: 14309500000, generalLedger: 14309500000, difference: 0 },
  { account: '1-1700', name: 'Accumulated depreciation', subLedger: -3569854168, generalLedger: -3569854168, difference: 0 },
  { account: '6-5100', name: 'Depreciation expense — YTD', subLedger: 605500000, generalLedger: 609500000, difference: -4000000 },
  { account: '6-5200', name: 'Impairment loss', subLedger: 17250000, generalLedger: 17250000, difference: 0 },
  { account: '6-5300', name: 'Gain on disposal of assets', subLedger: -51250000, generalLedger: -51250000, difference: 0 },
]

// ── Asset settings ──────────────────────────────────────────────────────────

/**
 * The class master. Selecting a class sets the statutory group, both lives,
 * the method and the accounts — which is how an asset arrives classified
 * rather than needing to be fixed later.
 */
export const classMaster = [
  { class: 'Buildings', defaultTaxGroup: 'Permanent building', fiscalLife: '20 yr', commercialLife: '25 yr', method: 'Straight line', accounts: '1-1610 / 6-5110' },
  { class: 'Production machinery', defaultTaxGroup: 'Tax group 3', fiscalLife: '16 yr', commercialLife: '16 yr', method: 'Straight line', accounts: '1-1620 / 6-5120' },
  { class: 'Vehicles', defaultTaxGroup: 'Tax group 2', fiscalLife: '8 yr', commercialLife: '8 yr', method: 'Straight line', accounts: '1-1630 / 6-5130' },
  { class: 'Equipment', defaultTaxGroup: 'Tax group 2', fiscalLife: '8 yr', commercialLife: '8 yr', method: 'Straight line', accounts: '1-1640 / 6-5140' },
  { class: 'IT equipment', defaultTaxGroup: 'Tax group 1', fiscalLife: '4 yr', commercialLife: '4 yr', method: 'Straight line', accounts: '1-1650 / 6-5150' },
  { class: 'Furniture', defaultTaxGroup: 'Tax group 1', fiscalLife: '4 yr', commercialLife: '8 yr', method: 'Straight line', accounts: '1-1660 / 6-5160' },
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
      { label: 'Journal date is the last day of the period', detail: 'Alternative: the date the run is posted', isOn: true },
      { label: 'Post automatically after review', detail: 'A draft is always created first', isOn: true },
      { label: 'Pro-rata the first period by day', detail: 'Off: a full month from the in-service date', isOn: false },
    ],
  },
  {
    head: 'Approval rules',
    items: [
      { label: 'Disposal needs approval', detail: 'Approver: Finance Controller', isOn: true },
      { label: 'Write-off needs approval', detail: 'Approver: Finance Controller', isOn: true },
      { label: 'Impairment needs approval', detail: 'Off by default', isOn: false },
    ],
  },
]

// ── Derivation ──────────────────────────────────────────────────────────────

/**
 * The periods the derivation panel can be opened for, and the inputs each one
 * used. `m31` and `m68` are months in service for FA-0031 and FA-0068;
 * `open68` is FA-0068's opening basis, which changes in July because the
 * June impairment reset it.
 */
export const derivationPeriods = {
  jul: { label: 'July 2026', start: '01/07/2026', end: '31/07/2026', m31: 37, m68: 51, open68: 184000000, jv: 'JV-2026-07-012', posted: '31/07/2026' },
  aug: { label: 'August 2026', start: '01/08/2026', end: '31/08/2026', m31: 38, m68: 52, open68: 180000000, jv: 'JV-2026-08-013', posted: '31/08/2026' },
  sep: { label: 'September 2026', start: '01/09/2026', end: '30/09/2026', m31: 39, m68: 53, open68: 176000000, jv: 'JV-2026-09-014', posted: '30/09/2026' },
  ytd: { label: 'FY2026 to 30/09/2026', start: '01/01/2026', end: '30/09/2026', m31: 39, m68: 53, open68: 184000000, jv: '9 journals · JV-2026-01-006 to JV-2026-09-014', posted: 'Jan–Sep 2026' },
} as const

// ── Asset record ────────────────────────────────────────────────────────────

/** The headline figures on FA-0031, with how each was derived. */
export const assetDetailFigures = [
  { label: 'Acquisition cost', value: '1.250.000.000', note: 'Both books' },
  { label: 'Accumulated · accounting', value: '406.250.000', note: '39 months × 10.416.667' },
  { label: 'Book value · accounting', value: '843.750.000', note: 'Straight line, 10 years' },
  { label: 'Accumulated · tax', value: '253.906.250', note: '39 months × 6.510.417' },
  { label: 'Tax book value', value: '996.093.750', note: 'Tax group 3, Straight line, 16 years' },
  { label: 'Cumulative difference', value: '152.343.750', note: 'Deferred tax liability 33.515.625' },
]

/**
 * The record splits into panes by audience. General Affairs maintains the
 * physical pane without acquisition cost or book value being visible, which
 * is what keeps custody on one record instead of a second register.
 */
export const assetDetailPanes = [
  {
    head: 'Physical identity · General Affairs',
    fields: [
      { k: 'Physical tag', v: 'TAG-SBY-114' },
      { k: 'Serial number', v: '4F7-220931-A' },
      { k: 'Location', v: 'Plant Rungkut, Bay 3 · Surabaya' },
      { k: 'Custodian', v: 'Agus Priyanto — Production' },
      { k: 'Last handover record', v: 'HANDOVER-2026-0188 · 12/08/2026' },
    ],
  },
  {
    head: 'Tax parameters · Tax Manager',
    fields: [
      { k: 'Tax group', v: 'Tax group 3 — 16 years' },
      { k: 'Tax method', v: 'Straight line (6,25%)' },
      { k: 'Tax depreciation starts', v: '01/08/2023' },
      { k: 'Migration position', v: 'Computed in full from acquisition' },
      { k: 'In Lampiran 9', v: 'Yes — Tax group 3 line' },
    ],
  },
  {
    head: 'Accounting · Accounting Manager',
    fields: [
      { k: 'Acquisition cost', v: '1.250.000.000' },
      { k: 'Residual value', v: '0' },
      { k: 'Useful life', v: '10 years · straight line' },
      { k: 'Accounts', v: '1-1620 / 6-5120' },
      { k: 'Branch', v: 'Surabaya' },
    ],
  },
]

/** What has happened to this asset, newest first. */
export const assetDetailHistory = [
  { when: '30/09/2026', who: 'System', what: 'Depreciation posted for September 2026 — JV-2026-09-014', note: null },
  { when: '12/08/2026', who: 'Rizal Candra', what: 'Custodian changed to Agus Priyanto (Production)', note: 'Reason: production shift rotation' },
  { when: '01/04/2026', who: 'Rizal Candra', what: 'Useful life reviewed — kept at 10 years', note: 'Prospective, no restatement' },
  { when: '15/01/2024', who: 'Sari Wulandari', what: 'Tax group set to tax group 3 (16 years)', note: 'Completed during data migration' },
  { when: '01/08/2023', who: 'Sari Wulandari', what: 'Capitalised and placed in service', note: 'HANDOVER-2023-0412' },
]

