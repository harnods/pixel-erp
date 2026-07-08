<script setup lang="ts">
/**
 * WorkOrderPreviewDrawer — right-side drawer showing the work orders raised for a
 * single production request. Built as a self-contained Teleport overlay (this Pixel
 * build ships no MpDrawer structural CSS — see the pixel-overlay memory).
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { formatDate } from '~/utils/date'
import { workOrdersForRequest, type WorkOrder } from '~/data/productionRequests'

export interface PreviewCtx {
  productName: string
  sku: string
  requestNo: string
  sourceNo: string
  dueDate?: string
}

const props = defineProps<{ open: boolean; ctx: PreviewCtx | null }>()
const emit = defineEmits<{ close: [] }>()

const workOrders = computed<WorkOrder[]>(() =>
  props.ctx ? workOrdersForRequest(props.ctx.requestNo) : [],
)

// Local pagination (drawer default 10 per page).
const currentPage = ref(1)
const perPage = ref(10)
const total = computed(() => workOrders.value.length)
const paged = computed(() => {
  const start = (currentPage.value - 1) * perPage.value
  return workOrders.value.slice(start, start + perPage.value)
})
watch(() => props.ctx, () => { currentPage.value = 1 })

function onEsc(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onEsc))
onUnmounted(() => window.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <Transition name="wod-fade">
      <div v-if="open && ctx" class="wod-overlay" @click.self="emit('close')">
        <aside class="wod-panel" role="dialog" aria-label="Work order preview">
          <header class="wod-header">
            <h2 class="wod-header-title">Work order preview</h2>
            <button class="wod-close" type="button" aria-label="Close" @click="emit('close')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div class="wod-body">
          <h2 class="wod-product">{{ ctx.productName }}</h2>
          <p class="wod-sku">SKU: {{ ctx.sku }}</p>

          <div class="wod-meta">
            <div class="wod-meta-item">
              <span class="wod-meta-label">Production request number</span>
              <span class="wod-meta-value">{{ ctx.requestNo }}</span>
            </div>
            <div class="wod-meta-item">
              <span class="wod-meta-label">Sales order number</span>
              <span class="wod-meta-value">{{ ctx.sourceNo }}</span>
            </div>
            <div class="wod-meta-item">
              <span class="wod-meta-label">Due date</span>
              <span class="wod-meta-value">{{ ctx.dueDate ? formatDate(ctx.dueDate) : '—' }}</span>
            </div>
          </div>

          <h3 class="wod-section-title">Work order list</h3>
          <div class="wod-table-wrap">
            <table class="wod-table">
              <colgroup>
                <col />
                <col style="width: 130px" />
                <col style="width: 130px" />
                <col style="width: 130px" />
                <col style="width: 80px" />
                <col style="width: 140px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wod-th">Number</th>
                  <th class="wod-th">Start date</th>
                  <th class="wod-th">End date</th>
                  <th class="wod-th wod-th--right">Produced qty</th>
                  <th class="wod-th">Unit</th>
                  <th class="wod-th">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="wo in paged" :key="wo.number" class="wod-tr">
                  <td class="wod-td">{{ wo.number }}</td>
                  <td class="wod-td">{{ formatDate(wo.startDate) }}</td>
                  <td class="wod-td">{{ formatDate(wo.endDate) }}</td>
                  <td class="wod-td wod-td--right">{{ wo.producedQty }}</td>
                  <td class="wod-td">{{ wo.unit }}</td>
                  <td class="wod-td"><ErpStatusBadge :status="wo.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <ErpPagination
            :current-page="currentPage"
            :per-page="perPage"
            :total="total"
            @page-change="currentPage = $event"
            @per-page-change="perPage = $event"
          />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Floating drawer (ERP pattern — matches ManageBatchDrawer / Drawer.md): 12px
   margin from the edges, 12px rounded corners, panel aligned to the right. */
.wod-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.wod-panel {
  margin: var(--mp-spacing-3);
  width: min(1400px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}

.wod-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.wod-header-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.wod-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
}
.wod-close:hover { background: var(--mp-background-neutral-hovered); }

.wod-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-6); }
.wod-product { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.wod-sku { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.wod-meta { display: flex; gap: var(--mp-spacing-10, 40px); margin: var(--mp-spacing-6) 0; }
.wod-meta-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.wod-meta-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.wod-meta-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.wod-section-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.wod-table-wrap { overflow-x: auto; }
.wod-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.wod-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default); text-align: left; white-space: nowrap;
}
.wod-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.wod-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  white-space: nowrap; vertical-align: middle;
}
.wod-td--right { text-align: right; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.wod-tr:hover .wod-td { background: var(--mp-background-neutral-hovered); }

/* Transition */
.wod-fade-enter-active, .wod-fade-leave-active { transition: opacity 200ms ease; }
.wod-fade-enter-from, .wod-fade-leave-to { opacity: 0; }
</style>
