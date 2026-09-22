/**
 * Projects module (Project MTO) — Pixel rework guards.
 *  • Date helpers bridge MpDatePicker (value-type="format", DD/MM/YYYY) and the ISO data layer.
 *  • Status → ErpStatusBadge mapping stays complete for every domain the UI renders.
 *  • Every Projects .vue file stays on Pixel components: no raw controls, inline px,
 *    hand-drawn svg icons, legacy pill/banner classes, or disabled-for-validation actions.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isoToDmy, dmyToIso } from '../app/utils/projectFormat'
import { badge, badgeProps } from '../app/utils/projectStatus'

describe('project date helpers', () => {
  it('round-trips ISO ⇄ DD/MM/YYYY', () => {
    expect(isoToDmy('2026-06-15')).toBe('15/06/2026')
    expect(dmyToIso('15/06/2026')).toBe('2026-06-15')
    expect(dmyToIso(isoToDmy('2026-12-01'))).toBe('2026-12-01')
  })
  it('treats empty / malformed input as empty', () => {
    expect(isoToDmy(undefined)).toBe('')
    expect(dmyToIso('')).toBe('')
    expect(dmyToIso(null)).toBe('')
    expect(dmyToIso('15-06-2026')).toBe('')
  })
})

describe('project status badges', () => {
  it('maps every status the Projects UI renders', () => {
    const cases: [string, string][] = [
      ['project', 'draft'], ['project', 'active'], ['project', 'closed'],
      ['wp', 'not_started'], ['wp', 'in_progress'], ['wp', 'technically_complete'],
      ['wo', 'Draft'], ['wo', 'Released'], ['wo', 'In progress'], ['wo', 'Completed'],
      ['vo', 'requested'], ['vo', 'raised'], ['vo', 'approved'], ['vo', 'rejected'],
      ['eco', 'draft'], ['eco', 'pending'], ['eco', 'approved'],
      ['res', 'reserved'], ['res', 'picked'], ['res', 'issued'], ['res', 'released'],
      ['doc', 'posted'], ['doc', 'held'], ['doc', 'ordinary'], ['doc', 'draft'],
      ['approval', 'pending'], ['priority', 'high'], ['kind', 'overage'],
    ]
    for (const [d, s] of cases) expect(badge(d, s).label, `${d}:${s}`).not.toBe('')
  })
  it('passes the label through t()', () => {
    expect(badgeProps('project', 'active', s => `ID:${s}`)).toEqual({ status: 'active', type: 'completed', label: 'ID:Active' })
  })
})

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? vueFiles(p) : p.endsWith('.vue') ? [p] : []
  })
}

describe('Projects module stays on Pixel components', () => {
  const files = vueFiles(join(__dirname, '../app/components/projects'))
  const banned: [RegExp, string][] = [
    [/<(button|select|textarea)[\s>]/, 'raw control — use MpButton / ErpFilterSelect / MpTextarea'],
    [/<input(?![^>]*filter-search-input)[\s>]/, 'raw input — use MpInput (search pill excepted)'],
    [/style="[^"]*\d+px/, 'inline px — use a pm-* utility class'],
    [/<svg[\s>]/, 'hand-drawn icon — use MpIcon'],
    [/pm-pill|pm-banner|btn-enterprise|pm-seg\b|pm-input\b|pm-select\b/, 'legacy class — use ErpStatusBadge / MpBanner / Pixel controls'],
    [/<MpButton[^>]*:disabled=/, 'disabled action — show an inline error on click instead'],
    [/from '~\/utils\/projectToast'/, 'removed helper — use useProjectAction'],
  ]
  it('covers the module', () => { expect(files.length).toBeGreaterThan(20) })
  for (const f of files) {
    it(f.split('/components/projects/')[1], () => {
      const src = readFileSync(f, 'utf8')
      for (const [re, why] of banned) expect(re.test(src), why).toBe(false)
    })
  }
})
