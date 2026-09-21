<script setup lang="ts">
import type { Project } from '~/data/projects'
defineProps<{ project: Project }>()
</script>

<template>
  <div class="pm-empty">ProductionTab</div>
</template>
