<script setup lang="ts">
/**
 * Cowork — Agent detail page (/cowork-agents/:id). Reflects everything set in the
 * create/edit form: persona (instruction), model, knowledge, skills, visibility,
 * plus the predefined tasks this agent owns.
 */
import { computed, ref } from 'vue'
import {
  MpButton, MpIcon, MpAvatar, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, css, toast,
} from '@mekari/pixel3'
import { getAgent, COWORK_SKILLS, COWORK_COMPANY, COWORK_CATALOG, deleteAgentSafe, type CoworkAgent } from '~/data/cowork'
import { employees } from '~/data/employees'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const agent = computed<CoworkAgent | undefined>(() => getAgent(props.orderId))

const MODEL_LABELS: Record<string, string> = {
  'gemini-flash-latest': 'Gemini Flash', 'gemini-pro-latest': 'Gemini Pro', 'gemini-flash-lite-latest': 'Gemini Flash Lite',
}
const modelLabel = computed(() => MODEL_LABELS[agent.value?.model ?? ''] ?? 'Gemini Flash')
const instruction = computed(() => agent.value?.instruction || agent.value?.persona || '')
const knowledgeAreas = computed(() => agent.value?.allWorkspace ? ['All workspace content'] : (agent.value?.knowledgeAreas ?? []))
const skills = computed(() => (agent.value?.skills ?? []).map((id) => COWORK_SKILLS.find((s) => s.id === id)).filter(Boolean))
const visEmployees = computed(() => (agent.value?.visibilityEmployees ?? []).map((id) => employees.find((e) => e.id === id)).filter(Boolean))
const ownedTasks = computed(() => COWORK_CATALOG.filter((c) => c.module === agent.value?.module))

const activeTabIndex = ref(0)

function edit() { router.push(`/cowork-agents/${props.orderId}/edit`) }
function removeAgent() {
  if (!agent.value) return
  deleteAgentSafe(agent.value.id)
  toast.notify({ variant: 'success', title: 'Agent removed' })
  router.push('/cowork-agents')
}
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
          <MpPopoverContent :class="css({ minWidth: '160px' })">
            <MpPopoverList>
              <MpPopoverListItem @click="edit">Edit agent</MpPopoverListItem>
              <MpPopoverListItem @click="removeAgent">Remove agent</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpButton is-rounded variant="primary" @click="edit">Edit agent</MpButton>
      </div>
    </header>

    <div class="cad-stage">
      <div class="cad-inner">
        <!-- Header -->
        <section class="cad-head">
          <img class="cad-avatar" :src="agent.avatar" :alt="agent.name" loading="lazy">
          <div>
            <h2 class="cad-name">{{ agent.name }}</h2>
            <p class="cad-role">{{ agent.role }}</p>
            <p class="cad-desc">{{ agent.description }}</p>
          </div>
        </section>

        <!-- Tabbed sections (mirror the create/edit form steps) -->
        <MpTabs id="cad-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="cad-tabs detail-tabs">
          <MpTabList>
            <MpTab id="cad-tab-persona" value="persona">Persona</MpTab>
            <MpTab id="cad-tab-knowledge" value="knowledge">Knowledge</MpTab>
            <MpTab id="cad-tab-skills" value="skills">Skills</MpTab>
            <MpTab id="cad-tab-visibility" value="visibility">Visibility</MpTab>
          </MpTabList>
          <MpTabPanels>
            <!-- Persona -->
            <MpTabPanel value="persona">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Instruction</h3>
                  <p class="cad-value">{{ instruction }}</p>
                </section>
                <section class="cad-sec">
                  <h3 class="cad-h3">Model</h3>
                  <p class="cad-value cad-model"><MpIcon name="airene-brand" size="sm" /> {{ modelLabel }}</p>
                </section>
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
                  <h3 class="cad-h3">Knowledge</h3>
                  <div class="cad-chips">
                    <span v-for="k in knowledgeAreas" :key="k" class="cad-chip">{{ k }}</span>
                    <span v-if="!knowledgeAreas.length && !agent.knowledgeFiles?.length" class="cad-muted">No knowledge sources yet.</span>
                  </div>
                  <div v-for="f in agent.knowledgeFiles" :key="f.name" class="cad-file"><MpIcon name="doc" size="sm" /> {{ f.name }} <span class="cad-muted">· {{ f.size }}</span></div>
                </section>
              </div>
            </MpTabPanel>

            <!-- Skills -->
            <MpTabPanel value="skills">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Skills</h3>
                  <div v-for="s in skills" :key="s!.id" class="cad-skill">
                    <p class="cad-skill__name">{{ s!.name }}</p>
                    <p class="cad-skill__desc">{{ s!.description }}</p>
                    <div class="cad-chips">
                      <span v-for="a in s!.actions" :key="a.id" class="cad-chip">{{ a.label }}</span>
                    </div>
                  </div>
                  <p v-if="!skills.length" class="cad-muted">No skills enabled.</p>
                </section>
              </div>
            </MpTabPanel>

            <!-- Visibility -->
            <MpTabPanel value="visibility">
              <div class="cad-panel">
                <section class="cad-sec">
                  <h3 class="cad-h3">Visibility</h3>
                  <p v-if="agent.visibilityEveryone" class="cad-value">Everyone at {{ COWORK_COMPANY }}</p>
                  <template v-else>
                    <p class="cad-muted">{{ visEmployees.length }} {{ visEmployees.length === 1 ? 'person' : 'people' }} with access</p>
                    <div v-for="e in visEmployees" :key="e!.id" class="cad-person">
                      <MpAvatar :src="e!.photo" :name="e!.fullName" size="sm" />
                      <span class="cad-person__name">{{ e!.fullName }}</span>
                      <span class="cad-person__role">{{ e!.jobPosition }}</span>
                    </div>
                  </template>
                </section>
              </div>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </div>
    </div>
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
.cad-head { display: flex; gap: var(--mp-spacing-4, 16px); align-items: flex-start; max-width: 640px; padding-bottom: var(--mp-spacing-5); }
.cad-avatar { width: 72px; height: 72px; flex-shrink: 0; object-fit: contain; background: none; }
.cad-name { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-role { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-desc { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }

/* Tabs · active-state + tab-to-content gap overrides (matches ERP detail pages) */
.cad-tabs { width: 100%; margin-top: var(--mp-spacing-5, 20px); }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.cad-panel { max-width: 640px; }
.cad-sec { padding: var(--mp-spacing-5) 0; }
.cad-panel > .cad-sec:first-child { padding-top: 0; }
.cad-h3 { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.4px; text-transform: uppercase; color: var(--mp-text-secondary); }
.cad-value { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.cad-model { display: inline-flex; align-items: center; gap: var(--mp-spacing-1, 6px); }
.cad-muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); }
.cad-chip { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); background: var(--mp-background-neutral-subtle, #f1f3f4); border-radius: var(--mp-radii-full, 999px); padding: 3px 10px; }
.cad-file { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cad-skill { margin-bottom: var(--mp-spacing-4); }
.cad-skill__name { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-skill__desc { margin: 2px 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }
.cad-person { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2, 8px) 0; }
.cad-person__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cad-person__role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-task { display: flex; flex-direction: column; padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); }
.cad-task:last-child { border-bottom: none; }
.cad-task__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-task__desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cad-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }
</style>
