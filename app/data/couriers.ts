import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Courier master data — the list of shipping/courier services available when
 * handing over a shipment. Snapshot-persisted + resettable, same pattern as
 * storageLevels.ts.
 */
export interface Courier {
  id: string
  name: string
  updatedAt?: string
  updatedBy?: string
}

const SEED_NAMES = [
  'JNT Express', 'JNT Hemat', 'JNT Jemari', 'JNT Cargo',
  'AnterAja REG', 'AnterAja Economy', 'AnterAja Instant Hemat', 'Anteraja Cargo', 'Anteraja Next Day', 'Anteraja Same Day',
  'GoSend Same Day', 'GoSend Instant',
  'GrabExpress Sameday', 'GrabExpress Instant', 'GrabExpress Instant Car',
  'Indah Logistik',
  'JNE CTC', 'JNE REG', 'JNE OKE', 'JNE YES', 'JNE Trucking',
  'Lion Parcel REG', 'Lion Parcel ONEPACK',
  'Ninja Xpress',
  'RPX NDP', 'RPX RGP',
  'SAP Reguler', 'SAP One Day Service', 'SAP Same Day Service',
  'SiCepat REG', 'SiCepat BEST', 'SiCepat HALU', 'SiCepat Gokil',
  'TIKI Reguler', 'TIKI Over Night Service', 'TIKO Economy', 'TIKI TDS',
  'WAHANA Economy', 'WAHANA Regular',
  'POS Indonesia Regular',
  'REX Kargo',
  'Paxel Same Day', 'Paxel Next Day',
  'Pos Kilat Khusus',
  'ID Express', 'ID Express Cargo',
  'Bluebird Kirim (Instant)',
  'DPEX Express Parcel',
  'ShopeeXpress Standard', 'ShopeeXpress Instant', 'ShopeeXpress Instant Prioritas',
  'SPX Standard', 'SPX Hemat',
  'LEX',
  'SF Express',
  'Zalora Express (ZDEX)',
  'Kerry Express',
  'JExpress',
  'Index',
  'GoTo Logistic Hemat', 'GoTo Logistic Cargo', 'GoTo Logistic Regular', 'GoTo Logistic Sameday', 'GoTo Logistic Next Day',
  'DHL',
  'Janio',
  'Sentral Cargo',
  'Blitz Instant',
  'Kurir Toko',
  'Lainnya',
]

const SEED: Courier[] = SEED_NAMES.map((name, i) => ({ id: `crt-${String(i + 1).padStart(3, '0')}`, name }))

const KEY = 'couriers-v1'
const snap = loadSnapshot<Courier>(KEY)
export const couriers = reactive<Courier[]>(snap ?? SEED.map(c => ({ ...c })))
function persist(): void { saveSnapshot(KEY, couriers) }

export function addCourier(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const id = `crt-${String(Date.now())}`
  couriers.push({ id, name: trimmed, updatedAt: new Date().toISOString(), updatedBy: 'Rizal Candra' })
  persist()
}

export function updateCourier(id: string, name: string): void {
  const c = couriers.find(x => x.id === id)
  if (!c) return
  const trimmed = name.trim()
  if (!trimmed) return
  c.name = trimmed
  c.updatedAt = new Date().toISOString()
  c.updatedBy = 'Rizal Candra'
  persist()
}

export function deleteCourier(id: string): void {
  const idx = couriers.findIndex(x => x.id === id)
  if (idx === -1) return
  couriers.splice(idx, 1)
  persist()
}
