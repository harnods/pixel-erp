/**
 * Business contracts — the grounding table for the "Contracts expiring soon"
 * Cowork task (CW-1041), which previously had NO data source or builder at all.
 *
 * Parties are the REAL vendor master (`vendors`) plus the recurring software /
 * lease / insurance counterparties the ERP already bills. End dates are anchored
 * to the sim clock (22 Aug 2026) so "expiring in the next 60 days" is meaningful
 * and deterministic. Pure literals + simDay offsets — no Date.now()/random.
 */
import { simDaysAgo } from './simClock'
import { vendors } from './vendors'

export type ContractType = 'Vendor supply' | 'Software' | 'Lease' | 'Insurance' | 'Logistics' | 'Utilities'
export type ContractStatus = 'active' | 'expiring' | 'expired'

export interface Contract {
  id: string
  title: string
  party: string
  partyId?: string          // vendor id when the counterparty is a known vendor
  type: ContractType
  startDate: string         // ISO
  endDate: string           // ISO
  annualValue: number       // IDR / year
  owner: string             // internal owner
  autoRenew: boolean
  /** stated intent captured with the contract (renewal / renegotiation note). */
  note: string
}

function vName(id: string): string {
  return vendors.find(v => v.id === id)?.name ?? id
}

// endInDays is relative to "today" (positive = expires in the future).
function fromToday(endInDays: number): string {
  return simDaysAgo(-endInDays)
}

/**
 * 10 contracts spanning the year, several deliberately falling inside the next
 * 60 days so the task always has real items to surface (and a couple already
 * lapsed / far-out for contrast).
 */
export const contracts: Contract[] = [
  { id: 'CTR-001', title: 'Green bean supply — Gayo Grade 1', party: vName('V003'), partyId: 'V003', type: 'Vendor supply',
    startDate: simDaysAgo(320), endDate: fromToday(18), annualValue: 480_000_000, owner: 'Procurement — Budi Santoso', autoRenew: false,
    note: 'Annual offtake agreement; renegotiate price before renewal.' },
  { id: 'CTR-002', title: 'Cloud & SaaS subscription', party: vName('V012'), partyId: 'V012', type: 'Software',
    startDate: simDaysAgo(300), endDate: fromToday(35), annualValue: 96_000_000, owner: 'Technology — Bambang Firmansyah', autoRenew: true,
    note: 'Auto-renews unless cancelled 14 days before end; review seat count.' },
  { id: 'CTR-003', title: 'HQ office lease — Jakarta', party: vName('V011'), partyId: 'V011', type: 'Lease',
    startDate: simDaysAgo(700), endDate: fromToday(52), annualValue: 336_000_000, owner: 'Operations — Sari Candra', autoRenew: false,
    note: 'Landlord signalled a 7% uplift; decide renew vs relocate.' },
  { id: 'CTR-004', title: 'Inter-island logistics & freight', party: vName('V008'), partyId: 'V008', type: 'Logistics',
    startDate: simDaysAgo(280), endDate: fromToday(9), annualValue: 240_000_000, owner: 'Warehouse — Wulan Santoso', autoRenew: false,
    note: 'Expires soonest — confirm continuity to avoid a shipping gap.' },
  { id: 'CTR-005', title: 'Roasting machinery service & warranty', party: vName('V007'), partyId: 'V007', type: 'Vendor supply',
    startDate: simDaysAgo(210), endDate: fromToday(120), annualValue: 72_000_000, owner: 'Production — Rina Pratama', autoRenew: false,
    note: 'Covers preventive maintenance; well within term.' },
  { id: 'CTR-006', title: 'Packaging supply agreement', party: vName('V006'), partyId: 'V006', type: 'Vendor supply',
    startDate: simDaysAgo(180), endDate: fromToday(210), annualValue: 156_000_000, owner: 'Procurement — Budi Santoso', autoRenew: true,
    note: 'Volume-tiered pricing; healthy runway.' },
  { id: 'CTR-007', title: 'Electricity supply account', party: vName('V009'), partyId: 'V009', type: 'Utilities',
    startDate: simDaysAgo(400), endDate: fromToday(300), annualValue: 84_000_000, owner: 'Operations — Sari Candra', autoRenew: true,
    note: 'Rolling utility account; no action.' },
  { id: 'CTR-008', title: 'Corporate telecom & internet', party: vName('V010'), partyId: 'V010', type: 'Utilities',
    startDate: simDaysAgo(150), endDate: fromToday(46), annualValue: 42_000_000, owner: 'Technology — Bambang Firmansyah', autoRenew: true,
    note: 'Within the 60-day window; confirm speed tier before renewal.' },
  { id: 'CTR-009', title: 'Business & asset insurance', party: 'Asuransi Sinar Mas', type: 'Insurance',
    startDate: simDaysAgo(360), endDate: fromToday(5), annualValue: 60_000_000, owner: 'Finance — Michael Tanujaya', autoRenew: false,
    note: 'Lapses in under a week — renew immediately to keep cover.' },
  { id: 'CTR-010', title: 'Robusta supply — Lampung', party: vName('V005'), partyId: 'V005', type: 'Vendor supply',
    startDate: simDaysAgo(260), endDate: fromToday(3), annualValue: 300_000_000, owner: 'Procurement — Budi Santoso', autoRenew: false,
    note: 'Expiring this week; lock the next quarter volume.' },
]

/** Contracts ending within `days` of today, soonest first. */
export function expiringContracts(days = 60): Contract[] {
  const today = new Date('2026-08-22T00:00:00').getTime()
  const horizon = today + days * 86_400_000
  return contracts
    .filter(c => {
      const end = new Date(c.endDate + 'T00:00:00').getTime()
      return end >= today && end <= horizon
    })
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
}
