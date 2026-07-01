import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { Warehouse } from './types'

const SEED_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-000',
    name: 'Warehouse Default',
    code: 'WH-DEFAULT',
    skuTotal: 0,
    pics: [],
    address: '-',
    status: 'active',
    hasTransactions: false,
    isDefault: true,
    updatedAt: '2026-01-01',
    updatedBy: 'System',
  },
  {
    id: 'wh-001',
    name: 'Gudang Jakarta Pusat',
    code: 'GDG-JKT-01',
    skuTotal: 30,
    pics: [{ id: 'p1', name: 'Budi Santoso' }],
    address: 'Jl. Gatot Subroto No. 21, RT 03/RW 07, Menteng Dalam, Tebet, Jakarta Selatan, DKI Jakarta 12870',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-18',
    updatedBy: 'Budi Santoso',
  },
  {
    id: 'wh-002',
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
    updatedAt: '2026-06-15',
    updatedBy: 'Dewi Rahayu',
  },
  {
    id: 'wh-003',
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
    updatedAt: '2026-06-10',
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
    updatedAt: '2026-06-19',
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
    updatedAt: '2026-06-12',
    updatedBy: 'Farhan Nugroho',
  },
  {
    id: 'wh-006',
    name: 'Gudang Makassar Selatan',
    code: 'GDG-MKS-01',
    skuTotal: 9,
    pics: [{ id: 'p10', name: 'Agus Firmansyah' }],
    address: 'Jl. Metro Tanjung Bunga No. 12, Kelurahan Tanjung Merdeka, Kecamatan Tamalate, Kota Makassar, Sulawesi Selatan 90224',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-05',
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
    updatedAt: '2026-05-20',
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
    updatedAt: '2026-06-01',
    updatedBy: 'Yusuf Hakim',
  },
  {
    id: 'wh-009',
    name: 'Gudang Jakarta Timur',
    code: 'GDG-JKT-02',
    skuTotal: 23,
    pics: [{ id: 'p13', name: 'Bayu Pradana' }],
    address: 'Jl. Raya Bekasi KM 25, Kawasan Industri Pulogadung, Kecamatan Cakung, Jakarta Timur, DKI Jakarta 13920',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-17',
    updatedBy: 'Bayu Pradana',
  },
  {
    id: 'wh-010',
    name: 'Gudang Makassar Utara',
    code: 'GDG-MKS-02',
    skuTotal: 14,
    pics: [{ id: 'p10', name: 'Agus Firmansyah' }],
    address: 'Jl. Perintis Kemerdekaan KM 12, Kelurahan Tamalanrea, Kecamatan Tamalanrea, Kota Makassar, Sulawesi Selatan 90245',
    status: 'active',
    hasTransactions: true,
    updatedAt: '2026-06-16',
    updatedBy: 'Agus Firmansyah',
  },
]

// The whole warehouse list is snapshot-persisted so BOTH created and edited records
// survive a refresh (a present snapshot wins over the seed). Reactive so the list,
// detail and forms all update live. "Reset demo data" clears the snapshot.
// Bump the key when the SEED shape/values change so stale snapshots (e.g. the old
// item-quantity skuTotal) are discarded instead of overriding the fresh seed.
const WAREHOUSES_KEY = 'warehouses-v3'
const snapshot = loadSnapshot<Warehouse>(WAREHOUSES_KEY)
export const warehouses = reactive<Warehouse[]>(snapshot ?? [...SEED_WAREHOUSES])

function persistWarehouses(): void {
  saveSnapshot(WAREHOUSES_KEY, warehouses)
}

let warehouseSeq = warehouses.filter((w) => w.id.startsWith('wh-new-')).length

const todayIso = () => new Date().toISOString().slice(0, 10)

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
    address: data.address?.trim() || '-',
    status: 'active',
    hasTransactions: false,
    description: data.description?.trim() || undefined,
    updatedAt: todayIso(),
    updatedBy: data.pics[0]?.name ?? 'You',
  }
  warehouses.unshift(wh)
  persistWarehouses()
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
  wh.name = data.name
  wh.code = data.code
  wh.address = data.address?.trim() || '-'
  wh.pics = data.pics
  wh.description = data.description?.trim() || undefined
  wh.updatedAt = todayIso()
  wh.updatedBy = data.pics[0]?.name ?? wh.updatedBy
  persistWarehouses()
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
