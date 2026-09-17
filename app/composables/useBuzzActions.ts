/**
 * useBuzzActions — action bus between the shared title bar (owned by
 * `[...slug].vue`) and the Buzz page mounted in the stage. Same pattern as
 * useXpmActions: the title-bar button calls `trigger('generateAsset')`; the page
 * watches `pending` and opens its own drawer. A monotonic nonce makes repeat
 * clicks of the same action distinct so the watcher always re-fires.
 */
import { ref } from 'vue'

let seq = 0
const pending = ref<{ action: string; nonce: number } | null>(null)

export function useBuzzActions() {
  function trigger(action: string) {
    pending.value = { action, nonce: ++seq }
  }
  return { pending, trigger }
}
