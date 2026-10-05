<script setup lang="ts">
/**
 * New budget line on a draft year (FG1-AC1): department, project, account and
 * twelve month amounts. "Spread evenly" splits a year total in whole rupiah
 * with the residue in December (LR-10). Errors show inline; Save stays clickable.
 */
import { MpInput, MpFormControl, MpFormLabel, MpFormErrorMessage } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import BudgetLineDrawerShell from '~/components/patterns/BudgetLineDrawerShell.vue'
import { addDraftLine, updateLineMonths, spreadEvenly, lineById, lineTitle } from '~/data/budgetStore'
import { MONTH_NAMES } from '~/data/budgetMaster'
import { DEPT_OPTIONS, PROJECT_OPTIONS, ACCOUNT_OPTIONS, parseAmount, groupDigits } from '~/data/budgetUiLines'
import { formatIDRWhole } from '~/utils/currency'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; year: number; /** Edit the month amounts of this draft line. */ lineId?: string | null }>()
const emit = defineEmits<{ close: []; saved: [lineId: string] }>()
const { t } = useLocale()

const NO_PROJECT = 'none'
const projectOptions = PROJECT_OPTIONS.map((o) => ({ value: o.value ?? NO_PROJECT, label: o.label }))

const dept = ref('')
const project = ref('')
const account = ref('')
const yearTotal = ref('')
const months = ref<string[]>(Array(12).fill(''))
const errors = ref<string[]>([])
const spreadError = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  dept.value = ''; project.value = ''; account.value = ''; yearTotal.value = ''
  months.value = Array(12).fill('')
  errors.value = []; spreadError.value = ''
  const l = editing.value
  if (l) months.value = l.months.map(groupDigits)
})

const editing = computed(() => (props.lineId ? lineById(props.lineId) ?? null : null))

const monthValues = computed(() => months.value.map(parseAmount))
const total = computed(() => monthValues.value.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0))

function spread() {
  const v = parseAmount(yearTotal.value)
  if (!Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) { spreadError.value = t('Enter a year total in whole rupiah.'); return }
  spreadError.value = ''
  months.value = spreadEvenly(v).map(groupDigits)
}

function save() {
  if (editing.value) {
    const r = updateLineMonths(editing.value.id, monthValues.value)
    if (!r.ok) { errors.value = r.errors.map((e) => t(e)); return }
    successToast(t('Budget line updated'))
    emit('saved', editing.value.id)
    emit('close')
    return
  }
  if (!project.value) { errors.value = [t('Pick a project, or (no project) for costs that belong to no project.')]; return }
  const res = addDraftLine({
    year: props.year, account: account.value, dept: dept.value,
    project: project.value === NO_PROJECT ? null : project.value,
    months: monthValues.value,
  })
  if (!res.ok) { errors.value = res.errors.map((e) => t(e)); return }
  successToast(t('Budget line added'))
  emit('saved', res.line!.id)
  emit('close')
}
</script>

<template>
  <BudgetLineDrawerShell :is-open="isOpen" :title="editing ? t(`Edit amounts · ${year}`) : t(`New budget line · ${year}`)" @close="emit('close')">
    <div v-if="editing" class="bln-identity">{{ lineTitle(editing) }}</div>
    <template v-else>
    <MpFormControl id="bln-dept" is-required>
      <MpFormLabel>{{ t('Department') }}</MpFormLabel>
      <ErpFilterSelect id="bln-dept-select" v-model="dept" :placeholder="t('Select department')" :options="DEPT_OPTIONS" width="100%" />
    </MpFormControl>
    <MpFormControl id="bln-project" is-required>
      <MpFormLabel>{{ t('Project') }}</MpFormLabel>
      <ErpFilterSelect id="bln-project-select" v-model="project" :placeholder="t('Select project')" :options="projectOptions" width="100%" />
    </MpFormControl>
    <MpFormControl id="bln-account" is-required>
      <MpFormLabel>{{ t('Account') }}</MpFormLabel>
      <ErpFilterSelect id="bln-account-select" v-model="account" :placeholder="t('Select account')" :options="ACCOUNT_OPTIONS" width="100%" />
    </MpFormControl>
    </template>

    <div class="bln-spread">
      <MpFormControl id="bln-year-total" :is-invalid="!!spreadError" class="bln-spread__field">
        <MpFormLabel>{{ t('Year total (Rp)') }}</MpFormLabel>
        <MpInput id="bln-year-total-input" v-model="yearTotal" inputmode="numeric" is-full-width @keyup.enter="spread" />
        <MpFormErrorMessage v-if="spreadError">{{ spreadError }}</MpFormErrorMessage>
      </MpFormControl>
      <button class="btn-enterprise btn-enterprise--secondary bln-spread__btn" type="button" @click="spread">{{ t('Spread evenly') }}</button>
    </div>

    <div class="bln-months">
      <MpFormControl v-for="(name, i) in MONTH_NAMES" :id="`bln-m${i}`" :key="name">
        <MpFormLabel>{{ t(name) }}</MpFormLabel>
        <MpInput :id="`bln-m${i}-input`" v-model="months[i]" inputmode="numeric" is-full-width class="bln-month-input" />
      </MpFormControl>
    </div>

    <div class="bln-total">
      <span>{{ t('Year total') }}</span>
      <span class="bln-total__value">{{ formatIDRWhole(total) }}</span>
    </div>

    <ul v-if="errors.length" class="bln-errors">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ editing ? t('Save amounts') : t('Save line') }}</button>
    </template>
  </BudgetLineDrawerShell>
</template>

<style scoped>
.bln-identity { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bln-spread { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); }
.bln-spread__field { flex: 1; }
.bln-spread__btn { flex: none; }
.bln-months { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4) var(--mp-spacing-3); }
.bln-month-input :deep(input) { text-align: right; }
.bln-total {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.bln-total__value { font-weight: var(--mp-font-weights-semi-bold); }
.bln-errors {
  margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4) var(--mp-spacing-3) var(--mp-spacing-8);
  background: var(--mp-colors-background-danger); border-radius: var(--mp-radii-md);
  color: var(--mp-text-danger); font-size: var(--mp-font-sizes-md);
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
}
</style>
