/**
 * Guided tours: the on/off switch.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * The switch is the one thing in the asset prototype that survives a reload
 * (localStorage). Everything else is session memory and resets to the sample
 * data. It defaults to off, so the free experience is what an engineer sees
 * unless they ask for the guided one.
 */
import { ref } from 'vue'

/** The key the handover's tours.json names as its persistence key. */
export const GUIDED_TOURS_KEY = 'assetmod.tours.v2'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function read(): boolean {
  return storage()?.getItem(GUIDED_TOURS_KEY) === 'on'
}

export const guidedToursOn = ref<boolean>(read())

export function setGuidedTours(on: boolean) {
  guidedToursOn.value = on
  const s = storage()
  if (!s) return
  if (on) s.setItem(GUIDED_TOURS_KEY, 'on')
  else s.removeItem(GUIDED_TOURS_KEY)
}
