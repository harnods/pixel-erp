/**
 * Regression: a file uploaded to a Dropbox tab and OCR-ed with no readable date
 * (the /api/expenses/ocr contract returns date: '' when unreadable, and on every
 * failure path — e.g. no Gemini key) used to crash the whole Expenses page with
 * "RangeError: Invalid time value", because the Date cell formatted the empty
 * string through an unguarded Intl.DateTimeFormat. The row is persisted, so the
 * page stayed dead across refreshes.
 */
import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime } from '../app/utils/date'
import { mockOcrExtraction } from '../app/data/reviewFiles'

// Mirrors normalizeOcrDate in app/data/ocrQueue.ts / safeDate in the OCR route.
function normalizeOcrDate(raw: string | undefined): string {
  const s = String(raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10) === s ? s : ''
}

describe('Dropbox OCR date guard', () => {
  it('never throws on the dates OCR can actually return', () => {
    for (const raw of ['', '-', 'unreadable', '31 Juli 2026', '2026-13-45', '2026-02-30', undefined]) {
      const stored = normalizeOcrDate(raw)
      expect(stored).toBe('')
      expect(() => formatDate(stored)).not.toThrow()
      expect(formatDate(stored)).toBe('—')
    }
  })

  it('keeps a real OCR date intact', () => {
    expect(normalizeOcrDate('2026-07-01')).toBe('2026-07-01')
    expect(formatDate('2026-07-01')).toBe('01/07/2026')
  })

  it('renders "—" for a missing upload timestamp in the Last updated column', () => {
    expect(formatDateTime('')).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
  })
})

/**
 * Offline/local behaviour: with no NUXT_GEMINI_API_KEY the OCR route returns
 * source 'fallback', and ocrQueue fills the row from mockOcrExtraction() so an
 * upload lands as a usable row instead of an all-dashes one.
 */
describe('offline OCR fallback (no Gemini key)', () => {
  it('produces a complete, renderable row every time', () => {
    for (let i = 0; i < 200; i++) {
      const r = mockOcrExtraction()
      // A real calendar date that survives the same gate a Gemini date goes through.
      expect(normalizeOcrDate(r.date)).toBe(r.date)
      expect(formatDate(r.date)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
      // No blank cells: vendor, confidence, classification and amount all filled.
      expect(r.beneficiary.name.length).toBeGreaterThan(0)
      expect(r.confidence).toBeGreaterThanOrEqual(40)
      expect(r.confidence).toBeLessThanOrEqual(100)
      expect(r.amount).toBeGreaterThan(0)
      expect(['bill', 'invoice', 'receipt', 'unclassified']).toContain(r.classification)
      // 'unclassified' documents are the ones OCR couldn't read a number off.
      if (r.classification === 'unclassified') expect(r.number).toBeUndefined()
      else expect(r.number).toBeTruthy()
    }
  })

  it('dates the document in the recent past, never the future', () => {
    const today = new Date()
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    for (let i = 0; i < 200; i++) {
      expect(mockOcrExtraction().date <= todayIso).toBe(true)
    }
  })
})
