import { ref } from 'vue'

/**
 * Whether to render the package's own floating "Review" button when review
 * mode is off. Projects that wire their own toggle (e.g. into an existing
 * user menu, via useReviewMode().toggleReviewMode) can turn this off so
 * there's no redundant floating button competing with their UI.
 */
export const showLauncher = ref(true)

export function setShowLauncher(value: boolean) {
  showLauncher.value = value
}
