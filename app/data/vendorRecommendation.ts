/**
 * Preferred-vendor recommendation — the "which vendor should we buy this from?"
 * reasoning shown in the product's Vendors edit drawer (Airene).
 *
 * The vendor list for a product grows on its own: every vendor that has purchased
 * the product is linked (see vendorItems), so a buyer can face a long list and no
 * obvious "best" choice. This scores each linked vendor on the four signals a
 * buyer actually weighs and names one recommendation, with the reasons behind it.
 *
 * It is deliberately a transparent weighted score rather than an opaque model:
 * every input and weight is inspectable, the result is reproducible, and the
 * "why" the UI shows is the same arithmetic that picked the winner — so the
 * recommendation can always be explained and never surprises with a number no one
 * can trace.
 *
 * Signals (per vendor × this product):
 *   • lead-time efficiency — shorter PO→receipt lead time is better;
 *   • purchase price       — lower cost per base stock unit is better;
 *   • order flexibility    — a smaller minimum order (in base units) is better;
 *   • proven history       — more real purchases of THIS product from the vendor.
 */
import { leadTimeSamplesFor } from './leadTimeHistory'
import { vendorNameFor } from './vendorItems'
import { formatIDR } from '~/utils/currency'

/** Relative weight of each signal. Sums to 1; lead time and price lead because a
 *  buyer feels a slow or dear vendor first, then flexibility and track record. */
export const VENDOR_SIGNAL_WEIGHTS = { lead: 0.30, price: 0.30, moq: 0.15, history: 0.25 }

/** One vendor's terms for a product — the raw inputs the score reads. */
export interface VendorCandidate {
  vendorId: string
  leadTimeDays: number
  moq: number
  unitCost: number
  unitsPerPurchaseUnit: number
}

export interface VendorScore {
  vendorId: string
  vendorName: string
  leadTimeDays: number
  /** Cost normalised to one base stock unit, so vendors quoting different UoMs compare fairly. */
  costPerBase: number
  /** Minimum order expressed in base stock units. */
  moqInBase: number
  /** Real PO-backed purchases of this product from this vendor. */
  purchases: number
  /** Each signal normalised to 0–1 (1 = best in this list). */
  leadScore: number
  priceScore: number
  moqScore: number
  historyScore: number
  /** Weighted total, 0–1. */
  score: number
  isRecommended: boolean
  /** Human-readable reasons — populated for the recommended vendor. */
  reasons: string[]
}

export interface VendorRecommendation {
  recommendedVendorId: string | null
  /** Every candidate, best first. */
  scores: VendorScore[]
}

/** 1 = best, 0 = worst. All-equal returns 1 for everyone (a neutral signal). */
function normalise(values: number[], lowerIsBetter: boolean): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 1)
  return values.map((v) => (lowerIsBetter ? (max - v) / (max - min) : (v - min) / (max - min)))
}

/**
 * Score and rank the vendors for a product, and name the preferred one.
 *
 * `candidates` are the CURRENT terms (so the drawer can re-rank live as a buyer
 * edits a lead time or price before saving); purchase history is read from the
 * real PO→receipt record.
 */
export function recommendPreferredVendor(sku: string, candidates: VendorCandidate[]): VendorRecommendation {
  const active = candidates.filter((c) => c.vendorId)
  if (!active.length) return { recommendedVendorId: null, scores: [] }

  const rows = active.map((c) => {
    const units = Math.max(1, c.unitsPerPurchaseUnit || 1)
    return {
      vendorId: c.vendorId,
      leadTimeDays: c.leadTimeDays,
      costPerBase: (c.unitCost || 0) / units,
      moqInBase: (c.moq || 0) * units,
      purchases: leadTimeSamplesFor(c.vendorId, sku).filter((s) => !s.excluded).length,
    }
  })

  const leadN = normalise(rows.map((r) => r.leadTimeDays), true)
  const priceN = normalise(rows.map((r) => r.costPerBase), true)
  const moqN = normalise(rows.map((r) => r.moqInBase), true)
  const histN = normalise(rows.map((r) => r.purchases), false)
  const anyHistory = rows.some((r) => r.purchases > 0)

  const scored = rows.map((r, i) => ({
    ...r,
    leadScore: leadN[i]!,
    priceScore: priceN[i]!,
    moqScore: moqN[i]!,
    historyScore: histN[i]!,
    score:
      leadN[i]! * VENDOR_SIGNAL_WEIGHTS.lead +
      priceN[i]! * VENDOR_SIGNAL_WEIGHTS.price +
      moqN[i]! * VENDOR_SIGNAL_WEIGHTS.moq +
      histN[i]! * VENDOR_SIGNAL_WEIGHTS.history,
  }))

  // Highest score wins; ties break toward the faster, then cheaper, vendor.
  const best = [...scored].sort(
    (a, b) => b.score - a.score || a.leadTimeDays - b.leadTimeDays || a.costPerBase - b.costPerBase,
  )[0]!

  const isLowest = (v: number, all: number[]) => all.every((x) => v <= x) && all.some((x) => x > v)
  const isHighest = (v: number, all: number[]) => all.every((x) => v >= x) && all.some((x) => x < v)

  const scores: VendorScore[] = scored
    .map((s) => {
      const reasons: string[] = []
      if (s.vendorId === best.vendorId) {
        if (isLowest(s.leadTimeDays, rows.map((r) => r.leadTimeDays))) {
          reasons.push(`Fastest lead time — ${s.leadTimeDays} days`)
        }
        if (isLowest(s.costPerBase, rows.map((r) => r.costPerBase))) {
          reasons.push(`Lowest price — ${formatIDR(Math.round(s.costPerBase))} per unit`)
        }
        if (isLowest(s.moqInBase, rows.map((r) => r.moqInBase))) {
          reasons.push(`Smallest minimum order — ${s.moqInBase.toLocaleString('id-ID')} units`)
        }
        if (anyHistory && isHighest(s.purchases, rows.map((r) => r.purchases))) {
          reasons.push(`Most purchase history — ${s.purchases} delivered order${s.purchases === 1 ? '' : 's'}`)
        }
        // Won on the blend rather than any single signal — say so honestly.
        if (!reasons.length) reasons.push('Best overall balance of speed, price and order terms')
      }
      return {
        vendorId: s.vendorId,
        vendorName: vendorNameFor(s.vendorId),
        leadTimeDays: s.leadTimeDays,
        costPerBase: s.costPerBase,
        moqInBase: s.moqInBase,
        purchases: s.purchases,
        leadScore: s.leadScore,
        priceScore: s.priceScore,
        moqScore: s.moqScore,
        historyScore: s.historyScore,
        score: s.score,
        isRecommended: s.vendorId === best.vendorId,
        reasons,
      }
    })
    .sort((a, b) => b.score - a.score)

  return { recommendedVendorId: best.vendorId, scores }
}
