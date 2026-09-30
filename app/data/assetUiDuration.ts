/**
 * How the asset screens write a length of time: "1 month", "2 months",
 * "1 year", "2 years 1 month". The engine's own formatter (formatLife) and the
 * preview strings built on it say "1 months" and "1 years"; the screens pass
 * those strings through `plainDurations` so no screen shows the wrong plural.
 * A later step can move the data layer onto `formatMonths` directly.
 */

/** "1 month", "12 months". */
export function monthsLabel(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'month' : 'months'}`
}

/** "1 year", "8 years". */
export function yearsLabel(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'year' : 'years'}`
}

/** A life or term in months, in years where it divides: "4 years", "2 years 1 month", "7 months". */
export function formatMonths(months: number | null): string {
  if (months === null) return 'Indefinite'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (!y) return monthsLabel(m)
  if (!m) return yearsLabel(y)
  return `${yearsLabel(y)} ${monthsLabel(m)}`
}

/** Correct "1 months" / "1 years" (and "-1 months") in a sentence built elsewhere. */
export function plainDurations(text: string | null | undefined): string {
  if (!text) return text ?? ''
  return text.replace(/(^|[^\d.,])([-+]?1) (month|year)s\b/g, '$1$2 $3')
}
