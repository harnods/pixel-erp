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
import GeminiMark from '~/components/patterns/GeminiMark.vue'
import { infoToast } from '~/utils/toasts'
import {
  getAgent, COWORK_SKILLS, COWORK_COMPANY, COWORK_CATALOG, coworkConnections, COWORK_ROLES,
  SKILL_RISK_META, canArchiveAgent, archiveAgent, restoreAgent, duplicateAgent,
  tasksUsingAgent, visibilityAudienceCount, visibilityAudience, agentHasAutoAction,
  type CoworkAgent, type CoworkSkillBinding,
} from '~/data/cowork'
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

// Knowledge — live data sources are the connected Mekari products (never a raw
// module label like "Finance"). Falls back to nothing rather than a module name.
const knowledgeAreas = computed(() => {
  if (agent.value?.allWorkspace) return ['All connected apps']
  return (agent.value?.knowledgeApps ?? []).map((id) => coworkConnections.find((c) => c.id === id)?.name).filter(Boolean) as string[]
})
const knowledgeDocs = computed(() => resolveAttachments(agent.value?.knowledge ?? []))

// Skills (with binding → risk + approval mode), grouped by category (module).
interface SkillRow { id: string; name: string; description: string; category: string; risk: { label: string; tone: string }; binding: CoworkSkillBinding }
const skillRows = computed<SkillRow[]>(() => (agent.value?.skillBindings ?? []).map((b) => {
  const s = COWORK_SKILLS.find((x) => x.id === b.skillId)
  return s ? { id: s.id, name: s.name, description: s.description, category: s.module ?? 'General', risk: SKILL_RISK_META[s.riskClass ?? 'write_internal'], binding: b } : null
}).filter(Boolean) as SkillRow[])
const SKILL_GROUP_ORDER = ['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production', 'General']
const skillGroups = computed(() => {
  const map = new Map<string, SkillRow[]>()
  for (const r of skillRows.value) { if (!map.has(r.category)) map.set(r.category, []); map.get(r.category)!.push(r) }
  return SKILL_GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({ category: k, skills: map.get(k)! }))
})
function bindingChip(b: CoworkSkillBinding): string {
  if (b.approvalMode !== 'auto') return 'Ask first'
  const cap = b.autoConditions?.maxPerDay
  return cap ? `Auto · ≤ ${cap}/day` : 'Auto'
}

// Connections the agent draws on (Mekari products + skill-required connections),
// de-duped and resolved to real catalog entries only (unknown ids dropped).
const agentConnections = computed(() => {
  const ids = new Set<string>(agent.value?.knowledgeApps ?? [])
  ;(agent.value?.skillBindings ?? []).forEach((b) => {
    COWORK_SKILLS.find((s) => s.id === b.skillId)?.requiresConnections?.forEach((c) => ids.add(c))
  })
  return [...ids].map((id) => coworkConnections.find((c) => c.id === id)).filter(Boolean) as typeof coworkConnections
})
// Per-connection logo: /connectors/<id>.png with a monogram fallback on error.
const connLogoFailed = ref<Record<string, boolean>>({})
function connMonogram(name: string): string {
  return name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('').slice(0, 2)
}

// Visibility — the actual people who can use this agent (everyone / roles / users).
const visRoles = computed(() => (agent.value?.visibilityRoles ?? []).map((id) => COWORK_ROLES.find((r) => r.id === id)).filter(Boolean))
const audienceUsers = computed(() => agent.value ? visibilityAudience(agent.value) : [])
const audienceCount = computed(() => agent.value ? visibilityAudienceCount(agent.value) : 0)

// Tasks this agent runs / would pause
const ownedTasks = computed(() => COWORK_CATALOG.filter((c) => c.module === agent.value?.module))
const scheduledCount = computed(() => tasksUsingAgent(agent.value).length)

// Usage — cost only. A deterministic 28-day daily spend (Rupiah), from the agent id.
const COST_RANGE_DAYS = 28
const costSeries = computed(() => {
  const a = agent.value
  if (!a) return { bars: [] as { day: number; value: number; peak: boolean }[], total: 0, max: 0, perDay: 0 }
  let h = 0; for (const ch of a.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const bars: { day: number; value: number; peak: boolean }[] = []
  let total = 0, max = 0
  for (let i = 0; i < COST_RANGE_DAYS; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    // Mostly small daily spend, with the occasional heavy day (a big task/backfill).
    const base = 8_000 + (h % 45_000)
    const spike = (h % 17 === 0) ? 150_000 + (h % 120_000) : 0
    const v = base + spike
    bars.push({ day: i, value: v, peak: false })
    total += v; if (v > max) max = v
  }
  bars.forEach((b) => { b.peak = b.value === max })
  return { bars, total, max, perDay: Math.round(total / COST_RANGE_DAYS) }
})
function rp(n: number): string { return `Rp${Math.round(n).toLocaleString('id-ID')}` }
// Y-axis scaled to the next Rp100rb above the peak, with a gridline per Rp100rb.
const AXIS_STEP = 100_000
const axisMax = computed(() => Math.max(AXIS_STEP, Math.ceil(costSeries.value.max / AXIS_STEP) * AXIS_STEP))
const yTicks = computed(() => { const t: number[] = []; for (let v = AXIS_STEP; v <= axisMax.value; v += AXIS_STEP) t.push(v); return t })
function yLabel(v: number): string { return `Rp${(v / 1000).toLocaleString('id-ID')}rb` }
// X-axis: real calendar dates for the last 28 days, labelled every Monday.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const costDates = (() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out: Date[] = []
  for (let i = 0; i < COST_RANGE_DAYS; i++) { const d = new Date(today); d.setDate(today.getDate() - (COST_RANGE_DAYS - 1 - i)); out.push(d) }
  return out
})()
const weekTicks = costDates.map((d, i) => (d.getDay() === 1 ? { i, label: `${MONTHS[d.getMonth()]} ${d.getDate()}` } : null)).filter(Boolean) as { i: number; label: string }[]
function barDateLabel(i: number): string { const d = costDates[i]!; return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` }

const TAB_KEYS = ['overview', 'knowledge', 'skills', 'connections', 'visibility', 'usage']
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

// Archive / restore
const archiveOpen = ref(false)
const archiveDesc = computed(() => {
  const n = scheduledCount.value
  const tasks = n
    ? `${n} scheduled task${n === 1 ? '' : 's'} using this agent will be paused, and it'll be removed from the New chat picker.`
    : 'It will be hidden from everyone and removed from the New chat picker.'
  return `${tasks} Open chats stay readable but can't send new messages. Nothing is deleted — you can restore this agent anytime.`
})
function doArchive() {
  const { paused } = archiveAgent(props.orderId)
  toast.notify({ variant: 'success', title: 'Agent archived', description: paused ? `${paused} scheduled task${paused === 1 ? '' : 's'} paused.` : undefined })
  router.push('/cowork-agents')
}
function doRestore() { restoreAgent(props.orderId); toast.notify({ variant: 'success', title: 'Agent restored' }) }

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
            <MpButton is-rounded variant="primary" right-icon="chevrons-down">Actions</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px' })">
            <MpPopoverList>
              <MpPopoverListItem @click="edit">Edit agent</MpPopoverListItem>
              <MpPopoverListItem @click="chat">Chat</MpPopoverListItem>
              <MpPopoverListItem @click="duplicate">Duplicate</MpPopoverListItem>
              <MpPopoverListItem v-if="isArchived" @click="doRestore">Restore agent</MpPopoverListItem>
              <MpPopoverListItem v-else-if="canArchiveAgent(agent.id)" @click="archiveOpen = true">Archive agent</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
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
          <MpBannerLink id="cad-tpl-link"><a href="#" @click.prevent="infoToast('Diff view — coming soon')">Review changes</a></MpBannerLink>
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
            <MpTab id="cad-tab-usage" value="usage">Usage</MpTab>
          </MpTabList>
          <MpTabPanels>
            <!-- Overview -->
            <MpTabPanel value="overview">
              <div class="cad-panel">
                <section class="cad-sec"><h3 class="cad-h3">Instruction</h3><p class="cad-value cad-pre">{{ instruction }}</p></section>
                <section class="cad-sec"><h3 class="cad-h3">Model</h3><p class="cad-value cad-model"><GeminiMark :size="16" /> {{ modelLabel }}</p></section>
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

            <!-- Skills (grouped by category) -->
            <MpTabPanel value="skills">
              <div class="cad-panel">
                <section v-for="g in skillGroups" :key="g.category" class="cad-sec">
                  <h3 class="cad-h3">{{ g.category }}</h3>
                  <div v-for="row in g.skills" :key="row.id" class="cad-skill">
                    <div class="cad-skill__main">
                      <p class="cad-skill__name">{{ row.name }} <span class="cad-risk" :class="`cad-risk--${row.risk.tone}`">{{ row.risk.label }}</span></p>
                      <p class="cad-skill__desc">{{ row.description }}</p>
                    </div>
                    <span class="cad-approval" :class="row.binding.approvalMode === 'auto' ? 'cad-approval--auto' : ''">{{ bindingChip(row.binding) }}</span>
                  </div>
                </section>
                <p v-if="!skillRows.length" class="cad-muted">No skills enabled.</p>
              </div>
            </MpTabPanel>

            <!-- Connections -->
            <MpTabPanel value="connections">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Connections</h3>
                  <div v-for="c in agentConnections" :key="c.id" class="cad-conn">
                    <img v-if="!connLogoFailed[c.id]" class="cad-conn__logo-img" :src="c.logo || `/connectors/${c.id}.png`" :alt="c.name" loading="lazy" @error="connLogoFailed[c.id] = true">
                    <span v-else class="cad-conn__logo" :style="{ background: c.color || '#3a4749' }">{{ connMonogram(c.name) }}</span>
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
                  <h3 class="cad-h3">Who can use this agent</h3>
                  <p class="cad-vis-scope">
                    <template v-if="agent.visibilityEveryone">Everyone at {{ COWORK_COMPANY }}</template>
                    <template v-else-if="visRoles.length">{{ visRoles.map((r) => `${r!.product} · ${r!.name}`).join(', ') }}</template>
                    <template v-else>Specific users</template>
                    · {{ audienceCount }} {{ audienceCount === 1 ? 'person' : 'people' }}
                  </p>
                  <div class="cad-aud-list">
                    <div v-for="e in audienceUsers" :key="e.id" class="cad-aud-row">
                      <MpAvatar :src="e.photo" :name="e.fullName" size="lg" />
                      <div class="cad-aud-info">
                        <span class="cad-aud-name">{{ e.fullName }}</span>
                        <span class="cad-aud-sub">{{ [e.employeeId, e.jobPosition, e.department].filter(Boolean).join(' · ') }}</span>
                      </div>
                    </div>
                  </div>
                  <p v-if="!audienceUsers.length" class="cad-muted">Only you have access.</p>
                </section>
              </div>
            </MpTabPanel>

            <!-- Usage — cost only -->
            <MpTabPanel value="usage">
              <div class="cad-panel cad-panel--full">
                <section class="cad-cost">
                  <header class="cad-cost__head">
                    <div>
                      <p class="cad-cost__title">Total cost</p>
                      <p class="cad-cost__sub">Model &amp; tool usage · last {{ COST_RANGE_DAYS }} days</p>
                    </div>
                  </header>
                  <div class="cad-cost__figures">
                    <div class="cad-cost__fig"><span class="cad-cost__flabel">Total cost</span><span class="cad-cost__fvalue">{{ rp(costSeries.total) }}</span></div>
                    <span class="cad-cost__op">·</span>
                    <div class="cad-cost__fig"><span class="cad-cost__flabel">Avg / day</span><span class="cad-cost__fvalue cad-cost__fvalue--muted">{{ rp(costSeries.perDay) }}</span></div>
                  </div>
                  <div class="cad-chart" role="img" :aria-label="`Daily cost over the last ${COST_RANGE_DAYS} days, total ${rp(costSeries.total)}`">
                    <div class="cad-chart__plot">
                      <div v-for="t in yTicks" :key="t" class="cad-chart__grid" :style="{ bottom: `${(t / axisMax) * 100}%` }">
                        <span class="cad-chart__ytick">{{ yLabel(t) }}</span>
                      </div>
                      <div class="cad-chart__bars">
                        <div v-for="bar in costSeries.bars" :key="bar.day" class="cad-chart__col">
                          <span class="cad-chart__tip" :class="{ 'is-edge-l': bar.day <= 1, 'is-edge-r': bar.day >= COST_RANGE_DAYS - 2 }">
                            <span class="cad-chart__tip-cost">{{ rp(bar.value) }}</span>
                            <span class="cad-chart__tip-day">{{ barDateLabel(bar.day) }}</span>
                          </span>
                          <div class="cad-chart__bar" :class="{ 'is-peak': bar.peak }" :style="{ height: `${Math.max(1, (bar.value / axisMax) * 100)}%` }" />
                        </div>
                      </div>
                    </div>
                    <div class="cad-chart__xaxis">
                      <span v-for="tk in weekTicks" :key="tk.i" class="cad-chart__xtick" :style="{ left: `${((tk.i + 0.5) / COST_RANGE_DAYS) * 100}%` }">{{ tk.label }}</span>
                    </div>
                  </div>
                  <p class="cad-cost__note">Cost is estimated from model tokens and tool calls, and may take up to 24 hours to update.</p>
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
.cad-conn__logo-img { width: 28px; height: 28px; flex: 0 0 auto; border-radius: var(--mp-radii-md, 6px); object-fit: contain; background: #fff; }
.cad-conn__logo { width: 28px; height: 28px; flex: 0 0 auto; border-radius: var(--mp-radii-md, 6px); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
.cad-conn__name { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cad-conn__status { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular, 400); }
.cad-conn__status.is-ok { color: #0a6e4e; }
.cad-conn__status.is-off { color: var(--mp-text-secondary); }

.cad-person { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2, 8px) 0; }
.cad-person__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cad-person__role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-task { display: flex; flex-direction: column; padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); }
.cad-task:last-child { border-bottom: none; }
.cad-task__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-task__desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Visibility */
.cad-vis-scope { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-secondary); }
.cad-aud-list { display: flex; flex-direction: column; }
.cad-aud-row { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2, 8px) 0; }
.cad-aud-row + .cad-aud-row { border-top: 1px solid var(--mp-border-default); }
.cad-aud-info { display: flex; flex-direction: column; min-width: 0; }
.cad-aud-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cad-aud-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Usage — cost figures + bar chart (full width, no box) */
.cad-panel--full { max-width: none; }
.cad-cost { padding: 0; }
.cad-cost__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.cad-cost__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-cost__sub { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-cost__figures { display: flex; align-items: baseline; gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-4); }
.cad-cost__fig { display: flex; flex-direction: column; gap: 2px; }
.cad-cost__flabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-cost__fvalue { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cad-cost__fvalue--muted { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-secondary); }
.cad-cost__op { align-self: center; color: var(--mp-text-secondary); }
.cad-chart { margin-top: var(--mp-spacing-5); }
/* Plot area: gridlines (per Rp100rb) behind the bars, y-axis labels on the right. */
.cad-chart__plot { position: relative; height: 220px; padding-right: 52px; border-bottom: 1px solid var(--mp-border-bold, #8c9596); }
.cad-chart__grid { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--mp-border-subtle, #eef1f2); pointer-events: none; }
.cad-chart__ytick { position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--mp-text-secondary); white-space: nowrap; }
.cad-chart__bars { position: relative; height: 100%; display: flex; align-items: flex-end; gap: 4px; }
.cad-chart__col { position: relative; flex: 1 1 0; display: flex; align-items: flex-end; justify-content: center; height: 100%; }
.cad-chart__bar { width: 100%; max-width: 22px; border-radius: 4px 4px 0 0; background: var(--mp-background-brand-bold, #029861); transition: height 240ms ease; }
.cad-chart__bar.is-peak { background: #6941C6; }
.cad-chart__col:hover .cad-chart__bar { filter: brightness(0.92); }
/* Hover popover with the day's cost */
.cad-chart__tip { position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 1px; padding: 6px 10px; border-radius: 8px; background: #1c2b2d; color: #fff; white-space: nowrap; text-align: center; opacity: 0; pointer-events: none; transition: opacity 120ms ease; z-index: 6; box-shadow: 0 6px 16px rgba(0,0,0,0.22); }
.cad-chart__tip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: #1c2b2d; }
.cad-chart__tip.is-edge-l { left: 0; transform: none; }
.cad-chart__tip.is-edge-l::after { left: 12px; transform: none; }
.cad-chart__tip.is-edge-r { left: auto; right: 0; transform: none; }
.cad-chart__tip.is-edge-r::after { left: auto; right: 12px; transform: none; }
.cad-chart__col:hover .cad-chart__tip { opacity: 1; }
.cad-chart__tip-cost { font-size: 12px; font-weight: 600; }
.cad-chart__tip-day { font-size: 11px; color: rgba(255,255,255,0.72); }
.cad-chart__xaxis { position: relative; height: 16px; margin-top: var(--mp-spacing-2); padding-right: 52px; }
.cad-chart__xtick { position: absolute; top: 0; transform: translateX(-50%); font-size: 11px; color: var(--mp-text-secondary); white-space: nowrap; }
.cad-cost__note { margin: var(--mp-spacing-4) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cad-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }
</style>
