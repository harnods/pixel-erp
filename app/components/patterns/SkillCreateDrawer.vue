<script setup lang="ts">
/**
 * SkillCreateDrawer — "Create with AI". A right-side drawer split in two:
 * left = a chat with the Skill builder (reuses the shared CoworkChatPanel);
 * right = the drafted skill as an editable Markdown document (Preview / Edit,
 * like the KB doc editor but without the summary/keywords/details panel).
 * Ask for a skill → the agent drafts one → review/edit the Markdown → Save,
 * which emits the skill for the page to persist.
 */
import { ref, computed } from 'vue'
import { MpButton, MpIcon, MpSpinner, css } from '@mekari/pixel3'
import CoworkChatPanel from '~/components/patterns/CoworkChatPanel.vue'
import type { CoworkModule } from '~/data/cowork'

interface SkillDraft { name: string; description: string; module?: CoworkModule; actions: string[]; markdown: string }
type ChatMsg = { role: 'user' | 'assistant'; text: string }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'save', skill: SkillDraft): void }>()

const MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash' },
  { id: 'gemini-pro-latest', label: 'Gemini Pro' },
]
const model = ref('gemini-flash-latest')
const messages = ref<ChatMsg[]>([])
const generating = ref(false)
const draft = ref<SkillDraft | null>(null)
const mode = ref<'preview' | 'edit'>('preview')

const SUGGESTIONS = [
  'Draft a skill to chase overdue invoices',
  'Create a skill that summarises weekly sales',
  'A skill to pre-check payroll before a run',
]

function reset() { messages.value = []; draft.value = null; generating.value = false; mode.value = 'preview' }
function close() { emit('update:open', false) }

async function onSend(text: string) {
  if (generating.value) return
  messages.value.push({ role: 'user', text })
  generating.value = true
  try {
    const res = await $fetch<{ skill: SkillDraft }>('/api/cowork/skill', { method: 'POST', body: { prompt: text, model: model.value } })
    draft.value = { ...res.skill, actions: res.skill.actions?.length ? res.skill.actions : ['Run skill'] }
    mode.value = 'preview'
    messages.value.push({ role: 'assistant', text: `I've drafted **${draft.value.name}** — ${draft.value.description}\n\nReview and edit it on the right, then **Save skill**.` })
  } catch {
    messages.value.push({ role: 'assistant', text: "Sorry, I couldn't draft that skill. Try rephrasing what it should do." })
  } finally { generating.value = false }
}

// ── Compact Markdown renderer (headings, bold, lists, code, paragraphs) ──
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
}
function renderMd(md: string): string {
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  for (const raw of (md || '').split('\n')) {
    const line = raw.replace(/\r$/, '')
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { closeList(); out.push(`<h${m[1]!.length}>${inline(m[2]!)}</h${m[1]!.length}>`) }
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul' } out.push(`<li>${inline(m[1]!)}</li>`) }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol' } out.push(`<li>${inline(m[1]!)}</li>`) }
    else if (!line.trim()) { closeList() }
    else { closeList(); out.push(`<p>${inline(line)}</p>`) }
  }
  closeList()
  return out.join('')
}
const renderedMd = computed(() => (draft.value ? renderMd(draft.value.markdown) : ''))

function save() { if (draft.value) emit('save', { ...draft.value }) }
defineExpose({ reset })
</script>

<template>
  <Teleport to="body">
    <Transition name="scd">
      <div v-if="open" class="scd-overlay" @click.self="close">
        <aside class="scd" :class="{ 'scd--wide': !!draft }">
          <header class="scd-head">
            <span class="scd-head__title">Create a skill with AI</span>
            <button class="scd-head__x" type="button" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></button>
          </header>

          <div class="scd-body" :class="{ 'scd-body--split': !!draft }">
            <!-- Left: chat with the Skill builder -->
            <div class="scd-chat">
              <CoworkChatPanel
                :messages="messages"
                agent-name="Skill builder"
                agent-avatar="/agents/airene.png"
                greeting="Tell me what the skill should do — I'll draft it, then you can edit and save it."
                :suggestions="SUGGESTIONS"
                :models="MODELS"
                :model-id="model"
                hide-header
                hide-add
                :agent-switchable="false"
                @update:model-id="(v: string) => model = v"
                @send="onSend"
              />
            </div>

            <!-- Right: the drafted skill (only appears once the agent has drafted one) -->
            <div v-if="draft" class="scd-draft">
              <template>
                <div class="scd-draft__head">
                  <div class="scd-draft__meta">
                    <input v-model="draft.name" class="scd-draft__name" placeholder="Skill name" />
                    <input v-model="draft.description" class="scd-draft__desc" placeholder="One-line description" />
                  </div>
                  <div class="scd-draft__toggle">
                    <button type="button" :class="{ 'is-active': mode === 'preview' }" @click="mode = 'preview'">Preview</button>
                    <button type="button" :class="{ 'is-active': mode === 'edit' }" @click="mode = 'edit'">Edit</button>
                  </div>
                </div>
                <div class="scd-draft__doc">
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <div v-if="mode === 'preview'" class="scd-md" v-html="renderedMd" />
                  <textarea v-else v-model="draft.markdown" class="scd-editor" spellcheck="false" placeholder="Skill definition (Markdown)…" />
                </div>
                <div class="scd-draft__foot">
                  <span class="scd-draft__hint">Saved as a Custom skill · stays off until enabled on an agent.</span>
                  <MpButton is-rounded variant="primary" @click="save">Save skill</MpButton>
                </div>
              </template>
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scd-enter-active, .scd-leave-active { transition: opacity 200ms ease; }
.scd-enter-from, .scd-leave-to { opacity: 0; }
.scd-overlay { position: fixed; inset: 0; z-index: 1400; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.scd { width: min(520px, 96vw); height: 100%; background: var(--mp-background-neutral, #fff); display: flex; flex-direction: column; transition: width 220ms ease; }
.scd--wide { width: min(1040px, 96vw); }
.scd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.scd-head__title { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md, 14px); font-weight: 600; color: var(--mp-text-default); }
.scd-head__x { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; border: none; background: none; cursor: pointer; color: var(--mp-icon-default); border-radius: var(--mp-radii-md, 8px); }
.scd-head__x:hover { background: var(--mp-background-neutral-subtle); }
.scd-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; }
.scd-body--split { grid-template-columns: 420px minmax(0, 1fr); }
.scd-chat { min-height: 0; }
.scd-body--split .scd-chat { border-right: 1px solid var(--mp-border-default); }
.scd-draft { min-height: 0; display: flex; flex-direction: column; }
.scd-draft__head { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.scd-draft__meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.scd-draft__name { border: none; outline: none; font-family: inherit; font-size: var(--mp-font-sizes-lg, 16px); font-weight: 600; color: var(--mp-text-default); background: none; padding: 2px 0; }
.scd-draft__desc { border: none; outline: none; font-family: inherit; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); background: none; padding: 2px 0; }
.scd-draft__name:focus, .scd-draft__desc:focus { box-shadow: inset 0 -1px 0 var(--mp-border-bold, #8c9596); }
.scd-draft__toggle { flex-shrink: 0; display: inline-flex; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 8px); overflow: hidden; }
.scd-draft__toggle button { border: none; background: var(--mp-background-neutral); cursor: pointer; font-family: inherit; font-size: 13px; color: var(--mp-text-secondary); padding: 6px 12px; }
.scd-draft__toggle button.is-active { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); font-weight: 600; }
.scd-draft__doc { flex: 1; min-height: 0; overflow-y: auto; }
.scd-editor { display: block; width: 100%; height: 100%; box-sizing: border-box; border: none; outline: none; resize: none; padding: var(--mp-spacing-4); font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.6; color: var(--mp-text-default); background: var(--mp-background-neutral); }
.scd-md { padding: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.scd-md :deep(h1) { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
.scd-md :deep(h2) { font-size: 16px; font-weight: 700; margin: 20px 0 6px; }
.scd-md :deep(h3) { font-size: 14px; font-weight: 700; margin: 16px 0 4px; }
.scd-md :deep(p) { margin: 0 0 10px; }
.scd-md :deep(ul), .scd-md :deep(ol) { margin: 0 0 10px; padding-inline-start: 22px; }
.scd-md :deep(li) { margin: 2px 0; }
.scd-md :deep(code) { font-family: ui-monospace, monospace; font-size: 0.9em; background: var(--mp-background-neutral-subtle); padding: 1px 5px; border-radius: 4px; }
.scd-draft__foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.scd-draft__hint { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
@media (max-width: 860px) { .scd-body { grid-template-columns: 1fr; } .scd-chat { display: none; } }
</style>
