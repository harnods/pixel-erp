// Deterministic "last updated" (timestamp + user) for rows that have no real audit
// field yet — stable per row so the hidden "Last updated" column reads consistently.
const NAMES = ['Rizal Candra', 'Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah', 'Budi Santoso']
const BASE = new Date('2026-06-26T00:00:00').getTime()

function hash(seed: string | number): number {
  if (typeof seed === 'number') return Math.abs(Math.trunc(seed))
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h >>> 0
}

export function lastUpdatedFor(seed: string | number): { at: string; by: string } {
  const s = hash(seed)
  const d = new Date(BASE - (s % 90) * 86_400_000)
  d.setHours(8 + (s % 10), (s * 7) % 60, 0, 0)
  return { at: d.toISOString(), by: NAMES[s % NAMES.length]! }
}
