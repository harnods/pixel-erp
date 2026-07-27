const PALETTE = [
  '#f5a623', // amber
  '#e35d6a', // red
  '#8e5cf7', // purple
  '#00b894', // green
  '#0984e3', // blue
  '#e17055', // terracotta
  '#00b8b0', // teal
  '#d63384', // pink
  '#6ab04c', // lime
  '#4834d4', // indigo
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Deterministic color per author name — same name always maps to the same color. */
export function getAuthorColor(name: string): string {
  const key = name.trim().toLowerCase() || 'anonymous'
  return PALETTE[hashString(key) % PALETTE.length]
}
