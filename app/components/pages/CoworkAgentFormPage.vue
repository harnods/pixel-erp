<script setup lang="ts">
/**
 * Cowork — Create / Edit agent form. Reached at /cowork-agents/new and
 * /cowork-agents/:id/edit. Same page shell as the edit-task form (title bar +
 * stage), but guided by a 4-step ErpStepper: Persona · Knowledge · Skills ·
 * Visibility. Everything is stored on the agent (coworkAgents) and reflected on
 * the agent detail page.
 */
import { ref, reactive, computed, onMounted } from 'vue'
import {
  MpButton, MpInput, MpTextarea, MpSelect, MpToggle, MpUpload, MpUploadList, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpCheckbox, MpAvatar,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink,
  MpDrawer, MpDrawerContent, MpDrawerHeader, MpDrawerBody, MpDrawerOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import { infoToast } from '~/utils/toasts'
import { employees } from '~/data/employees'
import {
  getAgent, addAgent, updateAgent, COWORK_SKILLS, COWORK_COMPANY, COWORK_MODULES,
  type CoworkAgent, type CoworkModule,
} from '~/data/cowork'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')
const existing = computed<CoworkAgent | undefined>(() => isEdit.value ? getAgent(props.orderId!) : undefined)

const MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash' },
  { id: 'gemini-pro-latest', label: 'Gemini Pro' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite' },
]

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'persona', label: 'Persona' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'skills', label: 'Skills' },
  { key: 'visibility', label: 'Visibility' },
]
const stepKeys = STEPS.map((s) => s.key)
const current = ref('persona')
const done = ref<string[]>([])
const currentIndex = computed(() => stepKeys.indexOf(current.value))
const isLast = computed(() => currentIndex.value === STEPS.length - 1)

// ── Form state ──────────────────────────────────────────────────────────────
const name = ref('')
const description = ref('')
const instruction = ref('')
const model = ref(MODELS[0].id)
const allWorkspace = ref(false)
const areaOn = reactive<Record<string, boolean>>({})
COWORK_MODULES.forEach((m) => { areaOn[m] = false })
interface KFile { name: string; size: string; icon: string }
const knowledgeFiles = ref<KFile[]>([])
const skillOn = reactive<Record<string, boolean>>({})
COWORK_SKILLS.forEach((s) => { skillOn[s.id] = false })
const visibilityEveryone = ref(true)
const selectedEmployeeIds = ref<string[]>([])

onMounted(() => {
  const a = existing.value
  if (!a) { name.value = ''; return }
  name.value = a.name
  description.value = a.description ?? ''
  instruction.value = a.instruction || a.persona || ''
  model.value = a.model ?? MODELS[0].id
  allWorkspace.value = !!a.allWorkspace
  ;(a.knowledgeAreas ?? []).forEach((m) => { areaOn[m] = true })
  knowledgeFiles.value = (a.knowledgeFiles ?? []).map((f) => ({ name: f.name, size: f.size, icon: fileIcon(f.name.split('.').pop() || '') }))
  ;(a.skills ?? []).forEach((s) => { skillOn[s] = true })
  visibilityEveryone.value = a.visibilityEveryone ?? true
  selectedEmployeeIds.value = [...(a.visibilityEmployees ?? [])]
})

// ── Files ──
function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function fileIcon(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'pdf') return 'pdf-document'
  if (['doc', 'docx'].includes(e)) return 'word-document'
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'excel-document'
  if (['ppt', 'pptx'].includes(e)) return 'attachment'
  return 'attachment'
}
function onUploadChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  for (const f of Array.from(input.files ?? [])) {
    const ext = f.name.split('.').pop() || 'file'
    knowledgeFiles.value.push({ name: f.name, size: fileSizeLabel(f.size), icon: fileIcon(ext) })
  }
  input.value = ''
}
function removeFile(i: number) { knowledgeFiles.value.splice(i, 1) }

// ── Employee picker drawer ──
const pickerOpen = ref(false)
const empSearch = ref('')
const activeEmployees = computed(() => employees.filter((e) => e.status !== 'resigned'))
const filteredEmployees = computed(() => {
  const q = empSearch.value.trim().toLowerCase()
  return activeEmployees.value.filter((e) => !q || e.fullName.toLowerCase().includes(q) || (e.jobPosition ?? '').toLowerCase().includes(q))
})
const selectedEmployees = computed(() => selectedEmployeeIds.value.map((id) => employees.find((e) => e.id === id)).filter(Boolean))
function toggleEmployee(id: string, on: boolean) {
  if (on) { if (!selectedEmployeeIds.value.includes(id)) selectedEmployeeIds.value.push(id) }
  else selectedEmployeeIds.value = selectedEmployeeIds.value.filter((x) => x !== id)
}
function removeEmployee(id: string) { selectedEmployeeIds.value = selectedEmployeeIds.value.filter((x) => x !== id) }

// ── Navigation ──
const nameError = ref('')
function next() {
  if (current.value === 'persona' && !name.value.trim()) { nameError.value = 'You must fill in agent name'; return }
  if (!done.value.includes(current.value)) done.value.push(current.value)
  if (!isLast.value) current.value = stepKeys[currentIndex.value + 1]!
}
function back() { if (currentIndex.value > 0) current.value = stepKeys[currentIndex.value - 1]! }
function goToStep(key: string) { current.value = key }
function cancel() { router.push('/cowork-agents') }

const saving = ref(false)
function save() {
  if (!name.value.trim()) { current.value = 'persona'; nameError.value = 'You must fill in agent name'; return }
  saving.value = true
  const areas = COWORK_MODULES.filter((m) => areaOn[m]) as CoworkModule[]
  const skills = COWORK_SKILLS.filter((s) => skillOn[s.id]).map((s) => s.id)
  const patch: Partial<CoworkAgent> = {
    name: name.value.trim(),
    description: description.value.trim(),
    instruction: instruction.value.trim(),
    persona: instruction.value.trim() || existing.value?.persona || '',
    model: model.value,
    allWorkspace: allWorkspace.value,
    knowledgeAreas: areas,
    knowledgeFiles: knowledgeFiles.value.map((f) => ({ name: f.name, size: f.size })),
    skills,
    visibilityEveryone: visibilityEveryone.value,
    visibilityEmployees: visibilityEveryone.value ? [] : [...selectedEmployeeIds.value],
  }
  let id = props.orderId!
  if (isEdit.value && existing.value) {
    updateAgent(existing.value.id, patch)
    toast.notify({ variant: 'success', title: 'Agent saved' })
  } else {
    const seed = encodeURIComponent(name.value.trim() || 'agent')
    const created = addAgent({
      ...(patch as CoworkAgent),
      role: 'Custom agent',
      module: areas[0] ?? 'Finance',
      owned: true,
      color: '#6941C6',
      avatar: `https://api.dicebear.com/9.x/bottts-neutral/png?seed=${seed}&size=144&radius=20&backgroundColor=e6ddf7`,
    })
    id = created.id
    toast.notify({ variant: 'success', title: 'Agent created' })
  }
  saving.value = false
  router.push(`/cowork-agents/${id}`)
}
</script>

<template>
  <!-- Title bar -->
  <header class="caf-bar">
      <div class="caf-bar__left">
        <button class="caf-crumb" type="button" @click="cancel">Agents</button>
        <h1 class="caf-title">{{ isEdit ? 'Edit agent' : 'New agent' }}</h1>
      </div>
    </header>

    <div class="caf-stage">
      <div class="caf-inner">
        <ErpStepper :steps="STEPS" :current="current" :done="done" @select="goToStep" />

        <div class="caf-form">
          <!-- ── Persona ── -->
          <template v-if="current === 'persona'">
            <MpFormControl id="caf-name" class="caf-field" is-required :is-error="!!nameError">
              <MpFormLabel>Agent name</MpFormLabel>
              <MpInput id="caf-name-input" v-model="name" is-full-width @input="nameError = ''" />
              <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="caf-desc" class="caf-field">
              <MpFormLabel>Description</MpFormLabel>
              <MpTextarea id="caf-desc-input" v-model="description" is-full-width :rows="2" />
              <p class="caf-hint">Describe what this agent will help your team with.</p>
            </MpFormControl>

            <MpFormControl id="caf-instr" class="caf-field">
              <MpFormLabel>Instruction</MpFormLabel>
              <MpTextarea id="caf-instr-input" v-model="instruction" is-full-width :rows="5" />
              <p class="caf-hint">Control your agent's behaviour by adding custom instructions.</p>
            </MpFormControl>

            <MpFormControl id="caf-model" class="caf-field caf-field--half">
              <MpFormLabel>Model</MpFormLabel>
              <MpSelect id="caf-model-input" v-model="model" is-full-width>
                <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
              </MpSelect>
            </MpFormControl>
          </template>

          <!-- ── Knowledge ── -->
          <template v-else-if="current === 'knowledge'">
            <MpFormControl id="caf-upload" class="caf-field">
              <MpFormLabel>Knowledge files</MpFormLabel>
              <MpUpload id="caf-upload-input" is-multiple is-full-width
                accept=".md,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx"
                placeholder="or drag and drop here" button-text="Upload file" @change="onUploadChange" />
              <p class="caf-hint">Supported: .md, PDF, Word, spreadsheets, PowerPoint.</p>
              <MpUploadList v-for="(f, i) in knowledgeFiles" :key="i" :id="`caf-file-${i}`"
                :title="f.name" status="success" :subtitle="f.size" :icon-name="f.icon"
                is-show-remove-button @remove="removeFile(i)" />
            </MpFormControl>

            <MpFormControl id="caf-ws" class="caf-field">
              <div class="caf-ws-head">
                <div>
                  <MpFormLabel>Add all workspace content</MpFormLabel>
                  <p class="caf-hint caf-hint--tight">Let the agent draw on every connected module. Narrowing to the areas it needs keeps answers more accurate — too much data can dilute results.</p>
                </div>
                <MpToggle :is-checked="allWorkspace" aria-label="Add all workspace content" @update:is-checked="(v: boolean) => allWorkspace = v" />
              </div>
              <div v-if="!allWorkspace" class="caf-areas">
                <p class="caf-areas__label">Or pick the areas this agent should know:</p>
                <div v-for="m in COWORK_MODULES" :key="m" class="caf-area-row">
                  <span>{{ m }}</span>
                  <MpToggle :is-checked="areaOn[m]" :aria-label="`Toggle ${m}`" @update:is-checked="(v: boolean) => areaOn[m] = v" />
                </div>
              </div>
            </MpFormControl>

            <div class="caf-field">
              <MpBanner variant="information" is-full-width>
                <MpBannerIcon />
                <MpBannerTitle>Permissions stay as they are</MpBannerTitle>
                <MpBannerDescription>
                  Files and integrations keep their original permissions. Only people with existing access will have access here. To share with more people, update permissions for each file or integration separately.
                  <MpBannerLink href="#" @click.prevent="infoToast('Read more — coming soon')">Read more</MpBannerLink>
                </MpBannerDescription>
              </MpBanner>
            </div>
          </template>

          <!-- ── Skills ── -->
          <template v-else-if="current === 'skills'">
            <p class="caf-step-caption">Turn on the skills this agent can use. Each skill gives it concrete actions it can take on a task's action items.</p>
            <div class="caf-skills">
              <div v-for="s in COWORK_SKILLS" :key="s.id" class="caf-skill">
                <div class="caf-skill__main">
                  <p class="caf-skill__name">{{ s.name }}<span v-if="s.module" class="caf-skill__mod">{{ s.module }}</span></p>
                  <p class="caf-skill__desc">{{ s.description }}</p>
                  <div class="caf-skill__actions">
                    <span v-for="a in s.actions" :key="a.id" class="caf-skill__chip">{{ a.label }}</span>
                  </div>
                </div>
                <MpToggle :is-checked="skillOn[s.id]" :aria-label="`Toggle ${s.name}`" @update:is-checked="(v: boolean) => skillOn[s.id] = v" />
              </div>
            </div>
          </template>

          <!-- ── Visibility ── -->
          <template v-else-if="current === 'visibility'">
            <p class="caf-step-caption">Choose who can use this agent.</p>
            <div class="caf-vis-row">
              <span>Everyone at {{ COWORK_COMPANY }}</span>
              <MpToggle :is-checked="visibilityEveryone" aria-label="Everyone at company" @update:is-checked="(v: boolean) => visibilityEveryone = v" />
            </div>
            <div v-if="!visibilityEveryone" class="caf-people">
              <div class="caf-people__head">
                <MpFormLabel>People with access</MpFormLabel>
                <button type="button" class="caf-addpeople" @click="pickerOpen = true"><MpIcon name="add" size="sm" /> Add people</button>
              </div>
              <p v-if="!selectedEmployees.length" class="caf-hint">No one added yet — only you will have access.</p>
              <div v-for="e in selectedEmployees" :key="e!.id" class="caf-person">
                <MpAvatar :src="e!.photo" :name="e!.fullName" size="sm" />
                <div class="caf-person__info">
                  <span class="caf-person__name">{{ e!.fullName }}</span>
                  <span class="caf-person__role">{{ e!.jobPosition }}</span>
                </div>
                <button type="button" class="caf-person__x" aria-label="Remove" @click="removeEmployee(e!.id)"><MpIcon name="delete" size="sm" /></button>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer actions -->
        <div class="caf-actions">
          <MpButton is-rounded variant="ghost" @click="currentIndex === 0 ? cancel() : back()">{{ currentIndex === 0 ? 'Cancel' : 'Back' }}</MpButton>
          <MpButton v-if="!isLast" is-rounded variant="primary" @click="next">Next</MpButton>
          <MpButton v-else is-rounded variant="primary" :is-loading="saving" @click="save">{{ isEdit ? 'Save changes' : 'Create agent' }}</MpButton>
        </div>
      </div>
    </div>

    <!-- Employee picker drawer -->
    <MpDrawer id="caf-people-drawer" :is-open="pickerOpen" placement="right" @close="pickerOpen = false">
      <MpDrawerContent>
        <MpDrawerHeader>Add people <MpModalCloseButton /></MpDrawerHeader>
        <MpDrawerBody>
          <MpInput id="caf-emp-search" v-model="empSearch" is-full-width placeholder="Search employees" />
          <div class="caf-emplist">
            <label v-for="e in filteredEmployees" :key="e.id" class="caf-emp">
              <MpCheckbox :is-checked="selectedEmployeeIds.includes(e.id)" @update:is-checked="(v: boolean) => toggleEmployee(e.id, v)" />
              <MpAvatar :src="e.photo" :name="e.fullName" size="sm" />
              <span class="caf-emp__info">
                <span class="caf-emp__name">{{ e.fullName }}</span>
                <span class="caf-emp__role">{{ e.jobPosition }} · {{ e.department }}</span>
              </span>
            </label>
          </div>
        </MpDrawerBody>
      </MpDrawerContent>
      <MpDrawerOverlay />
    </MpDrawer>
</template>

<style scoped>
.caf-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; }
.caf-bar__left { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.caf-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.caf-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.caf-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }

.caf-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); }
.caf-inner { max-width: 640px; }
/* Mirror the edit-task form grid so MpFormControl fields get a definite width. */
.caf-form { margin-top: var(--mp-spacing-6, 24px); display: grid; grid-template-columns: repeat(6, 1fr); column-gap: var(--mp-spacing-6, 24px); row-gap: var(--mp-spacing-5, 20px); max-width: 558px; align-items: start; }
.caf-form > * { grid-column: 1 / 7; min-width: 0; }
.caf-field--half { grid-column: 1 / 4; }
@media (max-width: 640px) { .caf-field--half { grid-column: 1 / 7; } }
.caf-hint { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }
.caf-hint--tight { margin-top: 2px; max-width: 420px; }
.caf-step-caption { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.caf-ws-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.caf-areas { margin-top: var(--mp-spacing-3); }
.caf-areas__label { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.caf-area-row { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.caf-skills { display: flex; flex-direction: column; }
.caf-skill { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4, 16px) 0; border-bottom: 1px solid var(--mp-border-default); }
.caf-skill__main { min-width: 0; }
.caf-skill__name { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); display: flex; align-items: center; gap: var(--mp-spacing-2); }
.caf-skill__mod { font-size: var(--mp-font-sizes-xs, 12px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full, 999px); padding: 1px 8px; }
.caf-skill__desc { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.caf-skill__actions { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); margin-top: var(--mp-spacing-2); }
.caf-skill__chip { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-default); background: var(--mp-background-neutral-subtle, #f1f3f4); border-radius: var(--mp-radii-full, 999px); padding: 3px 10px; }

.caf-vis-row { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3, 12px) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-people { margin-top: var(--mp-spacing-4); }
.caf-people__head { display: flex; align-items: center; justify-content: space-between; }
.caf-addpeople { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.caf-addpeople:hover { text-decoration: underline; text-underline-offset: 2px; }
.caf-person { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); }
.caf-person__info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.caf-person__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-person__role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.caf-person__x { border: none; background: none; cursor: pointer; color: var(--mp-icon-default); display: inline-flex; }

.caf-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-6, 24px); max-width: 640px; }

.caf-emplist { margin-top: var(--mp-spacing-3); }
.caf-emp { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); cursor: pointer; }
.caf-emp__info { display: flex; flex-direction: column; }
.caf-emp__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-emp__role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
