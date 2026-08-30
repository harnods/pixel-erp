<script setup lang="ts">
/**
 * The structured half of an agent's reply in a goal conversation. The agent's
 * prose sits in the message bubble above; everything the user has to act on
 * renders here:
 *
 *   needs-input   — what the agent still needs, with Connect buttons for the
 *                   tools it cannot read the metric without
 *   counter       — its objection's alternative, acceptable in one click
 *   plan          — metric, agents (recruited ones badged as such), workstreams
 *                   and the tasks it will schedule; approving writes them
 *   goal-created  — the receipt, linking to the goal
 */
import { computed } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import { coworkAgents, coworkConnections } from '~/data/cowork'
import type { ChatCard, GoalDraft } from '~/data/coworkGoals'

const props = defineProps<{ card: ChatCard }>()
const emit = defineEmits<{
  (e: 'connect', connectionId: string): void
  (e: 'proceed', text: string): void
  (e: 'accept-counter', draft: GoalDraft): void
  (e: 'approve', draft: GoalDraft): void
  (e: 'open', goalId: string): void
}>()

const agent = (id: string) => coworkAgents.find((a) => a.id === id)
const connection = (id: string) => coworkConnections.find((c) => c.id === id)
const isConnected = (id: string) => connection(id)?.connected === true

const draft = computed<GoalDraft | undefined>(() =>
  props.card.kind === 'plan' ? props.card.draft
  : props.card.kind === 'counter' ? props.card.draft
  : undefined)

/** Tasks grouped under the workstream they belong to, so the plan reads as
 *  strands of work rather than a flat list. */
const strands = computed(() => {
  const d = draft.value
  if (!d?.workstreams?.length) return []
  return d.workstreams.map((w) => ({
    ...w,
    tasks: (d.tasks ?? []).filter((t) => t.workstreamId === w.id),
  }))
})

/** Tasks the model didn't tie to a workstream still have to be shown. */
const looseTasks = computed(() => {
  const d = draft.value
  if (!d?.tasks?.length) return []
  const ids = new Set((d.workstreams ?? []).map((w) => w.id))
  return d.tasks.filter((t) => !t.workstreamId || !ids.has(t.workstreamId))
})

function fmtNum(n?: number, unit?: string): string {
  if (n == null) return '—'
  if (unit === 'Rp') {
    return 'Rp' + (n >= 1_000_000_000 ? (n / 1_000_000_000).toFixed(2) + 'B'
      : n >= 1_000_000 ? Math.round(n / 1_000_000) + 'M'
      : n.toLocaleString('en-US'))
  }
  return n.toLocaleString('en-US') + (unit ? ' ' + unit : '')
}
function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <!-- ── Not measurable yet ─────────────────────────────────────────────── -->
  <div v-if="card.kind === 'needs-input'" class="gc gc--ask">
    <p class="gc__label">What I need before I can plan</p>
    <ul v-if="card.questions.length" class="gc__asks">
      <li v-for="q in card.questions" :key="q">{{ q }}</li>
    </ul>

    <div v-if="card.connections.length" class="gc__conns">
      <div v-for="c in card.connections" :key="c.connectionId" class="gc-conn">
        <span class="gc-conn__dot" :style="{ background: connection(c.connectionId)?.color ?? '#8c9596' }" />
        <span class="gc-conn__body">
          <span class="gc-conn__name">
            {{ connection(c.connectionId)?.name ?? c.connectionId }}
            <span v-if="c.required" class="gc-req">Required</span>
          </span>
          <span class="gc-conn__why">{{ c.why }}</span>
        </span>
        <MpButton v-if="!isConnected(c.connectionId)" is-rounded variant="secondary" size="sm" @click="emit('connect', c.connectionId)">
          Connect
        </MpButton>
        <span v-else class="gc-conn__done"><MpIcon name="check" size="sm" /> Connected</span>
      </div>
    </div>
  </div>

  <!-- ── Objection + counter-proposal ───────────────────────────────────── -->
  <div v-else-if="card.kind === 'counter'" class="gc gc--counter">
    <p class="gc__label">What I'd do instead</p>
    <p class="gc__counter">{{ card.counter }}</p>
    <div class="gc__actions">
      <!-- Accepting the counter adopts ITS numbers — the plan the agent costed
           against the realistic target, not the one it just argued against. -->
      <MpButton
        v-if="card.draft"
        is-rounded variant="primary" size="sm"
        @click="emit('accept-counter', card.draft)"
      >
        Take your suggestion
      </MpButton>
      <MpButton is-rounded variant="secondary" size="sm" @click="emit('proceed', 'Tetap pakai target awal saya.')">
        Keep my target
      </MpButton>
    </div>
  </div>

  <!-- ── The plan ───────────────────────────────────────────────────────── -->
  <div v-else-if="card.kind === 'plan' && card.draft" class="gc gc--plan">
    <div class="gc-plan__head">
      <p class="gc-plan__title">{{ card.draft.title }}</p>
      <p v-if="card.draft.metricName" class="gc-plan__metric">
        {{ card.draft.metricName }}
        <strong>{{ fmtNum(card.draft.baseline, card.draft.metricUnit) }}</strong>
        <MpIcon :name="card.draft.direction === 'down' ? 'arrows-down' : 'arrows-up'" size="sm" class="gc-plan__arrow" />
        <strong>{{ fmtNum(card.draft.target, card.draft.metricUnit) }}</strong>
        <span v-if="card.draft.deadline" class="gc-plan__by">by {{ fmtDate(card.draft.deadline) }}</span>
      </p>
    </div>

    <p v-if="card.draft.approach" class="gc-plan__approach">{{ card.draft.approach }}</p>

    <!-- Who is on it — including agents the lead brought in itself -->
    <div v-if="card.draft.agentIds?.length" class="gc-sec">
      <p class="gc__label">Agents on this goal</p>
      <div class="gc-agents">
        <span v-for="id in card.draft.agentIds" :key="id" class="gc-agent">
          <img v-if="agent(id)?.avatar" :src="agent(id)!.avatar" :alt="agent(id)!.name" class="gc-agent__av">
          <span class="gc-agent__name">{{ agent(id)?.name ?? id }}</span>
          <span v-if="id === card.draft.leadAgentId" class="gc-tag gc-tag--lead">Lead</span>
          <span v-else-if="card.draft.recruitedAgentIds?.includes(id)" class="gc-tag gc-tag--new">Added by agent</span>
        </span>
      </div>
    </div>

    <!-- Workstreams and the tasks each will schedule -->
    <div v-if="strands.length || looseTasks.length" class="gc-sec">
      <p class="gc__label">Plan</p>
      <div v-for="w in strands" :key="w.id" class="gc-ws">
        <div class="gc-ws__head">
          <span class="gc-ws__title">{{ w.title }}</span>
          <span class="gc-ws__owner">
            <img v-if="agent(w.agentId)?.avatar" :src="agent(w.agentId)!.avatar" :alt="agent(w.agentId)!.name" class="gc-agent__av gc-agent__av--sm">
            {{ agent(w.agentId)?.name ?? w.agentId }}
          </span>
        </div>
        <p v-if="w.rationale" class="gc-ws__why">{{ w.rationale }}</p>
        <div v-for="t in w.tasks" :key="t.title" class="gc-task">
          <MpIcon name="done" size="sm" class="gc-task__icon" />
          <span class="gc-task__title">{{ t.title }}</span>
          <span class="gc-task__sched">{{ t.cadence }} · {{ t.time }}</span>
        </div>
      </div>
      <div v-for="t in looseTasks" :key="t.title" class="gc-task">
        <MpIcon name="done" size="sm" class="gc-task__icon" />
        <span class="gc-task__title">{{ t.title }}</span>
        <span class="gc-task__sched">{{ t.cadence }} · {{ t.time }}</span>
      </div>
    </div>

    <!-- Tools the plan needs -->
    <div v-if="card.draft.connections?.length" class="gc-sec">
      <p class="gc__label">Tools this needs</p>
      <div class="gc__conns">
        <div v-for="c in card.draft.connections" :key="c.connectionId" class="gc-conn">
          <span class="gc-conn__dot" :style="{ background: connection(c.connectionId)?.color ?? '#8c9596' }" />
          <span class="gc-conn__body">
            <span class="gc-conn__name">
              {{ connection(c.connectionId)?.name ?? c.connectionId }}
              <span v-if="c.required" class="gc-req">Required</span>
            </span>
            <span class="gc-conn__why">{{ c.why }}</span>
          </span>
          <MpButton v-if="!isConnected(c.connectionId)" is-rounded variant="secondary" size="sm" @click="emit('connect', c.connectionId)">
            Connect
          </MpButton>
          <span v-else class="gc-conn__done"><MpIcon name="check" size="sm" /> Connected</span>
        </div>
      </div>
    </div>

    <details v-if="card.draft.assumptions?.length || card.draft.risks?.length || card.draft.measurement" class="gc-more">
      <summary>Assumptions, measurement and risks</summary>
      <p v-if="card.draft.measurement" class="gc-more__p"><strong>Measured by</strong> — {{ card.draft.measurement }}</p>
      <template v-if="card.draft.assumptions?.length">
        <p class="gc-more__h">Assuming</p>
        <ul class="gc-more__ul"><li v-for="a in card.draft.assumptions" :key="a">{{ a }}</li></ul>
      </template>
      <template v-if="card.draft.risks?.length">
        <p class="gc-more__h">Risks</p>
        <ul class="gc-more__ul"><li v-for="r in card.draft.risks" :key="r">{{ r }}</li></ul>
      </template>
    </details>

    <div class="gc__actions">
      <MpButton is-rounded variant="primary" size="sm" @click="emit('approve', card.draft)">
        Approve &amp; create tasks
      </MpButton>
      <MpButton is-rounded variant="secondary" size="sm" @click="emit('proceed', 'Tolong ubah plan-nya:')">
        Change something
      </MpButton>
    </div>
  </div>

  <!-- ── Receipt ────────────────────────────────────────────────────────── -->
  <div v-else-if="card.kind === 'goal-created'" class="gc gc--done">
    <MpIcon name="done" size="md" class="gc-done__icon" />
    <span class="gc-done__text">
      Goal created · {{ card.taskCount }} scheduled {{ card.taskCount === 1 ? 'task' : 'tasks' }}
    </span>
    <MpButton is-rounded variant="secondary" size="sm" @click="emit('open', card.goalId)">Open goal</MpButton>
  </div>
</template>

<style scoped>
.gc {
  margin-top: var(--mp-spacing-2, 8px);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-lg, 12px);
  background: var(--mp-background-neutral, #fff);
  padding: var(--mp-spacing-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3, 12px);
}
.gc__label { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
.gc__actions { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); }

/* Not measurable yet */
.gc__asks { margin: 0; padding-inline-start: var(--mp-spacing-4, 16px); display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.gc--ask { border-left: 3px solid var(--mp-border-warning, #f5a623); }

/* Connections */
.gc__conns { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }
.gc-conn { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-2, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 8px); }
.gc-conn__dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.gc-conn__body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.gc-conn__name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.gc-conn__why { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.gc-conn__done { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-success, #029861); flex: 0 0 auto; }
.gc-req { font-size: 10px; font-weight: var(--mp-font-weights-semi-bold, 600); text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-warning, #b54708); background: var(--mp-background-warning-subtle, #fef6e7); border-radius: var(--mp-radii-full, 999px); padding: 1px 6px; }

/* Counter-proposal */
.gc--counter { border-left: 3px solid var(--mp-border-critical, #d3382e); }
.gc__counter { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }

/* Plan */
.gc-plan__head { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.gc-plan__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.gc-plan__metric { margin: 0; display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); }
.gc-plan__metric strong { color: var(--mp-text-default); }
.gc-plan__arrow { color: var(--mp-icon-brand, #029861); }
.gc-plan__by { color: var(--mp-text-secondary); }
.gc-plan__approach { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.gc-sec { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }

.gc-agents { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); }
.gc-agent { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5, 6px); padding: 3px var(--mp-spacing-2, 8px) 3px 3px; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm, 12px); }
.gc-agent__av { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); flex: 0 0 auto; }
.gc-agent__av--sm { width: 16px; height: 16px; }
.gc-agent__name { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.gc-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: var(--mp-font-weights-semi-bold, 600); border-radius: var(--mp-radii-full, 999px); padding: 1px 6px; }
.gc-tag--lead { color: var(--mp-text-brand, #165082); background: var(--mp-background-info-subtle, #eaf2fb); }
.gc-tag--new { color: var(--mp-text-success, #056f4e); background: var(--mp-background-success-subtle, #e7f5ef); }

.gc-ws { border-top: 1px solid var(--mp-border-default, #e3e7e9); padding-top: var(--mp-spacing-2, 8px); display: flex; flex-direction: column; gap: 2px; }
.gc-ws:first-of-type { border-top: none; padding-top: 0; }
.gc-ws__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2, 8px); }
.gc-ws__title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.gc-ws__owner { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); flex: 0 0 auto; }
.gc-ws__why { margin: 0 0 var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.gc-task { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: 3px 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.gc-task__icon { color: var(--mp-icon-subtle, #8c9596); flex: 0 0 auto; }
.gc-task__title { flex: 1; min-width: 0; }
.gc-task__sched { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); flex: 0 0 auto; }

.gc-more { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.gc-more > summary { cursor: pointer; color: var(--mp-text-link); }
.gc-more__h { margin: var(--mp-spacing-2, 8px) 0 2px; font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.gc-more__p { margin: var(--mp-spacing-2, 8px) 0 0; line-height: var(--mp-line-heights-md, 20px); }
.gc-more__ul { margin: 0; padding-inline-start: var(--mp-spacing-4, 16px); line-height: var(--mp-line-heights-md, 20px); }

/* Receipt */
.gc--done { flex-direction: row; align-items: center; gap: var(--mp-spacing-2, 8px); border-color: var(--mp-border-success, #b7e3d1); background: var(--mp-background-success-subtle, #e7f5ef); }
.gc-done__icon { color: var(--mp-icon-success, #029861); flex: 0 0 auto; }
.gc-done__text { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
</style>
