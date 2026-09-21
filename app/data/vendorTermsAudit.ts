/**
 * Ordering-terms audit trail (TS-008, US-08).
 *
 * MoQ and purchase multiple are the only two fields on the vendor Products tab a
 * person types. Everything else is derived, so everything else already has a source
 * document to point at. These two do not — which is why they need an attributed
 * change log: the PRD's stated purpose is resolving "we never agreed to 100" a
 * month after the fact (user story 11).
 *
 * Entries render through the shared `ActivityLogModal`, so the shape is its
 * `ActivityEntry`. Seeded history is deterministic (hashStr); live edits push onto
 * the front of the same list, so a change made in this session reads identically to
 * one made last month.
 *
 * Deliberately NOT covered here: system-driven price refreshes. Those are attributed
 * to their Supplier Invoice, which the row already links to.
 */
import { reactive } from 'vue'
import type { ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { hashStr } from './cycleCountRecommendations'
import { simDaysAgo } from './simClock'

const EDITORS = ['Rina Pratiwi', 'Budi Santoso', 'Dewi Lestari', 'Ahmad Fauzi']

/** Live edits, keyed `${vendorId}|${sku}`. Newest first. */
const liveEntries = reactive<Record<string, ActivityEntry[]>>({})

function key(vendorId: string, sku: string) { return `${vendorId}|${sku}` }

/** Deterministic prior history so an untouched row still has something to show. */
function seededEntries(vendorId: string, sku: string): ActivityEntry[] {
  const seed = hashStr(`${vendorId}:${sku}:audit`)
  // ~40% of pairs have never had their terms touched by a person. Their log shows
  // only the system row that created them, which is itself the useful answer.
  const humanEdits = seed % 100 < 40 ? 0 : 1 + (seed % 2)

  const out: ActivityEntry[] = []
  for (let i = 0; i < humanEdits; i++) {
    const s = hashStr(`${vendorId}:${sku}:audit:${i}`)
    const from = 25 * (1 + (s % 4))
    // `>>>`, not `>>`: hashStr returns an UNSIGNED 32-bit value, so a hash above
    // 2^31 makes the signed shift negative, and JS `%` keeps that sign — which
    // produced a "25 -> 0" terms change, i.e. an audit entry claiming a minimum
    // of zero was agreed.
    const to = from + 25 * (1 + ((s >>> 3) % 3))
    out.push({
      date: simDaysAgo(14 + i * 47),
      user: EDITORS[s % EDITORS.length]!,
      activity: 'Ordering terms updated',
      details: [
        { label: 'Minimum order quantity', value: `${from} → ${to}` },
        { label: 'Source', value: (s >>> 5) % 3 === 0 ? 'Spreadsheet import' : 'Manual edit' },
      ],
    })
  }

  // The row's own origin. Rule 1 creates it on invoice approval; a hand-added row
  // was created by a person instead.
  out.push({
    date: simDaysAgo(90 + (seed % 180)),
    user: 'System',
    activity: 'Product linked to vendor',
    details: [{ label: 'Source', value: 'Supplier Invoice approval' }],
  })

  return out
}

/** Full change log for a pair, newest first. */
export function termsAuditFor(vendorId: string, sku: string): ActivityEntry[] {
  return [...(liveEntries[key(vendorId, sku)] ?? []), ...seededEntries(vendorId, sku)]
}

/**
 * Record an ordering-terms change.
 *
 * Called on every successful inline save. Rule: the audit write and the business
 * write succeed or fail together (US-04, US-31) — a terms change with no attributed
 * author is worse than no change, because it looks authoritative and cannot be
 * disputed. In this prototype both are in-memory, so they are written together here.
 */
export function recordTermsChange(
  vendorId: string,
  sku: string,
  changes: { label: string; from: string; to: string }[],
  by = 'Haidar',
  source: 'Manual edit' | 'Spreadsheet import' = 'Manual edit',
): void {
  if (!changes.length) return
  const k = key(vendorId, sku)
  if (!liveEntries[k]) liveEntries[k] = []
  liveEntries[k]!.unshift({
    date: new Date().toISOString(),
    user: by,
    activity: 'Ordering terms updated',
    details: [
      ...changes.map((c) => ({ label: c.label, value: `${c.from} → ${c.to}` })),
      { label: 'Source', value: source },
    ],
  })
}
