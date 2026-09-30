/**
 * Bulk edit, the parts the register's screens need on top of assetBulkEdit.ts.
 *
 * FG4-AC3: a location is chosen from the maintained list, never typed, and a
 * custodian from the custodian list, the same lists the custody drawer uses.
 * A value outside them refuses the whole plan before anything changes.
 *
 * FG4-AC2 / OD-34: every asset a bulk edit touches gets its own History line
 * (old value, new value, who, when, and the operation number), and so does
 * the reversal. Session only; cleared with the store.
 */
import { ref } from 'vue'
import { actingUser, onAssetStoreReset } from './assetStore'
import { assetLocations, CUSTODIANS, sessionStamp } from './assetCustody'
import {
  planBulkEdit, applyBulkEdit, reverseBulkEdit, bulkOperations, BULK_FIELDS,
  type BulkField, type BulkPlan, type BulkResult,
} from './assetBulkEdit'

/** The fields whose value comes from a maintained list rather than a fixed set. */
export const LIST_FIELDS: BulkField[] = ['location', 'custodian']

export function bulkLocationOptions() {
  return assetLocations.value.map((l) => ({ value: l.name, label: `${l.name} · ${l.branch}` }))
}
export function bulkCustodianOptions() {
  return CUSTODIANS.map((c) => ({ value: c.name, label: `${c.name} · ${c.branch}` }))
}

/** planBulkEdit, with a location or custodian refused unless it is on its list. */
export function planBulkEditFromLists(ids: string[], field: BulkField, value: string): BulkPlan {
  const plan = planBulkEdit(ids, field, value)
  if (plan.refusal || !plan.value) return plan
  if (field === 'location' && !assetLocations.value.some((l) => l.name === plan.value)) {
    return { ...plan, refusal: 'Choose a location from the list. Add a new one in Asset settings first.' }
  }
  if (field === 'custodian' && !CUSTODIANS.some((c) => c.name === plan.value)) {
    return { ...plan, refusal: 'Choose a custodian from the list' }
  }
  return plan
}

export interface BulkHistoryEntry {
  assetId: string
  /** 'Location', 'Custodian', 'Statutory group', 'Asset class' */
  field: string
  from: string
  to: string
  by: string
  at: string
  /** 'Bulk edit BE-2026-001' or 'Reversal of bulk edit BE-2026-001' */
  note: string
}

export const bulkHistory = ref<BulkHistoryEntry[]>([])
onAssetStoreReset(() => { bulkHistory.value = [] })

/** Per operation, what each asset changed from and to, so the reversal can say it back. */
const linesByOp = new Map<string, { id: string; before: string; after: string }[]>()
onAssetStoreReset(() => linesByOp.clear())

function fieldLabel(f: BulkField): string {
  return BULK_FIELDS.find((x) => x.key === f)!.label
}

/** Apply the plan and write one History line on every asset it changed. */
export function applyBulkEditWithHistory(plan: BulkPlan): BulkResult {
  if (LIST_FIELDS.includes(plan.field)) {
    const checked = planBulkEditFromLists(plan.lines.map((l) => l.id), plan.field, plan.value)
    if (checked.refusal) return { ok: false, reason: checked.refusal }
  }
  const r = applyBulkEdit(plan)
  if (!r.ok) return r
  const at = sessionStamp()
  const by = actingUser.value
  const lines = plan.affected.map((l) => ({ id: l.id, before: l.before, after: l.after }))
  linesByOp.set(r.op.number, lines)
  bulkHistory.value = [
    ...bulkHistory.value,
    ...lines.map((l) => ({ assetId: l.id, field: fieldLabel(plan.field), from: l.before, to: l.after, by, at, note: `Bulk edit ${r.op.number}` })),
  ]
  return r
}

/** Reverse an operation and write the reversal on every asset it restores. */
export function reverseBulkEditWithHistory(number: string): BulkResult {
  const r = reverseBulkEdit(number)
  if (!r.ok) return r
  const at = sessionStamp()
  const by = actingUser.value
  const lines = linesByOp.get(number) ?? r.op.items.map((it) => ({ id: it.id, before: 'Not recorded', after: r.op.value }))
  bulkHistory.value = [
    ...bulkHistory.value,
    ...lines.map((l) => ({ assetId: l.id, field: fieldLabel(r.op.field), from: l.after, to: l.before, by, at, note: `Reversal of bulk edit ${number}` })),
  ]
  return r
}

/** Newest first, as the History tab reads. */
export function bulkHistoryFor(assetId: string): BulkHistoryEntry[] {
  return bulkHistory.value.filter((e) => e.assetId === assetId).slice().reverse()
}

export { bulkOperations }
