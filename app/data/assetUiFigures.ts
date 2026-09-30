/**
 * Display helpers for the asset record and the value-change drawer that read
 * the store's figures without changing them.
 *
 * - A partial disposal's gain or loss on each book, as one pair, so the two
 *   figures can sit side by side in one row (FG3-AC11).
 */
import type { ValuePreview } from './assetValueChange'

export interface GainLossPair { accounting: number | null; tax: number | null }

/** Each book's gain or loss from a disposal preview, or null when neither book has one. */
export function gainLossPair(pv: Pick<ValuePreview, 'books'>): GainLossPair | null {
  const acc = pv.books.find((b) => b.book === 'accounting')?.gainLoss
  const tax = pv.books.find((b) => b.book === 'tax')?.gainLoss
  if (acc === undefined && tax === undefined) return null
  return { accounting: acc ?? null, tax: tax ?? null }
}
