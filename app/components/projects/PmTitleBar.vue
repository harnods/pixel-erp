<script setup lang="ts">
/** Title bar shared by every Projects page — breadcrumb, title, badges slot, actions slot, role switcher. */
import PmRoleSwitcher from './PmRoleSwitcher.vue'

defineProps<{ title: string; breadcrumb?: { label: string; to: string }; subtitle?: string; hideRole?: boolean }>()
const router = useRouter()
</script>

<template>
  <header class="pm-bar">
    <div class="pm-bar-left">
      <button v-if="breadcrumb" class="pm-breadcrumb" type="button" @click="router.push(breadcrumb.to)">{{ breadcrumb.label }}</button>
      <div class="pm-titlerow">
        <h1 class="pm-title">{{ title }}</h1>
        <slot name="badges" />
      </div>
      <div v-if="subtitle" class="pm-title-sub">{{ subtitle }}</div>
    </div>
    <div class="pm-bar-actions">
      <PmRoleSwitcher v-if="!hideRole" />
      <slot name="actions" />
    </div>
  </header>
</template>
