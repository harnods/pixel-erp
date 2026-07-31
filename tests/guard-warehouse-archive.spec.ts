/**
 * Integrity guard — warehouse archive.
 *
 * A warehouse can only be archived when it is genuinely empty of work: no
 * on-hand stock (`warehouseOnHand`), no open receiving/picking tasks and no
 * draft transfers (`openTasksForWarehouse`). A stocked seed warehouse (wh-001)
 * is blocked — `canArchiveWarehouse` is false and `archiveWarehousesSafe`
 * refuses with a WAREHOUSE_NOT_EMPTY reason, leaving it active. The default
 * warehouse (wh-000) can never be archived.
 */
import { describe, it, expect } from 'vitest'
import {
  canArchiveWarehouse, archiveWarehousesSafe, warehouseOnHand, openTasksForWarehouse,
} from '~/data/integrityGuards'
import { warehouses } from '~/data/warehouses'
import '~/data/warehouseDetails'

const WH = 'wh-001'
const WH_NAME = 'Gudang Jakarta Pusat'

describe('Integrity guard — warehouse archive', () => {
  it('a stocked warehouse (on-hand > 0) cannot be archived', () => {
    expect(warehouseOnHand(WH)).toBeGreaterThan(0)
    // openTasksForWarehouse is a plain count — used by the guard alongside on-hand.
    expect(typeof openTasksForWarehouse(WH)).toBe('number')

    expect(canArchiveWarehouse(WH)).toBe(false)
    const res = archiveWarehousesSafe([WH])
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toContain('WAREHOUSE_NOT_EMPTY')
    expect(res.ok === false && res.reason).toContain(WH_NAME)

    // Refused — the warehouse is still active, not archived.
    expect(warehouses.find((w) => w.id === WH)!.status).toBe('active')
  })

  it('the default warehouse can never be archived', () => {
    const def = warehouses.find((w) => w.isDefault)!
    expect(canArchiveWarehouse(def.id)).toBe(false)
  })

  it('an already-archived warehouse reports not archivable', () => {
    const archived = warehouses.find((w) => w.status === 'archived')!
    expect(canArchiveWarehouse(archived.id)).toBe(false)
  })
})
