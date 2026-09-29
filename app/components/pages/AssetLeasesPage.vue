<script setup lang="ts">
/**
 * Leases and right-of-use assets (FG-8).
 *
 * A lease produces a right-of-use asset that sits in the ordinary register and
 * depreciates through the ordinary engine. The alternative, a parallel lease
 * register that posts into accounting, is the two-register problem given a
 * different name.
 *
 * PSAK 73 applies where a lease is neither short-term nor low-value. An
 * exempt lease is listed here with its payments expensed, and has no asset.
 *
 * Every figure on this page is computed from the contract terms: the
 * liability by unwinding at the discount rate, the asset's charge by the
 * engine. Nothing is typed in as a balance.
 */
import { computed, ref } from 'vue'
import { MpBadge, MpButton } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import LeaseDrawer from '~/components/patterns/LeaseDrawer.vue'
import { periodLabel, periodShort } from '~/data/assetEngine'
import { CURRENT_PERIOD, canChangeValue } from '~/data/assetStore'
import {
  leaseSummaries, leaseTotals, findLease, leaseSchedule, combinedSchedule, leaseSummary,
} from '~/data/assetLeases'

const { t } = useLocale()
const router = useRouter()

const selectedId = ref<string | null>(null)
const selected = computed(() => (selectedId.value ? findLease(selectedId.value) : undefined))
const detail = computed(() => (selected.value ? leaseSummary(selected.value) : null))
const schedule = computed(() => (selected.value ? combinedSchedule(selected.value) : []))
const scheduleView = ref<'year' | 'all'>('year')
const shownRows = computed(() => (scheduleView.value === 'all'
  ? schedule.value
  : schedule.value.filter((r) => r.period.startsWith('2026'))))

const drawer = ref<{ mode: 'create' | 'modify'; leaseId: string | null } | null>(null)

function openRou(id: string) { router.push(`/assets/${id}`) }
function onDone(message: string, leaseId: string) {
  drawer.value = null
  selectedId.value = leaseId
  successToast(t(message))
}
const exemptLabel = (e: string | null) => (e === 'short-term' ? 'Short-term' : e === 'low-value' ? 'Low-value' : '')
</script>

<template>
  <div class="ls">
    <header class="ls__head">
      <p class="ls__sub">
        {{ t('PSAK 73 · each lease creates a right-of-use asset in the register, depreciating through the normal engine') }}
      </p>
      <MpButton is-rounded @click="drawer = { mode: 'create', leaseId: null }">
        {{ t('New lease') }}
      </MpButton>
    </header>

    <div class="stats-section">
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Leases') }}</div>
        <div class="stat-period">{{ leaseTotals.recognised }} {{ t('recognised') }} · {{ leaseTotals.exempt }} {{ t('exempt') }}</div>
        <div class="stat-amount">{{ leaseTotals.count }}</div>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Lease liability') }}</div>
        <div class="stat-period">{{ t('Outstanding · at 30/09/2026') }}</div>
        <div class="stat-amount">{{ formatIDR(leaseTotals.liability) }}</div>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Right-of-use book value') }}</div>
        <div class="stat-period">{{ t('Accounting · at 30/09/2026') }}</div>
        <div class="stat-amount">{{ formatIDR(leaseTotals.rou) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">{{ t('Exempt lease expense') }}</div>
        <div class="stat-period">{{ t('FY2026 to 30/09') }}</div>
        <div class="stat-amount">{{ formatIDR(leaseTotals.expensed) }}</div>
      </div>
    </div>

    <div class="ls__card" data-tour="lease-row">
      <table class="ls__table">
        <thead>
          <tr>
            <th class="ls__th">{{ t('Lease') }}</th>
            <th class="ls__th">{{ t('Term') }}</th>
            <th class="ls__th">{{ t('Right-of-use asset') }}</th>
            <th class="ls__th ls__th--num">{{ t('Liability') }}</th>
            <th class="ls__th ls__th--num">{{ t('ROU book value') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in leaseSummaries" :key="s.lease.id" class="ls__tr"
            :class="{ 'ls__tr--on': selectedId === s.lease.id }"
            @click="selectedId = s.lease.id"
          >
            <td class="ls__td">
              <span class="ls__name">{{ s.lease.name }}</span>
              <span class="ls__id">{{ s.lease.id }}<template v-if="s.lease.modifications.length"> · {{ t('modified') }}</template></span>
            </td>
            <td class="ls__td">{{ s.term }}</td>
            <td class="ls__td ls__td--mono">
              <span v-if="s.lease.rouAssetId" class="ls__roulink" @click.stop="openRou(s.lease.rouAssetId)">{{ s.lease.rouAssetId }}</span>
              <MpBadge v-else for="additionalInformation" type="announcement">{{ t(`${exemptLabel(s.lease.exemption)} · expensed`) }}</MpBadge>
            </td>
            <td class="ls__td ls__td--num">
              <template v-if="s.lease.exemption"><span class="ls__absent">{{ t('None') }}</span></template>
              <template v-else>{{ formatIDR(s.liability) }}</template>
            </td>
            <td class="ls__td ls__td--num">
              <template v-if="s.rouBookValue === null"><span class="ls__absent">{{ t('No asset') }}</span></template>
              <template v-else>{{ formatIDR(s.rouBookValue) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!selected" class="ls__hint">{{ t('Select a lease to see its schedules.') }}</p>

    <!-- ── The selected lease ── -->
    <section v-if="selected && detail" class="ls__detail">
      <div class="ls__detailhead">
        <div>
          <div class="ls__detailtitle">{{ selected.id }} · {{ selected.name }}</div>
          <div class="ls__detailsub">
            {{ selected.underlying }} · {{ selected.branch }} · {{ detail.term }} ·
            {{ leaseSchedule(selected).current.termMonths }} {{ t('months at') }} {{ formatIDR(leaseSchedule(selected).current.payment) }} ·
            {{ (leaseSchedule(selected).current.annualRate * 100).toFixed(2).replace(/\.?0+$/, '') }}% {{ t('a year') }} ·
            {{ t('options:') }} {{ selected.options }}
          </div>
        </div>
        <MpButton v-if="!selected.exemption && canChangeValue" variant="secondary" is-rounded @click="drawer = { mode: 'modify', leaseId: selected.id }">
          {{ t('Modify lease') }}
        </MpButton>
      </div>

      <!-- The monthly effect: different lines of the P&L, and a different tax deduction. -->
      <div class="ls__monthly" data-tour="lease-monthly">
        <template v-if="selected.exemption">
          <div class="ls__mk"><span>{{ t(`Lease expense · ${periodLabel(CURRENT_PERIOD)}`) }}</span><strong>{{ formatIDR(detail.month.expensed) }}</strong></div>
          <div class="ls__mk"><span>{{ t('Right-of-use asset and liability') }}</span><strong>{{ t('None · exempt') }}</strong></div>
          <div class="ls__mk"><span>{{ t('Tax deduction') }}</span><strong>{{ formatIDR(detail.month.payment) }}</strong></div>
        </template>
        <template v-else>
          <div class="ls__mk"><span>{{ t(`Depreciation · operating expense · ${periodLabel(CURRENT_PERIOD)}`) }}</span><strong>{{ formatIDR(detail.month.rouCharge ?? 0) }}</strong></div>
          <div class="ls__mk"><span>{{ t('Interest · finance cost') }}</span><strong>{{ formatIDR(detail.month.interest) }}</strong></div>
          <div class="ls__mk"><span>{{ t('Accounting total') }}</span><strong>{{ formatIDR((detail.month.rouCharge ?? 0) + detail.month.interest) }}</strong></div>
          <div class="ls__mk"><span>{{ t('Tax deduction · the contract payment') }}</span><strong>{{ formatIDR(detail.month.payment) }}</strong></div>
        </template>
      </div>

      <p v-if="selected.rouAssetId" class="ls__hint">
        {{ t('The right-of-use asset is an ordinary register row:') }}
        <span class="ls__roulink" @click="openRou(selected.rouAssetId)">{{ selected.rouAssetId }}</span>.
        {{ t('It depreciates in every run and ties like any other asset.') }}
      </p>
      <div v-if="selected.modifications.length" class="ls__mods">
        <div v-for="x in selected.modifications" :key="x.id" class="ls__mod">
          {{ x.id }} · {{ t('from') }} {{ periodLabel(x.period) }} ·
          {{ x.extraMonths >= 0 ? '+' : '' }}{{ x.extraMonths }} {{ t('months') }} · {{ formatIDR(x.payment) }} {{ t('a month') }} · {{ x.reason }} · {{ x.recordedBy }}
        </div>
      </div>

      <div class="ls__schedhead">
        <div class="ls__detailtitle">{{ t('Liability and right-of-use schedule') }}</div>
        <div class="ls__seg">
          <MpButton :variant="scheduleView === 'year' ? 'primary' : 'secondary'" size="sm" is-rounded @click="scheduleView = 'year'">{{ t('FY2026') }}</MpButton>
          <MpButton :variant="scheduleView === 'all' ? 'primary' : 'secondary'" size="sm" is-rounded @click="scheduleView = 'all'">{{ t('Whole term') }}</MpButton>
        </div>
      </div>
      <div class="ls__card" data-tour="lease-sched">
        <table class="ls__table">
          <thead>
            <tr>
              <th class="ls__th">{{ t('Period') }}</th>
              <th class="ls__th ls__th--num">{{ t('Opening') }}</th>
              <th class="ls__th ls__th--num">{{ t('Interest') }}</th>
              <th class="ls__th ls__th--num">{{ t('Payment') }}</th>
              <th class="ls__th ls__th--num">{{ t('Closing') }}</th>
              <th class="ls__th ls__th--num">{{ t(selected.exemption ? 'Expensed' : 'ROU depreciation') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shownRows" :key="r.period" class="ls__tr ls__tr--static" :class="{ 'ls__tr--projected': r.state === 'projected' }">
              <td class="ls__td">
                {{ periodShort(r.period) }}
                <span v-if="r.state !== 'posted'" class="ls__state">{{ t(r.state === 'open' ? 'Open' : 'Projected') }}</span>
                <span v-if="r.remeasured" class="ls__remeasured">{{ t(`Remeasured ${formatIDR(r.remeasured.from)} → ${formatIDR(r.remeasured.to)}`) }}</span>
              </td>
              <td class="ls__td ls__td--num">{{ selected.exemption ? '—' : formatIDR(r.opening) }}</td>
              <td class="ls__td ls__td--num">{{ selected.exemption ? '—' : formatIDR(r.interest) }}</td>
              <td class="ls__td ls__td--num">{{ formatIDR(r.payment) }}</td>
              <td class="ls__td ls__td--num">{{ selected.exemption ? '—' : formatIDR(r.closing) }}</td>
              <td class="ls__td ls__td--num">{{ selected.exemption ? formatIDR(r.payment) : formatIDR(r.rouCharge ?? 0) }}</td>
            </tr>
            <tr v-if="!shownRows.length" class="ls__tr ls__tr--static">
              <td class="ls__td" colspan="6">{{ t('No months of this lease fall in FY2026.') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <LeaseDrawer
      :is-open="!!drawer" :mode="drawer?.mode ?? 'create'" :lease-id="drawer?.leaseId ?? null"
      @close="drawer = null" @done="onDone"
    />
  </div>
</template>

<style scoped>
.ls__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.ls__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; margin-bottom: var(--mp-spacing-6); }
.stat-card {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl); white-space: nowrap; font-variant-numeric: tabular-nums; }

.ls__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.ls__table { width: 100%; border-collapse: collapse; }
.ls__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ls__th--num { text-align: right; }
.ls__tr { cursor: pointer; }
.ls__tr:hover .ls__td { background: var(--mp-background-neutral-subtle); }
.ls__tr--on .ls__td { background: var(--mp-background-neutral-subtle); }
.ls__tr--static { cursor: default; }
.ls__tr--static:hover .ls__td { background: transparent; }
.ls__tr--projected .ls__td { color: var(--mp-text-secondary); }
.ls__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ls__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ls__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.ls__roulink { color: var(--mp-text-link); cursor: pointer; }
.ls__roulink:hover { text-decoration: underline; }
.ls__name { display: block; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ls__id { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ls__absent { color: var(--mp-text-secondary); }
.ls__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: var(--mp-spacing-3) 0; }

.ls__detail { margin-top: var(--mp-spacing-6); }
.ls__detailhead { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
.ls__detailtitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ls__detailsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ls__monthly { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.ls__mk { display: flex; flex-direction: column; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ls__mk strong { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); font-variant-numeric: tabular-nums; }
.ls__mods { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin-bottom: var(--mp-spacing-3); }
.ls__mod { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.ls__schedhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin: var(--mp-spacing-4) 0 var(--mp-spacing-3); }
.ls__seg { display: flex; gap: var(--mp-spacing-2); }
.ls__state { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ls__remeasured { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
