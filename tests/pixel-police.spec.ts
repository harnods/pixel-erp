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
 *   • Filter chips: Pixel 3 ships no chip / filter-chip component, so a row of
 *     hand-rolled toggle pills is always off-system. Repo-wide.
 *   • VAT reconciliation (docs/patterns/index-page-format.md): ported from a raw
 *     HTML prototype, so it gets a token-only rule to stop the rgb()/hex from
 *     creeping back.
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

function violations(files: string[], re: RegExp, opts: { skipComments?: boolean } = {}): string[] {
  const hits: string[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const scan = opts.skipComments ? blankComments(src) : src
    const shown = src.split('\n')
    scan.split('\n').forEach((line, i) => {
      if (re.test(line)) hits.push(`${rel(f)}:${i + 1}  ${shown[i]!.trim().slice(0, 100)}`)
    })
  }
  return hits
}

/**
 * Blanks out comment *bodies* (keeping newlines, so line numbers still line up)
 * for rules where a mention in prose isn't a violation — e.g. a docblock that
 * names the wrong-looking hex it is warning you about.
 */
function blankComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)   // HTML / template
    .replace(/\/\*[\s\S]*?\*\//g, blank)  // CSS + JS block
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length))) // JS line
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

describe('pixel-police — MpIcon size (docs/patterns/Icon.md)', () => {
  // MpIcon's recipe only defines size variants sm|md. Anything else is written
  // inline as `--mp-icon-size: <value>`, so a CSS length ("16px") works but the
  // keywords xs|lg|xl produce an invalid length — the width declaration is
  // dropped and the SVG renders unbounded (measured 103–1178px). `size` is typed
  // as plain `string`, so TypeScript cannot catch this.
  it('no MpIcon uses the non-existent xs/lg/xl size keywords (use sm, md, or a CSS length)', () => {
    const hits: string[] = []
    for (const f of vueFiles) {
      const src = readFileSync(f, 'utf8')
      for (const tag of src.match(/<MpIcon\b[^>]*?>/gs) ?? []) {
        const bad = tag.match(/size="(xs|lg|xl)"/)
        if (bad) hits.push(`${rel(f)}  size="${bad[1]}"  in  ${tag.replace(/\s+/g, ' ').slice(0, 90)}`)
      }
    }
    expect(hits, `Invalid MpIcon size — use "sm", "md" or an explicit length like "32px":\n${hits.join('\n')}`).toEqual([])
  })
})

describe('pixel-police — MpIcon colour comes from the prop (docs/patterns/Icon.md)', () => {
  // MpIcon writes `--mp-icon-color: var(--mp-colors-icon-default)` as an inline
  // style on its own <svg>. Inline styles win, and the var is read in the svg's
  // own context — so a CSS `color` on the icon, or on any ancestor, is ignored
  // and the icon renders grey #536062 whatever surface it's on. This is silent:
  // no console warning, no type error, and the dead CSS reads as if it worked.
  //
  // The only working control is the `color` prop, a dot-path into --mp-colors-*
  // (`icon.inverse` → --mp-colors-icon-inverse). Valid: icon.brand ·
  // icon.danger · icon.default · icon.disabled · icon.highlight ·
  // icon.information · icon.inverse · icon.inverse.static · icon.selected ·
  // icon.subtle · icon.success · icon.warning · icon.warning.inverse.
  //
  // Note icon.subtle is #e3e7e9 (a near-white hairline colour), NOT the ~#6e7a7c
  // of --mp-text-subtle. For a muted icon the right value is icon.default.
  const VALID = new Set([
    'icon.brand', 'icon.danger', 'icon.default', 'icon.disabled', 'icon.highlight',
    'icon.information', 'icon.inverse', 'icon.inverse.static', 'icon.selected',
    'icon.subtle', 'icon.success', 'icon.warning', 'icon.warning.inverse',
  ])

  it('no MpIcon sets colour via an inline style — it has no effect (use `color`)', () => {
    const hits: string[] = []
    for (const f of vueFiles) {
      const src = readFileSync(f, 'utf8')
      for (const tag of src.match(/<MpIcon\b[^>]*?>/gs) ?? []) {
        if (/:?style="[^"]*\bcolor\s*:/.test(tag)) {
          hits.push(`${rel(f)}  ${tag.replace(/\s+/g, ' ').slice(0, 110)}`)
        }
      }
    }
    expect(hits, `Inline colour on MpIcon does nothing — pass color="icon.*":\n${hits.join('\n')}`).toEqual([])
  })

  it('every static MpIcon `color` is a real token path', () => {
    const hits: string[] = []
    for (const f of vueFiles) {
      const src = readFileSync(f, 'utf8')
      for (const tag of src.match(/<MpIcon\b[^>]*?>/gs) ?? []) {
        // Static values only — `:color="expr"` is resolved at runtime.
        const m = tag.match(/(?<!:)\bcolor="([^"{]+)"/)
        if (m && m[1] && !VALID.has(m[1])) {
          hits.push(`${rel(f)}  color="${m[1]}"`)
        }
      }
    }
    expect(hits, `Unknown MpIcon color token — resolves to nothing:\n${hits.join('\n')}`).toEqual([])
  })
})

describe('pixel-police — no hand-rolled filter chips', () => {
  // Pixel 3 has no chip / filter-chip component (verified against the package
  // list and the Pixel MCP component registry), so a row of pills that toggle a
  // selection is always hand-rolled and always off-system. The on-system
  // replacements, by context:
  //   • narrowing an index page  → quick filter select, max 2, then All filters
  //                                (docs/patterns/index-page-format.md §A.3)
  //   • switching page scope     → page-level tabs (docs/patterns/tabs.md §1)
  //   • multi-select in a drawer → MpCheckbox checklist
  //
  // The rule targets *stateful* chips only: a chip/pill class combined with an
  // active-state class. Static chips (tag chips, unit suffixes, avatar chips,
  // quick-action launchers) are display affordances, not controls, and are fine.
  const STATE = /\bis-(?:active|on|selected|current)\b/
  const CHIP_CLASS = /:?class="[^"]*(?:chip|pill)/i

  it('no chip/pill element carries an active-state class (use a select, tabs, or MpCheckbox)', () => {
    const hits: string[] = []
    for (const f of vueFiles) {
      const src = readFileSync(f, 'utf8')
      for (const tag of src.match(/<[a-zA-Z][^>]*?>/gs) ?? []) {
        if (CHIP_CLASS.test(tag) && STATE.test(tag)) {
          hits.push(`${rel(f)}  ${tag.replace(/\s+/g, ' ').slice(0, 120)}`)
        }
      }
    }
    expect(hits, `Hand-rolled stateful filter chip — Pixel has no chip component:\n${hits.join('\n')}`).toEqual([])
  })
})

describe('pixel-police — VAT reconciliation is token-only', () => {
  // The module was ported from a standalone HTML/React prototype that styled
  // everything with literal rgb()/hex. It has since been fully converted to
  // --mp-* semantic tokens; this rule keeps the raw values from coming back with
  // the next port or copy-paste.
  const vatFiles = allFiles.filter((f) =>
    /(?:VatReconciliation|VatMatchingRules|Reconciliation(?:Detail|Filters)Drawer)[A-Za-z]*\.vue$/.test(f))

  it('covers the whole module (guard would silently pass on an empty file list)', () => {
    expect(vatFiles.map(rel).sort()).toEqual([
      'app/components/pages/VatMatchingRulesPage.vue',
      'app/components/pages/VatReconciliationPeriodsPage.vue',
      'app/components/pages/VatReconciliationUnmatchedPage.vue',
      'app/components/pages/VatReconciliationWorkspacePage.vue',
      'app/components/patterns/ReconciliationDetailDrawer.vue',
      'app/components/patterns/ReconciliationFiltersDrawer.vue',
    ])
  })

  it('has no literal colors — every color comes from a --mp-* token', () => {
    // 3/6/8-digit hex with a hard boundary so `#filters` (slot name) and
    // `#10223` (detail-page title pattern) don't false-flag.
    const hits = violations(
      vatFiles,
      /rgba?\(\s*\d|hsla?\(\s*\d|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w])/,
      // A hex named in a docblock is documentation, not styling.
      { skipComments: true },
    )
    expect(hits, `Literal color in VAT reconciliation — use a --mp-* token:\n${hits.join('\n')}`).toEqual([])
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
