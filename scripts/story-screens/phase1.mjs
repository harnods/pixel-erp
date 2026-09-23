/**
 * Stories 1-3: the work order creation form.
 *
 * All three read off the same unsaved form, so they share one page load and only
 * the configuration changes between captures.
 */
import { openBrowser, goto, shot, scrollTo, pick } from './lib.mjs'

const { browser, page } = await openBrowser()

async function newSubconForm() {
  await goto(page, '/work-orders/new', 'New work order')
  await pick(page, 'wo-category', 'Subcontracting')
  await pick(page, 'wo-bom', 'Kemeja Formal Pria')
  await page.waitForTimeout(800)
}

try {
  await newSubconForm()

  // ── Story 1 — the category swap ──
  // Subcon cost stands where Production cost + Routing would be.
  await scrollTo(page, page.getByRole('heading', { name: 'Subcon cost' }).first())
  await shot(page, 'story-01-a-subcon-cost-replaces-production')

  // ── Story 2 — the configuration block ──
  await scrollTo(page, page.getByText('Subcontracting', { exact: true }).first())
  await shot(page, 'story-02-a-config-block')

  // ── Story 3 — the plan preview, per method ──
  for (const [method, slug] of [
    ['By the company itself · Resupply', 'resupply'],
    ['By the subcon vendor · Basic', 'basic'],
    ['By a 3rd-party vendor · Dropship', 'dropship'],
  ]) {
    await pick(page, 'wo-subcon-method', method)
    await scrollTo(page, page.getByText('Documents this work order will raise').first())
    await shot(page, `story-03-${slug}-plan-preview`)
  }
} finally {
  await browser.close()
}
