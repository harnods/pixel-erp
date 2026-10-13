/**
 * R15 — batches reserved on the work order carry through to the transfer
 * (Design Brief DB-11). Pure allocation: skip what earlier transfers sent, then
 * take what this one moves.
 */
import { describe, it, expect } from 'vitest'
import { allocateReservedBatches } from '../app/data/subcon'

const RESERVED = [
  { batchNo: 'B-001', qty: 300 },
  { batchNo: 'B-002', qty: 200 },
]

describe('allocateReservedBatches', () => {
  it('a first transfer of the whole need carries the reservation as it is', () => {
    expect(allocateReservedBatches(RESERVED, 0, 500)).toEqual(RESERVED)
  })

  it('a partial transfer takes from the first batch first', () => {
    expect(allocateReservedBatches(RESERVED, 0, 350)).toEqual([
      { batchNo: 'B-001', qty: 300 },
      { batchNo: 'B-002', qty: 50 },
    ])
  })

  it('a second transfer skips what the first one already sent', () => {
    expect(allocateReservedBatches(RESERVED, 350, 150)).toEqual([{ batchNo: 'B-002', qty: 150 }])
  })

  it('a need beyond the reservation carries only what was reserved', () => {
    // F4 — output raised: 100 m more than was ever reserved; the form picks the rest.
    expect(allocateReservedBatches(RESERVED, 500, 100)).toEqual([])
    expect(allocateReservedBatches(RESERVED, 450, 100)).toEqual([{ batchNo: 'B-002', qty: 50 }])
  })

  it('no reservation carries nothing', () => {
    expect(allocateReservedBatches([], 0, 500)).toEqual([])
  })
})
