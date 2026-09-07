<script setup lang="ts">
/**
 * Workspace — Compile modal (WS-06). Three steps: Scope → Format & audience →
 * Review outline, then a streamed artifact preview the user saves to the
 * workspace's Generated folder. Content is grounded on the workspace's tagged
 * decisions (compileWorkspaceMarkdown) and limited to threads the user can read.
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpButton, MpButtonGroup, MpIcon, MpCheckbox,
} from '@mekari/pixel3'
import {
  compileWorkspaceMarkdown, saveCompiledArtifact, readableThreads, COMPILE_SECTIONS,
  type CoworkWorkspace, type CompileScope, type CompileFormat, type CompileSection, type WorkspaceFile,
} from '~/data/coworkWorkspaces'

const props = defineProps<{ open: boolean; workspace: CoworkWorkspace; currentUserId: string }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'saved', f: WorkspaceFile): void }>()

const FORMATS: { id: CompileFormat; label: string }[] = [
  { id: 'pdf', label: 'PDF' }, { id: 'pptx', label: 'Slides' }, { id: 'docx', label: 'Doc' },
  { id: 'xlsx', label: 'Sheet' }, { id: 'md', label: 'Markdown' }, { id: 'html', label: 'HTML' },
]

const readable = computed(() => readableThreads(props.workspace, props.currentUserId))
const excludedCount = computed(() => props.workspace.threads.length - readable.value.length)

const step = ref(1)
const phase = ref<'form' | 'generating' | 'done'>('form')
const scope = ref<CompileScope>('tagged')
const selectedThreadIds = ref<string[]>([])
const format = ref<CompileFormat>('pdf')
const audience = ref('')
const sections = ref<CompileSection[]>([...COMPILE_SECTIONS])
const title = ref('')
const streamed = ref('')
let streamTimer: ReturnType<typeof setInterval> | null = null

// Reset each time it opens.
watch(() => props.open, (open) => {
  if (!open) { if (streamTimer) clearInterval(streamTimer); return }
  step.value = 1; phase.value = 'form'; scope.value = 'tagged'
  selectedThreadIds.value = readable.value.map((t) => t.id)
  format.value = 'pdf'; audience.value = ''; sections.value = [...COMPILE_SECTIONS]
  title.value = `${props.workspace.name} — decisions summary`
  streamed.value = ''
})

function close() { if (streamTimer) clearInterval(streamTimer); emit('update:open', false) }
function toggleThread(id: string, on: boolean) {
  selectedThreadIds.value = on ? [...selectedThreadIds.value, id] : selectedThreadIds.value.filter((x) => x !== id)
}
function toggleSection(s: CompileSection, on: boolean) {
  sections.value = on
    ? [...COMPILE_SECTIONS].filter((x) => x === s || sections.value.includes(x))
    : sections.value.filter((x) => x !== s)
}
function ownerName(id: string) { return props.workspace.members.find((m) => m.userId === id)?.name ?? 'Unknown' }

const canNext = computed(() => {
  if (step.value === 1 && scope.value === 'selected') return selectedThreadIds.value.length > 0
  return true
})

function next() { if (step.value < 3 && canNext.value) step.value++ }
function back() { if (phase.value === 'done') { phase.value = 'form'; step.value = 3 } else if (step.value > 1) step.value-- }

const result = computed(() => compileWorkspaceMarkdown(props.workspace, {
  scope: scope.value, threadIds: selectedThreadIds.value, format: format.value,
  audience: audience.value, sections: sections.value,
  readableThreadIds: readable.value.map((t) => t.id), title: title.value,
}))

function generate() {
  phase.value = 'generating'
  streamed.value = ''
  const full = result.value.markdown
  let i = 0
  const step0 = Math.max(3, Math.round(full.length / 60))
  streamTimer = setInterval(() => {
    i = Math.min(full.length, i + step0)
    streamed.value = full.slice(0, i)
    if (i >= full.length) { if (streamTimer) clearInterval(streamTimer); phase.value = 'done' }
  }, 24)
}

function save() {
  const file = saveCompiledArtifact(props.workspace, result.value, format.value, props.currentUserId)
  emit('saved', file)
  close()
}

// ── Compact markdown renderer for the preview ──
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function inline(s: string) { return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>') }
function renderMd(md: string): string {
  const out: string[] = []; let inList = false
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\r$/, '')
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { closeList(); out.push(`<h${m[1]!.length}>${inline(m[2]!)}</h${m[1]!.length}>`) }
    else if ((m = line.match(/^-\s+(.*)$/))) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${inline(m[1]!)}</li>`) }
    else if (!line.trim()) { closeList() }
    else { closeList(); out.push(`<p>${inline(line)}</p>`) }
  }
  closeList()
  return out.join('')
}
const renderedMd = computed(() => renderMd(streamed.value))
</script>

<template>
  <MpModal id="ws-compile" :is-open="open" size="lg" is-close-on-esc :is-keep-alive="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        Compile workspace
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <!-- Stepper -->
        <ol v-if="phase !== 'done'" class="wc-steps">
          <li v-for="(s, i) in ['Scope', 'Format & audience', 'Review outline']" :key="s" class="wc-step" :class="{ 'is-active': step === i + 1, 'is-done': step > i + 1 }">
            <span class="wc-step__num">{{ i + 1 }}</span>{{ s }}
          </li>
        </ol>

        <!-- Step 1 — Scope -->
        <div v-if="phase === 'form' && step === 1" class="wc-body">
          <div class="wc-radios">
            <label class="wc-radio"><input v-model="scope" type="radio" value="all"><span><b>All threads I can read</b> — every thread in the workspace you have access to</span></label>
            <label class="wc-radio"><input v-model="scope" type="radio" value="selected"><span><b>Selected threads</b> — pick which threads to include</span></label>
            <label class="wc-radio"><input v-model="scope" type="radio" value="tagged"><span><b>Tagged items only</b> — just the tagged decisions / actions / risks (fastest)</span></label>
          </div>
          <div v-if="scope === 'selected'" class="wc-threads">
            <label v-for="t in readable" :key="t.id" class="wc-thread">
              <MpCheckbox :id="`wc-t-${t.id}`" :is-checked="selectedThreadIds.includes(t.id)" @change="(v: boolean) => toggleThread(t.id, v)" />
              <span class="wc-thread__title">{{ t.title }}</span>
              <span class="wc-thread__sub">{{ ownerName(t.ownerUserId) }}</span>
            </label>
          </div>
          <p v-if="excludedCount > 0" class="wc-note"><MpIcon name="security" size="sm" /> {{ excludedCount }} thread{{ excludedCount === 1 ? '' : 's' }} you can’t access will be excluded and noted in Sources.</p>
        </div>

        <!-- Step 2 — Format & audience -->
        <div v-else-if="phase === 'form' && step === 2" class="wc-body">
          <div class="wc-field">
            <span class="wc-field__label">Format</span>
            <div class="wc-formats">
              <button v-for="f in FORMATS" :key="f.id" type="button" class="wc-chip" :class="{ 'is-on': format === f.id }" @click="format = f.id">{{ f.label }}</button>
            </div>
          </div>
          <div class="wc-field">
            <span class="wc-field__label">Audience note <span class="wc-optional">optional</span></span>
            <textarea v-model="audience" class="wc-input wc-input--area" rows="2" placeholder="e.g. Board update — keep it high level"></textarea>
          </div>
        </div>

        <!-- Step 3 — Review outline -->
        <div v-else-if="phase === 'form' && step === 3" class="wc-body">
          <div class="wc-field">
            <span class="wc-field__label">Artifact title</span>
            <input v-model="title" class="wc-input" type="text">
          </div>
          <div class="wc-field">
            <span class="wc-field__label">Sections</span>
            <div class="wc-sections">
              <label v-for="s in COMPILE_SECTIONS" :key="s" class="wc-thread">
                <MpCheckbox :id="`wc-s-${s}`" :is-checked="sections.includes(s)" @change="(v: boolean) => toggleSection(s, v)" />
                <span class="wc-thread__title">{{ s }}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Generating / Done — streamed preview -->
        <div v-else class="wc-preview">
          <div class="wc-preview__head">
            <span class="wc-preview__name"><MpIcon name="magic" size="sm" /> {{ title }}.{{ format }}</span>
            <span v-if="phase === 'generating'" class="wc-preview__status">Compiling…</span>
            <span v-else class="wc-preview__status wc-preview__status--done">Ready</span>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="wc-md" v-html="renderedMd" />
        </div>
      </MpModalBody>

      <MpModalFooter>
        <div class="wc-foot">
          <span v-if="phase === 'form'" class="wc-foot__hint">Runs with your permissions · saves to Workspaces / {{ workspace.name }} / Generated</span>
          <MpButtonGroup>
            <MpButton v-if="phase === 'form' && step > 1" variant="ghost" is-rounded @click="back">Back</MpButton>
            <MpButton v-else-if="phase === 'done'" variant="ghost" is-rounded @click="back">Edit outline</MpButton>
            <MpButton v-else variant="ghost" is-rounded @click="close">Cancel</MpButton>

            <MpButton v-if="phase === 'form' && step < 3" variant="primary" is-rounded :is-disabled="!canNext" @click="next">Next</MpButton>
            <MpButton v-else-if="phase === 'form' && step === 3" variant="primary" is-rounded @click="generate">Generate</MpButton>
            <MpButton v-else-if="phase === 'done'" variant="primary" is-rounded @click="save">Save to workspace</MpButton>
          </MpButtonGroup>
        </div>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.wc-steps { display: flex; align-items: center; gap: var(--mp-spacing-4, 16px); list-style: none; margin: 0 0 var(--mp-spacing-5, 20px); padding: 0 0 var(--mp-spacing-4, 16px); border-bottom: 1px solid var(--mp-colors-border-default, #dcdfe4); }
.wc-step { display: inline-flex; align-items: center; gap: 6px; font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-placeholder, #97a0af); }
.wc-step.is-active { color: var(--mp-colors-text-default, #1d1f24); font-weight: 600; }
.wc-step.is-done { color: var(--mp-colors-text-secondary, #536062); }
.wc-step__num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--mp-colors-neutral-200, #e3e7e9); color: var(--mp-colors-text-secondary, #536062); }
.wc-step.is-active .wc-step__num { background: var(--mp-colors-brand-bold, #0a6e4e); color: #fff; }

.wc-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4, 16px); min-height: 200px; }
.wc-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }
.wc-radio { display: flex; align-items: flex-start; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-secondary, #536062); cursor: pointer; }
.wc-radio input { margin-top: 3px; }
.wc-threads, .wc-sections { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); padding: var(--mp-spacing-2, 8px) 0 0; max-height: 200px; overflow-y: auto; }
.wc-thread { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); padding: var(--mp-spacing-2, 8px); border-radius: var(--mp-radii-md, 6px); cursor: pointer; }
.wc-thread:hover { background: var(--mp-colors-background-neutral-subtle, #f7f8f8); }
.wc-thread__title { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #1d1f24); }
.wc-thread__sub { margin-left: auto; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }
.wc-note { display: inline-flex; align-items: center; gap: 6px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }
.wc-note :deep(svg) { color: var(--mp-colors-icon-subtle, #97a0af); }

.wc-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }
.wc-field__label { font-size: var(--mp-font-sizes-md, 14px); font-weight: 600; color: var(--mp-colors-text-default, #1d1f24); }
.wc-optional { font-weight: 400; font-size: 12px; color: var(--mp-colors-text-placeholder, #97a0af); }
.wc-input { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px); border: 1px solid var(--mp-colors-border-form, rgba(29,31,36,.16)); border-radius: var(--mp-radii-md, 6px); font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #1d1f24); outline: none; }
.wc-input:focus { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: 0 0 0 2px var(--mp-colors-border-bold, #8c9596); }
.wc-input--area { resize: vertical; }
.wc-formats { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); }
.wc-chip { padding: 6px 14px; border: 1px solid var(--mp-colors-border-default, #dcdfe4); border-radius: 999px; background: var(--mp-colors-background-default, #fff); font-size: var(--mp-font-sizes-sm, 13px); color: var(--mp-colors-text-default, #1d1f24); cursor: pointer; }
.wc-chip.is-on { border-color: var(--mp-colors-brand-bold, #0a6e4e); background: var(--mp-colors-brand-subtle, #e8f3ef); color: var(--mp-colors-brand-bold, #0a6e4e); font-weight: 600; }

.wc-preview { min-height: 260px; }
.wc-preview__head { display: flex; align-items: center; justify-content: space-between; padding-bottom: var(--mp-spacing-3, 12px); margin-bottom: var(--mp-spacing-3, 12px); border-bottom: 1px solid var(--mp-colors-border-default, #dcdfe4); }
.wc-preview__name { display: inline-flex; align-items: center; gap: 6px; font-size: var(--mp-font-sizes-md, 14px); font-weight: 600; color: var(--mp-colors-text-default, #1d1f24); }
.wc-preview__name :deep(svg) { color: var(--mp-colors-brand-bold, #0a6e4e); }
.wc-preview__status { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }
.wc-preview__status--done { color: var(--mp-colors-brand-bold, #0a6e4e); }
.wc-md { max-height: 340px; overflow-y: auto; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #1d1f24); }
.wc-md :deep(h1) { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
.wc-md :deep(h2) { font-size: 14px; font-weight: 700; margin: 16px 0 4px; }
.wc-md :deep(p) { margin: 0 0 8px; line-height: 1.5; }
.wc-md :deep(ul) { margin: 0 0 8px; padding-inline-start: 20px; list-style: disc outside; }
.wc-md :deep(li) { margin: 2px 0; display: list-item; line-height: 1.5; }
.wc-md :deep(em) { color: var(--mp-colors-text-secondary, #536062); font-style: normal; }

.wc-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4, 16px); width: 100%; }
.wc-foot__hint { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #536062); }
</style>
