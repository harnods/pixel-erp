/**
 * Force the SPA HTML shell to always revalidate.
 *
 * nuxt.config `routeRules` declares this too (for Vercel's CDN), but the node/preview
 * render path serves the ssr:false shell WITHOUT applying those header rules, so a
 * browser heuristically caches index.html and then fails to load the renamed, hashed
 * page chunks after the next rebuild/redeploy → blank page until a manual reload.
 * Enforcing `no-cache` on every non-asset (page) request makes the browser revalidate
 * the shell each load, so it always gets chunk hashes that actually exist.
 */
export default defineEventHandler((event) => {
  const path = event.path || ""
  // Build assets are content-hashed and API routes set their own caching → leave them.
  if (path.startsWith("/_nuxt/") || path.startsWith("/api/")) return
  // Any request for a concrete file (favicon.ico, *.svg, *.js, *.css…) → leave it.
  const lastSeg = (path.split("?")[0].split("/").pop()) || ""
  if (lastSeg.includes(".")) return
  // Everything else is a page route rendered as the SPA shell.
  setResponseHeader(event, "cache-control", "no-cache")
})
