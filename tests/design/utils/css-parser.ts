/**
 * css-parser.ts
 *
 * Extracts and parses <style> blocks from Vue SFC files.
 * Used by design tests to verify CSS values without launching a browser.
 *
 * Limitations:
 * - Only checks static values. CSS variable names are verified as strings.
 * - Does not resolve var(--mp-*) to their hex values (use token table in docs/patterns).
 * - Does not evaluate media queries or pseudo-classes.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

export type StyleMap = Record<string, Record<string, string>>

const ROOT = resolve(process.cwd())

/**
 * Parse all <style> blocks from a Vue SFC into a flat selector → property map.
 * Scoped and non-scoped styles are merged.
 */
export function extractStyles(relPath: string): StyleMap {
  const abs = resolve(ROOT, relPath)
  const source = readFileSync(abs, 'utf-8')

  // Extract all <style> block contents
  const styleBlocks: string[] = []
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g
  let m: RegExpExecArray | null
  while ((m = styleRe.exec(source)) !== null) {
    styleBlocks.push(m[1])
  }

  const result: StyleMap = {}

  for (const block of styleBlocks) {
    // Strip comments
    const clean = block.replace(/\/\*[\s\S]*?\*\//g, '')

    // Match selector { ... } blocks (single-level only)
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g
    let rule: RegExpExecArray | null
    while ((rule = ruleRe.exec(clean)) !== null) {
      const selectors = rule[1].trim().split(',').map(s => s.trim())
      const declarations = rule[2]

      const props: Record<string, string> = {}
      const declRe = /([\w-]+)\s*:\s*([^;]+);/g
      let decl: RegExpExecArray | null
      while ((decl = declRe.exec(declarations)) !== null) {
        props[decl[1].trim()] = decl[2].trim()
      }

      for (const sel of selectors) {
        if (!sel) continue
        result[sel] = { ...(result[sel] ?? {}), ...props }
      }
    }
  }

  return result
}
