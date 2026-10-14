<script setup lang="ts">
/**
 * WoApprovalNotice — the ONE approval notice on the Work order detail page (the latest:
 * an inline refusal right after a click, else the newest of the pending request, an
 * undismissed rejection and the Adjust / Cancel-close reason). It renders at the top of
 * the scrolling content of whichever tab is open, so it scrolls away with the content.
 * Notices carry no text buttons; the log opens from the header Approval log icon.
 */
import { MpBanner, MpBannerIcon, MpBannerDescription, MpBannerCloseButton } from '@mekari/pixel3'
import WoRejectBanner from '~/components/patterns/WoRejectBanner.vue'
import WoActionReasonBanner from '~/components/patterns/WoActionReasonBanner.vue'
import { waitingForText, type WoApprovalRequest } from '~/data/woApproval'
import type { WorkOrderActionReason } from '~/data/workOrders'

export type WoNotice =
  | { kind: 'guard' }
  | { kind: 'pending'; request: WoApprovalRequest }
  | { kind: 'rejected'; request: WoApprovalRequest }
  | { kind: 'reason' }

defineProps<{
  notice: WoNotice
  /** inline refusal text (kind 'guard') */
  guardText?: string
  actionReason?: WorkOrderActionReason
  actionReasonRef?: string | null
}>()
const emit = defineEmits<{ clearGuard: []; dismiss: [requestId: string] }>()
const { t } = useLocale()

/** Short request name — "Start work order", "Adjustment ADJ-0007", "Cancel/close CXL-0002". */
const SHORT_TYPE: Record<WoApprovalRequest['type'], string> = {
  start: 'Start work order', adjustment: 'Adjustment', completion: 'Completion', cancel: 'Cancel/close',
}
function shortTitle(req: WoApprovalRequest): string {
  return req.ref ? `${t(SHORT_TYPE[req.type])} ${req.ref}` : t(SHORT_TYPE[req.type])
}
</script>

<template>
  <div class="wan" data-devchange="wo-approval-detail">
    <MpBanner v-if="notice.kind === 'guard'" variant="danger" is-inline data-devchange="wo-approval-freeze">
      <MpBannerIcon />
      <MpBannerDescription>{{ t(guardText ?? '') }}</MpBannerDescription>
      <MpBannerCloseButton @click="emit('clearGuard')" />
    </MpBanner>
    <MpBanner v-else-if="notice.kind === 'pending'" variant="warning">
      <MpBannerIcon />
      <MpBannerDescription>
        <span data-devchange="wo-approval-status">
          {{ t('{action} is waiting for approval from {names} (level {n}). Only Print is available until then.')
            .replace('{action}', shortTitle(notice.request)).replace('{names}', waitingForText(notice.request)).replace('{n}', String(notice.request.currentLevel)) }}
        </span>
        <span v-if="notice.request.payload.note && notice.request.type !== 'start'" class="wan-line" data-devchange="wo-approval-reason-banner">
          {{ t('Reason') }}: {{ notice.request.payload.note }}
        </span>
      </MpBannerDescription>
    </MpBanner>
    <WoRejectBanner v-else-if="notice.kind === 'rejected'" :request="notice.request" @dismiss="emit('dismiss', notice.request.id)" />
    <WoActionReasonBanner v-else-if="notice.kind === 'reason' && actionReason" :reason="actionReason" :ref-no="actionReasonRef" />
  </div>
</template>

<style scoped>
/* Top of the scrolling stage — scrolls away with the content. */
.wan { margin-bottom: var(--mp-spacing-6); }
.wan-line { display: block; margin-top: var(--mp-spacing-1); color: var(--mp-text-secondary); }
</style>
