/**
 * Formatting helpers for the Projects module. Amounts render as whole rupiah
 * ("Rp835.227.502") — project figures come from RAB/RAP documents in whole
 * rupiah, so decimals would only add noise. A missing budget is never Rp0.
 */

export function rp(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const v = Math.round(n)
  return (v < 0 ? '-Rp' : 'Rp') + Math.abs(v).toLocaleString('id-ID')
}

/** Signed amount for variances / deltas: "+Rp1.500.000" / "-Rp2.000.000" */
export function rpSigned(n: number): string {
  const v = Math.round(n)
  if (!v) return 'Rp0'
  return (v > 0 ? '+' : '') + rp(v)
}

/** Compact for dense cells: "Rp835,2 jt" / "Rp1,45 M" */
export function rpShort(n: number | undefined): string {
  if (n === undefined) return '—'
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e9) return `${sign}Rp${(a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`
  if (a >= 1e6) return `${sign}Rp${(a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return rp(n)
}

export function pct(n: number | undefined, digits = 1): string {
  if (n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: digits }) + '%'
}

export function num(n: number | undefined): string {
  if (n === undefined) return '—'
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

/** Parse a user-typed rupiah amount ("1.500.000", "1500000", "Rp 1,5") → number */
export function parseAmount(s: string | number): number {
  if (typeof s === 'number') return s
  const cleaned = s.replace(/[^\d,-]/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

export function avatarColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 55% 45%)`
}
