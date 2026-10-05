/**
 * Guided tours (app/tours): the demo layer's contract with the product.
 *
 * The tours are a walkthrough layer, not a product requirement. What this
 * spec holds them to: every step lands on a route that exists and a
 * data-tour marker a product screen really carries; the switch is off by
 * default and is the one thing kept in localStorage; every tour file says it
 * is a demo layer; and the SIM-7 figures are the ones the engine computes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ASSET_TOURS } from '~/tours/assetTours'
import { fixedAssets, recordEvent, resetAssetStore, VIEW_AS_ROLES } from '~/data/assetStore'
import { blankForm, previewValueChange } from '~/data/assetValueChange'

const ROOT = resolve(__dirname, '..')
const APP = join(ROOT, 'app')

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|ts)$/.test(f)) out.push(p)
  }
  return out
}

/** Every data-tour marker on a product screen, app/tours excluded. */
const productMarkers = new Set<string>()
const dynamicPrefixes = new Set<string>()
for (const f of walk(APP)) {
  if (f.includes(`${join('app', 'tours')}`)) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/ data-tour="([^"]+)"/g)) productMarkers.add(m[1]!)
  // A bound marker such as :data-tour="`appr-${r.id.slice(-3)}`" counts as
  // its fixed prefix; the step's full value is checked in the browser run.
  for (const m of src.matchAll(/:data-tour="`([a-z-]+)\$\{/g)) dynamicPrefixes.add(m[1]!)
}
const hasMarker = (t: string) => productMarkers.has(t) || [...dynamicPrefixes].some((p) => t.startsWith(p))

const slug = readFileSync(join(APP, 'pages', '[...slug].vue'), 'utf8')
const registry = slug.slice(slug.indexOf('const pageRegistry'), slug.indexOf('}', slug.indexOf('const pageRegistry')))
const registryKeys = new Set([...registry.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]!))

/** The same slug to page-key rule as pathToLabel in useNavigation.ts, which
 *  cannot load here (it relies on Nuxt auto-imports). */
function pathToLabel(path: string): string {
  const words = path.replace(/^\/+/, '').split('-')
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
}

function routeExists(route: string): boolean {
  const path = route.split('?')[0]!
  const detail = path.match(/^\/assets\/([^/]+)$/)
  if (detail) return fixedAssets.value.some((a) => a.id === detail[1])
  return registryKeys.has(pathToLabel(path))
}

describe('tour steps point at real routes and real markers', () => {
  resetAssetStore()
  it('the page registry was read', () => {
    expect(registryKeys.size).toBeGreaterThan(20)
    expect(registryKeys.has('Assets')).toBe(true)
  })
  for (const t of ASSET_TOURS) {
    describe(`${t.code} ${t.name}`, () => {
      it('starts on a route', () => {
        expect(t.steps[0]!.route, 'the first step must say where to go').toBeTruthy()
      })
      t.steps.forEach((s, i) => {
        it(`step ${i + 1}: ${s.target}`, () => {
          if (s.route) expect(routeExists(s.route), `route ${s.route}`).toBe(true)
          expect(hasMarker(s.target), `data-tour="${s.target}" on a product screen`).toBe(true)
          if (s.role) expect(VIEW_AS_ROLES.map((r) => r.role)).toContain(s.role)
        })
      })
      it('keeps export out of the walkthrough', () => {
        const all = t.steps.map((s) => `${s.body} ${s.action ?? ''}`).join(' ')
        // An action never asks for an export; a step that reaches one says so.
        for (const s of t.steps) expect(s.action ?? '').not.toMatch(/\b(export|download|import)\b/i)
        if (/Lampiran 9/.test(all)) expect(all).toMatch(/The tour stops here, on the screen before the export itself/)
      })
    })
  }
  it('seven tours, SIM-1 to SIM-7', () => {
    expect(ASSET_TOURS.map((t) => t.code)).toEqual(['SIM-1', 'SIM-2', 'SIM-3', 'SIM-4', 'SIM-5', 'SIM-6', 'SIM-7'])
  })
  it('tour copy talks about the product, never about how it was built', () => {
    for (const t of ASSET_TOURS) {
      const copy = [t.blurb, t.closing, ...t.steps.flatMap((s) => [s.title, s.body, s.action ?? '', s.watch ?? '', s.ifMissing ?? ''])].join(' ')
      expect(copy, t.code).not.toMatch(/tours\.json|prototype|\bengine\b|\bdesign\b|\baudit\b|\bbuild\b|computes today/i)
    }
  })
  it('a step whose target goes away once done says so, rather than waiting', () => {
    const sim4 = ASSET_TOURS.find((t) => t.code === 'SIM-4')!
    const approve = sim4.steps.find((s) => s.target === 'appr-approve')!
    expect(approve.ifMissing).toMatch(/already approved/)
    const before = sim4.steps[sim4.steps.indexOf(approve) - 1]!
    expect(before.action).toMatch(/Approve comes on the next step/)
  })
  it('the waiting panel always offers a way on', () => {
    const runner = readFileSync(join(APP, 'tours', 'tourRunner.ts'), 'utf8')
    const waiting = runner.slice(runner.indexOf("kind: 'waiting'"), runner.indexOf("kind: 'waiting'") + 700)
    expect(waiting).toMatch(/nextLabel: index === m - 1 \? 'Finish' : 'Skip this step'/)
  })
  it('no em dashes in tour copy', () => {
    expect(readFileSync(join(APP, 'tours', 'assetTours.ts'), 'utf8')).not.toMatch(/\u2014/)
  })
  const allCopy = ASSET_TOURS.map((t) => [t.blurb, t.closing, ...t.steps.flatMap((s) => [s.title, s.body, s.action ?? '', s.watch ?? '', s.ifMissing ?? ''])].join(' ')).join(' ')
  it('tour copy uses the screens\' vocabulary, not the retired words', () => {
    expect(allCopy).not.toMatch(/statutory|fiscal|commercial|derivation|superseded|\bhalf [12]\b|halves|frozen|freeze|\bchoose\b/i)
    for (const old of ['Set group', 'Save classification', 'Custody gaps', 'Location now', 'Freeze population and start', 'select Generate.', 'select Remeasure.', 'select Save.']) {
      expect(allCopy, old).not.toContain(old)
    }
  })
  it('every control and label a step quotes is on a product screen', () => {
    const product = walk(APP).filter((f) => !f.includes(join('app', 'tours'))).map((f) => readFileSync(f, 'utf8')).join('\n')
    const quoted = [
      'asset excluded: no tax group', 'Set tax group', 'Save tax group', 'Tax life (years)', 'Generate run', 'Run period',
      'A fixed day of the following month', 'Review and post', 'Post journal', 'Record an impairment test', 'Record test',
      'Previous versions', 'Replaced from', 'Record disposal', 'Correct an error', 'Corrected cost (Rp)', 'Reason for correction',
      'Record correction', 'Missing custody', 'Save custody', 'Reassign all', 'Mark as left', 'Write-off needs approval',
      'New count session', 'By location', 'Start count', 'Counting at', 'Finish count', 'Save resolution', 'Current location',
      'Applies when the session closes', 'Close session', 'Location updated', 'Sent for approval', 'Modify lease',
      'Change in term (months)', 'What changed in the contract', 'Remeasure lease', 'Accounting total', 'Not amortised',
      'Save test', 'Value in use', 'Not impaired', 'all required tests recorded', 'Classify all assets to produce Lampiran 9',
      'Capitalise an improvement', 'Improvement cost (Rp)', 'Capitalise improvement', 'Revise useful life or method',
      'Total useful life (years)', 'Record revision', 'Dispose of part', 'Share to dispose of (%)', 'Record partial disposal',
      'Tax life is set by the tax group', 'Charge breakdown', 'Matches Tax book',
    ]
    for (const q of quoted) {
      expect(allCopy, `a tour quotes "${q}"`).toContain(q)
      expect(product, `"${q}" on a product screen`).toContain(q)
    }
  })
})

describe('the guided tours switch', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })

  it('is off by default', async () => {
    store.clear()
    const s = await import('~/tours/tourSettings')
    expect(s.guidedToursOn.value).toBe(false)
  })

  it('persists on through a reload, and off again', async () => {
    store.clear()
    const a = await import('~/tours/tourSettings')
    a.setGuidedTours(true)
    expect(store.get(a.GUIDED_TOURS_KEY)).toBe('on')
    vi.resetModules()
    const b = await import('~/tours/tourSettings')
    expect(b.guidedToursOn.value).toBe(true)
    b.setGuidedTours(false)
    expect(store.has(b.GUIDED_TOURS_KEY)).toBe(false)
    vi.resetModules()
    const c = await import('~/tours/tourSettings')
    expect(c.guidedToursOn.value).toBe(false)
  })

  it('uses the persistence key tours.json names', async () => {
    const s = await import('~/tours/tourSettings')
    expect(s.GUIDED_TOURS_KEY).toBe('assetmod.tours.v2')
  })

  it('is the only localStorage use in the tour layer', () => {
    for (const f of walk(join(APP, 'tours'))) {
      if (f.endsWith('tourSettings.ts')) continue
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/localStorage|sessionStorage/)
    }
  })
})

describe('the tour layer is labelled and kept apart', () => {
  const files = walk(join(APP, 'tours'))
  it('has its files', () => {
    expect(files.map((f) => f.split('/').pop()).sort()).toEqual(
      ['BudgetGuidedTourSetting.vue', 'BudgetTourLauncher.vue', 'GuidedToursSetting.vue', 'TourLauncher.vue', 'assetTours.ts', 'budgetTours.ts', 'tourPanel.ts', 'tourRunner.ts', 'tourSettings.ts'],
    )
  })
  for (const f of files) {
    it(`${f.split('/').pop()} carries the demo-layer header`, () => {
      const head = readFileSync(f, 'utf8').slice(0, 900).replace(/\s*\n\s*(\*|\/\/)?\s*/g, ' ')
      expect(head).toMatch(/demo layer for walkthroughs, not a product requirement/)
      expect(head).toMatch(/engineers building the product should ignore it/)
      expect(head).toMatch(/data-tour="\.\.\." attributes/)
    })
  }
  it('product screens import only the launcher and the setting', () => {
    const importers = walk(APP)
      .filter((f) => !f.includes(join('app', 'tours')))
      .filter((f) => /from ['"]~\/tours\//.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(APP.length + 1))
      .sort()
    expect(importers).toEqual(['components/ErpHeader.vue', 'components/pages/AssetSettingsPage.vue', 'components/pages/BudgetSettingsPage.vue'])
  })
})

describe('SIM-7 quotes the figures the engine computes', () => {
  const sim7 = ASSET_TOURS.find((t) => t.id === 'sim7')!
  const copy = sim7.steps.map((s) => `${s.body} ${s.action ?? ''} ${s.watch ?? ''}`).join(' ')
  const rp = (n: number | null | undefined) => `Rp${Math.round(n ?? NaN).toLocaleString('id-ID')}`

  it('improvement, life revision and partial disposal on FA-0031', () => {
    resetAssetStore()
    const id = 'FA-0031'
    const imp = previewValueChange(id, { ...blankForm(id, 'improve'), amount: '60000000', passesCapitalisationTest: true })
    const [ia, it_] = imp.books
    for (const f of [ia!.chargeBefore, ia!.chargeAfter, it_!.chargeBefore, it_!.chargeAfter, ia!.costAfter]) expect(copy).toContain(rp(f))
    recordEvent(id, imp.event!)

    const rev = previewValueChange(id, { ...blankForm(id, 'revise'), lifeYears: '12' })
    const [ra, rt] = rev.books
    expect(rt!.unchanged).toBe(true)
    for (const f of [ra!.chargeBefore, ra!.chargeAfter, rt!.chargeAfter]) expect(copy).toContain(rp(f))
    recordEvent(id, rev.event!)

    const part = previewValueChange(id, { ...blankForm(id, 'dispose-part'), percent: '25', proceeds: '200000000' })
    const [pa, pt] = part.books
    for (const f of [pa!.carryingBefore, pa!.carryingAfter, pa!.chargeAfter, pt!.carryingBefore, pt!.carryingAfter, pt!.chargeAfter]) {
      expect(copy).toContain(rp(f))
    }
    expect(copy).toContain(rp(Math.abs(pa!.gainLoss!)))
    expect(copy).toContain(rp(Math.abs(pt!.gainLoss!)))
    expect(pa!.gainLoss!).toBeLessThan(0)
    expect(pt!.gainLoss!).toBeLessThan(0)
  })
})
