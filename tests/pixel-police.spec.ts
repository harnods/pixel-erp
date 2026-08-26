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
    lines.forEach((line, i) => { if (re.test(line)) hits.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 100)}`) })
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
