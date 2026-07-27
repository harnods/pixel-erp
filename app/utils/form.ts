import { nextTick } from 'vue'

/**
 * After setting validation error state, scrolls the first invalid field into view.
 * Waits one tick so Pixel's aria-invalid attribute has been applied to the DOM.
 */
export function scrollToFirstError(): void {
  nextTick(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}
