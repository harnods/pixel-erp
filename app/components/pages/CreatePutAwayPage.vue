<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpCheckbox, MpSpinner, MpAutocomplete,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  css,
} from '@mekari/pixel3'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { receivingPOs } from '~/data/receivingTasks'
import { getTaskLineItems, type TaskLineItem } from '~/data/receivingTaskDetails'
import { addPutAwayTask } from '~/data/putAwayTasks'
import { scrollToFirstError } from '~/utils/form'

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
    // Partial reception: some SKUs on the task may have 0 received qty — nothing
    // to put away for those, so exclude them from the scope.
    const items = getTaskLineItems(task, t.purchaseNo).filter(item => item.receivedQty > 0)
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

onMounted(() => {
  // Pre-fill from URL params when navigating from Receiving index (kebab or bulk checkbox)
  const qWh    = route.query.warehouseId as string | undefined
  const qTask  = route.query.taskId  as string | undefined   // single task (from kebab)
  const qTasks = route.query.taskIds as string | undefined   // comma-list (from bulk)
  if (qWh) {
    _prefillSuppressClear = true
    warehouseId.value = qWh

    // Try immediately after next tick; if the task isn't in pendingTasks yet
    // (e.g. endReceiving was called just before navigation and the reactive graph
    // hasn't fully propagated), fall back to watching pendingTasks until it appears.
    let prefillDone = false
    const tryPrefill = () => {
      if (prefillDone) return
      const ids = qTasks
        ? qTasks.split(',').filter(id => pendingTasks.value.some(t => t.id === id))
        : qTask && pendingTasks.value.some(t => t.id === qTask) ? [qTask] : []
      if (ids.length) {
        selectedIds.value = new Set(ids)
        prefillDone = true
      }
    }

    nextTick(() => {
      _prefillSuppressClear = false
      tryPrefill()
      if (!prefillDone && (qTask || qTasks)) {
        const stop = watch(pendingTasks, () => { tryPrefill(); if (prefillDone) stop() }, { immediate: true })
      }
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
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  skusObserver?.disconnect()
})
watch([selectedIds, shownCount], () => nextTick(checkStageOverflow))

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

function goPutAway() {
  router.push({ path: '/inbound-delivery', query: { tab: 'Put-away' } })
}

function handleCreate() {
  let valid = true
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!assigneeId.value)  { assigneeError.value  = true; valid = false }
  if (!selectedTasks.value.length) { taskSelectionError.value = true; valid = false }
  if (!valid) { scrollToFirstError(); return }

  const totalQty = skuRows.value.reduce((s, r) => s + r.receivedQty, 0)

  const task = addPutAwayTask({
    receivingTaskIds: selectedTasks.value.map(t => t.id),
    receivingTaskNos: selectedTasks.value.map(t => t.taskNo),
    warehouseId:   warehouseId.value,
    warehouseName: warehouseName.value,
    assignee: assigneeLabel.value,
    itemQty: totalQty,
  })

  router.push(`/put-away/${task.id}`)
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
              <col />
              <col />
              <col />
              <col />
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
                    Purchase receiving no.
                  </div>
                </th>
                <th class="pa-th">Purchase order no.</th>
                <th class="pa-th">Sku qty</th>
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
        <h2 class="pa-section-title">SKU to put away</h2>
        <p class="pa-section-desc">Review the SKUs included in this put-away task.</p>

        <section class="pa-items-section" :class="{ 'pa-items-section--bordered': isProgressive }">
          <div ref="skusScrollEl" class="pa-items-scroll">
            <table class="pa-items">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="pa-th">Product</th>
                  <th class="pa-th">SKU</th>
                  <th class="pa-th">Receiving task</th>
                  <th class="pa-th pa-th--num">Qty</th>
                  <th class="pa-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedSkus" :key="row.rowKey" class="pa-item-row">
                  <td class="pa-td">
                    <ProductCell :name="row.productName" :desc="row.productDesc" :image="row.image" />
                  </td>
                  <td class="pa-td"><span class="pa-sku-text">{{ row.skuCode }}</span></td>
                  <td class="pa-td"><span class="pa-task-ref">{{ row.taskNo }}</span></td>
                  <td class="pa-td pa-td--num">{{ formatNum(row.receivedQty) }}</td>
                  <td class="pa-td">{{ row.unit }}</td>
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
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
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
.pa-tasks-table { width: 100%; table-layout: auto; border-collapse: collapse; }

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
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}

.pa-task-row { cursor: pointer; transition: background 80ms; }
.pa-task-row:hover .pa-td { background: var(--mp-background-neutral-subtle); }
.pa-cell-check { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pa-td--mono { font-variant-numeric: tabular-nums; }
.pa-td--num {
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
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
.pa-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pa-items { width: 100%; table-layout: auto; border-collapse: collapse; }
.pa-items thead .pa-th { position: sticky; top: 0; z-index: 1; }

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
