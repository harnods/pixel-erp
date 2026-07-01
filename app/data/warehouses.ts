import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { Warehouse } from './types'

const SEED_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-000',
    description: 'Gudang utama',
    name: 'Warehouse Default',
    code: 'WH-DEFAULT',
    skuTotal: 0,
    pics: [],
    address: '—',
    status: 'active',
    hasTransactions: false,
    isDefault: true,
    updatedAt: '2026-01-01T09:15:00',
    updatedBy: 'System',
  },
  {
    id: 'wh-001',
    description: 'Gudang utama untuk wilayah Jakarta dan sekitarnya',
    name: 'Gudang Jakarta Pusat',
    code: 'GDG-JKT-01',
    skuTotal: 30,
    pics: [{ id: 'p1', name: 'Budi Santoso' }],
    address: 'Jl. Gatot Subroto No. 21, RT 03/RW 07, Menteng Dalam, Tebet, Jakarta Selatan, DKI Jakarta 12870',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-18T14:30:00',
    updatedBy: 'Budi Santoso',
  },
  {
    id: 'wh-002',
    description: 'Gudang distribusi wilayah Jawa Timur',
    name: 'Gudang Surabaya Timur',
    code: 'GDG-SBY-01',
    skuTotal: 19,
    pics: [
      { id: 'p2', name: 'Dewi Rahayu' },
      { id: 'p3', name: 'Rizki Pratama' },
    ],
    address: 'Jl. Ahmad Yani No. 18, Kelurahan Margorejo, Kecamatan Wonocolo, Surabaya Timur, Jawa Timur 60238',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-15T11:05:00',
    updatedBy: 'Dewi Rahayu',
  },
  {
    id: 'wh-003',
    description: 'Gudang industri kawasan Bandung Selatan',
    name: 'Gudang Bandung Selatan',
    code: 'GDG-BDG-01',
    skuTotal: 12,
    pics: [
      { id: 'p4', name: 'Sari Indah' },
      { id: 'p5', name: 'Hendra Wijaya' },
      { id: 'p6', name: 'Andi Kusuma' },
    ],
    address: 'Kawasan Industri Bandung, Jl. Cisirung No. 44A, Kecamatan Dayeuhkolot, Kabupaten Bandung, Jawa Barat 40256',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-10T16:45:00',
    updatedBy: 'Sari Indah',
  },
  {
    id: 'wh-004',
    name: 'Gudang Medan Baru',
    code: 'GDG-MDN-01',
    skuTotal: 21,
    pics: [{ id: 'p7', name: 'Ratna Sari' }],
    address: 'Jl. Letjen Jamin Ginting No. 77, Padang Bulan, Kecamatan Medan Baru, Kota Medan, Sumatera Utara 20155',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-19T10:20:00',
    updatedBy: 'Ratna Sari',
  },
  {
    id: 'wh-005',
    name: 'Gudang Semarang Industrial',
    code: 'GDG-SMG-01',
    skuTotal: 16,
    pics: [
      { id: 'p8', name: 'Farhan Nugroho' },
      { id: 'p9', name: 'Lestari Putri' },
    ],
    address: 'Jl. Kaligawe Raya No. 5, Kawasan Industri Terboyo, Kecamatan Genuk, Kota Semarang, Jawa Tengah 50117',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-12T13:50:00',
    updatedBy: 'Farhan Nugroho',
  },
  {
    id: 'wh-006',
    description: 'Gudang distribusi wilayah Makassar dan Indonesia Timur',
    name: 'Gudang Makassar Selatan',
    code: 'GDG-MKS-01',
    skuTotal: 9,
    pics: [{ id: 'p10', name: 'Agus Firmansyah' }],
    address: 'Jl. Metro Tanjung Bunga No. 12, Kelurahan Tanjung Merdeka, Kecamatan Tamalate, Kota Makassar, Sulawesi Selatan 90224',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-05T15:10:00',
    updatedBy: 'Agus Firmansyah',
  },
  {
    id: 'wh-007',
    name: 'Gudang Bali Kuta',
    code: 'GDG-DPS-01',
    skuTotal: 8,
    pics: [{ id: 'p11', name: 'Ni Made Ayu' }],
    address: 'Jl. Raya Kuta No. 88, Kelurahan Kuta, Kecamatan Kuta, Kabupaten Badung, Bali 80361',
    status: 'archived',
    hasTransactions: true,
    updatedAt: '2026-05-20T08:40:00',
    updatedBy: 'Ni Made Ayu',
  },
  {
    id: 'wh-008',
    name: 'Gudang Palembang',
    code: 'GDG-PLB-01',
    skuTotal: 0,
    pics: [{ id: 'p12', name: 'Yusuf Hakim' }],
    address: 'Jl. POM X No. 33, Kelurahan Srijaya, Kecamatan Alang-Alang Lebar, Kota Palembang, Sumatera Selatan 30153',
    status: 'active',
    hasTransactions: false,
    updatedAt: '2026-06-01T17:25:00',
    updatedBy: 'Yusuf Hakim',
  },
  {
    id: 'wh-009',
    description: 'Gudang fulfillment wilayah Jakarta Timur dan sekitarnya',
    name: 'Gudang Jakarta Timur',
    code: 'GDG-JKT-02',
    skuTotal: 23,
    pics: [{ id: 'p13', name: 'Bayu Pradana' }],
    address: 'Jl. Raya Bekasi KM 25, Kawasan Industri Pulogadung, Kecamatan Cakung, Jakarta Timur, DKI Jakarta 13920',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-17T12:35:00',
    updatedBy: 'Bayu Pradana',
  },
  {
    id: 'wh-010',
    description: 'Gudang fulfillment wilayah Makassar Utara dan sekitarnya',
    name: 'Gudang Makassar Utara',
    code: 'GDG-MKS-02',
    skuTotal: 14,
    pics: [{ id: 'p10', name: 'Agus Firmansyah' }],
    address: 'Jl. Perintis Kemerdekaan KM 12, Kelurahan Tamalanrea, Kecamatan Tamalanrea, Kota Makassar, Sulawesi Selatan 90245',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-16T09:55:00',
    updatedBy: 'Agus Firmansyah',
  },
]

// The whole warehouse list is snapshot-persisted so BOTH created and edited records
// survive a refresh (a present snapshot wins over the seed). Reactive so the list,
// detail and forms all update live. "Reset demo data" clears the snapshot.
// Bump the key when the SEED shape/values change so stale snapshots (e.g. the old
// item-quantity skuTotal) are discarded instead of overriding the fresh seed.
const WAREHOUSES_KEY = 'warehouses-v5'
const snapshot = loadSnapshot<Warehouse>(WAREHOUSES_KEY)
export const warehouses = reactive<Warehouse[]>(snapshot ?? [...SEED_WAREHOUSES])

function persistWarehouses(): void {
  saveSnapshot(WAREHOUSES_KEY, warehouses)
}

let warehouseSeq = warehouses.filter((w) => w.id.startsWith('wh-new-')).length

// ── Real activity log — records what actually changed on create/edit ──────────────
// The person performing the action (back-office account, mirrors ErpUserMenu).
const ACTING_USER = 'Rizal Candra'
export interface WarehouseActivityRow {
  warehouseId: string
  date: string        // ISO — the real moment of the change
  user: string
  activity: string    // 'Created' | 'Edited'
  details: { label: string; value: string }[]
}
const ACTIVITY_KEY = 'warehouse-activity-v1'
export const warehouseActivityLog = reactive<WarehouseActivityRow[]>(
  loadSnapshot<WarehouseActivityRow>(ACTIVITY_KEY) ?? [],
)
function persistActivity(): void { saveSnapshot(ACTIVITY_KEY, warehouseActivityLog) }
function logActivity(warehouseId: string, activity: string, details: { label: string; value: string }[]): void {
  if (!details.length) return
  warehouseActivityLog.unshift({ warehouseId, date: new Date().toISOString(), user: ACTING_USER, activity, details })
  persistActivity()
}
/** Activity rows for a warehouse, newest first. */
export function getWarehouseActivity(id: string): WarehouseActivityRow[] {
  return warehouseActivityLog.filter((r) => r.warehouseId === id)
}

/** Create a warehouse from the New warehouse form — persists + shows in the list. */
export function addWarehouse(data: {
  name: string
  code: string
  address?: string
  description?: string
  pics: { id: string; name: string }[]
}): Warehouse {
  const n = warehouseSeq++
  const wh: Warehouse = {
    id: `wh-new-${n}`,
    name: data.name,
    code: data.code,
    skuTotal: 0,
    pics: data.pics,
    address: data.address?.trim() || '—',
    status: 'active',
    hasTransactions: false,
    description: data.description?.trim() || undefined,
    updatedAt: new Date().toISOString(),
    updatedBy: ACTING_USER,
  }
  warehouses.unshift(wh)
  persistWarehouses()
  logActivity(wh.id, 'Created', [
    { label: 'Name', value: wh.name },
    { label: 'Code', value: wh.code },
    { label: 'PIC', value: wh.pics.map((p) => p.name).join(', ') || '—' },
    { label: 'Address', value: wh.address },
    { label: 'Description', value: wh.description || '—' },
  ])
  return wh
}

/** Update an existing warehouse from the Edit warehouse form — persists the change. */
export function updateWarehouse(id: string, data: {
  name: string
  code: string
  address?: string
  description?: string
  pics: { id: string; name: string }[]
}): Warehouse | undefined {
  const wh = warehouses.find((w) => w.id === id)
  if (!wh) return undefined

  // capture the "before" values so the activity log records only what actually changed
  const before = {
    name: wh.name,
    code: wh.code,
    address: wh.address,
    description: wh.description || '—',
    pics: wh.pics.map((p) => p.name).join(', ') || '—',
  }
  const after = {
    name: data.name,
    code: data.code,
    address: data.address?.trim() || '—',
    description: data.description?.trim() || '—',
    pics: data.pics.map((p) => p.name).join(', ') || '—',
  }
  const changes: { label: string; value: string }[] = []
  if (after.name !== before.name) changes.push({ label: 'Name', value: `${before.name} → ${after.name}` })
  if (after.code !== before.code) changes.push({ label: 'Code', value: `${before.code} → ${after.code}` })
  if (after.pics !== before.pics) changes.push({ label: 'PIC', value: `${before.pics} → ${after.pics}` })
  if (after.address !== before.address) changes.push({ label: 'Address', value: `${before.address} → ${after.address}` })
  if (after.description !== before.description) changes.push({ label: 'Description', value: `${before.description} → ${after.description}` })

  // First edit of a seed warehouse (no Created entry yet) → freeze the ORIGINAL
  // values as a Created entry, so Created keeps the old values and Edited shows old → new.
  if (!getWarehouseActivity(id).some((r) => r.activity === 'Created')) {
    warehouseActivityLog.push({
      warehouseId: id,
      date: new Date(wh.updatedAt).toISOString(),
      user: wh.updatedBy,
      activity: 'Created',
      details: [
        { label: 'Name', value: before.name },
        { label: 'Code', value: before.code },
        { label: 'PIC', value: before.pics },
        { label: 'Address', value: before.address },
        { label: 'Description', value: before.description },
      ],
    })
    persistActivity()
  }

  wh.name = data.name
  wh.code = data.code
  wh.address = data.address?.trim() || '—'
  wh.pics = data.pics
  wh.description = data.description?.trim() || undefined
  wh.updatedAt = new Date().toISOString()
  wh.updatedBy = ACTING_USER
  persistWarehouses()
  logActivity(wh.id, 'Edited', changes)
  return wh
}

/** PIC names for a warehouse (empty when none / unknown id). */
export function warehousePics(warehouseId: string): string[] {
  return warehouses.find((w) => w.id === warehouseId)?.pics.map((p) => p.name) ?? []
}

/**
 * The staff member responsible for work in a warehouse. A warehouse may have
 * several PICs; `seed` rotates among them deterministically so the same task
 * always resolves to the same person. Falls back to a shared back-office name
 * when the warehouse has no PIC on record.
 */
export function picForWarehouse(warehouseId: string, seed = 0): string {
  const pics = warehousePics(warehouseId)
  if (!pics.length) return 'Rizal Candra'
  return pics[Math.abs(seed) % pics.length]!
}
