/**
 * Fixed assets — the register behind Accounting › Fixed assets › Assets.
 *
 * Sample company: PT Central Perk Indonesia · FY2026 (Jan–Dec) · IDR · three
 * branches (Central Jakarta, Surabaya, Medan). "Today" is September 2026,
 * closing 30/09/2026.
 *
 * Every figure here is transcribed from the approved design dataset and is
 * internally consistent: book values, the depreciation charges in
 * `assetDepreciation`, and the headline totals in `ASSET_HEADLINE_FIGURES`
 * all tie. Do not recompute or round them — several exist specifically to
 * demonstrate a divergence between the two books.
 *
 * Three rules the design is explicit about, and that the UI must preserve:
 *
 *  1. A fiscal figure that is legitimately absent is NEVER 0. It reads
 *     'Not computed' (no tax group), 'Not recognised' (fiscal does not
 *     recognise the event) or 'Not amortised' (indefinite life). A zero
 *     reads as an unfinished calculation.
 *  2. FA-0077 has no tax group. That is a designed hole, not missing data:
 *     it is excluded from the fiscal book, the difference total and Lampiran
 *     9, and every screen that excludes it must say so.
 *  3. Goodwill (FA-0091) never amortises commercially and does amortise
 *     fiscally. That 100% divergence is the sharpest demonstration of why one
 *     schedule per asset cannot serve an Indonesian filer.
 */

/** Where an asset sits in its life. Drives the row badge and the totals. */
export type AssetStatus =
  | 'Active'
  | 'Impaired'
  | 'Disposed'
  | 'Fully depreciated'
  | 'Incomplete'

/** Tangible assets depreciate; intangible assets amortise. Same engine. */
export type AssetType = 'Tangible' | 'Intangible'

export interface FixedAsset {
  id: string
  name: string
  /** Asset class — drives the default tax group and life. */
  class: string
  /** Acquisition date, dd/mm/yyyy as the register displays it. */
  acquired: string
  cost: number
  /** Commercial useful life in months. `null` for an indefinite-life
   *  intangible: no commercial schedule exists at all, which is different
   *  from a very long one. */
  commercialLifeMonths: number | null
  /** Statutory group (Pasal 11). `null` means unclassified — see FA-0077. */
  taxGroup: string | null
  /** Fiscal life in months, fixed by the tax group. `null` when unclassified. */
  fiscalLifeMonths: number | null
  branch: string
  /** Book value at 30/09/2026, commercial basis. `null` once disposed: the
   *  company no longer holds it, which is different from holding something
   *  worth nothing. */
  bookValueCommercial: number | null
  /** Book value at 30/09/2026, fiscal basis. `null` when it cannot be
   *  computed (no tax group) — render 'Not computed', never 0. */
  bookValueFiscal: number | null
  status: AssetStatus
  /** Physical tag. Intangible assets have none. */
  tag: string | null
  location: string | null
  custodian: string | null
  type: AssetType
  /** Statutory asset code — 4 digits for tangible, the 11-code intangible
   *  taxonomy for intangible. */
  statutoryCode: string | null
  /** True for goodwill and indefinite-life intangibles: no commercial
   *  amortisation schedule exists at all — not a very long one. */
  indefiniteLife: boolean
}

/** The 24-asset register: 20 tangible, 4 intangible. */
export const fixedAssets: FixedAsset[] = [
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
    bookValueCommercial: 3536000000,
    bookValueFiscal: 3220000000,
    status: 'Active',
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
    bookValueCommercial: 843750000,
    bookValueFiscal: 996093750,
    status: 'Active',
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
    bookValueCommercial: 173250000,
    bookValueFiscal: 252656250,
    status: 'Active',
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
    bookValueCommercial: 113750000,
    bookValueFiscal: 113750000,
    status: 'Active',
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
    commercialLifeMonths: 96,
    taxGroup: 'Tax group 2',
    fiscalLifeMonths: 96,
    branch: 'Medan',
    bookValueCommercial: 172000000,
    bookValueFiscal: 188125000,
    status: 'Impaired',
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
    commercialLifeMonths: 120,
    taxGroup: 'Tax group 3',
    fiscalLifeMonths: 192,
    branch: 'Surabaya',
    bookValueCommercial: null,
    bookValueFiscal: null,
    status: 'Disposed',
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
    bookValueCommercial: 0,
    bookValueFiscal: 10000000,
    status: 'Fully depreciated',
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
    bookValueCommercial: 294500000,
    bookValueFiscal: 294500000,
    status: 'Active',
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
    bookValueCommercial: 225250000,
    bookValueFiscal: null,
    status: 'Incomplete',
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
    bookValueCommercial: 460000000,
    bookValueFiscal: 460000000,
    status: 'Active',
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
    bookValueCommercial: 472500000,
    bookValueFiscal: 472500000,
    status: 'Active',
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
    bookValueCommercial: 188812500,
    bookValueFiscal: 188812500,
    status: 'Active',
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
    bookValueCommercial: 77083333,
    bookValueFiscal: 77083333,
    status: 'Active',
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
    bookValueCommercial: 224583333,
    bookValueFiscal: 224583333,
    status: 'Active',
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
    bookValueCommercial: 18625000,
    bookValueFiscal: 18625000,
    status: 'Active',
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
    bookValueCommercial: 23625000,
    bookValueFiscal: 6750000,
    status: 'Active',
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
    bookValueCommercial: 28125000,
    bookValueFiscal: 28125000,
    status: 'Active',
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
    bookValueCommercial: 22458333,
    bookValueFiscal: 22458333,
    status: 'Active',
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
    bookValueCommercial: 0,
    bookValueFiscal: 0,
    status: 'Fully depreciated',
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
    bookValueCommercial: 0,
    bookValueFiscal: 0,
    status: 'Fully depreciated',
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
    bookValueCommercial: 2400000000,
    bookValueFiscal: 2090000000,
    status: 'Active',
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
    bookValueCommercial: 900000000,
    bookValueFiscal: 750000000,
    status: 'Active',
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
    bookValueCommercial: 312000000,
    bookValueFiscal: 270000000,
    status: 'Active',
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
    bookValueCommercial: 253333333,
    bookValueFiscal: 236666667,
    status: 'Active',
    tag: null,
    location: 'Not physical · registered with DJKI to 2034',
    custodian: null,
    type: 'Intangible',
    statutoryCode: '0601 Patent',
    indefiniteLife: false,
  },
]

// ── Depreciation and amortisation ───────────────────────────────────────────

/** A period charge on both bases. `fiscal` is null when it cannot be computed. */
export interface AssetCharge {
  commercial: number
  fiscal: number | null
}

/**
 * FY2026 to 30/09/2026, per asset, both books.
 *
 * FA-0077 carries a commercial charge and no fiscal one: it has no tax group,
 * so there is nothing to compute the fiscal side from. Rendered 'Not computed'.
 */
export const assetChargeYtd: Record<string, AssetCharge> = {
  'FA-0012': { commercial: 144000000, fiscal: 180000000 },
  'FA-0031': { commercial: 93750000, fiscal: 58593750 },
  'FA-0047': { commercial: 57750000, fiscal: 36093750 },
  'FA-0055': { commercial: 29250000, fiscal: 29250000 },
  'FA-0068': { commercial: 38250000, fiscal: 39375000 },
  'FA-0071': { commercial: 45000000, fiscal: 28125000 },
  'FA-0004': { commercial: 0, fiscal: 22500000 },
  'FA-0083': { commercial: 15500000, fiscal: 15500000 },
  'FA-0077': { commercial: 39750000, fiscal: null },
  'FA-0079': { commercial: 20000000, fiscal: 20000000 },
  'FA-0042': { commercial: 26250000, fiscal: 26250000 },
  'FA-0029': { commercial: 32062500, fiscal: 32062500 },
  'FA-0023': { commercial: 17343750, fiscal: 17343750 },
  'FA-0064': { commercial: 11484375, fiscal: 11484375 },
  'FA-0036': { commercial: 13968750, fiscal: 13968750 },
  'FA-0021': { commercial: 3796875, fiscal: 7593750 },
  'FA-0051': { commercial: 10125000, fiscal: 10125000 },
  'FA-0060': { commercial: 7218750, fiscal: 7218750 },
  'FA-0018': { commercial: 0, fiscal: 0 },
  'FA-0002': { commercial: 0, fiscal: 0 },
}

/** September 2026 charge, per asset, both books. */
export const assetChargeSeptember: Record<string, AssetCharge> = {
  'FA-0012': { commercial: 16000000, fiscal: 20000000 },
  'FA-0031': { commercial: 10416667, fiscal: 6510417 },
  'FA-0047': { commercial: 6416667, fiscal: 4010417 },
  'FA-0077': { commercial: 4416667, fiscal: null },  // No tax group — fiscal charge not computed
  'FA-0068': { commercial: 4000000, fiscal: 4375000 },  // Commercial basis reset by the June impairment
  'FA-0029': { commercial: 3562500, fiscal: 3562500 },
  'FA-0055': { commercial: 3250000, fiscal: 3250000 },
  'FA-0042': { commercial: 2916667, fiscal: 2916667 },
  'FA-0083': { commercial: 2583333, fiscal: 2583333 },
  'FA-0079': { commercial: 2500000, fiscal: 2500000 },
  'FA-0004': { commercial: 0, fiscal: 2500000 },  // Commercial life exhausted, fiscal still running
  'FA-0023': { commercial: 1927083, fiscal: 1927083 },
  'FA-0036': { commercial: 1552083, fiscal: 1552083 },
  'FA-0064': { commercial: 1276042, fiscal: 1276042 },
  'FA-0051': { commercial: 1125000, fiscal: 1125000 },
  'FA-0060': { commercial: 802083, fiscal: 802083 },
  'FA-0021': { commercial: 421875, fiscal: 843750 },  // Fiscal life 4 years against 8 commercial
  'FA-0071': { commercial: 0, fiscal: 0 },  // Disposed 15/08/2026
  'FA-0018': { commercial: 0, fiscal: 0 },  // Fully depreciated
  'FA-0002': { commercial: 0, fiscal: 0 },  // Fully depreciated
}

/** September 2026 totals. Fiscal excludes FA-0077. */
export const septemberTotals: AssetCharge = {
  commercial: 63166667,
  fiscal: 59734375,
}

// ── Headline figures ────────────────────────────────────────────────────────

/**
 * The figures the whole module is checked against. Every screen that shows one
 * of these must show this value: they are the approved arithmetic, not a
 * derived convenience. Do not recompute or round.
 */
export const ASSET_HEADLINE_FIGURES = {
  /** 19 classified assets */
  depreciationCommercialYTD: 565750000,
  /** ties to the statutory export */
  depreciationFiscalYTD: 555484375,
  /** FA-0077, no tax group, excluded from every fiscal total */
  unclassifiedCommercialYTD: 39750000,
  /** FA-0071, sold 15/08/2026 for 400.000.000 */
  disposalCommercialGain: 51250000,
  /** same disposal, opposite sign */
  disposalFiscalLoss: -71093750,
  /** FA-0068; fiscal side reads "Not recognised", never 0 */
  impairmentCommercialOnly: -17250000,
  /** to the fiscal correction */
  netTemporaryDifference: 94828125,
  /** on the net difference */
  deferredTaxAt22pct: 20862188,
  amortisationCommercialYTD: 96000000,
  amortisationFiscalYTD: 243750000,
  taxRate: 0.22,
} as const

// ── Display rules ───────────────────────────────────────────────────────────

/**
 * Why a fiscal figure is absent. The register must say which — a bare 0 reads
 * as an unfinished calculation, and the design is explicit that this is the
 * single detail most worth protecting.
 */
export type FiscalAbsence = 'Not computed' | 'Not recognised' | 'Not amortised'

/**
 * The label for an absent fiscal book value.
 *  - no tax group      → 'Not computed'  (nothing to compute from)
 *  - indefinite life   → 'Not amortised' (no commercial schedule exists)
 */
export function fiscalAbsenceReason(a: FixedAsset): FiscalAbsence {
  if (!a.taxGroup) return 'Not computed'
  if (a.indefiniteLife) return 'Not amortised'
  return 'Not recognised'
}

/** An asset with no statutory classification cannot reach any fiscal output. */
export function isUnclassified(a: FixedAsset): boolean {
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
  const held = rows.filter((a) => a.status !== 'Disposed')
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
  new Set(fixedAssets.map((a) => a.class)),
).sort()

/** The branches present, for the Branch filter. */
export const assetBranches: string[] = Array.from(
  new Set(fixedAssets.map((a) => a.branch)),
).sort()

/** The statutory groups present, for the Tax group filter. */
export const assetTaxGroups: string[] = Array.from(
  new Set(fixedAssets.map((a) => a.taxGroup).filter((g): g is string => !!g)),
).sort()

/** Every status, in the order the design lists them. */
export const assetStatuses: AssetStatus[] = [
  'Active', 'Impaired', 'Disposed', 'Fully depreciated', 'Incomplete',
]
