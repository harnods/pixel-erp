/**
 * Dimensions on groups (UI side). The Groups table gets one column per Jurnal dimension the user
 * adds; each group picks its value there. No Talenta field fills a dimension any more.
 *
 * Reads the engine API when it is there (groupDimensions, addGroupDimension, removeGroupDimension,
 * GroupRow.dimensions[] = { dimension, value, explicit }) and falls back to a local copy of the
 * same rules while the engine branch has not landed, so the screen keeps compiling and working:
 * - the added dimensions are settings.groupDimensions (old snapshots: the linked dimensions);
 * - a group's value is its explicit pick, else a value of the dimension with the same name
 *   (case and space-insensitive) as any of the group's Talenta values, else empty.
 */
import * as store from './payrollStore'
import { payroll, payrollDimensions, type GroupRow, type PayrollSettings } from './payrollStore'
import { dimensions as jurnalDimensionList } from './dimensions'

type Result = { ok: boolean; message?: string }
interface EngineDims {
  /** Every Jurnal dimension a group may add, when the engine lists them. */
  jurnalDimensions?: () => string[]
  groupDimensions?: () => string[]
  addGroupDimension?: (dim: string) => Result
  removeGroupDimension?: (dim: string) => Result
}
const engine = store as unknown as EngineDims
type WithDims = PayrollSettings & { groupDimensions?: string[]; dimensionLinks?: { dimension: string }[] }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** The dimensions added to groups, in column order, read from the given settings (default: live). */
export function groupDimensionsOf(s: PayrollSettings): string[] {
  const x = s as WithDims
  return [...(x.groupDimensions ?? (x.dimensionLinks ?? []).map((l) => l.dimension))]
}
/** The dimension columns of the Groups table. */
export function groupDimensions(): string[] {
  return engine.groupDimensions ? engine.groupDimensions() : groupDimensionsOf(payroll.settings)
}
/** Every existing Jurnal dimension: the ones payroll knows plus the active ones in Settings > Dimensions. */
export function jurnalDimensions(): string[] {
  const fromSettings = jurnalDimensionList.filter((d) => d.status === 'active').map((d) => d.name)
  return [...new Set([...(engine.jurnalDimensions?.() ?? []), ...payrollDimensions(), ...fromSettings])]
}
/** Jurnal dimensions not added to groups yet, for the "+ Dimension" list. */
export function dimensionsToAdd(): string[] {
  const added = new Set(groupDimensions())
  return jurnalDimensions().filter((d) => !added.has(d)).sort((a, b) => a.localeCompare(b))
}

function localSet(next: string[]): void {
  ;(payroll.settings as WithDims).groupDimensions = next
}
export function addGroupDimension(dim: string): Result {
  if (engine.addGroupDimension) return engine.addGroupDimension(dim)
  if (!jurnalDimensions().includes(dim)) return { ok: false, message: `${dim} is not a Jurnal dimension. Pick one from the list.` }
  if (groupDimensions().includes(dim)) return { ok: false, message: `${dim} is already a column. Pick another dimension.` }
  localSet([...groupDimensions(), dim])
  return { ok: true }
}
export function removeGroupDimension(dim: string): Result {
  if (engine.removeGroupDimension) return engine.removeGroupDimension(dim)
  localSet(groupDimensions().filter((d) => d !== dim))
  return { ok: true }
}

/** The value a group gets by name: a value of the dimension named like one of its Talenta values. */
export function nameMatch(dimension: string, values: string[]): string | null {
  const wanted = new Set(values.filter((v) => v.trim()).map(norm))
  return payroll.tags.find((t) => t.dimension === dimension && wanted.has(norm(t.name)))?.name ?? null
}

export interface RowDimension { dimension: string; value: string | null; explicit: boolean }
/** One cell per added dimension for a Groups row: the engine's when it has every column, else computed here. */
export function rowDimensions(r: GroupRow, columns: string[] = groupDimensions()): RowDimension[] {
  const fromEngine = new Map((r.dimensions ?? []).map((d) => [d.dimension, d]))
  return columns.map((dimension) => {
    const e = fromEngine.get(dimension)
    if (engine.groupDimensions && e) return { dimension, value: e.value, explicit: e.explicit }
    const explicit = r.dims[dimension] ?? null
    return { dimension, value: explicit ?? nameMatch(dimension, r.values), explicit: !!explicit }
  })
}

/** Talenta values of a row that no value of the dimension matches by name: offered as "Create value". */
export function creatableValues(dimension: string, values: string[]): string[] {
  const have = new Set(payroll.tags.filter((t) => t.dimension === dimension).map((t) => norm(t.name)))
  return [...new Set(values.map((v) => v.trim()).filter((v) => v && !have.has(norm(v))))]
}
