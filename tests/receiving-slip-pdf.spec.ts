/**
 * generateReceivingSlipPdf() builds a real jsPDF document (+ jspdf-autotable) and
 * returns it for the caller to preview/save. Printed BEFORE receiving starts, so
 * it deliberately has no Status/Start/End date fields. These tests can't
 * practically inspect the rendered PDF's pixel content, so they verify the thing
 * actually at risk of breaking: the function runs without throwing and returns a
 * real document, across a task with line items and one with none.
 */
import { describe, it, expect } from 'vitest'
import { receivingTasks } from '~/data/receivingTasks'
import { getTaskLineItems } from '~/data/receivingTaskDetails'
import { generateReceivingSlipPdf } from '~/utils/receivingSlipPdf'

describe('generateReceivingSlipPdf', () => {
  it('generates a PDF for a real seeded receiving task without throwing', async () => {
    const task = receivingTasks[0]!
    const items = getTaskLineItems(task)
    expect(items.length).toBeGreaterThan(0)
    const doc = await generateReceivingSlipPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })

  it('does not throw for a task with no line items', async () => {
    const task = receivingTasks[0]!
    const doc = await generateReceivingSlipPdf(task, [])
    expect(typeof doc.output).toBe('function')
  })

  it('draws the canceled ribbon without throwing when the task is canceled', async () => {
    const task = { ...receivingTasks[0]!, status: 'canceled' as const }
    const items = getTaskLineItems(task)
    const doc = await generateReceivingSlipPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })
})
