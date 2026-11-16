/**
 * Bank rules — auto-categorise bank statement lines into spend / receive money.
 * Seed mirrors jurnal-accounting-frontend/src/mocks/fixtures/bankRules.ts (Fuel,
 * Cleaning Service, Internal, Warehouse rent, Marketplace settlement), re-pointed
 * at this prototype's own cash accounts (`cashAccounts`) and chart of accounts
 * (`MAPPING_COA`, the same COA the Default accounts settings page uses).
 *
 * The whole list (seed + edits + reorder + deletes) is persisted as a snapshot
 * through persist.ts, so create / edit / duplicate / delete / reorder survive a
 * reload.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

export type BankRuleTrigger = 'money_in' | 'money_out'
export type BankRuleMatchType = 'any' | 'all'
export type BankRuleField = 'description' | 'amount'
export type DescriptionOperator = 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'is_blank'
export type AmountOperator = 'eq' | 'lt' | 'lte' | 'gt' | 'gte'
export type BankRuleMemoMode = 'statement' | 'later' | 'custom'

export interface BankRuleCondition {
  field: BankRuleField
  operator: DescriptionOperator | AmountOperator
  /** Description text, or the amount as a plain number string. '' for is_blank. */
  value: string
}

export interface BankRuleSplit {
  /** COA code, e.g. '6-60100'. */
  account: string
  percentage: number
}

export interface BankRule {
  id: string
  name: string
  /** 'all' = every bank account; otherwise cash-account ids. */
  applyTo: 'all' | string[]
  trigger: BankRuleTrigger
  matchType: BankRuleMatchType
  conditions: BankRuleCondition[]
  splits: BankRuleSplit[]
  contact: string
  memoMode: BankRuleMemoMode
  memoCustom: string
  autoRecord: boolean
}

export const RULE_NAME_MAX_LENGTH = 25

export const DESCRIPTION_OPERATORS: DescriptionOperator[] = ['contains', 'not_contains', 'equals', 'starts_with', 'is_blank']
export const AMOUNT_OPERATORS: AmountOperator[] = ['eq', 'lt', 'lte', 'gt', 'gte']

/** Builder wording (operator dropdown). */
export const OPERATOR_LABELS: Record<string, string> = {
  contains: 'Contains', not_contains: 'Does not contain', equals: 'Equals', starts_with: 'Starts with', is_blank: 'Is blank',
  eq: '=', lt: '<', lte: '≤', gt: '>', gte: '≥',
}
/** List-cell wording (Conditions column). */
export const OPERATOR_CELL_LABELS: Record<string, string> = {
  contains: 'contains', not_contains: 'does not contain', equals: 'equals', starts_with: 'starts with', is_blank: 'is blank',
  eq: '=', lt: 'is <', lte: 'is ≤', gt: 'is >', gte: 'is ≥',
}

const SEED: BankRule[] = [
  {
    id: 'BR001', name: 'Fuel', applyTo: ['CA003'], trigger: 'money_out', matchType: 'any',
    conditions: [
      { field: 'description', operator: 'starts_with', value: 'SPBU' },
      { field: 'amount', operator: 'lte', value: '5000000' },
    ],
    splits: [{ account: '6-60000', percentage: 90 }, { account: '6-60100', percentage: 10 }],
    contact: '', memoMode: 'statement', memoCustom: '', autoRecord: true,
  },
  {
    id: 'BR002', name: 'Cleaning Service', applyTo: ['CA001', 'CA004'], trigger: 'money_out', matchType: 'all',
    conditions: [{ field: 'description', operator: 'contains', value: 'CLEAN' }],
    splits: [{ account: '6-60100', percentage: 100 }],
    contact: '', memoMode: 'statement', memoCustom: '', autoRecord: true,
  },
  {
    id: 'BR003', name: 'Internal', applyTo: ['CA003'], trigger: 'money_in', matchType: 'any',
    conditions: [{ field: 'amount', operator: 'eq', value: '75000000' }],
    splits: [{ account: '1-10005', percentage: 100 }],
    contact: '', memoMode: 'custom', memoCustom: 'Internal transfer', autoRecord: false,
  },
  {
    id: 'BR004', name: 'Warehouse rent', applyTo: ['CA001', 'CA003', 'CA004'], trigger: 'money_out', matchType: 'all',
    conditions: [{ field: 'amount', operator: 'eq', value: '75000000' }],
    splits: [{ account: '6-60100', percentage: 100 }],
    contact: '', memoMode: 'later', memoCustom: '', autoRecord: false,
  },
  {
    id: 'BR005', name: 'Marketplace settlement', applyTo: ['CA004'], trigger: 'money_in', matchType: 'any',
    conditions: [
      { field: 'description', operator: 'contains', value: 'TOKOPEDIA' },
      { field: 'description', operator: 'is_blank', value: '' },
      { field: 'amount', operator: 'gte', value: '1000000' },
    ],
    splits: [{ account: '4-40000', percentage: 100 }],
    contact: '', memoMode: 'custom', memoCustom: 'Settlement payout', autoRecord: false,
  },
  // Worst case: max-length name, every account, three-way split.
  {
    id: 'BR006', name: 'Coffee bean import duties', applyTo: 'all', trigger: 'money_out', matchType: 'all',
    conditions: [
      { field: 'description', operator: 'contains', value: 'BEA CUKAI IMPOR BIJI KOPI HIJAU' },
      { field: 'amount', operator: 'gt', value: '0' },
    ],
    splits: [{ account: '5-50400', percentage: 60 }, { account: '5-50300', percentage: 25 }, { account: '2-20599', percentage: 15 }],
    contact: 'Yirgacheffe Coffee Union', memoMode: 'statement', memoCustom: '', autoRecord: false,
  },
]

const STORE_KEY = 'bank-rules'

/** Ordered: index 0 = priority 1. */
export const bankRules = reactive<BankRule[]>(loadSnapshot<BankRule>(STORE_KEY) ?? SEED.map(r => structuredClone(r)))

function persist() { saveSnapshot(STORE_KEY, bankRules) }

export function getBankRule(id: string): BankRule | undefined {
  return bankRules.find(r => r.id === id)
}

export function nextBankRuleId(): string {
  const max = bankRules.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, '')) || 0), 0)
  return `BR${String(max + 1).padStart(3, '0')}`
}

/** Create (no id match) or update in place. New rules go to the bottom (lowest priority). */
export function saveBankRule(rule: BankRule): void {
  const idx = bankRules.findIndex(r => r.id === rule.id)
  if (idx >= 0) bankRules.splice(idx, 1, rule)
  else bankRules.push(rule)
  persist()
}

export function deleteBankRule(id: string): void {
  const idx = bankRules.findIndex(r => r.id === id)
  if (idx >= 0) { bankRules.splice(idx, 1); persist() }
}

export function moveBankRule(from: number, to: number): void {
  const [item] = bankRules.splice(from, 1)
  if (item) bankRules.splice(to, 0, item)
}

export function persistBankRuleOrder(): void { persist() }

export function formatRuleAmount(value: string | number): string {
  const n = Number(value) || 0
  return `Rp${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
}

/** `Description contains "SPBU"` / `Amount is ≤ Rp5.000.000,00` — the list cell line. */
export function formatRuleCondition(c: BankRuleCondition): string {
  if (c.field === 'description') {
    if (c.operator === 'is_blank') return `Description ${OPERATOR_CELL_LABELS.is_blank}`
    return `Description ${OPERATOR_CELL_LABELS[c.operator]} "${c.value}"`
  }
  return `Amount ${OPERATOR_CELL_LABELS[c.operator]} ${formatRuleAmount(c.value)}`
}
