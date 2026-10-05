/**
 * Guided tours: the work SIM-1 to SIM-3 do on Next (auto-play).
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * Each function does what the screen's own control does, through the same
 * store calls: Save tax group in the Set tax group drawer (classifyAsset),
 * Generate run and Post journal on the depreciation schedule (generateRun,
 * postRun), the journal date policy in Asset settings, and the record button
 * of the asset's value change drawer (previewValueChange, then
 * recordImpairmentTest or recordEvent). The runner calls each once per run,
 * after View as is applied. tests/asset-tours-autoplay-1.spec.ts replays
 * them after resetAssetStore().
 */
import { generateRun, recordEvent, recordImpairmentTest } from '~/data/assetStore'
import { journalDatePolicy, journalPolicyDay } from '~/data/assetPolicy'
import { blankForm, previewValueChange, type ValueAction, type ValueChangeForm } from '~/data/assetValueChange'
import { classifyAsset } from '~/data/assetTaxbook'
import { postRun } from '~/data/fixedAssetSession'

/** Fill the value change drawer for an asset and read its preview, as the drawer does. */
export function drawerPreview(assetId: string, action: ValueAction, fill: Partial<ValueChangeForm>) {
  const form = { ...blankForm(assetId, action), ...fill }
  const pv = previewValueChange(assetId, form)
  if (pv.error || pv.refusal || !pv.event) throw new Error(`${assetId} ${action}: ${pv.error?.error ?? pv.refusal ?? 'no event'}`)
  return { form, pv }
}

export const SIM3_IMPAIRMENT = { indicator: 'Physical damage', recoverable: '400000000', source: 'Appraisal, PT Penilai Independen' }
export const SIM3_DISPOSAL = { proceeds: '200000000' }
export const SIM3_CORRECTION = { correctedCost: '250000000', reason: 'Supplier invoice is 250 million' }

// ── SIM-1 ───────────────────────────────────────────────────────────────────

/** Set tax group on FA-0077: Tax group 2, tax life 8 years, Save tax group. */
export function sim1SetTaxGroup() {
  const r = classifyAsset('FA-0077', { group: 'Tax group 2', statutoryCode: null, fiscalLifeMonths: 96 })
  if (!r.ok) throw new Error(r.reason)
}

// ── SIM-2 ───────────────────────────────────────────────────────────────────

/** Generate run for September 2026. */
export function sim2GenerateRun() {
  const r = generateRun('2026-09')
  if (!r.ok) throw new Error(r.reason)
}

/** Journal date: a fixed day of the following month, day 5. */
export function sim2JournalDatePolicy() {
  journalDatePolicy.value = 'policy-day'
  journalPolicyDay.value = 5
}

/** Post journal for September 2026 (month 8 of the year, counted from 0). */
export function sim2PostRun() {
  const r = postRun(8)
  if (!r.ok) throw new Error(r.reason)
}

// ── SIM-3 ───────────────────────────────────────────────────────────────────

/** Record test on FA-0042: physical damage, recoverable Rp400.000.000. */
export function sim3RecordImpairment() {
  const { form, pv } = drawerPreview('FA-0042', 'impair', SIM3_IMPAIRMENT)
  const r = recordImpairmentTest({
    assetId: 'FA-0042', indicator: form.indicator, recoverable: Number(form.recoverable),
    basis: form.basis, source: form.source, date: pv.event!.date,
  })
  if (!r.ok) throw new Error(r.reason)
}

/** Record disposal of FA-0047 for proceeds of Rp200.000.000. */
export function sim3Dispose() {
  const { pv } = drawerPreview('FA-0047', 'dispose', SIM3_DISPOSAL)
  const r = recordEvent('FA-0047', pv.event!)
  if (!r.ok) throw new Error(r.reason)
}

/** Record correction on FA-0064: cost Rp245.000.000 corrected to Rp250.000.000. */
export function sim3CorrectCost() {
  const { pv } = drawerPreview('FA-0064', 'correct', SIM3_CORRECTION)
  const r = recordEvent('FA-0064', pv.event!)
  if (!r.ok) throw new Error(r.reason)
}
