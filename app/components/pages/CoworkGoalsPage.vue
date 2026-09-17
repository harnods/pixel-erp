<script setup lang="ts">
/**
 * Cowork — Goals (/cowork-goals). The outcomes your agents are working towards.
 *
 * A goal is stated in chat and planned by its lead agent; this page is where the
 * results of that live: how far the metric has actually moved, who is on it,
 * what is blocked on a tool nobody connected, and which goals will miss their
 * deadline at the current pace.
 *
 * Full-bleed page — owns its own title bar + stage.
 */
import { computed } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { coworkAgents, coworkConnections } from '~/data/cowork'
import {
  coworkGoals, goalDaysLeft, goalProgress, goalTasks, missingConnections,
  recomputeGoalStatus, type CoworkGoal, type GoalStatus,
} from '~/data/coworkGoals'
import { useCoworkGoalChat } from '~/composables/useCoworkGoalChat'

const router = useRouter()
const goalChat = useCoworkGoalChat()

const emptyIllustration = '/illustrations/empty-folder.png'

const isConnected = (id: string) => coworkConnections.find((c) => c.id === id)?.connected === true
const agent = (id: string) => coworkAgents.find((a) => a.id === id)

/** Status is derived, not stored — a goal blocked on a disconnected tool should
 *  say so the moment that tool is disconnected, without anyone re-saving it. */
const rows = computed(() =>
  coworkGoals.map((g) => ({
    goal: g,
    status: recomputeGoalStatus(g, isConnected),
    progress: goalProgress(g),
    daysLeft: goalDaysLeft(g),
    tasks: goalTasks(g).length,
    missing: missingConnections(g, isConnected),
  })))

const STATUS_TYPE: Record<GoalStatus, 'completed' | 'warning' | 'critical' | 'announcement' | 'information'> = {
  draft: 'announcement', blocked: 'critical', active: 'information',
  'at-risk': 'warning', achieved: 'completed', archived: 'announcement',
}
const STATUS_LABEL: Record<GoalStatus, string> = {
  draft: 'Draft', blocked: 'Blocked', active: 'Active',
  'at-risk': 'At risk', achieved: 'Achieved', archived: 'Archived',
}

function fmtMetric(n: number, unit?: string): string {
  if (unit === 'Rp') {
    return 'Rp' + (n >= 1_000_000_000 ? (n / 1_000_000_000).toFixed(2) + 'B'
      : n >= 1_000_000 ? Math.round(n / 1_000_000) + 'M' : n.toLocaleString('en-US'))
  }
  return n.toLocaleString('en-US') + (unit ? ' ' + unit : '')
}
function deadlineLabel(days: number | null): string {
  if (days === null) return 'No deadline'
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

/** Goals are set by talking to agents, so "+ Goal" opens the chat in goal mode
 *  rather than a form. */
function newGoal() {
  goalChat.resetGoalMode()
  goalChat.goalMode.value = true
  router.push('/cowork-chats')
}
function open(g: CoworkGoal) { router.push(`/cowork-goals/${g.id}`) }
</script>

<template>
  <header class="cwg-bar">
    <h1 class="cwg-title">Goals</h1>
    <div class="cwg-actions">
      <MpButton is-rounded variant="primary" @click="newGoal">+ Goal</MpButton>
    </div>
  </header>

  <div class="cwg-stage">
    <div v-if="!rows.length" class="empty-full">
      <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
      <p class="empty-full-title">No goals yet</p>
      <p class="empty-full-desc">
        Tell your agents the outcome you want — they'll check whether it's achievable, plan it, and schedule the work.
      </p>
      <button class="empty-full-btn" @click="newGoal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Goal
      </button>
    </div>

    <div v-else class="cwg-list">
      <button v-for="r in rows" :key="r.goal.id" type="button" class="cwg-card" @click="open(r.goal)">
        <div class="cwg-card__head">
          <span class="cwg-card__title">{{ r.goal.title }}</span>
          <ErpStatusBadge :status="r.status" :label="STATUS_LABEL[r.status]" :type="STATUS_TYPE[r.status]" />
        </div>

        <!-- The number, and how far it has actually moved -->
        <div v-if="r.goal.metric" class="cwg-metric">
          <div class="cwg-metric__row">
            <span class="cwg-metric__name">{{ r.goal.metric.name }}</span>
            <span class="cwg-metric__nums">
              <strong>{{ fmtMetric(r.goal.metric.current, r.goal.metric.unit) }}</strong>
              <span class="cwg-metric__of">of {{ fmtMetric(r.goal.metric.target, r.goal.metric.unit) }}</span>
            </span>
          </div>
          <div class="cwg-progress" role="presentation">
            <div class="cwg-progress__fill" :class="'cwg-progress__fill--' + r.status" :style="{ width: r.progress + '%' }" />
          </div>
          <div class="cwg-metric__row cwg-metric__row--sub">
            <span>{{ r.progress }}% of the way from {{ fmtMetric(r.goal.metric.baseline, r.goal.metric.unit) }}</span>
            <span>{{ deadlineLabel(r.daysLeft) }}</span>
          </div>
        </div>

        <!-- Blocked goals say what is missing, right here -->
        <p v-if="r.missing.length" class="cwg-blocked">
          <MpIcon name="warning-triangle" size="sm" />
          Waiting on {{ r.missing.map((m) => coworkConnections.find((c) => c.id === m.connectionId)?.name ?? m.connectionId).join(', ') }}
        </p>

        <div class="cwg-card__foot">
          <span class="cwg-agents">
            <img
              v-for="id in r.goal.agentIds.slice(0, 5)"
              :key="id"
              :src="agent(id)?.avatar"
              :alt="agent(id)?.name ?? id"
              :title="agent(id)?.name ?? id"
              class="cwg-agents__av"
            >
          </span>
          <span class="cwg-foot__meta">{{ r.tasks }} {{ r.tasks === 1 ? 'task' : 'tasks' }}</span>
          <span v-if="r.goal.recruitedAgentIds.length" class="cwg-foot__meta cwg-foot__meta--new">
            +{{ r.goal.recruitedAgentIds.length }} added by agent
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cwg-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cwg-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.cwg-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.cwg-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-20, 80px); }

.cwg-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: var(--mp-spacing-4, 16px); }
.cwg-card { display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); text-align: left; font-family: inherit; cursor: pointer; background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-4, 16px); }
.cwg-card:hover { border-color: var(--mp-border-bold, #8c9596); }
.cwg-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3, 12px); }
.cwg-card__title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }

.cwg-metric { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.cwg-metric__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.cwg-metric__row--sub { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cwg-metric__name { color: var(--mp-text-secondary); }
.cwg-metric__of { color: var(--mp-text-secondary); margin-left: 4px; }
.cwg-progress { height: 6px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f3f4); overflow: hidden; }
.cwg-progress__fill { height: 100%; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand, #029861); transition: width 0.3s ease; }
.cwg-progress__fill--at-risk { background: var(--mp-background-warning, #f5a623); }
.cwg-progress__fill--blocked { background: var(--mp-background-critical, #d3382e); }
.cwg-progress__fill--achieved { background: var(--mp-background-success, #029861); }

.cwg-blocked { margin: 0; display: flex; align-items: center; gap: var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-critical, #d3382e); }

.cwg-card__foot { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); }
.cwg-agents { display: inline-flex; align-items: center; }
.cwg-agents__av { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); border: 1.5px solid var(--mp-background-neutral, #fff); margin-right: -8px; }
.cwg-agents__av:last-child { margin-right: var(--mp-spacing-2, 8px); }
.cwg-foot__meta { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cwg-foot__meta--new { color: var(--mp-text-success, #056f4e); }

/* Empty state — the ERP's standard illustrated blank slate (see ErpTablePage
   and the module index pages), not a lone icon. */
.empty-full { display: flex; flex-direction: column; align-items: center; text-align: center; padding: var(--mp-spacing-10, 40px) var(--mp-spacing-6); max-width: 480px; margin: 0 auto; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.empty-full-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px); font-family: inherit;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); cursor: pointer;
}
.empty-full-btn:hover { background: var(--mp-background-neutral-subtle); }
</style>
