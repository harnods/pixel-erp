/**
 * ISO ↔ Date helpers for date filters.
 *
 * This module used to carry a whole filter-value vocabulary — modes, range
 * resolution, trigger labels — for the hand-rolled AdvanceDateFilter popover.
 * That component is gone: the ERP has one date-range control,
 * `AdvancedDateRangePicker` (rule/date-picker-variants), and it hands back a
 * resolved [start, end], so nothing needs to resolve a mode any more. What is
 * left is the pair of conversions pages still share.
 */

export interface DateRange { start: Date; end: Date }

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}
