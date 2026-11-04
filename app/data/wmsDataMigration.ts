/**
 * WMS data migration — mock source for the "WMS data migration" landing
 * (prod: jurnal-accounting-frontend /v3/wms-data-migration). Seeded from that
 * repo's fixture (src/mocks/fixtures/wmsDataMigration.ts): one WMS source per
 * company, 30 in-scope products, conversion date 01/01/2026, not started.
 */
import { reactive } from 'vue'

export type WmsMigrationStatus = 'not_started' | 'in_progress' | 'draft' | 'published'

export interface WmsMigrationSource {
  key: 'wms'
  name: string
  status: WmsMigrationStatus
  /** In-scope products — shares its population with the coverage bar. */
  productCount: number
  /** Every snapshotted row; the difference is archived WMS products. */
  productTotal: number
  conversionDate: string | null // ISO
  lastSyncedAt: string | null   // ISO datetime
  setUp: number                 // products mapped
}

export const wmsMigrationSource = reactive<WmsMigrationSource>({
  key: 'wms',
  name: 'WMS inventory and costing',
  status: 'not_started',
  productCount: 30,
  productTotal: 30,
  conversionDate: '2026-01-01',
  lastSyncedAt: null,
  setUp: 0,
})

/** Resync: pulls new WMS products into the snapshot (two archived ones surface). */
export function resyncWmsMigrationSource() {
  wmsMigrationSource.productTotal = wmsMigrationSource.productCount + 2
  wmsMigrationSource.lastSyncedAt = new Date().toISOString()
}
