<script setup lang="ts">
/**
 * Early warnings on a posted run (OD-14, TN-16): a transfer or resignation dated inside the
 * period. Events received within 10 minutes of each other group into one warning block.
 * A re-send clears them; the Accountant may dismiss with a reason (and, for a transfer, a pick).
 */
import { MpIcon } from '@mekari/pixel3'
import PayrollWarningDismissDrawer from '~/components/payroll/PayrollWarningDismissDrawer.vue'
import { payroll, runById, can, dateLabel, wib, type EarlyWarning } from '~/data/payrollStore'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const receivedAt = (w: EarlyWarning) => payroll.events.find((e) => e.id === w.eventId)?.receivedAt ?? ''
const isTransfer = (w: EarlyWarning) => w.type === 'talenta.employee.transfer.approved'
const typeLabel = (w: EarlyWarning) => (isTransfer(w) ? 'Transfer' : 'Resignation')
const groupLabel = (g: { organization_name: string; branch_name: string } | null) => (g ? `${g.organization_name} / ${g.branch_name}` : '')

const open = computed(() => (run.value?.warnings ?? []).filter((w) => !w.dismissed))
const dismissed = computed(() => (run.value?.warnings ?? []).filter((w) => w.dismissed))

/** Warnings of one type received within 10 minutes of the first in the group. */
const groups = computed(() => {
  const out: { key: string; type: string; at: string; items: EarlyWarning[] }[] = []
  const sorted = [...open.value].sort((a, b) => receivedAt(a).localeCompare(receivedAt(b)))
  for (const w of sorted) {
    const last = out[out.length - 1]
    const at = receivedAt(w)
    if (last && last.type === typeLabel(w) && Date.parse(at) - Date.parse(last.at) <= 10 * 60_000) last.items.push(w)
    else out.push({ key: w.id, type: typeLabel(w), at, items: [w] })
  }
  return out
})
const groupTitle = (g: { type: string; items: EarlyWarning[] }) =>
  g.items.length > 1 ? `${g.items.length} ${g.type === 'Transfer' ? 'transfers' : 'resignations'}` : g.type

const dismissing = ref<EarlyWarning | null>(null)
</script>

<template>
  <section v-if="open.length || dismissed.length" class="pwl" data-testid="payroll-warnings">
    <div class="pwl__head">
      <div class="pwl__title">{{ t('Early warnings') }}</div>
      <div class="pwl__sub">
        {{ open.length ? t(`${open.length} open · the run may change`) : t('No open warnings') }}
      </div>
    </div>

    <div v-for="g in groups" :key="g.key" class="pwl__group">
      <div class="pwl__note" role="alert">
        <MpIcon name="warning-circular" size="sm" />
        <div>
          <div class="pwl__notetitle">{{ t(groupTitle(g)) }} · {{ t(`received ${wib(g.at)}`) }}</div>
          <div>{{ t('The run may change. Ask HR to re-send if Talenta recalculated payroll.') }}</div>
        </div>
      </div>
      <div class="pwl__scroll">
        <table class="pwl__table">
          <thead>
            <tr>
              <th class="pwl__th">{{ t('Event') }}</th>
              <th class="pwl__th">{{ t('Employee ID') }}</th>
              <th class="pwl__th">{{ t('Effective date') }}</th>
              <th class="pwl__th">{{ t('Old group') }}</th>
              <th class="pwl__th">{{ t('New group') }}</th>
              <th v-if="can('warning.dismiss')" class="pwl__th pwl__th--act" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in g.items" :key="w.id" :data-testid="`pwl-row-${w.id}`">
              <td class="pwl__td">{{ t(typeLabel(w)) }}</td>
              <td class="pwl__td pwl__nowrap">{{ w.employee_id }}</td>
              <td class="pwl__td pwl__nowrap">{{ dateLabel(w.effective) }}</td>
              <td class="pwl__td">{{ groupLabel(w.from) || '-' }}</td>
              <td class="pwl__td">{{ isTransfer(w) ? groupLabel(w.to) : t('Leaves the company') }}</td>
              <td v-if="can('warning.dismiss')" class="pwl__td pwl__td--act">
                <span class="cell-link" :data-testid="`pwl-dismiss-${w.id}`" @click="dismissing = w">{{ t('Dismiss') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="dismissed.length" class="pwl__group">
      <div class="pwl__subtitle">{{ t('Dismissed') }}</div>
      <div class="pwl__scroll">
        <table class="pwl__table">
          <thead>
            <tr>
              <th class="pwl__th">{{ t('Event') }}</th>
              <th class="pwl__th">{{ t('Employee ID') }}</th>
              <th class="pwl__th">{{ t('Effective date') }}</th>
              <th class="pwl__th">{{ t('Outcome') }}</th>
              <th class="pwl__th">{{ t('Reason') }}</th>
              <th class="pwl__th">{{ t('Dismissed by') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in dismissed" :key="w.id">
              <td class="pwl__td">{{ t(typeLabel(w)) }}</td>
              <td class="pwl__td pwl__nowrap">{{ w.employee_id }}</td>
              <td class="pwl__td pwl__nowrap">{{ dateLabel(w.effective) }}</td>
              <td class="pwl__td">{{ isTransfer(w) ? t(w.dismissed!.pick) : '-' }}</td>
              <td class="pwl__td">{{ w.dismissed!.reason }}</td>
              <td class="pwl__td pwl__nowrap">{{ w.dismissed!.by }} · {{ wib(w.dismissed!.at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <PayrollWarningDismissDrawer :run-id="runId" :warning="dismissing" @close="dismissing = null" />
  </section>
</template>

<style scoped>
.pwl { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pwl__head { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pwl__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pwl__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pwl__subtitle { padding: var(--mp-spacing-3) var(--mp-spacing-4) 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.pwl__group + .pwl__group { border-top: 1px solid var(--mp-border-default); }
.pwl__note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin: var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-colors-background-warning); border-radius: var(--mp-radii-md);
  color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.pwl__notetitle { font-weight: var(--mp-font-weights-semi-bold); }
.pwl__scroll { overflow-x: auto; }
.pwl__table { width: 100%; border-collapse: collapse; }
.pwl__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pwl__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pwl__table tbody tr:last-child .pwl__td { border-bottom: 0; }
.pwl__th--act, .pwl__td--act { text-align: right; }
.pwl__nowrap { white-space: nowrap; }
</style>
