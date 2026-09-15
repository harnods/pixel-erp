/**
 * Batch Traceability Report — report state kept outside the page (plan Phase 3).
 *
 * The app never keep-alives pages, so the report's filters, sort, page and selection
 * live in a module-level store. That's what lets a batch's detail page send the user
 * back to the report exactly as they left it (PRD story 7), and what a mode switch has
 * to wipe (story 6).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  return import('~/composables/useBatchTraceabilityReportState')
}

let mod: Awaited<ReturnType<typeof load>>
beforeEach(async () => { mod = await load() })

describe('report state', () => {
  it('starts on By batch with nothing filtered or selected', () => {
    const { state } = mod.useBatchTraceabilityReportState()
    expect(state.mode).toBe('batch')
    expect(state.batch.productNames).toEqual([])
    expect(state.transaction.selected).toEqual([])
    expect(state.batch.table).toEqual({ search: '', sortKey: '', sortDir: 'asc', page: 1, perPage: 25 })
  })

  it('is shared: what one caller writes, the next caller (a remounted page) reads', () => {
    const first = mod.useBatchTraceabilityReportState()
    first.state.batch.productNames = ['Green Beans Arabica Gayo Grade 1']
    first.state.batch.table.page = 3
    first.state.transaction.selected = ['SD-2026-1001']

    const again = mod.useBatchTraceabilityReportState()
    expect(again.state.batch.productNames).toEqual(['Green Beans Arabica Gayo Grade 1'])
    expect(again.state.batch.table.page).toBe(3)
    expect(again.state.transaction.selected).toEqual(['SD-2026-1001'])
  })

  it('resets both searches when the mode changes, and not when it stays', () => {
    const { state, setMode } = mod.useBatchTraceabilityReportState()
    state.batch.batchNos = ['Batch #001']
    state.transaction.typeLabels = ['Work order']
    state.transaction.selected = ['WO-2026-1001']

    setMode('batch')
    expect(state.batch.batchNos).toEqual(['Batch #001'])

    setMode('transaction')
    expect(state.mode).toBe('transaction')
    expect(state.batch.batchNos).toEqual([])
    expect(state.transaction.typeLabels).toEqual([])
    expect(state.transaction.selected).toEqual([])
  })

  it('resets one search on its own without touching the other', () => {
    const { state, resetBatchSearch } = mod.useBatchTraceabilityReportState()
    state.batch.warehouseNames = ['Gudang Jakarta Pusat']
    state.transaction.selected = ['SD-2026-1001']

    resetBatchSearch()
    expect(state.batch.warehouseNames).toEqual([])
    expect(state.transaction.selected).toEqual(['SD-2026-1001'])
  })
})
