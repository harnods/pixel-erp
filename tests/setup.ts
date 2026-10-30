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
/**
 * `useLocale` is a Nuxt auto-imported composable (app/composables/useLocale.ts).
 * Vitest has no auto-import layer, so components that call the bare `useLocale()`
 * would throw "useLocale is not defined". Provide a minimal identity stub on the
 * global scope: default locale 'en' and an identity `t`, which is exactly the
 * English text every spec asserts against. Reactive `locale` via a plain ref so
 * switching is harmless if any component reads it.
 */
import { computed, reactive, ref, shallowRef, toRef, toRefs, readonly, watch, watchEffect, nextTick, onMounted, onUnmounted, onBeforeMount, onBeforeUnmount, provide, inject, useSlots, useAttrs, getCurrentInstance } from 'vue'

/**
 * Nuxt auto-imports Vue's reactivity API into every SFC, so components written
 * against it use bare `reactive` / `watch` / `computed` with no import line.
 * Vitest has no auto-import layer, so mounting one of those components throws
 * "reactive is not defined" before a single assertion runs. Put the real Vue
 * functions on the global scope — a component that DOES import from 'vue'
 * still binds to its own import, so this only fills the gap.
 */
Object.assign(globalThis, {
  computed, reactive, ref, shallowRef, toRef, toRefs, readonly,
  watch, watchEffect, nextTick,
  onMounted, onUnmounted, onBeforeMount, onBeforeUnmount,
  provide, inject, useSlots, useAttrs, getCurrentInstance,
})

const _locale = ref<'en' | 'id'>('en')
;(globalThis as unknown as { useLocale: () => unknown }).useLocale = () => ({
  locale: _locale,
  setLocale: (next: 'en' | 'id') => { _locale.value = next },
  t: (en: string) => en,
})

/**
 * `useDimensionsActivation` is auto-imported the same way (app/composables/
 * useDimensionsActivation.ts) and is now read by every transaction form and
 * report that gates a Dimensions column on it — so any spec that mounts one of
 * those pages would throw "useDimensionsActivation is not defined". Same shape
 * as the real composable, including its module-level singleton ref, so two
 * components mounted in one spec agree on the flag; it starts OFF, which is the
 * fresh-tenant state (nothing persisted) every spec assumes.
 */
const _dimensionsActivated = ref(false)
;(globalThis as unknown as { useDimensionsActivation: () => unknown }).useDimensionsActivation = () => ({
  dimensionsActivated: _dimensionsActivated,
  activateDimensions: () => { _dimensionsActivated.value = true },
})

/**
 * happy-dom provides a working `localStorage` on its own Window, but vitest 1.6's
 * happy-dom environment copies window's OWN enumerable keys onto the test global,
 * and happy-dom 20 exposes Storage through a prototype getter — so neither
 * `globalThis.localStorage` nor `window.localStorage` is defined here. The repo
 * has no lockfile, so `happy-dom: ^20.10.6` resolves to whatever is newest
 * (20.11.1 today) against vitest 1.6.1, and every spec that touches storage dies
 * on `localStorage.clear()` before its first assertion.
 *
 * Fill the gap with a spec-faithful in-memory Storage. The app only ever stores
 * JSON strings through loadSnapshot/saveSnapshot, so this behaves exactly as the
 * browser does for the data under test; it is the same kind of environment patch
 * as the getBoundingClientRect fill below, not a stub of app behaviour.
 */
function createStorage(): Storage {
  let map = new Map<string, string>()
  return {
    get length() { return map.size },
    key(i: number) { return [...map.keys()][i] ?? null },
    getItem(k: string) { return map.has(String(k)) ? map.get(String(k))! : null },
    setItem(k: string, v: string) { map.set(String(k), String(v)) },
    removeItem(k: string) { map.delete(String(k)) },
    clear() { map = new Map() },
  } as Storage
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[key] === 'undefined') {
    const store = createStorage()
    Object.defineProperty(globalThis, key, { value: store, configurable: true, writable: true })
    if (typeof (globalThis as { window?: object }).window !== 'undefined') {
      Object.defineProperty((globalThis as unknown as { window: object }).window, key, { value: store, configurable: true, writable: true })
    }
  }
}

const g = globalThis as unknown as { Node?: { prototype: Record<string, unknown> } }

if (typeof g.Node !== 'undefined' && typeof g.Node.prototype.getBoundingClientRect !== 'function') {
  g.Node.prototype.getBoundingClientRect = function zeroRect() {
    return {
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
      toJSON() { return {} },
    }
  }
}
