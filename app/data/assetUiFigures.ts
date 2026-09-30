/**
 * Display helpers for the asset record and the value-change drawer that read
 * the store's figures without changing them.
 *
 * - The record's "Cumulative difference" is captioned "Accounting less tax",
 *   so it carries its sign: a tax book above the accounting book is negative.
 * - A partial disposal's gain or loss on each book, as one pair, so the two
 *   figures can sit side by side in one row (FG3-AC11).
 */
import type { FixedAsset } from './fixedAssets'
import type { DetailFigure } from './fixedAssetDetail'
import type { ValuePreview } from './assetValueChange'

export const CUMULATIVE_DIFFERENCE = 'Cumulative difference'

/** Accounting less tax, signed, or null when either book is missing. */
export function signedDifference(a: Pick<FixedAsset, 'bookValueCommercial' | 'bookValueFiscal'>): number | null {
  if (a.bookValueCommercial === null || a.bookValueFiscal === null) return null
  return a.bookValueCommercial - a.bookValueFiscal
}

/** The headline figures with the cumulative difference restored to its sign. */
export function signedFigures(a: FixedAsset, figures: DetailFigure[]): DetailFigure[] {
  return figures.map((f) => (f.label === CUMULATIVE_DIFFERENCE && f.value !== null
    ? { ...f, value: signedDifference(a) }
    : f))
}

export interface GainLossPair { accounting: number | null; tax: number | null }

/** Each book's gain or loss from a disposal preview, or null when neither book has one. */
export function gainLossPair(pv: Pick<ValuePreview, 'books'>): GainLossPair | null {
  const acc = pv.books.find((b) => b.book === 'accounting')?.gainLoss
  const tax = pv.books.find((b) => b.book === 'tax')?.gainLoss
  if (acc === undefined && tax === undefined) return null
  return { accounting: acc ?? null, tax: tax ?? null }
}
