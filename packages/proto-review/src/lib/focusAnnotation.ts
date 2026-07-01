import { ref } from 'vue'

/**
 * Set by the "All comments" panel right before navigating to a comment's
 * page. ProtoReviewOverlay watches this and, once that page's annotations
 * load, opens the matching pin's popover automatically.
 */
export const focusAnnotationId = ref<string | null>(null)
