<script setup lang="ts">
/**
 * Cowork — Knowledge Base (/cowork-knowledge). A file manager for the reference
 * documents the AI co-worker grounds on: nested folders (folder-in-folder), any
 * file type (pdf/docx/xlsx/csv/md/png/…), upload + drag-drop. Docs are ingested
 * server-side (text extracted, summarised, chunked) so they can be attached to
 * agents and skills and retrieved at run time.
 *
 * Full-bleed page — owns its own title bar + stage. Current folder is driven by
 * ?folder=<id> so navigation deep-links. Folder management (new / rename /
 * add sub-folder / delete) lives on the sidebar tree; the title bar carries only
 * the Upload action.
 */
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { MpButton, MpIcon, MpInput, MpSpinner, MpBadge, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import {
  coworkKb, childrenOf, breadcrumbOf, getFolder, getNode, addFolder, renameNode, moveNode, deleteNode,
  descendantDocs, descendantFolderIds, isFolder, isDoc, extLabel,
  type KbNode, type KbFolder, type KbDoc,
} from '~/data/coworkKb'
import { useKbIngest } from '~/composables/useKbIngest'
import { getBlob, deleteBlob } from '~/utils/kbBlobStore'
import { formatDate, formatDateTime } from '~/utils/date'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import KbDocPreview from '~/components/patterns/KbDocPreview.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import { useTableState } from '~/composables/useTableState'

const router = useRouter()
const route = useRoute()
const { ingestFile } = useKbIngest()

// ── Current folder ───────────────────────────────────────────────────────────
const currentFolderId = computed<string | null>(() => {
  const f = route.query.folder
  return typeof f === 'string' && f ? f : null
})
const crumbs = computed<KbFolder[]>(() => (currentFolderId.value ? breadcrumbOf(currentFolderId.value) : []))
// Detail-page breadcrumb = a single small link back to where you came from
// (parent folder, or the Knowledge Base root). See docs/patterns/page-title-bar.md.
const parentCrumb = computed<{ id: string | null; label: string } | null>(() => {
  if (!currentFolderId.value) return null
  const f = getFolder(currentFolderId.value)
  const p = f?.parentId ? getFolder(f.parentId) : null
  return { id: p?.id ?? null, label: p?.name ?? 'File manager' }
})
function goTo(id: string | null) {
  router.push({ path: '/cowork-knowledge', query: id ? { folder: id } : {} })
}
function openDoc(id: string) { router.push(`/cowork-knowledge/doc/${id}`) }

// ── Current folder contents ──────────────────────────────────────────────────
const items = computed<KbNode[]>(() => childrenOf(currentFolderId.value))
function folderMeta(f: KbFolder): string {
  const docs = descendantDocs(f.id).length
  const subs = descendantFolderIds(f.id).length
  const parts: string[] = []
  if (subs) parts.push(`${subs} folder${subs > 1 ? 's' : ''}`)
  parts.push(`${docs} doc${docs === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
function fileSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
// File-type icons — exact Pixel library names (verified via get-icon-name).
const docIcon = (ext: string): string => {
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) return 'file-image'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel-document'
  if (ext === 'pdf') return 'pdf-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'doc'
}
const processingCount = computed(() => coworkKb.filter((n) => isDoc(n) && n.status === 'processing').length)
const emptyIllustration = '/illustrations/empty-folder.png'

// ── ERP table state (search / sort / pagination) ─────────────────────────────
const columns: TableColumn[] = [
  { key: 'name', label: 'Filename', width: '360px', sortable: true },
  { key: 'updatedAt', label: 'Last updated', width: '180px', sortable: true },
]
const {
  search, currentPage, perPage, sortKey, sortDir, total, paginated,
  hasActiveSearch, setPage, setPerPage, toggleSort, setSort,
} = useTableState<KbNode>(items, {
  perPage: 100000, // no server-style paging; the file manager uses progressive loading below
  filterFn: (row, s) => {
    if (!s) return true
    if (isDoc(row)) return [row.name, row.fileName, row.summary ?? '', (row.keywords ?? []).join(' '), row.text ?? ''].join(' ').toLowerCase().includes(s)
    return row.name.toLowerCase().includes(s)
  },
})

// ── Progressive loading (infinite scroll instead of pagination) ──────────────
const PAGE_STEP = 30
const visibleCount = ref(PAGE_STEP)
const visibleRows = computed(() => paginated.value.slice(0, visibleCount.value))
watch([currentFolderId, search], () => { visibleCount.value = PAGE_STEP })
function onMainScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160 && visibleCount.value < total.value) {
    visibleCount.value += PAGE_STEP
  }
}

// Thumbnails (image / rendered PDF page 1) loaded lazily from IndexedDB.
const thumbs = ref<Map<string, string>>(new Map())
async function loadThumbs() {
  for (const n of visibleRows.value) {
    if (!isDoc(n) || !n.thumb || thumbs.value.has(n.id)) continue
    const b = await getBlob(n.id)
    if (b?.thumbUrl) { const next = new Map(thumbs.value); next.set(n.id, b.thumbUrl); thumbs.value = next }
  }
}
watch(visibleRows, loadThumbs, { deep: true, immediate: true })

// ── Bulk actions (selection is managed by ErpTablePage → indices into `paginated`) ──
const selectedCount = ref(0)
function rowsOf(sel: Set<number>): KbNode[] { return [...sel].map((i) => visibleRows.value[i]).filter(Boolean) as KbNode[] }
const bulkRows = ref<KbNode[]>([])
const bulkDeselect = ref<null | (() => void)>(null)

const bulkDeleteOpen = ref(false)
const bulkDeleteMessage = computed(() => `${bulkRows.value.length} item${bulkRows.value.length > 1 ? 's' : ''} — folders and every file inside them — will be permanently deleted. This cannot be undone.`)
function openBulkDelete(sel: Set<number>, deselect: () => void) { bulkRows.value = rowsOf(sel); bulkDeselect.value = deselect; bulkDeleteOpen.value = true }
function confirmBulkDelete() {
  for (const n of bulkRows.value) { for (const r of deleteNode(n.id)) deleteBlob(r) }
  if (previewId.value && !getNode(previewId.value)) previewId.value = null
  bulkDeselect.value?.()
  toast.notify({ variant: 'success', title: 'Deleted' })
}

const bulkMoveOpen = ref(false)
const bulkMoveTarget = ref('')
function openBulkMove(sel: Set<number>, deselect: () => void) { bulkRows.value = rowsOf(sel); bulkDeselect.value = deselect; bulkMoveTarget.value = ''; bulkMoveOpen.value = true }
function submitBulkMove() {
  const target = bulkMoveTarget.value || null
  let ok = 0
  for (const n of bulkRows.value) { if (moveNode(n.id, target)) ok++ }
  bulkDeselect.value?.()
  toast.notify({ variant: 'success', title: `Moved ${ok} item${ok > 1 ? 's' : ''}` })
  bulkMoveOpen.value = false
}

// ── Inline preview panel (right column) — no page navigation, drag-resizable ──
const previewId = ref<string | null>(null)
function openPreview(id: string) {
  // Default to 50% of the area right of the folder tree (clamped to the resize bounds).
  if (stageRef.value) {
    const avail = stageRef.value.clientWidth - 240
    previewWidth.value = Math.min(Math.max(avail * 0.5, 400), avail * 0.75)
  }
  previewId.value = id
}
function closePreview() { previewId.value = null }
function onPreviewDeleted() { previewId.value = null }
watch(currentFolderId, () => { previewId.value = null })

const stageRef = ref<HTMLElement | null>(null)
const previewWidth = ref(560)
let resizing = false
function onResize(e: PointerEvent) {
  if (!resizing || !stageRef.value) return
  const rect = stageRef.value.getBoundingClientRect()
  const availableRight = rect.width - 240 // minus the folder tree
  const max = Math.max(400, availableRight * 0.75) // cap at 75% of the area right of the tree
  previewWidth.value = Math.min(Math.max(rect.right - e.clientX, 400), max)
}
function endResize() { resizing = false; document.body.style.cursor = ''; window.removeEventListener('pointermove', onResize); window.removeEventListener('pointerup', endResize) }
function startResize(e: PointerEvent) {
  resizing = true
  document.body.style.cursor = 'col-resize'
  window.addEventListener('pointermove', onResize)
  window.addEventListener('pointerup', endResize)
  e.preventDefault()
}
onBeforeUnmount(endResize)

// ── Folder tree (left) ───────────────────────────────────────────────────────
const expanded = ref<Set<string>>(new Set())
function toggleExpand(id: string) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}
function expand(id: string) { const s = new Set(expanded.value); s.add(id); expanded.value = s }
interface TreeRow { folder: KbFolder; depth: number; hasChildren: boolean }
const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const n of childrenOf(parentId)) {
      if (!isFolder(n)) continue
      const kids = childrenOf(n.id).some(isFolder)
      rows.push({ folder: n, depth, hasChildren: kids })
      if (expanded.value.has(n.id)) walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
})

// ── Upload ───────────────────────────────────────────────────────────────────
// Files always land in an explicit folder. Inside a folder → the button reads
// "Upload to <folder>" and drops there. At the root → the button asks which
// folder first (never silently invents one). Drag-drop uses the same rule.
const uploadInput = ref<HTMLInputElement | null>(null)
const pendingTarget = ref<string | null>(null)
const uploadPicker = ref(false)
const uploadPickTarget = ref('')

const currentFolderName = computed(() => (currentFolderId.value ? getFolder(currentFolderId.value)?.name ?? '' : ''))

// Every folder, flattened + indented, for the "choose folder" picker.
const folderOptions = computed<{ id: string; label: string }[]>(() => {
  const opts: { id: string; label: string }[] = []
  const walk = (parentId: string | null, prefix: string) => {
    for (const n of childrenOf(parentId)) {
      if (!isFolder(n)) continue
      opts.push({ id: n.id, label: prefix + n.name })
      walk(n.id, prefix + '— ')
    }
  }
  walk(null, '')
  return opts
})

function triggerUpload() {
  if (currentFolderId.value) { pendingTarget.value = currentFolderId.value; uploadInput.value?.click(); return }
  // At the root — pick a folder first (or make one if there are none).
  if (!folderOptions.value.length) {
    infoToast('Create a folder first — add one from the sidebar, then upload into it.')
    openNewFolder(null)
    return
  }
  uploadPickTarget.value = ''
  uploadPicker.value = true
}
function confirmUploadPick() {
  if (!uploadPickTarget.value) return
  pendingTarget.value = uploadPickTarget.value
  uploadPicker.value = false
  uploadInput.value?.click()
}

function onUploadChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const target = pendingTarget.value ?? currentFolderId.value
  if (input.files?.length && target) runUpload(target, input.files)
  input.value = ''
  pendingTarget.value = null
}

// ── Upload progress (bottom-right panel) ─────────────────────────────────────
interface UploadItem { id: string; name: string; folder: string; ext: string; status: 'uploading' | 'done' | 'failed'; thumbUrl?: string }
const uploads = ref<UploadItem[]>([])
const uploadsOpen = ref(false)
const uploadsCollapsed = ref(false)
let uploadSeq = 0
const uploadDone = computed(() => uploads.value.filter((u) => u.status !== 'uploading').length)
const uploadActive = computed(() => uploads.value.some((u) => u.status === 'uploading'))
const uploadPct = computed(() => (uploads.value.length ? Math.round((uploadDone.value / uploads.value.length) * 100) : 0))
function closeUploads() { uploadsOpen.value = false; uploads.value = [] }
function uItemIcon(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return docIcon(ext)
}

/** Ingest a batch into a specific folder, streaming per-file progress to the panel. */
async function runUpload(folderId: string, filesLike: FileList | File[]) {
  const files = Array.from(filesLike)
  if (!files.length) return
  const folder = getFolder(folderId)?.name ?? 'Knowledge'
  const entries = files.map((f) => reactive<UploadItem>({ id: `u${uploadSeq++}`, name: f.name, folder, ext: (f.name.split('.').pop() || '').toLowerCase(), status: 'uploading' }))
  uploads.value = [...entries, ...uploads.value]
  uploadsOpen.value = true
  for (let i = 0; i < files.length; i++) {
    try {
      const doc = await ingestFile(folderId, files[i]!)
      entries[i]!.status = 'done'
      // Image / PDF → show the real thumbnail; other types keep the file-type icon.
      if (doc?.thumb) { const b = await getBlob(doc.id); if (b?.thumbUrl) entries[i]!.thumbUrl = b.thumbUrl }
    } catch { entries[i]!.status = 'failed' }
  }
  // Auto-dismiss once nothing is in flight (kept if a new batch started meanwhile).
  setTimeout(() => { if (!uploadActive.value) { uploadsOpen.value = false; uploads.value = [] } }, 4000)
}

// ── Drag & drop onto a folder (sidebar / list item) or the open folder's pane ──
const dragTargetId = ref<string | null>(null)  // folder id currently highlighted
const dragMain = ref(false)                     // main pane background highlighted
function dtHasFiles(e: DragEvent) { return Array.from(e.dataTransfer?.types ?? []).includes('Files') }
function onDragFolder(e: DragEvent, id: string) { if (!dtHasFiles(e)) return; e.preventDefault(); dragTargetId.value = id; dragMain.value = false }
function onLeaveFolder(id: string) { if (dragTargetId.value === id) dragTargetId.value = null }
function onDropFolder(e: DragEvent, id: string) { if (!dtHasFiles(e)) return; e.preventDefault(); dragTargetId.value = null; if (e.dataTransfer?.files?.length) runUpload(id, e.dataTransfer.files) }
function onDragMain(e: DragEvent) { if (!dtHasFiles(e)) return; e.preventDefault(); if (!dragTargetId.value) dragMain.value = !!currentFolderId.value }
function onLeaveMain() { dragMain.value = false }
function onDropMain(e: DragEvent) {
  if (!dtHasFiles(e)) return
  e.preventDefault(); dragMain.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return
  if (currentFolderId.value) runUpload(currentFolderId.value, files)
  else infoToast('Open a folder first — drop files onto a folder, or open one and drop them here.')
}

// ── New folder / rename / add sub-folder / move / delete ──────────────────────
const nameModal = ref<{ open: boolean; mode: 'new' | 'rename'; id?: string; parentId: string | null; value: string }>({ open: false, mode: 'new', parentId: null, value: '' })
function openNewFolder(parentId: string | null = null) { nameModal.value = { open: true, mode: 'new', parentId, value: '' } }
function openAddSub(folder: KbFolder) { expand(folder.id); openNewFolder(folder.id) }
function openRename(n: KbNode) { nameModal.value = { open: true, mode: 'rename', id: n.id, parentId: null, value: n.name } }
function submitName() {
  const v = nameModal.value.value.trim()
  if (!v) return
  if (nameModal.value.mode === 'new') {
    const f = addFolder(nameModal.value.parentId, v)
    toast.notify({ variant: 'success', title: 'Folder created' })
    nameModal.value.open = false
    goTo(f.id)
  } else if (nameModal.value.id) {
    renameNode(nameModal.value.id, v)
    toast.notify({ variant: 'success', title: 'Renamed' })
    nameModal.value.open = false
  }
}

const moveModal = ref<{ open: boolean; id?: string; target: string }>({ open: false, target: '' })
function openMove(n: KbNode) { moveModal.value = { open: true, id: n.id, target: n.parentId ?? '' } }
const moveTargets = computed<{ id: string; label: string }[]>(() => {
  const id = moveModal.value.id
  const blocked = new Set<string>(id ? [id, ...descendantFolderIds(id)] : [])
  const opts: { id: string; label: string }[] = [{ id: '', label: 'Top level (Collections)' }]
  const walk = (parentId: string | null, prefix: string) => {
    for (const n of childrenOf(parentId)) {
      if (!isFolder(n) || blocked.has(n.id)) continue
      opts.push({ id: n.id, label: prefix + n.name })
      walk(n.id, prefix + '— ')
    }
  }
  walk(null, '')
  return opts
})
function submitMove() {
  if (!moveModal.value.id) return
  const ok = moveNode(moveModal.value.id, moveModal.value.target || null)
  toast.notify(ok ? { variant: 'success', title: 'Moved' } : { variant: 'error', title: "Can't move a folder into itself" })
  if (ok) moveModal.value.open = false
}

const deleteModal = ref<{ open: boolean; node?: KbNode }>({ open: false })
function openDelete(n: KbNode) { deleteModal.value = { open: true, node: n } }
function confirmDelete() {
  const n = deleteModal.value.node
  if (!n) return
  const wasInside = isFolder(n) && currentFolderId.value ? [n.id, ...descendantFolderIds(n.id)].includes(currentFolderId.value) : false
  const removed = deleteNode(n.id)
  for (const id of removed) deleteBlob(id)
  toast.notify({ variant: 'success', title: isFolder(n) ? 'Folder deleted' : 'Document deleted' })
  // If the folder we were viewing (or an ancestor) got deleted, fall back to root.
  if (wasInside) goTo(null)
}
const deleteMessage = computed(() => {
  const n = deleteModal.value.node
  if (!n) return ''
  if (isFolder(n)) {
    const d = descendantDocs(n.id).length
    return `“${n.name}” and every file inside it${d ? ` (${d} document${d > 1 ? 's' : ''})` : ''} will be permanently deleted. This cannot be undone.`
  }
  return `“${n.name}” will be permanently deleted and detached from any agent or skill using it.`
})
</script>

<template>
  <header class="kbp-bar">
    <div class="kbp-bar__left">
      <button v-if="parentCrumb" class="kbp-breadcrumb" type="button" @click="goTo(parentCrumb.id)">{{ parentCrumb.label }}</button>
      <h1 class="kbp-title">
        {{ currentFolderId ? getFolder(currentFolderId)?.name : 'File manager' }}
        <MpBadge v-if="processingCount" for="additionalInformation" type="warning" size="sm">{{ processingCount }} processing</MpBadge>
      </h1>
    </div>
  </header>

  <div ref="stageRef" class="kbp-stage">
    <!-- Folder tree -->
    <nav class="kbp-tree">
      <div class="kbp-tree-head">
        <span class="kbp-tree-head__label">Folders</span>
        <button class="kbp-tree-add" type="button" aria-label="New folder" @click="openNewFolder(null)"><MpIcon name="add" size="sm" /></button>
      </div>
      <div v-for="row in treeRows" :key="row.folder.id" class="kbp-tnode-row" :class="{ 'is-drop': dragTargetId === row.folder.id }" :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
        @dragover="onDragFolder($event, row.folder.id)" @dragleave="onLeaveFolder(row.folder.id)" @drop="onDropFolder($event, row.folder.id)">
        <button class="kbp-tchev" type="button" :class="{ 'is-hidden': !row.hasChildren }" @click.stop="toggleExpand(row.folder.id)" :aria-label="expanded.has(row.folder.id) ? 'Collapse' : 'Expand'">
          <MpIcon :name="expanded.has(row.folder.id) ? 'caret-down' : 'caret-right'" size="sm" />
        </button>
        <button class="kbp-tnode kbp-tnode--flex" type="button" :class="{ 'is-active': row.folder.id === currentFolderId }" @click="goTo(row.folder.id)">
          <MpIcon name="folder-close" size="sm" /><span>{{ row.folder.name }}</span>
        </button>
        <MpPopover :id="`kbp-folder-act-${row.folder.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="kbp-tmore" type="button" aria-label="Folder options" @click.stop><MpIcon name="menu-kebab" size="sm" /></button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px' })">
            <MpPopoverList>
              <MpPopoverListItem @click="openRename(row.folder)">Rename</MpPopoverListItem>
              <MpPopoverListItem @click="openAddSub(row.folder)">Add sub-folder</MpPopoverListItem>
              <MpPopoverListItem @click="openDelete(row.folder)">Delete folder</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
      <p v-if="!treeRows.length" class="kbp-tree-empty">No folders yet. Use <strong>+</strong> to add one.</p>
    </nav>

    <!-- Contents: ERP table (24px padded) -->
    <section class="kbp-main" :class="{ 'is-drop': dragMain }" @scroll="onMainScroll" @dragover="onDragMain" @dragleave="onLeaveMain" @drop="onDropMain">
      <div v-if="dragMain" class="kbp-drop-overlay">
        <div class="kbp-drop-inner">
          <p>Drop files to add to “{{ currentFolderName || 'File manager' }}”</p>
        </div>
      </div>
      <ErpTablePage
        :columns="columns"
        :rows="(visibleRows as Record<string, unknown>[])"
        :total="total"
        :current-page="1"
        :per-page="Math.max(visibleCount, PAGE_STEP)"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        has-checkbox
        bulk-label="item"
        :search="search"
        :has-active-filter="hasActiveSearch"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="() => search = ''"
        @selection-change="(c: number) => selectedCount = c"
      >
        <template #filters>
          <div class="kbp-filter-left" />
          <div class="kbp-filter-right">
            <div class="filter-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <input v-model="search" class="filter-search-input" type="text" placeholder="Search files" aria-label="Search files" />
              <button v-if="search" class="filter-search-clear" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
            <MpButton is-rounded variant="tertiary" @click="triggerUpload">Upload file</MpButton>
            <input ref="uploadInput" type="file" multiple class="kbp-file-input"
              accept=".md,.markdown,.txt,.csv,.tsv,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif"
              @change="onUploadChange" />
          </div>
        </template>

        <template #bulk-actions="{ selectedRows, deselectAll }">
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="openBulkMove(selectedRows as Set<number>, deselectAll)">Move to…</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="openBulkDelete(selectedRows as Set<number>, deselectAll)">Delete</button>
        </template>

        <template #cell-name="{ row }">
          <button class="kbp-namecell" type="button" @click.stop="isFolder(row as KbNode) ? goTo((row as KbNode).id) : openPreview((row as KbNode).id)">
            <img v-if="isDoc(row as KbNode) && thumbs.get((row as KbNode).id)" :src="thumbs.get((row as KbNode).id)" :alt="(row as KbNode).name" class="kbp-item__thumb" />
            <MpIcon v-else :name="isFolder(row as KbNode) ? 'folder-close' : docIcon((row as KbDoc).ext)" size="md" class="kbp-item__icon" :class="{ 'kbp-item__icon--folder': isFolder(row as KbNode) }" />
            <span class="kbp-namecell__body">
              <span class="kbp-namecell__top">
                <span class="kbp-item__name">{{ (row as KbNode).name }}</span>
                <span v-if="isDoc(row as KbNode)" class="kbp-ext-badge">{{ extLabel((row as KbDoc).ext) }}</span>
                <MpSpinner v-if="isDoc(row as KbNode) && (row as KbDoc).status === 'processing'" size="sm" />
                <MpBadge v-else-if="isDoc(row as KbNode) && (row as KbDoc).status === 'failed'" for="additionalInformation" type="critical" size="sm">Failed</MpBadge>
              </span>
              <span class="kbp-namecell__sub">
                <template v-if="isFolder(row as KbNode)">{{ folderMeta(row as KbFolder) }}</template>
                <template v-else>{{ fileSize((row as KbDoc).sizeBytes) }}</template>
              </span>
            </span>
          </button>
        </template>

        <template #cell-updatedAt="{ row }">
          <template v-if="isDoc(row as KbNode)">
            <span class="kbp-upd__date">{{ formatDateTime((row as KbNode).updatedAt) }}</span>
            <span class="kbp-upd__by">{{ (row as KbDoc).uploadedBy ?? '—' }}</span>
          </template>
          <span v-else class="kbp-upd__date">{{ formatDate((row as KbNode).updatedAt) }}</span>
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`kbp-act-${(row as KbNode).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="kbp-item__more" type="button" aria-label="Actions"><MpIcon name="menu-kebab" size="sm" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList v-if="isDoc(row as KbNode)">
                <MpPopoverListItem @click="openPreview((row as KbNode).id)">View details</MpPopoverListItem>
                <MpPopoverListItem @click="openDelete(row as KbNode)">Delete</MpPopoverListItem>
              </MpPopoverList>
              <MpPopoverList v-else>
                <MpPopoverListItem @click="goTo((row as KbNode).id)">Open</MpPopoverListItem>
                <MpPopoverListItem @click="openRename(row as KbNode)">Rename</MpPopoverListItem>
                <MpPopoverListItem @click="openDelete(row as KbNode)">Delete folder</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #empty>
          <div class="empty-full">
            <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
            <p class="empty-full-title">No files</p>
            <p class="empty-full-desc">Files will appear here.</p>
            <button class="btn-enterprise btn-enterprise--secondary kbp-empty-cta" type="button" @click="triggerUpload">Upload file</button>
          </div>
        </template>
      </ErpTablePage>
    </section>

    <!-- Inline preview column (no page navigation), drag-resizable -->
    <aside v-if="previewId" class="kbp-previewcol" :style="{ width: previewWidth + 'px' }">
      <div class="kbp-resize" role="separator" aria-label="Resize preview" @pointerdown="startResize" />
      <KbDocPreview :doc-id="previewId" @close="closePreview" @deleted="onPreviewDeleted"
        @open-agent="(id: string) => router.push('/cowork-agents/' + id)"
        @open-skill="(id: string) => router.push('/cowork-skills/' + id)" />
    </aside>
  </div>

  <!-- Upload progress (bottom-right) -->
  <Teleport to="body">
    <Transition name="kup">
      <div v-if="uploadsOpen && uploads.length" class="kbp-uploads" role="status" aria-live="polite">
        <div class="kbp-uploads__head">
          <span class="kbp-uploads__title">{{ uploadActive ? `Uploading ${uploads.length} item${uploads.length > 1 ? 's' : ''}` : `${uploads.length} upload${uploads.length > 1 ? 's' : ''} complete` }}</span>
          <button class="kbp-uploads__ico" type="button" :aria-label="uploadsCollapsed ? 'Expand' : 'Collapse'" @click="uploadsCollapsed = !uploadsCollapsed"><MpIcon :name="uploadsCollapsed ? 'caret-up' : 'caret-down'" size="sm" /></button>
          <button class="kbp-uploads__ico" type="button" aria-label="Dismiss" @click="closeUploads"><MpIcon name="close" size="sm" /></button>
        </div>
        <template v-if="!uploadsCollapsed">
          <div v-if="uploadActive" class="kbp-uploads__status">
            <span>Less than a minute left</span>
            <button class="kbp-uploads__cancel" type="button" @click="closeUploads">Cancel</button>
          </div>
          <ul class="kbp-uploads__list">
            <li v-for="u in uploads" :key="u.id" class="kbp-uploads__item" :class="{ 'is-pending': u.status === 'uploading' }">
              <img v-if="u.thumbUrl" :src="u.thumbUrl" :alt="u.name" class="kbp-uploads__thumb" />
              <MpIcon v-else :name="docIcon(u.ext)" size="md" class="kbp-uploads__ficon" />
              <span class="kbp-uploads__name">{{ u.name }}</span>
              <span v-if="u.status === 'uploading'" class="kbp-uploads__ring"><MpSpinner size="sm" /></span>
              <span v-else-if="u.status === 'done'" class="kbp-uploads__check"><MpIcon name="check" size="sm" /></span>
              <span v-else class="kbp-uploads__x"><MpIcon name="close" size="sm" /></span>
            </li>
          </ul>
        </template>
      </div>
    </Transition>
  </Teleport>

  <!-- New folder / rename -->
  <Teleport to="body">
    <Transition name="cm">
      <div v-if="nameModal.open" class="cm-overlay" @click.self="nameModal.open = false">
        <div class="cm-panel" role="dialog" aria-modal="true">
          <p class="cm-title">{{ nameModal.mode === 'new' ? (nameModal.parentId ? 'New sub-folder' : 'New folder') : 'Rename' }}</p>
          <div class="cm-field">
            <MpInput id="kbp-name" v-model="nameModal.value" placeholder="Folder name" autofocus @keydown.enter="submitName" />
          </div>
          <div class="cm-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="nameModal.open = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submitName">{{ nameModal.mode === 'new' ? 'Create' : 'Save changes' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Move -->
  <Teleport to="body">
    <Transition name="cm">
      <div v-if="moveModal.open" class="cm-overlay" @click.self="moveModal.open = false">
        <div class="cm-panel" role="dialog" aria-modal="true">
          <p class="cm-title">Move to</p>
          <div class="cm-field">
            <select v-model="moveModal.target" class="kbp-select">
              <option v-for="o in moveTargets" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </div>
          <div class="cm-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="moveModal.open = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submitMove">Move</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Choose folder to upload into (shown when uploading from the root) -->
  <Teleport to="body">
    <Transition name="cm">
      <div v-if="uploadPicker" class="cm-overlay" @click.self="uploadPicker = false">
        <div class="cm-panel" role="dialog" aria-modal="true">
          <p class="cm-title">Upload to which folder?</p>
          <div class="cm-field">
            <select v-model="uploadPickTarget" class="kbp-select">
              <option value="" disabled>Choose a folder…</option>
              <option v-for="o in folderOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </div>
          <div class="cm-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="uploadPicker = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirmUploadPick">Continue</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Bulk move -->
  <Teleport to="body">
    <Transition name="cm">
      <div v-if="bulkMoveOpen" class="cm-overlay" @click.self="bulkMoveOpen = false">
        <div class="cm-panel" role="dialog" aria-modal="true">
          <p class="cm-title">Move {{ bulkRows.length }} item{{ bulkRows.length > 1 ? 's' : '' }} to</p>
          <div class="cm-field">
            <select v-model="bulkMoveTarget" class="kbp-select">
              <option value="">Top level (Collections)</option>
              <option v-for="o in folderOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </div>
          <div class="cm-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="bulkMoveOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submitBulkMove">Move</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Bulk delete -->
  <ConfirmModal v-model:is-open="bulkDeleteOpen" title="Delete selected" :description="bulkDeleteMessage" confirm-label="Delete" @confirm="confirmBulkDelete" />

  <!-- Delete -->
  <ConfirmModal v-model:is-open="deleteModal.open" title="Delete folder" :description="deleteMessage" confirm-label="Delete" @confirm="confirmDelete" />
</template>

<style scoped>
.kbp-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.kbp-bar__left { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.kbp-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md, 20px); }
.kbp-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.kbp-title { margin: 0; display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.kbp-bar__actions { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }

.kbp-stage { flex: 1; min-height: 0; display: flex; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; overflow: hidden; }

/* Tree */
.kbp-tree { flex-shrink: 0; width: 240px; height: 100%; overflow-y: auto; border-right: 1px solid var(--mp-border-default, #dcdfe4); padding: var(--mp-spacing-3, 12px) var(--mp-spacing-2, 8px); display: flex; flex-direction: column; gap: 2px; }
.kbp-tree-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 8px; }
.kbp-tree-head__label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--mp-text-secondary); }
.kbp-tree-add { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: none; border-radius: 6px; cursor: pointer; color: var(--mp-icon-default, #536062); }
.kbp-tree-add:hover { background: var(--mp-background-neutral, #e3e7e9); }
.kbp-tnode-row { display: flex; align-items: center; gap: 0; border-radius: var(--mp-radii-md, 6px); }
.kbp-tnode-row:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.kbp-tchev { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 28px; border: none; background: none; cursor: pointer; color: var(--mp-icon-default, #536062); border-radius: 4px; }
.kbp-tchev.is-hidden { visibility: hidden; }
.kbp-tnode { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); width: 100%; padding: 6px 8px; border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; font-size: 13px; line-height: 16px; color: var(--mp-text-default); text-align: left; }
.kbp-tnode--flex { flex: 1; min-width: 0; }
.kbp-tnode.is-active { font-weight: var(--mp-font-weights-medium, 500); }
.kbp-tnode-row:has(.is-active) { background: #ebf0f1; }
.kbp-tnode :deep(svg) { flex: 0 0 auto; color: var(--mp-icon-default, #536062); }
.kbp-tnode span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbp-tmore { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; margin-right: 2px; border: none; background: none; border-radius: 6px; cursor: pointer; color: var(--mp-icon-default, #536062); opacity: 0; }
.kbp-tnode-row:hover .kbp-tmore { opacity: 1; }
.kbp-tmore:hover { background: var(--mp-background-neutral, #e3e7e9); }
.kbp-tree-empty { margin: var(--mp-spacing-2) 8px; font-size: 12px; color: var(--mp-text-secondary); line-height: 18px; }

/* Main — ERP table area, 24px padded */
.kbp-main { flex: 1; min-width: 0; height: 100%; overflow-y: auto; padding: var(--mp-spacing-6, 24px); position: relative; }
/* Progressive loading (infinite scroll) replaces the pagination bar. */
.kbp-main :deep(.erp-pagination) { display: none; }

/* Filter bar: search on the right (canonical ERP .filter-search pill) */
.kbp-filter-left { flex: 1; }
.kbp-filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search:focus-within { border-color: #8c9596; box-shadow: 0 0 0 1px #8c9596; }
.filter-search svg { flex: 0 0 auto; }
.filter-search-input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-family: inherit; font-size: 14px; color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-subtle); }
.filter-search-clear { flex: 0 0 auto; display: inline-flex; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.filter-search-clear:hover { color: var(--mp-icon-default, #536062); }

/* Filename cell */
.kbp-namecell { display: flex; align-items: center; gap: 12px; border: none; background: none; cursor: pointer; font-family: inherit; text-align: left; padding: 0; min-width: 0; width: 100%; }
.kbp-namecell__body { display: flex; flex-direction: column; min-width: 0; }
.kbp-namecell__top { display: flex; align-items: center; gap: 8px; }
.kbp-namecell__sub { margin-top: 2px; font-size: 12px; color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbp-item__icon { flex: 0 0 auto; color: var(--mp-icon-default, #536062); }
.kbp-item__icon--folder { color: var(--mp-icon-brand, #0a6e4e); }
.kbp-item__thumb { flex: 0 0 auto; width: 34px; height: 34px; object-fit: cover; border-radius: 5px; border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral-subtle, #f6f7f9); }
.kbp-item__name { font-size: 14px; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbp-item__name:hover { color: var(--mp-text-link); text-decoration: underline; text-underline-offset: 2px; }
.kbp-ext-badge { flex: 0 0 auto; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; color: var(--mp-text-secondary); background: var(--mp-background-neutral, #eceef0); border-radius: 4px; padding: 1px 5px; }
.kbp-upd__date { display: block; font-size: 13px; color: var(--mp-text-default); }
.kbp-upd__by { display: block; font-size: 12px; color: var(--mp-text-secondary); }
.kbp-item__more { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: 8px; cursor: pointer; color: var(--mp-icon-default, #536062); }
.kbp-item__more:hover { background: var(--mp-background-neutral, #e3e7e9); }

/* Inline preview column (drag-resizable) */
.kbp-previewcol { position: relative; flex: 0 0 auto; height: 100%; border-left: 1px solid var(--mp-border-default, #dcdfe4); background: var(--mp-background-default, #fff); }
.kbp-resize { position: absolute; left: -3px; top: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 3; }
.kbp-resize:hover, .kbp-resize:active { background: var(--mp-border-brand, #0a6e4e); opacity: 0.35; }

/* Full empty state — 3D illustration + copy + secondary CTA (ERP pattern) */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.kbp-empty-cta { margin-top: var(--mp-spacing-3); }
.kbp-file-input { display: none; }

/* Drag-drop targets — slightly-gray subtle fill + dark-gray border (never blue) */
.kbp-tnode-row.is-drop { background: var(--mp-background-neutral-subtle, #f4f5f7); box-shadow: inset 0 0 0 1.5px var(--mp-border-bold, #667085); }
.kbp-trow.is-drop { background: var(--mp-background-neutral-subtle, #f4f5f7); box-shadow: inset 0 0 0 1.5px var(--mp-border-bold, #667085); }
.kbp-main { position: relative; }
.kbp-drop-overlay { position: absolute; inset: 12px; z-index: 5; display: flex; align-items: center; justify-content: center; border: 2px dashed var(--mp-border-bold, #667085); border-radius: 12px; background: color-mix(in srgb, var(--mp-background-neutral-subtle, #f4f5f7) 92%, transparent); pointer-events: none; }
.kbp-drop-inner { display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--mp-text-secondary, #536062); font-size: 15px; font-weight: 600; text-align: center; }
.kbp-drop-inner :deep(svg) { color: var(--mp-icon-default, #667085); }
.kbp-drop-inner p { margin: 0; }

/* Upload progress panel (bottom-right, Google-Drive style) */
.kup-enter-active, .kup-leave-active { transition: opacity 200ms ease, transform 200ms ease; }
.kup-enter-from, .kup-leave-to { opacity: 0; transform: translateY(12px); }
.kbp-uploads { position: fixed; right: 20px; bottom: 20px; z-index: 1500; width: 360px; max-width: calc(100vw - 40px); background: var(--mp-background-default, #fff); border: 1px solid var(--mp-border-default, #dcdfe4); border-radius: 10px; box-shadow: 0 12px 28px -8px rgba(0,0,0,0.22), 0 4px 8px -4px rgba(0,0,0,0.12); overflow: hidden; }
.kbp-uploads__head { display: flex; align-items: center; gap: 4px; padding: 12px 8px 12px 16px; }
.kbp-uploads__title { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbp-uploads__ico { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; cursor: pointer; color: var(--mp-icon-default, #536062); border-radius: 999px; }
.kbp-uploads__ico:hover { background: var(--mp-background-neutral, #eceef0); }
.kbp-uploads__status { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: var(--mp-background-neutral-subtle, #f4f5f7); border-top: 1px solid var(--mp-border-default, #e6e8ec); font-size: 13px; color: var(--mp-text-secondary); }
.kbp-uploads__cancel { border: none; background: none; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--mp-text-link); padding: 0; }
.kbp-uploads__cancel:hover { text-decoration: underline; }
.kbp-uploads__list { list-style: none; margin: 0; padding: 4px 0; max-height: 300px; overflow-y: auto; border-top: 1px solid var(--mp-border-default, #e6e8ec); }
.kbp-uploads__item { display: flex; align-items: center; gap: 12px; padding: 8px 16px; }
.kbp-uploads__item:hover { background: var(--mp-background-neutral-subtle, #f6f7f9); }
.kbp-uploads__item.is-pending { opacity: 0.55; }
.kbp-uploads__ficon { flex: 0 0 auto; color: var(--mp-icon-default, #536062); }
.kbp-uploads__thumb { flex: 0 0 auto; width: 28px; height: 28px; object-fit: cover; border-radius: 4px; border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral-subtle, #f6f7f9); }
.kbp-uploads__name { flex: 1; min-width: 0; font-size: 13px; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbp-uploads__ring, .kbp-uploads__check, .kbp-uploads__x { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; }
.kbp-uploads__check { background: var(--mp-background-success-bold, #0a6e4e); color: #fff; }
.kbp-uploads__check :deep(svg) { color: #fff; }
.kbp-uploads__x { background: var(--mp-background-critical-bold, #d1293d); color: #fff; }
.kbp-uploads__x :deep(svg) { color: #fff; }

/* Modals (Teleport overlay — MpModal has no structural CSS in this build) */
.cm-enter-active, .cm-leave-active { transition: opacity 200ms ease; }
.cm-enter-from, .cm-leave-to { opacity: 0; }
.cm-enter-active .cm-panel, .cm-leave-active .cm-panel { transition: transform 200ms ease, opacity 200ms ease; }
.cm-enter-from .cm-panel, .cm-leave-to .cm-panel { transform: scale(0.96); opacity: 0; }
.cm-overlay { position: fixed; inset: 0; z-index: 1400; background: rgba(8, 13, 14, 0.45); display: flex; align-items: flex-start; justify-content: center; }
.cm-panel { width: min(420px, calc(100% - 32px)); margin-top: 80px; background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5) var(--mp-spacing-5) var(--mp-spacing-4); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1); }
.cm-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cm-field { margin: var(--mp-spacing-3) 0 var(--mp-spacing-5); }
.cm-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }
.kbp-select { width: 100%; height: 40px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--mp-border-default, #dcdfe4); border-radius: 8px; background: var(--mp-background-default, #fff); font-family: inherit; font-size: 14px; color: var(--mp-text-default); }
</style>
