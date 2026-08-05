/**
 * Global test setup (registered via vitest.config.ts → test.setupFiles).
 *
 * happy-dom implements getBoundingClientRect on Element, but NOT on Comment/Text
 * nodes. Pixel's tooltips/popovers position via floating-ui, whose async position
 * update (scheduled a frame after the hover/show) can fire AFTER Vue has unmounted
 * the floating element and replaced it with a comment/text placeholder. floating-ui
 * then calls placeholder.getBoundingClientRect() → "is not a function" → an
 * unhandled rejection that lands on whatever test happens to be running next,
 * flipping a genuinely-passing test red (they pass in isolation; only the full-run
 * ordering surfaces it).
 *
 * Defining a no-op zero rect on Node.prototype makes that late call harmless — it
 * returns zeros and floating-ui resolves quietly. Element keeps its own real
 * implementation (more specific on the prototype chain, so it still wins); this
 * only fills the gap on the node types that lack one. No assertion depends on a
 * comment/text node's box, so nothing else is affected. Skipped entirely in the
 * plain 'node' environment (no DOM globals there).
 */
const g = globalThis as unknown as { Node?: { prototype: Record<string, unknown> } }

if (typeof g.Node !== 'undefined' && typeof g.Node.prototype.getBoundingClientRect !== 'function') {
  g.Node.prototype.getBoundingClientRect = function zeroRect() {
    return {
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
      toJSON() { return {} },
    }
  }
}
