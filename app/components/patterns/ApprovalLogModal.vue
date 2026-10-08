<script setup lang="ts">
/**
 * ApprovalLogModal — Figma "Modal / View / Approval log" (node 754:912). Built on the
 * Pixel **MpTimeline** component: the requester, then each multi-stage approval chain
 * as an **MpTimelineAccordion** (collapsible, expanded by default) whose #sub-content
 * carries the stage rule ("Everyone must approve (n of m)" / "Anyone can approve") + a
 * status badge. Each approver is an MpTimelineItem — `status="approved"` (green check),
 * `status="need-approval"` (amber, pending), `status="rejected"` (red, with the reason),
 * `status="created"` (the request). The connecting rail, marker colours/icons and
 * marker↔text alignment all come from Pixel.
 *
 * Optional extras (Work order approval): a `reason` line explaining why the transaction
 * was held, stages not reached yet ("Waiting for level 1"), earlier rejected cycles
 * collapsed under "Previous submission", and `logs` — several requests in one modal,
 * one block per request headed by `heading`, and `details` — label/value lines for what
 * is being decided (adjustment changes and reason, completion output and cost vs plan).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalOverlay, MpModalCloseButton,
  MpBadge, MpTag, MpText, MpFlex, MpTimeline, MpTimelineItem, MpTimelineAccordion, MpTimelineTitle, MpTimelineCaption, MpButton,
} from '@mekari/pixel3'
import { formatDateTimeLong } from '~/utils/date'
import type { ApprovalLog, ApprovalStage } from '~/data/warehouseTransfers'

const props = withDefaults(defineProps<{
  isOpen: boolean
  subject?: string
  log?: ApprovalLog | null
  /** Several requests at once — one block per log (takes precedence over `log`). */
  logs?: ApprovalLog[] | null
  /** Shown when there's nothing to list. */
  emptyText?: string
  /** Loading the approval data failed — shows an inline retry instead of the timeline. */
  hasError?: boolean
}>(), { subject: 'this record', log: null, logs: null, emptyText: 'No approval request', hasError: false })

const emit = defineEmits<{ close: []; retry: [] }>()
const { t } = useLocale()

const blocks = computed<ApprovalLog[]>(() => props.logs ?? (props.log ? [props.log] : []))
const openPrevious = ref<Set<string>>(new Set())
function togglePrevious(key: string) {
  const s = new Set(openPrevious.value)
  s.has(key) ? s.delete(key) : s.add(key)
  openPrevious.value = s
}

function isStageDone(stage: ApprovalStage): boolean {
  return stage.rule === 'everyone' ? stage.approvals.length >= stage.approvers.length : stage.approvals.length >= 1
}
function stageCaption(stage: ApprovalStage): string {
  return stage.rule === 'everyone'
    ? t('Everyone must approve ({n} of {m})').replace('{n}', String(stage.approvals.length)).replace('{m}', String(stage.approvers.length))
    : t('Anyone can approve')
}
function stageBadge(stage: ApprovalStage): { type: 'completed' | 'warning' | 'critical' | 'announcement'; label: string } {
  if (stage.rejection) return { type: 'critical', label: t('Rejected') }
  if (stage.skipped) return { type: 'announcement', label: t('Skipped') }
  if (isStageDone(stage)) return { type: 'completed', label: t('Approved') }
  return { type: 'warning', label: t('Awaiting approval') }
}
/** Pending rows: one per approver for "everyone", a single "A or B" row for "anyone". */
function pendingRows(stage: ApprovalStage): string[] {
  if (stage.rejection || stage.waitingFor || stage.skipped || isStageDone(stage)) return []
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
        {{ t('Approval log') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <!-- Load error — inline retry, never a toast -->
        <div v-if="hasError" class="alm-state">
          <MpText weight="semiBold">{{ t('There is an error on our side') }}</MpText>
          <MpText color="text.secondary">{{ t('Please reload this page or try again later.') }}</MpText>
          <MpButton class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="emit('retry')">{{ t('Try again') }}</MpButton>
        </div>

        <div v-else-if="!blocks.length" class="alm-state">
          <MpText color="text.secondary">{{ t(emptyText) }}</MpText>
        </div>

        <div v-for="(block, b) in blocks" v-else :key="b" class="alm-block" :class="{ 'alm-block--sep': b > 0 }">
          <MpText v-if="block.heading && blocks.length > 1" weight="semiBold" class="alm-heading">{{ block.heading }}</MpText>
          <MpText v-if="block.reason" color="text.secondary" :class="block.details?.length ? '' : 'alm-reason'">{{ t(block.reason) }}</MpText>
          <!-- What's being decided — e.g. adjustment changes + reason, completion output/cost -->
          <dl v-if="block.details?.length" class="alm-details">
            <div v-for="(d, k) in block.details" :key="k" class="alm-detail">
              <dt>{{ t(d.label) }}</dt>
              <dd>
                {{ d.value }}
                <MpTag v-if="d.tag" :id="`alm-tag-${b}-${k}`" class="alm-detail-tag" data-devchange="wo-approval-rev3">{{ t(d.tag) }}</MpTag>
              </dd>
            </div>
          </dl>

          <!-- Earlier rejected cycles — collapsed by default -->
          <div v-for="(prev, p) in block.previous ?? []" :key="`prev-${p}`" class="alm-previous">
            <MpButton variant="ghost" class="alm-previous-toggle" :aria-expanded="openPrevious.has(`${b}-${p}`)" @click="togglePrevious(`${b}-${p}`)">
              {{ t('Previous submission') }}
            </MpButton>
            <MpTimeline v-if="openPrevious.has(`${b}-${p}`)">
              <MpTimelineItem status="created">
                <MpTimelineTitle><MpText weight="semiBold">{{ t(prev.requestedLabel ?? 'Requested by') }} {{ prev.requestedBy }}</MpText></MpTimelineTitle>
                <MpTimelineCaption>{{ formatDateTimeLong(prev.requestedAt) }}</MpTimelineCaption>
              </MpTimelineItem>
              <template v-for="(stage, i) in prev.stages" :key="i">
                <MpTimelineItem v-for="(step, j) in stage.approvals" :key="`pa-${i}-${j}`" status="approved">
                  <MpTimelineTitle><MpText weight="semiBold">{{ t('Approved by') }} {{ step.user }}</MpText></MpTimelineTitle>
                  <MpTimelineCaption>{{ stage.title }} · {{ formatDateTimeLong(step.date) }}</MpTimelineCaption>
                </MpTimelineItem>
                <MpTimelineItem v-if="stage.rejection" status="rejected">
                  <MpTimelineTitle><MpText weight="semiBold">{{ t('Rejected by') }} {{ stage.rejection.user }}</MpText></MpTimelineTitle>
                  <MpTimelineCaption>{{ t('Reason') }}: {{ stage.rejection.reason }}</MpTimelineCaption>
                  <MpTimelineCaption>{{ stage.title }} · {{ formatDateTimeLong(stage.rejection.date) }}</MpTimelineCaption>
                </MpTimelineItem>
              </template>
            </MpTimeline>
          </div>

          <MpTimeline>
            <!-- Who raised the request -->
            <MpTimelineItem status="created">
              <MpTimelineTitle><MpText weight="semiBold">{{ t(block.requestedLabel ?? 'Requested by') }} {{ block.requestedBy }}</MpText></MpTimelineTitle>
              <MpTimelineCaption>{{ formatDateTimeLong(block.requestedAt) }}</MpTimelineCaption>
            </MpTimelineItem>

            <!-- Each approval stage — collapsible, expanded by default -->
            <MpTimelineAccordion
              v-for="(stage, i) in block.stages" :key="i"
              :label="t(stage.title)" :is-open="true"
            >
              <template #sub-content>
                <MpFlex gap="2" align-items="center">
                  <MpText color="text.secondary">{{ stageCaption(stage) }}</MpText>
                  <MpBadge v-if="!stage.waitingFor" :type="stageBadge(stage).type" for="tableStatus" size="sm">
                    {{ stageBadge(stage).label }}
                  </MpBadge>
                </MpFlex>
              </template>

              <MpTimelineItem v-if="stage.skipped" status="created">
                <MpTimelineTitle><MpText weight="regular" color="text.secondary">{{ stage.skipped }}</MpText></MpTimelineTitle>
              </MpTimelineItem>

              <MpTimelineItem v-for="(step, j) in stage.approvals" :key="`a-${j}`" status="approved">
                <MpTimelineTitle><MpText weight="semiBold">{{ t('Approved by') }} {{ step.user }}</MpText></MpTimelineTitle>
                <MpTimelineCaption>{{ formatDateTimeLong(step.date) }}</MpTimelineCaption>
              </MpTimelineItem>

              <MpTimelineItem v-if="stage.rejection" status="rejected">
                <MpTimelineTitle><MpText weight="semiBold">{{ t('Rejected by') }} {{ stage.rejection.user }}</MpText></MpTimelineTitle>
                <MpTimelineCaption>{{ t('Reason') }}: {{ stage.rejection.reason }}</MpTimelineCaption>
                <MpTimelineCaption>{{ formatDateTimeLong(stage.rejection.date) }}</MpTimelineCaption>
              </MpTimelineItem>

              <MpTimelineItem v-for="(label, k) in pendingRows(stage)" :key="`p-${k}`" status="need-approval">
                <MpTimelineTitle><MpText weight="regular">{{ t('Awaiting approval from') }} {{ label }}</MpText></MpTimelineTitle>
              </MpTimelineItem>

              <MpTimelineItem v-if="stage.waitingFor" status="need-approval">
                <MpTimelineTitle><MpText weight="regular" color="text.secondary">{{ t(stage.waitingFor) }}</MpText></MpTimelineTitle>
              </MpTimelineItem>
            </MpTimelineAccordion>
          </MpTimeline>
        </div>
      </MpModalBody>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.alm-state { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2); }
.alm-block { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.alm-block--sep { margin-top: var(--mp-spacing-5); padding-top: var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default); }
.alm-details { margin: 0; padding-bottom: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.alm-detail { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); }
.alm-detail dt { color: var(--mp-text-secondary); }
.alm-detail dd { margin: 0; color: var(--mp-text-default); display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-1); }
.alm-reason { padding-bottom: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.alm-previous-toggle { padding: 0; height: auto; color: var(--mp-text-link); }
</style>
