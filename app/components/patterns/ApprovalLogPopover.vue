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
import { overallApprovalStatus, type ApprovalLevel } from '~/data/tasks'
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

const overallLabel = computed(() => {
  const status = overallApprovalStatus(props.levels)
  return status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'
})

function ruleText(level: ApprovalLevel) {
  return level.rule === 'any'
    ? 'Anyone can approve'
    : `Everyone must approve (${level.approvedCount} of ${level.steps.length})`
}
</script>

<template>
  <div class="icon-tooltip-wrap">
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
        <button class="row-icon-btn" aria-label="Approval log" type="button" @click.stop="open = !open">
          <MpIcon name="task-todo" size="md" />
        </button>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ width: '360px', padding: '0' })" @blur="open = false" @escape="open = false">
        <div class="alp-header">
          <span class="alp-title">Approval log - {{ overallLabel }}</span>
          <button class="alp-close" aria-label="Close" @click.stop="open = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="alp-body">
          <h3 class="alp-subject">{{ subject }}</h3>

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
            <div v-for="(level, li) in levels" :key="li" class="alp-row">
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
                <div class="alp-row-top">
                  <span class="alp-row-title">{{ level.label }}</span>
                  <ErpStatusBadge :status="level.status" size="sm" />
                </div>
                <span class="alp-row-sub">{{ ruleText(level) }}</span>

                <div v-if="expanded.has(li)" class="alp-approvers">
                  <div v-for="(step, si) in level.steps" :key="si" class="alp-approver">
                    <MpAvatar :name="step.name" size="sm" variant-color="sky" />
                    <div class="alp-approver-body">
                      <div class="alp-approver-top">
                        <span class="alp-approver-name">{{ step.name }}</span>
                        <ErpStatusBadge :status="step.status" size="sm" />
                      </div>
                      <span class="alp-approver-role">{{ step.role }}</span>
                      <span v-if="step.timestamp" class="alp-approver-time">{{ formatDateTime(step.timestamp) }}</span>
                      <p v-if="step.comment" class="alp-approver-comment">{{ step.comment }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MpPopoverContent>
    </MpPopover>
    <span class="icon-tooltip">Approval log</span>
  </div>
</template>

<style scoped>
/* ── Tooltip: plain CSS, 4px gap above the trigger — avoids MpTooltip's
     cloneVNode/inheritAttrs interaction with MpPopoverTrigger (see memory). ── */
.icon-tooltip-wrap { position: relative; display: inline-flex; }
.icon-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-inverse, #1f2937);
  color: var(--mp-text-inverse, #fff);
  font-size: var(--mp-font-sizes-xs, 11px);
  line-height: var(--mp-line-heights-xs, 16px);
  border-radius: var(--mp-radii-sm);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 100ms;
  z-index: 10;
}
.icon-tooltip-wrap:hover .icon-tooltip { opacity: 1; }

/* ── Header ── */
.alp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4);
  background: var(--mp-background-surface, #f8fafc);
  border-bottom: 1px solid var(--mp-border-default);
}
.alp-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.alp-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-6, 24px);
  height: var(--mp-sizes-6, 24px);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}
.alp-close:hover { background: var(--mp-background-neutral-hovered); }

/* ── Body ── */
.alp-body {
  padding: var(--mp-spacing-4);
  max-height: 420px;
  overflow-y: auto;
}
.alp-subject {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Timeline ── */
.alp-timeline { position: relative; }
.alp-timeline::before {
  content: '';
  position: absolute;
  left: 9px;
  top: 12px;
  bottom: 12px;
  width: 1px;
  background: var(--mp-border-default);
}

.alp-row {
  position: relative;
  display: flex;
  gap: var(--mp-spacing-3);
  padding-bottom: var(--mp-spacing-4);
}
.alp-row:last-child { padding-bottom: 0; }

.alp-dot {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-brand, var(--mp-text-selected, #16a34a));
}

.alp-marker {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
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
  gap: var(--mp-spacing-0\.5);
  min-width: 0;
  flex: 1;
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

/* ── Expanded approver list ── */
.alp-approvers {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-radius: var(--mp-radii-md);
}
.alp-approver { display: flex; gap: var(--mp-spacing-2); }
.alp-approver-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  min-width: 0;
}
.alp-approver-top { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.alp-approver-name {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.alp-approver-role, .alp-approver-time {
  font-size: var(--mp-font-sizes-xs, 11px);
  color: var(--mp-text-secondary);
}
.alp-approver-comment {
  margin: var(--mp-spacing-1) 0 0;
  padding: var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
}
</style>
