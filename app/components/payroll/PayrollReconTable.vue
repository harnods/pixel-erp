<script setup lang="ts">
/**
 * One section of the monthly payroll reconciliation (OD-22): Talenta beside the ledger, by
 * account and tag or by pay item. Ledger = payroll journals + manual entries. A variance row
 * needs a reason and a note (rounding up to Rp1.000 per run is exempt). Flags on the row:
 * "Suggested, not confirmed" (memo of a manual entry), "Repeated manual fix: update the
 * mapping?" (TN-04) and "Possible duplicate claim" beside the run's claim total (TN-27).
 */
import { MpButton } from '@mekari/pixel3'
import { rupiah, can } from '~/data/payrollStore'
import type { ReconRow } from '~/data/payrollUiRecon'

const props = withDefaults(defineProps<{ title: string; rows: ReconRow[]; firstColumn: string; highlight?: string | null }>(), { highlight: null })
const emit = defineEmits<{ (e: 'note', row: ReconRow): void; (e: 'confirm', row: ReconRow): void }>()
const { t } = useLocale()

const totals = computed(() => ({ talenta: props.rows.reduce((s, r) => s + r.talenta, 0), ledger: props.rows.reduce((s, r) => s + r.ledger, 0) }))
const needsNote = (r: ReconRow) => r.variance !== 0 && !(r.rounding && Math.abs(r.variance) <= 1_000) && !r.note
</script>

<template>
  <div class="prt">
    <div class="prt-head">
      <span class="prt-title">{{ title }}</span>
      <span class="prt-hint">{{ rows.filter(needsNote).length }} {{ t(rows.filter(needsNote).length === 1 ? 'row needs a note' : 'rows need a note') }}</span>
    </div>
    <table class="prt-table">
      <thead>
        <tr>
          <th>{{ firstColumn }}</th>
          <th class="prt-r">{{ t('Talenta') }}</th>
          <th class="prt-r">{{ t('Ledger') }}</th>
          <th class="prt-r">{{ t('Variance') }}</th>
          <th>{{ t('Reason and note') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.key" :class="{ 'prt-hl': highlight === r.key }">
          <td>
            <span>{{ r.label }}</span>
            <span v-if="r.section" class="prt-sub">{{ t(r.section) }}</span>
            <span v-if="r.manual" class="prt-sub">{{ t('Manual entries') }} {{ rupiah(r.manual) }}</span>
            <span v-if="r.repeated" class="prt-warn">{{ t('Repeated manual fix: update the mapping?') }} <NuxtLink class="prt-link" to="/payroll-settings">{{ t('Open settings') }}</NuxtLink></span>
            <span v-if="r.duplicateClaim" class="prt-warn">{{ t('Possible duplicate claim') }}: {{ t('manual') }} {{ rupiah(r.duplicateClaim.manual) }} · {{ t('claims in the run') }} {{ rupiah(r.duplicateClaim.runClaims) }}</span>
          </td>
          <td class="prt-r">{{ rupiah(r.talenta) }}</td>
          <td class="prt-r">{{ rupiah(r.ledger) }}</td>
          <td class="prt-r" :class="{ 'prt-var': r.variance }">{{ rupiah(r.variance) }}</td>
          <td class="prt-note">
            <template v-if="r.note">
              <span>{{ t(r.note.reason) }}: {{ r.note.note }}</span>
              <span class="prt-sub">{{ r.note.by }}</span>
            </template>
            <template v-else-if="r.suggested">
              <span>{{ r.suggested }}</span>
              <span class="prt-warn">{{ t('Suggested, not confirmed') }}</span>
            </template>
            <span v-else-if="r.rounding && r.variance" class="prt-sub">{{ t('Rounding, exempt up to Rp1.000') }}</span>
            <span v-else-if="needsNote(r)" class="prt-warn">{{ t('Needs a reason and a note') }}</span>
            <div v-if="r.variance && can('recon.note')" class="prt-actions">
              <MpButton v-if="r.suggested && !r.note" variant="secondary" size="sm" is-rounded @click="emit('confirm', r)">{{ t('Confirm') }}</MpButton>
              <MpButton variant="secondary" size="sm" is-rounded @click="emit('note', r)">{{ r.note || r.suggested ? t('Edit note') : t('Add note') }}</MpButton>
            </div>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="5" class="prt-empty">{{ t('No rows for this month') }}</td></tr>
        <tr v-else class="prt-total">
          <td>{{ t('Total') }}</td>
          <td class="prt-r">{{ rupiah(totals.talenta) }}</td>
          <td class="prt-r">{{ rupiah(totals.ledger) }}</td>
          <td class="prt-r">{{ rupiah(totals.ledger - totals.talenta) }}</td>
          <td />
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.prt { border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.prt-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.prt-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.prt-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.prt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.prt-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.prt-table th:first-child { width: 34%; }
.prt-table th:last-child { width: 28%; }
.prt-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; overflow-wrap: anywhere; }
.prt-table .prt-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.prt-var { color: var(--mp-colors-text-warning); font-weight: var(--mp-font-weights-semi-bold); }
.prt-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.prt-warn { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.prt-link { color: var(--mp-colors-text-link, var(--mp-text-link)); }
.prt-note { font-size: var(--mp-font-sizes-sm); }
.prt-actions { display: flex; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
.prt-total td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-colors-background-neutral-subtle); border-bottom: 0; }
.prt-empty { text-align: center; color: var(--mp-colors-text-secondary); }
.prt-hl td { background: var(--mp-colors-background-warning); }
</style>
