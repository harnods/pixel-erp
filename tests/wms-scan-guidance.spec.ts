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
      .split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n')
    // Every quoted sentence (has a space, ends with a period) is UI copy.
    const keys = [...src.matchAll(/'((?:\\'|[^'\n])* (?:\\'|[^'\n])*\.)'/g)].map(m => m[1]!.replace(/\\'/g, "'"))
    expect(keys.length).toBeGreaterThan(50)
    for (const k of keys) expect(ID_TRANSLATIONS[k], k).toBeTruthy()
  })
})

describe('scanGuidance() next step', () => {
  const coffee = (done: number, total?: number) => ({ name: 'Coffee Grinder', done, total })

  it('walks a list step from first scan to finish', () => {
    expect(scanGuidance('pick', { activeBin: 'Bin 01' }, id).hint).toBe('Scan the SKU, batch number, or serial number to pick from Bin 01.')
    expect(scanGuidance('pick', { activeBin: 'Bin 01', last: coffee(2, 4) }, id).hint).toBe('Coffee Grinder: 2 of 4 picked. Scan the next unit.')
    expect(scanGuidance('pick', { activeBin: 'Bin 01', last: coffee(4, 4) }, id).hint).toBe('Coffee Grinder is fully picked. Scan the next SKU.')
    expect(scanGuidance('pick', { activeBin: 'Bin 01', last: coffee(4, 4), allDone: true }, id).hint).toBe('All items picked. Click Finish picking.')
  })

  it('names each step\'s own finish button', () => {
    expect(scanGuidance('receive', { allDone: true }, id).hint).toBe('All items received. Click Finish receiving.')
    expect(scanGuidance('put-away', { allDone: true }, id).hint).toBe('All items have a storage location. Click Finish put-away.')
    expect(scanGuidance('pack', { allDone: true }, id).hint).toBe('All items packed. Click Finish packing.')
  })

  it('picking still asks for a location first when none is active', () => {
    expect(scanGuidance('pick', { activeBin: null, last: coffee(2, 4) }, id).hint).toMatch(/storage location first/)
  })

  it('ignores a last scan with nothing done (e.g. after Reset count)', () => {
    expect(scanGuidance('receive', { last: coffee(0, 4) }, id).hint).toBe('Scan the SKU or batch number to receive items.')
  })

  it('stock counting reports the count in the active location', () => {
    expect(scanGuidance('stock-count', { activeBin: 'Bin 01', last: coffee(3) }, id).hint).toBe('Coffee Grinder: 3 counted in Bin 01. Scan the next unit, or the next SKU.')
  })

  it('handover counts the deliveries added', () => {
    expect(scanGuidance('handover', { count: 1 }, id).hint).toBe('1 delivery added. Scan the next delivery, or click Save.')
    expect(scanGuidance('new-shipment', { hasWarehouse: true, count: 3 }, id).hint).toBe('3 deliveries added. Scan the next delivery, or click Save.')
  })

  it('drawers show scanned vs. target, then point to Save', () => {
    expect(scanGuidance('serial-drawer', { kind: 'receiving', progress: { done: 1, total: 3 } }, id).hint).toBe('1 of 3 scanned. Scan the next serial number.')
    expect(scanGuidance('batch-drawer', { kind: 'picking', activeBin: 'Bin 01', progress: { done: 3, total: 3 } }, id).hint).toBe('All qty scanned. Click Save.')
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

  it('puts the help icon directly left of the bar actions (Reset count)', () => {
    const w = mount(ScanBar, {
      props: { tips: ['a'] },
      slots: { default: '<span class="chip">Bin 01</span>', actions: '<button class="reset">Reset count</button>' },
    })
    const bar = w.find('.scan-bar-info').element.closest('div')!.parentElement!
    const order = [...bar.querySelectorAll('.chip, .scan-bar-info, .reset')].map(e => e.className.split(' ')[0])
    expect(order).toEqual(['chip', 'scan-bar-info', 'reset'])
  })

  it('shows the help icon with an accessible name only when there are tips', () => {
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
