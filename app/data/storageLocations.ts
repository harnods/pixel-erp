import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { warehouses } from './warehouses'
import { levelDefaultType } from './storageLevels'

/**
 * Per-warehouse storage-location tree. Each node has a LEVEL (one of the master
 * level labels — Floor…Bin) and a warehouse-specific custom NAME. SKU quantities
 * are distributed to SUM to the warehouse's own `skuTotal`.
 *
 * Snapshot-persisted so user add/edit/delete survive a refresh; "Reset demo data"
 * (resetDb) clears it and the seed regenerates. The default warehouse has none.
 */
export type LocType = 'Organizational' | 'Storage'
export interface LocNode {
  id: string; level: string; name: string; type: LocType
  description?: string
  /** distinct SKUs stored at (or, for a branch, across) this location */
  skuQty: number
  /** start index into the warehouse's stock array — the location's SKU slice is
   *  [skuStart, skuStart + skuQty). Leaves tile the whole stock array exactly. */
  skuStart: number
  children: LocNode[]
}

/** Default location type per level — comes from the storage-level master data. */
export function defaultTypeForLevel(level: string): LocType {
  return levelDefaultType(level)
}


/** The level labels (master data). Also used to populate the level picker. */
export const STORAGE_LEVELS = ['Floor', 'Zone', 'Aisle', 'Row', 'Rack', 'Shelf', 'Bin']

const NAME_POOLS: Record<string, string[]> = {
  Floor:  ['Ground Floor', 'First Floor', 'Second Floor', 'Mezzanine', 'Basement'],
  Zone:   ['Dry Zone', 'Cold Zone', 'Bulk Zone', 'Receiving Zone', 'Dispatch Zone', 'Quarantine Zone'],
  Aisle:  ['Main Aisle', 'Aisle A', 'Aisle B', 'Aisle C', 'Side Aisle'],
  Row:    ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
  Rack:   ['Rack 01', 'Rack 02', 'Rack 03', 'Rack 04', 'Rack 05'],
  Shelf:  ['Top Shelf', 'Middle Shelf', 'Bottom Shelf', 'Shelf A', 'Shelf B'],
}

// ── Per-warehouse storage profile catalog ────────────────────────────────────
// Defines: which levels each warehouse uses (ordered, root→leaf), and which
// stock indices carry multiple bin locations (for demo multi-location products).
// Warehouses NOT listed here fall back to a generated profile.

export interface MultiLocEntry { idx: number; count: 2 | 3 }

interface WhStorageProfile {
  /** Ordered subset of STORAGE_LEVELS — determines tree depth and shape */
  levels: string[]
  /** Which stock indices (0-based) have more than one location, and how many */
  multiLoc: MultiLocEntry[]
  /** Digits to zero-pad auto-generated Bin names to (default 3, e.g. "Bin 001").
   *  A flat, single-level (Bin-only) warehouse reads better with fewer digits. */
  binPad?: number
  /** Extra empty bins appended AFTER the SKU partition, so they hold no stock by
   *  default and adding one never re-tiles the existing bins. Gives a warehouse a
   *  bin that no count plan covers — somewhere a stray unit can sit. Flat
   *  (Bin-only) warehouses only; the 7-level tree ignores it. */
  extraBins?: number
}

export const WH_STORAGE_PROFILES: Record<string, WhStorageProfile> = {
  // ── Flat single-level (Bin only, "Bin 01" 2-digit) — every warehouse uses
  // this simple demo shape EXCEPT wh-004, the one deliberately left with the
  // full 7-level tree (Floor/Zone/Aisle/Row/Rack/Shelf/Bin) so there's still a
  // deep hierarchy available to demo scanning against. Each warehouse keeps
  // its own original multi-location SKUs (still meaningful even at 1 level —
  // a flat tree can still have 2+ sibling Bin nodes) so existing "split
  // storage location per bin" behavior still has somewhere to demo from. ──
  'wh-001': {
    levels: ['Bin'], binPad: 2,
    multiLoc: [
      { idx: 1,  count: 2 },
      { idx: 4,  count: 2 },
      { idx: 12, count: 3 },
    ],
  },
  'wh-002': {
    levels: ['Bin'], binPad: 2,
    multiLoc: [
      { idx: 3, count: 2 },
      { idx: 9, count: 2 },
    ],
  },
  'wh-003': { levels: ['Bin'], multiLoc: [], binPad: 2 },
  // ── The one warehouse kept at the full 7-level tree, for scanning demos ──
  'wh-004': {
    levels: ['Floor', 'Zone', 'Aisle', 'Row', 'Rack', 'Shelf', 'Bin'],
    multiLoc: [
      { idx: 2, count: 2 },
      { idx: 7, count: 2 },
    ],
  },
  'wh-005': { levels: ['Bin'], multiLoc: [], binPad: 2 },
  'wh-006': { levels: ['Bin'], multiLoc: [], binPad: 2 },
  'wh-007': { levels: ['Bin'], multiLoc: [], binPad: 2 },
  // NOTE: wh-008 (Gudang Palembang) is intentionally absent — it's the seed's
  // location-less warehouse (hasStorageLocations: false), demoing the supported
  // "general stock, no bins" scenario. Do not add a profile for it.
  'wh-009': {
    levels: ['Bin'], binPad: 2,
    multiLoc: [
      { idx: 1,  count: 2 },
      { idx: 5,  count: 3 },
      { idx: 11, count: 2 },
    ],
  },
  // Bin 03 is deliberately empty — it's where the misplaced serial-tracked unit
  // in the cycle count demo sits (see DEMO_MISPLACED_SERIALS in warehouseDetails).
  'wh-010': {
    levels: ['Bin'], binPad: 2, extraBins: 1,
    multiLoc: [
      { idx: 4, count: 2 },
    ],
  },
}

/** Multi-location entries for a warehouse (empty array = all single-location). */
export function getMultiLocConfig(warehouseId: string): MultiLocEntry[] {
  return WH_STORAGE_PROFILES[warehouseId]?.multiLoc ?? []
}

// ── Tree builder ─────────────────────────────────────────────────────────────

function seedFrom(id: string): number { return Number(id.replace(/\D/g, '')) || 1 }

function buildTree(seed: number, skuTotal: number, levels: string[], binPad = 3, extraBins = 0): LocNode[] {
  if (levels.length === 0) return []
  let s = (seed * 2654435761) >>> 0
  s ^= s >>> 15; s = (s * 2246822519) >>> 0; s ^= s >>> 13; s = s >>> 0
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  let idc = 0
  const nid = () => `loc-${seed}-${idc++}`
  const levelSeq: Record<string, number> = {}

  const makeLevel = (depth: number): LocNode[] => {
    const level = levels[depth]!
    const isLeaf = depth === levels.length - 1
    // Leaf bins: 2-4 per parent. Branch nodes: 1-3 per parent.
    const count = isLeaf ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2)
    const nodes: LocNode[] = []
    for (let i = 1; i <= count; i++) {
      const seq = (levelSeq[level] = (levelSeq[level] ?? 0) + 1)
      const pool = NAME_POOLS[level]
      const name = level === 'Bin'
        ? `Bin ${String(seq).padStart(binPad, '0')}`
        : (pool ?? [level])[(seq - 1) % (pool?.length ?? 1)]!
      nodes.push({
        id: nid(), level, name,
        type: defaultTypeForLevel(level),
        skuQty: 0, skuStart: 0,
        children: isLeaf ? [] : makeLevel(depth + 1),
      })
    }
    return nodes
  }

  const roots = makeLevel(0)

  // Partition skuTotal SKUs across leaf bins — each leaf ≥1 SKU (when bins ≤ SKUs),
  // leaves tile the stock array exactly as [skuStart, +skuQty).
  const leaves: LocNode[] = []
  const collect = (nodes: LocNode[]) => nodes.forEach(n => (n.children.length ? collect(n.children) : leaves.push(n)))
  collect(roots)
  const L = leaves.length
  if (L <= skuTotal) {
    for (const leaf of leaves) leaf.skuQty = 1
    let remaining = skuTotal - L
    while (remaining-- > 0) leaves[Math.floor(rand() * L)]!.skuQty++
  } else {
    leaves.forEach((leaf, i) => { leaf.skuQty = i < skuTotal ? 1 : 0 })
  }
  let cursor = 0
  for (const leaf of leaves) { leaf.skuStart = cursor; cursor += leaf.skuQty }
  const roll = (n: LocNode): void => {
    if (!n.children.length) return
    n.children.forEach(roll)
    n.skuQty = n.children.reduce((sum, c) => sum + c.skuQty, 0)
    n.skuStart = n.children[0]!.skuStart
  }
  roots.forEach(roll)

  // Empty demo bins, appended once the partition is settled: skuQty 0 keeps them
  // out of the [skuStart, +skuQty) tiling, so the SKUs already placed above don't
  // shift. Only meaningful for a flat (Bin-only) tree, where roots ARE the leaves.
  if (extraBins > 0 && levels.length === 1) {
    for (let k = 0; k < extraBins; k++) {
      const seq = roots.length + 1
      roots.push({
        id: nid(), level: 'Bin', name: `Bin ${String(seq).padStart(binPad, '0')}`,
        type: defaultTypeForLevel('Bin'), skuQty: 0, skuStart: cursor, children: [],
      })
    }
  }
  return roots
}

// ── Snapshot store ───────────────────────────────────────────────────────────

interface WhTree { warehouseId: string; tree: LocNode[] }
// Bumped to v11 — wh-010 gains an empty Bin 03 for the misplaced-serial cycle
// count demo. (v10: every warehouse flattened to 1-level (Bin only) except
// wh-004, the one deliberately kept at the full 7-level tree.)
const KEY = 'storage-locations-v11'
const store = reactive<Record<string, LocNode[]>>({})
const snapshot = loadSnapshot<WhTree>(KEY)
if (snapshot) for (const e of snapshot) store[e.warehouseId] = e.tree

function persist(): void {
  saveSnapshot(KEY, Object.entries(store).map(([warehouseId, tree]) => ({ warehouseId, tree })))
}

let newSeq = 0
const newId = () => `loc-new-${Date.now()}-${newSeq++}`

function findNode(nodes: LocNode[], id: string): LocNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findNode(n.children, id)
    if (hit) return hit
  }
  return undefined
}
function removeNode(nodes: LocNode[], id: string): boolean {
  const i = nodes.findIndex(n => n.id === id)
  if (i >= 0) { nodes.splice(i, 1); return true }
  return nodes.some(n => removeNode(n.children, id))
}

/** The warehouse's location tree (seeded on first access, then persisted on change). */
export function getStorageTree(warehouseId: string): LocNode[] {
  if (!store[warehouseId]) {
    const wh = warehouses.find(w => w.id === warehouseId)
    if (wh?.isDefault || !wh?.skuTotal || wh?.hasStorageLocations === false) {
      store[warehouseId] = []
    } else {
      const profile = WH_STORAGE_PROFILES[warehouseId]
      const levels = profile?.levels ?? STORAGE_LEVELS  // fallback: full 7-level
      store[warehouseId] = buildTree(seedFrom(warehouseId), wh.skuTotal, levels, profile?.binPad, profile?.extraBins)
    }
  }
  return store[warehouseId]!
}

/**
 * For each stock index [0, skuTotal), the NAME-path of the leaf bin that holds it
 * (root → leaf names, e.g. "Cold Zone / Aisle A / Rack 02 / Bin 005").
 */
export function stockLocationPaths(warehouseId: string): string[] {
  const paths: string[] = []
  const walk = (nodes: LocNode[], trail: string[]) => {
    for (const n of nodes) {
      const here = [...trail, n.name]
      if (n.children.length) walk(n.children, here)
      else {
        const p = here.join(' / ')
        for (let i = 0; i < n.skuQty; i++) paths[n.skuStart + i] = p
      }
    }
  }
  walk(getStorageTree(warehouseId), [])
  return paths
}

export interface StorageLeaf { id: string; path: string; type: LocType }

/**
 * Every LEAF location in a warehouse's tree (root → name path included) — the
 * candidate set for reservation priority (auto-selection only ranks Storage-type
 * leaves; Organizational nodes like Floor/Zone never hold stock directly).
 */
export function getStorageLeaves(warehouseId: string): StorageLeaf[] {
  const out: StorageLeaf[] = []
  const walk = (nodes: LocNode[], trail: string[]) => {
    for (const n of nodes) {
      const here = [...trail, n.name]
      if (n.children.length) walk(n.children, here)
      else out.push({ id: n.id, path: here.join(' / '), type: n.type })
    }
  }
  walk(getStorageTree(warehouseId), [])
  return out
}

/** A location node + its ancestor path (root → node), for the detail page. */
export function findLocation(warehouseId: string, locId: string): { node: LocNode; path: LocNode[] } | undefined {
  const walk = (nodes: LocNode[], trail: LocNode[]): { node: LocNode; path: LocNode[] } | undefined => {
    for (const n of nodes) {
      const here = [...trail, n]
      if (n.id === locId) return { node: n, path: here }
      const hit = walk(n.children, here)
      if (hit) return hit
    }
    return undefined
  }
  return walk(getStorageTree(warehouseId), [])
}

interface NewLoc { level: string; name: string; type: LocType }
export function addRootLocation(warehouseId: string, data: NewLoc): void {
  getStorageTree(warehouseId).push({ id: newId(), level: data.level, name: data.name, type: data.type, skuQty: 0, skuStart: 0, children: [] })
  persist()
}
export function addSubLocation(warehouseId: string, parentId: string, data: NewLoc): void {
  const parent = findNode(getStorageTree(warehouseId), parentId)
  if (parent) parent.children.push({ id: newId(), level: data.level, name: data.name, type: data.type, skuQty: 0, skuStart: 0, children: [] })
  persist()
}
/** Edit an existing location's level, name, type and description. */
export function updateLocation(warehouseId: string, id: string, data: { level: string; name: string; type: LocType; description?: string }): void {
  const node = findNode(getStorageTree(warehouseId), id)
  if (node) { node.level = data.level; node.name = data.name; node.type = data.type; node.description = data.description ?? ''; persist() }
}

export function deleteLocation(warehouseId: string, id: string): void {
  removeNode(getStorageTree(warehouseId), id)
  persist()
}
