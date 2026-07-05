import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Storage level master data — the single source for the 7 level labels used across
 * the app (the Storage locations master page edits them; the warehouse "New location"
 * drawer + location details read them). Each level has a stable `key` (used internally
 * for codes/defaults) and an editable display `name`. Snapshot-persisted + resettable.
 */
export type LocType = 'Organizational' | 'Storage'
export interface StorageLevel {
  key: string
  name: string
  description: string
  defaultType: LocType
  updatedAt?: string
  updatedBy?: string
}

const SEED: StorageLevel[] = [
  { key: 'Floor', name: 'Floor', description: 'A floor or building level.', defaultType: 'Organizational' },
  { key: 'Zone', name: 'Zone', description: 'A zone or area within a floor.', defaultType: 'Organizational' },
  { key: 'Aisle', name: 'Aisle', description: 'An aisle or walkway between rows of racks.', defaultType: 'Organizational' },
  { key: 'Row', name: 'Row', description: 'A row of racks within an aisle.', defaultType: 'Organizational' },
  { key: 'Rack', name: 'Rack', description: 'A rack or shelving unit that holds stock.', defaultType: 'Storage' },
  { key: 'Shelf', name: 'Shelf', description: 'A shelf level within a rack.', defaultType: 'Storage' },
  { key: 'Bin', name: 'Bin', description: 'A bin — the smallest location where stock is placed.', defaultType: 'Storage' },
]

const KEY = 'storage-levels-v1'
const snap = loadSnapshot<StorageLevel>(KEY)
export const storageLevels = reactive<StorageLevel[]>(snap ?? SEED.map(s => ({ ...s })))
function persist(): void { saveSnapshot(KEY, storageLevels) }

/** Canonical level keys in hierarchy order (never edited). */
export const STORAGE_LEVEL_KEYS = SEED.map(s => s.key)

export function levelLabel(key: string): string { return storageLevels.find(l => l.key === key)?.name ?? key }
export function levelDefaultType(key: string): LocType { return storageLevels.find(l => l.key === key)?.defaultType ?? 'Organizational' }
/** Options for the level picker — label is the (editable) name, value is the key. */
export function levelOptions() { return storageLevels.map(l => ({ label: l.name, value: l.key })) }

/** Edit a level's name, description and default type (Storage locations master). */
export function updateStorageLevel(key: string, data: { name: string; defaultType: LocType; description?: string }): void {
  const l = storageLevels.find(x => x.key === key)
  if (!l) return
  l.name = data.name.trim() || l.name
  l.defaultType = data.defaultType
  if (data.description !== undefined) l.description = data.description.trim() || '—'
  l.updatedAt = new Date().toISOString()
  l.updatedBy = 'Rizal Candra'
  persist()
}
