<script setup lang="ts">
/**
 * WoRejectBanner — a rejected work order approval request (grooming 2026-10-09).
 * Sticky: it stays until the user dismisses it with × (persisted per request) or acts on
 * it with Submit again / Create again. Shows who rejected it and the reject reason.
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink, MpBannerCloseButton, MpButton,
} from '@mekari/pixel3'
import { rejectionOf, typeLabel, type WoApprovalRequest } from '~/data/woApproval'
import { formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ request: WoApprovalRequest }>()
const emit = defineEmits<{ dismiss: []; resubmit: []; viewLog: [] }>()
const { t } = useLocale()

const rejection = computed(() => rejectionOf(props.request))
const title = computed(() => `${t(typeLabel(props.request.type))}${props.request.ref ? ` ${props.request.ref}` : ''}`)
</script>

<template>
  <MpBanner v-if="rejection" variant="danger" data-devchange="wo-approval-reject-banner">
    <MpBannerIcon />
    <MpBannerTitle>{{ t('{title} was rejected').replace('{title}', title) }}</MpBannerTitle>
    <MpBannerDescription>
      {{ t('{name} rejected this on {timestamp}. Reason: {reason}')
        .replace('{name}', rejection.user).replace('{timestamp}', formatDateTimeLong(rejection.at)).replace('{reason}', rejection.reason ?? '') }}
    </MpBannerDescription>
    <MpBannerLink>
      <MpButton variant="textLink" size="sm" @click="emit('resubmit')">{{ request.type === 'start' ? t('Submit again') : t('Create again') }}</MpButton>
      <MpButton variant="textLink" size="sm" @click="emit('viewLog')">{{ t('View approval log') }}</MpButton>
    </MpBannerLink>
    <MpBannerCloseButton :aria-label="t('Dismiss')" @click="emit('dismiss')" />
  </MpBanner>
</template>
