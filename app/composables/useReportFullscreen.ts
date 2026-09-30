import { ref } from 'vue'

/**
 * Global flag for a report page requesting a chrome-less full-screen view.
 * When true, the default layout hides the top header + module sidebar so the
 * white stage fills the whole window. Set by the report page (e.g. the Credit
 * Memo report); read by layouts/default.vue. Module-level singleton so the page
 * (below the layout in the tree) can drive the layout above it.
 */
const isReportFullscreen = ref(false)

export function useReportFullscreen() {
  return { isReportFullscreen }
}
