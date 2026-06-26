/**
 * Single source of truth for shared mock-data constants.
 * ALL data modules that need staff names, vendors, or the "today" anchor
 * must import from here — never define them locally.
 */

/** Simulation anchor — "today" for ALL mock data. One value, everywhere. */
export const TODAY_ISO = '2026-06-26'

/** Simulation anchor as a Date object — use for date arithmetic. */
export const TODAY = new Date(TODAY_ISO)

/** Shift an ISO date string by N days. */
export function shiftDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** All warehouse / office staff — shared across WMS, Receiving, and Receipt modules. */
export const STAFF = [
  'Budi Santoso',
  'Dewi Rahayu',
  'Rizki Pratama',
  'Agus Firmansyah',
  'Sari Indah',
  'Hendra Wijaya',
  'Citra Kusuma',
  'Galih Nugraha',
] as const

export type StaffName = (typeof STAFF)[number]

/** Supplier / vendor names — shared across purchasing and receipt modules. */
export const VENDORS = [
  'EXPAT Roasters',
  'Anomali Coffee',
  'Tanamera Coffee Roastery',
  'Common Grounds',
  'Toko Kopi Tuku',
  'Klasik Beans Cooperative',
  'Sagaleh Coffee Supply',
  'Kopi Nako Roastery',
] as const

export type VendorName = (typeof VENDORS)[number]
