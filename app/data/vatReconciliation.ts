/**
 * VAT reconciliation — ERP records ↔ DJP Coretax faktur pajak.
 *
 * Two sides, one shape:
 *   output (Faktur keluaran) — sales invoices (ERP)    ↔ tax invoices issued (Coretax)
 *   input  (Faktur masukan)  — purchase invoices (ERP) ↔ prepopulated faktur (Coretax)
 *
 * Identifiers follow **Coretax**, not legacy e-Faktur:
 *   nomor faktur pajak — 17 digits, numeric only (was `010.001-26.39847291`)
 *   NPWP               — 16 digits, numeric only (was `01.000.013.1-093.000`)
 *
 * A "pair" always carries both sides; either one may be null, which is what
 * makes it unmatched. `match` is the engine's verdict, `confidence` its score
 * (0–1), `fields` the field keys that differ (drives diff highlighting), and
 * `reason` the plain-language explanation shown to the user.
 *
 * Period: Masa pajak 04/2026. Tenant: PT Central Perk Indonesia.
 */

/** Engine verdict for a pair. erp-only / djp-only both read as "Unmatched". */
export type MatchState = 'matched' | 'suggested' | 'discrepancy' | 'erp-only' | 'djp-only'

export type ReconSide = 'output' | 'input'

export interface ReconRecord {
  ref: string
  date: string
  /** Customer on the output side, vendor on the input side. */
  customer?: string
  vendor?: string
  npwp: string
  dpp: number
  ppn: number
  total: number
  /** Coretax approval state — DJP side only. */
  approved?: boolean
}

export interface ReconPair {
  id: string
  match: MatchState
  confidence: number
  erp: ReconRecord | null
  djp: ReconRecord | null
  reason?: string
  /** Field keys that differ between the two sides. */
  fields?: string[]
}

/** A pair carrying the side it came from — used by the cross-cut Unmatched report. */
export interface ReconIssue extends ReconPair { side: ReconSide }

// ── Match-state presentation ───────────────────────────────────────────────────
// Kept next to the data (not in the pages) so the workspace, the report table and
// the drawer can never drift apart on colour or wording.

/**
 * Colours are Pixel design-system tokens, never raw hex.
 *
 * Two deliberate constraints shaped this map:
 *   1. `MpBadge` has five types and no purple, so *status* always renders as a
 *      standard badge type. The AI identity lives on AI *affordances* (the review
 *      action, the suggestion banner, the confidence pill) via the Airene tokens —
 *      which is how Mekari brands AI everywhere else.
 *   2. Semantic tokens (`--mp-background-success`, …) are not emitted into CSS in
 *      this app, so they silently resolve to nothing. The `--mp-colors-*` palette
 *      and `--mp-airene-*` are emitted, so surfaces use those — they are the same
 *      values the semantic tokens alias in the Enterprise theme.
 */
export type MpBadgeType = 'completed' | 'information' | 'warning' | 'critical' | 'announcement'

export interface MatchMeta {
  /** Row/table label. Both unmatched states collapse to "Unmatched". */
  label: string
  /** Longer form for the drawer header. */
  longLabel: string
  /** Filter-chip label — here the two unmatched states stay distinguishable. */
  chipLabel: string
  /** MpBadge `type` for status display. */
  badgeType: MpBadgeType
  /** Surface tokens for the row/connector treatment. */
  dot: string
  bg: string
  border: string
  fg: string
  icon: string
  /**
   * MpIcon `color` prop for `icon` when it sits on the filled `dot` surface.
   *
   * MpIcon writes `--mp-icon-color: var(--mp-colors-icon-default)` as an *inline
   * style on its own <svg>*, so a CSS `color` on the icon or any ancestor is
   * ignored — the icon renders grey #536062 no matter what the surface is. The
   * only way to recolor it is this prop, whose value is a dot-path into the
   * `--mp-colors-*` namespace (`icon.inverse` → `--mp-colors-icon-inverse`).
   *
   * Valid paths: icon.brand · icon.danger · icon.default · icon.disabled ·
   * icon.highlight · icon.information · icon.inverse · icon.inverse.static ·
   * icon.selected · icon.subtle · icon.success · icon.warning
   */
  iconColor: string
  /** Same, for the outline treatment (no fill — icon takes the state colour). */
  iconColorOutline: string
}

export const MATCH_META: Record<MatchState, MatchMeta> = {
  matched: {
    label: 'Matched', longLabel: 'Matched', chipLabel: 'Matched',
    badgeType: 'completed',
    dot: 'var(--mp-colors-emerald-700)',
    bg: 'var(--mp-colors-green-100)',
    border: 'var(--mp-colors-green-200)',
    fg: 'var(--mp-colors-emerald-800)',
    icon: 'done',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.success',
  },
  suggested: {
    label: 'Suggested', longLabel: 'Suggested match', chipLabel: 'Suggested',
    // AI-produced → Airene, the design system's AI treatment.
    badgeType: 'information',
    dot: 'var(--mp-airene-bold)',
    bg: 'var(--mp-airene-badge-bg)',
    border: 'var(--mp-airene-badge-border)',
    fg: 'var(--mp-airene-bold)',
    icon: 'magic',
    // No Airene icon token exists, and the Airene fill is dark → inverse reads.
    iconColor: 'icon.inverse', iconColorOutline: 'icon.information',
  },
  discrepancy: {
    label: 'Discrepancy', longLabel: 'Discrepancy', chipLabel: 'Discrepancy',
    badgeType: 'warning',
    dot: 'var(--mp-colors-orange-600)',
    bg: 'var(--mp-colors-orange-100)',
    border: 'var(--mp-colors-orange-200)',
    fg: 'var(--mp-colors-orange-800)',
    icon: 'warning-triangle',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.warning',
  },
  'erp-only': {
    label: 'Unmatched', longLabel: 'ERP only · unmatched', chipLabel: 'ERP only',
    badgeType: 'critical',
    dot: 'var(--mp-colors-red-600)',
    bg: 'var(--mp-colors-red-100)',
    border: 'var(--mp-colors-red-200)',
    fg: 'var(--mp-colors-red-800)',
    icon: 'minus-circular',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.danger',
  },
  'djp-only': {
    label: 'Unmatched', longLabel: 'Coretax only · unmatched', chipLabel: 'Coretax only',
    badgeType: 'critical',
    dot: 'var(--mp-colors-red-600)',
    bg: 'var(--mp-colors-red-100)',
    border: 'var(--mp-colors-red-200)',
    fg: 'var(--mp-colors-red-800)',
    icon: 'minus-circular',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.danger',
  },
}

/** Per-side copy. The layout is identical; only the labels change. */
export const SIDE_LABELS: Record<ReconSide, {
  title: string
  erpHeader: string
  erpHeaderSub: string
  djpHeader: string
  djpHeaderSub: string
  erpEmptyAction: string
  djpEmptyAction: string
  /** Transitional toast for the create action — the destination isn't built yet. */
  erpEmptyToast: string
  djpEmptyToast: string
  partyLabel: string
  kpiErpDpp: string
  kpiDjpDpp: string
  kpiErpPpn: string
  kpiDjpPpn: string
}> = {
  output: {
    // English gets the standard VAT term, not the Indonesian one: the EN locale
    // already says "Tax invoice" for faktur pajak, so leaving the two sides in
    // Indonesian was the odd one out. ID keeps "Faktur keluaran/masukan".
    title: 'Output tax invoice',
    erpHeader: 'Sales invoices', erpHeaderSub: 'ERP',
    djpHeader: 'Tax invoices issued', djpHeaderSub: 'Coretax DJP',
    erpEmptyAction: 'Create sales invoice', djpEmptyAction: 'Create faktur pajak',
    erpEmptyToast: 'Opening sales invoice…', djpEmptyToast: 'Opening Coretax…',
    partyLabel: 'Customer',
    kpiErpDpp: 'DPP · sales', kpiDjpDpp: 'DPP · faktur',
    kpiErpPpn: 'PPN · sales', kpiDjpPpn: 'PPN · faktur',
  },
  input: {
    title: 'Input tax invoice',
    // The ERP-side document is a Purchase invoice (Purchases module), not a Bill
    // — Bills are the separate Expenses queue.
    erpHeader: 'Purchase invoices', erpHeaderSub: 'ERP',
    djpHeader: 'Tax invoices received', djpHeaderSub: 'Coretax prepopulated',
    erpEmptyAction: 'Create purchase invoice', djpEmptyAction: 'Flag for follow-up',
    erpEmptyToast: 'Opening purchase invoice…', djpEmptyToast: 'Faktur flagged for follow-up',
    partyLabel: 'Vendor',
    kpiErpDpp: 'DPP · purchases', kpiDjpDpp: 'DPP · faktur',
    kpiErpPpn: 'PPN · purchases', kpiDjpPpn: 'PPN · faktur',
  },
}

// ── Output side — Faktur keluaran (sales) ──────────────────────────────────────

export const outputPairs: ReconPair[] = [
  {
    id: 'o-01', match: 'matched', confidence: 1,
    erp: { ref: 'SI/2026/04/0142', date: '02 Apr 2026', customer: 'PT Telkom Indonesia Tbk', npwp: '0010000131093000', dpp: 12500000, ppn: 1500000, total: 14000000 },
    djp: { ref: '26000000039847291', date: '02 Apr 2026', customer: 'PT Telkom Indonesia Tbk', npwp: '0010000131093000', dpp: 12500000, ppn: 1500000, total: 14000000, approved: true },
  },
  {
    id: 'o-02', match: 'matched', confidence: 1,
    erp: { ref: 'SI/2026/04/0143', date: '03 Apr 2026', customer: 'PT Bank Central Asia Tbk', npwp: '0010010641091000', dpp: 42750000, ppn: 5130000, total: 47880000 },
    djp: { ref: '26000000039847342', date: '03 Apr 2026', customer: 'PT Bank Central Asia Tbk', npwp: '0010010641091000', dpp: 42750000, ppn: 5130000, total: 47880000, approved: true },
  },
  {
    id: 'o-03', match: 'suggested', confidence: 0.96,
    erp: { ref: 'SI/2026/04/0144', date: '05 Apr 2026', customer: 'PT Astra International Tbk', npwp: '0013025845092000', dpp: 87500000, ppn: 10500000, total: 98000000 },
    djp: { ref: '26000000039847415', date: '05 Apr 2026', customer: 'PT Astra Intl. Tbk', npwp: '0013025845092000', dpp: 87500000, ppn: 10500000, total: 98000000, approved: true },
    reason: 'Match on NPWP, DPP, PPN and date. Customer name differs slightly (abbreviated).',
  },
  {
    id: 'o-04', match: 'discrepancy', confidence: 0.78,
    erp: { ref: 'SI/2026/04/0145', date: '08 Apr 2026', customer: 'PT Indofood Sukses Makmur Tbk', npwp: '0011060432092000', dpp: 24800000, ppn: 2976000, total: 27776000 },
    djp: { ref: '26000000039847488', date: '08 Apr 2026', customer: 'PT Indofood Sukses Makmur Tbk', npwp: '0011060432092000', dpp: 24800000, ppn: 2976500, total: 27776500, approved: true },
    reason: 'PPN differs by Rp500,00 — possible rounding mismatch.',
    fields: ['ppn', 'total'],
  },
  {
    id: 'o-05', match: 'matched', confidence: 1,
    erp: { ref: 'SI/2026/04/0146', date: '10 Apr 2026', customer: 'PT Trinusa Travelindo', npwp: '0025278154031000', dpp: 18900000, ppn: 2268000, total: 21168000 },
    djp: { ref: '26000000039847561', date: '10 Apr 2026', customer: 'PT Trinusa Travelindo', npwp: '0025278154031000', dpp: 18900000, ppn: 2268000, total: 21168000, approved: true },
  },
  {
    id: 'o-06', match: 'suggested', confidence: 0.88,
    erp: { ref: 'SI/2026/04/0147', date: '12 Apr 2026', customer: 'PT Mitra Keluarga Karyasehat Tbk', npwp: '0010610927054000', dpp: 9800000, ppn: 1176000, total: 10976000 },
    djp: { ref: '26000000039847634', date: '13 Apr 2026', customer: 'PT Mitra Keluarga Karyasehat Tbk', npwp: '0010610927054000', dpp: 9800000, ppn: 1176000, total: 10976000, approved: true },
    reason: 'Date differs by 1 day (within 3-day window). All other fields match.',
    fields: ['date'],
  },
  {
    id: 'o-07', match: 'erp-only', confidence: 0,
    erp: { ref: 'SI/2026/04/0148', date: '15 Apr 2026', customer: 'PT GoTo Gojek Tokopedia Tbk', npwp: '0071058362092000', dpp: 31200000, ppn: 3744000, total: 34944000 },
    djp: null,
    reason: 'No matching faktur pajak issued in Coretax.',
  },
  {
    id: 'o-08', match: 'matched', confidence: 1,
    erp: { ref: 'SI/2026/04/0149', date: '18 Apr 2026', customer: 'PT Trans Retail Indonesia', npwp: '0022187064046000', dpp: 56400000, ppn: 6768000, total: 63168000 },
    djp: { ref: '26000000039847707', date: '18 Apr 2026', customer: 'PT Trans Retail Indonesia', npwp: '0022187064046000', dpp: 56400000, ppn: 6768000, total: 63168000, approved: true },
  },
  {
    id: 'o-09', match: 'djp-only', confidence: 0,
    erp: null,
    djp: { ref: '26000000039847780', date: '20 Apr 2026', customer: 'CV Sinar Jaya Abadi', npwp: '0028345127027000', dpp: 4200000, ppn: 504000, total: 4704000, approved: false },
    reason: 'Faktur pajak exists in Coretax but no corresponding sales invoice in ERP.',
  },
  {
    id: 'o-10', match: 'discrepancy', confidence: 0.62,
    erp: { ref: 'SI/2026/04/0150', date: '22 Apr 2026', customer: 'PT Bumi Berkah Boga', npwp: '0034289175031000', dpp: 6125000, ppn: 735000, total: 6860000 },
    djp: { ref: '26000000039847853', date: '22 Apr 2026', customer: 'PT Bumi Berkah Boga', npwp: '0034289175031000', dpp: 6250000, ppn: 750000, total: 7000000, approved: true },
    reason: 'DPP and PPN differ — the Coretax faktur is Rp125.000 higher.',
    fields: ['dpp', 'ppn', 'total'],
  },
  {
    id: 'o-11', match: 'matched', confidence: 1,
    erp: { ref: 'SI/2026/04/0151', date: '25 Apr 2026', customer: 'PT Hungry Birds Indonesia', npwp: '0078123940058000', dpp: 3500000, ppn: 420000, total: 3920000 },
    djp: { ref: '26000000039847926', date: '25 Apr 2026', customer: 'PT Hungry Birds Indonesia', npwp: '0078123940058000', dpp: 3500000, ppn: 420000, total: 3920000, approved: true },
  },
  {
    id: 'o-12', match: 'erp-only', confidence: 0,
    erp: { ref: 'SI/2026/04/0152', date: '28 Apr 2026', customer: 'PT Maju Sejahtera Abadi', npwp: '0017763285013000', dpp: 8400000, ppn: 1008000, total: 9408000 },
    djp: null,
    reason: 'No matching faktur pajak issued in Coretax.',
  },
]

// ── Input side — Faktur masukan (purchases) ────────────────────────────────────

export const inputPairs: ReconPair[] = [
  {
    id: 'i-01', match: 'matched', confidence: 1,
    erp: { ref: 'PINV-2026-04-018', date: '04 Apr 2026', vendor: 'PT Pertamina Patra Niaga', npwp: '0010016543058000', dpp: 14500000, ppn: 1740000, total: 16240000 },
    djp: { ref: '26000000071284091', date: '04 Apr 2026', vendor: 'PT Pertamina Patra Niaga', npwp: '0010016543058000', dpp: 14500000, ppn: 1740000, total: 16240000, approved: true },
  },
  {
    id: 'i-02', match: 'matched', confidence: 1,
    erp: { ref: 'PINV-2026-04-019', date: '06 Apr 2026', vendor: 'PT Aneka Gas Industri', npwp: '0010724988091000', dpp: 3250000, ppn: 390000, total: 3640000 },
    djp: { ref: '26000000071284164', date: '06 Apr 2026', vendor: 'PT Aneka Gas Industri', npwp: '0010724988091000', dpp: 3250000, ppn: 390000, total: 3640000, approved: true },
  },
  {
    id: 'i-03', match: 'djp-only', confidence: 0,
    erp: null,
    djp: { ref: '26000000071284237', date: '09 Apr 2026', vendor: 'PT Mitra Logistik Cepat', npwp: '0023486712072000', dpp: 8750000, ppn: 1050000, total: 9800000, approved: true },
    reason: 'Prepopulated from Coretax. No purchase invoice recorded in ERP yet — create it from this faktur.',
  },
  {
    id: 'i-04', match: 'suggested', confidence: 0.94,
    erp: { ref: 'PINV-2026-04-021', date: '12 Apr 2026', vendor: 'PT Sinar Sosro', npwp: '0014281035091000', dpp: 4860000, ppn: 583200, total: 5443200 },
    djp: { ref: '26000000071284310', date: '12 Apr 2026', vendor: 'PT Sinar Sosro', npwp: '0014281035091000', dpp: 4860000, ppn: 583200, total: 5443200, approved: true },
    reason: 'Exact match on NPWP, amount and date. Purchase invoice number not stored on faktur.',
  },
  {
    id: 'i-05', match: 'discrepancy', confidence: 0.71,
    erp: { ref: 'PINV-2026-04-022', date: '14 Apr 2026', vendor: 'PT Wahana Komputer', npwp: '0016732814031000', dpp: 22500000, ppn: 2475000, total: 24975000 },
    djp: { ref: '26000000071284383', date: '14 Apr 2026', vendor: 'PT Wahana Komputer', npwp: '0016732814031000', dpp: 22500000, ppn: 2700000, total: 25200000, approved: true },
    reason: 'PPN differs — Coretax shows 12% but the purchase invoice recorded 11%.',
    fields: ['ppn', 'total'],
  },
  {
    id: 'i-06', match: 'matched', confidence: 1,
    erp: { ref: 'PINV-2026-04-024', date: '17 Apr 2026', vendor: 'PT Trans Multi Logistic', npwp: '0021068479064000', dpp: 1875000, ppn: 225000, total: 2100000 },
    djp: { ref: '26000000071284456', date: '17 Apr 2026', vendor: 'PT Trans Multi Logistic', npwp: '0021068479064000', dpp: 1875000, ppn: 225000, total: 2100000, approved: true },
  },
  {
    id: 'i-07', match: 'djp-only', confidence: 0,
    erp: null,
    djp: { ref: '26000000071284529', date: '21 Apr 2026', vendor: 'CV Berkah Stationary', npwp: '0072159483052000', dpp: 980000, ppn: 117600, total: 1097600, approved: true },
    reason: 'Prepopulated from Coretax. No purchase invoice recorded in ERP yet.',
  },
  {
    id: 'i-08', match: 'erp-only', confidence: 0,
    erp: { ref: 'PINV-2026-04-027', date: '24 Apr 2026', vendor: 'PT Solusi Bangun Indonesia', npwp: '0015472860091000', dpp: 11250000, ppn: 1350000, total: 12600000 },
    djp: null,
    reason: "Purchase invoice exists in ERP but the vendor hasn't issued a faktur pajak.",
  },
]

/** Alternative match candidates offered in the drawer for a non-matched pair. */
export const matchCandidates = [
  { ref: '26000000039847488', date: '08 Apr 2026', party: 'PT Indofood Sukses Makmur Tbk', dpp: 24800000, ppn: 2976500, total: 27776500, confidence: 0.78, why: 'NPWP and DPP match. PPN differs by Rp500.' },
  { ref: '26000000039847412', date: '07 Apr 2026', party: 'PT Indofood Sukses Makmur Tbk', dpp: 24800000, ppn: 2976000, total: 27776000, confidence: 0.65, why: 'NPWP and amounts match. Date is one day earlier.' },
  { ref: '26000000039847501', date: '09 Apr 2026', party: 'PT Indofood Distribusi', dpp: 25000000, ppn: 3000000, total: 28000000, confidence: 0.42, why: 'NPWP differs (group company). Amount slightly higher.' },
]

// ── Periods — the multi-period index ─────────────────────────────────────────

/**
 * The prototype's "today" — the fixtures are pinned to masa 04/2026, so any date
 * logic here works off this rather than `new Date()`, which would drift.
 */
export const TODAY_ISO = '2026-05-21'

/** Timestamp of the last Coretax pull, shown in the workspace footer. */
export const lastSyncedAt = '21 May 2026, 14:32'

/**
 * Reconciliation state of one masa+side. Derived, never stored — see
 * `periodStatus`. Mirrors the three states Klikpajak already ships:
 *
 *   not reconciled       Belum direkonsiliasi   — nothing matched yet
 *   partially reconciled Terekonsiliasi sebagian — some matched, some left
 *   reconciled           Selesai rekonsiliasi   — every pair matched
 */
export type ReconPeriodStatus = 'not reconciled' | 'partially reconciled' | 'reconciled'

/** Totals and record count for one column of one masa+side. */
interface ReconColumnSeed { amount: number; count: number }

interface ReconSideSeed {
  /** ERP side — sales invoices (keluaran) or purchase invoices (masukan). */
  erp: ReconColumnSeed
  /** Coretax side — faktur pajak. */
  djp: ReconColumnSeed
  /** Pairs matched, of `total` in play. Not shown in the table; drives status. */
  matched: number
  total: number
}

interface ReconPeriodSeed {
  /** Sort/route key — 'YYYY-MM'. */
  id: string
  /** Display form, e.g. '04/2026'. */
  masa: string
  /** When the reconciliation was last run (ISO). Absent = never run. */
  reconciledAt?: string
  /** `'live'` resolves from the pair fixtures above, so the active masa can never
   *  disagree with the workspace it links to. */
  sides: { output: ReconSideSeed; input: ReconSideSeed } | 'live'
}

/**
 * Six masa, newest first, covering all three states:
 *
 *   05/2026  not reconciled        faktur pulled from Coretax, recon not run yet
 *   04/2026  partially reconciled  the live one; derived from the pair fixtures
 *   03/2026 – 12/2025  reconciled  the closed tail (both columns agree, so one
 *                                  figure describes them — selisih is 0 by
 *                                  definition once every pair is matched)
 */
const PERIOD_SEEDS: ReconPeriodSeed[] = [
  {
    id: '2026-05', masa: '05/2026',
    sides: {
      output: { erp: { amount: 268_400_000, count: 9 }, djp: { amount: 245_960_000, count: 8 }, matched: 0, total: 9 },
      input:  { erp: { amount: 47_850_000, count: 7 },  djp: { amount: 41_250_000, count: 6 },  matched: 0, total: 7 },
    },
  },
  { id: '2026-04', masa: '04/2026', reconciledAt: '2026-05-21', sides: 'live' },
  {
    id: '2026-03', masa: '03/2026', reconciledAt: '2026-04-15',
    sides: {
      output: { erp: { amount: 512_750_000, count: 14 }, djp: { amount: 512_750_000, count: 14 }, matched: 14, total: 14 },
      input:  { erp: { amount: 128_400_000, count: 11 }, djp: { amount: 128_400_000, count: 11 }, matched: 11, total: 11 },
    },
  },
  {
    id: '2026-02', masa: '02/2026', reconciledAt: '2026-03-18',
    sides: {
      output: { erp: { amount: 448_900_000, count: 12 }, djp: { amount: 448_900_000, count: 12 }, matched: 12, total: 12 },
      input:  { erp: { amount: 96_750_000, count: 9 },   djp: { amount: 96_750_000, count: 9 },   matched: 9,  total: 9 },
    },
  },
  {
    id: '2026-01', masa: '01/2026', reconciledAt: '2026-02-16',
    sides: {
      output: { erp: { amount: 376_200_000, count: 10 }, djp: { amount: 376_200_000, count: 10 }, matched: 10, total: 10 },
      input:  { erp: { amount: 84_300_000, count: 8 },   djp: { amount: 84_300_000, count: 8 },   matched: 8,  total: 8 },
    },
  },
  {
    id: '2025-12', masa: '12/2025', reconciledAt: '2026-01-20',
    sides: {
      output: { erp: { amount: 604_850_000, count: 16 }, djp: { amount: 604_850_000, count: 16 }, matched: 16, total: 16 },
      input:  { erp: { amount: 142_600_000, count: 12 }, djp: { amount: 142_600_000, count: 12 }, matched: 12, total: 12 },
    },
  },
]

export const periodLabel = (masa: string) => `Masa pajak ${masa}`

/** The masa the pair fixtures describe — what the workspace opens on. */
export const activePeriodId = '2026-04'
export const activePeriod = periodLabel('04/2026')

/** Options for the workspace period selector, newest first. */
export const reconPeriods = PERIOD_SEEDS.map(p => periodLabel(p.masa))

/**
 * Label for a period id — `'2026-04'` → `'Masa pajak 04/2026'`. The period index
 * links to the workspace by id (`?masa=2026-04`) because the masa's own display
 * form carries a slash, which would have to be URL-encoded.
 */
export function periodLabelById(id: string): string | undefined {
  const seed = PERIOD_SEEDS.find(p => p.id === id)
  return seed && periodLabel(seed.masa)
}

// ── Derivations ───────────────────────────────────────────────────────────────

export function pairsForSide(side: ReconSide): ReconPair[] {
  return side === 'output' ? outputPairs : inputPairs
}

/** Totals for one column (erp or djp). Null records are skipped, not zeroed. */
export function reconTotals(pairs: ReconPair[], column: 'erp' | 'djp') {
  let dpp = 0, ppn = 0, total = 0, count = 0
  for (const p of pairs) {
    const row = p[column]
    if (!row) continue
    dpp += row.dpp
    ppn += row.ppn
    total += row.total
    count++
  }
  return { dpp, ppn, total, count }
}

export function matchCounts(pairs: ReconPair[]): Record<string, number> {
  return {
    all: pairs.length,
    matched: pairs.filter(p => p.match === 'matched').length,
    suggested: pairs.filter(p => p.match === 'suggested').length,
    discrepancy: pairs.filter(p => p.match === 'discrepancy').length,
    'erp-only': pairs.filter(p => p.match === 'erp-only').length,
    'djp-only': pairs.filter(p => p.match === 'djp-only').length,
  }
}

/** Everything that isn't cleanly matched, across both sides — the report feed. */
export function reconIssues(): ReconIssue[] {
  return [
    ...outputPairs.filter(p => p.match !== 'matched').map(p => ({ ...p, side: 'output' as const })),
    ...inputPairs.filter(p => p.match !== 'matched').map(p => ({ ...p, side: 'input' as const })),
  ]
}

/** Sidebar badge — total pairs needing attention across both sides. */
export function reconIssueCount(): number {
  return reconIssues().length
}

export function partyOf(row: ReconRecord): string {
  return row.customer ?? row.vendor ?? '—'
}

/** Every state that still wants a human — i.e. everything except a clean match. */
export const ATTENTION_STATES: MatchState[] = ['suggested', 'discrepancy', 'erp-only', 'djp-only']

/**
 * Tax exposure of a pair, in rupiah — how much money is actually at stake.
 *
 * For a pair present on both sides that's the size of the disagreement; for an
 * unmatched record it's the whole amount, since the entire value is unaccounted
 * for on one side. Used to sort the work queues so the largest exposure is dealt
 * with first — with a real masa pajak, date order buries the rows that matter.
 */
export function exposureOf(pair: ReconPair): number {
  if (pair.erp && pair.djp) return Math.abs(pair.djp.total - pair.erp.total)
  return (pair.erp ?? pair.djp)?.total ?? 0
}

/**
 * Issues flattened for a paginated table: the sortable columns are hoisted to the
 * top level because useTableState sorts on plain own properties, and the two sides
 * live one level down. `issue` keeps the original pair for the detail drawer.
 */
export interface ReconIssueRow {
  id: string
  issue: ReconIssue
  match: MatchState
  side: ReconSide
  ref: string
  party: string
  npwp: string
  date: string
  dpp: number
  ppn: number
  total: number
  exposure: number
}

export function issueRows(): ReconIssueRow[] {
  return reconIssues().map((issue) => {
    const row = (issue.erp ?? issue.djp)!
    return {
      id: issue.side + issue.id,
      issue,
      match: issue.match,
      side: issue.side,
      ref: row.ref,
      party: partyOf(row),
      npwp: row.npwp,
      date: row.date,
      dpp: row.dpp,
      ppn: row.ppn,
      total: row.total,
      exposure: exposureOf(issue),
    }
  })
}

/**
 * One row of the period index — **one masa, one side**.
 *
 * Keluaran and masukan are reconciled as separate pieces of work (different
 * documents, often different people, closed at different times), so each gets
 * its own row with its own figures and status, told apart by `jenis`. They share
 * one table rather than one row — the shape Klikpajak already ships.
 *
 * Flat on purpose: `useTableState` sorts on plain own properties, so everything
 * sortable sits at the top level, and `reconciledAt` stays ISO so the string
 * sort is chronological.
 */
export interface ReconPeriodRow {
  /** Unique per row — a masa appears twice, once per side. */
  id: string
  /** The masa's own id, for the `?masa=` link into the workspace. */
  periodId: string
  masa: string
  label: string
  year: string
  side: ReconSide
  /** `Jenis faktur` cell — the side in the user's vocabulary. */
  jenis: string
  status: ReconPeriodStatus
  /** ISO, or undefined when the reconciliation has never been run. */
  reconciledAt?: string
  /** Sales invoices (keluaran) or purchase invoices (masukan) — the ERP column. */
  erpAmount: number
  erpCount: number
  /** Faktur pajak — the Coretax column. */
  djpAmount: number
  djpCount: number
  /** How far the two columns disagree. 0 once every pair is matched. */
  selisih: number
  /** Pairs matched of the total in play — behind the status, not a column. */
  matched: number
  total: number
}

/** Status is a function of the counts, so a row can't contradict its own figures. */
function periodStatus(matched: number, total: number): ReconPeriodStatus {
  if (matched === 0) return 'not reconciled'
  return matched >= total ? 'reconciled' : 'partially reconciled'
}

/**
 * The period index feed — every masa × both sides, newest masa first and
 * keluaran before masukan within a masa.
 *
 * The active masa is derived from the pair fixtures rather than restated, so its
 * two rows can never drift from the workspace they link to.
 */
export function reconPeriodRows(): ReconPeriodRow[] {
  const SIDES: ReconSide[] = ['output', 'input']

  return PERIOD_SEEDS.flatMap(seed =>
    SIDES.map((side): ReconPeriodRow => {
      const pairs = pairsForSide(side)
      // reconTotals reports the column sum as `total`; the seeds call it `amount`.
      // Normalise to one shape here so the row build below has no branching.
      const { erp, djp, matched, total } = seed.sides === 'live'
        ? {
            erp: { amount: reconTotals(pairs, 'erp').total, count: reconTotals(pairs, 'erp').count },
            djp: { amount: reconTotals(pairs, 'djp').total, count: reconTotals(pairs, 'djp').count },
            matched: matchCounts(pairs).matched!,
            total: pairs.length,
          }
        : seed.sides[side]

      const erpAmount = erp.amount
      const djpAmount = djp.amount

      return {
        id: `${seed.id}-${side}`,
        periodId: seed.id,
        masa: seed.masa,
        label: periodLabel(seed.masa),
        year: seed.masa.slice(-4),
        side,
        jenis: SIDE_LABELS[side].title,
        status: periodStatus(matched, total),
        reconciledAt: seed.reconciledAt,
        erpAmount,
        erpCount: erp.count,
        djpAmount,
        djpCount: djp.count,
        selisih: Math.abs(erpAmount - djpAmount),
        matched,
        total,
      }
    }),
  )
}

/**
 * Reconciliations that aren't finished — the `Needs attention` tab's scope, and
 * the module's nav badge. Deliberately the same number in both places: a badge
 * on a nav item should mean the same thing as the badge on the tab it lands you
 * near, otherwise the two numbers read as a contradiction.
 */
export function reconUnfinishedCount(): number {
  return reconPeriodRows().filter(r => r.status !== 'reconciled').length
}

/** Masa options for the All filters drawer, newest first. */
export function reconPeriodOptions(): { value: string; label: string }[] {
  return PERIOD_SEEDS.map(p => ({ value: p.id, label: p.masa }))
}

/**
 * Bare grouped amount — no `Rp` prefix. Used only for the dense DPP/PPN/Total
 * triplets where a labelled column already establishes that it's money (see
 * docs/patterns/currency-format.md — those aren't currency displays). Headline
 * figures (KPI tiles, drawer comparison) use formatIDR.
 */
export function formatAmountPlain(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
