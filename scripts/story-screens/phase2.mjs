/**
 * Creates the demo work order and captures the states that exist BEFORE any
 * supply document — stories 1b and 4.
 *
 * The order it creates is the one every later phase walks, so this must run first.
 */
import { openBrowser, goto, shot, scrollTo, pick, clickButton } from './lib.mjs'
import { writeFile } from 'node:fs/promises'

const { browser, page } = await openBrowser()

try {
  await goto(page, '/work-orders/new', 'New work order')
  await pick(page, 'wo-category', 'Subcontracting')
  await pick(page, 'wo-bom', 'Kemeja Formal Pria')
  await pick(page, 'wo-type', 'Assembly')
  await page.locator('#wo-subcon-promised').fill('2026-10-30')

  // The plan-date range is a custom two-click calendar, not a fillable input.
  await page.locator('#wo-plan').click()
  await page.waitForTimeout(600)
  const days = page.locator('.mx-calendar-content td:not(.not-current-month)')
  await days.nth(10).click()
  await page.waitForTimeout(300)
  await days.nth(20).click()
  await page.waitForTimeout(600)

  await clickButton(page, 'Save')
  await page.waitForTimeout(3000)

  // Remember which order this run created, so later phases address it directly.
  const url = page.url()
  const id = url.split('/work-orders/')[1]?.split(/[?#]/)[0]
  const number = await page.locator('h1, .detail-title').first().innerText().catch(() => '')
  await writeFile('/tmp/story-screens-wo.json', JSON.stringify({ id, url, number }, null, 2))
  console.log('  created work order:', id, number.trim())

  // ── Story 1b — the bottom tab reads Transactions, not Partial production ──
  await scrollTo(page, page.getByRole('tab', { name: 'Transactions' }).first())
  await shot(page, 'story-01-b-transactions-tab-replaces-partial-production')

  // ── Story 4b — before start, only the supply document is offered ──
  await page.getByRole('button', { name: 'Create transaction' }).first().click()
  await page.waitForTimeout(700)
  await shot(page, 'story-04-b-only-supply-document-offered')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ── Story 4a — Start refused, button still enabled ──
  await page.getByRole('button', { name: 'Start work order' }).first().click()
  await page.waitForTimeout(900)
  await scrollTo(page, page.getByText('Supply the vendor first').first())
  await shot(page, 'story-04-a-start-refused-supply-first')
} finally {
  await browser.close()
}
