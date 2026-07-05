import { computed, type WritableComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { addViewParam } from '../lib/viewKey'

/**
 * Makes a modal/drawer's open state live in the URL (`?overlay=<key>`), which
 * gives review three things for one line of wiring in the host:
 *
 *   1. Comments left inside the overlay scope to it (the param joins the view
 *      key), so they don't leak onto the base page or other overlays.
 *   2. Clicking such a comment in the All comments panel navigates to the URL
 *      that has the param — which flips this ref true — so the overlay
 *      **reopens automatically** and the pin resolves.
 *   3. The browser back button closes the overlay.
 *
 * Usage — replace the local open ref:
 *
 *   // const open = ref(false)
 *   const open = useUrlModal('edit-location')
 *   // then bind as before: v-model:is-open, :is-open + @update:is-open, etc.
 *
 * Pass a distinct key per overlay on the same page. Multiple overlays share
 * one param, so only one is open at a time (the usual case).
 */
export function useUrlModal(
  key: string,
  param = 'overlay',
): WritableComputedRef<boolean> {
  const route = useRoute()
  const router = useRouter()
  addViewParam(param)

  return computed<boolean>({
    get: () => route.query[param] === key,
    set: (open) => {
      const query = { ...route.query }
      if (open) {
        query[param] = key
      } else if (query[param] === key) {
        delete query[param]
      } else {
        return // some other overlay owns the param; don't stomp it
      }
      router.replace({ path: route.path, query })
    },
  })
}
