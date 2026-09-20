/**
 * "Pixel police" — static design-compliance guard for the HR, CRM and Cowork
 * modules. Enforces the repo's design docs so the modules can't drift off-system:
 *
 *   • Toast (docs/patterns/Toast.md): Pixel's toast only supports the variants
 *     success | error | greeting. `variant: 'info'` / `'warning'` render NO icon —
 *     coming-soon toasts must go through infoToast() (utils/toasts.ts) instead.
 *   • Enterprise theme (Pixel 3 DT 2.4): the CRM module must use Enterprise tokens
 *     only — no off-theme Qontak-brand blues.
 *   • Tables (docs/table-design.md): table-body cell text is regular weight, never
 *     bold/semibold.
 *
 * These are source scans (no component mounting), so they run fast and stay green
 * only while the modules keep following the docs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const allFiles = walk(join(ROOT, 'app'))
const vueFiles = allFiles.filter((f) => f.endsWith('.vue'))
const rel = (f: string) => f.replace(ROOT + '/', '')

function violations(files: string[], re: RegExp): string[] {
  const hits: string[] = []
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => { if (re.test(line)) hits.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 200)}`) })
  }
  return hits
}

describe('pixel-police — Toast variants (docs/patterns/Toast.md)', () => {
  // Scoped to the modules this guard owns: HR, CRM, Cowork.
  const moduleFiles = vueFiles.filter((f) => /(Crm|Cowork|Hr[A-Z]|Employee)/.test(f))
  it('no HR/CRM/Cowork toast uses the non-existent "info"/"warning" variant (use infoToast)', () => {
    const hits = violations(moduleFiles, /variant:\s*['"](info|warning)['"]/)
    expect(hits, `Invalid toast variant — use infoToast():\n${hits.join('\n')}`).toEqual([])
  })
})

describe('pixel-police — CRM is Pixel 3 DT 2.4 Enterprise only', () => {
  const crmFiles = allFiles.filter((f) =>
    /Crm[A-Za-z]*\.vue$/.test(f) || f.endsWith('crm-page.css'))

  it('CRM has no off-theme Qontak-brand blues (use Enterprise tokens)', () => {
    // Qontak blues that were replaced by Enterprise emerald / link / green tokens.
    const hits = violations(crmFiles, /#2563eb|#4b61dc|#eef0fc|#1d4ed8/i)
    expect(hits, `Off-theme blue in CRM — use Enterprise tokens:\n${hits.join('\n')}`).toEqual([])
  })
})

describe('pixel-police — table body text is regular weight (docs/table-design.md)', () => {
  it('shared CRM table cells are not semibold/bold', () => {
    const css = readFileSync(join(ROOT, 'app/assets/css/crm-page.css'), 'utf8')
    const tdRule = css.split('\n').find((l) => l.includes('.crm-table tbody td')) ?? ''
    // The td rule (and its following declarations) must not force a heavy weight.
    const tdBlock = css.slice(css.indexOf('.crm-table tbody td'), css.indexOf('}', css.indexOf('.crm-table tbody td')))
    expect(tdRule).not.toMatch(/font-weight/)
    expect(tdBlock).not.toMatch(/semi-bold|font-weights-bold|font-weight:\s*[6-9]00/)
  })
})

/**
 * FULL-SCAN of the CRM module — enforces "Pixel 3 DT 2.4 Enterprise + the
 * sanctioned erp.css overrides ONLY, no bespoke CSS". Unlike scripts/
 * pixel-police-ci.sh (which is diff-scoped and ignores pre-existing code), this
 * scans every CRM file end-to-end so committed drift is caught, not just new
 * lines. When CRM must render something Pixel's default gets wrong, use the
 * documented override class (btn-enterprise--*, filter-all-btn, filter-icon-btn,
 * filter-search, row-kebab) — never a new hand-rolled class.
 */
describe('pixel-police — CRM module: Pixel + sanctioned overrides only (full scan)', () => {
  const crmFiles = allFiles.filter(
    (f) => /Crm[A-Za-z]*\.vue$/.test(f) || f.endsWith('crm-page.css'),
  )

  // Class names the ERP has officially sanctioned as cross-module overrides
  // (erp.css / docs) — each is used across dozens of non-CRM files, so they ARE
  // the "Pixel + overrides" system, not bespoke CRM drift.
  // NB: `filter-select` (native <select>) is intentionally NOT sanctioned — CRM
  // dropdowns must use Pixel MpSelect (its menu is a popover, and it's clearable).
  const SANCTIONED = /btn-enterprise|filter-all-btn|filter-icon-btn|filter-btn-group|filter-search|search-clear-btn|row-kebab|page-tab|detail-breadcrumb|sidebar-toggle|sad-item|pipe-lane-edit|pipe-lane-delete|dlb-prev-tab-btn|dlb-tab-btn/

  // NB: Pixel <MpButton variant="secondary"|"ghost"> is the STANDARD per
  // docs/design/RULES.md › rule/btn-mpbutton-standard + rule/btn-secondary-black
  // (secondary is globally overridden to the Enterprise look in erp.css). So it is
  // NOT flagged — .btn-enterprise is the legacy path, migrated when a file is touched.

  it('no hand-rolled button / control-primitive CSS classes (use Pixel or an override)', () => {
    // A CSS selector defining a class whose name reads as a control primitive
    // (button/pill/chip/iconbtn/input/select/segmented) and is NOT sanctioned.
    const re = /^\s*\.[a-z][a-z0-9_-]*(btn|button|iconbtn|pill|chip|-input\b|-select\b|segmented)\b/
    const hits = violations(crmFiles, re).filter((h) => !SANCTIONED.test(h))
    expect(hits, `Bespoke control-primitive class — use a Pixel component or a sanctioned override:\n${hits.join('\n')}`).toEqual([])
  })

  it('dropdowns use <ErpFilterSelect> (MpPopover menu) — never a native <select> or Pixel MpSelect', () => {
    // Pixel's MpSelect renders a native <select> (OS dropdown, clips in scroll
    // containers). Every CRM dropdown/filter must be ErpFilterSelect.
    const hits = violations(crmFiles, /<MpSelect\b|<select[ >]/).filter((h) => !/ErpFilterSelect/.test(h))
    expect(hits, `Native select / MpSelect — use <ErpFilterSelect>:\n${hits.join('\n')}`).toEqual([])
  })

  it('no raw HTML form/action controls (use MpButton/MpInput/MpTextarea or a btn-enterprise button)', () => {
    const hits = violations(crmFiles, /<(button|input|select|textarea)[ >]/).filter(
      (h) => !SANCTIONED.test(h) && !/search-input/.test(h),
    )
    expect(hits, `Raw HTML control — use a Pixel component or a sanctioned override:\n${hits.join('\n')}`).toEqual([])
  })

  it('no hardcoded color literals (use var(--mp-*) tokens; var() fallbacks are fine)', () => {
    // Flags a bare `: #hex` / `: rgb()` in a declaration. `var(--x, #hex)` is not
    // matched (the colon is followed by `var(`), so token fallbacks stay legal.
    const hits = violations(crmFiles, /:\s*(#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|hsl\()/)
      // colors inside a box-shadow are covered by the drop-shadow rule (and
      // allowed on genuine overlays via pixel-police-allow-shadow), not here.
      .filter((h) => !/box-shadow/.test(h))
    expect(hits, `Hardcoded color — use var(--mp-*) tokens:\n${hits.join('\n')}`).toEqual([])
  })

  it('no drop-shadow on surfaces (Enterprise surfaces use a 1px border; inset rings are fine)', () => {
    const hits = violations(crmFiles, /box-shadow|--mp-shadows-/).filter(
      (h) => !/inset|pixel-police-allow-shadow/.test(h),
    )
    expect(hits, `Drop-shadow on a surface — use a 1px border, not box-shadow:\n${hits.join('\n')}`).toEqual([])
  })
})
