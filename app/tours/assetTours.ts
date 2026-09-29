/**
 * Guided tours: the tour content, SIM-1 to SIM-7.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * Rewritten from the handover's tours.json against the prototype as it now
 * computes. Every figure quoted here was read off the running app after
 * resetAssetStore(), and tests/asset-tours.spec.ts replays the SIM-7 chain
 * through the store so a figure that drifts fails the suite.
 */
import type { ViewAsRole } from '~/data/assetStore'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'bottom-start' | 'bottom-end' | 'left-start' | 'right-start'

export interface TourStep {
  /** The route to be on for this step. Pushed only when the current one differs. */
  route?: string
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
}

const EXPORT_NOTE = 'Export is not part of this prototype, so the tour ends on the screen before it.'

export const ASSET_TOURS: AssetTour[] = [
  // ── SIM-1 ─────────────────────────────────────────────────────────────────
  {
    id: 'sim1',
    code: 'SIM-1',
    name: 'File the return without opening Excel',
    persona: 'Tax Manager',
    role: 'Tax',
    blurb: 'Classification through to the statutory filing, with the figures the tax team defends.',
    closing: 'Classification set the fiscal life, the tax book produced its own schedule, the statement showed a disposal that is a gain in the accounts and a loss for tax, the derivation panel defended one figure line by line, deferred tax came out of the arithmetic, and Lampiran 9 became producible once nothing was left unclassified.',
    steps: [
      {
        route: '/assets',
        target: 'reg-stats',
        title: 'Find the asset with no tax group.',
        body: 'An asset with no tax group has no fiscal life, so it has no tax schedule and cannot be filed. The register says so instead of looking complete.',
        action: 'Switch the book to Both, then select "1 asset excluded, no tax group" under Tax book value.',
        watch: 'FA-0077 Toyota Avanza B 6512 TRK is the only row. Its status is Incomplete and its tax book value reads Not computed, never a zero.',
      },
      {
        route: '/assets/FA-0077',
        target: 'det-fiscal',
        title: 'Open FA-0077 and set its statutory group.',
        body: 'The asset record states the gap at the top rather than burying it in a field.',
        action: 'Select Set group.',
      },
      {
        target: 'cls-body',
        title: 'Assign Tax group 2.',
        body: 'The group carries the statutory life. Nothing else needs typing.',
        action: 'Choose Tax group 2 as the statutory group, leave the fiscal life at 8 years, and select Save classification.',
        watch: 'The fiscal life fills itself in as 8 years the moment the group is chosen.',
        placement: 'left',
      },
      {
        target: 'det-sched',
        title: 'Read the two schedules side by side.',
        body: 'The tax book is a second schedule on the same asset, computed from the in-service date on the statutory life.',
        watch: 'The accounting charge is Rp4.416.667 a month over 5 years; the tax charge is Rp2.760.417 a month over 8 years. The difference column is Rp1.656.250 every month.',
        placement: 'top',
      },
      {
        route: '/tax-differences',
        target: 'diff-table',
        title: 'Open the accounting to tax difference report.',
        body: 'Each asset and event is listed with the reason its two books disagree, so the fiscal correction can be traced back to its source.',
        watch: 'FA-0077 now appears with a tax life longer than accounting (8 years against 5), and the per-asset total still ties to the statement figure, Rp79.921.875.',
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
        target: 'det-sched',
        title: 'Pick one tax figure to defend.',
        body: 'Any charge in the schedule opens its derivation.',
        action: 'Select the September 2026 tax charge, Rp6.510.417.',
        placement: 'top',
      },
      {
        target: 'deriv-body',
        title: 'Read the derivation of the FA-0031 September tax charge.',
        body: 'Every line is an arithmetic step, not a log entry.',
        watch: 'Opening basis Rp1.250.000.000 over 192 months (16 years, Tax group 3), month 39 of 192, charge Rp6.510.417.',
        placement: 'left',
      },
      {
        route: '/tax-book',
        target: 'cmp-deftax',
        title: 'Read the deferred tax effect off the net temporary difference.',
        body: 'The figure sits on the same statement as the difference it derives from.',
        watch: 'With FA-0077 now in the tax book the net temporary difference is Rp79.921.875 and the deferred tax effect at 22% is Rp17.582.813. Before the classification they were Rp94.828.125 and Rp20.862.188.',
        placement: 'top',
      },
      {
        route: '/lampiran-9',
        target: 'lamp-both',
        title: 'Lampiran 9 can now be produced.',
        body: `Classifying the last asset lifts the refusal. ${EXPORT_NOTE}`,
        watch: '23 tangible assets in half 1 and 4 intangible assets in half 2, none unclassified.',
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
    closing: 'The run was generated when it was wanted, the journal date followed a stated policy instead of a hard-coded month end, the posted journal carries its reference, and the close ended on a self-check that shows the ledger agrees with the register and names the one asset still outside the tax book.',
    steps: [
      {
        route: '/depreciation-schedule',
        target: 'run-empty',
        title: 'Generate the depreciation for September 2026.',
        body: 'The run is generated on demand, not by a calendar job.',
        action: 'Leave the period at September 2026 and select Generate.',
        watch: 'Both books are generated in one pass. There is no separate tax run to remember.',
      },
      {
        target: 'run-table',
        title: 'Review the draft before anything is committed.',
        body: 'A draft can be regenerated as often as needed. Only posting commits it.',
        action: 'Expand September 2026 to see each asset\'s line.',
        watch: 'The run posts Rp140.217.604 across 21 assets. FA-0077 posts its accounting charge of Rp4.416.667 but has no tax charge, because it has no statutory group. One incomplete record does not hold the close hostage.',
        placement: 'top',
      },
      {
        route: '/asset-settings',
        target: 'set-jdate',
        title: 'Set the journal date by policy.',
        body: 'The company states the date once, as a policy, rather than choosing it on each run.',
        action: 'Choose "A fixed day of the following month" and keep day 5.',
        watch: 'The line above the control now reads that the September 2026 run will be dated 05/10/2026. The tours.json version switched to the posting date, but in this prototype the posting date is 30/09/2026, the same as the period end, so it would show no change.',
      },
      {
        route: '/depreciation-schedule',
        target: 'run-current',
        title: 'The run picks the policy up.',
        body: 'Nothing on the run itself was edited.',
        action: 'Select Review and post.',
        watch: 'The journal is now dated 05/10/2026, a fixed day of the following month.',
      },
      {
        target: 'run-post',
        title: 'Post the run.',
        body: 'The journal lines are shown before anything posts.',
        action: 'Select Post journal.',
        placement: 'left',
      },
      {
        target: 'run-table',
        title: 'The reference is on the run.',
        body: 'Each posted period carries its journal number and date, which is what makes a drill-down from the ledger possible.',
        watch: 'September 2026 now reads Posted, with its JV-2026 journal number, dated 05/10/2026.',
        placement: 'top',
      },
      {
        route: '/period-self-check',
        target: 'recon-table',
        title: 'Close on the sub-ledger to ledger check.',
        body: 'Nothing outside the asset module can post to an asset control account, so these tie by construction.',
        watch: 'Cost, accumulated depreciation, depreciation expense, impairment and gain on disposal all show no difference.',
        placement: 'top',
      },
      {
        target: 'recon-checks',
        title: 'Read what the self-check could not confirm.',
        body: 'A check that cannot run is never reported as a pass.',
        watch: '2 of 4 checks pass. Tax book coverage finds FA-0077 in the register but not in the tax book, and export coverage cannot run until every asset has a statutory group. The tours.json version said there was nothing left to find; with FA-0077 unclassified there is.',
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
    closing: 'An impairment re-spread the remaining life without touching a posted period, the prior schedule was kept rather than deleted, a disposal produced opposite signs on the two books, a cost error in posted months was caught up in the first open period, and the derivation panel showed an impairment inside its arithmetic.',
    steps: [
      {
        route: '/assets/FA-0042',
        target: 'det-figures',
        title: 'Open FA-0042 Packing Machine Line B, damaged in September.',
        body: 'The schedule does not know about the damage yet.',
        watch: 'The charge is Rp2.916.667 a month on both books.',
      },
      {
        target: 'det-actions',
        title: 'Record the impairment through the value-change action.',
        body: 'One entry point for every change to an asset\'s value.',
        action: 'Open Actions and choose Record an impairment test.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Enter the test and read the preview.',
        body: 'The drawer states the loss and the resulting charge before anything is recorded.',
        action: 'Choose Physical damage as the indicator, enter 400000000 as the recoverable amount and "Appraisal, PT Penilai Independen" as the source, then select Record test.',
        watch: 'Carrying amount Rp472.499.990 against Rp400.000.000 recoverable: a loss of Rp72.499.990. From October the accounting charge falls to Rp2.469.136; the tax book is marked Unchanged at Rp2.916.667.',
        placement: 'left',
      },
      {
        target: 'det-sched',
        title: 'Read the regenerated schedule.',
        body: 'The impairment is dated at the period end, so September keeps its charge and the new basis starts in October.',
        action: 'Then select Previous versions.',
        watch: 'From October the accounting column is Rp2.469.136 against Rp2.916.667 on the tax side.',
        placement: 'top',
      },
      {
        target: 'det-versions',
        title: 'The schedule the impairment replaced is kept.',
        body: 'A superseded version stays readable with its basis, next to the live one.',
        placement: 'left',
      },
      {
        route: '/assets/FA-0047',
        target: 'det-actions',
        title: 'Dispose of FA-0047 Toyota Innova B 1234 XYZ.',
        body: 'Disposals are dated at a period end under the full-month convention, so this one is 30/09/2026.',
        action: 'Close the drawer if it is still open, then open Actions and choose Dispose.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Enter the proceeds and read both bases.',
        body: 'The drawer shows both books before it records.',
        action: 'Enter 200000000 as the proceeds, then select Record disposal.',
        watch: 'A gain of Rp26.750.011 in the accounts and a loss of Rp52.656.239 for tax. The tax book depreciates over 8 years against 5, so its carrying amount is higher.',
        placement: 'left',
      },
      {
        route: '/tax-book',
        target: 'cmp-disposal',
        title: 'The disposal lands on the tax statement.',
        body: 'The accountant sees what the tax manager will.',
        watch: 'FA-0047 now sits beside FA-0071, each with its accounting and tax gain or loss.',
        placement: 'top',
      },
      {
        route: '/assets/FA-0064',
        target: 'det-actions',
        title: 'Correct a cost error on an asset whose earlier periods are posted.',
        body: 'A posted period is never edited. The correction is caught up in the first open period.',
        action: 'Open Actions and choose Correct an error.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Enter the corrected cost.',
        body: 'FA-0064 Backup 100kVA Generator was keyed at Rp245.000.000.',
        action: 'Enter 250000000 as the corrected cost and "Supplier invoice is 250 million" as the reason, then select Record correction.',
        watch: 'September carries Rp1.692.698 on both books, a catch-up of Rp390.615 for the posted months included; from October the charge is Rp1.302.083. August and earlier do not move.',
        placement: 'left',
      },
      {
        route: '/assets/FA-0068',
        target: 'det-sched',
        title: 'Open a figure with an impairment in its chain.',
        body: 'FA-0068 Forklift Toyota 3T was impaired on 30/06/2026.',
        action: 'Select the July 2026 accounting charge, Rp4.000.000.',
        placement: 'top',
      },
      {
        target: 'deriv-body',
        title: 'The impairment is a line in the arithmetic.',
        body: 'The derivation states the adjustment that set the basis.',
        watch: 'Opening basis Rp184.000.000 (Rp420.000.000 cost less Rp236.000.000), 46 months remaining from July 2026, charge Rp4.000.000. The tax column stays at Rp4.375.000: the impairment never touched it.',
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
    blurb: 'Custody, a frozen count, variances resolved, and a write-off that needs authorising.',
    closing: 'General Affairs read and edited the register without meeting acquisition cost, counted a frozen population and resolved what did not match, and the Finance Director authorised the one action that removes value from the balance sheet. Same register, three roles, one trail.',
    steps: [
      {
        route: '/assets',
        target: 'reg-view',
        title: 'The register as General Affairs sees it.',
        body: 'View as is set to General Affairs (Rudi Santoso) for this part of the tour. Cost and book values are not shown to this role.',
        watch: 'Custody gaps counts the assets with no custodian or no location. FA-0047 is one of them.',
      },
      {
        route: '/custody-and-counts',
        target: 'cust-unassigned',
        title: 'Assign a custodian and a location to FA-0047.',
        body: 'A missing custodian is a named gap, not a blank.',
        action: 'Select Assign on Toyota Innova B 1234 XYZ.',
        placement: 'top',
      },
      {
        target: 'cust-body',
        title: 'Record the custody change with a reason.',
        body: 'The change is dated and carries a reason, which is what makes the custody history usable later.',
        action: 'Choose Siti Rahma (GA) as custodian and HQ vehicle pool as location, enter "Assigned to the HQ pool" as the reason, then select Save custody.',
        placement: 'left',
      },
      {
        target: 'cust-table',
        title: 'Read everything one person holds.',
        body: 'Custody is also a view by person.',
        action: 'Select Rudi Santoso (Warehouse).',
        watch: 'Seven assets across the Medan and Rungkut locations.',
        placement: 'top',
      },
      {
        route: '/asset-settings',
        target: 'appr-rules',
        role: 'Owner',
        title: 'Turn on approval for write-offs.',
        body: 'View as switches to Owner for this step: only the Owner changes approval rules. Every rule is off by default, and with it off a count write-off would complete at once. The tours.json version assumed approval was already on.',
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
        title: 'Scope the count to Medan Warehouse and freeze the population.',
        body: 'A frozen population makes the result reproducible.',
        action: 'Keep the scope on Location, choose Medan Warehouse, then select Freeze population and start.',
        watch: 'Four tagged assets are frozen (FA-0068, FA-0083, FA-0023, FA-0064), with Rudi Santoso as counter. The tours.json version said six; the sample data holds four there.',
      },
      {
        target: 'count-mobile',
        title: 'Capture three assets.',
        body: 'Scanning is simulated: type or paste the tag code, as a scanner would.',
        action: 'Type TAG-MDN-068, press Enter, then TAG-MDN-083 and Enter. Then set Counting at to Medan pool, type TAG-MDN-023 and press Enter.',
        watch: 'The racking is recorded as found at Medan pool. The generator, TAG-MDN-064, is never scanned.',
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
        action: 'Resolve TAG-MDN-023 as Transfer, location now Medan pool, reason "Moved to the pool store". Resolve TAG-MDN-064 as Write off, reason "Not found at the count". Save each resolution.',
        watch: 'The write-off reads Sent for approval once the session closes, not Resolved. The distinction is the point.',
        placement: 'top',
      },
      {
        target: 'count-session',
        title: 'Close the session.',
        body: 'Everything else applies now; the write-off waits for approval.',
        action: 'Select Close session.',
        watch: 'The racking reads Location updated. The generator reads Sent for approval, AP-0032.',
      },
      {
        route: '/asset-approvals',
        target: 'appr-032',
        role: 'Approver',
        title: 'The write-off arrives in the Finance Director\'s queue.',
        body: 'View as switches to Approver (Fitri Handayani): the person who raised a request cannot approve it.',
        watch: 'AP-0032 writes off FA-0064 Backup 100kVA Generator: Rp225.859.370 in the accounts and Rp225.859.370 for tax. The tours.json version quoted nil and 10.000.000; the generator still carries its full carrying amount on both books.',
        placement: 'top',
      },
      {
        target: 'appr-approve',
        title: 'Approve the write-off.',
        body: 'Approval applies the held change through the engine.',
        action: 'Select Approve.',
        placement: 'left',
      },
      {
        route: '/custody-and-counts',
        target: 'count-session',
        title: 'Back on the count report.',
        body: 'The approval trail stays on the transaction and the asset history records who decided what.',
        watch: 'The generator\'s row now reads Approved AP-0032 by Fitri Handayani: disposed with no proceeds on both books. On FA-0064 itself the status is Disposed and the History shows the request and the approval, both on 30/09/2026. The tours.json version posted it to October; this prototype dates it to the open period.',
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
        placement: 'top',
      },
      {
        target: 'lease-sched',
        title: 'Read the liability against the right-of-use depreciation.',
        body: 'Two schedules from one contract.',
        watch: 'Interest falls every month as the liability unwinds, while the right-of-use charge stays flat.',
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
        title: 'Extend the term by twelve months.',
        body: 'A modification remeasures the liability and adjusts the asset by the same amount.',
        action: 'Select Cakung Leased Warehouse again, then Modify lease in its detail.',
        placement: 'top',
      },
      {
        target: 'lease-modify',
        title: 'Read the remeasurement before it is recorded.',
        body: 'The form starts at the open period with a twelve-month extension.',
        action: 'Keep 12 months, enter "Addendum 2, twelve-month extension" as what changed, then select Remeasure.',
        watch: 'The liability moves from Rp1.354.548.021 to Rp1.678.623.620, an adjustment of Rp324.075.599. ROU-0004 depreciation goes from Rp30.911.248 to Rp30.027.109 a month, ending January 2031.',
        placement: 'left',
      },
      {
        target: 'lease-sched',
        title: 'The remaining schedule moved; the posted months did not.',
        body: 'Nothing posted before the modification changes.',
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
    blurb: 'Intangibles in the same register, a permanent divergence on goodwill, the annual test obligation, and both halves of the filing.',
    closing: 'Four intangibles sat in the same register as everything else, goodwill showed a divergence that never reverses, the derivation panel defended the tax amortisation with the same engine, the year end raised a test obligation, and a test that found nothing was kept as the evidence. The filing counts both halves, and says plainly why it cannot be produced yet.',
    steps: [
      {
        route: '/assets',
        target: 'reg-filters',
        title: 'Filter the register to intangible assets.',
        body: 'Intangibles live in the same register, with the same engine.',
        action: 'Choose Intangible in the Type filter.',
        watch: 'Four rows with an Intangible badge. Nobody holds a patent in a warehouse, so there is no custodian.',
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
        title: 'The derivation of the tax amortisation.',
        body: 'The same engine as the tangible assets.',
        watch: 'Rp2.400.000.000 over 240 months, month 31 of 240, charge Rp10.000.000. The divergence is permanent: the accounting side never amortises.',
        placement: 'left',
      },
      {
        route: '/impairment-tests',
        target: 'imp-annual',
        title: 'Year end raises the annual test obligation.',
        body: 'Goodwill and indefinite-life intangibles are tested every year whether or not anything is wrong.',
        action: 'Select Test FA-0091.',
        watch: '1 of 2 done: the brand FA-0093 is already tested, goodwill FA-0091 is outstanding. The tours.json version rewound both tests and tested the brand; here the brand\'s test is sample data, so the tour tests goodwill.',
        placement: 'top',
      },
      {
        target: 'imp-form',
        title: 'Record a test that finds no impairment.',
        body: 'A test that finds nothing is retained as the evidence that it happened.',
        action: 'Enter 2600000000 as the recoverable amount, choose Value in use as the basis and "Management projection" as the source, then select Save.',
        placement: 'top',
      },
      {
        target: 'imp-annual',
        title: 'The obligation is complete.',
        body: 'The test sits in the list as a first-class record.',
        watch: '2 of 2 done, and the new test reads Not impaired.',
        placement: 'top',
      },
      {
        route: '/lampiran-9',
        target: 'lamp-both',
        title: 'Both halves of the statutory filing, counts stated.',
        body: `A filing covering only tangible assets completes half a return. ${EXPORT_NOTE}`,
        watch: '22 tangible and 4 intangible assets, with FA-0077 unclassified, so the page refuses to produce the file and says which asset and how much cost is missing. The tours.json version showed 19 tangible and a finished export.',
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
    closing: 'One asset took three value changes in the open period. The improvement moved both books, the life revision moved the accounts only, the partial disposal produced a loss on each book and a retained charge from October, and every step left a history line and a superseded schedule version behind it.',
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
        action: 'Open Actions and choose Capitalise an improvement.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Enter the improvement and read both books.',
        body: 'It takes effect from September 2026, the first open period, and moves that period\'s charge.',
        action: 'Enter 60000000 as the amount, tick the capitalisation test, then select Capitalise improvement.',
        watch: 'Cost goes from Rp1.250.000.000 to Rp1.310.000.000. The accounting charge rises from Rp10.416.667 to Rp11.148.374 over the remaining 82 months; the tax charge from Rp6.510.417 to Rp6.900.027 over 154 months. The tax treatment is labelled as pending tax team confirmation.',
        placement: 'left',
      },
      {
        target: 'det-actions',
        title: 'Revise the useful life.',
        body: 'A change in estimate applies to the accounting book only, from the effective period on.',
        action: 'Open Actions and choose Revise useful life or method.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Extend the accounting life from 10 to 12 years.',
        body: 'The remaining carrying amount is spread over the new remaining life.',
        action: 'Enter 12 as the useful life in years, then select Record revision.',
        watch: 'The accounting charge falls from Rp11.148.374 to Rp8.624.214 a month (106 months remaining). The tax book is marked Unchanged at Rp6.900.027: the tax life is fixed by the statutory group.',
        placement: 'left',
      },
      {
        target: 'det-actions',
        title: 'Dispose of part of the asset.',
        body: 'A partial disposal sells a proportion; the rest carries on as this asset.',
        action: 'Open Actions and choose Dispose of part.',
        placement: 'left',
      },
      {
        target: 'vc-body',
        title: 'Sell a quarter of the line for Rp200.000.000.',
        body: 'Dated at the period end, so September keeps its full charge and the retained part starts in October.',
        action: 'Enter 25 as the percentage and 200000000 as the proceeds, then select Record partial disposal.',
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
        body: 'A superseded schedule is kept, not overwritten.',
        action: 'Select the Depreciation tab, then Previous versions.',
      },
      {
        target: 'det-versions',
        title: 'Every basis the asset has had.',
        body: 'Each version keeps its basis and the period it was superseded from.',
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
