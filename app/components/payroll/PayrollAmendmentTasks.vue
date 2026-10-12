<script setup lang="ts">
/**
 * PPh 21 amendment tasks (OD-16, TN-22): one task per tax period, opened when any of the five
 * tax totals moved for any employee between versions. Tax Staff closes it as Amended (pembetulan
 * number and new PPh 21 total, compared with the expected figure), Not filed yet, or Dismissed.
 */
import { MpBadge } from '@mekari/pixel3'
import PayrollAmendmentCloseDrawer from '~/components/payroll/PayrollAmendmentCloseDrawer.vue'
import { amendmentTasks, runById, can, monthLabel, rupiah, wib } from '~/data/payrollStore'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const tasks = computed(() => amendmentTasks.value
  .filter((x) => x.runId === props.runId || x.taxMonth === run.value?.month)
  .sort((a, b) => b.taxMonth.localeCompare(a.taxMonth) || b.openedAt.localeCompare(a.openedAt)))

type Task = (typeof amendmentTasks.value)[number]
const closing = ref<Task | null>(null)
const expanded = ref<Record<string, boolean>>({})

const STATUS_COLOR: Record<string, 'orange' | 'green' | 'gray' | 'blue'> = { Open: 'orange', Amended: 'green', 'Not filed yet': 'blue', Dismissed: 'gray' }
const signed = (n: number) => (n > 0 ? `+${rupiah(n)}` : rupiah(n))
const FIELDS = ['PPh 21 Benefit', 'PPH 21 Payment', 'Total PPh 21 DTP Received', 'PPh 21 Resign Benefit', 'PPh 26 Benefit'] as const
const FIELD_LABEL: Record<(typeof FIELDS)[number], string> = {
  'PPh 21 Benefit': 'PPh 21 Benefit', 'PPH 21 Payment': 'PPH 21 Payment', 'Total PPh 21 DTP Received': 'PPh 21 DTP',
  'PPh 21 Resign Benefit': 'PPh 21 severance', 'PPh 26 Benefit': 'PPh 26',
}
const outcome = (x: Task) => {
  if (x.status === 'Amended') return `Pembetulan ${x.pembetulanNo} · new PPh 21 total ${rupiah(x.newTotal ?? 0)}`
  if (x.status === 'Not filed yet') return 'Not filed yet: filed with new figures'
  if (x.status === 'Dismissed') return x.reason ?? ''
  return ''
}
</script>

<template>
  <section v-if="tasks.length" class="pat" data-testid="payroll-amendments" data-tour="payroll-amendments">
    <div class="pat__head">
      <div class="pat__title">{{ t('PPh 21 amendment') }}</div>
      <div class="pat__sub">{{ t('One task per tax period. A later version updates the open task.') }}</div>
    </div>

    <div v-for="x in tasks" :key="x.id" class="pat__task" :data-testid="`pat-${x.id}`">
      <div class="pat__row">
        <div class="pat__main">
          <div class="pat__tasktitle">
            {{ t(x.title) }}
            <MpBadge variant="subtle" :variant-color="STATUS_COLOR[x.status] ?? 'gray'">{{ t(x.status) }}</MpBadge>
          </div>
          <div class="pat__tasksub">
            {{ t(x.summary) }} · {{ t(`v${x.fromVersion} to v${x.toVersion}`) }}
            <template v-if="x.noLedgerChange"> · {{ t('Tax change, no ledger change') }}</template>
            · {{ t(`opened ${wib(x.openedAt)}`) }}
          </div>
          <div v-if="x.status === 'Open'" class="pat__gap" :class="{ 'pat__gap--due': x.depositGap.startsWith('Deposit') && !x.depositGap.includes('matches') }">{{ t(x.depositGap) }}</div>
          <div v-if="x.status !== 'Open'" class="pat__tasksub">{{ t(outcome(x)) }}<template v-if="x.closedBy"> · {{ x.closedBy }}</template></div>
        </div>
        <div class="pat__actions">
          <span class="cell-link" @click="expanded[x.id] = !expanded[x.id]">{{ expanded[x.id] ? t('Hide staff') : t(`Show ${x.employees.length} staff`) }}</span>
          <button v-if="x.status === 'Open' && can('task.close')" class="btn-enterprise btn-enterprise--secondary" type="button" :data-testid="`pat-close-${x.id}`" @click="closing = x">{{ t('Close task') }}</button>
        </div>
      </div>
      <div v-if="expanded[x.id]" class="pat__scroll">
        <table class="pat__table">
          <thead>
            <tr>
              <th class="pat__th">{{ t('Employee ID') }}</th>
              <th v-for="f in FIELDS" :key="f" class="pat__th pat__num">{{ t(FIELD_LABEL[f]) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in x.employees" :key="e.employee_id">
              <td class="pat__td">{{ e.employee_id }}</td>
              <td v-for="f in FIELDS" :key="f" class="pat__td pat__num">{{ e.changes[f] ? signed(e.changes[f]!) : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <PayrollAmendmentCloseDrawer :task="closing" @close="closing = null" />
  </section>
</template>

<style scoped>
.pat { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pat__head { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pat__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pat__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pat__task + .pat__task { border-top: 1px solid var(--mp-border-default); }
.pat__row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.pat__main { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.pat__tasktitle { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pat__tasksub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pat__gap { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pat__gap--due { color: var(--mp-colors-text-warning); font-weight: var(--mp-font-weights-semi-bold); }
.pat__actions { flex: none; display: flex; align-items: center; gap: var(--mp-spacing-4); }
.pat__scroll { overflow-x: auto; border-top: 1px solid var(--mp-border-default); }
.pat__table { width: 100%; border-collapse: collapse; }
.pat__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pat__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pat__table tbody tr:last-child .pat__td { border-bottom: 0; }
.pat__num { text-align: right; white-space: nowrap; }
</style>
