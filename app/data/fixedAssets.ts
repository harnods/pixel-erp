/**
 * Fixed assets: the inputs behind Accounting > Fixed assets.
 *
 * Sample company: PT Central Perk Indonesia, FY2026 (January to December),
 * IDR, three branches (Central Jakarta, Surabaya, Medan). "Today" is
 * September 2026, closing 30/09/2026.
 *
 * This file holds INPUTS only: what an accountant keys in (cost, dates, lives,
 * statutory group, custody) and the two events of the sample year (the June
 * impairment on FA-0068 and the August disposal of FA-0071). No book value,
 * charge or total is stored here. Every figure a screen shows is computed by
 * `assetEngine.ts` from these inputs and held for the session in
 * `assetStore.ts`.
 *
 * Three rules the design is explicit about, and that the UI must preserve:
 *
 *  1. A fiscal figure that is legitimately absent is NEVER 0. It reads
 *     'Not computed' (no tax group), 'Not recognised' (fiscal does not
 *     recognise the event) or 'Not amortised' (indefinite life). A zero
 *     reads as an unfinished calculation.
 *  2. FA-0077 arrives with no tax group. That is a designed hole, not missing
 *     data: it is excluded from the fiscal book, the difference total and
 *     Lampiran 9 until a group is set.
 *  3. Goodwill (FA-0091) never amortises commercially and does amortise
 *     fiscally. That 100% divergence is the sharpest demonstration of why one
 *     schedule per asset cannot serve an Indonesian filer.
 */

/** Where an asset sits in its life. Derived by the store, never keyed. */
export type AssetStatus =
  | 'Active'
  | 'Impaired'
  | 'Disposed'
  | 'Fully depreciated'
  | 'Incomplete'
  /** Replaced by its children in a split (OD-32). No longer held. */
  | 'Split'

/** Tangible assets depreciate; intangible assets amortise. Same engine. */
export type AssetType = 'Tangible' | 'Intangible'

/** What is keyed in for an asset. */
export interface AssetSeed {
  id: string
  name: string
  /** Asset class: drives the default tax group and life. */
  class: string
  /** Acquisition date, dd/mm/yyyy as the register displays it. */
  acquired: string
  /** TS-02. When depreciation starts. Defaults to the acquisition date. */
  inServiceDate?: string
  cost: number
  /** TS-03. Accounting residual value. Defaults to 0. */
  residual?: number
  /** Accounting useful life in months. `null` for an indefinite-life
   *  intangible: no commercial schedule exists at all, which is different
   *  from a very long one. */
  commercialLifeMonths: number | null
  /** Statutory group (Pasal 11). `null` means unclassified, see FA-0077. */
  taxGroup: string | null
  /** Fiscal life in months, fixed by the tax group. `null` when unclassified. */
  fiscalLifeMonths: number | null
  branch: string
  /** Physical tag. Intangible assets have none. */
  tag: string | null
  location: string | null
  custodian: string | null
  type: AssetType
  /** Statutory asset code: 4 digits for tangible, the 11-code intangible
   *  taxonomy for intangible. */
  statutoryCode: string | null
  /** True for goodwill and indefinite-life intangibles. */
  indefiniteLife: boolean
  /** OD-38: set on a right-of-use asset, the lease contract it comes from. */
  leaseId?: string
  /** An impairment recognised in the sample year, as the test recorded it. */
  impairment?: { testId: string; date: string; recoverable: number }
  /** A disposal in the sample year. */
  disposal?: { date: string; proceeds: number }
  /** A child of a split this session: the parent it came from. */
  splitFrom?: string
}

/**
 * An asset as every screen reads it: the seed plus the figures the engine
 * computes at the current period end. Built by the store, never stored.
 */
export interface FixedAsset extends AssetSeed {
  inServiceDate: string
  residual: number
  /** Accounting method. Every sample asset is straight line. */
  method: 'straight-line' | 'reducing-balance'
  /** Book value at the current period end, accounting basis. `null` once
   *  disposed: the company no longer holds it, which is different from
   *  holding something worth nothing. */
  bookValueCommercial: number | null
  /** Book value at the current period end, tax basis. `null` when there is
   *  no tax book (no statutory group) or the asset is disposed. */
  bookValueFiscal: number | null
  status: AssetStatus
}

/**
 * The Pasal 11 groups: the life and the method each fixes. Straight line is
 * the method the sample company elected; buildings may only use it.
 */
export const STATUTORY_GROUPS: Record<string, { lifeMonths: number; label: string }> = {
  'Tax group 1': { lifeMonths: 48, label: 'Tax group 1 · 4 yr' },
  'Tax group 2': { lifeMonths: 96, label: 'Tax group 2 · 8 yr' },
  'Tax group 3': { lifeMonths: 192, label: 'Tax group 3 · 16 yr' },
  'Tax group 4': { lifeMonths: 240, label: 'Tax group 4 · 20 yr' },
  'Permanent building': { lifeMonths: 240, label: 'Permanent building · 20 yr' },
  'Non-permanent building': { lifeMonths: 120, label: 'Non-permanent building · 10 yr' },
}

/** The corporate income tax rate the deferred tax is measured at. */
export const TAX_RATE = 0.22

/** The 24-asset register: 20 tangible, 4 intangible. Inputs only. */
export const assetSeeds: AssetSeed[] = [
  {
    id: 'FA-0012',
    name: 'Head Office Building',
    class: 'Buildings',
    acquired: '01/03/2020',
    cost: 4800000000,
    commercialLifeMonths: 300,
    taxGroup: 'Permanent building',
    fiscalLifeMonths: 240,
    branch: 'Central Jakarta',
    tag: 'TAG-HQ-001',
    location: 'Floors 1–5 HQ, Sudirman Street',
    custodian: 'Fitri Handayani (GA)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0031',
    name: 'Production Machine Line A',
    class: 'Production machinery',
    acquired: '15/07/2023',
    cost: 1250000000,
    commercialLifeMonths: 120,
    taxGroup: 'Tax group 3',
    fiscalLifeMonths: 192,
    branch: 'Surabaya',
    tag: 'TAG-SBY-114',
    location: 'Plant Rungkut, Bay 3',
    custodian: 'Agus Priyanto (Production)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0047',
    name: 'Toyota Innova B 1234 XYZ',
    class: 'Vehicles',
    acquired: '10/01/2024',
    cost: 385000000,
    commercialLifeMonths: 60,
    taxGroup: 'Tax group 2',
    fiscalLifeMonths: 96,
    branch: 'Central Jakarta',
    tag: 'TAG-VEH-047',
    location: 'HQ vehicle pool',
    custodian: 'Dewi Lestari (Directors)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0055',
    name: 'Laptop Dell Latitude ×12',
    class: 'IT equipment',
    acquired: '01/09/2025',
    cost: 156000000,
    commercialLifeMonths: 48,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Central Jakarta',
    tag: 'TAG-IT-055',
    location: 'Floor 3 HQ',
    custodian: 'IT Support',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0068',
    name: 'Forklift Toyota 3T',
    class: 'Equipment',
    acquired: '20/05/2022',
    cost: 420000000,
    impairment: { testId: 'IT-2026-01', date: '30/06/2026', recoverable: 184000000 },
    commercialLifeMonths: 96,
    taxGroup: 'Tax group 2',
    fiscalLifeMonths: 96,
    branch: 'Medan',
    tag: 'TAG-MDN-068',
    location: 'Medan Warehouse',
    custodian: 'Rudi Santoso (Warehouse)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0071',
    name: 'Cummins 250kVA Generator',
    class: 'Equipment',
    acquired: '01/11/2021',
    cost: 675000000,
    disposal: { date: '15/08/2026', proceeds: 400000000 },
    commercialLifeMonths: 120,
    taxGroup: 'Tax group 3',
    fiscalLifeMonths: 192,
    branch: 'Surabaya',
    tag: 'TAG-SBY-071',
    location: null,
    custodian: null,
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0004',
    name: 'Building Central AC',
    class: 'Equipment',
    acquired: '01/02/2019',
    cost: 240000000,
    commercialLifeMonths: 60,
    taxGroup: 'Tax group 2',
    fiscalLifeMonths: 96,
    branch: 'Central Jakarta',
    tag: 'TAG-HQ-004',
    location: 'Plant room B1',
    custodian: 'Fitri Handayani (GA)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0083',
    name: 'Medan Warehouse Renovation',
    class: 'Buildings',
    acquired: '01/04/2026',
    cost: 310000000,
    commercialLifeMonths: 120,
    taxGroup: 'Non-permanent building',
    fiscalLifeMonths: 120,
    branch: 'Medan',
    tag: 'TAG-MDN-083',
    location: 'Medan Warehouse',
    custodian: 'Rudi Santoso (Warehouse)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0077',
    name: 'Toyota Avanza B 6512 TRK',
    class: 'Vehicles',
    acquired: '15/01/2026',
    cost: 265000000,
    commercialLifeMonths: 60,
    taxGroup: null,
    fiscalLifeMonths: null,
    branch: 'Surabaya',
    tag: 'TAG-VEH-077',
    location: 'Surabaya pool',
    custodian: 'Agus Priyanto (Production)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0079',
    name: 'Warehouse Goods Lift',
    class: 'Equipment',
    acquired: '01/02/2026',
    cost: 480000000,
    commercialLifeMonths: 192,
    taxGroup: 'Tax group 3',
    fiscalLifeMonths: 192,
    branch: 'Surabaya',
    tag: 'TAG-SBY-079',
    location: 'Rungkut Warehouse',
    custodian: 'Rudi Santoso (Warehouse)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0042',
    name: 'Packing Machine Line B',
    class: 'Production machinery',
    acquired: '01/04/2024',
    cost: 560000000,
    commercialLifeMonths: 192,
    taxGroup: 'Tax group 3',
    fiscalLifeMonths: 192,
    branch: 'Surabaya',
    tag: 'TAG-SBY-042',
    location: 'Plant Rungkut, Bay 5',
    custodian: 'Agus Priyanto (Production)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0029',
    name: 'Toyota Hilux B 9087 KLM',
    class: 'Vehicles',
    acquired: '01/03/2023',
    cost: 342000000,
    commercialLifeMonths: 96,
    taxGroup: 'Tax group 2',
    fiscalLifeMonths: 96,
    branch: 'Medan',
    tag: 'TAG-VEH-029',
    location: 'Medan pool',
    custodian: 'Rudi Santoso (Warehouse)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0023',
    name: 'Warehouse Racking Medan',
    class: 'Equipment',
    acquired: '01/02/2022',
    cost: 185000000,
    commercialLifeMonths: 96,
    taxGroup: 'Tax group 2',
    fiscalLifeMonths: 96,
    branch: 'Medan',
    tag: 'TAG-MDN-023',
    location: 'Medan Warehouse',
    custodian: 'Rudi Santoso (Warehouse)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0064',
    name: 'Backup 100kVA Generator',
    class: 'Equipment',
    acquired: '01/06/2025',
    cost: 245000000,
    commercialLifeMonths: 192,
    taxGroup: 'Tax group 3',
    fiscalLifeMonths: 192,
    branch: 'Medan',
    tag: 'TAG-MDN-064',
    location: 'Medan Warehouse',
    custodian: 'Rudi Santoso (Warehouse)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0036',
    name: 'CCTV System HQ',
    class: 'Equipment',
    acquired: '01/10/2023',
    cost: 74500000,
    commercialLifeMonths: 48,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Central Jakarta',
    tag: 'TAG-HQ-036',
    location: 'HQ, all floors',
    custodian: 'Fitri Handayani (GA)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0021',
    name: 'Medan Partitions & Desks',
    class: 'Furniture',
    acquired: '01/06/2023',
    cost: 40500000,
    commercialLifeMonths: 96,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Medan',
    tag: 'TAG-MDN-021',
    location: 'Medan Warehouse office',
    custodian: 'Rudi Santoso (Warehouse)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0051',
    name: 'Office Chairs ×60',
    class: 'Furniture',
    acquired: '01/11/2024',
    cost: 54000000,
    commercialLifeMonths: 48,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Surabaya',
    tag: 'TAG-SBY-051',
    location: 'Rungkut office',
    custodian: 'Agus Priyanto (Production)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0060',
    name: 'Printer & Scanner Set',
    class: 'IT equipment',
    acquired: '01/02/2025',
    cost: 38500000,
    commercialLifeMonths: 48,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Central Jakarta',
    tag: 'TAG-IT-060',
    location: 'Floor 3 HQ',
    custodian: 'IT Support',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0018',
    name: 'Server Rack Dell R740',
    class: 'IT equipment',
    acquired: '01/08/2021',
    cost: 268000000,
    commercialLifeMonths: 48,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Central Jakarta',
    tag: 'TAG-IT-018',
    location: 'Server room B1',
    custodian: 'IT Support',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0002',
    name: 'Staff Desks ×40',
    class: 'Furniture',
    acquired: '10/05/2019',
    cost: 96000000,
    commercialLifeMonths: 48,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Central Jakarta',
    tag: 'TAG-HQ-002',
    location: 'Floors 2–4 HQ',
    custodian: 'Fitri Handayani (GA)',
    type: 'Tangible',
    statutoryCode: null,
    indefiniteLife: false,
  },
  {
    id: 'FA-0091',
    name: 'Goodwill — acquisition of PT Mitra Logistik',
    class: 'Intangible assets',
    acquired: '01/03/2024',
    cost: 2400000000,
    commercialLifeMonths: null,
    taxGroup: 'Tax group 4',
    fiscalLifeMonths: 240,
    branch: 'Central Jakarta',
    tag: null,
    location: 'Not physical · arose on the acquisition of PT Mitra Logistik',
    custodian: null,
    type: 'Intangible',
    statutoryCode: '0607 Goodwill',
    indefiniteLife: true,
  },
  {
    id: 'FA-0093',
    name: 'Registered brand — Central Perk',
    class: 'Intangible assets',
    acquired: '01/06/2023',
    cost: 900000000,
    commercialLifeMonths: null,
    taxGroup: 'Tax group 4',
    fiscalLifeMonths: 240,
    branch: 'Central Jakarta',
    tag: null,
    location: 'Not physical · registered with DJKI, renewable 2033',
    custodian: null,
    type: 'Intangible',
    statutoryCode: '0603 Brand',
    indefiniteLife: true,
  },
  {
    id: 'FA-0092',
    name: 'Software licence — warehouse management system',
    class: 'Intangible assets',
    acquired: '01/01/2025',
    cost: 480000000,
    commercialLifeMonths: 60,
    taxGroup: 'Tax group 1',
    fiscalLifeMonths: 48,
    branch: 'Central Jakarta',
    tag: null,
    location: 'Not physical · licence keys held by IT Support',
    custodian: null,
    type: 'Intangible',
    statutoryCode: '0699 Other intangible',
    indefiniteLife: false,
  },
  {
    id: 'FA-0094',
    name: 'Patent — conveyor mechanism',
    class: 'Intangible assets',
    acquired: '01/09/2024',
    cost: 320000000,
    commercialLifeMonths: 120,
    taxGroup: 'Tax group 2',
    fiscalLifeMonths: 96,
    branch: 'Surabaya',
    tag: null,
    location: 'Not physical · registered with DJKI to 2034',
    custodian: null,
    type: 'Intangible',
    statutoryCode: '0601 Patent',
    indefiniteLife: false,
  },
]

// ── Display rules ───────────────────────────────────────────────────────────

/**
 * Why a fiscal figure is absent. The register must say which: a bare 0 reads
 * as an unfinished calculation, and the design is explicit that this is the
 * single detail most worth protecting.
 */
export type FiscalAbsence = 'Not computed' | 'Not recognised' | 'Not amortised'

/**
 * The label for an absent fiscal book value.
 *  - no tax group      -> 'Not computed'  (nothing to compute from)
 *  - indefinite life   -> 'Not amortised' (no commercial schedule exists)
 */
export function fiscalAbsenceReason(a: Pick<AssetSeed, 'taxGroup' | 'indefiniteLife'>): FiscalAbsence {
  if (!a.taxGroup) return 'Not computed'
  if (a.indefiniteLife) return 'Not amortised'
  return 'Not recognised'
}

/** An asset with no statutory classification cannot reach any fiscal output. */
export function isUnclassified(a: Pick<AssetSeed, 'taxGroup'>): boolean {
  return a.taxGroup === null
}

/**
 * Register totals. Two rules the design is explicit about:
 *
 *  - Disposed assets are excluded. They are no longer held, so including
 *    them would overstate what the company owns.
 *  - The fiscal total covers only classified assets. An unclassified asset
 *    is not worth zero on the tax basis; it has no tax basis at all. It is
 *    reported as an exclusion beside the total rather than folded into it.
 */
export function registerTotals(rows: FixedAsset[]) {
  const held = rows.filter((a) => a.status !== 'Disposed' && a.status !== 'Split')
  const classified = held.filter((a) => a.bookValueFiscal !== null)
  return {
    count: rows.length,
    cost: held.reduce((s, a) => s + a.cost, 0),
    bookValueCommercial: held.reduce((s, a) => s + (a.bookValueCommercial ?? 0), 0),
    bookValueFiscal: classified.reduce((s, a) => s + (a.bookValueFiscal as number), 0),
    /** How many held assets could not contribute to the fiscal total. */
    unclassified: held.filter(isUnclassified).length,
  }
}

/** The asset classes present, for the register's Class filter. */
export const assetClasses: string[] = Array.from(
  new Set(assetSeeds.map((a) => a.class)),
).sort()

/** The branches present, for the Branch filter. */
export const assetBranches: string[] = Array.from(
  new Set(assetSeeds.map((a) => a.branch)),
).sort()

/** The statutory groups a user can choose, for the filter and the Set group control. */
export const assetTaxGroups: string[] = Array.from(
  new Set([
    ...assetSeeds.map((a) => a.taxGroup).filter((g): g is string => !!g),
  ]),
).sort()

/** Every status, in the order the design lists them. */
export const assetStatuses: AssetStatus[] = [
  'Active', 'Impaired', 'Disposed', 'Fully depreciated', 'Incomplete', 'Split',
]
