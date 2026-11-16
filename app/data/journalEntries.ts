import { reactive } from 'vue'
import { loadCreated, saveCreated } from './persist'

/**
 * Journal entries (General Journal) — mirrors jurnal-accounting-frontend
 * src/modules/journal-entries (create / show). Seeds are fixed; user-created
 * entries persist via persist.ts (loadCreated/saveCreated).
 */
export interface JournalEntryLine {
  /** Chart-of-accounts code (companySettings MAPPING_COA) */
  accountCode: string
  description: string
  debit: number
  credit: number
}

export interface JournalEntry {
  id: string
  number: number
  /** ISO yyyy-mm-dd */
  transactionDate: string
  tags: string[]
  lines: JournalEntryLine[]
  memo?: string
  createdAt: string
}

const SEED: JournalEntry[] = [
  {
    id: 'je-seed-1', number: 10001, transactionDate: '2026-07-31', tags: ['accrual'],
    lines: [
      { accountCode: '6-60100', description: 'Accrue July office rent', debit: 12_000_000, credit: 0 },
      { accountCode: '2-20399', description: 'Accrue July office rent', debit: 0, credit: 12_000_000 },
    ],
    memo: 'Month-end accrual', createdAt: '2026-07-31T17:20:00',
  },
  {
    id: 'je-seed-2', number: 10002, transactionDate: '2026-08-05', tags: [],
    lines: [
      { accountCode: '1-10003', description: 'Reclassify bank charges recorded to the wrong account during the July closing', debit: 0, credit: 350_000 },
      { accountCode: '8-80999', description: '', debit: 350_000, credit: 0 },
    ],
    createdAt: '2026-08-05T09:05:00',
  },
]

const KEY = 'journal-entries-v1'
export const journalEntries = reactive<JournalEntry[]>([...loadCreated<JournalEntry>(KEY), ...SEED])
function persist(): void {
  saveCreated(KEY, journalEntries.filter((e) => !e.id.startsWith('je-seed-')))
}

export function getJournalEntry(id: string): JournalEntry | undefined {
  return journalEntries.find((e) => e.id === id)
}
export function nextJournalEntryNumber(): number {
  return Math.max(10000, ...journalEntries.map((e) => e.number)) + 1
}
export function journalTotals(lines: JournalEntryLine[]): { debit: number; credit: number } {
  return lines.reduce((s, l) => ({ debit: s.debit + (Number(l.debit) || 0), credit: s.credit + (Number(l.credit) || 0) }), { debit: 0, credit: 0 })
}
export function addJournalEntry(input: Omit<JournalEntry, 'id' | 'number' | 'createdAt'>): JournalEntry {
  const number = nextJournalEntryNumber()
  const e: JournalEntry = { ...input, id: `je-new-${number}`, number, createdAt: new Date().toISOString() }
  journalEntries.unshift(e)
  persist()
  return e
}
export function deleteJournalEntry(id: string): void {
  const i = journalEntries.findIndex((e) => e.id === id)
  if (i >= 0) { journalEntries.splice(i, 1); persist() }
}
