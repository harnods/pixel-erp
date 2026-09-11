<script setup lang="ts">
/**
 * CrmServicesPage — records workspace for the custom "Service deals" module
 * (/crm/services). Same shape as the Deals workspace (list + Kanban), but driven
 * by the module's OWN pipeline (servicePipelines) + records (serviceDeals). Stage
 * columns/badges come from the configured service pipeline, so the workspace
 * reflects whatever was set up in the module builder.
 */
import { ref, reactive, computed } from 'vue'
import { MpButton, MpButtonGroup, MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpIconSegmented from '~/components/patterns/ErpIconSegmented.vue'
import { useTableState } from '~/composables/useTableState'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  serviceDeals, serviceStages, moveServiceDealStage, getCrmModule, CRM_CURRENT_USER, persistServiceDeals,
  type ServiceDeal,
} from '~/data/crm'
import { TODAY } from '~/data/master'

const router = useRouter()
const { t } = useLocale()

const moduleName = computed(() => getCrmModule('services')?.name || t('Service deals'))
const view = ref<'table' | 'board'>('table')
function goDetail(id: string) { router.push(`/crm/services/${id}`) }
function openCreate() {
  const id = `SV-${1000 + serviceDeals.length + 1}`
  serviceDeals.unshift({ id, name: t('Untitled service'), company: '', contact: '', stage: serviceStages()[0]?.name ?? 'Inquiry', owner: CRM_CURRENT_USER, value: 0, serviceType: 'Consultation', transactionDate: TODAY, dueDate: '', description: '' })
  persistServiceDeals()
  goDetail(id)
}

// Stage → badge tone (from the configured pipeline stage kind).
function stageKind(stage: string) { return serviceStages().find((s) => s.name === stage)?.kind ?? 'open' }
function stageBadge(stage: string): { type: 'completed' | 'announcement' | 'information'; label: string } {
  const kind = stageKind(stage)
  return { type: kind === 'won' ? 'completed' : kind === 'lost' ? 'announcement' : 'information', label: stage }
}

// ── List ──
const source = computed<ServiceDeal[]>(() => serviceDeals)
const { search, currentPage, perPage, sortKey, sortDir, total, paginated, setPage, setPerPage, toggleSort } =
  useTableState<ServiceDeal>(source, {
    perPage: 25,
    defaultSort: { key: 'transactionDate', dir: 'desc' },
    filterFn: (row, s) => !s || [row.name, row.id, row.company, row.owner, row.serviceType].join(' ').toLowerCase().includes(s),
  })
const columns: TableColumn[] = [
  { key: 'name', label: 'Service name', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'company', label: 'Customer', kind: 'name' },
  { key: 'stage', label: 'Stage', kind: 'status' },
  { key: 'serviceType', label: 'Service type', kind: 'tags' },
  { key: 'owner', label: 'Owner', kind: 'status' },
  { key: 'value', label: 'Value', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'dueDate', label: 'Due date', kind: 'date' },
]
const hasActiveFilter = computed(() => !!search.value)

// ── Kanban ──
interface Col { stage: string; kind: string; cards: ServiceDeal[]; total: number }
const boardColumns = computed<Col[]>(() => {
  const s = search.value.trim().toLowerCase()
  return serviceStages().map((st) => {
    const cards = serviceDeals.filter((d) => d.stage === st.name && (!s || [d.name, d.id, d.company, d.owner].join(' ').toLowerCase().includes(s)))
    return { stage: st.name, kind: st.kind, cards, total: cards.reduce((sum, d) => sum + d.value, 0) }
  })
})
// Drag to move stage.
const draggingId = ref<string | null>(null)
const dragOverStage = ref<string | null>(null)
function onDragStart(d: ServiceDeal) { draggingId.value = d.id }
function onDragEnd() { draggingId.value = null; dragOverStage.value = null }
function onDrop(stage: string) {
  if (draggingId.value) { moveServiceDealStage(draggingId.value, stage); successToast(t('Stage updated')) }
  onDragEnd()
}
function ownerInitials(name: string) { return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() }
</script>

<template>
  <div class="crm">
    <!-- Title bar -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left"><h1 class="crm-title">{{ moduleName }}</h1></div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="primary" is-rounded left-icon="add" @click="openCreate">{{ t('New service') }}</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="crm-body">
      <!-- Toolbar: view toggle + search -->
      <div class="svc-toolbar">
        <ErpIconSegmented
          id="svc-view" :model-value="view"
          :options="[{ value: 'table', icon: 'table-view-list', label: t('List view') }, { value: 'board', icon: 'table-view-column', label: t('Board view') }]"
          @update:model-value="(v: string) => (view = v as 'table' | 'board')"
        />
        <div class="filter-search svc-search">
          <MpIcon name="search" size="sm" class="filter-search-icon" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search services…')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>

      <!-- Board -->
      <div v-if="view === 'board'" class="kanban">
        <div class="kanban__board">
          <section
            v-for="col in boardColumns" :key="col.stage" class="kcol"
            :class="{ 'kcol--over': dragOverStage === col.stage }"
            @dragover.prevent="dragOverStage = col.stage" @dragleave="dragOverStage === col.stage && (dragOverStage = null)" @drop="onDrop(col.stage)"
          >
            <header class="kcol__head">
              <span class="kcol__name">{{ col.stage }}</span>
              <span class="kcol__count">{{ col.cards.length }}</span>
            </header>
            <div class="kcol__cards">
              <article
                v-for="d in col.cards" :key="d.id" class="deal"
                :class="{ 'deal--dragging': draggingId === d.id }"
                role="button" tabindex="0" draggable="true"
                @dragstart="onDragStart(d)" @dragend="onDragEnd" @click="goDetail(d.id)"
              >
                <div class="deal__head">
                  <p v-if="d.company" class="deal__company">{{ d.company }}</p>
                  <p class="deal__name">{{ d.name }}</p>
                  <p v-if="d.serviceType" class="deal__sub">{{ d.serviceType }}</p>
                </div>
                <div class="deal__value">{{ formatMoney(d.value, 'IDR') }}</div>
                <div class="deal__foot">
                  <span class="deal__owner"><span class="deal__avatar">{{ ownerInitials(d.owner) }}</span>{{ d.owner }}</span>
                </div>
              </article>
              <p v-if="!col.cards.length" class="kcol__empty">{{ t('No services') }}</p>
            </div>
            <footer class="kcol__foot">
              <span class="kcol__total-k">{{ t('Total:') }}</span>
              <span class="kcol__total-v">{{ formatMoney(col.total, 'IDR') }}</span>
            </footer>
          </section>
        </div>
      </div>

      <!-- List -->
      <ErpTablePage
        v-else
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total" :current-page="currentPage" :per-page="perPage"
        :sort-key="sortKey" :sort-dir="sortDir" :search="search" :has-active-filter="hasActiveFilter"
        :filter-empty-label="t('service')"
        @update:current-page="setPage" @update:per-page="setPerPage" @toggle-sort="toggleSort"
      >
        <template #cell-name="{ row }">
          <a class="cell-link" @click="goDetail((row as unknown as ServiceDeal).id)">{{ (row as unknown as ServiceDeal).name }}</a>
        </template>
        <template #cell-stage="{ row }">
          <ErpStatusBadge :status="stageBadge((row as unknown as ServiceDeal).stage).type" :label="stageBadge((row as unknown as ServiceDeal).stage).label" badge-for="additionalInformation" />
        </template>
        <template #cell-value="{ row }">{{ formatMoney((row as unknown as ServiceDeal).value, 'IDR') }}</template>
        <template #cell-dueDate="{ row }">{{ (row as unknown as ServiceDeal).dueDate || '—' }}</template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
.crm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); }
.svc-toolbar { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.svc-search { flex: 1; max-width: 320px; }
.cell-link { color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }

/* Kanban (mirrors the Deals board) */
.kanban { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; padding-bottom: var(--mp-spacing-3); }
.kanban__board { display: flex; gap: var(--mp-spacing-4); align-items: stretch; min-height: 100%; }
.kcol { flex: 0 0 288px; width: 288px; display: flex; flex-direction: column; min-height: 0; background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 12px; transition: background 0.12s ease, border-color 0.12s ease; }
.kcol--over { background: var(--mp-background-brand-subtle, #e8f5f0); border-color: var(--mp-border-brand, #0a6e4e); }
.kcol__head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-2); }
.kcol__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcol__count { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral, #fff); border-radius: 999px; padding: 1px 8px; }
.kcol__cards { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2) var(--mp-spacing-2); }
.kcol__empty { margin: 0; padding: var(--mp-spacing-4) 0; text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.kcol__foot { display: flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3); }
.kcol__total-k { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.kcol__total-v { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.deal { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; cursor: pointer; }
.deal:hover { border-color: var(--mp-border-bold, #8c9596); }
.deal--dragging { opacity: 0.45; }
.deal__head { display: flex; flex-direction: column; gap: 2px; }
.deal__company { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__name { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__sub { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.deal__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.deal__owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__avatar { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 22px; height: 22px; border-radius: var(--mp-radii-full, 999px); font-size: 10px; font-weight: var(--mp-font-weights-semi-bold); line-height: 1; background: var(--mp-background-neutral-subtle, #eef1f1); color: var(--mp-text-secondary); }
</style>
