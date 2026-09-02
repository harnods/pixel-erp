<script setup lang="ts">
/**
 * Cowork — Knowledge Base document detail (/cowork-knowledge/doc/:id).
 * Shows the extracted content (or image preview), the AI-derived summary +
 * keywords, file metadata, and which agents/skills use this doc. Full-bleed —
 * owns its own title bar + stage.
 */
import { ref, computed, watch, onMounted } from 'vue'
import { MpButton, MpIcon, MpBadge, MpSpinner, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'
import { getDoc, getFolder, breadcrumbOf, updateNode, deleteNode, resolveAttachments, extLabel, KB_TEXT_CAP, type KbDoc } from '~/data/coworkKb'
import { coworkAgents, coworkSkills } from '~/data/cowork'
import { getBlob, putBlob, deleteBlob } from '~/utils/kbBlobStore'
import { formatDateTimeLong } from '~/utils/date'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const doc = computed<KbDoc | undefined>(() => getDoc(props.orderId))
const folder = computed(() => (doc.value ? getFolder(doc.value.parentId) : undefined))
const crumbs = computed(() => (doc.value ? breadcrumbOf(doc.value.parentId) : []))
const isImage = computed(() => ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(doc.value?.ext ?? ''))

// Full text + raw preview come from IndexedDB (uncapped); fall back to the
// capped snapshot text if the blob store is unavailable.
const fullText = ref('')
const imageUrl = ref('')
async function loadBlob() {
  fullText.value = doc.value?.text ?? ''
  imageUrl.value = ''
  if (!doc.value) return
  const b = await getBlob(doc.value.id)
  if (b?.text) fullText.value = b.text
  if (isImage.value && b?.dataUrl) imageUrl.value = b.dataUrl
}
const route = useRoute()
// Opened from the chat "Edit as doc" action (?edit=1) → jump straight into edit.
onMounted(async () => { await loadBlob(); if (route.query.edit === '1' && editable.value) startEdit() })
watch(() => props.orderId, loadBlob)

// ── Used by (agents + skills whose attachments resolve to this doc) ──────────────
const usedByAgents = computed(() =>
  coworkAgents.filter((a) => resolveAttachments(a.knowledge).some((d) => d.id === props.orderId)))
const usedBySkills = computed(() =>
  coworkSkills.filter((s) => resolveAttachments(s.knowledge).some((d) => d.id === props.orderId)))

// ── Edit (text-native docs) ──────────────────────────────────────────────────
// The extracted text IS the file for these, so editing + saving replaces the
// document content. For binary formats (docx/pdf/xlsx/images) the stored text is
// only a derived copy, so inline editing isn't offered — re-upload instead.
const TEXT_EDITABLE = ['md', 'markdown', 'txt', 'csv', 'tsv', 'json']
const editable = computed(() => TEXT_EDITABLE.includes(doc.value?.ext ?? ''))
const editing = ref(false)
const draft = ref('')
const savingEdit = ref(false)
function startEdit() { draft.value = fullText.value; editing.value = true }
function cancelEdit() { editing.value = false }
async function reindexText(text: string): Promise<{ summary?: string; keywords?: string[] }> {
  try {
    return await $fetch('/api/cowork/kb/enrich', { method: 'POST', body: { fileName: doc.value?.fileName, text } })
  } catch { return {} }
}
async function saveEdit() {
  if (!doc.value || savingEdit.value) return
  savingEdit.value = true
  const text = draft.value
  try {
    fullText.value = text
    // Full text + refreshed data URL → IndexedDB; capped text + chunks → snapshot.
    const dataUrl = `data:${doc.value.mime || 'text/plain'};base64,` + (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(text))) : '')
    await putBlob({ id: doc.value.id, fileName: doc.value.fileName, mime: doc.value.mime, text, dataUrl })
    const en = await reindexText(text)
    updateNode(doc.value.id, {
      text: text.slice(0, KB_TEXT_CAP),
      sizeBytes: new Blob([text]).size,
      summary: en?.summary ?? doc.value.summary,
      keywords: en?.keywords ?? doc.value.keywords,
      warning: undefined,
    })
    editing.value = false
    toast.notify({ variant: 'success', title: 'Saved', description: 'Document updated and re-indexed.' })
  } catch {
    toast.notify({ variant: 'error', title: 'Could not save', description: 'Try again in a moment.' })
  } finally {
    savingEdit.value = false
  }
}

// ── Re-index (re-derive summary + keywords without changing the content) ────────
const reindexing = ref(false)
async function reindex() {
  if (!doc.value || reindexing.value) return
  reindexing.value = true
  try {
    const en = await reindexText(fullText.value || doc.value.text || '')
    updateNode(doc.value.id, { summary: en?.summary ?? doc.value.summary, keywords: en?.keywords ?? doc.value.keywords })
    toast.notify({ variant: 'success', title: 'Re-indexed', description: 'Summary and keywords refreshed.' })
  } catch {
    toast.notify({ variant: 'error', title: 'Could not re-index', description: 'Try again in a moment.' })
  } finally {
    reindexing.value = false
  }
}

function download() {
  const d = doc.value
  if (!d) return
  const url = imageUrl.value
  if (url) { const a = document.createElement('a'); a.href = url; a.download = d.fileName; a.click(); return }
  const blob = new Blob([fullText.value || d.text || ''], { type: 'text/plain' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${d.name}.txt`; a.click()
  URL.revokeObjectURL(a.href)
}

const deleteOpen = ref(false)
function confirmDelete() {
  if (!doc.value) return
  const id = doc.value.id
  const parent = doc.value.parentId
  deleteNode(id)
  deleteBlob(id)
  toast.notify({ variant: 'success', title: 'Document deleted' })
  router.push({ path: '/cowork-knowledge', query: parent ? { folder: parent } : {} })
}

function goFolder() { router.push({ path: '/cowork-knowledge', query: folder.value ? { folder: folder.value.id } : {} }) }
</script>

<template>
  <template v-if="doc">
    <header class="kbd-bar">
      <div class="kbd-bar__left">
        <nav class="kbd-crumbs" aria-label="Breadcrumb">
          <button class="kbd-crumb" type="button" @click="router.push('/cowork-knowledge')">Knowledge</button>
          <template v-for="c in crumbs" :key="c.id">
            <MpIcon name="caret-right" size="sm" class="kbd-crumb-sep" />
            <button class="kbd-crumb" type="button" @click="router.push({ path: '/cowork-knowledge', query: { folder: c.id } })">{{ c.name }}</button>
          </template>
        </nav>
        <h1 class="kbd-title">
          {{ doc.name }}
          <span class="kbd-ext">{{ extLabel(doc.ext) }}</span>
          <MpSpinner v-if="doc.status === 'processing'" size="sm" />
          <MpBadge v-else-if="doc.status === 'failed'" for="additionalInformation" type="critical" size="sm">Failed</MpBadge>
        </h1>
      </div>
      <div class="kbd-bar__actions">
        <template v-if="editing">
          <MpButton is-rounded variant="ghost" @click="cancelEdit">Cancel</MpButton>
          <MpButton is-rounded variant="primary" :is-loading="savingEdit" @click="saveEdit"><MpIcon name="check" size="sm" /> Save changes</MpButton>
        </template>
        <MpPopover v-else id="kbd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after" type="button">
              Actions
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px' })">
            <MpPopoverList>
              <MpPopoverListItem v-if="editable" @click="startEdit">Edit</MpPopoverListItem>
              <MpPopoverListItem @click="reindex">{{ reindexing ? 'Re-indexing…' : 'Re-index' }}</MpPopoverListItem>
              <MpPopoverListItem @click="download">Download</MpPopoverListItem>
              <MpPopoverListItem @click="deleteOpen = true">Delete</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="kbd-stage">
      <!-- Content preview -->
      <article class="kbd-content">
        <div v-if="doc.warning && !editing" class="kbd-warn"><MpIcon name="info-circle" size="sm" /> {{ doc.warning }}</div>
        <textarea v-if="editing" v-model="draft" class="kbd-editor" spellcheck="false" placeholder="Document content…"></textarea>
        <template v-else>
          <div v-if="doc.status === 'processing'" class="kbd-processing"><MpSpinner size="md" /><p>Extracting and indexing…</p></div>
          <img v-else-if="isImage && imageUrl" :src="imageUrl" :alt="doc.name" class="kbd-image" />
          <pre v-else-if="fullText" class="kbd-text">{{ fullText }}</pre>
          <div v-else class="kbd-empty">
            <MpIcon name="doc" size="lg" /><p>No extractable text for this file.</p>
            <MpButton v-if="editable" is-rounded variant="secondary" @click="startEdit"><MpIcon name="edit" size="sm" /> Add content</MpButton>
          </div>
        </template>
      </article>

      <!-- Metadata -->
      <aside class="kbd-side">
        <section class="kbd-card">
          <h2 class="kbd-card__title">Summary</h2>
          <p class="kbd-summary">{{ doc.summary || 'No summary yet.' }}</p>
        </section>

        <section v-if="doc.keywords?.length" class="kbd-card">
          <h2 class="kbd-card__title">Keywords</h2>
          <div class="kbd-tags">
            <span v-for="k in doc.keywords" :key="k" class="kbd-tag">{{ k }}</span>
          </div>
        </section>

        <section class="kbd-card">
          <h2 class="kbd-card__title">Details</h2>
          <dl class="kbd-meta">
            <div><dt>File</dt><dd>{{ doc.fileName }}</dd></div>
            <div><dt>Folder</dt><dd><button class="kbd-link" type="button" @click="goFolder">{{ folder?.name ?? '—' }}</button></dd></div>
            <div v-if="doc.pageCount"><dt>Pages / sheets</dt><dd>{{ doc.pageCount }}</dd></div>
            <div><dt>Source</dt><dd>{{ doc.source === 'ai' ? 'AI-generated' : doc.source === 'skill-ref' ? 'Skill reference' : 'Uploaded' }}</dd></div>
            <div><dt>Updated</dt><dd>{{ formatDateTimeLong(doc.updatedAt) }}</dd></div>
          </dl>
        </section>

        <section class="kbd-card">
          <h2 class="kbd-card__title">Used by</h2>
          <template v-if="usedByAgents.length || usedBySkills.length">
            <div v-for="a in usedByAgents" :key="'a-' + a.id" class="kbd-usedby" role="button" tabindex="0" @click="router.push('/cowork-agents/' + a.id)">
              <MpIcon name="magic" size="sm" /><span>{{ a.name }}</span><span class="kbd-usedby__kind">Agent</span>
            </div>
            <div v-for="s in usedBySkills" :key="'s-' + s.id" class="kbd-usedby" role="button" tabindex="0" @click="router.push('/cowork-skills/' + s.id)">
              <MpIcon name="settings" size="sm" /><span>{{ s.name }}</span><span class="kbd-usedby__kind">Skill</span>
            </div>
          </template>
          <p v-else class="kbd-none">Not attached to any agent or skill yet.</p>
        </section>
      </aside>
    </div>

    <ConfirmModal v-model:is-open="deleteOpen" title="Delete document" :description="`“${doc.name}” will be permanently deleted and detached from any agent or skill using it.`" confirm-label="Delete" @confirm="confirmDelete" />
  </template>

  <div v-else class="kbd-missing">
    <MpIcon name="doc" size="lg" />
    <p>Document not found.</p>
    <MpButton is-rounded variant="secondary" @click="router.push('/cowork-knowledge')">Back to Knowledge</MpButton>
  </div>
</template>

<style scoped>
.kbd-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.kbd-bar__left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kbd-crumbs { display: flex; align-items: center; gap: 2px; }
.kbd-crumb { background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.kbd-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.kbd-crumb-sep { color: var(--mp-icon-subtle, #97a0af); }
.kbd-title { margin: 0; display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.kbd-ext { font-size: 10px; font-weight: 600; letter-spacing: 0.4px; color: var(--mp-text-secondary); background: var(--mp-background-neutral, #eceef0); border-radius: 4px; padding: 2px 6px; }
.kbd-bar__actions { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }

.kbd-stage { flex: 1; min-height: 0; display: flex; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; overflow: hidden; }
.kbd-content { flex: 1; min-width: 0; height: 100%; overflow-y: auto; padding: var(--mp-spacing-6, 24px); }
.kbd-warn { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-warning-subtle, #fff8eb); border: 1px solid var(--mp-border-warning, #f5c26b); border-radius: 8px; font-size: 12px; color: var(--mp-text-default); }
.kbd-processing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-16, 64px); color: var(--mp-text-secondary); }
.kbd-image { max-width: 100%; height: auto; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; }
.kbd-text { margin: 0; max-width: 820px; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 20px; color: var(--mp-text-default); }
.kbd-editor { display: block; width: 100%; max-width: 820px; min-height: calc(100vh - 240px); box-sizing: border-box; resize: vertical; padding: var(--mp-spacing-4, 16px); border: 1px solid var(--mp-border-default, #dcdfe4); border-radius: 10px; background: var(--mp-background-default, #fff); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 20px; color: var(--mp-text-default); }
.kbd-editor:focus { outline: none; border-color: var(--mp-border-active, #0a6e4e); box-shadow: 0 0 0 3px rgba(10,110,78,0.12); }
.kbd-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-16, 64px); color: var(--mp-text-secondary); }

.kbd-side { flex-shrink: 0; width: 320px; height: 100%; overflow-y: auto; border-left: 1px solid var(--mp-border-default, #dcdfe4); padding: var(--mp-spacing-5, 20px); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.kbd-card { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 10px; padding: var(--mp-spacing-4, 16px); background: var(--mp-background-default, #fff); }
.kbd-card__title { margin: 0 0 var(--mp-spacing-2); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--mp-text-secondary); }
.kbd-summary { margin: 0; font-size: 13px; line-height: 20px; color: var(--mp-text-default); }
.kbd-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.kbd-tag { font-size: 11px; color: var(--mp-text-default); background: var(--mp-background-neutral-subtle, #f0f1f3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 999px; padding: 2px 10px; }
.kbd-meta { margin: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.kbd-meta > div { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); font-size: 13px; }
.kbd-meta dt { color: var(--mp-text-secondary); flex-shrink: 0; }
.kbd-meta dd { margin: 0; color: var(--mp-text-default); text-align: right; overflow: hidden; text-overflow: ellipsis; }
.kbd-link { background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-link); font: inherit; }
.kbd-link:hover { text-decoration: underline; }
.kbd-usedby { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: 6px 4px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--mp-text-default); }
.kbd-usedby:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.kbd-usedby span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbd-usedby__kind { margin-left: auto; flex-shrink: 0; font-size: 10px; color: var(--mp-text-secondary); background: var(--mp-background-neutral, #eceef0); border-radius: 4px; padding: 1px 6px; }
.kbd-none { margin: 0; font-size: 13px; color: var(--mp-text-secondary); }

.kbd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }
</style>
