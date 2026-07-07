<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpSpinner, toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { putAwayTasks, startPutAway as startPutAwayTask } from '~/data/putAwayTasks'
import { getPutAwayLineItems, allPutAwayTasksFlat } from '~/data/putAwayTaskDetails'
import { findTaskWithPO } from '~/data/receivingTaskDetails'
import { formatDate, formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()

const router = useRouter()

const task = computed(() => putAwayTasks.find(t => t.id === props.orderId))
const lineItems = computed(() => task.value ? getPutAwayLineItems(props.orderId) : [])

// ── Progress stats ─────────────────────────────────────────────────────────
const storedQty = computed(() => lineItems.value.reduce((a, it) => a + it.stored, 0))

// ── Aging badge ────────────────────────────────────────────────────────────
const AGING_REF = '2026-06-25'
function agingDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 0
  const start = new Date(startDate).getTime()
  const end = new Date(endDate ?? AGING_REF).getTime()
  return Math.max(0, Math.round((end - start) / 86_400_000)) + 1
}

// ── Linked receiving tasks (for the tab) ──────────────────────────────────
function ensureEndDate(startDate: string | undefined, seed: number): string {
  if (!startDate) {
    const base = new Date(AGING_REF)
    base.setDate(base.getDate() - 7 - (seed % 14))
    return base.toISOString().slice(0, 10)
  }
  const d = new Date(startDate)
  d.setDate(d.getDate() + 1 + (seed % 3))
  return d.toISOString().slice(0, 10)
}

const linkedReceivingTasks = computed(() => {
  if (!task.value) return []
  return task.value.receivingTaskIds.map((id, i) => {
    const entry = findTaskWithPO(id)
    const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const startDate = entry?.task.startDate
    const rawEnd = entry?.task.endDate
    const endDate = rawEnd ?? ensureEndDate(startDate, seed)
    return {
      id,
      taskNo: task.value!.receivingTaskNos[i],
      purchaseOrderNo: entry?.po.purchaseNo ?? '—',
      status: 'completed' as const,
      startDate,
      endDate,
      warehouseName: task.value!.warehouseName,
    }
  })
})

// ── Infinite scroll ────────────────────────────────────────────────────────
const STEP = 10
const visibleCount = ref(STEP)
const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
const loadingMore = ref(false)

const itemSearch = ref('')
const filteredItems = computed(() => {
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(
    it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q),
  )
})
const visibleItems = computed(() => filteredItems.value.slice(0, visibleCount.value))
const isProgressive = computed(() => filteredItems.value.length > STEP)

let io: IntersectionObserver | null = null
watch([itemsSentinelEl, filteredItems], ([sentinel]) => {
  io?.disconnect()
  if (!sentinel) return
  io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return
    if (visibleCount.value >= filteredItems.value.length) return
    loadingMore.value = true
    setTimeout(() => {
      visibleCount.value = Math.min(visibleCount.value + STEP, filteredItems.value.length)
      loadingMore.value = false
    }, 400)
  }, { root: itemsScrollEl.value, threshold: 0.1 })
  io.observe(sentinel)
})
watch(itemSearch, () => { visibleCount.value = STEP })
onUnmounted(() => io?.disconnect())

// ── Jump switcher ──────────────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = allPutAwayTasksFlat()
  const q = jumpSearch.value.trim().toLowerCase()
  if (!q) return all.slice(0, 5)
  return all.filter(t =>
    t.taskNo.toLowerCase().includes(q) ||
    t.receivingTaskNos.some(n => n.toLowerCase().includes(q)),
  ).slice(0, 5)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/put-away/${id}`) }

// ── Sticky footer ─────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
})
watch(() => props.orderId, () => nextTick(checkStageOverflow))

// ── Footer actions ─────────────────────────────────────────────────────────
function startPutAway() {
  if (task.value?.status === 'open') startPutAwayTask(props.orderId)
  router.push(`/put-away/${props.orderId}/store`)
}
function editTask() {
  toast.notify({ variant: 'info', title: 'Edit — coming soon' })
}
function deleteTask() {
  toast.notify({ variant: 'info', title: 'Delete — coming soon' })
}

function goBack() { router.push('/inbound-delivery?tab=Put-away') }
function fmt(n: number) { return n.toLocaleString('id-ID') }
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Put-away</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <ErpStatusBadge :status="task.status" badge-for="additionalInformation" size="md" />
          <MpPopover id="pad-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" aria-label="Switch task">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Cari tugas put-away…" />
                </div>
                <div class="detail-jump-list">
                  <button v-for="t in jumpResults" :key="t.id" class="detail-jump-item" @click="jumpTo(t.id)">
                    <span class="detail-jump-item-number">{{ t.taskNo }}</span>
                    <span class="detail-jump-item-customer">{{ t.receivingTaskNos[0] }}{{ t.receivingTaskNos.length > 1 ? ` +${t.receivingTaskNos.length - 1} more` : '' }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No tasks found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- ── Summary grid (2 cols) ── -->
      <section class="pad-summary">
        <div class="content-list-col">
          <ContentList label="Warehouse" :value="task.warehouseName" />
          <ContentList label="Assignee" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="Start date" :value="formatDateTimeLong(task.startDate)" />
          <ContentList label="End date" :value="formatDateTimeLong(task.endDate)" />
        </div>
      </section>

      <!-- ── Progress stats ── -->
      <section class="pad-progress">
        <div class="pad-progress-stat">
          <span class="pad-progress-label">SKU qty</span>
          <span class="pad-progress-val">{{ fmt(lineItems.length) }}</span>
        </div>
        <div class="pad-progress-stat">
          <span class="pad-progress-label">Received qty</span>
          <span class="pad-progress-val">{{ fmt(task.itemQty) }}</span>
        </div>
        <div class="pad-progress-stat">
          <span class="pad-progress-label">Put-away qty</span>
          <span class="pad-progress-val">{{ fmt(storedQty) }}</span>
        </div>
      </section>

      <!-- ── Items table ── -->
      <div class="pad-table-wrap">
        <div class="pad-filter-bar">
          <div class="pad-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="pad-search" type="text" placeholder="Search product or SKU…" />
          </div>
        </div>

        <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="detail-items-scroll">
            <table class="detail-items">
              <colgroup>
                <col /><col /><col /><col /><col /><col />
                <col v-if="task.status !== 'open'" />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">Product</th>
                  <th class="detail-th">SKU</th>
                  <th class="detail-th">Receiving task</th>
                  <th class="detail-th detail-th--num">Received qty</th>
                  <th class="detail-th detail-th--num">Put-away qty</th>
                  <th class="detail-th">Unit</th>
                  <th v-if="task.status !== 'open'" class="detail-th">Storage location</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.skuCode" class="pad-product-row">
                  <td class="detail-td">
                    <ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" />
                  </td>
                  <td class="detail-td">{{ item.skuCode }}</td>
                  <td class="detail-td">{{ item.receivingTaskNo }}</td>
                  <td class="detail-td detail-td--num">{{ fmt(item.qty) }}</td>
                  <td class="detail-td detail-td--num">
                    <span :class="item.stored === item.qty ? 'pad-qty--full' : item.stored > 0 ? 'pad-qty--partial' : 'pad-qty--zero'">
                      {{ fmt(item.stored) }}
                    </span>
                  </td>
                  <td class="detail-td detail-td--secondary">{{ item.unit }}</td>
                  <td v-if="task.status !== 'open'" class="detail-td">
                    <span class="pad-bin">{{ item.binLocation }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="detail-loading detail-items-loading">
              <MpSpinner size="sm" /> Loading products…
            </div>
          </div>
          <div class="detail-items-count">
            Showing {{ visibleItems.length }} of {{ filteredItems.length }} products
          </div>
        </section>
      </div>

      <!-- ── Linked transactions ── -->
      <MpTabs id="pad-tabs" :default-value="0" variant-color="green" class="pad-tabs">
        <MpTabList>
          <MpTab id="pad-tab-linked" value="linked">Purchase receiving ({{ linkedReceivingTasks.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="linked">
            <h3 class="linked-section-title">Purchase receiving tasks</h3>
            <div class="pad-linked-wrap">
              <table class="pad-linked">
                <colgroup>
                  <col /><col /><col /><col /><col /><col />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Purchase order no.</th>
                    <th class="detail-th">Status</th>
                    <th class="detail-th">Start date</th>
                    <th class="detail-th">End date</th>
                    <th class="detail-th">Warehouse</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="rt in linkedReceivingTasks" :key="rt.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pad-linked-num">{{ rt.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/receiving/${rt.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td detail-td--secondary">{{ rt.purchaseOrderNo }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="rt.status" /></td>
                    <td class="detail-td">{{ rt.startDate ? formatDate(rt.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        {{ formatDate(rt.endDate!) }}
                        <span v-if="agingDays(rt.startDate, rt.endDate) > 1" class="linked-aging">{{ agingDays(rt.startDate, rt.endDate) }} days</span>
                      </span>
                    </td>
                    <td class="detail-td">{{ rt.warehouseName }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div>

    <!-- ── Footer action bar ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpPopover id="pad-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--secondary">
            Print
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>Print put-away slip</MpPopoverListItem>
            <MpPopoverListItem>Print location label</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>

      <template v-if="task.status === 'completed'">
        <MpPopover id="pad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="detail-btn detail-btn--primary">
              Actions
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="editTask">Edit</MpPopoverListItem>
              <MpPopoverListItem @click="deleteTask">Delete</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
      <template v-else>
        <div class="detail-split">
          <button class="detail-btn detail-btn--primary detail-split-main" @click="startPutAway">
            {{ task.status === 'in progress' ? 'Continue put-away' : 'Start put-away' }}
          </button>
          <MpPopover id="pad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="detail-btn detail-btn--primary detail-split-chevron" aria-label="More actions">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="editTask">Edit</MpPopoverListItem>
                <MpPopoverListItem @click="deleteTask">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </template>
    </footer>

  </div>

  <!-- ── Not found ── -->
  <div v-else class="pad-not-found">
    <p>Put-away task not found.</p>
  </div>
</template>

<style scoped>
.detail-page  { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.detail-bar {
  height: var(--mp-sizes-18, 72px); flex-shrink: 0;
  background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start;
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-title {
  font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: 32px; letter-spacing: -0.2px; margin: 0;
}

.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7); height: var(--mp-sizes-7); border: none; background: none;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); background: none; outline: none;
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.detail-jump-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1) 0; }
.detail-jump-item {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); background: none; border: none; cursor: pointer; text-align: left;
}
.detail-jump-item:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-placeholder); margin: 0; }

.detail-stage {
  flex: 1; overflow-y: auto;
  background: var(--mp-background-stage, var(--mp-background-neutral-subtle));
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}

.pad-summary {
  display: grid;
  grid-template-columns: minmax(0, 318px) 1fr;
  gap: 0 var(--mp-spacing-6);
}
.content-list-col { display: flex; flex-direction: column; }

.pad-progress { display: flex; gap: var(--mp-spacing-10); }
.pad-progress-stat { display: flex; flex-direction: column; min-width: 112px; }
.pad-progress-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pad-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pad-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pad-filter-bar { display: flex; align-items: center; justify-content: flex-end; }
.pad-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); width: 280px;
}
.pad-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.pad-search::placeholder { color: var(--mp-text-placeholder); }

.detail-items-section { display: flex; flex-direction: column; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }

.detail-th {
  height: var(--mp-sizes-7, 28px); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.detail-item-row:hover { background: var(--mp-background-neutral-hovered); }
.detail-td {
  vertical-align: top;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
}
.detail-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.detail-td--secondary { color: var(--mp-text-secondary); }
.detail-td--number { position: relative; }

.detail-items-sentinel { height: 1px; }
.detail-loading.detail-items-loading {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.detail-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

.pad-qty--full     { color: var(--mp-text-success); }
.pad-qty--partial  { color: var(--mp-text-warning); }
.pad-qty--zero     { color: var(--mp-text-placeholder); }
.pad-bin { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.pad-tabs :deep(.mp-tab--isSelected_true),
.pad-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.pad-tabs :deep(.mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.pad-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pad-linked-wrap { overflow-x: auto; }
.pad-linked { width: 100%; border-collapse: collapse; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-aging { display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap; }

.cell-with-action { position: relative; display: flex; align-items: center; }
.pad-linked-num { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.row-hover-btn {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
:global(.detail-item-row:hover .row-hover-btn) { display: flex; }

.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full); font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
  border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary {
  background: var(--mp-background-neutral); border-color: var(--mp-border-bold);
  color: var(--mp-text-default);
}
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861);
  border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a);
  border-color: var(--mp-colors-emerald-800, #186f4a);
}

.detail-split { display: inline-flex; align-items: stretch; }
.detail-split-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.detail-split-chevron {
  border-top-left-radius: 0; border-bottom-left-radius: 0;
  padding-left: var(--mp-spacing-2); padding-right: var(--mp-spacing-2);
  border-left: 1px solid rgba(255, 255, 255, 0.3); gap: 0;
}

.pad-not-found {
  display: flex; align-items: center; justify-content: center; height: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
