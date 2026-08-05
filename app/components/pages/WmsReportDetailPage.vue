<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const TITLES: Record<string, string> = {
  'inbound-timeliness': 'Inbound timeliness',
  'inbound-accuracy': 'Inbound accuracy',
  'outbound-timeliness': 'Outbound timeliness',
  'outbound-accuracy': 'Outbound accuracy',
}
const title = computed(() => TITLES[props.orderId] ?? 'Report')
</script>

<template>
  <div class="page-col">
    <div class="page-title-bar">
      <button class="back-link" @click="router.push('/wms-report')">← {{ t('Reports') }}</button>
      <h1 class="page-title-text">{{ t(title) }}</h1>
    </div>
    <div class="stage">
      <p>{{ t('Report content goes here.') }}</p>
    </div>
  </div>
</template>

<style scoped>
.back-link { background: none; border: none; color: var(--mp-text-link); cursor: pointer; font-size: 13px; padding: 0; margin-right: 12px; }
</style>
