/**
 * Advanced Budgeting: view data for the Saving bucket (FG-5) and Budget
 * settings (FG-3.6) screens. Labels and option lists only; every figure comes
 * from budgetStore.
 */
import type { ControlSettings, Response, SettingChange } from './budgetStore'
import type { BudgetClass } from './budgetMaster'

export const RESPONSE_OPTIONS: Response[] = ['Block', 'Warn', 'Off']

export const CONTROL_PERIODS: { key: 'year' | 'month' | 'ytd'; label: string; detail: string }[] = [
  { key: 'year', label: 'Year', detail: 'Spend checked against what is left for the budget year' },
  { key: 'month', label: 'Month', detail: 'Spend checked against what is left for the document month' },
  { key: 'ytd', label: 'Year to date', detail: 'Spend checked against what is left from January to the document month' },
]

export const SETTING_LABELS: Record<keyof ControlSettings, string> = {
  year: 'Year check',
  month: 'Month check',
  ytd: 'Year to date check',
  smallMoveLimit: 'One-approver limit',
  smallMoveDays: 'Running total window',
  fundingCapPct: 'Funding cap over the gap',
  fundingPerQuarter: 'Funding requests per line per quarter',
  invoiceTolerancePct: 'Invoice tolerance',
}

/** One setting value as it reads on screen. */
export function settingValueLabel(key: keyof ControlSettings, v: unknown, rupiah: (n: number) => string): string {
  if (key === 'smallMoveLimit') return rupiah(Number(v))
  if (key === 'smallMoveDays') return `${v} days`
  if (key === 'fundingCapPct' || key === 'invoiceTolerancePct') return `${v}%`
  return String(v)
}

/** "Year check: Block to Warn · Month check: Warn to Off" */
export function describeSettingChange(sc: SettingChange, before: ControlSettings, rupiah: (n: number) => string): string {
  return (Object.keys(sc.patch) as (keyof ControlSettings)[])
    .map((k) => sc.status === 'Pending'
      ? `${SETTING_LABELS[k]}: ${settingValueLabel(k, before[k], rupiah)} to ${settingValueLabel(k, sc.patch[k], rupiah)}`
      : `${SETTING_LABELS[k]}: ${settingValueLabel(k, sc.patch[k], rupiah)}`)
    .join(' · ')
}

export const CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Opex', label: 'Opex' },
  { value: 'Capex', label: 'Capex' },
  { value: 'none', label: 'No class' },
]
export const classFromOption = (v: string): BudgetClass | null => (v === 'Opex' || v === 'Capex' ? v : null)

export const BUDGET_DIMENSIONS: { name: string; rule: 'Required' | 'Optional'; detail: string }[] = [
  { name: 'Department', rule: 'Required', detail: 'Every budget line and every spend line names a department' },
  { name: 'Project', rule: 'Optional', detail: 'A line with a project only matches spend on that project' },
]

export const SETTINGS_RELEASE_2: { label: string; detail: string }[] = [
  { label: 'Approval tiers by amount', detail: 'Route budget changes by amount band instead of one limit' },
  { label: 'Idle sweep rules', detail: 'Free money held by purchase orders idle for 90 days or more' },
  { label: 'Year-end default', detail: 'What happens to open purchase orders and the saving bucket at year-end' },
]

export const SAVING_RELEASE_2: { label: string; detail: string }[] = [
  { label: 'Automatic saving booking', detail: 'Book completion and cancellation savings when a purchase order or project closes' },
  { label: 'Price and quantity split', detail: 'Send the price part of a purchase order below its request to the bucket' },
  { label: 'Baseline check', detail: 'Flag savings where the estimate sat more than 20% above the last purchase price' },
]
