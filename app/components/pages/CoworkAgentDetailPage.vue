<script setup lang="ts">
/**
 * Cowork — Agent detail page (/cowork-agents/:id). Copilot-Studio-style tabs
 * (Overview, Knowledge, Skills, Connections, Visibility, Versions, Usage), plus
 * lifecycle actions: Chat, Edit, Duplicate, View usage, Archive / Restore (AG-22/23).
 * Everything reflects what the wizard set, including per-skill approval mode (SK-30)
 * and immutable version history (AG-04).
 */
import { computed, ref } from 'vue'
import {
  MpButton, MpIcon, MpAvatar, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink, css, toast,
} from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ApprovalModeIcon from '~/components/patterns/ApprovalModeIcon.vue'
import {
  getAgent, COWORK_SKILLS, COWORK_COMPANY, COWORK_CATALOG, coworkConnections, COWORK_ROLES,
  SKILL_RISK_META, canArchiveAgent, archiveAgent, restoreAgent, duplicateAgent, rollbackAgent,
  tasksUsingAgent, visibilityAudienceCount, agentHasAutoAction,
  type CoworkAgent, type CoworkSkillBinding,
} from '~/data/cowork'
import { employees } from '~/data/employees'
import { resolveAttachments } from '~/data/coworkKb'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const agent = computed<CoworkAgent | undefined>(() => getAgent(props.orderId))

const MODEL_LABELS: Record<string, string> = {
  'gemini-flash-latest': 'Gemini Flash', 'gemini-pro-latest': 'Gemini Pro', 'gemini-flash-lite-latest': 'Gemini Flash Lite',
}
const LANG_LABELS: Record<string, string> = { mirror: 'Auto (match the user)', id: 'Bahasa Indonesia', en: 'English' }
const modelLabel = computed(() => MODEL_LABELS[agent.value?.model ?? ''] ?? 'Gemini Flash')
const instruction = computed(() => agent.value?.instruction || agent.value?.persona || '')

// Badges
const isArchived = computed(() => agent.value?.status === 'archived')
const isDraft = computed(() => agent.value?.status === 'draft')
const hasAuto = computed(() => agentHasAutoAction(agent.value))

// Knowledge
const knowledgeAreas = computed(() => {
  if (agent.value?.allWorkspace) return ['All connected apps']
  const apps = (agent.value?.knowledgeApps ?? []).map((id) => coworkConnections.find((c) => c.id === id)?.name).filter(Boolean) as string[]
  return apps.length ? apps : (agent.value?.knowledgeAreas ?? [])
})
const knowledgeDocs = computed(() => resolveAttachments(agent.value?.knowledge ?? []))

// Skills (with binding → risk + approval mode)
interface SkillRow { id: string; name: string; description: string; risk: { label: string; tone: string }; binding: CoworkSkillBinding }
const skillRows = computed<SkillRow[]>(() => (agent.value?.skillBindings ?? []).map((b) => {
  const s = COWORK_SKILLS.find((x) => x.id === b.skillId)
  return s ? { id: s.id, name: s.name, description: s.description, risk: SKILL_RISK_META[s.riskClass ?? 'write_internal'], binding: b } : null
}).filter(Boolean) as SkillRow[])
function bindingChip(b: CoworkSkillBinding): string {
  if (b.approvalMode !== 'auto') return 'Ask first'
  const cap = b.autoConditions?.maxPerDay
  return cap ? `Auto · ≤ ${cap}/day` : 'Auto'
}

// Connections the agent draws on (apps + skill-required connections)
const agentConnections = computed(() => {
  const ids = new Set<string>(agent.value?.knowledgeApps ?? [])
  ;(agent.value?.skillBindings ?? []).forEach((b) => {
    COWORK_SKILLS.find((s) => s.id === b.skillId)?.requiresConnections?.forEach((c) => ids.add(c))
  })
  return [...ids].map((id) => coworkConnections.find((c) => c.id === id)).filter(Boolean) as typeof coworkConnections
})

// Visibility
const visRoles = computed(() => (agent.value?.visibilityRoles ?? []).map((id) => COWORK_ROLES.find((r) => r.id === id)).filter(Boolean))
const visEmployees = computed(() => (agent.value?.visibilityEmployees ?? []).map((id) => employees.find((e) => e.id === id)).filter(Boolean))
const audienceCount = computed(() => agent.value ? visibilityAudienceCount(agent.value) : 0)

// Tasks this agent runs / would pause
const ownedTasks = computed(() => COWORK_CATALOG.filter((c) => c.module === agent.value?.module))
const scheduledCount = computed(() => tasksUsingAgent(agent.value).length)

// Usage (deterministic mock from the agent id — a believable snapshot)
const usage = computed(() => {
  const a = agent.value
  if (!a) return null
  let h = 0; for (const ch of a.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const chats7 = 4 + (h % 20)
  return {
    chats7, chats30: chats7 * 4 + (h % 11), chats90: chats7 * 11 + (h % 31),
    tasks: 2 + (h % 9), users: 3 + (h % 14), failureRate: ((h % 40) / 10).toFixed(1),
    avgTools: (1 + (h % 30) / 10).toFixed(1), autoActions: hasAuto.value ? 6 + (h % 24) : 0,
    cost: (2 + (h % 18)).toFixed(0),
  }
})

const TAB_KEYS = ['overview', 'knowledge', 'skills', 'connections', 'visibility', 'versions', 'usage']
// Deep-link support: `?tab=usage` (from the index "View usage" action) opens straight to that tab.
const route = useRoute()
const initialTab = TAB_KEYS.indexOf(String(route.query.tab ?? ''))
const activeTabIndex = ref(initialTab >= 0 ? initialTab : 0)

function edit() { router.push(`/cowork-agents/${props.orderId}/edit`) }
function chat() { toast.notify({ variant: 'success', title: `Opening a chat with ${agent.value?.name}` }) }
function duplicate() {
  const c = duplicateAgent(props.orderId)
  if (c) { toast.notify({ variant: 'success', title: 'Agent duplicated' }); router.push(`/cowork-agents/${c.id}/edit`) }
}
function viewUsage() { activeTabIndex.value = TAB_KEYS.indexOf('usage') }

// Archive / restore
const archiveOpen = ref(false)
const archiveDesc = computed(() => scheduledCount.value
  ? `${scheduledCount.value} scheduled task${scheduledCount.value === 1 ? '' : 's'} use this agent and will be paused. You can restore it later.`
  : 'This agent will be hidden from everyone. You can restore it later.')
function doArchive() {
  const { paused } = archiveAgent(props.orderId)
  toast.notify({ variant: 'success', title: 'Agent archived', description: paused ? `${paused} scheduled task${paused === 1 ? '' : 's'} paused.` : undefined })
  router.push('/cowork-agents')
}
function doRestore() { restoreAgent(props.orderId); toast.notify({ variant: 'success', title: 'Agent restored' }) }

function doRollback(v: number) { rollbackAgent(props.orderId, v); toast.notify({ variant: 'success', title: `Rolled back to v${v}` }) }
function roleName(id: string) { return COWORK_ROLES.find((r) => r.id === id)?.name ?? id }
</script>

<template>
  <template v-if="agent">
    <header class="cad-bar">
      <div class="cad-bar__left">
        <button class="cad-crumb" type="button" @click="router.push('/cowork-agents')">Agents</button>
        <h1 class="cad-title">{{ agent.name }}</h1>
      </div>
      <div class="cad-actions">
        <MpPopover id="cad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after" type="button">
              Actions
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px' })">
            <MpPopoverList>
              <MpPopoverListItem @click="chat">Chat</MpPopoverListItem>
              <MpPopoverListItem @click="edit">Edit agent</MpPopoverListItem>
              <MpPopoverListItem @click="duplicate">Duplicate</MpPopoverListItem>
              <MpPopoverListItem @click="viewUsage">View usage</MpPopoverListItem>
              <MpPopoverListItem v-if="isArchived" @click="doRestore">Restore agent</MpPopoverListItem>
              <MpPopoverListItem v-else-if="canArchiveAgent(agent.id)" @click="archiveOpen = true">Archive agent</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpButton is-rounded variant="primary" @click="edit">Edit agent</MpButton>
      </div>
    </header>

    <div class="cad-stage">
      <div class="cad-inner">
        <MpBanner v-if="isArchived" id="cad-archived" variant="warning" class="cad-banner">
          <MpBannerIcon id="cad-archived-icon" />
          <MpBannerTitle id="cad-archived-title">This agent is archived</MpBannerTitle>
          <MpBannerDescription id="cad-archived-desc">No one can chat with it and its scheduled tasks are paused. Restore it from Actions.</MpBannerDescription>
        </MpBanner>
        <MpBanner v-if="agent.templateUpdateAvailable" id="cad-tpl" variant="info" class="cad-banner">
          <MpBannerIcon id="cad-tpl-icon" />
          <MpBannerTitle id="cad-tpl-title">Template updated — review changes</MpBannerTitle>
          <MpBannerDescription id="cad-tpl-desc">Mekari updated the template this agent is based on. Review the changes before applying — nothing changes automatically.</MpBannerDescription>
          <MpBannerLink id="cad-tpl-link"><a href="#" @click.prevent="toast.notify({ variant: 'info', title: 'Diff view — coming soon' })">Review changes</a></MpBannerLink>
        </MpBanner>

        <!-- Header -->
        <section class="cad-head">
          <img class="cad-avatar" :src="agent.avatar" :alt="agent.name" loading="lazy">
          <div class="cad-head__body">
            <div class="cad-head__titlerow">
              <h2 class="cad-name">{{ agent.name }}</h2>
              <span v-if="agent.id === 'airene'" class="cad-badge cad-badge--brand">Default</span>
              <span v-else-if="agent.type === 'curated'" class="cad-badge cad-badge--info">Curated</span>
              <span v-else class="cad-badge">Custom</span>
              <span v-if="isDraft" class="cad-badge cad-badge--warn">Draft</span>
              <span v-if="isArchived" class="cad-badge cad-badge--warn">Archived</span>
              <span v-if="hasAuto" class="cad-badge cad-badge--auto"><MpIcon name="magic" size="sm" /> Auto</span>
            </div>
            <p class="cad-role">{{ agent.role }}</p>
            <p v-if="agent.basedOn" class="cad-based"><MpIcon name="copy" size="sm" /> {{ agent.basedOn }}</p>
            <p class="cad-desc">{{ agent.description }}</p>
          </div>
        </section>

        <!-- Tabs -->
        <MpTabs id="cad-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="cad-tabs detail-tabs">
          <MpTabList>
            <MpTab id="cad-tab-overview" value="overview">Overview</MpTab>
            <MpTab id="cad-tab-knowledge" value="knowledge">Knowledge</MpTab>
            <MpTab id="cad-tab-skills" value="skills">Skills</MpTab>
            <MpTab id="cad-tab-connections" value="connections">Connections</MpTab>
            <MpTab id="cad-tab-visibility" value="visibility">Visibility</MpTab>
            <MpTab id="cad-tab-versions" value="versions">Versions</MpTab>
            <MpTab id="cad-tab-usage" value="usage">Usage</MpTab>
          </MpTabList>
          <MpTabPanels>
            <!-- Overview -->
            <MpTabPanel value="overview">
              <div class="cad-panel">
                <section class="cad-sec"><h3 class="cad-h3">Instruction</h3><p class="cad-value cad-pre">{{ instruction }}</p></section>
                <section class="cad-sec"><h3 class="cad-h3">Model</h3><p class="cad-value cad-model"><MpIcon name="airene-brand" size="sm" /> {{ modelLabel }}</p></section>
                <section class="cad-sec"><h3 class="cad-h3">Language</h3><p class="cad-value">{{ LANG_LABELS[agent.languageBehaviour ?? 'mirror'] }}</p></section>
                <section v-if="ownedTasks.length" class="cad-sec">
                  <h3 class="cad-h3">Tasks this agent runs</h3>
                  <div v-for="t in ownedTasks" :key="t.title" class="cad-task">
                    <span class="cad-task__name">{{ t.title }}</span>
                    <span class="cad-task__desc">{{ t.desc }}</span>
                  </div>
                </section>
              </div>
            </MpTabPanel>

            <!-- Knowledge -->
            <MpTabPanel value="knowledge">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Live data sources</h3>
                  <div class="cad-chips">
                    <span v-for="k in knowledgeAreas" :key="k" class="cad-chip">{{ k }}</span>
                    <span v-if="!knowledgeAreas.length" class="cad-muted">No connected apps selected.</span>
                  </div>
                </section>
                <section class="cad-sec">
                  <h3 class="cad-h3">Knowledge base ({{ knowledgeDocs.length }})</h3>
                  <div v-for="n in knowledgeDocs" :key="n!.id" class="cad-file"><MpIcon name="doc" size="sm" /> {{ n!.name }}</div>
                  <div v-for="f in agent.knowledgeFiles" :key="f.name" class="cad-file"><MpIcon name="doc" size="sm" /> {{ f.name }} <span class="cad-muted">· {{ f.size }}</span></div>
                  <p v-if="!knowledgeDocs.length && !agent.knowledgeFiles?.length" class="cad-muted">No documents attached.</p>
                </section>
              </div>
            </MpTabPanel>

            <!-- Skills -->
            <MpTabPanel value="skills">
              <div class="cad-panel">
                <section class="cad-sec">
                  <div class="cad-sec__head"><h3 class="cad-h3">Skills & approval mode</h3><button type="button" class="btn-enterprise btn-enterprise--secondary" @click="edit">Manage skills</button></div>
                  <div v-for="row in skillRows" :key="row.id" class="cad-skill">
                    <div class="cad-skill__main">
                      <p class="cad-skill__name">{{ row.name }} <span class="cad-risk" :class="`cad-risk--${row.risk.tone}`">{{ row.risk.label }}</span></p>
                      <p class="cad-skill__desc">{{ row.description }}</p>
                    </div>
                    <span class="cad-approval" :class="row.binding.approvalMode === 'auto' ? 'cad-approval--auto' : ''">
                      <ApprovalModeIcon :mode="row.binding.approvalMode" :size="14" /> {{ bindingChip(row.binding) }}
                    </span>
                  </div>
                  <p v-if="!skillRows.length" class="cad-muted">No skills enabled.</p>
                </section>
              </div>
            </MpTabPanel>

            <!-- Connections -->
            <MpTabPanel value="connections">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Connections</h3>
                  <div v-for="c in agentConnections" :key="c.id" class="cad-conn">
                    <span class="cad-conn__logo" :style="{ background: c.color || '#3a4749' }">{{ c.name.slice(0, 1) }}</span>
                    <span class="cad-conn__name">{{ c.name }}</span>
                    <span class="cad-conn__status" :class="c.connected ? 'is-ok' : 'is-off'">{{ c.connected ? 'Connected' : 'Not connected' }}</span>
                  </div>
                  <p v-if="!agentConnections.length" class="cad-muted">This agent doesn't draw on any connections.</p>
                </section>
              </div>
            </MpTabPanel>

            <!-- Visibility -->
            <MpTabPanel value="visibility">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Visibility</h3>
                  <p v-if="agent.visibilityEveryone" class="cad-value">Everyone at {{ COWORK_COMPANY }} · {{ audienceCount }} people</p>
                  <template v-else>
                    <p class="cad-muted">{{ audienceCount }} {{ audienceCount === 1 ? 'person' : 'people' }} with access</p>
                    <div v-if="visRoles.length" class="cad-chips">
                      <span v-for="r in visRoles" :key="r!.id" class="cad-chip">{{ r!.product }} · {{ r!.name }}</span>
                    </div>
                    <div v-for="e in visEmployees" :key="e!.id" class="cad-person">
                      <MpAvatar :src="e!.photo" :name="e!.fullName" size="sm" />
                      <span class="cad-person__name">{{ e!.fullName }}</span>
                      <span class="cad-person__role">{{ e!.jobPosition }}</span>
                    </div>
                    <p v-if="!visRoles.length && !visEmployees.length" class="cad-muted">Only you have access.</p>
                  </template>
                </section>
              </div>
            </MpTabPanel>

            <!-- Versions -->
            <MpTabPanel value="versions">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Version history</h3>
                  <div v-for="v in [...(agent.versions ?? [])].reverse()" :key="v.version" class="cad-version">
                    <div class="cad-version__main">
                      <p class="cad-version__title">v{{ v.version }} <span v-if="v.version === agent.version" class="cad-badge cad-badge--info">Current</span></p>
                      <p class="cad-version__meta">{{ v.changeNote || 'Published' }} · {{ v.createdBy }} · {{ v.createdAt }}</p>
                    </div>
                    <button v-if="v.version !== agent.version" type="button" class="btn-enterprise btn-enterprise--secondary" @click="doRollback(v.version)">Restore</button>
                  </div>
                  <p v-if="!(agent.versions ?? []).length" class="cad-muted">No versions yet.</p>
                </section>
              </div>
            </MpTabPanel>

            <!-- Usage -->
            <MpTabPanel value="usage">
              <div class="cad-panel">
                <section v-if="usage" class="cad-sec">
                  <h3 class="cad-h3">Usage</h3>
                  <div class="cad-usage">
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.chats7 }}</span><span class="cad-stat__l">Chats · 7d</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.chats30 }}</span><span class="cad-stat__l">Chats · 30d</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.chats90 }}</span><span class="cad-stat__l">Chats · 90d</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.tasks }}</span><span class="cad-stat__l">Tasks run</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.users }}</span><span class="cad-stat__l">Unique users</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.failureRate }}%</span><span class="cad-stat__l">Failure rate</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.avgTools }}</span><span class="cad-stat__l">Avg tool calls</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">{{ usage.autoActions }}</span><span class="cad-stat__l">Automatic actions</span></div>
                    <div class="cad-stat"><span class="cad-stat__n">${{ usage.cost }}</span><span class="cad-stat__l">Est. cost · 30d</span></div>
                  </div>
                  <p v-if="usage.autoActions" class="cad-muted cad-usage__link">
                    <a href="#" @click.prevent="toast.notify({ variant: 'info', title: 'Automatic actions feed — coming soon' })">View automatic actions feed →</a>
                  </p>
                </section>
              </div>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </div>
    </div>

    <ConfirmModal
      v-model:is-open="archiveOpen"
      title="Archive agent?"
      :description="archiveDesc"
      confirm-label="Archive agent"
      :is-danger="true"
      @confirm="doArchive"
    />
  </template>

  <div v-else class="cad-missing">
    <MpIcon name="magic" size="lg" />
    <p>Agent not found.</p>
    <MpButton is-rounded variant="secondary" @click="router.push('/cowork-agents')">Back to Agents</MpButton>
  </div>
</template>

<style scoped>
.cad-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cad-bar__left { display: flex; flex-direction: column; min-width: 0; }
.cad-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.cad-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cad-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.cad-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.cad-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); }
.cad-inner { width: 100%; }
.cad-banner { margin-bottom: var(--mp-spacing-5); max-width: 720px; }
.cad-head { display: flex; gap: var(--mp-spacing-4, 16px); align-items: flex-start; max-width: 720px; padding-bottom: var(--mp-spacing-5); }
.cad-avatar { width: 72px; height: 72px; flex-shrink: 0; object-fit: contain; background: none; border-radius: var(--mp-radii-lg, 12px); }
.cad-head__body { min-width: 0; }
.cad-head__titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.cad-name { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-role { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-based { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); display: inline-flex; align-items: center; gap: 4px; }
.cad-desc { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }

/* Badges */
.cad-badge { font-size: 11px; font-weight: 600; border-radius: var(--mp-radii-full, 999px); padding: 2px 8px; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f1f3f4); display: inline-flex; align-items: center; gap: 3px; }
.cad-badge--info { color: #165082; background: #e7f0f7; }
.cad-badge--warn { color: #b54708; background: #fdf1e6; }
.cad-badge--brand { color: #0a6e4e; background: #e7f5ef; }
.cad-badge--auto { color: #6941C6; background: #f4f0fb; }

/* Tabs */
.cad-tabs { width: 100%; margin-top: var(--mp-spacing-5, 20px); }
.detail-tabs :deep(.mp-tab--isSelected_true), .detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.cad-panel { max-width: 720px; display: flex; flex-direction: column; gap: var(--mp-spacing-8, 32px); }
.cad-sec { padding: 0; }
.cad-sec__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-3); }
.cad-sec__head .cad-h3 { margin: 0; }
.cad-h3 { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.cad-value { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.cad-pre { white-space: pre-wrap; }
.cad-model { display: inline-flex; align-items: center; gap: var(--mp-spacing-1, 6px); }
.cad-muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); }
.cad-chip { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); background: var(--mp-background-neutral-subtle, #f1f3f4); border-radius: var(--mp-radii-full, 999px); padding: 3px 10px; }
.cad-file { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); display: flex; align-items: center; gap: var(--mp-spacing-2); }

.cad-skill { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default); }
.cad-skill__main { min-width: 0; }
.cad-skill__name { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.cad-skill__desc { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }
.cad-risk { font-size: 11px; font-weight: 600; border-radius: var(--mp-radii-full, 999px); padding: 2px 8px; }
.cad-risk--neutral { color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f1f3f4); }
.cad-risk--info { color: #165082; background: #e7f0f7; }
.cad-risk--warning { color: #b54708; background: #fdf1e6; }
.cad-risk--danger { color: #b42318; background: #fbeceb; }
.cad-approval { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full, 999px); padding: 4px 12px; }
.cad-approval--auto { color: #6941C6; background: #f4f0fb; }

.cad-conn { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); }
.cad-conn__logo { width: 28px; height: 28px; flex: 0 0 auto; border-radius: var(--mp-radii-md, 6px); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
.cad-conn__name { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cad-conn__status { font-size: 12px; }
.cad-conn__status.is-ok { color: #0a6e4e; }
.cad-conn__status.is-off { color: var(--mp-text-secondary); }

.cad-person { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2, 8px) 0; }
.cad-person__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cad-person__role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-task { display: flex; flex-direction: column; padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); }
.cad-task:last-child { border-bottom: none; }
.cad-task__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-task__desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cad-version { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default); }
.cad-version__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: 600; color: var(--mp-text-default); display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.cad-version__meta { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cad-usage { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--mp-spacing-3); }
.cad-stat { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 2px; }
.cad-stat__n { font-size: var(--mp-font-sizes-xl, 20px); font-weight: 700; color: var(--mp-text-default); }
.cad-stat__l { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-usage__link { margin-top: var(--mp-spacing-4); }
.cad-usage__link a { color: var(--mp-text-link); }

.cad-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }
</style>
