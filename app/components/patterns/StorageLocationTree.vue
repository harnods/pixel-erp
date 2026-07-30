<script setup lang="ts">
/**
 * Storage location tree — the sub-locations of a parent (or the warehouse root when
 * `parentId` is null). ERP tree-table pattern: search + "New location" toolbar,
 * expandable rows (click anywhere), gray code badge, inline "View details" chip,
 * kebab (Add sub-location / Delete). Self-contained: owns the <NewLocationDrawer>
 * and navigates to a row's detail page. Persists via the storage-location store.
 */
import {
  MpButton, MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  css, toast,
} from '@mekari/pixel3'
import NewLocationDrawer from '~/components/patterns/NewLocationDrawer.vue'
import { getStorageTree, findLocation, type LocNode } from '~/data/storageLocations'
import { deleteLocationSafe } from '~/data/integrityGuards'
import { ensureLocationBarcode } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'
import { useUrlModal } from '@ds/proto-review'
import PrintBarcodeOptionsModal from '~/components/patterns/PrintBarcodeOptionsModal.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import { generateBarcodeLabelPdf } from '~/utils/barcodeLabelPdf'
import type jsPDF from 'jspdf'

const props = withDefaults(defineProps<{
  warehouseId: string
  /** Parent whose children are listed; null = warehouse root. */
  parentId: string | null
  /** Show only the direct sub-locations (no nested expand). A row click navigates into
   *  that sub-location instead of expanding — so the row count matches the parent's
   *  "Sub-locations" total. Used on the location detail page. */
  singleLevel?: boolean
}>(), { singleLevel: false })
const router = useRouter()

const children = computed<LocNode[]>(() => {
  if (!props.parentId) return getStorageTree(props.warehouseId)
  return findLocation(props.warehouseId, props.parentId)?.node.children ?? []
})

const expanded = ref<Set<string>>(new Set())
const search = ref('')
function nameMatch(n: LocNode, q: string): boolean {
  return n.name.toLowerCase().includes(q) || n.children.some(c => nameMatch(c, q))
}
const flat = computed(() => {
  const q = search.value.trim().toLowerCase()
  const out: { node: LocNode; depth: number; hasChildren: boolean; open: boolean }[] = []
  // single-level: just the direct children, no recursion (each row drills via navigation)
  if (props.singleLevel) {
    for (const n of children.value) {
      if (q && !nameMatch(n, q)) continue
      out.push({ node: n, depth: 0, hasChildren: n.children.length > 0, open: false })
    }
    return out
  }
  const walk = (nodes: LocNode[], depth: number) => {
    for (const n of nodes) {
      if (q && !nameMatch(n, q)) continue
      const hasChildren = n.children.length > 0
      const open = q ? true : expanded.value.has(n.id)
      out.push({ node: n, depth, hasChildren, open })
      if (hasChildren && open) walk(n.children, depth + 1)
    }
  }
  walk(children.value, 0)
  return out
})
function onRowClick(n: LocNode) {
  if (props.singleLevel) { view(n); return }
  toggle(n)
}
function toggle(n: LocNode) {
  if (!n.children.length) return
  const s = new Set(expanded.value)
  s.has(n.id) ? s.delete(n.id) : s.add(n.id)
  expanded.value = s
}
function fmt(n: number) { return n.toLocaleString('id-ID') }
function view(n: LocNode) { router.push(`/warehouses/${props.warehouseId}/locations/${n.id}`) }

// Delete needs a confirmation modal (never delete on a single click).
const deleteTarget = ref<LocNode | null>(null)
function askDelete(n: LocNode) { deleteTarget.value = n }
function confirmDelete() {
  if (deleteTarget.value) {
    const res = deleteLocationSafe(props.warehouseId, deleteTarget.value.id)
    if (!res.ok) {
      toast.notify({ variant: 'error', title: "This location still holds stock and can't be deleted", maxWidth: 'max-content' })
      deleteTarget.value = null
      return
    }
  }
  deleteTarget.value = null
}

// New / sub-location / edit drawer (shared form). URL-driven via proto-review's
// useUrlModal so review comments left inside it scope to it and reopen it when
// clicked from the All comments panel (?overlay=new-location).
const drawerOpen = useUrlModal('new-location')
const drawerParentId = ref<string | null>(null)
const drawerEditId = ref<string | null>(null)
function openNew() { drawerEditId.value = null; drawerParentId.value = props.parentId; drawerOpen.value = true }
function addSub(n: LocNode) { drawerEditId.value = null; drawerParentId.value = n.id; drawerOpen.value = true }
function editLoc(n: LocNode) { drawerEditId.value = n.id; drawerParentId.value = null; drawerOpen.value = true }
function onSaved(pid: string | null) {
  if (pid && pid !== props.parentId) expanded.value = new Set([...expanded.value, pid])
}

// ── Print barcode (Storage-type locations only) — options modal then shared PDF preview ──
const warehouseName = computed(() => warehouses.find(w => w.id === props.warehouseId)?.name ?? '')
const printBarcodeOptionsOpen = ref(false)
const printBarcodeTarget = ref<LocNode | null>(null)
function printLocationBarcode(n: LocNode) {
  printBarcodeTarget.value = n
  printBarcodeOptionsOpen.value = true
}

const barcodePreviewOpen = ref(false)
const barcodePreviewDoc = ref<jsPDF | null>(null)
const barcodePreviewFilename = ref('')
async function confirmPrintBarcode({ qty, columns }: { qty: number; columns: 1 | 2 | 3 }) {
  const n = printBarcodeTarget.value
  if (!n) return
  printBarcodeOptionsOpen.value = false
  const path = findLocation(props.warehouseId, n.id)?.path ?? []
  const breadcrumb = path.slice(0, -1).map(p => p.name).join(' / ')
  barcodePreviewDoc.value = await generateBarcodeLabelPdf({
    barcode: ensureLocationBarcode(props.warehouseId, n.id),
    batchNo: n.name,
    productName: warehouseName.value,
    sku: breadcrumb,
  }, qty, columns)
  barcodePreviewFilename.value = `Barcode - ${n.name}.pdf`
  barcodePreviewOpen.value = true
}

</script>

<template>
  <div class="slt">
    <div class="slt-toolbar">
      <div class="wh-search">
        <MpIcon name="search" size="md" />
        <input v-model="search" class="wh-search-input" type="text" placeholder="Search..." />
        <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <MpButton variant="tertiary" is-rounded left-icon="add" @click="openNew">New location</MpButton>
    </div>

    <div class="wh-loc-scroll">
      <table class="wh-loc-table">
        <colgroup>
          <col style="width: 420px" />
          <col style="width: 120px" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th class="wh-bth">Location name</th>
            <th class="wh-bth">SKU qty</th>
            <th class="wh-bth" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in flat"
            :key="row.node.id"
            class="wh-loc-row"
            :class="{ 'wh-loc-row--branch': row.hasChildren || singleLevel }"
            @click="onRowClick(row.node)"
          >
            <td class="wh-btd wh-loc-name-td">
              <div class="wh-loc-name" :style="{ paddingLeft: `${row.depth * 24}px` }">
                <!-- single-level: no expand toggle (rows drill via navigation) -->
                <svg
                  v-if="!singleLevel && row.hasChildren"
                  class="wh-loc-chevron" :class="{ 'wh-loc-chevron--open': row.open }"
                  width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                >
                  <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span v-else-if="!singleLevel" class="wh-loc-chevron-spacer" />
                <MpTooltip
                  :id="`slt-type-${row.node.id}`"
                  :label="row.node.type"
                  placement="top"
                  use-portal
                >
                  <MpIcon
                    :name="row.node.type === 'Storage' ? 'products' : 'folder-close'"
                    size="md"
                    class="wh-loc-type-icon"
                    :class="row.node.type === 'Storage' ? 'wh-loc-type-icon--storage' : 'wh-loc-type-icon--org'"
                  />
                </MpTooltip>
                <a class="cell-link wh-loc-name-text" @click.stop="view(row.node)">{{ row.node.name }}</a>
              </div>
            </td>
            <td class="wh-btd">{{ fmt(row.node.skuQty) }}</td>
            <td class="wh-btd wh-loc-td--action">
              <MpPopover :id="`slt-actions-${row.node.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <button class="row-kebab" aria-label="More actions" @click.stop>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="editLoc(row.node)">Edit</MpPopoverListItem>
                    <MpPopoverListItem v-if="row.node.type === 'Storage'" @click="printLocationBarcode(row.node)">Print barcode</MpPopoverListItem>
                    <MpPopoverListItem @click="addSub(row.node)">Add sub-location</MpPopoverListItem>
                    <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="askDelete(row.node)">Delete</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </td>
          </tr>
          <tr v-if="!flat.length">
            <td class="wh-btd wh-loc-empty" colspan="3">
              {{ search.trim() ? 'No storage locations found.' : 'No sub-locations yet.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <NewLocationDrawer
      :is-open="drawerOpen"
      :warehouse-id="warehouseId"
      :parent-id="drawerParentId"
      :edit-id="drawerEditId"
      @update:is-open="drawerOpen = $event"
      @saved="onSaved"
    />

    <!-- Delete confirmation -->
    <MpModal
      id="slt-delete-modal"
      :is-open="!!deleteTarget"
      size="md"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="deleteTarget = null"
    >
      <MpModalContent>
        <MpModalHeader>
          Delete location?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <template v-if="deleteTarget?.children.length">
            Deleting <strong>{{ deleteTarget?.name }}</strong> also removes all of its sub-locations. This can't be undone.
          </template>
          <template v-else>
            Delete <strong>{{ deleteTarget?.name }}</strong>? This can't be undone.
          </template>
        </MpModalBody>
        <MpModalFooter>
          <div class="slt-modal-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteTarget = null">Cancel</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">Delete</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <PrintBarcodeOptionsModal
      :open="printBarcodeOptionsOpen"
      @close="printBarcodeOptionsOpen = false"
      @confirm="confirmPrintBarcode"
    />

    <PdfPreviewModal
      :open="barcodePreviewOpen"
      :doc="barcodePreviewDoc"
      :filename="barcodePreviewFilename"
      title="Barcode preview"
      @close="barcodePreviewOpen = false"
    />
  </div>
</template>

<style scoped>
.slt-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.wh-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 220px; }
.wh-search:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.wh-search-input { flex: 1; border: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); outline: none; }
.wh-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

.wh-loc-scroll { overflow-x: auto; }
.wh-loc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.wh-bth { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.wh-btd { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; white-space: nowrap; background: var(--mp-background-neutral); }
.wh-loc-row--branch { cursor: pointer; }
.wh-loc-table tbody tr:hover .wh-btd { background: var(--mp-background-neutral-hovered); }
.wh-loc-name { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.wh-loc-name-text { color: var(--mp-text-default); }
/* type marker: folder = Organizational (grouping), box = Storage (holds stock) */
.wh-loc-type-icon { flex-shrink: 0; display: inline-flex; }
.wh-loc-type-icon--org { color: var(--mp-icon-default, var(--mp-text-secondary)); }
.wh-loc-type-icon--storage { color: var(--mp-icon-brand, var(--mp-colors-emerald-600, #0f9d58)); }
.wh-loc-chevron { flex-shrink: 0; transition: transform 0.15s ease; color: var(--mp-icon-default, var(--mp-text-secondary)); }
.wh-loc-chevron--open { transform: rotate(90deg); }
.wh-loc-chevron-spacer { display: inline-block; width: 16px; flex-shrink: 0; }
.wh-loc-table .wh-loc-td--action { text-align: right; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }
.wh-loc-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }
.slt-modal-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
