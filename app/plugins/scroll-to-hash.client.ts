// Scrolls to the #hash target (e.g. a DemoSection anchor link) after route
// navigation. Vue Router's built-in scrollBehavior mis-measures the target
// position on these pages, so we scroll to the live element directly instead.
export default defineNuxtPlugin((nuxtApp) => {
  function scrollToHash(hash: string) {
    if (!hash) return
    let attempts = 0
    const tryScroll = () => {
      const el = document.querySelector(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (attempts++ < 10) {
        setTimeout(tryScroll, 100)
      }
    }
    setTimeout(tryScroll, 150)
  }

  nuxtApp.hook('page:finish', () => {
    scrollToHash(window.location.hash)
  })
})
