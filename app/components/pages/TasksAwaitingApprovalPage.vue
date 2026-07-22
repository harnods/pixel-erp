<script setup lang="ts">
import TasksTablePage from '~/components/patterns/TasksTablePage.vue'
import { awaitingApprovalTasks } from '~/data/tasks'
</script>

<template>
  <TasksTablePage :tasks="awaitingApprovalTasks" id-prefix="aa" />
</template>
