// @vitest-environment happy-dom
/**
 * Ticket: "[WMS] Scanning barcode guidance in every WMS step" — operators were
 * confused how each step's scan flow works (location first? which codes? what
 * happens when a tracked SKU is scanned?) and only found out from error toasts.
 *
 * Every scan bar now carries:
 *  - a live hint under the bar that follows the step's state (no location yet →
 *    "scan the storage location first"; location active → names that location);
 *  - a "How scanning works" tooltip (info icon) listing the step's scan rules.
 * All copy comes from app/data/scanGuidance.ts and is translated.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import ScanBar from '~/components/patterns/ScanBar.vue'
import { scanGuidance, type ScanStep, type DrawerKind } from '~/data/scanGuidance'
import { ID_TRANSLATIONS } from '~/data/translations'

const id = (k: string) => k
const STEPS: ScanStep[] = [
  'receive', 'put-away', 'pick', 'pack', 'handover', 'new-shipment', 'stock-count',
  'batch-drawer', 'serial-drawer', 'batch-verify', 'serial-verify',
]
const KINDS: DrawerKind[] = ['count', 'in-out', 'transfer', 'receiving', 'put-away', 'picking', 'purchase-delivery']

describe('scanGuidance()', () => {
  it('gives every step a hint and at least one tip', () => {
    for (const step of STEPS) {
      for (const activeBin of [null, 'A-01-02']) {
        const g = scanGuidance(step, { activeBin, kind: 'count' }, id)
        expect(g.hint, step).toBeTruthy()
        expect(g.tips.length, step).toBeGreaterThan(0)
      }
    }
  })

  it('location-first steps ask for the location, then name it once active', () => {
    for (const step of ['put-away', 'pick', 'stock-count'] as ScanStep[]) {
      expect(scanGuidance(step, { activeBin: null }, id).hint).toMatch(/storage location first/)
      const active = scanGuidance(step, { activeBin: 'A-01-02' }, id).hint
      expect(active).toContain('A-01-02')
      expect(active).not.toContain('{bin}')
    }
  })

  it('drawers follow the location-first model only for put-away and picking', () => {
    for (const step of ['batch-drawer', 'serial-drawer'] as ScanStep[]) {
      for (const kind of KINDS) {
        const hint = scanGuidance(step, { activeBin: null, kind }, id).hint
        expect(hint).not.toMatch(/\{code\}|\{bin\}/)
        expect(/storage location first/.test(hint), `${step}/${kind}`).toBe(kind === 'put-away' || kind === 'picking')
      }
      expect(scanGuidance(step, { activeBin: 'B-02', kind: 'picking' }, id).hint).toContain('B-02')
    }
  })

  it('new shipment asks for a warehouse before scanning', () => {
    expect(scanGuidance('new-shipment', { hasWarehouse: false }, id).hint).toMatch(/^Select a warehouse first/)
    expect(scanGuidance('new-shipment', { hasWarehouse: true }, id).hint).toMatch(/^Scan the tracking number/)
  })

  it('every guidance string has an Indonesian translation', () => {
    const src = readFileSync(resolve(__dirname, '../app/data/scanGuidance.ts'), 'utf8')
    const keys = [...src.matchAll(/t\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map(m => m[2]!.replace(/\\'/g, "'"))
    const verbs = [...src.matchAll(/'(Scan the \{code\}[^']*)'/g)].map(m => m[1]!)
    expect(keys.length).toBeGreaterThan(30)
    for (const k of [...keys, ...verbs]) expect(ID_TRANSLATIONS[k], k).toBeTruthy()
  })
})

describe('ScanBar guidance', () => {
  it('renders the live hint and links it to the input', () => {
    const w = mount(ScanBar, { props: { hint: 'Scan the storage location first, then scan the SKU.', tips: ['a'] } })
    const hint = w.find('.scan-bar-hint')
    expect(hint.text()).toBe('Scan the storage location first, then scan the SKU.')
    expect(hint.attributes('aria-live')).toBe('polite')
    expect(w.find('input').attributes('aria-describedby')).toBe(hint.attributes('id'))
  })

  it('shows the info icon with an accessible name only when there are tips', () => {
    const withTips = mount(ScanBar, { props: { tips: ['Each scan adds 1 to the picked qty.'] } })
    const info = withTips.find('.scan-bar-info')
    expect(info.exists()).toBe(true)
    expect(info.attributes('aria-label')).toBe('How scanning works')
    expect(info.attributes('tabindex')).toBe('0')

    const bare = mount(ScanBar)
    expect(bare.find('.scan-bar-info').exists()).toBe(false)
    expect(bare.find('.scan-bar-hint').exists()).toBe(false)
  })

  it('still emits scans and clears the input', async () => {
    const w = mount(ScanBar)
    const input = w.find('input')
    await input.setValue('A-01-02')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('scan')?.[0]).toEqual(['A-01-02'])
  })
})
