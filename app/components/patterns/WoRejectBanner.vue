<script setup lang="ts">
/**
 * WoRejectBanner — a rejected work order approval request (grooming 2026-10-09).
 * Sticky: it stays until the user dismisses it with × (persisted per request). Shows who rejected it and the reject reason; the user starts the action again from the
 * header / Actions menu.
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerCloseButton,
} from '@mekari/pixel3'
import { rejectionOf, type WoApprovalRequest } from '~/data/woApproval'

const props = defineProps<{ request: WoApprovalRequest }>()
const emit = defineEmits<{ dismiss: [] }>()
const { t } = useLocale()

const rejection = computed(() => rejectionOf(props.request))
const SHORT_TYPE = { start: 'Start work order', adjustment: 'Adjustment', completion: 'Completion', cancel: 'Cancel/close' } as const
const title = computed(() => `${t(SHORT_TYPE[props.request.type])}${props.request.ref ? ` ${props.request.ref}` : ''}`)
</script>

<template>
  <MpBanner v-if="rejection" variant="danger" data-devchange="wo-approval-reject-banner">
    <MpBannerIcon />
    <MpBannerTitle>{{ t('{title} was rejected').replace('{title}', title) }}</MpBannerTitle>
    <MpBannerDescription>
      {{ t('{name}: {reason}').replace('{name}', rejection.user).replace('{reason}', rejection.reason ?? '') }}
    </MpBannerDescription>
    <MpBannerCloseButton :aria-label="t('Dismiss')" @click="emit('dismiss')" />
  </MpBanner>
</template>
