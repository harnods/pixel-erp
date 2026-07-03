<script setup lang="ts">
/**
 * ApprovalLogModal — Figma "Modal / View / Approval log" (node 754:912). A timeline of
 * who requested the record and the multi-stage approval chain: each stage is either
 * "Everyone must approve" (every listed approver must sign off) or "Anyone can approve"
 * (the first approval wins). Each stage is an independently collapsible accordion,
 * expanded by default. A single connecting line runs down the left rail through every
 * visible row (dots/checks/clock/toggle icons all share it) — flattening the stages
 * into one row list (rather than nesting per stage) is what makes that line trivial to
 * draw and keeps it self-healing when a stage is collapsed.
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalOverlay, MpModalCloseButton, MpBadge, MpIcon } from '@mekari/pixel3'
import { formatDateTime } from '~/utils/date'
import type { ApprovalLog, ApprovalStage } from '~/data/warehouseTransfers'

const props = withDefaults(defineProps<{
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
function pendingApprovers(stage: ApprovalStage): string[] {
  const approved = new Set(stage.approvals.map((a) => a.user))
  return stage.approvers.filter((a) => !approved.has(a))
}

// Every stage starts expanded (matches the Figma default); collapsed set resets per open.
const collapsedStages = ref<Set<number>>(new Set())
function toggleStage(i: number) {
  const s = new Set(collapsedStages.value)
  s.has(i) ? s.delete(i) : s.add(i)
  collapsedStages.value = s
}
watch(() => props.isOpen, (open) => { if (open) collapsedStages.value = new Set() })

type LogRow =
  | { kind: 'requested'; user: string; date: string }
  | { kind: 'stageHeader'; index: number; stage: ApprovalStage; done: boolean; expanded: boolean }
  | { kind: 'approved'; user: string; date: string; child: true }
  | { kind: 'pending'; label: string; child: true }

const displayRows = computed<LogRow[]>(() => {
  const log = props.log
  if (!log) return []
  const rows: LogRow[] = [{ kind: 'requested', user: log.requestedBy, date: log.requestedAt }]
  log.stages.forEach((stage, i) => {
    const done = isStageDone(stage)
    const expanded = !collapsedStages.value.has(i)
    rows.push({ kind: 'stageHeader', index: i, stage, done, expanded })
    if (!expanded) return
    for (const step of stage.approvals) rows.push({ kind: 'approved', user: step.user, date: step.date, child: true })
    if (done) return
    const pending = pendingApprovers(stage)
    if (!pending.length) return
    if (stage.rule === 'everyone') {
      for (const name of pending) rows.push({ kind: 'pending', label: `Awaiting approval from ${name}`, child: true })
    } else {
      rows.push({ kind: 'pending', label: `Awaiting approval from ${pending.join(' or ')}`, child: true })
    }
  })
  return rows
})
</script>

<template>
  <MpModal
    id="approval-log-modal" :is-open="isOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        Approval log
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="al-list">
          <div v-for="(row, i) in displayRows" :key="i" class="al-row" :class="{ 'al-row--child': 'child' in row }">
            <div class="al-rail">
              <span v-if="row.kind === 'requested'" class="al-dot al-dot--submitted" />
              <button
                v-else-if="row.kind === 'stageHeader'"
                class="al-toggle" type="button" @click="toggleStage(row.index)"
                :aria-label="row.expanded ? 'Collapse stage' : 'Expand stage'"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" :style="{ transform: row.expanded ? 'rotate(180deg)' : 'none' }" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span v-else-if="row.kind === 'approved'" class="al-dot al-dot--approved">
                <MpIcon name="done" variant="fill" size="sm" color="icon.inverse" />
              </span>
              <span v-else class="al-dot al-dot--pending">
                <MpIcon name="time" variant="fill" size="sm" color="icon.inverse" />
              </span>
            </div>

            <div class="al-content">
              <template v-if="row.kind === 'requested'">
                <p class="al-title">Requested by {{ row.user }}</p>
                <p class="al-sub">{{ formatDateTime(row.date) }}</p>
              </template>
              <template v-else-if="row.kind === 'stageHeader'">
                <p class="al-title">{{ row.stage.title }}</p>
                <div class="al-caption-row">
                  <span class="al-caption">{{ stageCaption(row.stage) }}</span>
                  <MpBadge :type="row.done ? 'completed' : 'warning'" for="tableStatus" size="sm">
                    {{ row.done ? 'Approved' : 'Awaiting approval' }}
                  </MpBadge>
                </div>
              </template>
              <template v-else-if="row.kind === 'approved'">
                <p class="al-title">Approved by {{ row.user }}</p>
                <p class="al-sub">{{ formatDateTime(row.date) }}</p>
              </template>
              <template v-else>
                <p class="al-title al-title--regular">{{ row.label }}</p>
              </template>
            </div>
          </div>
        </div>
      </MpModalBody>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.al-list { display: flex; flex-direction: column; width: 100%; }
.al-row { display: flex; gap: var(--mp-spacing-3); align-items: stretch; width: 100%; box-sizing: border-box; }
.al-row:last-child .al-rail::before { display: none; }
/* Approver rows (approved/pending) are the accordion's content — indent them under
   their stage header instead of sharing its rail column. */
.al-row--child { padding-left: 32px; }

/* Left rail — the connecting line runs continuously behind every marker; the marker
   itself sits on top (z-index) so the line reads as passing through it. */
.al-rail { position: relative; width: 20px; flex-shrink: 0; display: flex; justify-content: center; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-4); }
.al-rail::before {
  content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 1px;
  background: var(--mp-border-default); transform: translateX(-50%); z-index: 0;
}

.al-dot { position: relative; z-index: 1; flex-shrink: 0; border-radius: var(--mp-radii-full, 999px); }
.al-dot--submitted { width: 8px; height: 8px; margin-top: 6px; background: var(--mp-background-information-bold, #4b61dc); }
.al-dot--approved, .al-dot--pending {
  width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
}
.al-dot--approved { background: var(--mp-background-brand-bold, #029861); }
.al-dot--pending { background: var(--mp-background-warning-bold, #e46910); }

.al-toggle {
  position: relative; z-index: 1; flex-shrink: 0;
  width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral, #fff); color: var(--mp-icon-default, var(--mp-text-secondary));
  cursor: pointer; padding: 0;
}
.al-toggle:hover { background: var(--mp-background-neutral-hovered); }
.al-toggle svg { transition: transform 0.15s; }

.al-content { flex: 1; min-width: 0; padding-bottom: var(--mp-spacing-4); }
.al-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-md, 20px); }
.al-title--regular { font-weight: var(--mp-font-weights-regular); }
.al-sub { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.al-caption-row { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-0\.5); flex-wrap: wrap; }
.al-caption { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); white-space: nowrap; }
</style>
