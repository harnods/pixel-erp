import type { LocationQuery } from 'vue-router'

/**
 * Some prototypes keep view state (which tab is open) in the query string —
 * e.g. /barang-masuk?tab=Receiving. The path alone is then identical across
 * tabs, so without this a comment left on one tab shows on all of them.
 *
 * We fold a small allowlist of "view-defining" query params (default: `tab`)
 * into the annotation's route key and stored path, so comments scope to the
 * tab they were made on. Transient params (?saved=1, ?page=2, ?review) are
 * ignored so they don't fragment threads.
 */
let _viewParams = ['tab']

export function setViewParams(params: string[]) {
  _viewParams = params ?? []
}

/** Adds a param to the view allowlist without clobbering existing ones.
 *  Used by useUrlModal so URL-driven overlays auto-scope + auto-reopen. */
export function addViewParam(param: string) {
  if (!_viewParams.includes(param)) _viewParams = [..._viewParams, param]
}

/** e.g. { tab: 'Receiving', saved: '1' } -> '?tab=Receiving' (only allowlisted, sorted). */
export function viewQuerySuffix(query: LocationQuery): string {
  const parts: string[] = []
  for (const key of _viewParams) {
    const raw = query[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value != null && value !== '') parts.push(`${key}=${value}`)
  }
  parts.sort()
  return parts.length ? '?' + parts.join('&') : ''
}
