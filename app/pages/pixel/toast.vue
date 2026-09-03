<script setup lang="ts">
import { MpButton } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
import { infoToast } from '~/utils/toasts'
useHead({ title: 'Toast · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Toast" tag="infoToast()"
    override="Toast is for success/info only — errors go inline."
    :rules="['rule/toast-success-only']"
    snippet="import { infoToast } from '~/utils/toasts'
infoToast('Saved')">
    <MpButton variant="secondary" is-rounded @click="infoToast('This is a toast')">Show toast</MpButton>
  </DemoCard>
</template>
