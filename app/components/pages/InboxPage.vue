<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TasksTablePage from '~/components/patterns/TasksTablePage.vue'
import { awaitingApprovalTasks, INBOX_TAB_GROUPS } from '~/data/tasks'

const route = useRoute()

const tab      = computed(() => (route.query.tab      as string | undefined) ?? 'notifications')
const innerTab = computed(() => (route.query.innerTab as string | undefined) ?? 'all')

const GROUP_MAP: Record<string, string[]> = {
  sales:     INBOX_TAB_GROUPS.Sales     as string[],
  purchases: INBOX_TAB_GROUPS.Purchases as string[],
  expenses:  INBOX_TAB_GROUPS.Expenses  as string[],
  warehouse: INBOX_TAB_GROUPS.Warehouse as string[],
}

const sourceData = computed(() => awaitingApprovalTasks)

const filteredTasks = computed(() => {
  const types = GROUP_MAP[innerTab.value]
  if (!types) return sourceData.value
  return sourceData.value.filter(t => types.includes(t.docType))
})

const allowedDocTypes = computed<string[] | null>(() => GROUP_MAP[innerTab.value] ?? null)
const hideTransactionType = computed(() => innerTab.value === 'expenses')
const hiddenColumns = computed<string[]>(() => {
  if (innerTab.value === 'warehouse') return ['dueDate', 'balanceDue', 'total', 'reason']
  return ['warehouse']
})
</script>

<template>
  <!-- Notifications — placeholder -->
  <div v-if="tab === 'notifications'" class="inbox-empty">
    <p class="inbox-empty__title">Notifications</p>
    <p class="inbox-empty__desc">Notifications will show up here.</p>
  </div>

  <!-- Awaiting approval — table filtered by the URL's innerTab -->
  <TasksTablePage
    v-else-if="tab === 'awaiting-approval'"
    :tasks="filteredTasks"
    id-prefix="inbox-aa"
    :allowed-doc-types="allowedDocTypes"
    :hide-transaction-type="hideTransactionType"
    :multi-select-transaction-type="innerTab === 'all'"
    :hidden-columns="hiddenColumns"
  />
</template>

<style scoped>
.inbox-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  min-height: 240px;
}

.inbox-empty__title {
  font-size: 18px;
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  margin: 0 0 var(--mp-spacing-2);
}

.inbox-empty__desc {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
  margin: 0;
}
</style>
