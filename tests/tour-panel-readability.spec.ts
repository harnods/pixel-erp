/**
 * The tour panel's reading rules, applied to every step of every tour.
 *
 * The panel breaks step copy into lines, picks out figures and turns a long
 * list into bullets. None of that edits the copy, so the rules are tested
 * against the real tour content rather than a fixture: a step that a future
 * copy change would render as a wall of text fails here.
 */
import { describe, it, expect } from 'vitest'
import { clauses, recapItems, figures } from '~/tours/tourPanel'
import { allTours } from '~/tours/tourRegistry'

const steps = allTours().flatMap((t) => t.steps.map((s) => ({ tour: t.code, s })))

describe('clauses: one sentence per line', () => {
  it('never loses or invents words', () => {
    for (const { tour, s } of steps) {
      for (const text of [s.body, s.watch, s.action].filter(Boolean) as string[]) {
        const joined = clauses(text).join(' ')
        const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
        expect(words(joined), `${tour}: ${s.title}`).toEqual(words(text))
      }
    }
  })

  it('does not split inside an Indonesian figure', () => {
    for (const { tour, s } of steps) {
      for (const text of [s.body, s.watch, s.action].filter(Boolean) as string[]) {
        for (const line of clauses(text)) {
          // A line opening with a bare group of three digits is the tail of a
          // split Rp1.234.567; "3 rows" and "100%" open legitimately.
          expect(/^\d{3}[.,\s]/.test(line), `${tour}: ${line}`).toBe(false)
        }
      }
    }
  })

  it('leaves every line readable as a sentence', () => {
    for (const { tour, s } of steps) {
      for (const text of [s.body, s.watch].filter(Boolean) as string[]) {
        const lines = clauses(text)
        if (lines.length < 2) continue
        for (const line of lines) {
          // A fragment the split created is the risk; a short sentence the
          // copy really wrote ("Four lines.") is fine.
          const fromSource = text.includes(line)
          if (!fromSource) expect(line.length, `${tour}: orphan line "${line}"`).toBeGreaterThanOrEqual(12)
          // A version marker (v2) is the one lower-case opening the copy uses.
          expect(/^([A-Z0-9"']|v\d)/.test(line), `${tour}: lower-case line "${line}"`).toBe(true)
        }
      }
    }
  })

  it('keeps every line short enough to read at a glance', () => {
    for (const { tour, s } of steps) {
      for (const text of [s.body, s.watch].filter(Boolean) as string[]) {
        for (const line of clauses(text)) {
          expect(line.length, `${tour}: ${line.slice(0, 60)}…`).toBeLessThanOrEqual(220)
        }
      }
    }
  })
})

describe('figures are picked out of the prose', () => {
  it('finds every Rp amount a step quotes', () => {
    for (const { tour, s } of steps) {
      for (const text of [s.body, s.watch].filter(Boolean) as string[]) {
        const quoted = text.match(/Rp\d[\d.]*(?:,\d+)?/g) ?? []
        const found = figures(text)
        for (const q of quoted) expect(found, `${tour}: ${q}`).toContain(q)
      }
    }
  })
})

describe('the closing recap becomes a list', () => {
  it('turns a multi-part recap into items, each a readable claim', () => {
    for (const t of allTours()) {
      const items = recapItems(t.closing)
      expect(items.length, t.code).toBeGreaterThan(0)
      for (const i of items) {
        expect(i.text.length, `${t.code}: "${i.text}"`).toBeGreaterThanOrEqual(12)
        expect(/^[A-Z0-9]/.test(i.text) || i.kind === 'item', `${t.code}: "${i.text}"`).toBe(true)
      }
    }
  })

  it('does not bullet a closing that is not a list', () => {
    const items = recapItems('One thing happened. Then another thing happened.')
    expect(items.every((i) => i.kind === 'line')).toBe(true)
  })

  it('bullets a long recap rather than leaving it a paragraph', () => {
    const long = allTours().find((t) => t.closing.length > 280)!
    expect(recapItems(long.closing).some((i) => i.kind === 'item')).toBe(true)
  })
})
