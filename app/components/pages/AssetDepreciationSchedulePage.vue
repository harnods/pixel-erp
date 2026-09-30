<script setup lang="ts">
/**
 * Depreciation schedule — FY2026 by period.
 *
 * The page is named for a schedule, so it is one: rows are months, and the
 * table answers *when*. Which periods are closed, what this month will book,
 * what is coming, and when the charge steps down because an asset reached the
 * end of its life. The per-asset breakdown a period is made of is one expand
 * away rather than being the whole screen — as a listing of 24 assets for a
 * single month, it duplicated Tax book and had no time axis at all.
 *
 * Posting is the other half. A preparer will not press a button that writes to
 * the general ledger without seeing the entry, so Post opens the journal it
 * will produce — accounts, amounts, date — and commits only on confirmation.
 * Afterwards the row carries the journal number, because a posted run the
 * product cannot show you afterwards is indistinguishable from one that never
 * happened.
 *
 * Only the accounting charge posts. The tax column is computed and reported
 * and reaches no ledger: Indonesian statutory reporting is a computation on
 * the commercial ledger, not a parallel one, so a tax line here would
 * overstate depreciation expense with nothing appearing out of balance.
 */
import { computed, ref } from 'vue'
import { MpButton, MpIcon, MpTooltip } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { successToast, infoToast } from '~/utils/toasts'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  fy2026Schedule, scheduleTotals, journalFor, nextJournalNumber,
  type SchedulePeriod,
} from '~/data/depreciationSchedule'
import {
  runFor, postRun, reverseRun, nextUnposted, CURRENT_MONTH,
} from '~/data/fixedAssetSession'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  generateRun, postPeriod, draftRunFor, lastPostedPeriod, nextOpenPeriod, periodOfMonth, FY_PERIODS, CURRENT_PERIOD,
  canChangeValue, viewAs, journals,
} from '~/data/assetStore'
import { isAfter, periodLabel, periodEndDate, formatLife } from '~/data/assetEngine'
import { journalDateFor, journalDatePolicyLabel, autoPostRuns } from '~/data/assetPolicy'
import { projection, PROJECTION_HORIZONS } from '~/data/assetPreview'

const { t } = useLocale()
const router = useRouter()

const periods = computed(() => fy2026Schedule())
const totals = computed(() => scheduleTotals(periods.value))

/** The period the preparer can act on — the earliest month still a draft. */
const actionable = computed(() =>
  nextUnposted.value === null ? null : periods.value[nextUnposted.value] ?? null,
)

// ── Expanding a period ──────────────────────────────────────────────────────
// One open at a time: a breakdown is 20-odd rows, and two open at once pushes
// the schedule itself off the screen.
const openMonth = ref<number | null>(null)
function toggle(m: number) {
  openMonth.value = openMonth.value === m ? null : m
}

// ── Posting ─────────────────────────────────────────────────────────────────
const confirming = ref<SchedulePeriod | null>(null)
const journal = computed(() => (confirming.value ? journalFor(confirming.value) : []))
const journalTotal = computed(() => journal.value.reduce((s, l) => s + (l.debit ?? 0), 0))

/**
 * OD-09. The journal date follows the policy set in Asset settings: period
 * end, the posting date (today), or a fixed day of the following month.
 */
const today = periodEndDate(CURRENT_PERIOD)
function periodEnd(month: number): string {
  return journalDateFor(periodOfMonth(month), today)
}

// ── Generating a run (OD-08, FG2-AC1, FG2-AC4) ─────────────────────────────
// Any period up to today can be asked for. A closed one is refused with the
// next open period named, and nothing is written.
const genPeriod = ref<string>(nextOpenPeriod.value ?? CURRENT_PERIOD)
const genOptions = FY_PERIODS.filter((p) => !isAfter(p, CURRENT_PERIOD)).map((p) => ({ value: p, label: periodLabel(p) }))
const genError = ref('')
const genDone = ref('')
function generate() {
  genError.value = ''
  genDone.value = ''
  if (!canChangeValue.value) { genError.value = t(`Viewing as ${viewAs.value}. Only Owner or Accounting can generate a run.`); return }
  const r = generateRun(genPeriod.value)
  if (!r.ok) { genError.value = t(r.reason); return }
  const label = periodLabel(r.run.period)
  // OD-10: with automatic posting on, a generated run posts at once. It can
  // still be reversed, the same way as one posted by hand.
  if (autoPostRuns.value && nextOpenPeriod.value === r.run.period) {
    const pr = postPeriod(r.run.period)
    if (pr.ok) {
      genDone.value = t(`${label} generated and posted · ${pr.run.journal} · ${r.run.lines.length} ${r.run.lines.length === 1 ? 'asset' : 'assets'}`)
      successToast(genDone.value)
      return
    }
  }
  genDone.value = t(`${label} draft generated · ${r.run.lines.length} ${r.run.lines.length === 1 ? 'asset' : 'assets'} · ${formatIDRWhole(r.run.total)}`)
  successToast(genDone.value)
}
const draftFor = (month: number) => draftRunFor(periodOfMonth(month))
/** The date the posted journal actually carries: set by the policy at posting time. */
function journalDateOf(month: number): string | null {
  const no = runFor(month)?.journal
  return no ? journals.value.find((j) => j.number === no)?.date ?? null : null
}

// ── Forward projection (OD-12) ──────────────────────────────────────────────
const horizon = ref<string>('12')
const horizonOptions = PROJECTION_HORIZONS.map((n) => ({ value: String(n), label: `${n} months` }))
const projected = computed(() => (periods.value, projection(Number(horizon.value))))
const projectedTotals = computed(() => ({
  accounting: projected.value.reduce((s, m) => s + m.accounting, 0),
  tax: projected.value.reduce((s, m) => s + m.tax, 0),
}))

// Read inside the computed so it re-reads after every post and reversal.
const pendingNumber = computed(() => (periods.value, nextJournalNumber()))

function confirmPost() {
  const p = confirming.value
  if (!p) return
  const number = pendingNumber.value
  const r = postRun(p.month)
  if (!r.ok) { infoToast(r.reason); return }
  successToast(t(`${p.label} depreciation posted · ${number}`))
  confirming.value = null
}

function reverse(p: SchedulePeriod) {
  const r = reverseRun(p.month)
  if (!r.ok) { infoToast(r.reason); return }
  infoToast(t(`${p.label} posting reversed · ${r.run.reversal?.journal}`))
}

function viewJournal(p: SchedulePeriod) {
  infoToast(t(`${runFor(p.month)?.journal} is not part of this prototype.`))
}

function openAsset(id: string) { router.push(`/assets/${id}`) }

function stateLabel(p: SchedulePeriod) {
  if (p.state === 'posted') return 'Posted'
  if (p.state === 'draft') return 'Draft'
  return 'Projected'
}
</script>

<template>
  <div class="ds">
    <!-- ── The run you can act on ── -->
    <!-- The September / FY-to-date toggle is gone: every month is a row now,
         so a control switching between two of them said the same thing twice —
         and sitting beside Post it implied a year could be posted at once. -->
    <div v-if="actionable" class="ds__run" data-tour="run-current">
      <div class="ds__runbody">
        <div class="ds__runlabel">{{ t('Current period') }}</div>
        <div class="ds__runperiod">{{ actionable.label }}</div>
        <div class="ds__runnote">
          {{ actionable.assetCount }} {{ t(actionable.assetCount === 1 ? 'asset' : 'assets') }}
          · {{ t('journal date') }} {{ periodEnd(actionable.month) }}
          <span data-tour="set-jdate-effect">({{ t(journalDatePolicyLabel()) }})</span>
          · {{ draftFor(actionable.month) ? t(`draft generated ${draftFor(actionable.month)!.generatedOn}`) : t('no draft yet') }}
          <template v-if="autoPostRuns"> · {{ t('posts automatically when generated') }}</template>
        </div>
      </div>
      <div class="ds__runfig">
        <div class="ds__runfiglabel">{{ t('Depreciation to post') }}</div>
        <div class="ds__runfigvalue">{{ formatIDRWhole(actionable.accounting) }}</div>
      </div>
      <MpButton is-rounded @click="confirming = actionable">{{ t('Review and post') }}</MpButton>
    </div>

    <!-- On-demand generation for a chosen period. -->
    <div class="ds__gen" data-tour="run-empty">
      <div class="ds__genfield">
        <label class="ds__genlabel" for="ds-gen-period">{{ t('Run period') }}</label>
        <ErpFilterSelect id="ds-gen-period" v-model="genPeriod" :placeholder="t('Select period')" :options="genOptions" width="220px" :is-clearable="false" />
      </div>
      <MpButton variant="secondary" is-rounded @click="generate">{{ t('Generate run') }}</MpButton>
      <p v-if="genError" class="ds__generror">{{ genError }}</p>
      <p v-else-if="genDone" class="ds__gendone">{{ genDone }}</p>
      <p v-else class="ds__genhint">{{ t('Generating again replaces the draft. Posted runs are not affected.') }}</p>
    </div>

    <!-- ── Year figures ── -->
    <div class="stats-section">
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Posted to date') }}</div>
        <div class="stat-period">
          {{ totals.bookedThrough ? t(`Accounting · through ${totals.bookedThrough}`) : t('No periods posted') }}
        </div>
        <div class="stat-amount">{{ formatIDRWhole(totals.booked.accounting ?? 0) }}</div>
      </div>

      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('FY2026 forecast') }}</div>
        <div class="stat-period">{{ t('Accounting · posted and projected') }}</div>
        <div class="stat-amount">{{ formatIDRWhole(totals.year.accounting ?? 0) }}</div>
      </div>

      <!-- The tax side reaches the SPT Tahunan once a year, so it belongs here
           as one annual figure rather than in every monthly row. Tax book owns
           the koreksi fiskal itself; this states the year's difference and
           hands off. -->
      <div class="stat-card">
        <div class="stat-title">{{ t('Tax difference · FY2026') }}</div>
        <div class="stat-period">{{ t('Accounting less tax · full year') }}</div>
        <div class="stat-amount">
          {{ formatIDRWhole((totals.year.accounting ?? 0) - (totals.year.tax ?? 0)) }}
        </div>
        <span class="stat-link" @click="router.push('/tax-book')">{{ t('View Tax book') }}</span>
      </div>
    </div>

    <!-- ── The schedule ── -->
    <div class="ds__card" data-tour="run-table">
      <table class="ds__table">
        <thead>
          <!-- Accounting only. The tax charge is a yearly output — it reaches
               the SPT Tahunan once, and nothing monthly consumes it — so on a
               monthly close it is a column nobody acts on eleven times a year.
               The year figure sits in the stats above, and the whole koreksi
               fiskal story belongs to Tax book.
               ONE header for both levels. An expanded period used to draw a
               second header row whose columns sat in different positions from
               the first, so the table appeared to change shape half way down;
               sharing the grid means a period and the assets inside it line up
               under the same headings and only the indent says which is which. -->
          <tr>
            <th class="ds__th ds__th--period">{{ t('Period') }}</th>
            <th class="ds__th ds__th--num ds__th--opt">{{ t('Cost') }}</th>
            <th class="ds__th ds__th--num ds__th--opt">{{ t('Opening accumulated') }}</th>
            <th class="ds__th ds__th--num">{{ t('Charge') }}</th>
            <th class="ds__th ds__th--num ds__th--opt">{{ t('Closing accumulated') }}</th>
            <th class="ds__th ds__th--num">{{ t('Book value') }}</th>
            <th class="ds__th ds__th--state">{{ t('Status') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="p in periods" :key="p.month">
            <tr
              class="ds__tr"
              :class="{
                'ds__tr--current': p.month === CURRENT_MONTH,
                'ds__tr--projected': p.state === 'projected',
                'ds__tr--open': openMonth === p.month,
              }"
              @click="toggle(p.month)"
            >
              <td class="ds__td ds__td--period">
                <MpIcon
                  class="ds__chev"
                  :name="openMonth === p.month ? 'chevrons-down' : 'chevrons-right'"
                  size="sm"
                />
                <span class="ds__periodname">{{ p.label }}</span>
                <span class="ds__count">
                  {{ p.assetCount }} {{ t(p.assetCount === 1 ? 'asset' : 'assets') }}
                </span>
              </td>
              <td class="ds__td ds__td--num ds__td--quiet ds__td--opt">{{ formatIDRWhole(p.cost) }}</td>
              <td class="ds__td ds__td--num ds__td--quiet ds__td--opt">{{ formatIDRWhole(p.openingAccumulated) }}</td>
              <td class="ds__td ds__td--num ds__td--charge">{{ formatIDRWhole(p.accounting) }}</td>
              <td class="ds__td ds__td--num ds__td--quiet ds__td--opt">{{ formatIDRWhole(p.closingAccumulated) }}</td>
              <td class="ds__td ds__td--num">{{ formatIDRWhole(p.closingBookValue) }}</td>
              <td class="ds__td ds__td--state" @click.stop>
                <div class="ds__stateinner">
                  <ErpStatusBadge
                    :status="p.state === 'posted' ? 'active' : p.state === 'draft' ? 'pending' : 'draft'"
                    :label="t(stateLabel(p))"
                    badge-for="additionalInformation"
                  />
                  <!-- A posted run the product cannot show you afterwards is
                       indistinguishable from one that never happened. -->
                  <span v-if="p.state === 'posted'" class="ds__journal" @click="viewJournal(p)">
                    {{ runFor(p.month)?.journal }}
                  </span>
                  <span v-if="p.state === 'posted' && journalDateOf(p.month)" class="ds__count">{{ t('dated') }} {{ journalDateOf(p.month) }}</span>
                  <MpTooltip
                    v-if="p.state === 'posted' && periodOfMonth(p.month) === lastPostedPeriod"
                    :id="`ds-rev-${p.month}`" :label="t('Reverse posting')" placement="top" use-portal
                  >
                    <MpButton
                      class="ds__revbtn" variant="ghost" is-rounded
                      :aria-label="t('Reverse posting')" @click="reverse(p)"
                    >
                      <MpIcon name="undo" size="sm" />
                    </MpButton>
                  </MpTooltip>
                </div>
              </td>
            </tr>

            <!-- Per-asset rows — the same grid, indented. Not a nested table:
                 its own header repeated the one above in different positions,
                 which is what made the table look like it changed shape. -->
            <tr
              v-for="r in (openMonth === p.month ? p.rows : [])"
              :key="`${p.month}-${r.asset.id}`"
              class="ds__tr ds__tr--asset"
            >
              <td class="ds__td ds__td--period ds__td--child">
                <span class="ds__childcol">
                  <span class="ds__name" @click="openAsset(r.asset.id)">{{ r.asset.name }}</span>
                  <span class="ds__id">
                    {{ r.asset.id }} ·
                    <template v-if="r.asset.indefiniteLife">{{ t('Indefinite life') }}</template>
                    <template v-else-if="r.asset.commercialLifeMonths">
                      {{ t('Straight line') }}, {{ t(formatLife(r.asset.commercialLifeMonths)) }}
                    </template>
                    <!-- Only where the charge is not the ordinary full month:
                         the exception is the thing worth reading. -->
                    <template v-if="r.convention"> · {{ t(r.convention) }}</template>
                  </span>
                </span>
              </td>
              <td class="ds__td ds__td--num ds__td--quiet ds__td--opt">{{ formatIDRWhole(r.asset.cost) }}</td>
              <td class="ds__td ds__td--num ds__td--quiet ds__td--opt">
                {{ r.openingAccumulated === null ? '—' : formatIDRWhole(r.openingAccumulated) }}
              </td>
              <!-- Never 0 where the figure does not exist. -->
              <td class="ds__td ds__td--num">
                <span v-if="r.accounting === null" class="ds__absent">{{ t(r.accountingAbsent ?? 'Not computed') }}</span>
                <template v-else>{{ formatIDRWhole(r.accounting) }}</template>
              </td>
              <td class="ds__td ds__td--num ds__td--quiet ds__td--opt">
                {{ r.closingAccumulated === null ? '—' : formatIDRWhole(r.closingAccumulated) }}
              </td>
              <td class="ds__td ds__td--num">
                {{ r.closingBookValue === null ? '—' : formatIDRWhole(r.closingBookValue) }}
              </td>
              <td class="ds__td" />
            </tr>
          </template>

          <tr class="ds__tr ds__tr--total">
            <td class="ds__td">{{ t('FY2026') }}</td>
            <td class="ds__td ds__td--opt" />
            <td class="ds__td ds__td--opt" />
            <td class="ds__td ds__td--num">{{ formatIDRWhole(totals.year.accounting ?? 0) }}</td>
            <td class="ds__td ds__td--opt" />
            <td class="ds__td ds__td--num">{{ formatIDRWhole(periods[11]?.closingBookValue ?? 0) }}</td>
            <td class="ds__td" />
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Forward projection (OD-12) ── -->
    <div class="ds__proj">
      <div class="ds__projhead">
        <div>
          <div class="ds__projtitle">{{ t('Projected depreciation') }}</div>
          <div class="ds__projsub">
            {{ projected[0]?.label }} {{ t('to') }} {{ projected[projected.length - 1]?.label }} · {{ t('assumes no additions or disposals') }}
          </div>
        </div>
        <div class="ds__genfield">
          <label class="ds__genlabel" for="ds-horizon">{{ t('Range') }}</label>
          <ErpFilterSelect id="ds-horizon" v-model="horizon" :placeholder="t('Select range')" :options="horizonOptions" width="160px" :is-clearable="false" />
        </div>
      </div>
      <div class="ds__card">
        <table class="ds__table">
          <thead>
            <tr>
              <th class="ds__th ds__th--period">{{ t('Period') }}</th>
              <th class="ds__th ds__th--num">{{ t('Accounting charge') }}</th>
              <th class="ds__th ds__th--num">{{ t('Tax charge') }}</th>
              <th class="ds__th ds__th--num">{{ t('Difference') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in projected" :key="m.period" class="ds__tr ds__tr--projected ds__tr--static">
              <td class="ds__td">
                <span class="ds__periodname">{{ m.label }}</span>
                <span class="ds__count"> {{ m.assets }} {{ t(m.assets === 1 ? 'asset' : 'assets') }}</span>
              </td>
              <td class="ds__td ds__td--num">{{ formatIDRWhole(m.accounting) }}</td>
              <td class="ds__td ds__td--num">{{ formatIDRWhole(m.tax) }}</td>
              <td class="ds__td ds__td--num">{{ formatIDRWhole(m.accounting - m.tax) }}</td>
            </tr>
            <tr class="ds__tr ds__tr--total ds__tr--static">
              <td class="ds__td">{{ t(`Next ${horizon} months`) }}</td>
              <td class="ds__td ds__td--num">{{ formatIDRWhole(projectedTotals.accounting) }}</td>
              <td class="ds__td ds__td--num">{{ formatIDRWhole(projectedTotals.tax) }}</td>
              <td class="ds__td ds__td--num">{{ formatIDRWhole(projectedTotals.accounting - projectedTotals.tax) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Journal preview ── -->
    <!-- rule/drawer-custom-shell — a hand-rolled Teleport shell; the backdrop
         is a backdrop, close is the × and Cancel. -->
    <Teleport to="body">
      <div v-if="confirming" class="ds__overlay">
        <aside class="ds__drawer" role="dialog" :aria-label="t('Post depreciation')">
          <header class="ds__drawerhead">
            <div>
              <div class="ds__drawertitle">{{ t('Post depreciation') }}</div>
              <div class="ds__drawersub">
                {{ confirming.label }} · {{ pendingNumber }} · {{ t('dated') }} {{ periodEnd(confirming.month) }}
              </div>
            </div>
            <MpButton variant="ghost" is-rounded :aria-label="t('Close')" @click="confirming = null">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="ds__drawerbody" data-tour="run-post">
            <table class="ds__jtable">
              <thead>
                <tr>
                  <th class="ds__jth">{{ t('Account') }}</th>
                  <th class="ds__jth ds__jth--num">{{ t('Debit') }}</th>
                  <th class="ds__jth ds__jth--num">{{ t('Credit') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(l, i) in journal" :key="i">
                  <td class="ds__jtd">
                    <span class="ds__jacct">{{ l.account }}</span>
                    <span class="ds__jdesc">{{ l.description }}</span>
                  </td>
                  <td class="ds__jtd ds__jtd--num">{{ l.debit === null ? '' : formatIDRWhole(l.debit) }}</td>
                  <td class="ds__jtd ds__jtd--num">{{ l.credit === null ? '' : formatIDRWhole(l.credit) }}</td>
                </tr>
                <tr class="ds__jtotal">
                  <td class="ds__jtd">{{ t('Total') }}</td>
                  <td class="ds__jtd ds__jtd--num">{{ formatIDRWhole(journalTotal) }}</td>
                  <td class="ds__jtd ds__jtd--num">{{ formatIDRWhole(journalTotal) }}</td>
                </tr>
              </tbody>
            </table>

            <p class="ds__jnote">
              {{ t('Posts the accounting book only. The tax book has no journal.') }}
            </p>
          </div>

          <footer class="ds__drawerfoot">
            <MpButton variant="ghost" is-rounded @click="confirming = null">{{ t('Cancel') }}</MpButton>
            <MpButton is-rounded data-tour="dlg-primary" @click="confirmPost">{{ t('Post journal') }}</MpButton>
          </footer>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* The current run, where the action is. Not a banner: it is the one thing the
   preparer came here to do, so it reads as a control rather than a notice. */
.ds__run {
  display: flex; align-items: center; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-5);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
}
.ds__runbody { flex: 1; min-width: 0; }
.ds__runlabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ds__runperiod { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ds__runnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ds__runfig { text-align: right; flex: none; }
.ds__runfiglabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ds__runfigvalue {
  font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}

.ds__gen { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; margin-bottom: var(--mp-spacing-5); }
.ds__genfield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ds__genlabel { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ds__genhint, .ds__gendone, .ds__generror { font-size: var(--mp-font-sizes-sm); margin: 0; line-height: var(--mp-line-heights-sm); flex-basis: 100%; }
.ds__genhint { color: var(--mp-text-secondary); }
.ds__gendone { color: var(--mp-text-default); }
.ds__generror { color: var(--mp-text-critical); }
.ds__proj { margin-top: var(--mp-spacing-6); }
.ds__projhead { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
.ds__projtitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ds__projsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ds__tr--static { cursor: default; }

.stats-section {
  display: flex; gap: var(--mp-spacing-6); align-items: flex-start;
  margin-bottom: var(--mp-spacing-6);
}
.stat-card {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.stat-period { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.stat-amount { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl); font-variant-numeric: tabular-nums; }
.stat-link {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
  cursor: pointer; line-height: var(--mp-line-heights-sm);
}

.ds__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.ds__table { width: 100%; border-collapse: collapse; }
.ds__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.ds__th--num { text-align: right; }
.ds__th--state { width: 200px; }
.ds__th--period { min-width: 180px; }

.ds__tr { cursor: pointer; }
.ds__tr:hover .ds__td { background: var(--mp-background-neutral-hovered); }
.ds__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ds__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
/* Supporting balances sit back so the charge — the figure that posts — is the
   one the eye lands on in a row of five numbers. */
.ds__td--quiet { color: var(--mp-text-secondary); }
.ds__td--charge { font-weight: var(--mp-font-weights-semi-bold); }
.ds__td--period { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ds__chev { color: var(--mp-icon-default, var(--mp-text-secondary)); flex: none; }
.ds__periodname { white-space: nowrap; }
/* The asset count rides with the period name rather than taking a column of
   its own — it is context for the row, not a figure to compare down a column. */
.ds__count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

/* ── Asset rows ── */
/* Children of the period above: same columns, indented past the chevron, on
   the subtle ground so the group reads as one block rather than as more
   periods. The indent plus the rule down the left is what says "inside"; no
   second header is needed. */
.ds__tr--asset .ds__td {
  background: var(--mp-background-neutral-subtle);
  padding-top: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.ds__tr--asset:hover .ds__td { background: var(--mp-background-neutral-hovered); }
/* A period row is the parent, so it carries the weight; its children are
   plain. Without this the two levels read as equals despite the indent. */
.ds__tr--open .ds__td { font-weight: var(--mp-font-weights-semi-bold); }
.ds__td--child {
  padding-left: var(--mp-spacing-10);
  border-left: 2px solid var(--mp-border-default);
}
.ds__childcol { display: flex; flex-direction: column; min-width: 0; }
/* Six money columns do not fit a 1280px window. The accumulated balances and
   cost are the supporting arithmetic — the charge and the book value are the
   line itself — so they drop first rather than letting the row overflow. */
@media (max-width: 1500px) {
  .ds__th--opt, .ds__td--opt { display: none; }
}

/* The month you are standing in, marked by weight rather than colour so the
   projected rows below stay the quieter thing on the screen. */
.ds__tr--current .ds__td { font-weight: var(--mp-font-weights-semi-bold); }
/* A forecast must never read as a booked figure. */
.ds__tr--projected .ds__td { color: var(--mp-text-secondary); }
.ds__tr--open .ds__td { background: var(--mp-background-neutral-hovered); }

.ds__stateinner { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ds__journal { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; white-space: nowrap; }
.ds__journal:hover { text-decoration: underline; }
.ds__revbtn { flex: none; }
.ds__absent { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.ds__tr--total .ds__td {
  font-weight: var(--mp-font-weights-semi-bold);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 0; border-top: 1px solid var(--mp-border-default);
}

/* ── Asset row typography ── */
.ds__name { color: var(--mp-text-link); cursor: pointer; }
.ds__name:hover { text-decoration: underline; }
.ds__id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Journal preview drawer ── */
/* 1300 matches BillsFiltersDrawer: the app header is 1100, and a drawer below
   it renders with its own header hidden behind the chrome. */
.ds__overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
.ds__drawer {
  position: absolute; top: 0; right: 0; bottom: 0; width: 560px; max-width: 94vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default); overflow: hidden;
}
.ds__drawerhead {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.ds__drawertitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ds__drawersub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ds__drawerbody { padding: var(--mp-spacing-4) var(--mp-spacing-6); overflow: auto; flex: 1; }
.ds__drawerfoot {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  border-top: 1px solid var(--mp-border-default);
}

.ds__jtable { width: 100%; border-collapse: collapse; }
.ds__jth {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); padding: var(--mp-spacing-2) 0;
  border-bottom: 1px solid var(--mp-border-default);
}
.ds__jth--num { text-align: right; }
.ds__jtd {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.ds__jtd--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: var(--mp-spacing-4); }
.ds__jacct { display: block; }
.ds__jdesc { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ds__jtotal .ds__jtd { font-weight: var(--mp-font-weights-semi-bold); border-bottom: 0; }
.ds__jnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-4); }
</style>
