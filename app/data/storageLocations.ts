import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { warehouses } from './warehouses'
import { levelDefaultType } from './storageLevels'

/**
 * Per-warehouse storage-location tree. Each node has a LEVEL (one of the master
 * level labels — Floor…Bin) and a warehouse-specific custom NAME (the master data
 * only defines the level labels; names are chosen per warehouse). SKU quantities are
 * distributed to SUM to the warehouse's own `skuTotal` — an empty warehouse shows 0.
 *
 * Snapshot-persisted so user add/edit/delete survive a refresh; "Reset demo data"
 * (resetDb) clears it and the seed regenerates. The default warehouse has none.
 */
export type LocType = 'Organizational' | 'Storage'
export interface LocNode {
  id: string; level: string; code: string; name: string; type: LocType
  /** distinct SKUs stored at (or, for a branch, across) this location */
  skuQty: number
  /** start index into the warehouse's stock array — the location's SKU slice is
   *  [skuStart, skuStart + skuQty). Leaves tile the whole stock array exactly, so
   *  the tree's totals stay in sync with the warehouse SKU total. */
  skuStart: number
  children: LocNode[]
}

/** Default location type per level — comes from the storage-level master data. */
export function defaultTypeForLevel(level: string): LocType {
  return levelDefaultType(level)
}

/** Spreadsheet-style column letters (1→A … 26→Z, 27→AA …) so codes never overflow. */
function toCol(n: number): string {
  let s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s || 'A'
}

/**
 * Short storage code for the i-th location of a level. `i` is a WAREHOUSE-WIDE
 * sequence (not per-parent), so codes are unique within a warehouse: Floor→L1,
 * Zone→ZA, Aisle→A01, Row→R01, Rack→RK01, Shelf→SA, Bin→B001. The level prefixes
 * are all distinct, so codes never collide across levels either.
 */
export function locCodeFor(level: string, i: number): string {
  const p2 = String(i).padStart(2, '0')
  const p3 = String(i).padStart(3, '0')
  switch (level) {
    case 'Floor': return `L${i}`
    case 'Zone': return `Z${toCol(i)}`
    case 'Aisle': return `A${p2}`
    case 'Row': return `R${p2}`
    case 'Rack': return `RK${p2}`
    case 'Shelf': return `S${toCol(i)}`
    case 'Bin': return `B${p3}`
    default: return `${level.slice(0, 2).toUpperCase()}${i}`
  }
}

/** The level labels (master data). Also used to populate the level picker. */
export const STORAGE_LEVELS = ['Floor', 'Zone', 'Aisle', 'Row', 'Rack', 'Shelf', 'Bin']

// Sample custom names per level, so seed data looks warehouse-specific (not "Floor 1").
const NAME_POOLS: Record<string, string[]> = {
  Floor: ['Ground Floor', 'First Floor', 'Second Floor', 'Mezzanine', 'Basement'],
  Zone: ['Dry Zone', 'Cold Zone', 'Bulk Zone', 'Receiving Zone', 'Dispatch Zone', 'Quarantine Zone'],
  Aisle: ['Main Aisle', 'Aisle A', 'Aisle B', 'Aisle C', 'Side Aisle'],
  Row: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
  Rack: ['Rack 01', 'Rack 02', 'Rack 03', 'Rack 04', 'Rack 05'],
  Shelf: ['Top Shelf', 'Middle Shelf', 'Bottom Shelf', 'Shelf A', 'Shelf B'],
}

function seedFrom(id: string): number { return Number(id.replace(/\D/g, '')) || 1 }

function buildTree(seed: number, skuTotal: number): LocNode[] {
  let s = (seed * 2654435761) >>> 0
  s ^= s >>> 15; s = (s * 2246822519) >>> 0; s ^= s >>> 13; s = s >>> 0
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  // 5..7 levels — the leaf level is always a Storage level (Rack / Shelf / Bin), never
  // an Organizational one. Stock lives only in Storage leaves, so a warehouse can never
  // be all-Organizational yet hold SKUs.
  const maxDepth = 5 + Math.floor(rand() * 3)
  const offset = Math.floor(rand() * 10)
  let idc = 0
  const nid = () => `loc-${seed}-${idc++}`
  // Warehouse-wide running index per level → codes (and bin names) are unique per warehouse.
  const levelSeq: Record<string, number> = {}
  const makeLevel = (depth: number): LocNode[] => {
    const level = STORAGE_LEVELS[depth]!
    const isLeaf = depth === maxDepth - 1
    const count = isLeaf ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2)
    const nodes: LocNode[] = []
    for (let i = 1; i <= count; i++) {
      const seq = (levelSeq[level] = (levelSeq[level] ?? 0) + 1)
      const code = locCodeFor(level, seq)
      const name = level === 'Bin'
        ? `Bin ${String(seq).padStart(3, '0')}`
        : (NAME_POOLS[level] ?? [level])[(offset + seq - 1) % (NAME_POOLS[level]?.length ?? 1)]!
      nodes.push({ id: nid(), level, code, name, type: defaultTypeForLevel(level), skuQty: 0, skuStart: 0, children: isLeaf ? [] : makeLevel(depth + 1) })
    }
    return nodes
  }
  const roots = makeLevel(0)

  // Partition the warehouse's `skuTotal` distinct SKUs across the leaf bins so the
  // tree stays IN SYNC with the warehouse SKU total: every SKU lives in exactly one
  // bin, each leaf holds ≥1 (when there are no more bins than SKUs), and the leaf
  // counts sum to skuTotal. Each leaf gets a contiguous slice [skuStart, +skuQty) of
  // the stock array, so leaves tile it exactly.
  const leaves: LocNode[] = []
  const collect = (nodes: LocNode[]) => nodes.forEach(n => (n.children.length ? collect(n.children) : leaves.push(n)))
  collect(roots)
  const L = leaves.length
  if (L <= skuTotal) {
    for (const leaf of leaves) leaf.skuQty = 1
    let remaining = skuTotal - L
    while (remaining-- > 0) leaves[Math.floor(rand() * L)]!.skuQty++ // scatter the rest
  } else {
    // more bins than SKUs — only the first skuTotal bins hold one SKU each
    leaves.forEach((leaf, i) => { leaf.skuQty = i < skuTotal ? 1 : 0 })
  }
  // cumulative start index → contiguous, non-overlapping slices covering [0, skuTotal)
  let cursor = 0
  for (const leaf of leaves) { leaf.skuStart = cursor; cursor += leaf.skuQty }
  // roll up: a branch's SKU count is the sum of its children; its start is its first
  // child's start (children are ordered, slices are contiguous).
  const roll = (n: LocNode): void => {
    if (!n.children.length) return
    n.children.forEach(roll)
    n.skuQty = n.children.reduce((sum, c) => sum + c.skuQty, 0)
    n.skuStart = n.children[0]!.skuStart
  }
  roots.forEach(roll)
  return roots
}

interface WhTree { warehouseId: string; tree: LocNode[] }
const KEY = 'storage-locations-v8'
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

/** The warehouse's location tree (seeded on first access, then persisted on change).
 *  The default warehouse is a system placeholder with no stock → no locations. */
export function getStorageTree(warehouseId: string): LocNode[] {
  if (!store[warehouseId]) {
    const wh = warehouses.find(w => w.id === warehouseId)
    // Default / empty (0-SKU) warehouses have no storage locations.
    store[warehouseId] = (wh?.isDefault || !wh?.skuTotal) ? [] : buildTree(seedFrom(warehouseId), wh.skuTotal)
  }
  return store[warehouseId]!
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

interface NewLoc { level: string; name: string; code: string; type: LocType }
export function addRootLocation(warehouseId: string, data: NewLoc): void {
  getStorageTree(warehouseId).push({ id: newId(), level: data.level, code: data.code, name: data.name, type: data.type, skuQty: 0, skuStart: 0, children: [] })
  persist()
}
export function addSubLocation(warehouseId: string, parentId: string, data: NewLoc): void {
  const parent = findNode(getStorageTree(warehouseId), parentId)
  if (parent) parent.children.push({ id: newId(), level: data.level, code: data.code, name: data.name, type: data.type, skuQty: 0, skuStart: 0, children: [] })
  persist()
}
/** Suggested next code for a level — warehouse-wide unique (never collides with an
 *  existing code anywhere in this warehouse's tree). */
export function suggestCode(warehouseId: string, _parentId: string | null, level: string): string {
  const tree = getStorageTree(warehouseId)
  const used = new Set<string>()
  let levelCount = 0
  const walk = (ns: LocNode[]) => ns.forEach(n => { used.add(n.code); if (n.level === level) levelCount++; walk(n.children) })
  walk(tree)
  let seq = levelCount + 1
  let code = locCodeFor(level, seq)
  while (used.has(code)) code = locCodeFor(level, ++seq)
  return code
}
export function deleteLocation(warehouseId: string, id: string): void {
  removeNode(getStorageTree(warehouseId), id)
  persist()
}
