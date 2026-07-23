<script setup lang="ts">
import SubmittedTablePage from '~/components/patterns/SubmittedTablePage.vue'
import { submittedTasks } from '~/data/tasks'
</script>

<template>
  <SubmittedTablePage :tasks="submittedTasks" id-prefix="ts" />
</template>
