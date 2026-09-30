/**
 * Self-heal "Failed to fetch dynamically imported module".
 *
 * This app is an SPA (ssr:false) with code-split page chunks. After a rebuild or a
 * Vercel redeploy the `_nuxt/*` chunk hashes change, but an already-open — or
 * HTTP-cached — tab still holds the OLD index.html, which references chunk hashes
 * that no longer exist. The next lazy page import then 404/500s
 * ("Failed to fetch dynamically imported module …"), Vue renders nothing, and the
 * page shows blank until the user manually reloads (a fresh index.html pulls the
 * matching chunks). See app/pages/[...slug].vue — every page is an async import.
 *
 * Fix: catch the chunk-load failure and reload ONCE to fetch a fresh index + chunks,
 * with a short cooldown so a genuinely-broken deploy can't get stuck reloading.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const COOLDOWN_MS = 10_000
  const KEY = 'chunk-reload-at'

  function reloadOnce() {
    let last = 0
    try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch { /* storage blocked */ }
    const now = Date.now()
    // Already reloaded moments ago → don't loop (the new index is still broken, or
    // the failure is unrelated to stale chunks). Let the blank surface instead.
    if (now - last < COOLDOWN_MS) return
    try { sessionStorage.setItem(KEY, String(now)) } catch { /* storage blocked */ }
    reloadNuxtApp({ persistState: false })
  }

  // Nuxt's own signal for a failed route/page chunk.
  nuxtApp.hook('app:chunkError', () => reloadOnce())
  // Vite fires this on the window when a modulepreload/dynamic import fails.
  window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); reloadOnce() })
})
