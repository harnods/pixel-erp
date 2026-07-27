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

export type Corner = 'bottom-right' | 'bottom-left'

/**
 * Which screen corner the floating launcher and the review toolbar dock to.
 * Change this if your host app already puts something in the default corner
 * (bottom-right) — e.g. a scenario/environment switcher.
 */
export const cornerPosition = ref<Corner>('bottom-right')

export function setCornerPosition(value: Corner) {
  cornerPosition.value = value
}
