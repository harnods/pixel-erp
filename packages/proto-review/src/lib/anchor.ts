/**
 * Element anchoring — pins attach to the DOM element under the cursor instead
 * of a bare viewport coordinate, so they scroll with the content and survive
 * layout shifts (pages whose data length differs, sections that move, etc.).
 *
 * On create/drag we record a CSS selector for the element plus the click's
 * offset within it (as % of the element's box). On render we resolve the
 * selector and place the pin relative to the element's current rect. If the
 * selector no longer matches (layout changed), rendering falls back to the
 * viewport-percentage coordinates that are always stored alongside.
 */

export interface ElementAnchor {
  selector: string
  xPct: number // horizontal offset within the element, 0–100
  yPct: number // vertical offset within the element, 0–100
}

/** Our own UI must never become an anchor — pins would move with the overlay. */
const OWN_UI = '.pr-overlay, .pr-toolbar, .pr-panel, .pr-launcher, .pr-popover, .pr-new-form, .pr-pin'

// App frameworks (Nuxt/Vite roots, layout wrappers) nest deep before the
// nearest #id ancestor — the cap only guards against pathological trees, so
// keep it well above a realistic component depth. The round-trip check in
// anchorFromPoint is what actually protects against ambiguous selectors.
const MAX_SELECTOR_DEPTH = 24

/** Builds a selector for `el` that uniquely matches it: nearest #id shortcut,
 *  else a body-rooted tag:nth-of-type path. Returns null for html/body. */
function buildSelector(el: Element): string | null {
  if (el === document.body || el === document.documentElement) return null
  if (el.id) return `#${CSS.escape(el.id)}`

  const parts: string[] = []
  let cur: Element | null = el
  let depth = 0

  while (cur && cur !== document.body && depth < MAX_SELECTOR_DEPTH) {
    if (cur.id) {
      parts.unshift(`#${CSS.escape(cur.id)}`)
      return parts.join(' > ')
    }
    const parent: Element | null = cur.parentElement
    if (!parent) return null
    const tag = cur.tagName.toLowerCase()
    const sameTag = Array.from(parent.children).filter(c => c.tagName === cur!.tagName)
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(cur) + 1})` : tag)
    cur = parent
    depth++
  }

  if (cur !== document.body) return null // path didn't terminate at a stable root
  return 'body > ' + parts.join(' > ')
}

/** Finds the app element under a viewport point (skipping proto-review UI)
 *  and returns an anchor for it, or null if only our UI / body is there. */
export function anchorFromPoint(clientX: number, clientY: number): ElementAnchor | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  const target = stack.find(el => !el.closest(OWN_UI) && el !== document.body && el !== document.documentElement)
  if (!target) return null

  const selector = buildSelector(target)
  if (!selector) return null

  // The selector must round-trip to the same element — nth-of-type paths can
  // be ambiguous in edge cases; if it resolves elsewhere, don't trust it.
  let resolved: Element | null = null
  try {
    resolved = document.querySelector(selector)
  } catch {
    return null
  }
  if (resolved !== target) return null

  const rect = target.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null

  return {
    selector,
    xPct: ((clientX - rect.left) / rect.width) * 100,
    yPct: ((clientY - rect.top) / rect.height) * 100,
  }
}

/** Resolves an anchor back to a viewport point, or null if the element is gone. */
export function pointFromAnchor(anchor: ElementAnchor): { x: number; y: number } | null {
  let el: Element | null = null
  try {
    el = document.querySelector(anchor.selector)
  } catch {
    return null
  }
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return {
    x: rect.left + (anchor.xPct / 100) * rect.width,
    y: rect.top + (anchor.yPct / 100) * rect.height,
  }
}
