<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpCheckbox, MpSpinner, MpAutocomplete,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  MpIcon, css,
} from '@mekari/pixel3'
import { receivingPOs } from '~/data/receivingTasks'
import { getTaskLineItems, type TaskLineItem } from '~/data/receivingTaskDetails'
import { addPutAwayTask } from '~/data/putAwayTasks'
import { BINS } from '~/data/receiptLineItems'

// MpAutocomplete data for bin locations
const BINS_AC = BINS.map(b => ({ id: b, name: b }))

const router = useRouter()
const route  = useRoute()

const ASSIGNEES = [
  { id: 'u01', name: 'Budi Santoso',    initials: 'BS', hue: 210 },
  { id: 'u02', name: 'Dewi Rahayu',     initials: 'DR', hue: 145 },
  { id: 'u03', name: 'Rizki Pratama',   initials: 'RP', hue: 30  },
  { id: 'u04', name: 'Agus Firmansyah', initials: 'AF', hue: 280 },
  { id: 'u05', name: 'Sari Indah',      initials: 'SI', hue: 320 },
  { id: 'u06', name: 'Hendra Wijaya',   initials: 'HW', hue: 170 },
  { id: 'u07', name: 'Citra Kusuma',    initials: 'CK', hue: 55  },
  { id: 'u08', name: 'Galih Nugraha',   initials: 'GN', hue: 100 },
]

// ─── All pending put-away tasks (flat) ────────────────────────────────────────
interface FlatTask {
  id: string
  taskNo: string
  purchaseNo: string
  warehouseId: string
  warehouseName: string
  skuCount: number
  receivedQty: number
}

const allPendingTasks = computed<FlatTask[]>(() =>
  receivingPOs.flatMap(po =>
    po.tasks
      .filter(t => t.status === 'pending put-away')
      .map(t => ({
        id: t.id,
        taskNo: t.taskNo,
        purchaseNo: po.purchaseNo,
        warehouseId: po.warehouseId,
        warehouseName: po.warehouseName,
        skuCount: t.skuCount,
        receivedQty: t.receivedQty,
      })),
  ),
)

// ─── Warehouse selector ────────────────────────────────────────────────────────
// Only warehouses that actually have pending put-away tasks
const availableWarehouses = computed(() => {
  const seen = new Set<string>()
  const list: { id: string; name: string }[] = []
  for (const t of allPendingTasks.value) {
    if (!seen.has(t.warehouseId)) {
      seen.add(t.warehouseId)
      list.push({ id: t.warehouseId, name: t.warehouseName })
    }
  }
  return list
})

const warehouseId  = ref('')
const warehouseError = ref(false)
let _prefillSuppressClear = false
watch(warehouseId, (v) => {
  if (v) warehouseError.value = false
  if (!_prefillSuppressClear) selectedIds.value = new Set()
})
const warehouseName = computed(() =>
  availableWarehouses.value.find(w => w.id === warehouseId.value)?.name ?? '',
)
const isWarehouseLocked = computed(() => !!route.query.warehouseId)

// ─── Assignee ─────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
const assigneeError = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
const assigneeLabel = computed(() => ASSIGNEES.find(a => a.id === assigneeId.value)?.name ?? '')

// ─── Receiving tasks filtered by selected warehouse ────────────────────────────
const pendingTasks = computed<FlatTask[]>(() =>
  warehouseId.value
    ? allPendingTasks.value.filter(t => t.warehouseId === warehouseId.value)
    : [],
)

// Border only when >10 rows (progressive)
const TASK_PAGE_SIZE = 10
const isTasksProgressive = computed(() => pendingTasks.value.length > TASK_PAGE_SIZE)

// ─── Task selection ────────────────────────────────────────────────────────────
const selectedIds = ref(new Set<string>())
const taskSelectionError = ref(false)

function toggleTask(id: string) {
  const s = new Set(selectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedIds.value = s
  if (s.size > 0) taskSelectionError.value = false
}

const allSelected = computed(() =>
  pendingTasks.value.length > 0 && selectedIds.value.size === pendingTasks.value.length,
)
const someSelected = computed(() =>
  selectedIds.value.size > 0 && selectedIds.value.size < pendingTasks.value.length,
)
function toggleAll() {
  selectedIds.value = allSelected.value
    ? new Set()
    : new Set(pendingTasks.value.map(t => t.id))
  if (selectedIds.value.size > 0) taskSelectionError.value = false
}

const selectedTasks = computed(() =>
  pendingTasks.value.filter(t => selectedIds.value.has(t.id)),
)

// ─── Aggregated SKU rows from selected tasks ───────────────────────────────────
interface SkuRow extends TaskLineItem {
  taskId: string
  taskNo: string
  rowKey: string
}

const skuRows = computed<SkuRow[]>(() => {
  const rows: SkuRow[] = []
  for (const t of selectedTasks.value) {
    // find the full ReceivingTask for getTaskLineItems
    const po = receivingPOs.find(p => p.id === t.warehouseId || p.tasks.some(tk => tk.id === t.id))
    if (!po) continue
    const task = po.tasks.find(tk => tk.id === t.id)
    if (!task) continue
    const items = getTaskLineItems(task, t.purchaseNo)
    items.forEach((item, i) => {
      rows.push({
        ...item,
        taskId: t.id,
        taskNo: t.taskNo,
        rowKey: `${t.id}::${item.skuCode}::${i}`,
      })
    })
  }
  return rows
})

// Storage location per SKU row — seeded from binLocation, overridable by the user
const storageLocations = ref<Record<string, string>>({})
function setLocation(rowKey: string, val: string) {
  storageLocations.value = { ...storageLocations.value, [rowKey]: val }
}
// Auto-fill bin from task line items; preserve any location the user already set
watch(skuRows, (rows) => {
  const patch: Record<string, string> = {}
  for (const row of rows) {
    if (!(row.rowKey in storageLocations.value)) patch[row.rowKey] = row.binLocation
  }
  if (Object.keys(patch).length) storageLocations.value = { ...storageLocations.value, ...patch }
}, { immediate: true })

// ─── SKU bulk selection ────────────────────────────────────────────────────────
const selectedSkuKeys = ref(new Set<string>())

function toggleSku(rowKey: string) {
  const s = new Set(selectedSkuKeys.value)
  s.has(rowKey) ? s.delete(rowKey) : s.add(rowKey)
  selectedSkuKeys.value = s
}
const allSkusSelected  = computed(() =>
  pagedSkus.value.length > 0 && selectedSkuKeys.value.size === pagedSkus.value.length,
)
const someSkusSelected = computed(() =>
  selectedSkuKeys.value.size > 0 && selectedSkuKeys.value.size < pagedSkus.value.length,
)
function toggleAllSkus() {
  selectedSkuKeys.value = allSkusSelected.value
    ? new Set()
    : new Set(pagedSkus.value.map(r => r.rowKey))
}
// Clear stale selections when the SKU list changes (tasks deselected)
watch(skuRows, (rows) => {
  const valid = new Set(rows.map(r => r.rowKey))
  const cleaned = new Set([...selectedSkuKeys.value].filter(k => valid.has(k)))
  if (cleaned.size !== selectedSkuKeys.value.size) selectedSkuKeys.value = cleaned
})

// ─── Edit-location modal (single row or bulk) ─────────────────────────────────
// null = closed  |  '__bulk__' = bulk mode  |  rowKey = single-row edit
const editingLocationKey = ref<string | null>(null)
const editLocationValue  = ref('')
const isBulkEdit = computed(() => editingLocationKey.value === '__bulk__')

function openLocationEdit(rowKey: string) {
  editingLocationKey.value = rowKey
  editLocationValue.value  = storageLocations.value[rowKey] ?? ''
}
function openBulkLocationEdit() {
  editingLocationKey.value = '__bulk__'
  editLocationValue.value  = ''
}
function closeLocationEdit() {
  editingLocationKey.value = null
  editLocationValue.value  = ''
}
function saveLocationEdit() {
  if (isBulkEdit.value) {
    const patch: Record<string, string> = {}
    for (const key of selectedSkuKeys.value) patch[key] = editLocationValue.value
    storageLocations.value = { ...storageLocations.value, ...patch }
  } else if (editingLocationKey.value) {
    setLocation(editingLocationKey.value, editLocationValue.value)
  }
  closeLocationEdit()
}
function clearSkuSelection() { selectedSkuKeys.value = new Set() }

// ─── Progressive pagination for SKU table ─────────────────────────────────────
const PAGE_SIZE   = 10
const shownCount  = ref(PAGE_SIZE)
const loadingMore = ref(false)
const pagedSkus   = computed<SkuRow[]>(() => skuRows.value.slice(0, shownCount.value))
const hasMoreSkus = computed(() => shownCount.value < skuRows.value.length)
const isProgressive = computed(() => skuRows.value.length > PAGE_SIZE)

function loadMoreSkus(): void {
  if (loadingMore.value || !hasMoreSkus.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, skuRows.value.length)
    loadingMore.value = false
  }, 400)
}

const skusScrollEl   = ref<HTMLElement | null>(null)
const skusSentinelEl = ref<HTMLElement | null>(null)
let skusObserver: IntersectionObserver | null = null
function setupSkusObserver(): void {
  skusObserver?.disconnect()
  if (!skusScrollEl.value || !skusSentinelEl.value) return
  skusObserver = new IntersectionObserver(
    (entries) => { if (entries[0]?.isIntersecting) loadMoreSkus() },
    { root: skusScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  skusObserver.observe(skusSentinelEl.value)
}

watch(selectedIds, () => {
  shownCount.value = PAGE_SIZE
  nextTick(setupSkusObserver)
})

// ─── Footer divider ────────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedSkuKeys.value.size > 0) {
    clearSkuSelection()
  }
}
onMounted(() => {
  // Pre-fill from URL params when navigating from Receiving index (kebab or bulk checkbox)
  const qWh    = route.query.warehouseId as string | undefined
  const qTask  = route.query.taskId  as string | undefined   // single task (from kebab)
  const qTasks = route.query.taskIds as string | undefined   // comma-list (from bulk)
  if (qWh) {
    _prefillSuppressClear = true
    warehouseId.value = qWh
    nextTick(() => {
      _prefillSuppressClear = false
      const ids = qTasks
        ? qTasks.split(',').filter(id => pendingTasks.value.some(t => t.id === id))
        : qTask && pendingTasks.value.some(t => t.id === qTask) ? [qTask] : []
      if (ids.length) selectedIds.value = new Set(ids)
    })
  }

  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
    setupSkusObserver()
  })
  window.addEventListener('keydown', handleKeyDown)
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  skusObserver?.disconnect()
  window.removeEventListener('keydown', handleKeyDown)
})
watch([selectedIds, shownCount], () => nextTick(checkStageOverflow))

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

function goPutAway() {
  router.push({ path: '/barang-masuk', query: { tab: 'Put-away' } })
}

function handleCreate() {
  let valid = true
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!assigneeId.value)  { assigneeError.value  = true; valid = false }
  if (!selectedTasks.value.length) { taskSelectionError.value = true; valid = false }
  if (!valid) return

  const totalQty = skuRows.value.reduce((s, r) => s + r.receivedQty, 0)

  addPutAwayTask({
    receivingTaskIds: selectedTasks.value.map(t => t.id),
    receivingTaskNos: selectedTasks.value.map(t => t.taskNo),
    warehouseId:   warehouseId.value,
    warehouseName: warehouseName.value,
    assignee: assigneeLabel.value,
    itemQty: totalQty,
  })

  router.push({ path: '/barang-masuk', query: { tab: 'Put-away', saved: '1' } })
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPutAway">Put-away</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New put-away</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Warehouse + Assignee -->
      <div class="pa-section pa-grid">
        <!-- Warehouse -->
        <MpFormControl id="pa-warehouse" is-required :is-invalid="warehouseError" :class="css({ gridColumn: 'span 3' })">
          <MpFormLabel>Warehouse</MpFormLabel>
          <MpAutocomplete
            id="pa-warehouse-ac"
            v-model="warehouseId"
            :data="availableWarehouses"
            label-prop="name"
            value-prop="id"
            placeholder="Select warehouse"
            is-searchable use-portal is-full-width
            :is-clearable="!isWarehouseLocked"
            :is-disabled="isWarehouseLocked"
            :is-invalid="warehouseError"
          />
          <MpFormErrorMessage>You must select a warehouse</MpFormErrorMessage>
        </MpFormControl>

        <!-- Assignee -->
        <MpFormControl id="pa-assignee" is-required :is-invalid="assigneeError" :class="css({ gridColumn: 'span 3' })">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="pa-assignee-ac"
            v-model="assigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="assigneeError"
          >
            <template #default="{ item }">
              <div class="pa-assignee-opt">
                <span
                  class="pa-assignee-avatar"
                  :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                >{{ item.initials }}</span>
                {{ item.name }}
              </div>
            </template>
          </MpAutocomplete>
          <MpFormErrorMessage>You must select an assignee</MpFormErrorMessage>
        </MpFormControl>
      </div>

      <!-- Receiving tasks — only shown after warehouse is selected -->
      <div v-if="warehouseId" class="pa-tasks-section">
        <h2 class="pa-section-title">Receiving tasks</h2>

        <!-- Error -->
        <p v-if="taskSelectionError" class="pa-tasks-error">You must select at least one receiving task.</p>

        <!-- Empty state — no pending tasks for this warehouse -->
        <div v-if="!pendingTasks.length" class="pa-empty">
          <p class="pa-empty-title">No pending tasks</p>
          <p class="pa-empty-desc">No receiving tasks are pending put-away for this warehouse.</p>
        </div>

        <!-- Tasks table — border only when >10 rows -->
        <section v-else class="pa-tasks-table-wrap" :class="{ 'pa-tasks-table-wrap--bordered': isTasksProgressive }">
          <table class="pa-tasks-table">
            <colgroup>
              <col style="width: 200px" />
              <col />
              <col style="width: 100px" />
              <col style="width: 110px" />
            </colgroup>
            <thead>
              <tr>
                <th class="pa-th">
                  <div class="pa-cell-check">
                    <MpCheckbox
                      id="pa-select-all"
                      :is-checked="allSelected"
                      :is-indeterminate="someSelected"
                      @change="toggleAll"
                      @click.stop
                    />
                    Number
                  </div>
                </th>
                <th class="pa-th">Purchase no.</th>
                <th class="pa-th">SKU qty</th>
                <th class="pa-th">Received qty</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="task in pendingTasks"
                :key="task.id"
                class="pa-task-row"
                @click="toggleTask(task.id)"
              >
                <td class="pa-td">
                  <div class="pa-cell-check">
                    <span @click.stop>
                      <MpCheckbox
                        :id="`pa-row-${task.id}`"
                        :is-checked="selectedIds.has(task.id)"
                        @change="toggleTask(task.id)"
                      />
                    </span>
                    {{ task.taskNo }}
                  </div>
                </td>
                <td class="pa-td">{{ task.purchaseNo }}</td>
                <td class="pa-td">{{ task.skuCount }}</td>
                <td class="pa-td">{{ formatNum(task.receivedQty) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Selection summary -->
        <p v-if="selectedTasks.length" class="pa-selection-summary">
          {{ selectedTasks.length }} task{{ selectedTasks.length > 1 ? 's' : '' }} selected
          &nbsp;·&nbsp;
          {{ formatNum(skuRows.length) }} SKU{{ skuRows.length !== 1 ? 's' : '' }}
        </p>
      </div>

      <!-- SKU table — only when tasks are selected -->
      <div v-if="selectedTasks.length" class="pa-sku-section">
        <h2 class="pa-section-title">SKUs to put away</h2>
        <p class="pa-section-desc">Assign a storage location (bin) to each SKU.</p>



        <section class="pa-items-section" :class="{ 'pa-items-section--bordered': isProgressive }">
          <div ref="skusScrollEl" class="pa-items-scroll">
            <table class="pa-items">
              <colgroup>
                <col />
                <col style="width: 140px" />
                <col style="width: 160px" />
                <col style="width: 80px" />
                <col style="width: 60px" />
                <col style="width: 200px" />
              </colgroup>
              <thead>
                <!-- Bulk action bar — replaces column headers when SKU rows are selected -->
                <tr v-if="selectedSkuKeys.size > 0" class="pa-tr-bulk">
                  <th :colspan="6" class="pa-th pa-th--bulk">
                    <div class="pa-sku-bulk-bar">
                      <div class="pa-sku-bulk-bar__left">
                        <span @click.stop>
                          <MpCheckbox
                            id="pa-sku-bulk-all"
                            :is-checked="allSkusSelected"
                            :is-indeterminate="someSkusSelected"
                            @change="toggleAllSkus"
                          />
                        </span>
                        <span class="pa-sku-bulk-count">
                          {{ selectedSkuKeys.size }} SKU{{ selectedSkuKeys.size > 1 ? 's' : '' }} selected
                        </span>
                        <button class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" @click="openBulkLocationEdit">
                          Edit storage location
                        </button>
                      </div>
                      <div class="pa-sku-bulk-bar__right">
                        <span>Press</span><kbd class="pa-sku-bulk-bar__kbd">Esc</kbd><span>to deselect</span>
                      </div>
                    </div>
                  </th>
                </tr>
                <!-- Normal column headers -->
                <tr v-else>
                  <th class="pa-th">
                    <div class="pa-cell-check">
                      <span @click.stop>
                        <MpCheckbox
                          id="pa-sku-select-all"
                          :is-checked="allSkusSelected"
                          :is-indeterminate="someSkusSelected"
                          @change="toggleAllSkus"
                        />
                      </span>
                      Product
                    </div>
                  </th>
                  <th class="pa-th">SKU</th>
                  <th class="pa-th">Receiving task</th>
                  <th class="pa-th pa-th--num">Qty</th>
                  <th class="pa-th">Unit</th>
                  <th class="pa-th">Storage location</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedSkus" :key="row.rowKey" class="pa-item-row">
                  <td class="pa-td">
                    <div class="pa-cell-check">
                      <span @click.stop>
                        <MpCheckbox
                          :id="`pa-sku-${row.rowKey}`"
                          :is-checked="selectedSkuKeys.has(row.rowKey)"
                          @change="toggleSku(row.rowKey)"
                        />
                      </span>
                      <div class="pa-product">
                        <img
                          class="pa-product-thumb"
                          :src="row.image" :alt="row.productName"
                          loading="lazy" width="40" height="40"
                        />
                        <div class="pa-product-info">
                          <span class="pa-product-name">{{ row.productName }}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="pa-td"><span class="pa-sku-text">{{ row.skuCode }}</span></td>
                  <td class="pa-td"><span class="pa-task-ref">{{ row.taskNo }}</span></td>
                  <td class="pa-td pa-td--num">{{ formatNum(row.receivedQty) }}</td>
                  <td class="pa-td">{{ row.unit }}</td>
                  <td class="pa-td pa-td--location">
                    <div class="pa-location-cell">
                      <span
                        class="pa-location-value"
                        :class="{ 'pa-location-value--empty': !storageLocations[row.rowKey] }"
                      >{{ storageLocations[row.rowKey] || '—' }}</span>
                      <button
                        class="pa-location-edit-btn"
                        aria-label="Edit storage location"
                        @click.stop="openLocationEdit(row.rowKey)"
                      >
                        <MpIcon name="edit" size="sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div ref="skusSentinelEl" class="pa-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pa-loading pa-items-loading">
              <MpSpinner size="sm" /> Loading SKUs…
            </div>
          </div>
          <div v-if="isProgressive" class="pa-items-count">
            Showing {{ pagedSkus.length }} of {{ skuRows.length }} SKUs
          </div>
        </section>
      </div>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goPutAway">Cancel</MpButton>
      <MpButton variant="primary" is-rounded @click="handleCreate">Save</MpButton>
    </footer>
  </div>

  <!-- ── Edit storage location modal ── -->
  <MpModal :is-open="!!editingLocationKey" @close="closeLocationEdit">
    <MpModalContent>
      <MpModalHeader>
        {{ isBulkEdit
          ? `Edit storage location (${selectedSkuKeys.size} SKU${selectedSkuKeys.size > 1 ? 's' : ''})`
          : 'Edit storage location' }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <MpFormControl>
          <MpFormLabel>Bin location</MpFormLabel>
          <MpAutocomplete
            id="pa-loc-modal-ac"
            v-model="editLocationValue"
            :data="BINS_AC"
            label-prop="name"
            value-prop="id"
            is-searchable
            is-full-width
            use-portal
            placeholder="Select bin location..."
          />
        </MpFormControl>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <MpButton variant="ghost" is-rounded @click="closeLocationEdit">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="saveLocationEdit">Save</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Section / form grid ─────────────────────────────────────────────────────── */
.pa-section { margin-bottom: var(--mp-spacing-6); }
.pa-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-4); max-width: 558px; }
.pa-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pa-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Section title ───────────────────────────────────────────────────────────── */
.pa-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.pa-section-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md);
}
/* Receiving tasks: 20px gap from H2 to table */
.pa-tasks-section .pa-section-title { margin-bottom: var(--mp-spacing-5); }
/* SKUs to put away: no gap H2→caption, 20px gap caption→table */
.pa-sku-section .pa-section-title { margin-bottom: 0; }
.pa-sku-section .pa-section-desc { margin-bottom: var(--mp-spacing-5); }

/* ── Task section ─────────────────────────────────────────────────────────────── */
.pa-tasks-section { margin-bottom: var(--mp-spacing-6); }
.pa-sku-section { margin-bottom: var(--mp-spacing-6); }
.pa-tasks-error {
  margin: 0 0 var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b);
}

.pa-tasks-table-wrap { border-radius: var(--mp-radii-lg); overflow: hidden; }
.pa-tasks-table-wrap--bordered { border: 1px solid var(--mp-border-bold); }
.pa-tasks-table { width: 100%; table-layout: fixed; border-collapse: collapse; }

/* ── Table header ─────────────────────────────────────────────────────────────── */
.pa-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pa-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}

/* ── Task rows ────────────────────────────────────────────────────────────────── */
.pa-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.pa-task-row:last-child .pa-td { border-bottom: none; }

.pa-task-row { cursor: pointer; transition: background 80ms; }
.pa-task-row:hover .pa-td { background: var(--mp-background-neutral-subtle); }
.pa-cell-check { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pa-td--mono { font-variant-numeric: tabular-nums; }
.pa-td--num {
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
}

.pa-selection-summary {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

/* ── SKU items table ─────────────────────────────────────────────────────────── */
.pa-items-section { display: flex; flex-direction: column; }
.pa-items-section--bordered {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-lg); overflow: hidden;
}
.pa-items-section--bordered .pa-items-count { border-top: 1px solid var(--mp-border-default); }
.pa-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: hidden; }
.pa-items { width: 100%; table-layout: fixed; border-collapse: collapse; }
.pa-items thead .pa-th { position: sticky; top: 0; z-index: 1; }
.pa-item-row:last-child .pa-td { border-bottom: none; }

/* Product cell */
.pa-product { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pa-product-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-subtle);
}
.pa-product-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.pa-product-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pa-sku-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pa-task-ref { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Storage location cell — value + edit button sits right next to the text (row hover) */
.pa-location-cell {
  display: inline-flex; align-items: center;
  gap: var(--mp-spacing-1); min-width: 0;
}
.pa-location-value {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  white-space: nowrap;
}
.pa-location-value--empty { color: var(--mp-text-secondary); }
.pa-location-edit-btn {
  flex-shrink: 0;
  /* always in layout (space reserved) — visibility toggles so the row never shifts */
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
  visibility: hidden;
}
.pa-location-edit-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
.pa-item-row:hover .pa-location-edit-btn { visibility: visible; }

/* SKU bulk action bar — mirrors rcvg-tr-bulk / rcvg-bulk-bar pattern exactly */
.pa-tr-bulk .pa-th--bulk {
  padding: 0 var(--mp-spacing-3) 0 var(--mp-spacing-2);
  text-transform: none; font-weight: var(--mp-font-weights-regular);
}
.pa-sku-bulk-bar {
  display: flex; align-items: center; justify-content: space-between;
  height: var(--mp-sizes-7, 28px); gap: var(--mp-spacing-3);
}
.pa-sku-bulk-bar__left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pa-sku-bulk-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); white-space: nowrap; }
.pa-sku-bulk-bar__right {
  display: flex; align-items: center; gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap;
}
.pa-sku-bulk-bar__kbd {
  display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-xs); font-family: inherit; color: var(--mp-text-secondary);
}

/* Edit location modal footer */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); }

/* Sentinel + loading */
.pa-items-sentinel { height: 1px; }
.pa-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.pa-loading {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md);
}
.pa-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* ── Empty states ─────────────────────────────────────────────────────────── */
.pa-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.pa-empty-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pa-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
