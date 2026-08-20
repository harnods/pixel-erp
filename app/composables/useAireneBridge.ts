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
// Suggested follow-up prompts tailored to the opened context (e.g. referencing
// the actual overdue customer or late employee in a task result).
const pendingSuggestions = ref<string[]>([])
// When true, the next send starts a fresh chat first (e.g. a prompt from search).
const pendingFresh = ref(false)
// Open a specific persisted chat session by id (e.g. a "recent chat" from search).
const openSessionSignal = ref(0)
const pendingSessionId = ref('')

export function useAireneBridge() {
  return {
    // Signals watched by [...slug].vue
    toggleSignal,
    sendSignal,
    pendingText,
    pendingFresh,
    openContextSignal,
    pendingGround,
    pendingLabel,
    pendingSuggestions,
    openSessionSignal,
    pendingSessionId,
    // Actions any component can call
    requestToggle() { toggleSignal.value++ },
    /** Open the chat and send a prompt. `fresh` starts a new chat first. */
    requestSend(text: string, fresh = false) {
      const t = (text ?? '').trim()
      if (!t) return
      pendingText.value = t
      pendingFresh.value = fresh
      sendSignal.value++
    },
    /** Open the chat with a grounding context but no message sent yet. */
    openWithContext(ground: string, label: string, suggestions: string[] = []) {
      pendingGround.value = ground
      pendingLabel.value = label
      pendingSuggestions.value = suggestions
      openContextSignal.value++
    },
    /** Open a previously-saved chat session by id (from the mini-DB history). */
    openSession(id: string) {
      pendingSessionId.value = id
      openSessionSignal.value++
    },
  }
}
