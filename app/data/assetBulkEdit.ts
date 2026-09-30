/**
 * OD-34. Bulk edit from the register: one field and one value applied to the
 * selected assets, with the affected count and a sample stated before
 * anything changes, and the whole operation reversible as one unit.
 *
 * Each asset's change goes through the same store functions a single edit
 * uses, so the statutory constraints (OD-02) and the roles apply unchanged.
 * An asset the value cannot apply to is named and left out, never silently
 * skipped.
 */
import { computed, ref } from 'vue'
import {
  assetRecords, ledgers, updateAssetRecord, retractEvent, actingUser, viewAs,
  onAssetStoreReset, type RecordField,
} from './assetStore'
import { STATUTORY_GROUPS } from './fixedAssets'
import {
  classifyAsset, changeAssetClass, planClassChange, groupRefusal, canClassify, canChangeClass,
  groupLifeMonths,
} from './assetTaxbook'
import { formatLife } from './assetEngine'

export type BulkField = 'taxGroup' | 'location' | 'custodian' | 'class'

export const BULK_FIELDS: { key: BulkField; label: string; hint: string }[] = [
  { key: 'taxGroup', label: 'Tax group', hint: 'Recalculates the tax book. No journal is posted.' },
  { key: 'class', label: 'Asset class', hint: 'Each asset takes the class\'s tax group, useful life and method.' },
  { key: 'location', label: 'Location', hint: 'Custody only. No figures change.' },
  { key: 'custodian', label: 'Custodian', hint: 'Custody only. No figures change.' },
]

export interface BulkLine {
  id: string
  name: string
  before: string
  after: string
  /** Why this asset is left out, when it is. */
  skip: string | null
}

export interface BulkPlan {
  field: BulkField
  value: string
  lines: BulkLine[]
  affected: BulkLine[]
  skipped: BulkLine[]
  /** Refused as a whole (role, empty value). */
  refusal: string | null
}

function currentValue(id: string, field: BulkField): string {
  const s = assetRecords.value.find((x) => x.id === id)!
  const l = ledgers.value[id]!
  switch (field) {
    case 'taxGroup': return l.taxGroup ?? 'Not set'
    case 'class': return s.class
    case 'location': return s.location ?? 'Not set'
    case 'custodian': return s.custodian ?? 'Not set'
  }
}

export function planBulkEdit(ids: string[], field: BulkField, value: string): BulkPlan {
  const v = value.trim()
  let refusal: string | null = null
  if (!v) refusal = 'You must select new value'
  else if ((field === 'taxGroup') && !canClassify.value) refusal = `Viewing as ${viewAs.value}. Only Owner, Accounting or Tax can change the tax group.`
  else if (field === 'class' && !canChangeClass.value) refusal = `Viewing as ${viewAs.value}. Only Owner or Accounting can change the asset class.`
  else if ((field === 'location' || field === 'custodian') && viewAs.value === 'Approver') refusal = `Viewing as ${viewAs.value}. Approvers cannot change custody.`
  const lines: BulkLine[] = ids.map((id) => {
    const s = assetRecords.value.find((x) => x.id === id)!
    const l = ledgers.value[id]!
    const before = currentValue(id, field)
    let after = v
    let skip: string | null = null
    if (l.disposedIn || l.splitIn) skip = l.splitIn ? 'Split. Change its parts instead' : 'Disposed'
    else if (before === v) skip = 'Already has this value'
    else if (field === 'taxGroup') {
      skip = groupRefusal(s.type, s.class, v)
      if (!skip) after = `${v} · ${formatLife(groupLifeMonths(v))}`
    } else if (field === 'class') {
      const p = planClassChange(id, v)
      if (!p.ok) skip = p.reason!
      else after = p.changes.map((c) => (c.field === 'Class' ? c.after : `${c.field} ${c.after}`)).join(' · ')
    } else if (s.type === 'Intangible') skip = 'Intangible. No physical custody'
    return { id, name: s.name, before, after, skip }
  })
  return {
    field, value: v, lines,
    affected: lines.filter((x) => !x.skip),
    skipped: lines.filter((x) => !!x.skip),
    refusal,
  }
}

// ── Applying and reversing ──────────────────────────────────────────────────

interface AppliedItem {
  id: string
  /** Events recorded for this asset, in order. */
  eventIds: string[]
  /** Record fields as they were, to restore on reversal. */
  record: Partial<Record<RecordField, string | null>>
}

export interface BulkOperation {
  number: string
  field: BulkField
  value: string
  appliedAt: string
  by: string
  items: AppliedItem[]
  reversedAt: string | null
  reversedBy: string | null
}

export const bulkOperations = ref<BulkOperation[]>([])
let seq = 0
onAssetStoreReset(() => { bulkOperations.value = []; seq = 0 })

function stamp(): string {
  const d = new Date()
  return `30/09/2026 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export type BulkResult = { ok: true; op: BulkOperation } | { ok: false; reason: string }

export function applyBulkEdit(plan: BulkPlan): BulkResult {
  if (plan.refusal) return { ok: false, reason: plan.refusal }
  if (!plan.affected.length) return { ok: false, reason: 'None of the selected assets would change' }
  const items: AppliedItem[] = []
  for (const line of plan.affected) {
    const s = assetRecords.value.find((x) => x.id === line.id)!
    if (plan.field === 'taxGroup') {
      const r = classifyAsset(line.id, { group: plan.value, statutoryCode: s.statutoryCode })
      if (!r.ok) { undo(items); return { ok: false, reason: `${line.id}: ${r.reason}. Nothing was changed.` } }
      items.push({ id: line.id, eventIds: r.eventId ? [r.eventId] : [], record: {} })
    } else if (plan.field === 'class') {
      const r = changeAssetClass(line.id, plan.value)
      if (!r.ok) { undo(items); return { ok: false, reason: `${line.id}: ${r.reason}. Nothing was changed.` } }
      items.push({ id: line.id, eventIds: r.eventIds, record: { class: r.previousClass } })
    } else {
      items.push({ id: line.id, eventIds: [], record: { [plan.field]: s[plan.field] } })
      updateAssetRecord(line.id, { [plan.field]: plan.value })
    }
  }
  seq += 1
  const op: BulkOperation = {
    number: `BE-2026-${String(seq).padStart(3, '0')}`, field: plan.field, value: plan.value,
    appliedAt: stamp(), by: actingUser.value, items, reversedAt: null, reversedBy: null,
  }
  bulkOperations.value = [op, ...bulkOperations.value]
  return { ok: true, op }
}

/** Why an operation cannot be reversed as a whole, or null. Checked before anything moves. */
export function reversalRefusal(op: BulkOperation): string | null {
  if (op.reversedAt) return `${op.number} was reversed on ${op.reversedAt}`
  for (const it of op.items) {
    const log = ledgers.value[it.id]!.events
    const tail = log.slice(log.length - it.eventIds.length).map((e) => e.id)
    if (it.eventIds.length && tail.join() !== it.eventIds.join()) return `${it.id} changed after ${op.number}. Undo that change first, then reverse the bulk edit.`
  }
  return null
}

function undo(items: AppliedItem[]): string | null {
  for (const it of [...items].reverse()) {
    for (const id of [...it.eventIds].reverse()) {
      const r = retractEvent(it.id, id)
      if (r) return `${it.id}: ${r}`
    }
    if (Object.keys(it.record).length) updateAssetRecord(it.id, it.record as Record<RecordField, string>)
  }
  return null
}

export function reverseBulkEdit(number: string): BulkResult {
  const op = bulkOperations.value.find((x) => x.number === number)
  if (!op) return { ok: false, reason: `Bulk edit ${number} not found` }
  const refusal = reversalRefusal(op)
  if (refusal) return { ok: false, reason: refusal }
  const r = undo(op.items)
  if (r) return { ok: false, reason: r }
  const done = { ...op, reversedAt: stamp(), reversedBy: actingUser.value }
  bulkOperations.value = bulkOperations.value.map((x) => (x.number === number ? done : x))
  return { ok: true, op: done }
}

export const latestBulkOperation = computed(() => bulkOperations.value[0] ?? null)

export const statutoryGroupOptions = Object.keys(STATUTORY_GROUPS)
