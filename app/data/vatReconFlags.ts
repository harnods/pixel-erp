/**
 * VAT reconciliation — feature switches.
 *
 * VAT_IN_ENABLED — VAT In (purchase invoice × faktur masukan, PRD OD-008) is a
 * non-goal for the VAT Out reconciliation MVP (OD-001). Its code stays built
 * (input-side fixtures i-01…i-08, the per-period input seeds, the PPN Masukan
 * account picker, the Invoice type column/filter, the /faktur-masukan workspace)
 * so OD-008 can bring it back, but while this is `false`:
 *
 *   - Setup offers no "VAT Out & VAT In" choice and no PPN Masukan accounts card.
 *   - A saved or seeded scope of `both` (localStorage included) reads as VAT Out,
 *     so existing browser state can't bring the input side back.
 *   - Every list that reads `reconSides()` (period index, issue queue, nav badge,
 *     finalize guard) has the output side only, so there is no Invoice type
 *     column or filter and no input rows; /faktur-masukan lands on the output
 *     workspace.
 *
 * Flip to `true` to restore all of it. It lives in its own module so a spec can
 * `vi.mock('~/data/vatReconFlags', () => ({ VAT_IN_ENABLED: true }))` and keep
 * exercising the OD-008 path.
 */
export const VAT_IN_ENABLED: boolean = false

/**
 * AIRENE_SUGGEST_ENABLED — Airene match suggestions (US-014, PM 2026-11-06).
 * On: expanding a "Tax document not found" (no tax document yet) or "Transaction
 * not found" row asks Airene (`POST /suggest`, mocked in vatReconSuggest.ts) for
 * up to three counterparts, and those rows no longer show the old NPWP/amount
 * heuristic's "Match found". Off: no Airene anywhere — today's behaviour.
 * Replaces AIRENE_REVIEW_ENABLED; the page-level "Review with Airene" button is gone.
 */
export const AIRENE_SUGGEST_ENABLED: boolean = true
