<script setup lang="ts">
/**
 * Title-bar actions for Budget lines. They live in the router shell, so they
 * reach the page's drawers through the linesUi action bus. Shown by role
 * (FG-1.6) and by the selected year's status.
 */
import { MpButton } from '@mekari/pixel3'
import { budget, isLocked } from '~/data/budgetStore'
import { linesUi, lineAccess, requestLinesAction } from '~/data/budgetUiLines'

const { t } = useLocale()
const router = useRouter()

const access = computed(() => lineAccess(budget.viewAs))
const locked = computed(() => isLocked(linesUi.year))

function onNew() {
  if (locked.value) router.push('/budget-changes/new?kind=Mid-year%20insert')
  else requestLinesAction('new')
}
function onRevise() { router.push('/budget-changes/new?kind=Revision') }
</script>

<template>
  <template v-if="access.detail">
    <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="requestLinesAction('compare')">{{ t('Compare versions') }}</button>
  </template>
  <template v-if="access.manage">
    <button v-if="!locked" class="btn-enterprise btn-enterprise--secondary" type="button" @click="requestLinesAction('import')">{{ t('Import') }}</button>
    <button v-if="!locked" class="btn-enterprise btn-enterprise--secondary" type="button" @click="requestLinesAction('lock')">{{ t('Lock budget') }}</button>
    <button v-if="locked" class="btn-enterprise btn-enterprise--secondary" type="button" @click="onRevise">{{ t('Revise') }}</button>
    <MpButton is-rounded left-icon="add" @click="onNew">{{ t('New budget line') }}</MpButton>
  </template>
</template>
