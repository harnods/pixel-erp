// Pixel/CSS health check via Playwright headless — screenshots + heuristics.
// Usage: node scripts/pixel-verify.mjs "<path1>" "<path2>" ...  (paths on :4322)
// Env: BASE (default http://localhost:4322), OUT (screenshot dir), CLICK (optional
//      comma-selectors to click before shooting, e.g. to open a modal).
// Exits non-zero if any page has a CSS-health red flag.
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

// playwright-core lives in the npx cache (not a repo dep) — resolve it dynamically.
function findPlaywright() {
  if (process.env.PW_CORE && existsSync(process.env.PW_CORE)) return process.env.PW_CORE
  const out = execSync(
    `find ${process.env.HOME}/.npm/_npx -maxdepth 4 -path '*playwright-core/index.js' 2>/dev/null | head -1`,
  ).toString().trim()
  return out
}
const pw = await import(findPlaywright())
const chromium = pw.chromium || pw.default?.chromium

const CACHE = `${process.env.HOME}/Library/Caches/ms-playwright`
function findChrome() {
  // Prefer a full Chromium.app; fall back to the chrome-headless-shell binary.
  const chromiumDirs = readdirSync(CACHE).filter(d => /^chromium-\d+$/.test(d)).sort()
  for (const d of chromiumDirs.reverse()) {
    const app = join(CACHE, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
    if (existsSync(app)) return app
  }
  const shellDirs = readdirSync(CACHE).filter(d => d.startsWith('chromium_headless_shell-')).sort()
  for (const d of shellDirs.reverse()) {
    for (const arch of ['mac-arm64', 'mac-x64', 'mac']) {
      const bin = join(CACHE, d, `chrome-headless-shell-${arch}`, 'chrome-headless-shell')
      if (existsSync(bin)) return bin
    }
  }
  throw new Error('no chromium executable found in ' + CACHE)
}

const BASE = process.env.BASE || 'http://localhost:4322'
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-dirmansuharno/96aab6e4-c9d7-420b-a7c2-e8532e524de0/scratchpad'
const paths = process.argv.slice(2)
if (!paths.length) { console.error('no paths given'); process.exit(2) }

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
let bad = 0

for (const p of paths) {
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  const url = BASE + p
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  } catch (e) {
    console.log(`FAIL  ${p}  (nav: ${e.message})`); bad++; await page.close(); continue
  }
  // let skeleton resolve + fonts settle
  await page.waitForTimeout(1800)

  // CSS-health heuristics inside the page
  const health = await page.evaluate(() => {
    const out = { flags: [], stats: {} }
    const all = Array.from(document.querySelectorAll('body *'))
    // 1) unstyled control fallback: raw <select> for a FILTER (should be zero —
    //    ErpFilterSelect). The ErpTablePage pagination "rows per page" native
    //    <select> is legitimate, so exclude selects inside a pagination container.
    out.stats.rawSelects = Array.from(document.querySelectorAll('select')).filter(s =>
      !s.closest('[class*="pagination" i],[class*="per-page" i],[class*="perpage" i],.etp-footer,[class*="footer" i]'),
    ).length
    // 2) any element wider than viewport (horizontal overflow / broken layout)
    const vw = document.documentElement.clientWidth
    let overflow = 0
    for (const el of all) { const r = el.getBoundingClientRect(); if (r.width > vw + 4 && r.height > 0) overflow++ }
    out.stats.overflowWide = overflow
    // 3) MpButton rendered without pixel classes (CSS not applied) — look for buttons with no bg + no border
    // 4) presence of the main table / stage (page actually rendered content)
    out.stats.tables = document.querySelectorAll('table').length
    out.stats.buttons = document.querySelectorAll('button').length
    // 5) any element with computed font-family not including Inter (theme not applied) — sample body
    const bodyFF = getComputedStyle(document.body).fontFamily || ''
    out.stats.bodyFont = bodyFF.slice(0, 40)
    if (!/inter/i.test(bodyFF)) out.flags.push('body font not Inter (theme/CSS may be unloaded)')
    // 6) totally empty stage
    const stage = document.querySelector('.stage, .detail-page, main')
    if (stage && stage.textContent.trim().length < 5) out.flags.push('stage nearly empty')
    if (out.stats.rawSelects > 0) out.flags.push(`${out.stats.rawSelects} raw <select> (should be ErpFilterSelect)`)
    return out
  })

  const shot = join(OUT, 'pv' + p.replace(/[^\w]+/g, '_') + '.png')
  await page.screenshot({ path: shot, fullPage: false })
  // Ignore offline-headless network noise (external fonts/analytics/Gemini pings)
  // — those are not CSS/render failures.
  const fatal = errors.filter(e => !/favicon|manifest|the server responded with a status of 4|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|net::ERR_/i.test(e))
  const ok = health.flags.length === 0 && fatal.length === 0
  if (!ok) bad++
  console.log(`${ok ? 'OK  ' : 'FLAG'}  ${p}  ${JSON.stringify(health.stats)}` +
    (health.flags.length ? `  flags=${JSON.stringify(health.flags)}` : '') +
    (fatal.length ? `  jsErrors=${JSON.stringify(fatal.slice(0, 3))}` : '') +
    `  -> ${shot}`)
  await page.close()
}

await browser.close()
process.exit(bad ? 1 : 0)
