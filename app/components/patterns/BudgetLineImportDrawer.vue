<script setup lang="ts">
/**
 * Import budget lines into a draft year (FG-1.4, TS-02). The file is read into
 * a preview with an Errors column; the load runs all or nothing (FG1-AC5), so
 * one bad row loads nothing and the draft stays as it was.
 */
import BudgetLineDrawerShell from '~/components/patterns/BudgetLineDrawerShell.vue'
import { validateImport, budget, type ImportRow, type ImportError } from '~/data/budgetStore'
import { deptName, projectName, accountLabel, BUDGET_DEPARTMENTS, budgetAccount } from '~/data/budgetMaster'
import { importLinesAs } from '~/data/budgetStore'
import { sample2027, sample2027WithErrors, importRowTotal, type SampleFile } from '~/data/budgetUiLines'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; year: number }>()
const emit = defineEmits<{ close: []; loaded: [] }>()
const { t } = useLocale()

const file = ref<SampleFile | null>(null)
const errors = ref<ImportError[]>([])
const loadMessage = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  file.value = null; errors.value = []; loadMessage.value = ''
})

function pick(f: SampleFile) {
  file.value = f
  errors.value = validateImport(f.rows, props.year)
  loadMessage.value = ''
}

const existing = computed(() => budget.lines.filter((l) => l.year === props.year).length)
const fileTotal = computed(() => file.value?.rows.reduce((s, r) => s + importRowTotal(r), 0) ?? 0)
const badRows = computed(() => new Set(errors.value.map((e) => e.row)).size)
function rowErrors(r: ImportRow): string { return errors.value.filter((e) => e.row === r.row).map((e) => e.message).join('; ') }

const deptLabel = (id: string) => BUDGET_DEPARTMENTS.some((d) => d.id === id) ? deptName(id) : id
const acctLabel = (code: string) => budgetAccount(code) ? accountLabel(code) : code

function load() {
  if (!file.value) { loadMessage.value = t('Pick a file to load.'); return }
  const res = importLinesAs(file.value.rows, props.year)
  if (!res.ok) {
    errors.value = res.errors
    loadMessage.value = res.errors.some((e) => e.row === 0)
      ? res.errors[0]!.message
      : t(`Nothing loaded. ${badRows.value} of ${file.value.rows.length} rows have errors. Fix them in the file and upload it again.`)
    return
  }
  successToast(t(`${file.value.rows.length} budget lines loaded into the ${props.year} draft`))
  emit('loaded')
  emit('close')
}
</script>

<template>
  <BudgetLineDrawerShell :is-open="isOpen" :title="t(`Import budget lines · ${year}`)" wide @close="emit('close')">
    <div class="bli-step">
      <div class="bli-step__head">
        <span class="bli-step__title">{{ t('1. Fill in the template') }}</span>
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="infoToast(t('Not in this prototype'))">{{ t('Download template') }}</button>
      </div>
      <p class="bli-note">{{ t('One row per department, project and account, with an amount for each month in whole rupiah. Leave Project blank for costs that belong to no project.') }}</p>
    </div>

    <div class="bli-step">
      <div class="bli-step__head">
        <span class="bli-step__title">{{ t('2. Upload the file') }}</span>
      </div>
      <div class="bli-files">
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="pick(sample2027())">{{ t('Use sample file') }}</button>
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="pick(sample2027WithErrors())">{{ t('Use sample file with errors') }}</button>
      </div>
      <p v-if="existing" class="bli-note">{{ t(`Loading replaces the ${existing} lines already in the ${year} draft.`) }}</p>
    </div>

    <div v-if="file" class="bli-card" data-tour="budget-lines-import-preview">
      <div class="bli-card__head">
        <div>
          <div class="bli-card__title">{{ file.name }}</div>
          <div class="bli-card__sub">
            {{ t(`${file.rows.length} rows · total ${formatIDRWhole(fileTotal)}`) }}
            <template v-if="errors.length"> · <span class="bli-danger">{{ t(`${badRows} rows with errors`) }}</span></template>
          </div>
        </div>
      </div>
      <div class="bli-scroll">
        <table class="bli-table">
          <thead>
            <tr>
              <th class="bli-th">{{ t('Row') }}</th>
              <th class="bli-th">{{ t('Department') }}</th>
              <th class="bli-th">{{ t('Project') }}</th>
              <th class="bli-th">{{ t('Account') }}</th>
              <th class="bli-th bli-th--num">{{ t('Year total') }}</th>
              <th v-if="errors.length" class="bli-th">{{ t('Errors') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in file.rows" :key="r.row" :class="{ 'bli-tr--bad': rowErrors(r) }">
              <td class="bli-td">{{ r.row }}</td>
              <td class="bli-td">{{ deptLabel(r.dept) }}</td>
              <td class="bli-td">{{ r.project ? projectName(r.project) === '-' ? r.project : projectName(r.project) : projectName(null) }}</td>
              <td class="bli-td">{{ acctLabel(r.account) }}</td>
              <td class="bli-td bli-td--num">{{ formatIDRWhole(importRowTotal(r)) }}</td>
              <td v-if="errors.length" class="bli-td bli-td--err">{{ rowErrors(r) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="loadMessage" class="bli-error">{{ loadMessage }}</p>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="load">{{ t('Load lines') }}</button>
    </template>
  </BudgetLineDrawerShell>
</template>

<style scoped>
.bli-step { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bli-step__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.bli-step__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bli-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bli-files { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.bli-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.bli-card__head { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.bli-card__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bli-card__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.bli-danger { color: var(--mp-text-danger); }
.bli-scroll { overflow-x: auto; }
.bli-table { width: 100%; border-collapse: collapse; }
.bli-th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.bli-th--num, .bli-td--num { text-align: right; }
.bli-td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.bli-td--num { white-space: nowrap; }
.bli-td--err { color: var(--mp-text-danger); min-width: 200px; }
.bli-tr--bad .bli-td { background: var(--mp-colors-background-danger); }
.bli-error { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
