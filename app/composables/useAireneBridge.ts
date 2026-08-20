import { ref } from 'vue'

/**
 * Global bridge to the Airene chat panel.
 *
 * The panel UI + its open/send logic live in `pages/[...slug].vue` (inside the
 * routed page). Components that sit ABOVE the page in the tree — e.g. the header
 * search in `layouts/default.vue` — can't reach it via provide/inject (that only
 * flows downward). This module-level singleton lets any component request an
 * action; `[...slug].vue` watches the signals and performs it.
 */
const toggleSignal = ref(0)
const sendSignal = ref(0)
const pendingText = ref('')
// Open the panel grounded on a context (e.g. a Cowork task result): `ground` is
// fed to the model, `label` is the visible context chip.
const openContextSignal = ref(0)
const pendingGround = ref('')
const pendingLabel = ref('')

export function useAireneBridge() {
  return {
    // Signals watched by [...slug].vue
    toggleSignal,
    sendSignal,
    pendingText,
    openContextSignal,
    pendingGround,
    pendingLabel,
    // Actions any component can call
    requestToggle() { toggleSignal.value++ },
    requestSend(text: string) {
      const t = (text ?? '').trim()
      if (!t) return
      pendingText.value = t
      sendSignal.value++
    },
    /** Open the chat with a grounding context but no message sent yet. */
    openWithContext(ground: string, label: string) {
      pendingGround.value = ground
      pendingLabel.value = label
      openContextSignal.value++
    },
  }
}
