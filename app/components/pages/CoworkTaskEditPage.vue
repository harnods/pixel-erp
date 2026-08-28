<script setup lang="ts">
/**
 * Cowork — Edit task form.
 *
 * Reached from a task's detail (Actions → Edit task) at /cowork-tasks/:id/edit.
 * Follows docs/patterns/Form.md: max-width 558px, 6-column grid (6 = full,
 * 3 = half), MpFormControl fields, 20px row gap / 24px column gap, ghost Cancel +
 * primary Save last.
 *
 * The INSTRUCTION is the source of truth: the prompt and workflow are
 * (re)generated from it on save. Saving a predefined-task draft persists it to
 * the Tasks index with status 'draft' (saved, but not yet run).
 */
import { ref, computed, reactive, onMounted, nextTick } from 'vue'
import {
  MpButton, MpInput, MpTextarea, MpSelect, MpToggle, MpUpload, MpUploadList, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, toast,
} from '@mekari/pixel3'
import { useCoworkContext } from '~/composables/useCoworkContext'
import { getTask, updateTask, taskHasRun, coworkConnections, type CoworkTask, type CoworkCadence } from '~/data/cowork'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { build } = useCoworkContext()

// Opened via "Edit schedule" → focus the Schedule field.
onMounted(async () => {
  if (route.query.focus === 'schedule') {
    await nextTick()
    document.getElementById('cte-cadence-input')?.focus()
    document.getElementById('cte-cadence-input')?.scrollIntoView({ block: 'center' })
  }
})

const task = computed<CoworkTask | undefined>(() => getTask(props.orderId))

const MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash' },
  { id: 'gemini-pro-latest', label: 'Gemini Pro' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite' },
]
const OUTPUTS = [
  { id: 'briefing', name: 'Briefing summary' },
  { id: 'action-items', name: 'Action items' },
  { id: 'spreadsheet', name: 'Spreadsheet' },
  { id: 'pdf', name: 'PDF report' },
]
const SCHEDULE_TIMES = ['07:00', '08:00', '09:00', '12:00', '15:00', '18:00']

// ── Editable state ────────────────────────────────────────────────────────────
const title = ref(task.value?.title ?? '')
const instruction = ref(task.value?.instruction || task.value?.prompt || '')
const model = ref(task.value?.model ?? MODELS[0].id)

// Connected connectors the task may read; pre-check the ones already on the task.
// Legacy tasks stored module names (not connection names) — if none match, default all on.
const connectedSources = computed(() => coworkConnections.filter((c) => c.connected))
const sourceOn = reactive<Record<string, boolean>>({})
const taskHasConnSource = connectedSources.value.some((c) => task.value?.sources?.includes(c.name))
connectedSources.value.forEach((c) => {
  sourceOn[c.id] = taskHasConnSource ? task.value!.sources!.includes(c.name) : true
})

const outputOn = reactive<Record<string, boolean>>({})
OUTPUTS.forEach((o) => { outputOn[o.id] = task.value?.outputs?.includes(o.name) ?? (o.id === 'briefing') })

const cadence = ref<CoworkCadence | 'No schedule'>(task.value?.schedule?.cadence ?? 'No schedule')
const schedTime = ref(task.value?.schedule?.time ?? '09:00')

// Attachments (MpUpload) — added to the task's sources on save.
interface AttachedFile { name: string; ext: string; sizeLabel: string; icon: string }
const attachedFiles = ref<AttachedFile[]>([])
function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
function fileIcon(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'pdf') return 'pdf-document'
  if (['doc', 'docx'].includes(e)) return 'word-document'
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'excel-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'bmp'].includes(e)) return 'image-document'
  return 'attachment'
}
function onUploadChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  for (const f of Array.from(input.files ?? [])) {
    const rawExt = f.name.split('.').pop() || 'file'
    attachedFiles.value.push({ name: f.name, ext: rawExt.toUpperCase(), sizeLabel: fileSizeLabel(f.size), icon: fileIcon(rawExt) })
  }
  input.value = ''
}
function removeAttachedFile(i: number) { attachedFiles.value.splice(i, 1) }

function addConnection() { router.push('/cowork-connections?add=1') }

// ── Save ──────────────────────────────────────────────────────────────────────
const titleError = ref('')
const saving = ref(false)

function cancel() { router.push(`/cowork-tasks/${props.orderId}`) }

function selectedSourceNames(): string[] {
  const conns = connectedSources.value.filter((c) => sourceOn[c.id]).map((c) => c.name)
  return [...conns, ...attachedFiles.value.map((f) => f.name)]
}

async function save() {
  if (!task.value || saving.value) return
  if (!title.value.trim()) { titleError.value = 'You must fill in task name'; return }
  titleError.value = ''
  saving.value = true

  const instr = instruction.value.trim()
  const sources = selectedSourceNames()
  const outputs = OUTPUTS.filter((o) => outputOn[o.id]).map((o) => o.name)

  // The prompt & workflow are regenerated from the (edited) instruction so they
  // always match. Workflow comes from the plan endpoint; on failure we keep the
  // existing steps.
  let workflow = task.value.workflow ?? []
  try {
    const res = await $fetch<{ plan: { steps?: { title: string }[] } }>('/api/cowork/plan', {
      method: 'POST',
      body: { task: instr, context: build(), model: model.value, sources, outputs },
    })
    if (res.plan?.steps?.length) workflow = res.plan.steps.map((s) => s.title)
  } catch { /* keep existing workflow */ }

  const patch: Partial<CoworkTask> = {
    title: title.value.trim(),
    prompt: instr,
    instruction: instr || undefined,
    workflow,
    model: model.value,
    sources,
    outputs,
    schedule: cadence.value === 'No schedule'
      ? undefined
      : { cadence: cadence.value, time: schedTime.value, enabled: true },
  }
  if (!taskHasRun(task.value)) { patch.status = 'draft'; patch.saved = true }

  updateTask(task.value.id, patch)
  saving.value = false
  toast.notify({ variant: 'success', title: 'Task saved' })
  router.push(`/cowork-tasks/${props.orderId}`)
}
</script>

<template>
  <template v-if="task">
    <!-- Title bar -->
    <header class="cte-bar">
      <div class="cte-bar__left">
        <button class="cte-crumb" type="button" @click="cancel">{{ task.title }}</button>
        <h1 class="cte-title">Edit task</h1>
      </div>
    </header>

    <div class="cte-stage">
      <form class="cte-grid" @submit.prevent="save">
        <!-- Task name (full) -->
        <MpFormControl id="cte-title" class="cte-c-full" is-required :is-error="!!titleError">
          <MpFormLabel>Task name</MpFormLabel>
          <MpInput id="cte-title-input" v-model="title" is-full-width placeholder="Task name" @input="titleError = ''" />
          <MpFormErrorMessage>{{ titleError }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Instruction (full) -->
        <MpFormControl id="cte-instruction" class="cte-c-full">
          <MpFormLabel>Instruction</MpFormLabel>
          <MpTextarea id="cte-instruction-input" v-model="instruction" is-full-width :rows="4" placeholder="Tell Cowork what to do — the prompt and workflow are generated from this." />
          <p class="cte-hint">Cowork regenerates the prompt and workflow from this instruction when you save.</p>
        </MpFormControl>

        <!-- Model (half, own row) -->
        <MpFormControl id="cte-model" class="cte-c-half">
          <MpFormLabel>Model</MpFormLabel>
          <MpSelect id="cte-model-input" v-model="model" is-full-width>
            <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
          </MpSelect>
        </MpFormControl>

        <!-- Schedule (half) + Time (half) — own row, not inline with Model -->
        <MpFormControl id="cte-cadence" class="cte-c-half">
          <MpFormLabel>Schedule</MpFormLabel>
          <MpSelect id="cte-cadence-input" v-model="cadence" is-full-width>
            <option value="No schedule">No schedule</option>
            <option value="Daily">Daily</option>
            <option value="Weekly">Weekly</option>
            <option value="Monthly">Monthly</option>
          </MpSelect>
        </MpFormControl>
        <MpFormControl v-if="cadence !== 'No schedule'" id="cte-time" class="cte-c-half-r">
          <MpFormLabel>Time</MpFormLabel>
          <MpSelect id="cte-time-input" v-model="schedTime" is-full-width>
            <option v-for="t in SCHEDULE_TIMES" :key="t" :value="t">{{ t }}</option>
          </MpSelect>
        </MpFormControl>

        <!-- Sources — every connected connection, with a toggle each -->
        <MpFormControl id="cte-sources" class="cte-c-full">
          <MpFormLabel>Sources</MpFormLabel>
          <div class="cte-srclist">
            <div v-for="c in connectedSources" :key="c.id" class="cte-srcrow">
              <span class="cte-srcname">{{ c.name }}</span>
              <MpToggle :is-checked="sourceOn[c.id]" :aria-label="`Toggle ${c.name}`" @update:is-checked="(v: boolean) => sourceOn[c.id] = v" />
            </div>
            <button type="button" class="cte-addconn" @click="addConnection"><MpIcon name="add" size="sm" /> Add connection</button>
          </div>
        </MpFormControl>

        <!-- Attachments — MpUpload (half) -->
        <MpFormControl id="cte-attach" class="cte-c-half">
          <MpFormLabel>Attachments</MpFormLabel>
          <MpUpload
            id="cte-upload"
            is-multiple is-full-width
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.zip"
            placeholder="or drag and drop here"
            button-text="Choose file"
            @change="onUploadChange"
          />
          <MpUploadList
            v-for="(f, i) in attachedFiles" :key="i"
            :id="`cte-file-${i}`"
            :title="f.name" status="success" :subtitle="f.sizeLabel" :icon-name="f.icon"
            is-show-remove-button
            @remove="removeAttachedFile(i)"
          />
        </MpFormControl>

        <!-- Output -->
        <MpFormControl id="cte-output" class="cte-c-full">
          <MpFormLabel>Output</MpFormLabel>
          <div class="cte-outlist">
            <div v-for="o in OUTPUTS" :key="o.id" class="cte-srcrow">
              <span class="cte-srcname">{{ o.name }}</span>
              <MpToggle :is-checked="outputOn[o.id]" :aria-label="`Toggle ${o.name}`" @update:is-checked="(v: boolean) => outputOn[o.id] = v" />
            </div>
          </div>
        </MpFormControl>

        <!-- Action group — last, ghost Cancel + primary Save -->
        <div class="cte-c-full cte-actions">
          <MpButton is-rounded variant="ghost" @click="cancel">Cancel</MpButton>
          <MpButton is-rounded variant="primary" :is-loading="saving" @click="save">Save changes</MpButton>
        </div>
      </form>
    </div>
  </template>

  <div v-else class="cte-missing">
    <MpIcon name="doc" size="lg" />
    <p>Task not found.</p>
    <MpButton is-rounded variant="secondary" @click="router.push('/cowork-tasks')">Back to Tasks</MpButton>
  </div>
</template>

<style scoped>
.cte-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cte-bar__left { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.cte-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.cte-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cte-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }

.cte-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); }

/* Form.md: max-width 558px, 6-column grid, 20px row gap / 24px column gap. */
.cte-grid { display: grid; grid-template-columns: repeat(6, 1fr); column-gap: var(--mp-spacing-6, 24px); row-gap: var(--mp-spacing-5, 20px); max-width: 558px; align-items: start; }
.cte-c-full { grid-column: 1 / 7; }
.cte-c-half { grid-column: 1 / 4; }
.cte-c-half-r { grid-column: 4 / 7; }
@media (max-width: 640px) { .cte-c-half, .cte-c-half-r { grid-column: 1 / 7; } }

.cte-hint { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Sources / Output — plain toggle rows (no box); rows separated by border-bottom only. */
.cte-srclist { max-height: 240px; overflow-y: auto; }
.cte-srcrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cte-outlist .cte-srcrow:last-child { border-bottom: none; }
.cte-srcname { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cte-addconn { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-2, 8px) 0 0; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); text-align: left; }
.cte-addconn:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Action group right-aligned within the form width (Form.md). */
.cte-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-2); }

.cte-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }
</style>
