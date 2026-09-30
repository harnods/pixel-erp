<script setup lang="ts">
/**
 * Cowork — Workspace detail (Module 07). Owns its title bar + stage. Header:
 * name, member avatars, Compile (secondary), New thread (primary). Tabs: Threads,
 * Decisions, Tasks, Files & artifacts, Agents & members, Activity.
 *
 * "Viewing as" the workspace owner for the demo, so Threads splits into Mine
 * (my threads) and Shared by team (workspace-visible threads owned by others).
 * Private threads owned by others are never listed (WS-03). Compile is a stub
 * (Phase 2 builds the 3-step flow).
 */
import { ref, computed } from 'vue'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpBadge, MpIcon, MpButton, MpAvatar, toast,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import {
  getWorkspace, workspaceAgents, memberOf, memberInitials, memberColor,
  type WorkspaceThread, type WorkspaceDecision, type DecisionTag,
} from '~/data/coworkWorkspaces'
import { coworkAgents, coworkTasks } from '~/data/cowork'
import WorkspaceCompileModal from '~/components/patterns/WorkspaceCompileModal.vue'
import type { WorkspaceFile } from '~/data/coworkWorkspaces'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const ws = computed(() => getWorkspace(props.orderId))
const currentUserId = computed(() => ws.value?.ownerUserId ?? 'EMP-0001')
const tab = ref(0)

const agents = computed(() => (ws.value ? workspaceAgents(ws.value) : []))
function agentOf(id: string) { return coworkAgents.find((a) => a.id === id) }
function memberName(userId: string): string { return ws.value ? (memberOf(ws.value, userId)?.name ?? 'Unknown') : 'Unknown' }

const mineThreads = computed<WorkspaceThread[]>(() => (ws.value?.threads ?? []).filter((t) => t.ownerUserId === currentUserId.value))
const sharedThreads = computed<WorkspaceThread[]>(() => (ws.value?.threads ?? []).filter((t) => t.ownerUserId !== currentUserId.value && t.visibility === 'workspace'))

const wsTasks = computed(() => (ws.value?.taskIds ?? []).map((id) => coworkTasks.find((t) => t.id === id)).filter(Boolean))

const TAG_TYPE: Record<DecisionTag, 'completed' | 'warning' | 'critical' | 'information'> = {
  'Decision': 'completed', 'Action item': 'information', 'Risk': 'critical', 'Question': 'warning',
}
const ACT_ICON: Record<string, string> = { thread: 'chat', decision: 'check', file: 'doc', artifact: 'magic', task: 'time' }

function tagTotal(t: WorkspaceThread): number { return t.tagCounts.decision + t.tagCounts.action + t.tagCounts.risk + t.tagCounts.question }
function fmt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ',')
}

const compileOpen = ref(false)
function compile() { compileOpen.value = true }
function onCompiled(f: WorkspaceFile) {
  toast.notify({ variant: 'success', title: `“${f.name}” saved to the workspace`, maxWidth: 'max-content' })
  tab.value = 3 // jump to Files & artifacts so the new artifact is visible
}
// Open a thread → the workspace chat composer, with this thread's agent pre-picked.
function threadTo(t: WorkspaceThread) {
  router.push({ path: '/cowork-chats', query: { workspace: props.orderId, agent: t.agentId, thread: t.title } })
}
// New thread → pick a workspace agent, then start a fresh chat scoped to the workspace.
function startThread(agentId: string) {
  router.push({ path: '/cowork-chats', query: { workspace: props.orderId, agent: agentId } })
}
</script>

<template>
  <template v-if="ws">
    <header class="wd-bar">
      <div class="wd-bar__left">
        <button class="wd-crumb" type="button" @click="router.push('/cowork-workspaces')">Workspaces</button>
        <div class="wd-title-row">
          <h1 class="wd-title">{{ ws.name }}</h1>
          <span class="wd-avatars">
            <span
              v-for="(m, i) in ws.members.slice(0, 5)" :key="m.userId"
              class="wd-av" :style="{ background: memberColor(m.userId), zIndex: String(10 - i) }"
              :title="`${m.name} · ${m.title}`"
            >{{ memberInitials(m.name) }}</span>
            <span v-if="ws.members.length > 5" class="wd-av wd-av--more">+{{ ws.members.length - 5 }}</span>
          </span>
        </div>
        <p class="wd-desc">{{ ws.description }}</p>
      </div>
      <div class="wd-bar__actions">
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="compile">
          <MpIcon name="magic" size="sm" /> Compile
        </button>
        <MpPopover id="wd-new-thread" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" type="button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              New thread
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '220px' })">
            <MpPopoverList>
              <p class="wd-menu-hint">Chat with a workspace agent</p>
              <MpPopoverListItem v-for="a in agents" :key="a.id" @click.stop="startThread(a.id)">
                <span class="wd-menu-agent"><MpAvatar :src="a.avatar" :name="a.name" size="sm" /> {{ a.name }}</span>
              </MpPopoverListItem>
              <p v-if="!agents.length" class="wd-menu-hint">No agents in this workspace yet.</p>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="wd-stage">
      <MpTabs id="wd-tabs" v-model="tab" is-manual :has-margin-bottom="false">
        <MpTabList>
          <MpTab>Threads</MpTab>
          <MpTab>Decisions</MpTab>
          <MpTab>Tasks</MpTab>
          <MpTab>Files &amp; artifacts</MpTab>
          <MpTab>Agents &amp; members</MpTab>
          <MpTab>Activity</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ── Threads ── -->
          <MpTabPanel>
            <div class="wd-panel">
              <section class="wd-sec">
                <h2 class="wd-sec__title">Mine</h2>
                <div v-if="mineThreads.length" class="wd-threads">
                  <button v-for="t in mineThreads" :key="t.id" class="wd-thread" type="button" @click="threadTo(t)">
                    <MpIcon :name="t.visibility === 'private' ? 'security' : 'people'" size="sm" class="wd-thread__vis" />
                    <div class="wd-thread__main">
                      <span class="wd-thread__title">{{ t.title }}</span>
                      <span class="wd-thread__sub">{{ agentOf(t.agentId)?.name ?? t.agentId }} · {{ t.messageCount }} messages · {{ fmt(t.lastActivityAt) }}</span>
                    </div>
                    <span v-if="tagTotal(t)" class="wd-thread__tags">{{ tagTotal(t) }} tagged</span>
                  </button>
                </div>
                <p v-else class="wd-empty-line">No threads of your own yet — start one with “New thread”.</p>
              </section>

              <section class="wd-sec">
                <h2 class="wd-sec__title">Shared by team</h2>
                <div v-if="sharedThreads.length" class="wd-threads">
                  <button v-for="t in sharedThreads" :key="t.id" class="wd-thread" type="button" @click="threadTo(t)">
                    <span class="wd-av wd-av--sm" :style="{ background: memberColor(t.ownerUserId) }">{{ memberInitials(memberName(t.ownerUserId)) }}</span>
                    <div class="wd-thread__main">
                      <span class="wd-thread__title">{{ t.title }}</span>
                      <span class="wd-thread__sub">{{ memberName(t.ownerUserId) }} · {{ agentOf(t.agentId)?.name ?? t.agentId }} · {{ fmt(t.lastActivityAt) }}</span>
                    </div>
                    <span v-if="tagTotal(t)" class="wd-thread__tags">{{ tagTotal(t) }} tagged</span>
                  </button>
                </div>
                <p v-else class="wd-empty-line">Nothing shared by the team yet.</p>
              </section>
            </div>
          </MpTabPanel>

          <!-- ── Decisions ── -->
          <MpTabPanel>
            <div class="wd-panel">
              <div v-if="ws.decisions.length" class="wd-decisions">
                <div v-for="d in ws.decisions" :key="d.id" class="wd-decision">
                  <MpBadge for="tableStatus" :type="TAG_TYPE[d.tag]" size="sm">{{ d.tag }}</MpBadge>
                  <div class="wd-decision__main">
                    <p class="wd-decision__quote">“{{ d.quote }}”</p>
                    <span class="wd-decision__sub">{{ memberName(d.authorUserId) }} · {{ (ws.threads.find(t => t.id === d.threadId)?.title) ?? 'thread' }} · {{ fmt(d.createdAt) }}</span>
                  </div>
                </div>
              </div>
              <p v-else class="wd-empty-line">No decisions tagged yet — tag a message as Decision / Action item / Risk / Question in any thread.</p>
            </div>
          </MpTabPanel>

          <!-- ── Tasks ── -->
          <MpTabPanel>
            <div class="wd-panel">
              <div v-if="wsTasks.length" class="wd-rows">
                <button v-for="t in wsTasks" :key="t!.id" class="wd-row" type="button" @click="router.push(`/cowork-tasks/${t!.id}`)">
                  <MpIcon name="time" size="sm" />
                  <span class="wd-row__title">{{ t!.title }}</span>
                  <MpBadge for="tableStatus" type="announcement" size="sm">{{ t!.module }}</MpBadge>
                  <span class="wd-row__muted">{{ t!.status }}</span>
                </button>
              </div>
              <p v-else class="wd-empty-line">No workspace tasks yet — recurring reports for this project will live here.</p>
            </div>
          </MpTabPanel>

          <!-- ── Files & artifacts ── -->
          <MpTabPanel>
            <div class="wd-panel">
              <div class="wd-files-head">
                <span class="wd-files-path"><MpIcon name="folder-close" size="sm" /> Workspaces / {{ ws.name }}</span>
                <button class="wd-link" type="button" @click="router.push('/cowork-knowledge')">Open in File manager</button>
              </div>
              <div v-if="ws.files.length" class="wd-rows">
                <div v-for="f in ws.files" :key="f.id" class="wd-row wd-row--static">
                  <MpIcon :name="f.kind === 'artifact' ? 'magic' : 'doc'" size="sm" />
                  <span class="wd-row__title">{{ f.name }}</span>
                  <MpBadge v-if="f.kind === 'artifact'" for="tableStatus" type="information" size="sm">Artifact</MpBadge>
                  <MpBadge v-else for="tableStatus" type="announcement" size="sm">{{ f.origin }}</MpBadge>
                  <span class="wd-row__muted">{{ f.provenance ? f.provenance : (f.size ?? '') }} · {{ fmt(f.updatedAt) }}</span>
                </div>
              </div>
              <p v-else class="wd-empty-line">No files yet — upload project files or attach from the library.</p>
            </div>
          </MpTabPanel>

          <!-- ── Agents & members ── -->
          <MpTabPanel>
            <div class="wd-panel wd-panel--split">
              <section class="wd-sec">
                <h2 class="wd-sec__title">Agents</h2>
                <div class="wd-rows">
                  <div v-for="a in agents" :key="a.id" class="wd-row wd-row--static">
                    <MpAvatar :src="a.avatar" :name="a.name" size="sm" />
                    <span class="wd-row__title">{{ a.name }}</span>
                    <span class="wd-row__muted">{{ a.role }}</span>
                  </div>
                  <p v-if="!agents.length" class="wd-empty-line">No agents added yet.</p>
                </div>
              </section>
              <section class="wd-sec">
                <h2 class="wd-sec__title">Members</h2>
                <div class="wd-rows">
                  <div v-for="m in ws.members" :key="m.userId" class="wd-row wd-row--static">
                    <span class="wd-av wd-av--sm" :style="{ background: memberColor(m.userId) }">{{ memberInitials(m.name) }}</span>
                    <div class="wd-member">
                      <span class="wd-row__title">{{ m.name }}</span>
                      <span class="wd-row__muted">{{ m.title }}</span>
                    </div>
                    <MpBadge for="tableStatus" :type="m.role === 'owner' ? 'completed' : 'announcement'" size="sm">{{ m.role }}</MpBadge>
                  </div>
                </div>
              </section>
            </div>
          </MpTabPanel>

          <!-- ── Activity ── -->
          <MpTabPanel>
            <div class="wd-panel">
              <div v-if="ws.activity.length" class="wd-feed">
                <div v-for="a in ws.activity" :key="a.id" class="wd-feed__item">
                  <span class="wd-feed__dot"><MpIcon :name="ACT_ICON[a.kind] ?? 'time'" size="sm" /></span>
                  <div class="wd-feed__main">
                    <p class="wd-feed__text"><b>{{ a.actorUserId ? memberName(a.actorUserId) : 'Someone' }}</b> {{ a.text }}</p>
                    <span class="wd-feed__time">{{ fmt(a.at) }}</span>
                  </div>
                </div>
              </div>
              <p v-else class="wd-empty-line">No activity yet.</p>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>

    <WorkspaceCompileModal v-model:open="compileOpen" :workspace="ws" :current-user-id="currentUserId" @saved="onCompiled" />
  </template>

  <div v-else class="wd-missing">
    <MpIcon name="folder-close" size="md" class="wd-missing__icon" />
    <p>Workspace not found.</p>
    <MpButton is-rounded variant="secondary" @click="router.push('/cowork-workspaces')">Back to Workspaces</MpButton>
  </div>
</template>

<style scoped>
.wd-bar { flex-shrink: 0; box-sizing: border-box; background: var(--mp-colors-background-neutral-subtle, #f7f8f8); padding: var(--mp-spacing-4, 16px) var(--mp-spacing-6, 24px); display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4, 16px); }
.wd-bar__left { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.wd-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-colors-text-link, #387ceb); }
.wd-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.wd-title-row { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); }
.wd-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: 600; line-height: 32px; color: var(--mp-colors-text-default, #1d1f24); }
.wd-desc { margin: 0; font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-secondary, #536062); max-width: 640px; }
.wd-avatars { display: inline-flex; }
.wd-av { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-left: -6px; border-radius: 999px; border: 2px solid var(--mp-colors-background-neutral-subtle, #f7f8f8); color: #fff; font-size: 10px; font-weight: 600; }
.wd-av:first-child { margin-left: 0; }
.wd-av--more { background: var(--mp-colors-neutral-200, #e3e7e9); color: var(--mp-colors-text-secondary, #536062); }
.wd-av--sm { width: 24px; height: 24px; margin: 0; border: none; flex-shrink: 0; }
.wd-bar__actions { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); flex-shrink: 0; }

.wd-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--mp-colors-background-stage, #fff); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow: hidden; }
.wd-stage :deep(.mp-tab-list) { padding-inline: var(--mp-spacing-6, 24px); flex-shrink: 0; }
.wd-panel { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-6, 24px); }
.wd-panel--split { flex-direction: row; gap: var(--mp-spacing-8, 32px); flex-wrap: wrap; }
.wd-panel--split .wd-sec { flex: 1; min-width: 280px; }

.wd-sec { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }
.wd-sec__title { margin: 0 0 4px; font-size: var(--mp-font-sizes-sm, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--mp-colors-text-secondary, #536062); }

.wd-threads { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.wd-thread { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); width: 100%; text-align: left; padding: var(--mp-spacing-3, 12px); border: 1px solid var(--mp-colors-border-default, #dcdfe4); border-radius: var(--mp-radii-md, 8px); background: var(--mp-colors-background-default, #fff); cursor: pointer; font-family: inherit; }
.wd-thread:hover { border-color: var(--mp-colors-border-bold, #8c9596); background: var(--mp-colors-background-neutral-subtle, #f7f8f8); }
.wd-thread__vis { color: var(--mp-colors-icon-subtle, #97a0af); flex-shrink: 0; }
.wd-thread__main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.wd-thread__title { font-size: var(--mp-font-sizes-md, 14px); font-weight: 500; color: var(--mp-colors-text-default, #1d1f24); }
.wd-thread__sub { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }
.wd-thread__tags { flex-shrink: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }

.wd-decisions { display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }
.wd-decision { display: flex; align-items: flex-start; gap: var(--mp-spacing-3, 12px); padding: var(--mp-spacing-3, 12px); border: 1px solid var(--mp-colors-border-default, #dcdfe4); border-radius: var(--mp-radii-md, 8px); }
.wd-decision__main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.wd-decision__quote { margin: 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #1d1f24); }
.wd-decision__sub { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }

.wd-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.wd-row { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); width: 100%; text-align: left; padding: var(--mp-spacing-3, 12px); border: 1px solid var(--mp-colors-border-default, #dcdfe4); border-radius: var(--mp-radii-md, 8px); background: var(--mp-colors-background-default, #fff); font-family: inherit; }
button.wd-row { cursor: pointer; }
button.wd-row:hover { border-color: var(--mp-colors-border-bold, #8c9596); background: var(--mp-colors-background-neutral-subtle, #f7f8f8); }
.wd-row__title { font-size: var(--mp-font-sizes-md, 14px); font-weight: 500; color: var(--mp-colors-text-default, #1d1f24); }
.wd-row__muted { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); margin-left: auto; text-align: right; }
.wd-row :deep(svg) { color: var(--mp-colors-icon-default, #536062); flex-shrink: 0; }
.wd-member { display: flex; flex-direction: column; gap: 2px; }
.wd-member .wd-row__muted { margin-left: 0; text-align: left; }

.wd-files-head { display: flex; align-items: center; justify-content: space-between; }
.wd-files-path { display: inline-flex; align-items: center; gap: 6px; font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-secondary, #536062); }
.wd-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-link, #387ceb); }
.wd-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.wd-feed { display: flex; flex-direction: column; }
.wd-feed__item { display: flex; gap: var(--mp-spacing-3, 12px); padding-bottom: var(--mp-spacing-4, 16px); position: relative; }
.wd-feed__item:not(:last-child)::before { content: ''; position: absolute; left: 13px; top: 28px; bottom: 0; width: 1px; background: var(--mp-colors-border-default, #dcdfe4); }
.wd-feed__dot { flex-shrink: 0; width: 28px; height: 28px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: var(--mp-colors-background-neutral-subtle, #f0f1f3); }
.wd-feed__dot :deep(svg) { color: var(--mp-colors-icon-default, #536062); }
.wd-feed__main { display: flex; flex-direction: column; gap: 2px; padding-top: 4px; }
.wd-feed__text { margin: 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #1d1f24); }
.wd-feed__time { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-placeholder, #97a0af); }

.wd-empty-line { font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-secondary, #536062); padding: var(--mp-spacing-2, 8px) 0; }

.wd-menu-hint { padding: 6px 12px 4px; margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--mp-colors-text-placeholder, #97a0af); }
.wd-menu-agent { display: inline-flex; align-items: center; gap: 8px; }

.wd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3, 12px); padding: var(--mp-spacing-20, 80px); color: var(--mp-colors-text-secondary, #536062); }
.wd-missing__icon { width: 40px !important; height: 40px !important; color: var(--mp-colors-icon-subtle, #97a0af); }
</style>
