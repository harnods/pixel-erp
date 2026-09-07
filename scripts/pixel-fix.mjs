#!/usr/bin/env node
/**
 * pixel-fix — AUTO-FIX (not just warn) the mechanical, unambiguous Pixel/ERP rule
 * violations, so a prototype dropped into this repo is corrected to the design
 * rules automatically. Companion to pixel-police (which flags); this one repairs.
 *
 *   node scripts/pixel-fix.mjs [--check] [paths...]
 *     (no args)  fix every .vue under app/
 *     --check    report only, exit 1 if anything would change (CI / pre-commit)
 *     paths...   restrict to these files/dirs (used by the on-edit hook)
 *
 * Each fixer is pure text→text and idempotent (running twice changes nothing).
 * Add a fixer to FIXERS; keep it mechanical — anything needing judgement stays in
 * pixel-police as a review note, never here.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

// Authoritative token → hex, derived from the fallbacks the codebase already
// declares most often (grep of `var(--mp-*, #hex)`), so injected fallbacks match
// what shipped. Only tokens listed here are fixed; unknown tokens are left alone.
const TOKEN_HEX = {
  'border-default': '#e3e7e9', 'border-bold': '#8c9596', 'border-subtle': '#e5e7e7',
  'border-form': '#1d1f2429', 'border-brand-bold': '#029861', 'border-selected': '#029861',
  'background-neutral': '#ffffff', 'background-neutral-subtle': '#f8f9f9',
  'background-neutral-hovered': '#eef0f3', 'background-neutral-pressed': '#ebf0f1',
  'background-stage': '#ffffff', 'background-surface': '#f1f5f9',
  'background-brand-bold': '#029861', 'background-information-subtle': '#eaf2fd',
  'text-default': '#080d0e', 'text-secondary': '#3a4749', 'text-placeholder': '#97a0af',
  'text-subtle': '#656f80', 'text-link': '#165082', 'text-danger': '#a8352d',
  'text-success': '#186f4a', 'text-inverse': '#ffffff', 'text-on-color': '#ffffff',
  'icon-default': '#536062', 'icon-subtle': '#97a0af', 'icon-inverse': '#ffffff',
}
// Only these CSS properties break *visibly* when a token resolves empty (border
// collapses to 0, background/ring vanishes). Plain `color:` degrades gracefully
// (inherits), so we leave it to avoid churn — the fix targets real breakage.
const STRUCTURAL_PROP = /(border(-(top|right|bottom|left))?|outline|box-shadow|background(-color)?)\s*:[^;{}]*$/

const FIXERS = [
  {
    id: 'token-fallback',
    // A var(--mp-<token>) with NO fallback resolves EMPTY inside portaled content
    // (popover/drawer/modal teleported outside Pixel's theme wrapper) — dropping
    // the border/background/ring entirely. Inject the hex fallback (inert when the
    // theme var resolves in-tree; rescues the portal case). Only in border/bg/shadow
    // declarations, and only for known color tokens.
    fix(src) {
      let n = 0
      const out = src.replace(/([^;{}\n]*?)var\(\s*--mp-(colors-)?([a-z0-9-]+)\s*\)/g, (m, lead, colors, token) => {
        const hex = TOKEN_HEX[token]
        if (!hex) return m                                 // unknown token
        if (!STRUCTURAL_PROP.test(lead + 'var(')) return m  // not a border/bg/shadow decl
        n++
        return `${lead}var(--mp-${colors || ''}${token}, ${hex})`
      })
      return { out, count: n }
    },
  },
  {
    id: 'btn-size-md',
    // rule/btn-no-size-md — md is the default. ONLY strip it from <MpButton …> tags
    // (size="md" is meaningful on MpIcon/MpBadge/MpAvatar — never touch those).
    fix(src) {
      let n = 0
      const out = src.replace(/<MpButton\b[^>]*>/g, (tag) =>
        tag.replace(/\s+size=(["'])md\1/g, () => { n++; return '' }))
      return { out, count: n }
    },
  },
]

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.output' || name === '.nuxt' || name === 'dist') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (extname(p) === '.vue') acc.push(p)
  }
  return acc
}

const args = process.argv.slice(2)
const check = args.includes('--check')
const paths = args.filter((a) => !a.startsWith('--'))
const roots = paths.length ? paths : ['app']

const files = []
for (const r of roots) {
  const st = statSync(r)
  if (st.isDirectory()) walk(r, files)
  else if (extname(r) === '.vue') files.push(r)
}

let changedFiles = 0
const perFixer = {}
for (const file of files) {
  let src = readFileSync(file, 'utf8')
  const before = src
  const applied = []
  for (const f of FIXERS) {
    const { out, count } = f.fix(src)
    if (count > 0) { src = out; applied.push(`${f.id}×${count}`); perFixer[f.id] = (perFixer[f.id] || 0) + count }
  }
  if (src !== before) {
    changedFiles++
    if (check) console.log(`would fix  ${file}  [${applied.join(', ')}]`)
    else { writeFileSync(file, src); console.log(`fixed      ${file}  [${applied.join(', ')}]`) }
  }
}

const summary = Object.entries(perFixer).map(([k, v]) => `${k}: ${v}`).join(', ') || 'nothing'
console.log(`\n${check ? 'would change' : 'changed'} ${changedFiles} file(s) — ${summary}`)
if (check && changedFiles > 0) process.exit(1)
