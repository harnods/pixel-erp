/**
 * Guided tours: the tour content, SIM-1 to SIM-7.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * Every label and figure quoted here was read off the running app after
 * resetAssetStore(), and tests/asset-tours.spec.ts replays the SIM-7 chain
 * through the store so a figure that drifts fails the suite.
 */
import type { ViewAsRole } from '~/data/assetStore'
import { rowIn, sim1SetTaxGroup, sim2GenerateRun, sim2JournalDatePolicy, sim2PostRun, sim3RecordImpairment, sim3Dispose, sim3CorrectCost } from './assetTourWork1'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'bottom-start' | 'bottom-end' | 'left-start' | 'right-start'

export interface TourStep {
  /** The route to be on for this step. Pushed only when the current one differs. A function is resolved on entry. */
  route?: string | (() => string)
  /**
   * Auto-play: the tour does the step's work itself on entry (once per run),
   * after View as is applied and before the route is pushed.
   */
  run?: () => void
  /** Find the target another way than a data-tour marker (a row by its text). */
  find?: () => HTMLElement | null
  /** The data-tour marker to highlight. */
  target: string
  /** View as for this step, when it differs from the one before. */
  role?: ViewAsRole
  /** One present-tense sentence: what this step is. */
  title: string
  /** Why it matters. */
  body: string
  /** What to do on screen before pressing Next. */
  action?: string
  /** What to notice. */
  watch?: string
  /**
   * Shown instead of the generic waiting text when the target is missing,
   * for a step whose target can legitimately be gone (the reader already did
   * what it asks). The panel still offers Skip this step.
   */
  ifMissing?: string
  placement?: TourPlacement
}

export interface AssetTour {
  id: string
  code: string
  name: string
  persona: string
  /** View as when the tour starts. */
  role: ViewAsRole
  blurb: string
  closing: string
  steps: TourStep[]
  /** A tour outside the asset module brings its own reset and View as (the budget tour). */
  onReset?: () => void
  applyRole?: (role: string) => void
}

const EXPORT_NOTE = 'The tour stops here, on the screen before the export itself.'

export const ASSET_TOURS: AssetTour[] = [
  // ── SIM-1 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim1',
    code: 'SIM-1',
    name: 'File the return without opening Excel',
    persona: 'Tax Manager',
    role: 'Tax',
    blurb: 'From setting a tax group to filing Lampiran 9, with the figures the tax team defends.',
    closing: 'The tax group set the tax life, the tax book produced its own schedule, Tax book showed a disposal that is a gain in the accounts and a loss for tax, the charge breakdown defended one figure line by line, deferred tax followed from the net temporary difference, and Lampiran 9 could be produced once every asset had a tax group.',
    steps: [
      {
        route: '/assets?filter=unclassified&book=both',
        target: 'reg-stats',
        title: 'Find the asset with no tax group.',
        body: 'An asset with no tax group has no tax life, so it has no tax schedule and cannot be filed. The register says so instead of looking complete. The tour switched the book to Both and selected "1 asset excluded: no tax group" under Tax book value.',
        watch: 'FA-0077 Toyota Avanza B 6512 TRK is the only row. Its status is Incomplete and its tax book value reads Not computed, never a zero.',
      },
      {
        route: '/assets/FA-0077',
        target: 'det-fiscal',
        title: 'FA-0077 names the gap at the top.',
        body: 'The asset record shows the gap under No tax group, rather than in a field, with Set tax group beside it.',
        watch: 'Excluded from the tax book, tax differences and Lampiran 9 until a tax group is set.',
        ifMissing: 'FA-0077 already has a tax group, so the gap is no longer shown. Select Skip this step to carry on.',
      },
      {
        run: sim1SetTaxGroup,
        route: '/assets/FA-0077',
        target: 'det-figures',
        title: 'Set Tax group 2.',
        body: 'The tour selected Set tax group, chose Tax group 2 and selected Save tax group. The tax group sets the tax life: Tax life (years) fills in with 8 and nothing else needs typing.',
        watch: 'Book value · tax now reads Rp242.916.664 under Tax group 2, 8 years, against Rp229.666.664 on the accounting book: a cumulative difference of Rp13.250.000.',
      },
      {
        route: '/assets/FA-0077',
        find: rowIn('det-sched', 'September 2026'),
        target: 'det-sched',
        title: 'Read the two schedules side by side.',
        body: 'The tax book is a second schedule on the same asset, calculated from the in-service date over the tax life.',
        watch: 'Accounting is Rp4.416.667 a month over 5 years and Tax is Rp2.760.417 a month over 8 years. Difference is Rp1.656.250 every month.',
        placement: 'top',
      },
      {
        route: '/tax-differences',
        target: 'diff-table',
        title: 'Open Tax differences.',
        body: 'Each asset and event is listed with the reason its two books differ, so every tax adjustment traces back to its source.',
        watch: 'FA-0077 now appears: Tax life longer than accounting, tax 8 years, accounting 5 years, +Rp14.906.250 for January to September. The net temporary difference at the foot reads Matches Tax book: −Rp227.671.869.',
        placement: 'top',
      },
      {
        route: '/tax-book',
        target: 'cmp-disposal',
        title: 'Read disposal and impairment on both books.',
        body: 'The same transaction lands differently on the two bases, which is the argument for holding both.',
        watch: 'FA-0071 Cummins 250kVA Generator: a gain of Rp51.250.000 in the accounts and a loss of Rp71.093.750 for tax. The FA-0068 impairment of Rp17.250.000 reads Not recognised on the tax side, not zero.',
        placement: 'top',
      },
      {
        route: '/assets/FA-0031',
        find: rowIn('det-sched', 'September 2026'),
        target: 'det-sched',
        title: 'Pick one tax figure to defend.',
        body: 'Any charge in the schedule opens its charge breakdown. The next step opens the September 2026 tax charge.',
        watch: 'September 2026 on the tax side reads Rp6.510.417.',
        placement: 'top',
      },
      {
        route: '/assets/FA-0031?breakdown=tax-2026-09',
        target: 'deriv-body',
        title: 'Read the Charge breakdown for the September tax charge.',
        body: 'Every line is an arithmetic step, not a log entry.',
        watch: 'Opening amount Rp1.250.000.000 over 192 months (16 years), month 39 of 192, charge Rp6.510.417.',
        placement: 'left',
      },
      {
        route: '/tax-book',
        target: 'cmp-deftax',
        title: 'Read the deferred tax effect.',
        body: 'It sits beside the net temporary difference it comes from.',
        watch: 'With FA-0077 in the tax book the net temporary difference is −Rp227.671.869 and the deferred tax effect at 22% is a liability of Rp50.087.811. Before the tax group was set they were −Rp242.578.119 and Rp53.367.186. Both cover depreciation, amortisation, disposal and impairment, and exclude leases.',
        placement: 'top',
      },
      {
        route: '/lampiran-9',
        target: 'lamp-both',
        title: 'Lampiran 9 can now be produced.',
        body: `With a tax group on every asset, the page no longer refuses. ${EXPORT_NOTE}`,
        watch: 'Part 1 · tangible reads 20, Part 2 · intangible 4 and Unclassified 0. Right-of-use assets from leases are not part of the filing.',
      },
    ],
  },

  // ── SIM-2 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim2',
    code: 'SIM-2',
    name: 'Close the period on a schedule you control',
    persona: 'Accounting Manager',
    role: 'Accounting',
    blurb: 'On-demand generation, a journal date set by policy, and a self-check that says what it could not confirm.',
    closing: 'The run was generated when it was wanted, the journal date followed a stated policy instead of a fixed month end, the posted journal carries its reference, and the close ended on a self-check that shows the ledger agrees with the register and names the one asset still outside the tax book.',
    steps: [
      {
        run: sim2GenerateRun,
        route: '/depreciation-schedule',
        target: 'run-current',
        title: 'Generate the depreciation for September 2026.',
        body: 'The run is generated on demand, not by a calendar job. The tour left Run period at September 2026 and selected Generate run.',
        watch: 'Current period September 2026 now reads 21 assets, draft generated 30/09/2026, with Rp140.217.604 to post. There is no separate tax run to remember.',
      },
      {
        route: '/depreciation-schedule?open=2026-09',
        find: rowIn('run-table', 'September 2026'),
        target: 'run-table',
        title: 'Review the draft before anything is committed.',
        body: 'A draft can be regenerated as often as needed. Only posting commits it. September 2026 is expanded to show each asset\'s line.',
        watch: 'September 2026 reads Draft, 21 assets, Rp140.217.604. FA-0077 is in it at Rp4.416.667: an asset with no tax group does not hold up the close.',
        placement: 'top',
      },
      {
        run: sim2JournalDatePolicy,
        route: '/asset-settings',
        target: 'set-jdate',
        title: 'Set the journal date by policy.',
        body: 'The company states the date once, as a policy, rather than choosing it on each run. The tour selected "A fixed day of the following month" under Journal date and kept Day 5.',
        watch: 'The line under Journal date now reads "The September 2026 run will be dated 05/10/2026."',
      },
      {
        route: '/depreciation-schedule',
        target: 'run-current',
        title: 'The run picks the policy up.',
        body: 'Nothing on the run itself was edited.',
        watch: 'Current period now reads journal date 05/10/2026 (day 5 of next month).',
      },
      {
        route: '/depreciation-schedule?review=2026-09',
        target: 'run-post',
        title: 'Review and post shows the journal first.',
        body: 'The journal lines are shown before anything posts. The next step selects Post journal.',
        watch: 'The journal is dated 05/10/2026 and debits and credits Rp140.217.604. It posts the accounting book only.',
        placement: 'left',
      },
      {
        run: sim2PostRun,
        route: '/depreciation-schedule',
        find: rowIn('run-table', 'September 2026'),
        target: 'run-table',
        title: 'Posted. The reference is on the run.',
        body: 'Each posted period carries its journal number and date, which is what makes a drill-down from the ledger possible.',
        watch: 'September 2026 now reads Posted, JV-2026-0135 dated 05/10/2026, Rp140.217.604 across 21 assets.',
        placement: 'top',
      },
      {
        route: '/period-self-check',
        target: 'recon-table',
        title: 'Check the sub-ledger against the general ledger.',
        body: 'Only the asset module posts to the asset control accounts, so every account agrees.',
        watch: 'All five accounts, from Fixed assets at cost to Gain on disposal of assets, show no difference.',
        placement: 'top',
      },
      {
        target: 'recon-checks',
        title: 'Read what the self-check could not confirm.',
        body: 'A check that cannot run is never reported as a pass.',
        watch: '2 of 4 checks passed. Tax book coverage failed: FA-0077 is in the register but not in the tax book. Lampiran 9 coverage did not complete, because it needs a tax group on every asset.',
        placement: 'top',
      },
    ],
  },

  // ── SIM-3 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim3',
    code: 'SIM-3',
    name: 'Record what actually happened',
    persona: 'Accounting Manager',
    role: 'Accounting',
    blurb: 'An impairment, a disposal on both bases, a correction of posted months, and a figure that explains the change.',
    closing: 'An impairment re-spread the remaining life without touching a posted period, the prior schedule was kept rather than deleted, a disposal produced opposite signs on the two books, a cost error in posted months was caught up in the first open period, and the charge breakdown showed an impairment inside its arithmetic.',
    steps: [
      {
        route: '/assets/FA-0042',
        target: 'det-figures',
        title: 'Open FA-0042 Packing Machine Line B, damaged in September.',
        body: 'The schedule does not know about the damage yet.',
        watch: 'Book value Rp475.416.657 on both books, and a charge of Rp2.916.667 a month on each.',
      },
      {
        route: '/assets/FA-0042',
        target: 'det-actions',
        title: 'Record the impairment from Actions.',
        body: 'Every change to an asset\'s value starts from the same menu. Record an impairment test opens a drawer that states the loss and the resulting charge before anything is recorded.',
        placement: 'left',
      },
      {
        run: sim3RecordImpairment,
        route: '/impairment-tests',
        target: 'imp-card-FA-0042',
        title: 'The test is recorded.',
        body: 'The tour selected Physical damage as the Indicator, entered Rp400.000.000 as the Recoverable amount from "Appraisal, PT Penilai Independen", and selected Record test. A test that finds a loss posts it to the asset.',
        watch: 'Carrying amount Rp472.499.990 against Rp400.000.000 recoverable: an impairment loss of Rp72.499.990, on the accounting book only.',
        placement: 'bottom',
      },
      {
        route: '/assets/FA-0042',
        find: rowIn('det-sched', 'October 2026'),
        target: 'det-sched',
        title: 'Read the regenerated schedule.',
        body: 'The impairment is dated at the period end, so September keeps its charge and the new basis starts in October. The tax book does not move.',
        watch: 'From October the accounting column is Rp2.469.136 against Rp2.916.667 on the tax side, the same as before. The button above the table now reads Previous versions (1).',
        placement: 'top',
      },
      {
        route: '/assets/FA-0042?versions=accounting',
        target: 'det-versions',
        title: 'The schedule the impairment replaced is kept.',
        body: 'The replaced version stays readable with its basis, below the current one.',
        watch: 'Version 1 reads Replaced from September 2026.',
        placement: 'left',
      },
      {
        route: '/assets/FA-0047',
        target: 'det-actions',
        title: 'Dispose of FA-0047 Toyota Innova B 1234 XYZ.',
        body: 'Disposals are dated at a period end under the full-month convention, so this one is 30/09/2026. Dispose sits in Actions with every other value change, and its drawer shows both books before it records.',
        placement: 'left',
      },
      {
        run: sim3Dispose,
        route: '/assets/FA-0047',
        target: 'det-figures',
        title: 'The disposal is recorded.',
        body: 'The tour entered Rp200.000.000 as Proceeds (Rp) and selected Record disposal.',
        watch: 'The asset reads Disposed, and both book values read Disposed rather than a stale figure.',
      },
      {
        route: '/tax-book',
        target: 'cmp-disposal',
        title: 'The disposal lands on the tax statement.',
        body: 'The accountant sees what the tax manager will. The tax book depreciates over 8 years against 5, so its carrying amount is higher.',
        watch: 'FA-0047 now sits beside FA-0071: a gain of Rp26.750.011 in the accounts and a loss of Rp52.656.239 for tax.',
        placement: 'top',
      },
      {
        route: '/assets/FA-0064',
        target: 'det-actions',
        title: 'Correct a cost error on an asset whose earlier periods are posted.',
        body: 'A posted period is never edited. Correct an error in Actions catches the correction up in the first open period.',
        placement: 'left',
      },
      {
        run: sim3CorrectCost,
        route: '/assets/FA-0064',
        find: rowIn('det-sched', 'September 2026'),
        target: 'det-sched',
        title: 'The corrected cost is recorded.',
        body: 'FA-0064 Backup 100kVA Generator was entered at Rp245.000.000. The tour entered 250000000 as Corrected cost (Rp) and "Supplier invoice is 250 million" as Reason for correction, then selected Record correction.',
        watch: 'September carries Rp1.692.698 on both books, including a catch-up of Rp390.615 for the posted months. From October the charge is Rp1.302.083. August and earlier stay at Rp1.276.042.',
        placement: 'top',
      },
      {
        route: '/assets/FA-0068',
        find: rowIn('det-sched', 'July 2026'),
        target: 'det-sched',
        title: 'Open a figure with an impairment in its chain.',
        body: 'FA-0068 Forklift Toyota 3T was impaired on 30/06/2026. The next step opens the July 2026 accounting charge.',
        watch: 'July 2026 reads Rp4.000.000 on the accounting side and Rp4.375.000 on the tax side.',
        placement: 'top',
      },
      {
        route: '/assets/FA-0068?breakdown=accounting-2026-07',
        target: 'deriv-body',
        title: 'The impairment is a line in the arithmetic.',
        body: 'The breakdown names the adjustment that set the opening amount.',
        watch: 'Opening amount Rp184.000.000 (cost Rp420.000.000 less Rp236.000.000 accumulated), 46 months remaining from July 2026, charge Rp4.000.000. The tax column stays at Rp4.375.000: the impairment never touched it.',
        placement: 'left',
      },
    ],
  },

  // ── SIM-4 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim4',
    code: 'SIM-4',
    name: 'Know what you own and whether it still exists',
    persona: 'General Affairs, then Owner, then Finance Director',
    role: 'General Affairs',
    blurb: 'Custody, a count, variances resolved, and a write-off that needs approval.',
    closing: 'General Affairs read and edited the register without meeting acquisition cost, counted a fixed list of assets and resolved what did not match, and the Finance Director authorised the one action that removes value from the balance sheet. Same register, three roles, one trail.',
    steps: [
      {
        route: '/assets',
        target: 'reg-view',
        title: 'The register as General Affairs sees it.',
        body: 'View as is General Affairs (Rudi Santoso) for this part of the tour. Cost and book values are hidden for this role.',
        watch: 'Missing custody counts the assets with no custodian or location: 1. FA-0047 is that asset.',
      },
      {
        route: '/custody-and-counts',
        target: 'cust-unassigned',
        title: 'Assign a custodian and a location to FA-0047.',
        body: 'A missing custodian is a named gap, not a blank.',
        action: 'Select Assign on Toyota Innova B 1234 XYZ.',
        ifMissing: 'Nothing is left unassigned: FA-0047 already has a custodian and a location. Select Skip this step to carry on.',
        placement: 'top',
      },
      {
        target: 'cust-body',
        title: 'Record the custody change with a reason.',
        body: 'The change is dated and carries a reason, which is what makes the custody history usable later.',
        action: 'Select Siti Rahma (GA) as Custodian and HQ vehicle pool as Location, enter "Assigned to the HQ pool" as the Reason, then select Save custody.',
        placement: 'left',
      },
      {
        target: 'cust-table',
        title: 'Read everything one person holds.',
        body: 'Custody is also a view by person.',
        action: 'Select the Rudi Santoso (Warehouse) row.',
        watch: 'Seven assets across Medan Warehouse, its office, Medan pool and Rungkut Warehouse, with Reassign all and Mark as left for when he moves on.',
        placement: 'top',
      },
      {
        route: '/asset-settings',
        target: 'appr-rules',
        role: 'Owner',
        title: 'Turn on approval for write-offs.',
        body: 'View as switches to Owner for this step: only the Owner changes approval rules. Every rule starts off, and with a rule off the event is recorded immediately.',
        action: 'Turn on Write-off needs approval.',
      },
      {
        route: '/custody-and-counts',
        target: 'count-new',
        role: 'General Affairs',
        title: 'Start a count session.',
        body: 'View as switches back to General Affairs.',
        action: 'Select New count session.',
        placement: 'left',
      },
      {
        target: 'count-setup',
        title: 'Scope the count to Medan Warehouse and start it.',
        body: 'The asset list is fixed when the count starts, so the result can be reproduced.',
        action: 'Keep Scope on By location, select Medan Warehouse as the Location, then select Start count.',
        watch: '4 tagged assets in scope: FA-0068, FA-0083, FA-0023, FA-0064, counted by Rudi Santoso.',
      },
      {
        target: 'count-mobile',
        title: 'Capture three assets.',
        body: 'Scanning is simulated: type or paste the tag code, as a scanner would.',
        action: 'Type TAG-MDN-068 and press Enter, then TAG-MDN-083 and Enter. Then set Counting at to Medan pool (outside this count), type TAG-MDN-023 and press Enter.',
        watch: 'The racking reads Different location at Medan pool. The generator, TAG-MDN-064, is never scanned.',
        placement: 'right',
      },
      {
        target: 'count-session',
        title: 'Finish the count.',
        body: 'Finishing turns what was not found where expected into variances.',
        action: 'Select Finish count.',
      },
      {
        target: 'var-table',
        title: 'Resolve the two variances.',
        body: 'Each variance needs a resolution before the session can close.',
        action: 'Select Resolve on TAG-MDN-023, select Transfer as the Resolution (Current location is Medan pool), enter "Moved to the pool store" as the Reason and select Save resolution. Do the same for TAG-MDN-064 with Write off and "Not found at the count".',
        watch: 'Both rows read Applies when the session closes. The write-off will then wait for approval.',
        placement: 'top',
      },
      {
        target: 'count-session',
        title: 'Close the session.',
        body: 'Everything else applies now; the write-off waits for approval.',
        action: 'Select Close session.',
        watch: 'The racking reads Location updated. The generator reads Sent for approval · AP-0032.',
      },
      {
        route: '/asset-approvals',
        target: 'appr-032',
        role: 'Approver',
        title: 'The write-off arrives in the Finance Director\'s queue.',
        body: 'View as switches to Approver (Fitri Handayani): whoever requests a change cannot approve it.',
        action: 'Read the request. Approve comes on the next step.',
        watch: 'AP-0032 writes off FA-0064 Backup 100kVA Generator at an accounting book value of Rp224.583.328 and a tax book value of Rp224.583.328, after September\'s charge.',
        placement: 'top',
      },
      {
        target: 'appr-approve',
        title: 'Approve the write-off.',
        body: 'Approval applies the held change on both books.',
        action: 'Select Approve.',
        ifMissing: 'AP-0032 is already approved, so there is no Approve button left to select. Select Skip this step to read the result on the count report.',
        placement: 'left',
      },
      {
        route: '/custody-and-counts',
        target: 'count-session',
        title: 'Back on the count report.',
        body: 'The approval trail stays on the transaction and the asset history records who decided what.',
        watch: 'The generator\'s row now reads AP-0032 approved by Fitri Handayani. Written off with no proceeds on both books. On FA-0064 the status is Disposed, and the History shows the request and the approval on 30/09/2026. With no proceeds, the whole Rp224.583.328 is a loss on each book.',
      },
    ],
  },

  // ── SIM-5 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim5',
    code: 'SIM-5',
    name: 'Account for what you rent',
    persona: 'Accounting Manager',
    role: 'Accounting',
    blurb: 'A lease, its two schedules, the right-of-use asset in the ordinary register, and a remeasurement.',
    closing: 'A lease produced a liability and a right-of-use asset, the asset behaved like any other asset in the register, and a term extension remeasured both without moving anything posted before it.',
    steps: [
      {
        route: '/leases',
        target: 'lease-row',
        title: 'Open the lease register.',
        body: 'Three leases are recognised and one short-term lease is expensed.',
        action: 'Select Cakung Leased Warehouse, LS-004.',
        placement: 'top',
      },
      {
        target: 'lease-monthly',
        title: 'Read the monthly effect.',
        body: 'A recognised lease reaches profit and loss as depreciation plus interest, not as rent.',
        watch: 'For September 2026: Rp30.911.248 of depreciation plus Rp10.159.110 of interest, an Accounting total of Rp41.070.358, against a tax deduction of Rp38.500.000, the contract payment.',
        placement: 'top',
      },
      {
        target: 'lease-sched',
        title: 'Read the liability against the right-of-use depreciation.',
        body: 'Two schedules from one contract.',
        watch: 'Interest falls every month as the liability unwinds (Rp10.159.110 in September, Rp9.946.553 in October), while the right-of-use charge stays flat at Rp30.911.248.',
        placement: 'top',
      },
      {
        route: '/assets',
        target: 'lease-register',
        title: 'The right-of-use asset sits in the ordinary register.',
        body: 'Same columns, same schedule behaviour, one extra badge naming the lease.',
      },
      {
        route: '/leases',
        target: 'lease-row',
        title: 'Extend the term by 12 months.',
        body: 'A modification remeasures the liability and adjusts the asset by the same amount.',
        action: 'Select Cakung Leased Warehouse again, then Modify lease in its detail.',
        placement: 'top',
      },
      {
        target: 'lease-modify',
        title: 'Read the remeasurement before it is recorded.',
        body: 'The form starts at the open period with a 12-month extension.',
        action: 'Keep Change in term (months) at 12, enter "Addendum 2, twelve-month extension" as What changed in the contract, then select Remeasure lease.',
        watch: 'The liability moves from Rp1.354.548.021 to Rp1.678.623.620, a right-of-use asset adjustment of +Rp324.075.599. ROU-0004 monthly depreciation goes from Rp30.911.248 to Rp30.027.109, ending January 2031.',
        placement: 'left',
      },
      {
        target: 'lease-sched',
        title: 'The remaining schedule moved; the posted months did not.',
        body: 'Nothing posted before the modification changes.',
        watch: 'From September 2026 the right-of-use charge is Rp30.027.109. In the lease list LS-004 now reads modified, running to 31/01/2031, with a right-of-use book value of Rp1.561.409.659.',
        placement: 'top',
      },
    ],
  },

  // ── SIM-6 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim6',
    code: 'SIM-6',
    name: 'Account for what you cannot touch',
    persona: 'Accounting Manager',
    role: 'Accounting',
    blurb: 'Intangibles in the same register, a permanent difference on goodwill, the annual test, and both parts of Lampiran 9.',
    closing: 'Four intangibles sat in the same register as everything else, goodwill showed a difference that never reverses, the charge breakdown defended the tax amortisation the same way it defends depreciation, the year end called for an annual test, and a test that found nothing was kept as evidence. Lampiran 9 counts both parts and says why it cannot be produced yet.',
    steps: [
      {
        route: '/assets',
        target: 'reg-filters',
        title: 'Filter the register to intangible assets.',
        body: 'Intangibles live in the same register and are amortised by the same schedules.',
        action: 'Select Intangible in the Type filter.',
        watch: 'Four rows, each with an Intangible badge.',
      },
      {
        route: '/assets/FA-0091',
        target: 'det-sched',
        title: 'Read goodwill FA-0091 on both books.',
        body: 'Goodwill has an indefinite life in the accounts and a 20-year life for tax.',
        action: 'Select the September 2026 tax charge, Rp10.000.000.',
        watch: 'The accounting column reads Not amortised rather than zero, while tax amortises Rp10.000.000 a month.',
        placement: 'top',
      },
      {
        target: 'deriv-body',
        title: 'The Charge breakdown for the tax amortisation.',
        body: 'The same arithmetic as the tangible assets.',
        watch: 'Rp2.400.000.000 over 240 months, month 31 of 240, charge Rp10.000.000. The difference is permanent: the accounting side never amortises.',
        placement: 'left',
      },
      {
        route: '/impairment-tests',
        target: 'imp-annual',
        title: 'Year end calls for an annual test.',
        body: 'Goodwill and indefinite-life intangibles are tested every year whether or not anything is wrong.',
        action: 'Select Test FA-0091.',
        watch: '1 of 2 done: the brand FA-0093 is already tested, goodwill FA-0091 is outstanding.',
        placement: 'top',
      },
      {
        target: 'imp-form',
        title: 'Record a test that finds no impairment.',
        body: 'A test that finds nothing is retained as the evidence that it happened.',
        action: 'Enter 2600000000 as the Recoverable amount, select Value in use as the Basis and enter "Management projection" as the Source, then select Save test.',
        placement: 'top',
      },
      {
        target: 'imp-annual',
        title: 'The annual tests are done.',
        body: 'The test is kept in the list as a record.',
        watch: '2 of 2 done · all required tests recorded. The new test, IT-2026-03, reads Not impaired.',
        placement: 'top',
      },
      {
        route: '/lampiran-9',
        target: 'lamp-both',
        title: 'Both parts of Lampiran 9, with their counts.',
        body: `A filing with only tangible assets is half a return. ${EXPORT_NOTE}`,
        watch: 'Part 1 · tangible reads 19, Part 2 · intangible 4 and Unclassified 1. The page reads Classify all assets to produce Lampiran 9, and names FA-0077 with Rp265.000.000 of cost missing from the filing. Right-of-use assets from leases are not part of the filing.',
      },
    ],
  },

  // ── SIM-7 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim7',
    code: 'SIM-7',
    name: 'Change an asset after it is in use',
    persona: 'Accounting Manager',
    role: 'Accounting',
    blurb: 'An improvement, a useful-life revision and a partial disposal on one asset, then its history and previous versions.',
    closing: 'One asset took three value changes in the open period. The improvement moved both books, the life revision moved the accounts only, the partial disposal produced a loss on each book and a retained charge from October, and every step left a history line and a replaced schedule version behind it.',
    steps: [
      {
        route: '/assets/FA-0031',
        target: 'det-figures',
        title: 'Open FA-0031 Production Machine Line A.',
        body: 'Cost Rp1.250.000.000, in service since July 2023, 10 years in the accounts and 16 years for tax (Tax group 3).',
        watch: 'September charges Rp10.416.667 in the accounts and Rp6.510.417 for tax.',
      },
      {
        target: 'det-actions',
        title: 'Capitalise an improvement.',
        body: 'An improvement is added to this asset\'s cost. No second asset is created.',
        action: 'Open Actions and select Capitalise an improvement.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Enter the improvement and read both books.',
        body: 'It takes effect from September 2026, the first open period, and moves that period\'s charge.',
        action: 'Enter 60000000 as Improvement cost (Rp), tick "Brings future economic benefit and the cost can be measured reliably", then select Capitalise improvement.',
        watch: 'Cost goes from Rp1.250.000.000 to Rp1.310.000.000. The accounting charge rises from Rp10.416.667 to Rp11.148.374 over the remaining 82 months, and the tax charge from Rp6.510.417 to Rp6.900.027 over 154 months.',
        placement: 'left',
      },
      {
        target: 'det-actions',
        title: 'Revise the useful life.',
        body: 'A change in estimate applies to the accounting book only, from the effective period on.',
        action: 'Open Actions and select Revise useful life or method.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Extend the accounting life from 10 to 12 years.',
        body: 'The remaining carrying amount is spread over the new remaining life.',
        action: 'Enter 12 as Total useful life (years), then select Record revision.',
        watch: 'The accounting charge falls from Rp11.148.374 to Rp8.624.214 a month (106 months remaining). The tax book reads Unchanged at Rp6.900.027, with the note "Tax life is set by the tax group."',
        placement: 'left',
      },
      {
        target: 'det-actions',
        title: 'Dispose of part of the asset.',
        body: 'A partial disposal sells a proportion; the rest carries on as this asset.',
        action: 'Open Actions and select Dispose of part.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Sell a quarter of the line for Rp200.000.000.',
        body: 'Dated at the period end, so September keeps its full charge and the retained part starts in October.',
        action: 'Enter 25 as Share to dispose of (%) and 200000000 as Proceeds (Rp), then select Record partial disposal.',
        watch: 'Accounts: a quarter of Rp905.542.440 goes, a loss of Rp26.385.610, and Rp679.156.830 is retained at Rp6.468.160 a month. Tax: a quarter of Rp1.055.704.127 goes, a loss of Rp63.926.032, and Rp791.778.095 is retained at Rp5.175.020 a month.',
        placement: 'left',
      },
      {
        target: 'det-sched',
        title: 'Read the schedule the three changes produced.',
        body: 'Each change marks the period where its basis starts.',
        watch: 'September: Rp8.624.214 accounts, Rp6.900.027 tax. From October: Rp6.468.160 and Rp5.175.020. Every month up to August is as it was posted.',
        placement: 'top',
      },
      {
        target: 'det-tabs',
        title: 'Open the History.',
        body: 'Every change leaves a line with who recorded it.',
        action: 'Select the History tab.',
      },
      {
        target: 'det-history',
        title: 'The trail of the three changes.',
        body: 'Three lines by Sari Wulandari above the August posting: the improvement and the revision dated 01/09/2026, and the 25% disposal dated 30/09/2026 with its loss on each book.',
        placement: 'top',
      },
      {
        target: 'det-tabs',
        title: 'Open the previous versions.',
        body: 'A replaced schedule is kept, not overwritten.',
        action: 'Select the Depreciation tab, then Previous versions (3).',
      },
      {
        target: 'det-versions',
        title: 'Every basis the asset has had.',
        body: 'Each version keeps its basis and the period it was replaced from.',
        action: 'Switch between Accounting book and Tax book at the top of the drawer.',
        watch: 'Accounting has four versions: entered service, improvement, life revision, partial disposal. Tax has three, because the life revision never reached the tax book.',
        placement: 'left',
      },
    ],
  },
]

export function tourById(id: string): AssetTour | undefined {
  return ASSET_TOURS.find((t) => t.id === id)
}
