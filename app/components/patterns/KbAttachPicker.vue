<script setup lang="ts">
/**
 * KbAttachPicker — pick Knowledge Base scopes (collections / folders / docs) to
 * attach to an agent or skill. Attaching a folder means "everything under it,
 * live" (a scope reference, not a copy). Reused by the agent form and the skill
 * detail page. Teleport overlay (MpModal has no structural CSS in this build).
 */
import { ref, computed, watch } from 'vue'
import { MpButton, MpIcon, MpCheckbox } from '@mekari/pixel3'
import {
  coworkKb, childrenOf, isFolder, isDoc, descendantFolderIds, extLabel,
  type KbNode, type KbAttachment,
} from '~/data/coworkKb'

const props = defineProps<{ isOpen: boolean; modelValue: KbAttachment[] }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'update:modelValue', v: KbAttachment[]): void }>()

// Working selection sets (folder ids + doc ids), seeded from the model on open.
const folderSel = ref<Set<string>>(new Set())
const docSel = ref<Set<string>>(new Set())
watch(() => props.isOpen, (open) => {
  if (!open) return
  const f = new Set<string>()
  const d = new Set<string>()
  for (const a of props.modelValue ?? []) {
    if (a.scope === 'doc') d.add(a.id)
    else f.add(a.id)
  }
  folderSel.value = f
  docSel.value = d
  // Auto-expand everything so the selection is visible.
  expanded.value = new Set(coworkKb.filter(isFolder).map((n) => n.id))
}, { immediate: true })

// ── Tree ─────────────────────────────────────────────────────────────────────
const expanded = ref<Set<string>>(new Set())
function toggleExpand(id: string) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}
interface Row { node: KbNode; depth: number; coveredByFolder: boolean }
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (parentId: string | null, depth: number, covered: boolean) => {
    for (const n of childrenOf(parentId)) {
      const isCovered = covered || (isFolder(n) ? false : parentCovered(n.parentId))
      out.push({ node: n, depth, coveredByFolder: covered })
      if (isFolder(n) && expanded.value.has(n.id)) walk(n.id, depth + 1, covered || folderSel.value.has(n.id))
    }
  }
  walk(null, 0, false)
  return out
})
// Is a doc's folder (or an ancestor) already selected as a folder scope?
function parentCovered(folderId: string): boolean {
  if (folderSel.value.has(folderId)) return true
  for (const fid of folderSel.value) {
    if (descendantFolderIds(fid).includes(folderId)) return true
  }
  return false
}

function toggleFolder(id: string) {
  const s = new Set(folderSel.value)
  s.has(id) ? s.delete(id) : s.add(id)
  folderSel.value = s
}
function toggleDoc(id: string) {
  const s = new Set(docSel.value)
  s.has(id) ? s.delete(id) : s.add(id)
  docSel.value = s
}
function docIcon(ext: string): string {
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) return 'file-image'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel-document'
  if (ext === 'pdf') return 'pdf-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'doc'
}

const selectedCount = computed(() => {
  // Docs not already covered by a selected folder + selected folders.
  let docs = 0
  for (const id of docSel.value) {
    const d = coworkKb.find((n) => n.id === id)
    if (d && isDoc(d) && !parentCovered(d.parentId)) docs++
  }
  return folderSel.value.size + docs
})

function done() {
  const out: KbAttachment[] = []
  for (const id of folderSel.value) out.push({ scope: 'folder', id, recursive: true })
  for (const id of docSel.value) {
    const d = coworkKb.find((n) => n.id === id)
    if (d && isDoc(d) && !parentCovered(d.parentId)) out.push({ scope: 'doc', id })
  }
  emit('update:modelValue', out)
  emit('update:isOpen', false)
}
function cancel() { emit('update:isOpen', false) }
</script>

<template>
  <Teleport to="body">
    <Transition name="kap">
      <div v-if="isOpen" class="kap-overlay" @click.self="cancel">
        <div class="kap-panel" role="dialog" aria-modal="true" aria-label="Attach knowledge">
          <header class="kap-head">
            <h2 class="kap-title">Attach knowledge</h2>
            <p class="kap-sub">Pick collections, folders or documents. A folder attaches everything inside it (live).</p>
          </header>

          <div class="kap-tree">
            <p v-if="!rows.length" class="kap-empty">Your Knowledge Base is empty. Add documents first.</p>
            <div v-for="row in rows" :key="row.node.id" class="kap-row" :style="{ paddingLeft: `${8 + row.depth * 20}px` }">
              <button v-if="isFolder(row.node)" class="kap-chev" type="button" :class="{ 'is-hidden': !childrenOf(row.node.id).length }" @click="toggleExpand(row.node.id)">
                <MpIcon :name="expanded.has(row.node.id) ? 'caret-down' : 'caret-right'" size="sm" />
              </button>
              <span v-else class="kap-chev is-hidden" />
              <label class="kap-label">
                <MpCheckbox
                  v-if="isFolder(row.node)"
                  :id="`kap-${row.node.id}`"
                  :is-checked="folderSel.has(row.node.id)"
                  @change="toggleFolder(row.node.id)" />
                <MpCheckbox
                  v-else
                  :id="`kap-${row.node.id}`"
                  :is-checked="docSel.has(row.node.id) || row.coveredByFolder"
                  :is-disabled="row.coveredByFolder"
                  @change="toggleDoc(row.node.id)" />
                <MpIcon :name="isFolder(row.node) ? 'folder-close' : docIcon((row.node as any).ext)" size="sm" class="kap-icon" :class="{ 'kap-icon--folder': isFolder(row.node) }" />
                <span class="kap-name">{{ row.node.name }}</span>
                <span v-if="isDoc(row.node)" class="kap-ext">{{ extLabel((row.node as any).ext) }}</span>
                <span v-if="row.coveredByFolder" class="kap-covered">via folder</span>
              </label>
            </div>
          </div>

          <footer class="kap-foot">
            <span class="kap-count">{{ selectedCount }} attached</span>
            <div class="kap-actions">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="cancel">Cancel</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="done">Attach</button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.kap-enter-active, .kap-leave-active { transition: opacity 200ms ease; }
.kap-enter-from, .kap-leave-to { opacity: 0; }
.kap-enter-active .kap-panel, .kap-leave-active .kap-panel { transition: transform 200ms ease, opacity 200ms ease; }
.kap-enter-from .kap-panel, .kap-leave-to .kap-panel { transform: scale(0.96); opacity: 0; }
.kap-overlay { position: fixed; inset: 0; z-index: 1400; background: rgba(8, 13, 14, 0.45); display: flex; align-items: flex-start; justify-content: center; }
.kap-panel { width: min(520px, calc(100% - 32px)); margin-top: 72px; max-height: calc(100vh - 144px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-lg, 12px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1); overflow: hidden; }
.kap-head { padding: var(--mp-spacing-5, 20px) var(--mp-spacing-5) var(--mp-spacing-3); }
.kap-title { margin: 0; font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.kap-sub { margin: 4px 0 0; font-size: 12px; color: var(--mp-text-secondary); }
.kap-tree { flex: 1; min-height: 120px; overflow-y: auto; padding: var(--mp-spacing-2) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.kap-empty { padding: var(--mp-spacing-6); text-align: center; font-size: 13px; color: var(--mp-text-secondary); }
.kap-row { display: flex; align-items: center; gap: 2px; min-height: 34px; }
.kap-chev { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 28px; border: none; background: none; cursor: pointer; color: var(--mp-icon-default, #536062); border-radius: 4px; }
.kap-chev.is-hidden { visibility: hidden; }
.kap-label { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); flex: 1; min-width: 0; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
.kap-label:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.kap-icon { flex: 0 0 auto; color: var(--mp-icon-default, #536062); }
.kap-icon--folder { color: var(--mp-icon-brand, #0a6e4e); }
.kap-name { font-size: 13px; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kap-ext { flex: 0 0 auto; font-size: 10px; font-weight: 600; color: var(--mp-text-secondary); background: var(--mp-background-neutral, #eceef0); border-radius: 4px; padding: 1px 5px; }
.kap-covered { flex: 0 0 auto; font-size: 10px; color: var(--mp-text-secondary); font-style: italic; }
.kap-foot { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3, 12px) var(--mp-spacing-5, 20px); }
.kap-count { font-size: 12px; color: var(--mp-text-secondary); }
.kap-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
