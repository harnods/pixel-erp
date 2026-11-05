/**
 * Guided tours: one registry for every module's tours.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * Every module reaches its tours the same way: the Guided tours menu in the top
 * bar (TourLauncher.vue), always shown, listing every tour with the current
 * module's group first. A module adds its tours by adding one group here.
 */
import { ASSET_TOURS, type AssetTour } from './assetTours'
import { BUDGET_TOUR } from './budgetTours'
import { PAYROLL_TOURS } from './payrollTours'
import { PROJECT_TOURS } from './projectTours'

export interface TourGroup {
  /** Stable key, also used to pick the current module's group. */
  key: 'assets' | 'budget' | 'payroll' | 'project'
  label: string
  /** True when the current route belongs to this module. */
  matches: (path: string) => boolean
  tours: AssetTour[]
}

export const TOUR_GROUPS: TourGroup[] = [
  {
    key: 'assets',
    label: 'Fixed assets',
    matches: (p) => /^\/(assets|depreciation-schedule|tax-book|tax-differences|lampiran-9|asset-|impairment-tests|period-self-check|custody-and-counts|leases)/.test(p),
    tours: ASSET_TOURS,
  },
  {
    key: 'budget',
    label: 'Budgeting',
    matches: (p) => /^\/(budget-|saving-bucket|commitments|purchase-requests|purchase-orders|purchase-invoices)/.test(p),
    tours: [BUDGET_TOUR],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    matches: (p) => /^\/payroll-/.test(p),
    tours: PAYROLL_TOURS,
  },
  {
    key: 'project',
    label: 'Project accounting',
    matches: (p) => /^\/project-accounting/.test(p),
    tours: PROJECT_TOURS,
  },
]

/** Groups in menu order: the current module's group first, then the rest as declared. Empty groups are left out. */
export function orderedGroups(path: string): TourGroup[] {
  const live = TOUR_GROUPS.filter((g) => g.tours.length)
  const cur = live.filter((g) => g.matches(path))
  return [...cur, ...live.filter((g) => !cur.includes(g))]
}

export function allTours(): AssetTour[] {
  return TOUR_GROUPS.flatMap((g) => g.tours)
}
