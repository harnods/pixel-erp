<script setup lang="ts">
/**
 * ApprovalLogPopover — multi-stage approval timeline, opened from the
 * "Approval log" (task-todo icon) row action. Self-contained: renders its own
 * trigger button + popover (no modal/overlay) — positioned bottom-end (right
 * aligned, 4px gap below the button, matching every other row-action popover
 * in this codebase).
 *
 * Each stage shows an aggregate status pill and is collapsed by default;
 * clicking the +/- marker reveals the individual approvers (avatar, role,
 * status, timestamp, and a rejection comment when applicable).
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, MpAvatar, css } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { type ApprovalLevel, type ApprovalStep } from '~/data/tasks'
import { formatDateTime } from '~/utils/date'

const props = defineProps<{
  id: string
  subject: string
  requested: { name: string; timestamp: string }
  levels: ApprovalLevel[]
}>()

const open = ref(false)
const expanded = ref<Set<number>>(new Set())

function toggleStage(i: number) {
  const s = new Set(expanded.value)
  s.has(i) ? s.delete(i) : s.add(i)
  expanded.value = s
}

function ruleText(level: ApprovalLevel) {
  return level.rule === 'any'
    ? 'Anyone can approve'
    : `Everyone must approve (${level.approvedCount} of ${level.steps.length})`
}

function stepAction(status: ApprovalStep['status']) {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Awaiting approval'
}

function stepPrep(status: ApprovalStep['status']) {
  return status === 'awaiting approval' ? 'from' : 'by'
}
</script>

<template>
  <div>
    <MpPopover
      :id="id"
      is-manual
      :is-open="open"
      use-portal
      :is-keep-alive="false"
      placement="bottom-end"
      @open="open = true"
      @close="open = false"
    >
      <MpPopoverTrigger>
        <button
          v-tooltip="{ label: 'Approval log', placement: 'top' }"
          class="row-icon-btn"
          aria-label="Approval log"
          type="button"
          @click.stop="open = !open"
        >
          <MpIcon name="task-todo" size="md" />
        </button>
      </MpPopoverTrigger>
      <MpPopoverContent
        :class="css({ width: '360px', padding: '0', overflow: 'hidden' })"
        @blur="open = false"
        @escape="open = false"
      >
        <div class="alp-header">
          <span class="alp-title">Approval log</span>
        </div>

        <div class="alp-body">
          <div class="alp-timeline">
            <!-- Requested-by entry -->
            <div class="alp-row">
              <span class="alp-dot" />
              <div class="alp-row-content">
                <span class="alp-row-title">Requested by {{ requested.name }}</span>
                <span class="alp-row-time">{{ formatDateTime(requested.timestamp) }}</span>
              </div>
            </div>

            <!-- Approval stages -->
            <template v-for="(level, li) in levels" :key="li">
              <div class="alp-row">
                <button
                  class="alp-marker"
                  :aria-label="expanded.has(li) ? 'Collapse' : 'Expand'"
                  @click.stop="toggleStage(li)"
                >
                  <svg v-if="!expanded.has(li)" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </button>
                <div class="alp-row-content">
                  <span class="alp-row-title">{{ level.label }}</span>
                  <div class="alp-row-sub-line">
                    <span class="alp-row-sub">{{ ruleText(level) }}</span>
                    <ErpStatusBadge :status="level.status" size="sm" />
                  </div>
                </div>
              </div>

              <!-- Expanded: each approver step as its own timeline row -->
              <template v-if="expanded.has(li)">
                <div v-for="(step, si) in level.steps" :key="si" class="alp-row alp-row--step">
                  <span class="alp-step-icon" :class="`alp-step-icon--${step.status.replace(' ', '-')}`">
                    <!-- approved: checkmark -->
                    <svg v-if="step.status === 'approved'" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13L9 17L19 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <!-- rejected: X -->
                    <svg v-else-if="step.status === 'rejected'" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 6L18 18M18 6L6 18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                    <!-- awaiting: clock hands only (circle is the icon background) -->
                    <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 6V12L15.5 14.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <div class="alp-row-content">
                    <span class="alp-row-title">
                      <strong>{{ stepAction(step.status) }}</strong>
                      {{ stepPrep(step.status) }}
                      <strong>{{ step.name }}</strong>
                    </span>
                    <span v-if="step.timestamp" class="alp-row-time">{{ formatDateTime(step.timestamp) }}</span>
                    <p v-if="step.comment" class="alp-approver-comment">{{ step.comment }}</p>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
/* ── Header — bg fill + Figma's asymmetric padding (pl:16/pr:12/py:12),
     matching ApprovalCommentPopover's .acp-header exactly ── */
.alp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-bottom: 1px solid var(--mp-border-default);
}
.alp-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Body ── */
.alp-body {
  padding: var(--mp-spacing-4);
  max-height: 420px;
  overflow-y: auto;
}

/* ── Timeline — spacing pulled from Figma (node 754:912): every row's
     content column uses the SAME padding-top:8/padding-bottom:16, regardless
     of whether it's a top-level stage row or a nested step row. All icon
     slots (dot/marker/step-icon) are a uniform 20x20px box so the connector
     line's x-position and every row's text column line up identically.

     The trunk line is drawn PER ROW (full row height, top:0 to bottom:0),
     not as one guessed-height overlay spanning the whole timeline — row
     height varies with content (wrapped titles, badges), so a single static
     inset either falls short or overshoots. Each row's own segment is
     naturally exactly as tall as that row, so consecutive rows' segments
     meet with no gap between them (the icon just renders on top of the line
     via z-index, hiding the portion behind it) — and :not(:last-child)
     means the very last row never grows a trailing tail below its icon. ── */
.alp-timeline { position: relative; }

.alp-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-3);
}
.alp-row:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 9px;
  top: 0;
  bottom: 0;
  width: var(--mp-sizes-0\.25, 1px);
  background: var(--mp-border-default);
}

.alp-dot {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
  margin-top: var(--mp-spacing-2, 8px);
}
.alp-dot::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  width: var(--mp-sizes-3, 12px);
  height: var(--mp-sizes-3, 12px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-icon-brand, #029861);
}

.alp-marker {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
  margin-top: var(--mp-spacing-2, 8px);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  cursor: pointer;
}
.alp-marker:hover { background: var(--mp-background-neutral-hovered); }

.alp-row-content {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  flex: 1;
  padding-top: var(--mp-spacing-2, 8px);
  padding-bottom: var(--mp-spacing-4, 16px);
}
.alp-row-top {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.alp-row-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.alp-row-sub, .alp-row-time {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.alp-row-sub-line {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  flex-wrap: wrap;
}

/* ── Step rows — indented with horizontal connector (tick) from the main
     line to the step icon. Figma: tick is 16px, with a 6px gap before the
     20px icon — icon indent = trunk position(9) + tick(16) + gap(6) = 31px. ── */
.alp-row--step {
  padding-left: 31px;
}
.alp-row--step::before {
  content: '';
  position: absolute;
  left: 9px;
  /* Centers on the 20px step icon: icon's own margin-top (8px) + half its
     height (10px) — matches .alp-step-icon's margin-top below. */
  top: calc(var(--mp-spacing-2, 8px) + 10px);
  width: var(--mp-sizes-4, 16px);
  height: var(--mp-sizes-0\.25, 1px);
  background: var(--mp-border-default);
  z-index: 2;
}

/* Step title: mixed bold/regular; override the default semi-bold */
.alp-row--step .alp-row-title {
  font-weight: var(--mp-font-weights-regular);
}
.alp-row--step .alp-row-title strong {
  font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Step icon (approver status circle) ── */
.alp-step-icon {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
  margin-top: var(--mp-spacing-2, 8px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-text-secondary);
}
.alp-step-icon--approved { background: var(--mp-icon-success, #1fb088); }
.alp-step-icon--awaiting-approval { background: var(--mp-icon-warning, #e46910); }
.alp-step-icon--rejected { background: var(--mp-icon-danger, #dc2626); }

.alp-approver-comment {
  margin: var(--mp-spacing-1) 0 0;
  padding: var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
}
</style>
