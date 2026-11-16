<script setup lang="ts">
/**
 * Compare two budget versions line by line (FG-1.4 version compare): each
 * line's amount as at version A and version B, and the difference.
 */
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import BudgetLineDrawerShell from '~/components/patterns/BudgetLineDrawerShell.vue'
import type { BudgetLine } from '~/data/budgetStore'
import { versionsOfYear, compareVersions } from '~/data/budgetUiLines'
import { formatIDRWhole } from '~/utils/currency'

const props = defineProps<{ isOpen: boolean; year: number; lines: BudgetLine[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()
const router = useRouter()

const versions = computed(() => versionsOfYear(props.year))
const options = computed(() => versions.value.map((v) => ({ value: String(v.no), label: `Version ${v.no} · ${v.type}${v.no ? ` · ${v.docNo}` : ''}` })))
const a = ref('')
const b = ref('')
watch(() => props.isOpen, (open) => {
  if (!open) return
  const vs = versions.value
  a.value = vs.length ? String(vs[0]!.no) : ''
  b.value = vs.length ? String(vs[vs.length - 1]!.no) : ''
})

const rows = computed(() => (a.value && b.value ? compareVersions(props.year, Number(a.value), Number(b.value), props.lines) : []))
const totals = computed(() => rows.value.reduce((s, r) => ({ a: s.a + r.a, b: s.b + r.b, diff: s.diff + r.diff }), { a: 0, b: 0, diff: 0 }))
const changed = computed(() => rows.value.filter((r) => r.diff !== 0).length)
const signed = (n: number) => (n > 0 ? `+${formatIDRWhole(n)}` : formatIDRWhole(n))
</script>

<template>
  <BudgetLineDrawerShell :is-open="isOpen" :title="t(`Compare versions · ${year}`)" wide @close="emit('close')">
    <p v-if="!versions.length" class="blc-note">{{ t(`${year} has no versions yet. Version 0 is posted when the budget is locked.`) }}</p>
    <template v-else>
      <div class="blc-pickers">
        <div class="blc-field">
          <span class="blc-label">{{ t('Version A') }}</span>
          <ErpFilterSelect id="blc-a" v-model="a" :placeholder="t('Select version')" :options="options" width="100%" :is-clearable="false" />
        </div>
        <div class="blc-field">
          <span class="blc-label">{{ t('Version B') }}</span>
          <ErpFilterSelect id="blc-b" v-model="b" :placeholder="t('Select version')" :options="options" width="100%" :is-clearable="false" />
        </div>
      </div>
      <p class="blc-note">{{ t(`${changed} of ${rows.length} lines differ between Version ${a} and Version ${b}.`) }}</p>
      <div class="blc-card">
        <table class="blc-table">
          <thead>
            <tr>
              <th class="blc-th">{{ t('Budget line') }}</th>
              <th class="blc-th blc-num">{{ t(`Version ${a}`) }}</th>
              <th class="blc-th blc-num">{{ t(`Version ${b}`) }}</th>
              <th class="blc-th blc-num">{{ t('Difference') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.lineId" :class="{ 'blc-tr--changed': r.diff !== 0 }">
              <td class="blc-td"><span class="cell-link" @click="router.push(`/budget-lines/${r.lineId}`)">{{ r.title }}</span></td>
              <td class="blc-td blc-num">{{ formatIDRWhole(r.a) }}</td>
              <td class="blc-td blc-num">{{ formatIDRWhole(r.b) }}</td>
              <td class="blc-td blc-num" :class="{ 'blc-neg': r.diff < 0, 'blc-pos': r.diff > 0 }">{{ r.diff ? signed(r.diff) : '-' }}</td>
            </tr>
            <tr class="blc-tr--total">
              <td class="blc-td">{{ t('Total') }}</td>
              <td class="blc-td blc-num">{{ formatIDRWhole(totals.a) }}</td>
              <td class="blc-td blc-num">{{ formatIDRWhole(totals.b) }}</td>
              <td class="blc-td blc-num">{{ totals.diff ? signed(totals.diff) : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Close') }}</button>
    </template>
  </BudgetLineDrawerShell>
</template>

<style scoped>
.blc-pickers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.blc-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.blc-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.blc-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.blc-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.blc-table { width: 100%; border-collapse: collapse; }
.blc-th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.blc-td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.blc-num { text-align: right; white-space: nowrap; }
.blc-neg { color: var(--mp-text-danger); }
.blc-pos { color: var(--mp-colors-text-success); }
.blc-tr--total .blc-td { font-weight: var(--mp-font-weights-semi-bold); border-bottom: 0; }
</style>
