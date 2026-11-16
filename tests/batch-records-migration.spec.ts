/**
 * The batch-record store moved from `batch-records-v1` to `batch-records-v2` when lot
 * records were seeded (ATINV-9082). A user's v1 snapshot — created batches, attribute
 * edits, renames, archive flags — must survive the bump: it is loaded, the lot records
 * are added on top, and the result is saved under v2.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

const SKU = '1001'
const CREATED = {
  id: `${SKU}::new-legacy1`, sku: SKU, created: true, batchNo: 'LEGACY-V1-001',
  description: 'Saved before the v2 bump', attributes: { supplier: 'V001', grade: 'grade-a', expiry_date: '2027-05-01' },
}
const EDITED_SEED = { id: `${SKU}::seed-0`, sku: SKU, created: false, archived: true }

async function loadWith(stored: Record<string, unknown[]>) {
  vi.resetModules()
  const saved: Record<string, unknown[]> = {}
  vi.doMock('~/data/persist', async (importOriginal) => {
    const real = await importOriginal<typeof import('~/data/persist')>()
    return {
      ...real,
      loadSnapshot: (key: string) => (key in saved ? saved[key] : stored[key] ?? null),
      saveSnapshot: (key: string, items: unknown[]) => { saved[key] = JSON.parse(JSON.stringify(items)) },
    }
  })
  const store = await import('~/data/batchStore')
  return { store, saved }
}

afterEach(() => { vi.doUnmock('~/data/persist') })

describe('batch record store — v1 → v2 migration', () => {
  it('keeps a v1 created batch and archive flag, adds lot records, and saves under v2', async () => {
    const { store, saved } = await loadWith({ 'batch-records-v1': [CREATED, EDITED_SEED] })
    const recs = store.batchRecordsForSku(SKU)
    expect(recs.find((r) => r.id === CREATED.id)).toMatchObject({ batchNo: 'LEGACY-V1-001', attributes: CREATED.attributes })
    expect(recs.find((r) => r.id === EDITED_SEED.id)?.archived).toBe(true)
    expect(recs.some((r) => r.id.startsWith(`${SKU}::seed-lot-`))).toBe(true)
    const v2 = saved['batch-records-v2'] as Array<{ id: string }> | undefined
    expect(v2?.some((r) => r.id === CREATED.id)).toBe(true)
    expect(v2?.some((r) => r.id.startsWith(`${SKU}::seed-lot-`))).toBe(true)
  })

  it('does not add a lot record whose number a v1 created batch already holds', async () => {
    const clash = { ...CREATED, id: `${SKU}::new-legacy2`, batchNo: 'batch #00002' }
    const { store } = await loadWith({ 'batch-records-v1': [clash] })
    const same = store.batchRecordsForSku(SKU).filter((r) => (r.batchNo ?? '').toLowerCase() === 'batch #00002')
    expect(same.map((r) => r.id)).toEqual([clash.id])
  })

  it('prefers a v2 snapshot and never re-seeds lots on top of it', async () => {
    const { store } = await loadWith({ 'batch-records-v2': [CREATED], 'batch-records-v1': [EDITED_SEED] })
    const recs = store.batchRecordsForSku(SKU)
    expect(recs.map((r) => r.id)).toEqual([CREATED.id])
  })
})
