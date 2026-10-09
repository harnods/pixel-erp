<script setup lang="ts">
/**
 * WoActionReasonBanner — after Adjust or Cancel/close, the detail page shows the reason
 * the user gave (grooming 2026-10-09), and whether it's still waiting for approval.
 */
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import type { WorkOrderActionReason } from '~/data/workOrders'
import { formatDateTimeLong } from '~/utils/date'

const props = defineProps<{
  reason: WorkOrderActionReason
  /** the request behind it is still waiting for approval */
  pending?: boolean
  /** request ref, e.g. "ADJ-0007" */
  refNo?: string | null
}>()
const { t } = useLocale()

const title = computed(() => {
  const base = props.reason.type === 'adjustment' ? t('Adjustment reason') : t('Cancel/close reason')
  return props.refNo ? `${base} · ${props.refNo}` : base
})
const caption = computed(() => {
  const by = `${props.reason.by} · ${formatDateTimeLong(props.reason.at)}`
  return props.pending ? `${by} · ${t('Waiting for approval')}` : by
})
</script>

<template>
  <MpBanner variant="info" data-devchange="wo-approval-reason-banner">
    <MpBannerIcon />
    <MpBannerTitle>{{ title }}</MpBannerTitle>
    <MpBannerDescription>
      {{ reason.reason }}
      <span class="warb-caption">{{ caption }}</span>
    </MpBannerDescription>
  </MpBanner>
</template>

<style scoped>
.warb-caption { display: block; margin-top: var(--mp-spacing-1); color: var(--mp-text-secondary); }
</style>
