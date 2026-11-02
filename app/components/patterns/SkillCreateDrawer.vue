<script setup lang="ts">
/**
 * SkillCreateDrawer — "Create with AI". Uses the ERP's canonical drawer shell:
 * a custom Teleport overlay + floating panel (identical structure to
 * BillsFiltersDrawer / SalesInvoiceFiltersDrawer / the ~30 other *Drawer.vue).
 * We do NOT use Pixel `MpDrawer` — it has no structural CSS in this Pixel3
 * build, so its header/footer detach to the viewport edges (see the "Drawers"
 * note in CLAUDE.md).
 *
 * Left: chat with the Skill builder. Once it drafts a skill, an editable
 * Markdown preview appears on the right (rendered by default, single "Edit"
 * toggle — like the KB doc editor, minus the summary/keywords/details panel).
 * The panel widens from chat-only to two columns when a draft exists. Save
 * emits the skill for the page to persist. Closing is via ×, Cancel, or Esc —
 * an overlay click is intentionally ignored so an in-progress draft is never
 * lost by a stray click.
 */
import { ref, computed } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
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
</script>

<template>
  <ErpDrawer :is-open="open" title="Create a skill with AI" :width="draft ? '960px' : '440px'" @close="close">
    <template #body>
      <div class="scd-body">
        <div class="scd-cols" :class="{ 'scd-cols--split': !!draft }">
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
                  :thinking="generating"
                  @update:model-id="(v: string) => model = v"
                  @send="onSend"
                />
              </div>

              <!-- Right: the drafted skill (only once the agent has drafted one) -->
              <div v-if="draft" class="scd-preview">
                <div class="scd-preview__head">
                  <div class="scd-preview__meta">
                    <input v-model="draft.name" class="scd-name" placeholder="Skill name">
                    <input v-model="draft.description" class="scd-desc" placeholder="One-line description">
                  </div>
                  <MpButton type="button" class="btn-enterprise btn-enterprise--secondary scd-edit" variant="secondary" @click="mode = mode === 'edit' ? 'preview' : 'edit'">
                    <MpIcon :name="mode === 'edit' ? 'check' : 'edit'" size="sm" /> {{ mode === 'edit' ? 'Done' : 'Edit' }}
                  </MpButton>
                </div>
                <div class="scd-preview__doc">
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <div v-if="mode === 'preview'" class="scd-md" v-html="renderedMd" />
                  <textarea v-else v-model="draft.markdown" class="scd-editor" spellcheck="false" placeholder="Skill definition (Markdown)…" />
                </div>
              </div>
          </div>
        </div>
    </template>

    <template v-if="draft" #footer>
      <span class="scd-foot-hint">Saved as a Custom skill · stays off until enabled on an agent.</span>
      <div class="scd-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="save">Save skill</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.scd-body { flex: 1; min-height: 0; overflow: hidden; margin: calc(-1 * var(--mp-spacing-4)); }
.scd-cols { display: grid; grid-template-columns: 1fr; height: 100%; min-height: 0; }
.scd-cols--split { grid-template-columns: 420px minmax(0, 1fr); }
.scd-chat { min-height: 0; height: 100%; }
.scd-cols--split .scd-chat { border-right: 1px solid var(--mp-border-default, #e3e7e9); }

.scd-preview { min-height: 0; display: flex; flex-direction: column; }
.scd-preview__head { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.scd-preview__meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.scd-name { border: none; outline: none; font-family: inherit; font-size: var(--mp-font-sizes-lg, 16px); font-weight: 600; color: var(--mp-text-default); background: none; padding: 2px 0; }
.scd-desc { border: none; outline: none; font-family: inherit; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); background: none; padding: 2px 0; }
.scd-name:focus, .scd-desc:focus { box-shadow: inset 0 -1px 0 var(--mp-border-bold, #8c9596); }
.scd-edit { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; }
.scd-preview__doc { flex: 1; min-height: 0; overflow-y: auto; }
.scd-editor { display: block; width: 100%; height: 100%; box-sizing: border-box; border: none; outline: none; resize: none; padding: var(--mp-spacing-4); font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.6; color: var(--mp-text-default); background: var(--mp-background-neutral, #ffffff); }
.scd-md { padding: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.scd-md :deep(h1) { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
.scd-md :deep(h2) { font-size: 16px; font-weight: 700; margin: 20px 0 6px; }
.scd-md :deep(h3) { font-size: 14px; font-weight: 700; margin: 16px 0 4px; }
.scd-md :deep(p) { margin: 0 0 10px; }
.scd-md :deep(ul) { margin: 0 0 10px; padding-inline-start: 22px; list-style: disc outside; }
.scd-md :deep(ol) { margin: 0 0 10px; padding-inline-start: 22px; list-style: decimal outside; }
.scd-md :deep(li) { margin: 2px 0; display: list-item; }
.scd-md :deep(code) { font-family: ui-monospace, monospace; font-size: 0.9em; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 1px 5px; border-radius: 4px; }

.scd-foot-hint { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.scd-footer-right { flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
