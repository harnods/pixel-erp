/**
 * Shared helpers for the story-screen capture run.
 *
 * Captures are taken against the PREVIEW build on 4322, not the dev server: it is
 * a real production build, so the CSS never breaks mid-run and a capture is
 * reproducible. Each run starts from a fresh browser context, which means fresh
 * seeds — the figures then tie to the PRD's garment scenario rather than to
 * whatever state a previous session left behind.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

export const BASE = 'http://localhost:4322'
export const OUT = 'docs/story-screens'
/**
 * A PERSISTENT profile, so state survives between phases. The app keeps its
 * records in localStorage, and several stories need a work order that was already
 * transferred, started and delivered against — rebuilding all of that for every
 * phase would be slow and would make a failure halfway through expensive.
 */
const PROFILE = '/tmp/story-screens-profile'

export async function openBrowser() {
  await mkdir(OUT, { recursive: true })
  const context = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  })
  const page = context.pages()[0] ?? await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  // `browser` is returned for symmetry; closing the context is what matters.
  return { browser: context, context, page }
}

/** Navigate and wait for the app to actually render, not merely respond. */
export async function goto(page, path, expect) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  if (expect) await page.getByText(expect, { exact: false }).first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(600)
}

/** Save a capture. Viewport-sized, so the page's own chrome locates it. */
export async function shot(page, name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('  ✓', name)
}

/** Bring a section into view, keeping the sticky title bar in frame. */
export async function scrollTo(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
}

/**
 * Pick from an MpAutocomplete: click the input, then the option by its text.
 * The options render in a portal, so they are looked up at the document root.
 */
export async function pick(page, inputId, optionText) {
  await page.locator(`#${inputId}`).click()
  await page.waitForTimeout(400)
  await page.getByText(optionText, { exact: false }).last().click()
  await page.waitForTimeout(500)
}

/** Set a number/text input that Vue is watching. */
export async function setValue(page, selector, value) {
  await page.locator(selector).fill(String(value))
  await page.waitForTimeout(400)
}

export async function clickText(page, text, opts = {}) {
  await page.getByText(text, { exact: false }).first().click(opts)
  await page.waitForTimeout(600)
}

export async function clickButton(page, name) {
  await page.getByRole('button', { name, exact: false }).first().click()
  await page.waitForTimeout(600)
}
