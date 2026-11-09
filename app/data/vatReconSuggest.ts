import { reactive } from 'vue'
import {
  AIRENE_SUGGEST_ENABLED, taxDocSubState, pairLocation, pairsForPeriod, partyOf,
  type ReconPair, type MatchCandidate,
} from '~/data/vatReconciliation'

/**
 * Airene match suggestions (US-014, PM 2026-11-06) — a mock of the AI team's
 * `POST /suggest` (staging), with exactly its response shape.
 *
 * Contract: one source row per call; ≤ 3 candidates; a timeout or error comes
 * back as HTTP 200 `no_candidates` (fail open), so the UI never shows an error.
 *   Tier 1 — every check matches. Only a Tier 1 rank-1 candidate is "Suggested".
 *   Tier 2 — reference evidence, but name / NPWP / an amount differs. Shown with
 *            its differences, never marked as suggested.
 * Group patterns (`1_to_n`, `n_to_1`) are dropped until US-022.
 *
 * Asked only for a "Tax document not found" row with no tax document of its own
 * (sub-state `none`) or a "Transaction not found" row — never for draft /
 * awaiting DJP / rejected rows, the Not reconciled tab, duplicate references or
 * netted returns (isAireneEligible).
 */

export type SuggestPattern = '1_to_1' | '1_to_n' | 'n_to_1'

export interface SuggestChecks {
  reference_evidence_valid: boolean
  identity_match: boolean
  name_match: boolean
  dpp_match: boolean
  dpp_diff: number
  ppn_match: boolean
  ppn_diff: number
  ppnbm_match: boolean
  ppnbm_diff: number
  date_valid: boolean
}

export interface SuggestCandidate {
  pattern: SuggestPattern
  rank: number
  si_references: string[]
  fk_references: string[]
  checks: SuggestChecks
  reason_code: string
  /** Bahasa, from the service. Not rendered — the UI builds its own line (reasonLine). */
  reason: string
}

export interface SuggestResponse {
  suggestion_status: 'candidates_found' | 'no_candidates'
  candidates: SuggestCandidate[]
}

/** Simulated latency, and the delay before a timeout fails open. Tests shorten both. */
export const suggestTimings = { delayMs: 800, timeoutMs: 5000 }

const NO_CANDIDATES: SuggestResponse = { suggestion_status: 'no_candidates', candidates: [] }

const ALL_MATCH: SuggestChecks = {
  reference_evidence_valid: true, identity_match: true, name_match: true,
  dpp_match: true, dpp_diff: 0, ppn_match: true, ppn_diff: 0, ppnbm_match: true, ppnbm_diff: 0,
  date_valid: true,
}

/**
 * Seeded outcomes, keyed by the invoice (`SI…`) on the transaction side. The
 * tax-document side answers symmetrically (reverseSeeds). `faktur` names the
 * seed tax document's pair id (vatReconciliation.ts › AIRENE_SEED_FAKTURS).
 */
interface SeedCandidate { faktur: string; rank: number; checks: Partial<SuggestChecks>; reason_code: string; reason: string; pattern?: SuggestPattern }
const SEEDS: Record<string, SeedCandidate[]> = {
  // Tier 1 — reference with extra text. The group candidate is dropped (US-022).
  SI103: [
    { faktur: '2027-03-output-f1', rank: 1, checks: {}, reason_code: 'REFERENCE_EXTRA_TEXT',
      reason: 'Referensi faktur memuat nomor faktur penjualan dengan teks tambahan.' },
    { faktur: '2027-03-output-f5', rank: 2, pattern: '1_to_n', checks: {}, reason_code: 'GROUP_1_TO_N_MATCH',
      reason: 'Satu faktur penjualan cocok dengan beberapa faktur pajak.' },
  ],
  // Tier 1 + Tier 2 — the second carries the same reference but another name.
  // Not a separator-only difference: the engine normalizes separators and case
  // (PRD), so such a pair auto-matches and never reaches Airene (PM, 2026-11-09).
  SI013: [
    { faktur: '2027-03-output-f2', rank: 1, checks: {}, reason_code: 'REFERENCE_PREFIX_ORDER',
      reason: 'Referensi memuat nomor yang sama dengan urutan atau awalan berbeda.' },
    { faktur: '2027-03-output-f3', rank: 2, checks: { name_match: false }, reason_code: 'EXACT_REFERENCE_MATCH',
      reason: 'Referensi sama persis, tetapi nama pembeli berbeda.' },
  ],
  // Tier 2 only — reference typo, DPP and PPN higher on the tax document.
  SI002: [
    { faktur: '2027-03-output-f4', rank: 1, checks: { dpp_match: false, dpp_diff: 500_000, ppn_match: false, ppn_diff: 55_000 },
      reason_code: 'REFERENCE_TYPO', reason: 'Referensi berbeda satu karakter; DPP dan PPN berbeda.' },
  ],
}
/** Airene finds nothing for this one. */
const NO_CANDIDATE_SOURCES = new Set(['2027-03-output-f5'])
/** This one times out — fails open to `no_candidates` after suggestTimings.timeoutMs. */
const TIMEOUT_SOURCES = new Set(['2027-03-output-f6'])

function sourceKey(pair: ReconPair): string {
  return pair.erp?.salesInvoiceId ?? pair.id
}

/** Resolve a seed to the refs of the two documents it pairs. */
function toCandidate(source: ReconPair, seed: SeedCandidate, counterpart: ReconPair | undefined, reverse: boolean): SuggestCandidate | null {
  const { periodId, side } = pairLocation(source)
  const faktur = pairsForPeriod(periodId, side).find(p => p.id === seed.faktur)?.djp
  const invoice = reverse ? counterpart?.erp : source.erp
  if (!faktur || !invoice) return null
  return {
    pattern: seed.pattern ?? '1_to_1',
    rank: seed.rank,
    si_references: [invoice.ref],
    fk_references: [faktur.ref],
    checks: { ...ALL_MATCH, ...seed.checks },
    reason_code: seed.reason_code,
    reason: seed.reason,
  }
}

function responseFor(pair: ReconPair): SuggestResponse {
  const { periodId, side } = pairLocation(pair)
  const key = sourceKey(pair)
  const forward = SEEDS[key]
  let candidates: SuggestCandidate[] = []
  if (forward) {
    candidates = forward.map(c => toCandidate(pair, c, undefined, false)).filter((c): c is SuggestCandidate => !!c)
  } else if (!NO_CANDIDATE_SOURCES.has(key)) {
    // Tax-document side: answer with the invoice whose seeds name this row.
    for (const [si, seeds] of Object.entries(SEEDS)) {
      const seed = seeds.find(c => c.faktur === pair.id && (c.pattern ?? '1_to_1') === '1_to_1')
      if (!seed) continue
      const invoiceRow = pairsForPeriod(periodId, side).find(p => p.erp?.salesInvoiceId === si)
      const c = toCandidate(pair, { ...seed, rank: 1 }, invoiceRow, true)
      if (c) candidates.push(c)
    }
  }
  return candidates.length ? { suggestion_status: 'candidates_found', candidates: candidates.slice(0, 3) } : NO_CANDIDATES
}

/** `POST /suggest` — simulated. Never rejects: timeouts and errors fail open. */
export function suggestFor(pair: ReconPair): Promise<SuggestResponse> {
  const key = sourceKey(pair)
  if (TIMEOUT_SOURCES.has(key)) {
    return new Promise(resolve => setTimeout(() => resolve(NO_CANDIDATES), suggestTimings.timeoutMs))
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      try { resolve(responseFor(pair)) } catch { resolve(NO_CANDIDATES) }
    }, suggestTimings.delayMs)
  })
}

// ── Eligibility ──────────────────────────────────────────────────────────────
export function isAireneEligible(pair: ReconPair): boolean {
  if (!AIRENE_SUGGEST_ENABLED) return false
  if (pair.match === 'no-match-in-erp') return !!pair.djp && pair.djp.approved !== false
  return taxDocSubState(pair) === 'none'
}

// ── Session cache: one call per row ──────────────────────────────────────────
export interface SuggestState { status: 'loading' | 'done'; response: SuggestResponse | null }
const cache = reactive(new Map<string, SuggestState>())

export function suggestionState(pair: ReconPair): SuggestState | undefined {
  return cache.get(pair.id)
}

/** Ask once per row per session; later calls reuse the answer (or the call in flight). */
export function requestSuggestions(pair: ReconPair): void {
  if (!isAireneEligible(pair) || cache.has(pair.id)) return
  cache.set(pair.id, { status: 'loading', response: null })
  void suggestFor(pair).then((response) => { cache.set(pair.id, { status: 'done', response }) })
}

/** Test hook — forget every cached answer. */
export function clearSuggestionCache(): void { cache.clear() }

// ── What the UI renders ──────────────────────────────────────────────────────
export type SuggestTier = 1 | 2

export interface ShownSuggestion {
  candidate: SuggestCandidate
  tier: SuggestTier
  /** Rank-1 Tier 1 only. */
  suggested: boolean
  /** The counterpart as a MatchCandidate — what confirmManualMatch takes. */
  match: MatchCandidate
}

export function tierOf(c: SuggestCandidate): SuggestTier {
  const k = c.checks
  return k.reference_evidence_valid && k.identity_match && k.name_match && k.dpp_match
    && k.ppn_match && k.ppnbm_match && k.date_valid ? 1 : 2
}

/**
 * The candidates to show for a row: 1:1 only, rank order, ≤ 3, each resolved to
 * an open counterpart row in the same masa (one already matched elsewhere drops out).
 */
export function shownSuggestions(pair: ReconPair, response: SuggestResponse | null): ShownSuggestion[] {
  if (!response || response.suggestion_status !== 'candidates_found') return []
  const { periodId, side } = pairLocation(pair)
  const pool = pairsForPeriod(periodId, side)
  const lookingForTaxDoc = !!pair.erp
  return response.candidates
    .filter(c => c.pattern === '1_to_1')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .flatMap((c): ShownSuggestion[] => {
      const other = lookingForTaxDoc
        ? pool.find(p => p.match === 'no-match-in-erp' && !!p.djp && c.fk_references.includes(p.djp.ref))
        : pool.find(p => p.match === 'not-in-coretax' && !!p.erp && c.si_references.includes(p.erp.ref))
      const rec = lookingForTaxDoc ? other?.djp : other?.erp
      if (!other || !rec) return []
      const tier = tierOf(c)
      return [{
        candidate: c, tier, suggested: tier === 1 && c.rank === 1,
        match: {
          ref: rec.ref, date: rec.date, party: partyOf(rec), dpp: rec.dpp, ppn: rec.ppn, total: rec.total,
          confidence: tier === 1 ? 1 : 0.6, why: reasonLine(c).en, pairId: other.id,
        },
      }]
    })
}

/** Reference part of the one-line reason, by reason_code. Unknown codes read generically. */
const REFERENCE_LINES: Record<string, string> = {
  EXACT_REFERENCE_MATCH: 'The reference matches exactly.',
  // Kept for the mapper only — the engine normalizes separators, so no seed uses it.
  REFERENCE_SEPARATOR_DIFF: 'The reference matches apart from its separators.',
  REFERENCE_PREFIX_ORDER: 'The reference has the same number in a different order or prefix.',
  REFERENCE_EXTRA_TEXT: 'The reference matches, with extra text around it.',
  REFERENCE_TYPO: 'The reference is one character off.',
}
const GENERIC_REFERENCE_LINE = 'The reference points to this document.'
const ALL_MATCH_LINE = 'Name and amounts match.'

/**
 * The one-line reason, built locally from reason_code + checks (the service's
 * `reason` is Bahasa and is never shown in the EN UI). Returned as translation
 * keys so ID gets its own sentences; `en` is the joined English, kept on the match.
 */
export function reasonLine(c: SuggestCandidate): { keys: string[]; en: string } {
  const keys = [REFERENCE_LINES[c.reason_code] ?? GENERIC_REFERENCE_LINE]
  if (tierOf(c) === 1) keys.push(ALL_MATCH_LINE)
  return { keys, en: keys.join(' ') }
}

/** Tier 2 differences, plainly: "Name differs", "DPP differs Rp…". `amount` is unsigned. */
export function differencesOf(c: SuggestCandidate): { label: string; amount?: number }[] {
  const k = c.checks
  const out: { label: string; amount?: number }[] = []
  if (!k.name_match) out.push({ label: 'Name differs' })
  if (!k.identity_match) out.push({ label: 'NPWP differs' })
  if (!k.dpp_match) out.push({ label: 'DPP differs', amount: Math.abs(k.dpp_diff) })
  if (!k.ppn_match) out.push({ label: 'PPN differs', amount: Math.abs(k.ppn_diff) })
  if (!k.ppnbm_match) out.push({ label: 'PPnBM differs', amount: Math.abs(k.ppnbm_diff) })
  if (!k.date_valid) out.push({ label: 'Date out of order' })
  return out
}
