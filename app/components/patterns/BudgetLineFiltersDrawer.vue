<script setup lang="ts">
/**
 * All filters for Budget lines: department, project, account and class at once.
 * Values in one dimension OR, dimensions AND. Edits a local draft and commits
 * only on Apply (rule/filters-drawer).
 */
import { MpCheckbox } from '@mekari/pixel3'
import BudgetLineDrawerShell from '~/components/patterns/BudgetLineDrawerShell.vue'
import {
  DEPT_OPTIONS, PROJECT_OPTIONS, ACCOUNT_OPTIONS, CLASS_OPTIONS, emptyLineFilters, type LineFilters,
} from '~/data/budgetUiLines'

const props = defineProps<{ isOpen: boolean; modelValue: LineFilters }>()
const emit = defineEmits<{ close: []; 'update:modelValue': [LineFilters] }>()
const { t } = useLocale()

const draft = reactive<LineFilters>(emptyLineFilters())
watch(() => props.isOpen, (open) => {
  if (!open) return
  draft.depts = [...props.modelValue.depts]
  draft.projects = [...props.modelValue.projects]
  draft.accounts = [...props.modelValue.accounts]
  draft.classes = [...props.modelValue.classes]
}, { immediate: true })

function toggle<T>(list: T[], v: T) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}
function reset() { Object.assign(draft, emptyLineFilters()) }
function apply() {
  emit('update:modelValue', { depts: [...draft.depts], projects: [...draft.projects], accounts: [...draft.accounts], classes: [...draft.classes] })
  emit('close')
}
const projectKey = (v: string | null) => v ?? 'none'
</script>

<template>
  <BudgetLineDrawerShell :is-open="isOpen" :title="t('All filters')" @close="emit('close')">
    <div class="blf-field">
      <span class="blf-label">{{ t('Department') }}</span>
      <ul class="blf-list">
        <li v-for="o in DEPT_OPTIONS" :key="o.value" class="blf-item">
          <MpCheckbox :id="`blf-dept-${o.value}`" :is-checked="draft.depts.includes(o.value)" @change="toggle(draft.depts, o.value)">{{ t(o.label) }}</MpCheckbox>
        </li>
      </ul>
    </div>
    <div class="blf-field">
      <span class="blf-label">{{ t('Project') }}</span>
      <ul class="blf-list">
        <li v-for="o in PROJECT_OPTIONS" :key="projectKey(o.value)" class="blf-item">
          <MpCheckbox :id="`blf-project-${projectKey(o.value)}`" :is-checked="draft.projects.includes(o.value)" @change="toggle(draft.projects, o.value)">{{ t(o.label) }}</MpCheckbox>
        </li>
      </ul>
    </div>
    <div class="blf-field">
      <span class="blf-label">{{ t('Account') }}</span>
      <ul class="blf-list">
        <li v-for="o in ACCOUNT_OPTIONS" :key="o.value" class="blf-item">
          <MpCheckbox :id="`blf-acct-${o.value}`" :is-checked="draft.accounts.includes(o.value)" @change="toggle(draft.accounts, o.value)">{{ o.label }}</MpCheckbox>
        </li>
      </ul>
    </div>
    <div class="blf-field">
      <span class="blf-label">{{ t('Class') }}</span>
      <ul class="blf-list">
        <li v-for="c in CLASS_OPTIONS" :key="c" class="blf-item">
          <MpCheckbox :id="`blf-class-${c}`" :is-checked="draft.classes.includes(c)" @change="toggle(draft.classes, c)">{{ t(c) }}</MpCheckbox>
        </li>
      </ul>
    </div>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost blf-reset" type="button" @click="reset">{{ t('Reset filter') }}</button>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
    </template>
  </BudgetLineDrawerShell>
</template>

<style scoped>
.blf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.blf-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.blf-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.blf-item { display: flex; align-items: center; }
.blf-reset { margin-right: auto; }
</style>
