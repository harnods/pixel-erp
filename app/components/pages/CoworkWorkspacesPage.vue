<script setup lang="ts">
/**
 * Cowork — Workspaces index (Module 07). A list of shared project spaces. Each
 * card shows members, agents and recent activity; click opens the workspace.
 * "New workspace" (title-bar button → ?new=1) opens a small create modal.
 */
import { ref, computed } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpButton, MpButtonGroup, MpIcon, MpFormControl, MpFormLabel, toast,
} from '@mekari/pixel3'
import {
  coworkWorkspaces, addWorkspace, workspaceAgents, memberInitials, memberColor,
  type ThreadVisibility,
} from '~/data/coworkWorkspaces'

const router = useRouter()
const route = useRoute()

const workspaces = computed(() => coworkWorkspaces.filter((w) => w.status === 'active'))

function open(id: string) { router.push(`/cowork-workspaces/${id}`) }

function lastActivity(w: (typeof coworkWorkspaces)[number]): string {
  const times = [...w.threads.map((t) => t.lastActivityAt), ...w.activity.map((a) => a.at)]
  if (!times.length) return '—'
  const latest = times.sort().at(-1)!
  return new Date(latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Create modal ──────────────────────────────────────────────────────────────
const createOpen = ref(false)
const draftName = ref('')
const draftDesc = ref('')
const draftVisibility = ref<ThreadVisibility>('private')
const createError = ref('')

function openCreate() { draftName.value = ''; draftDesc.value = ''; draftVisibility.value = 'private'; createError.value = ''; createOpen.value = true }
function closeCreate() { createOpen.value = false }
function submitCreate() {
  if (!draftName.value.trim()) { createError.value = 'Give the workspace a name.'; return }
  const ws = addWorkspace({
    name: draftName.value.trim(),
    description: draftDesc.value.trim(),
    ownerUserId: 'EMP-0001',
    status: 'active',
    defaultThreadVisibility: draftVisibility.value,
    createdAt: new Date().toISOString(),
    members: [{ userId: 'EMP-0001', name: 'Rizal Candra', title: 'Owner', role: 'owner' }],
    agentIds: [],
    threads: [],
    decisions: [],
    taskIds: [],
    files: [],
    activity: [],
  })
  createOpen.value = false
  toast.notify({ variant: 'success', title: `“${ws.name}” created`, maxWidth: 'max-content' })
  router.push(`/cowork-workspaces/${ws.id}`)
}

// Title-bar "New workspace" routes here with ?new=1.
watchEffect(() => { if (route.query.new === '1') { openCreate(); router.replace({ path: '/cowork-workspaces', query: {} }) } })
</script>

<template>
  <div class="ws-index">
    <!-- Cards -->
    <div v-if="workspaces.length" class="ws-grid">
      <div v-for="w in workspaces" :key="w.id" class="ws-card" role="button" tabindex="0" @click="open(w.id)" @keydown.enter="open(w.id)">
        <div class="ws-card__head">
          <span class="ws-card__name">{{ w.name }}</span>
          <span class="ws-card__avatars">
            <span
              v-for="(m, i) in w.members.slice(0, 4)" :key="m.userId"
              class="ws-av" :style="{ background: memberColor(m.userId), zIndex: String(10 - i) }"
              :title="`${m.name} · ${m.title}`"
            >{{ memberInitials(m.name) }}</span>
            <span v-if="w.members.length > 4" class="ws-av ws-av--more">+{{ w.members.length - 4 }}</span>
          </span>
        </div>
        <p class="ws-card__desc">{{ w.description }}</p>
        <div class="ws-card__meta">
          <span class="ws-meta"><MpIcon name="people" size="sm" />{{ w.members.length }} members</span>
          <span class="ws-meta"><MpIcon name="magic" size="sm" />{{ workspaceAgents(w).length }} agents</span>
          <span class="ws-meta"><MpIcon name="chat" size="sm" />{{ w.threads.length }} threads</span>
          <span class="ws-meta"><MpIcon name="check" size="sm" />{{ w.decisions.length }} decisions</span>
          <span class="ws-meta ws-meta--muted">Active {{ lastActivity(w) }}</span>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="ws-empty">
      <MpIcon name="folder-close" size="md" class="ws-empty__icon" />
      <p class="ws-empty__title">No workspaces yet</p>
      <p class="ws-empty__caption">A workspace is a shared space for a project — members, agents, threads and files in one place.</p>
      <MpButton is-rounded variant="secondary" @click="openCreate">New workspace</MpButton>
    </div>

    <!-- Create modal -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="ws-create" :is-open="createOpen" size="md" :is-keep-alive="false" @close="closeCreate">
      <MpModalContent>
        <MpModalHeader>New workspace<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <div class="ws-form">
            <MpFormControl id="ws-name-fc">
              <MpFormLabel>Name</MpFormLabel>
              <input v-model="draftName" class="ws-input" type="text" placeholder="e.g. Q4 production ramp-up" @keydown.enter.prevent="submitCreate">
            </MpFormControl>
            <MpFormControl id="ws-desc-fc">
              <MpFormLabel>Description</MpFormLabel>
              <textarea v-model="draftDesc" class="ws-input ws-input--area" rows="2" placeholder="What is this project about?"></textarea>
            </MpFormControl>
            <div class="ws-field">
              <span class="ws-field__label">Default thread visibility</span>
              <div class="ws-radios">
                <label class="ws-radio"><input v-model="draftVisibility" type="radio" value="private"><span><b>Private</b> — only you until shared</span></label>
                <label class="ws-radio"><input v-model="draftVisibility" type="radio" value="workspace"><span><b>Workspace</b> — all members can read</span></label>
              </div>
            </div>
            <p v-if="createError" class="ws-form__error">{{ createError }}</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="closeCreate">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="submitCreate">Create workspace</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
    </MpModal>
  </div>
</template>

<style scoped>
.ws-index { padding: 0; }
.ws-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--mp-spacing-4, 16px); }
.ws-card { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-4, 16px); border: 1px solid var(--mp-colors-border-default, #dcdfe4); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-colors-background-default, #fff); cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
.ws-card:hover { border-color: var(--mp-colors-border-bold, #8c9596); background: var(--mp-colors-background-neutral-subtle, #f7f8f8); }
.ws-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3, 12px); }
.ws-card__name { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #1d1f24); }
.ws-card__avatars { display: inline-flex; flex-shrink: 0; }
.ws-av { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; margin-left: -6px; border-radius: 999px; border: 2px solid var(--mp-colors-background-default, #fff); color: #fff; font-size: 10px; font-weight: 600; }
.ws-av:first-child { margin-left: 0; }
.ws-av--more { background: var(--mp-colors-neutral-200, #e3e7e9); color: var(--mp-colors-text-secondary, #536062); }
.ws-card__desc { font-size: var(--mp-font-sizes-sm, 13px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-colors-text-secondary, #536062); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ws-card__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-3, 12px); margin-top: auto; padding-top: var(--mp-spacing-2, 8px); }
.ws-meta { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }
.ws-meta :deep(svg) { color: var(--mp-colors-icon-default, #536062); }
.ws-meta--muted { margin-left: auto; color: var(--mp-colors-text-placeholder, #97a0af); }

.ws-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-20, 80px) var(--mp-spacing-6, 24px); text-align: center; }
.ws-empty__icon { width: 40px !important; height: 40px !important; color: var(--mp-colors-icon-subtle, #97a0af); }
.ws-empty__title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: 600; color: var(--mp-colors-text-default, #1d1f24); margin-top: var(--mp-spacing-2, 8px); }
.ws-empty__caption { max-width: 420px; font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-secondary, #536062); margin-bottom: var(--mp-spacing-3, 12px); }

.ws-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4, 16px); }
.ws-input { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px); border: 1px solid var(--mp-colors-border-form, rgba(29,31,36,.16)); border-radius: var(--mp-radii-md, 6px); font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #1d1f24); outline: none; }
.ws-input:focus { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: 0 0 0 2px var(--mp-colors-border-bold, #8c9596); }
.ws-input--area { resize: vertical; }
.ws-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }
.ws-field__label { font-size: var(--mp-font-sizes-md, 14px); font-weight: 600; color: var(--mp-colors-text-default, #1d1f24); }
.ws-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }
.ws-radio { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-secondary, #536062); cursor: pointer; }
.ws-form__error { font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-critical, #e02f2f); }
</style>
