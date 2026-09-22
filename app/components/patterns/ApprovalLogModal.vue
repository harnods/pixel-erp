<script setup lang="ts">
/**
 * ApprovalLogModal — Figma "Modal / View / Approval log" (node 754:912). Built on the
 * Pixel **MpTimeline** component: the requester, then each multi-stage approval chain
 * as an **MpTimelineAccordion** (collapsible, expanded by default) whose #sub-content
 * carries the stage rule ("Everyone must approve (n of m)" / "Anyone can approve") + a
 * status badge. Each approver is an MpTimelineItem — `status="approved"` (green check),
 * `status="need-approval"` (amber, pending), `status="created"` (the request). The
 * connecting rail, marker colours/icons and marker↔text alignment all come from Pixel.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalOverlay, MpModalCloseButton,
  MpBadge, MpText, MpFlex, MpTimeline, MpTimelineItem, MpTimelineAccordion, MpTimelineTitle, MpTimelineCaption, MpTimelineContent,
} from '@mekari/pixel3'
import { formatDateTime } from '~/utils/date'
import type { ApprovalLog, ApprovalStage } from '~/data/warehouseTransfers'

withDefaults(defineProps<{
  isOpen: boolean
  subject?: string
  log: ApprovalLog | null
}>(), { subject: 'this record', log: null })

const emit = defineEmits<{ close: [] }>()

function isStageDone(stage: ApprovalStage): boolean {
  return stage.rule === 'everyone' ? stage.approvals.length >= stage.approvers.length : stage.approvals.length >= 1
}
function stageCaption(stage: ApprovalStage): string {
  return stage.rule === 'everyone'
    ? `Everyone must approve (${stage.approvals.length} of ${stage.approvers.length})`
    : 'Anyone can approve'
}
/** Pending rows: one per approver for "everyone", a single "A or B" row for "anyone". */
function pendingRows(stage: ApprovalStage): string[] {
  if (isStageDone(stage)) return []
  const approved = new Set(stage.approvals.map((a) => a.user))
  const pending = stage.approvers.filter((a) => !approved.has(a))
  if (!pending.length) return []
  return stage.rule === 'everyone' ? pending : [pending.join(' or ')]
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="approval-log-modal" :is-open="isOpen" size="md" :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        Approval log
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <MpTimeline v-if="log">
          <!-- Who raised the request -->
          <MpTimelineItem status="created">
            <MpTimelineTitle><MpText weight="semiBold">Requested by {{ log.requestedBy }}</MpText></MpTimelineTitle>
            <MpTimelineCaption>{{ formatDateTime(log.requestedAt) }}</MpTimelineCaption>
          </MpTimelineItem>

          <!-- Each approval stage — collapsible, expanded by default -->
          <MpTimelineAccordion
            v-for="(stage, i) in log.stages" :key="i"
            :label="stage.title" :is-open="true"
          >
            <template #sub-content>
              <MpFlex gap="2" align-items="center">
                <MpText color="text.secondary">{{ stageCaption(stage) }}</MpText>
                <MpBadge :type="isStageDone(stage) ? 'completed' : 'warning'" for="tableStatus" size="sm">
                  {{ isStageDone(stage) ? 'Approved' : 'Awaiting approval' }}
                </MpBadge>
              </MpFlex>
            </template>

            <MpTimelineItem v-for="(step, j) in stage.approvals" :key="`a-${j}`" status="approved">
              <MpTimelineTitle><MpText weight="semiBold">Approved by {{ step.user }}</MpText></MpTimelineTitle>
              <MpTimelineCaption>{{ formatDateTime(step.date) }}</MpTimelineCaption>
            </MpTimelineItem>

            <MpTimelineItem v-for="(label, k) in pendingRows(stage)" :key="`p-${k}`" status="need-approval">
              <MpTimelineTitle><MpText weight="regular">Awaiting approval from {{ label }}</MpText></MpTimelineTitle>
            </MpTimelineItem>
          </MpTimelineAccordion>
        </MpTimeline>
      </MpModalBody>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>
