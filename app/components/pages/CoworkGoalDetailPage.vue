<script setup lang="ts">
/**
 * Cowork — goal detail (/cowork-goals/:id). Everything a goal is made of:
 * the plan its lead agent wrote, the scheduled tasks that plan became, the
 * agents' own thread as they work it, and the tools it depends on.
 *
 * The agent thread is the part that has no equivalent elsewhere in the ERP: it
 * is the agents talking to each other — handing blocked strands over, recruiting
 * an agent the user never assigned, escalating when the target will not land —
 * and the user can drop into it.
 *
 * Full-bleed page — owns its own title bar + stage.
 */
import { computed, ref } from 'vue'
import {
  MpButton, MpIcon, MpSpinner, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { coworkAgents, coworkConnections, setConnection } from '~/data/cowork'
import {
  addGoalMessage, getGoal, goalDaysLeft, goalProgress, goalTasks, missingConnections,
  persistGoals, recomputeGoalStatus, updateGoal, type GoalStatus,
} from '~/data/coworkGoals'
import { formatDateTime } from '~/utils/date'

const props = defineProps<{ orderId?: string }>()
const route = useRoute()
const router = useRouter()

const goalId = computed(() => props.orderId || (route.path.split('/').filter(Boolean)[1] ?? ''))
const goal = computed(() => getGoal(goalId.value))

const isConnected = (id: string) => coworkConnections.find((c) => c.id === id)?.connected === true
const agent = (id: string) => coworkAgents.find((a) => a.id === id)
const connection = (id: string) => coworkConnections.find((c) => c.id === id)

const status = computed<GoalStatus>(() => (goal.value ? recomputeGoalStatus(goal.value, isConnected) : 'draft'))
const progress = computed(() => (goal.value ? goalProgress(goal.value) : 0))
const daysLeft = computed(() => (goal.value ? goalDaysLeft(goal.value) : null))
const tasks = computed(() => (goal.value ? goalTasks(goal.value) : []))
const missing = computed(() => (goal.value ? missingConnections(goal.value, isConnected) : []))

const STATUS_TYPE: Record<GoalStatus, 'completed' | 'warning' | 'critical' | 'announcement' | 'information'> = {
  draft: 'announcement', blocked: 'critical', active: 'information',
  'at-risk': 'warning', achieved: 'completed', archived: 'announcement',
}
const STATUS_LABEL: Record<GoalStatus, string> = {
  draft: 'Draft', blocked: 'Blocked', active: 'Active',
  'at-risk': 'At risk', achieved: 'Achieved', archived: 'Archived',
}

const activeTabIndex = ref(0)

const emptyIllustration = '/illustrations/empty-folder.png'
const emptyTasksIllustration = '/illustrations/empty-box.png'
const emptyChatIllustration = '/illustrations/start-chat.png'

function fmtMetric(n: number, unit?: string): string {
  if (unit === 'Rp') {
    return 'Rp' + (n >= 1_000_000_000 ? (n / 1_000_000_000).toFixed(2) + 'B'
      : n >= 1_000_000 ? Math.round(n / 1_000_000) + 'M' : n.toLocaleString('en-US'))
  }
  return n.toLocaleString('en-US') + (unit ? ' ' + unit : '')
}
function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso.length > 10 ? iso : iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function deadlineLabel(days: number | null): string {
  if (days === null) return 'No deadline'
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

/** Connecting a required tool is what unblocks a goal, so it re-derives here. */
function connect(id: string) {
  setConnection(id, true)
  if (goal.value && goal.value.status === 'blocked') {
    updateGoal(goal.value.id, { status: recomputeGoalStatus({ ...goal.value, status: 'active' }, isConnected) })
  }
}

// ── The agents' own thread ────────────────────────────────────────────────────
const note = ref('')
const syncing = ref(false)

/** Post into the agents' thread as the user, and let them react to it. */
async function postToThread() {
  const g = goal.value
  const text = note.value.trim()
  if (!g || !text) return
  addGoalMessage(g.id, { from: 'user', text })
  note.value = ''
  await runAgentTurn('user-message', text)
}

/** Ask the agents to coordinate — on the user's message, or on their own state. */
async function runAgentTurn(trigger: 'user-message' | 'risk' | 'kickoff', noteText = '') {
  const g = goal.value
  if (!g || syncing.value) return
  syncing.value = true
  try {
    const res = await $fetch<{ messages?: { from: string; to?: string; text: string; kind?: string }[] }>('/api/cowork/agent-turn', {
      method: 'POST',
      body: {
        goal: {
          title: g.title,
          metric: g.metric ? `${g.metric.name} ${g.metric.current} → ${g.metric.target}` : '',
          deadline: g.deadline, approach: g.plan?.approach,
          leadAgentId: g.leadAgentId, recruitedAgentIds: g.recruitedAgentIds,
        },
        agents: g.agentIds.map((id) => {
          const a = agent(id)
          return { id, name: a?.name ?? id, role: a?.role ?? '', module: a?.module ?? '' }
        }),
        workstreams: g.plan?.workstreams ?? [],
        thread: g.thread.slice(-8).map((m) => ({ from: m.from, to: m.to, text: m.text })),
        trigger,
        note: noteText,
      },
    })
    for (const m of res.messages ?? []) {
      if (!g.agentIds.includes(m.from)) continue
      addGoalMessage(g.id, { from: m.from, to: m.to || undefined, text: m.text, kind: m.kind as never })
    }
  } catch { /* leave the thread as it was */ }
  syncing.value = false
}

const KIND_LABEL: Record<string, string> = {
  handoff: 'Handoff', recruit: 'Recruited', question: 'Question',
  answer: 'Reply', result: 'Result', update: 'Update',
}

function openTask(id: string) { router.push(`/cowork-tasks/${id}`) }
function openChat() {
  const g = goal.value
  router.push(g?.chatSessionId ? { path: '/cowork-chats', query: { chat: g.chatSessionId } } : '/cowork-chats')
}
</script>

<template>
  <template v-if="goal">
    <header class="cgd-bar">
      <div class="cgd-bar__left">
        <button class="cgd-crumb" @click="router.push('/cowork-goals')">Goals</button>
        <h1 class="cgd-title">{{ goal.title }}</h1>
      </div>
      <div class="cgd-actions">
        <ErpStatusBadge :status="status" :label="STATUS_LABEL[status]" :type="STATUS_TYPE[status]" size="md" badge-for="additionalInformation" />
        <MpButton is-rounded variant="secondary" @click="openChat">Open the chat</MpButton>
      </div>
    </header>

    <div class="cgd-stage">
      <div class="cgd-inner">

        <!-- Where the number stands -->
        <section class="cgd-head">
          <div v-if="goal.metric" class="cgd-metric">
            <div class="cgd-metric__row">
              <span class="cgd-metric__name">{{ goal.metric.name }}</span>
              <span class="cgd-metric__nums">
                <strong>{{ fmtMetric(goal.metric.current, goal.metric.unit) }}</strong>
                <span class="cgd-metric__of">of {{ fmtMetric(goal.metric.target, goal.metric.unit) }}</span>
              </span>
            </div>
            <div class="cgd-progress">
              <div class="cgd-progress__fill" :class="'cgd-progress__fill--' + status" :style="{ width: progress + '%' }" />
            </div>
            <div class="cgd-metric__row cgd-metric__row--sub">
              <span>{{ progress }}% from a {{ fmtMetric(goal.metric.baseline, goal.metric.unit) }} baseline</span>
              <span>{{ deadlineLabel(daysLeft) }}{{ goal.deadline ? ' · ' + fmtDate(goal.deadline) : '' }}</span>
            </div>
          </div>
          <p class="cgd-outcome">“{{ goal.outcome }}”</p>

          <div class="cgd-agents">
            <span v-for="id in goal.agentIds" :key="id" class="cgd-agent">
              <img v-if="agent(id)?.avatar" :src="agent(id)!.avatar" :alt="agent(id)!.name" class="cgd-agent__av">
              <span class="cgd-agent__name">{{ agent(id)?.name ?? id }}</span>
              <span v-if="id === goal.leadAgentId" class="cgd-tag cgd-tag--lead">Lead</span>
              <span v-else-if="goal.recruitedAgentIds.includes(id)" class="cgd-tag cgd-tag--new">Added by agent</span>
            </span>
          </div>

          <!-- Blocked is the one state that needs an answer on this page -->
          <div v-if="missing.length" class="cgd-blocked">
            <MpIcon name="warning-triangle" size="sm" class="cgd-blocked__icon" />
            <span class="cgd-blocked__text">
              This goal can't run until {{ missing.map((m) => connection(m.connectionId)?.name ?? m.connectionId).join(' and ') }}
              {{ missing.length === 1 ? 'is' : 'are' }} connected.
            </span>
            <MpButton v-for="m in missing" :key="m.connectionId" is-rounded variant="primary" size="sm" @click="connect(m.connectionId)">
              Connect {{ connection(m.connectionId)?.name ?? m.connectionId }}
            </MpButton>
          </div>
        </section>

        <MpTabs id="cgd-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="cgd-tabs detail-tabs">
          <MpTabList>
            <MpTab id="cgd-tab-plan" value="plan">Plan</MpTab>
            <MpTab id="cgd-tab-tasks" value="tasks">Tasks</MpTab>
            <MpTab id="cgd-tab-thread" value="thread">Agent chat</MpTab>
            <MpTab id="cgd-tab-conns" value="conns">Connections</MpTab>
          </MpTabList>
          <MpTabPanels>

            <!-- ── Plan ─────────────────────────────────────────────────── -->
            <MpTabPanel value="plan">
              <div class="cgd-panel">
                <!-- A goal that was never approved has no plan to show yet -->
                <div v-if="!goal.plan?.approach && !goal.plan?.workstreams.length" class="cgd-empty">
                  <img :src="emptyIllustration" alt="" class="cgd-empty__img" width="240" height="200">
                  <p class="cgd-empty__title">No plan yet</p>
                  <p class="cgd-empty__desc">Set this goal in chat and the lead agent will write the plan here.</p>
                  <MpButton is-rounded variant="secondary" :class="css({ marginTop: '12px' })" @click="openChat">Open the chat</MpButton>
                </div>

                <section v-if="goal.plan?.approach">
                  <h3 class="cgd-h3">Approach</h3>
                  <p class="cgd-p">{{ goal.plan.approach }}</p>
                </section>

                <section v-if="goal.plan?.workstreams.length">
                  <h3 class="cgd-h3">Workstreams</h3>
                  <div v-for="w in goal.plan.workstreams" :key="w.id" class="cgd-ws">
                    <div class="cgd-ws__head">
                      <span class="cgd-ws__title">{{ w.title }}</span>
                      <span class="cgd-ws__owner">
                        <img v-if="agent(w.agentId)?.avatar" :src="agent(w.agentId)!.avatar" :alt="agent(w.agentId)!.name" class="cgd-agent__av cgd-agent__av--sm">
                        {{ agent(w.agentId)?.name ?? w.agentId }}
                      </span>
                    </div>
                    <p class="cgd-ws__why">{{ w.rationale }}</p>
                    <button v-for="tid in w.taskIds" :key="tid" type="button" class="cgd-ws__task" @click="openTask(tid)">
                      <MpIcon name="done" size="sm" /> {{ tasks.find((t) => t.id === tid)?.title ?? tid }}
                    </button>
                  </div>
                </section>

                <section v-if="goal.plan?.measurement">
                  <h3 class="cgd-h3">How progress is measured</h3>
                  <p class="cgd-p">{{ goal.plan.measurement }}</p>
                </section>

                <section v-if="goal.plan?.assumptions.length">
                  <h3 class="cgd-h3">Assumptions</h3>
                  <ul class="cgd-ul"><li v-for="a in goal.plan.assumptions" :key="a">{{ a }}</li></ul>
                </section>

                <section v-if="goal.plan?.risks.length">
                  <h3 class="cgd-h3">Risks</h3>
                  <ul class="cgd-ul"><li v-for="r in goal.plan.risks" :key="r">{{ r }}</li></ul>
                </section>
              </div>
            </MpTabPanel>

            <!-- ── Tasks ────────────────────────────────────────────────── -->
            <MpTabPanel value="tasks">
              <div class="cgd-panel">
                <div v-if="!tasks.length" class="cgd-empty">
                  <img :src="emptyTasksIllustration" alt="" class="cgd-empty__img" width="240" height="200">
                  <p class="cgd-empty__title">No tasks yet</p>
                  <p class="cgd-empty__desc">Approving the plan creates the scheduled tasks for this goal.</p>
                </div>
                <button v-for="t in tasks" :key="t.id" type="button" class="cgd-task" @click="openTask(t.id)">
                  <span class="cgd-task__main">
                    <span class="cgd-task__title">{{ t.title }}</span>
                    <span class="cgd-task__meta">
                      <img v-if="t.agentId && agent(t.agentId)?.avatar" :src="agent(t.agentId)!.avatar" :alt="agent(t.agentId)!.name" class="cgd-agent__av cgd-agent__av--sm">
                      <span v-if="t.agentId">{{ agent(t.agentId)?.name ?? t.agentId }}</span>
                      <span v-if="t.schedule">· {{ t.schedule.cadence }} at {{ t.schedule.time }}</span>
                    </span>
                  </span>
                  <ErpStatusBadge :status="t.status" />
                </button>
              </div>
            </MpTabPanel>

            <!-- ── Agent chat ───────────────────────────────────────────── -->
            <MpTabPanel value="thread">
              <div class="cgd-panel">
                <p class="cgd-muted cgd-thread__hint">
                  What the agents say to each other while they work this goal. You can join in.
                </p>

                <div v-if="!goal.thread.length" class="cgd-empty">
                  <img :src="emptyChatIllustration" alt="" class="cgd-empty__img" width="240" height="200">
                  <p class="cgd-empty__title">No messages yet</p>
                  <p class="cgd-empty__desc">The agents post here as they work — handovers, results and anything they need from you.</p>
                </div>

                <div v-for="m in goal.thread" :key="m.id" class="cgd-msg" :class="{ 'cgd-msg--user': m.from === 'user' }">
                  <img v-if="m.from !== 'user' && agent(m.from)?.avatar" :src="agent(m.from)!.avatar" :alt="agent(m.from)!.name" class="cgd-msg__av">
                  <span v-else class="cgd-msg__av cgd-msg__av--you">You</span>
                  <div class="cgd-msg__body">
                    <div class="cgd-msg__head">
                      <span class="cgd-msg__from">{{ m.from === 'user' ? 'You' : (agent(m.from)?.name ?? m.from) }}</span>
                      <template v-if="m.to">
                        <MpIcon name="arrows-right" size="sm" class="cgd-msg__arrow" />
                        <span class="cgd-msg__to">{{ agent(m.to)?.name ?? m.to }}</span>
                      </template>
                      <span v-if="m.kind" class="cgd-kind" :class="'cgd-kind--' + m.kind">{{ KIND_LABEL[m.kind] ?? m.kind }}</span>
                      <span class="cgd-msg__at">{{ formatDateTime(m.at) }}</span>
                    </div>
                    <p class="cgd-msg__text">{{ m.text }}</p>
                  </div>
                </div>

                <div class="cgd-compose">
                  <input
                    v-model="note"
                    class="cgd-compose__input"
                    placeholder="Say something to the agents on this goal…"
                    @keydown.enter.prevent="postToThread"
                  >
                  <MpButton is-rounded variant="primary" size="sm" :is-disabled="!note.trim() || syncing" @click="postToThread">Send</MpButton>
                  <MpButton is-rounded variant="secondary" size="sm" :is-disabled="syncing" @click="runAgentTurn('risk', 'Progress check requested by the user.')">
                    <MpSpinner v-if="syncing" size="sm" /> Ask for a sync
                  </MpButton>
                </div>
              </div>
            </MpTabPanel>

            <!-- ── Connections ──────────────────────────────────────────── -->
            <MpTabPanel value="conns">
              <div class="cgd-panel">
                <div v-if="!goal.connections.length" class="cgd-empty">
                  <img :src="emptyIllustration" alt="" class="cgd-empty__img" width="240" height="200">
                  <p class="cgd-empty__title">No tools needed</p>
                  <p class="cgd-empty__desc">This goal runs entirely on data the ERP already holds.</p>
                </div>
                <div v-for="c in goal.connections" :key="c.connectionId" class="cgd-conn">
                  <span class="cgd-conn__dot" :style="{ background: connection(c.connectionId)?.color ?? '#8c9596' }" />
                  <span class="cgd-conn__body">
                    <span class="cgd-conn__name">
                      {{ connection(c.connectionId)?.name ?? c.connectionId }}
                      <span v-if="c.required" class="cgd-req">Required</span>
                    </span>
                    <span class="cgd-conn__why">{{ c.why }}</span>
                  </span>
                  <MpButton v-if="!isConnected(c.connectionId)" is-rounded variant="secondary" size="sm" @click="connect(c.connectionId)">Connect</MpButton>
                  <span v-else class="cgd-conn__done"><MpIcon name="check" size="sm" /> Connected</span>
                </div>
              </div>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </div>
    </div>
  </template>

  <div v-else class="cgd-missing">
    <img :src="emptyIllustration" alt="" class="cgd-empty__img" width="288" height="240">
    <p class="cgd-empty__title">Goal not found</p>
    <p class="cgd-empty__desc">It may have been deleted, or the link is out of date.</p>
    <MpButton is-rounded variant="secondary" :class="css({ marginTop: '12px' })" @click="router.push('/cowork-goals')">Back to Goals</MpButton>
  </div>
</template>

<style scoped>
.cgd-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cgd-bar__left { display: flex; flex-direction: column; min-width: 0; }
.cgd-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.cgd-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cgd-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.cgd-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.cgd-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-20, 80px); }
.cgd-inner { width: 100%; max-width: 720px; }

.cgd-head { display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); padding-bottom: var(--mp-spacing-5, 20px); }
.cgd-metric { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.cgd-metric__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.cgd-metric__row--sub { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cgd-metric__name { color: var(--mp-text-secondary); }
.cgd-metric__nums strong { font-size: var(--mp-font-sizes-lg, 16px); }
.cgd-metric__of { color: var(--mp-text-secondary); margin-left: 4px; }
.cgd-progress { height: 8px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f3f4); overflow: hidden; }
.cgd-progress__fill { height: 100%; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand, #029861); transition: width 0.3s ease; }
.cgd-progress__fill--at-risk { background: var(--mp-background-warning, #f5a623); }
.cgd-progress__fill--blocked { background: var(--mp-background-critical, #d3382e); }
.cgd-outcome { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); font-style: italic; }

.cgd-agents { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); }
.cgd-agent { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5, 6px); padding: 3px var(--mp-spacing-2, 8px) 3px 3px; border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #fff); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm, 12px); }
.cgd-agent__av { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); flex: 0 0 auto; }
.cgd-agent__av--sm { width: 16px; height: 16px; }
.cgd-agent__name { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.cgd-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: var(--mp-font-weights-semi-bold, 600); border-radius: var(--mp-radii-full, 999px); padding: 1px 6px; }
.cgd-tag--lead { color: var(--mp-text-brand, #165082); background: var(--mp-background-info-subtle, #eaf2fb); }
.cgd-tag--new { color: var(--mp-text-success, #056f4e); background: var(--mp-background-success-subtle, #e7f5ef); }

.cgd-blocked { display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-3, 12px); border: 1px solid var(--mp-border-critical, #f3c9c6); background: var(--mp-background-critical-subtle, #fdeeed); border-radius: var(--mp-radii-lg, 12px); }
.cgd-blocked__icon { color: var(--mp-icon-critical, #d3382e); flex: 0 0 auto; }
.cgd-blocked__text { flex: 1; min-width: 200px; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }

.cgd-tabs { width: 100%; margin-top: var(--mp-spacing-2, 8px); }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.cgd-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-6, 24px); }
.cgd-h3 { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.cgd-p { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.cgd-ul { margin: 0; padding-inline-start: var(--mp-spacing-4, 16px); font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.cgd-muted { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); }

.cgd-ws { border-top: 1px solid var(--mp-border-default, #e3e7e9); padding: var(--mp-spacing-3, 12px) 0; display: flex; flex-direction: column; gap: 2px; }
.cgd-ws:first-of-type { border-top: none; padding-top: 0; }
.cgd-ws__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.cgd-ws__title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cgd-ws__owner { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); flex: 0 0 auto; }
.cgd-ws__why { margin: 0 0 var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.cgd-ws__task { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); width: 100%; padding: 3px 0; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-link); text-align: left; }
.cgd-ws__task:hover { text-decoration: underline; text-underline-offset: 2px; }

.cgd-task { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); width: 100%; padding: var(--mp-spacing-3, 12px) 0; border: none; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); background: none; cursor: pointer; font-family: inherit; text-align: left; }
.cgd-task__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cgd-task__title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.cgd-task__meta { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.cgd-thread__hint { margin: 0; }
.cgd-msg { display: flex; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-3, 12px) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cgd-msg__av { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); flex: 0 0 auto; }
.cgd-msg__av--you { display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-secondary); }
.cgd-msg__body { min-width: 0; flex: 1; }
.cgd-msg__head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-1\.5, 6px); }
.cgd-msg__from { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cgd-msg__to { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm, 12px); }
.cgd-msg__arrow { color: var(--mp-text-secondary); width: 16px; height: 16px; flex: 0 0 auto; }
.cgd-msg__at { margin-left: auto; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cgd-msg__text { margin: 2px 0 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.cgd-kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: var(--mp-font-weights-semi-bold, 600); border-radius: var(--mp-radii-full, 999px); padding: 1px 6px; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f1f3f4); }
.cgd-kind--handoff { color: var(--mp-text-brand, #165082); background: var(--mp-background-info-subtle, #eaf2fb); }
.cgd-kind--recruit { color: var(--mp-text-success, #056f4e); background: var(--mp-background-success-subtle, #e7f5ef); }
.cgd-kind--result { color: var(--mp-text-success, #056f4e); background: var(--mp-background-success-subtle, #e7f5ef); }

.cgd-compose { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding-top: var(--mp-spacing-3, 12px); }
.cgd-compose__input { flex: 1; min-width: 0; padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 12px); font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); background: var(--mp-background-neutral, #fff); outline: none; }
.cgd-compose__input:focus { border-color: var(--mp-border-bold, #8c9596); }

.cgd-conn { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-3, 12px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 8px); }
.cgd-conn__dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.cgd-conn__body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.cgd-conn__name { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.cgd-conn__why { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cgd-conn__done { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-success, #029861); flex: 0 0 auto; }
.cgd-req { font-size: 10px; font-weight: var(--mp-font-weights-semi-bold, 600); text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-warning, #b54708); background: var(--mp-background-warning-subtle, #fef6e7); border-radius: var(--mp-radii-full, 999px); padding: 1px 6px; }

/* Empty states — the ERP's illustrated blank slates (see ErpTablePage and the
   module index pages), sized down for a tab panel. */
.cgd-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: var(--mp-spacing-10, 40px) 0; }
.cgd-empty__img { width: 240px; height: 200px; object-fit: contain; }
.cgd-empty__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cgd-empty__desc { margin: var(--mp-spacing-0\.5, 2px) 0 0; max-width: 380px; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.cgd-missing { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-20, 80px); }
.cgd-missing .cgd-empty__img { width: 288px; height: 240px; }
</style>
