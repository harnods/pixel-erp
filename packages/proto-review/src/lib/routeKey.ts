/**
 * Normalizes a path into a stable "page shape" key: static segments are kept
 * as-is, ID-like dynamic segments (contain a digit, or look like a UUID) are
 * collapsed to ':id'. This groups annotations across detail-page instances
 * (e.g. /warehouses/wh-001 and /warehouses/wh-002 share the same key) while
 * keeping genuinely different pages (e.g. /warehouses vs /products) distinct.
 */
export function normalizeRouteKey(path: string): string {
  const clean = path.split('?')[0].split('#')[0]
  const segments = clean.split('/').filter(Boolean)

  const normalized = segments.map(seg => {
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)
    const hasDigit = /\d/.test(seg)
    if (looksLikeUuid || hasDigit) return ':id'
    return seg
  })

  return '/' + normalized.join('/')
}
