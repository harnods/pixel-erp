<script setup lang="ts">
/**
 * WorkOrderPreviewDrawer — right-side drawer showing the work orders raised for a
 * single production request. Built as a self-contained Teleport overlay (this Pixel
 * build ships no MpDrawer structural CSS — see the pixel-overlay memory).
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { MpText, MpButton } from '@mekari/pixel3'
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

const router = useRouter()
function openDetails(wo: WorkOrder) {
  router.push(`/work-orders/${wo.id}?source=pr`)
  emit('close')
}

function onEsc(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onEsc))
onUnmounted(() => window.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <Transition name="wod">
      <div v-if="open && ctx" class="wod-overlay" @click.self="emit('close')">
        <aside class="wod-panel" role="dialog" aria-label="Work order preview">
          <header class="wod-header">
            <MpText weight="semiBold">Work order preview</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="emit('close')" />
          </header>

          <div class="wod-body">
          <h2 class="wod-product">{{ ctx.productName }}</h2>
          <p class="wod-sku">SKU: {{ ctx.sku }}</p>

          <div class="wod-meta">
            <div class="wod-meta-item">
              <span class="wod-meta-label">Production request no.</span>
              <span class="wod-meta-value">{{ ctx.requestNo }}</span>
            </div>
            <div class="wod-meta-item">
              <span class="wod-meta-label">Sales order no.</span>
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
                <col style="width: 48px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wod-th">Number</th>
                  <th class="wod-th">Start date</th>
                  <th class="wod-th">End date</th>
                  <th class="wod-th wod-th--right">Produced qty</th>
                  <th class="wod-th">Unit</th>
                  <th class="wod-th">Status</th>
                  <th class="wod-th" />
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
                  <td class="wod-td wod-td--actions">
                    <button class="wod-open-btn" aria-label="Open details" @click="openDetails(wo)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M9 6h9v9M18 6 6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </td>
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
  /* xl drawer size */
  width: min(1040px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

/* Header follows the library drawer pattern (Drawer.md / NewLocationDrawer):
   white (no fill), semibold title, ghost close, 8/8/8/16 padding + bottom rule. */
.wod-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}

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
.wod-td--actions { text-align: center; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2); }
.wod-tr:hover .wod-td { background: var(--mp-background-neutral-hovered); }

.wod-open-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.wod-open-btn:hover { color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); }

/* Transition — matches the pattern library: overlay fades, panel slides in from
   the right (Drawer.md / ManageBatchDrawer). */
.wod-enter-active, .wod-leave-active { transition: background-color 250ms ease; }
.wod-enter-from, .wod-leave-to { background-color: transparent; }
.wod-enter-active .wod-panel { transition: transform 350ms ease-out; }
.wod-leave-active .wod-panel { transition: transform 250ms ease-in; }
.wod-enter-from .wod-panel,
.wod-leave-to .wod-panel { transform: translateX(calc(100% + 12px)); }
</style>
