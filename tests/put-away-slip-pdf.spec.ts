/**
 * generatePutAwaySlipPdf() builds a real jsPDF document (+ jspdf-autotable) and
 * returns it for the caller to preview/save. Printed BEFORE put-away starts, so
 * it deliberately has no Status/Start/End date and no storage location/stored
 * qty (neither is known yet). These tests can't practically inspect the
 * rendered PDF's pixel content, so they verify the thing actually at risk of
 * breaking: the function runs without throwing and returns a real document,
 * across a task with line items and one with none.
 */
import { describe, it, expect } from 'vitest'
import { putAwayTasks } from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'
import { generatePutAwaySlipPdf } from '~/utils/putAwaySlipPdf'

describe('generatePutAwaySlipPdf', () => {
  it('generates a PDF for a real seeded put-away task without throwing', async () => {
    const task = putAwayTasks[0]!
    const items = getPutAwayLineItems(task.id)
    expect(items.length).toBeGreaterThan(0)
    const doc = await generatePutAwaySlipPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })

  it('does not throw for a task with no line items', async () => {
    const task = putAwayTasks[0]!
    const doc = await generatePutAwaySlipPdf(task, [])
    expect(typeof doc.output).toBe('function')
  })
})
