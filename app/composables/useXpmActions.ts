/**
 * useXpmActions — a tiny action bus between the shared title bar (owned by
 * `[...slug].vue`) and the XPM page mounted in the stage.
 *
 * The title-bar primary/secondary buttons live in the router shell, a sibling of
 * the page component, so they can't open a drawer that lives inside the page
 * directly. The title bar calls `trigger('newCard')`; the page watches `pending`
 * and opens its own drawer when its action fires. A monotonic nonce makes repeat
 * clicks of the same action distinct so the watcher always re-fires.
 */
import { ref } from 'vue'

let seq = 0
const pending = ref<{ action: string; nonce: number } | null>(null)

export function useXpmActions() {
  function trigger(action: string) {
    pending.value = { action, nonce: ++seq }
  }
  return { pending, trigger }
}
