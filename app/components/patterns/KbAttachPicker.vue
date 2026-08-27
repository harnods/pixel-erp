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
const search = ref('')
watch(() => props.isOpen, (open) => { if (open) search.value = '' })
const expanded = ref<Set<string>>(new Set())
function toggleExpand(id: string) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}
interface Row { node: KbNode; depth: number; coveredByFolder: boolean }
const rows = computed<Row[]>(() => {
  // Search → flat list of matching nodes (no tree hierarchy).
  const q = search.value.trim().toLowerCase()
  if (q) {
    return coworkKb
      .filter((n) => n.name.toLowerCase().includes(q))
      .map((n) => ({ node: n, depth: 0, coveredByFolder: isDoc(n) ? parentCovered(n.parentId) : false }))
  }
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
            <button class="kap-close" type="button" aria-label="Close" @click="cancel"><MpIcon name="close" size="md" /></button>
          </header>

          <div class="kap-searchbar">
            <div class="kap-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="kap-search-input" type="text" placeholder="Search knowledge..." />
              <button v-if="search" class="kap-search-clear" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
          </div>

          <div class="kap-tree">
            <p v-if="!rows.length" class="kap-empty">{{ search ? 'No matches found.' : 'Your Knowledge Base is empty. Add documents first.' }}</p>
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
              <MpButton variant="ghost" is-rounded @click="cancel">Cancel</MpButton>
              <MpButton variant="primary" is-rounded @click="done">Attach</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Right-side floating ERP drawer (matches SelectProductDrawer / SelectAccessDrawer):
   slide-in from the right, 12px margin, rounded corners. */
.kap-enter-active, .kap-leave-active { transition: background-color 250ms ease; }
.kap-enter-from, .kap-leave-to { background-color: transparent; }
.kap-enter-active .kap-panel { transition: transform 350ms ease-out; }
.kap-leave-active .kap-panel { transition: transform 250ms ease-in; }
.kap-enter-from .kap-panel, .kap-leave-to .kap-panel { transform: translateX(calc(100% + 12px)); }
.kap-overlay { position: fixed; inset: 0; z-index: 1400; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.kap-panel { margin: var(--mp-spacing-3, 12px); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.kap-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.kap-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.kap-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.kap-close:hover { background: var(--mp-background-neutral-hovered); }
/* Search */
.kap-searchbar { flex-shrink: 0; padding: var(--mp-spacing-4) var(--mp-spacing-4) 0; }
.kap-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }
.kap-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.kap-search-input::placeholder { color: var(--mp-text-placeholder); }
.kap-search-clear { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary)); border-radius: var(--mp-radii-full, 999px); }
.kap-search-clear:hover { background: var(--mp-background-neutral-hovered); }
.kap-tree { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.kap-empty { padding: var(--mp-spacing-6); text-align: center; font-size: 13px; color: var(--mp-text-secondary); }
.kap-row { display: flex; align-items: center; gap: 2px; min-height: 40px; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.kap-chev { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 28px; border: none; background: none; cursor: pointer; color: var(--mp-icon-default, #536062); border-radius: 4px; }
.kap-chev.is-hidden { visibility: hidden; }
.kap-label { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); flex: 1; min-width: 0; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
.kap-label:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.kap-icon { flex: 0 0 auto; color: var(--mp-icon-default, #536062); }
.kap-icon--folder { color: var(--mp-icon-brand, #0a6e4e); }
.kap-name { font-size: 13px; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kap-ext { flex: 0 0 auto; font-size: 10px; font-weight: 600; color: var(--mp-text-secondary); background: var(--mp-background-neutral, #eceef0); border-radius: 4px; padding: 1px 5px; }
.kap-covered { flex: 0 0 auto; font-size: 10px; color: var(--mp-text-secondary); font-style: italic; }
.kap-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3, 12px) var(--mp-spacing-4, 16px); border-top: 1px solid var(--mp-border-default); }
.kap-count { font-size: 12px; color: var(--mp-text-secondary); }
.kap-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
