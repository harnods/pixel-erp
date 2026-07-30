<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TasksTablePage from '~/components/patterns/TasksTablePage.vue'
import NotificationsView from '~/components/patterns/NotificationsView.vue'
import { awaitingApprovalTasks, INBOX_TAB_GROUPS } from '~/data/tasks'

const route = useRoute()

const tab      = computed(() => (route.query.tab      as string | undefined) ?? 'notifications')
const innerTab = computed(() => (route.query.innerTab as string | undefined) ?? 'all')

const GROUP_MAP: Record<string, string[]> = {
  sales:     INBOX_TAB_GROUPS.Sales     as string[],
  purchases: INBOX_TAB_GROUPS.Purchases as string[],
  expenses:  INBOX_TAB_GROUPS.Expenses  as string[],
  products:  INBOX_TAB_GROUPS.Products  as string[],
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
  if (innerTab.value === 'warehouse' || innerTab.value === 'products') return ['dueDate', 'balanceDue', 'total']
  return ['warehouse']
})
// Products repeats the Warehouse tab's index pattern but with Details (product
// name + qty converted) leading and Warehouse trailing — the reverse of every
// other tab's column order.
const detailsBeforeWarehouse = computed(() => innerTab.value === 'products')

// "All filters" drawer field visibility — Reason doesn't apply to Purchase,
// Expense, Products, or Warehouse; Due date doesn't apply to Products or
// Warehouse (no due dates there).
const hideReasonFilter = computed(() => ['purchases', 'expenses', 'products', 'warehouse'].includes(innerTab.value))
const hideDueDateFilter = computed(() => innerTab.value === 'products' || innerTab.value === 'warehouse')
</script>

<template>
  <!-- Notifications — two-pane list + detail -->
  <NotificationsView v-if="tab === 'notifications'" />

  <!-- Awaiting approval — table filtered by the URL's innerTab -->
  <TasksTablePage
    v-else-if="tab === 'awaiting-approval'"
    :tasks="filteredTasks"
    id-prefix="inbox-aa"
    :allowed-doc-types="allowedDocTypes"
    :hide-transaction-type="hideTransactionType"
    :multi-select-transaction-type="innerTab === 'all'"
    :hidden-columns="hiddenColumns"
    :details-before-warehouse="detailsBeforeWarehouse"
    :hide-reason-filter="hideReasonFilter"
    :hide-due-date-filter="hideDueDateFilter"
  />
</template>
