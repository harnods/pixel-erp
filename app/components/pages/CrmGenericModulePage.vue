<script setup lang="ts">
/**
 * CrmGenericModulePage — records workspace for ANY custom module created via
 * "+ New module" (Settings ▸ Modules) beyond the hand-built Deals/Service deals.
 * Same shape as the Deals/Service-deals index (title bar → view toggle + search →
 * list or Stage kanban), but fully driven by the module's OWN pipeline + records
 * (genericModuleStages/genericRecordsFor) — so any module a user creates gets an
 * immediately usable workspace, with zero per-module hand-authoring.
 *
 * Core-workspace scope: Name/Customer/Contact person/Stage/Value/Due date columns
 * (the guaranteed default properties every module has), a stage kanban, and simple
 * stage moves.
 */
import { ref, computed } from 'vue'
import { MpButton, MpButtonGroup, MpIcon } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpIconSegmented from '~/components/patterns/ErpIconSegmented.vue'
import { useTableState } from '~/composables/useTableState'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  getCrmModule, genericRecordsFor, genericModuleStages, genericStageBadgeType,
  moveGenericRecordStage, createGenericRecord, CRM_CURRENT_USER,
  genericPipelineFieldId,
  type GenericModuleRecord,
} from '~/data/crm'

// `orderId` unused here (always '' for the list page) — kept only so this
// component matches the standard { orderId } contract every detailMatch page
// receives. The module id isn't threaded through detailMatch (that would change a
// contract shared by every other page), so it's derived from the route itself,
// same spot every CRM level-1 page reads its own segment from.
defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()
const moduleId = computed(() => route.path.split('/').filter(Boolean)[1] ?? '')

const moduleName = computed(() => getCrmModule(moduleId.value)?.name ?? moduleId.value)
const records = computed<GenericModuleRecord[]>(() => genericRecordsFor(moduleId.value))
const stages = computed(() => genericModuleStages(moduleId.value))

function goDetail(id: string) { router.push(`/crm/${moduleId.value}/${id}`) }
function openCreate() {
  const rec = createGenericRecord(moduleId.value)
  goDetail(rec.id)
}

// ── View toggle (list default) ──
const view = ref<'table' | 'board'>('table')
const viewOptions = [
  { value: 'table', icon: 'table-view-list', label: t('List view') },
  { value: 'board', icon: 'table-view-column', label: t('Board view') },
]

// ── List ──
const { search, statusFilter, currentPage, perPage, sortKey, sortDir, total, paginated, setPage, setPerPage, toggleSort } =
  useTableState<GenericModuleRecord>(records, {
    perPage: 25,
    defaultSort: { key: 'createdAt', dir: 'desc' },
    filterFn: (row, s, status) => {
      const matchesStage = !status || row.stage === status
      const matchesSearch = !s || [row.name, row.id, row.owner, row.values.customer ?? '', row.values.contactPerson ?? ''].join(' ').toLowerCase().includes(s)
      return matchesStage && matchesSearch
    },
  })
const columns: TableColumn[] = [
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'customer', label: t('Company'), kind: 'name' },
  { key: 'contactPerson', label: t('Contact person'), kind: 'name' },
  { key: 'stage', label: t('Stage'), kind: 'status' },
  { key: 'value', label: t('Value'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'dueDate', label: t('Due date'), kind: 'date' },
]
const hasActiveFilter = computed(() => !!statusFilter.value)

// ── Kanban ──
const hasPipelineField = computed(() => !!genericPipelineFieldId(moduleId.value) || stages.value.length > 0)
interface Col { stage: string; kind: string; cards: GenericModuleRecord[]; total: number }
const boardColumns = computed<Col[]>(() => {
  const s = search.value.trim().toLowerCase()
  return stages.value.map((st) => {
    const cards = records.value.filter((d) => d.stage === st.name && (!s || [d.name, d.id, d.owner].join(' ').toLowerCase().includes(s)))
    return { stage: st.name, kind: st.kind, cards, total: cards.reduce((sum, d) => sum + (d.values.dealValue ?? 0), 0) }
  })
})
const draggingId = ref<string | null>(null)
const dragOverStage = ref<string | null>(null)
function onDragStart(d: GenericModuleRecord) { draggingId.value = d.id }
function onDragEnd() { draggingId.value = null; dragOverStage.value = null }
function onDrop(stage: string) {
  if (draggingId.value) { moveGenericRecordStage(moduleId.value, draggingId.value, stage); successToast(t('Stage updated')) }
  onDragEnd()
}
function ownerInitials(name: string) { return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() }
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left"><h1 class="crm-title">{{ moduleName }}</h1></div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="primary" is-rounded left-icon="add" @click="openCreate">{{ t('New record') }}</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="crm-body">
      <div class="gmp-toolbar">
        <ErpIconSegmented id="gmp-view" v-model="view" :options="viewOptions" />
        <ErpFilterSelect
          id="gmp-stage-filter"
          :model-value="statusFilter"
          :placeholder="t('Stage')"
          :options="stages.map((s) => ({ value: s.name, label: s.name }))"
          @update:model-value="(v: string) => (statusFilter = v)"
        />
        <div class="filter-search gmp-search">
          <MpIcon name="search" size="sm" class="filter-search-icon" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search records…')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>

      <div v-if="view === 'board'" class="kanban" data-devchange="crm-field-driven-pipeline">
        <div v-if="!hasPipelineField" class="kanban-empty">
          <p class="kanban-empty__text">{{ t('No Kanban grouping configured. Go to Settings → Modules to assign a property.') }}</p>
        </div>
        <div v-else class="kanban__board">
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
                  <p v-if="d.values.customer" class="deal__company">{{ d.values.customer }}</p>
                  <p class="deal__name">{{ d.name }}</p>
                </div>
                <div class="deal__value">{{ formatMoney(d.values.dealValue ?? 0, d.values.currency ?? 'IDR') }}</div>
                <div class="deal__foot">
                  <span class="deal__owner"><span class="deal__avatar">{{ ownerInitials(d.owner) }}</span>{{ d.owner }}</span>
                </div>
              </article>
              <p v-if="!col.cards.length" class="kcol__empty">{{ t('No records') }}</p>
            </div>
            <footer class="kcol__foot">
              <span class="kcol__total-k">{{ t('Total:') }}</span>
              <span class="kcol__total-v">{{ formatMoney(col.total, 'IDR') }}</span>
            </footer>
          </section>
        </div>
      </div>

      <ErpTablePage
        v-else
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total" :current-page="currentPage" :per-page="perPage"
        :sort-key="sortKey" :sort-dir="sortDir" :search="search" :has-active-filter="hasActiveFilter"
        :filter-empty-label="t('record')"
        @update:current-page="setPage" @update:per-page="setPerPage" @toggle-sort="toggleSort"
      >
        <template #cell-name="{ row }">
          <a class="cell-link" @click="goDetail((row as unknown as GenericModuleRecord).id)">{{ (row as unknown as GenericModuleRecord).name }}</a>
        </template>
        <template #cell-customer="{ row }">{{ (row as unknown as GenericModuleRecord).values.customer || '—' }}</template>
        <template #cell-contactPerson="{ row }">{{ (row as unknown as GenericModuleRecord).values.contactPerson || '—' }}</template>
        <template #cell-stage="{ row }">
          <ErpStatusBadge :status="(row as unknown as GenericModuleRecord).stage" :type="genericStageBadgeType(moduleId, (row as unknown as GenericModuleRecord).stage)" :label="(row as unknown as GenericModuleRecord).stage" />
        </template>
        <template #cell-value="{ row }">{{ formatMoney((row as unknown as GenericModuleRecord).values.dealValue ?? 0, (row as unknown as GenericModuleRecord).values.currency ?? 'IDR') }}</template>
        <template #cell-dueDate="{ row }">{{ (row as unknown as GenericModuleRecord).values.dueDate || '—' }}</template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
.crm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); }
.gmp-toolbar { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.gmp-search { flex: 1; max-width: 320px; margin-left: auto; }
.cell-link { color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }

/* Kanban empty state (no pipeline field assigned) */
.kanban-empty { display: flex; align-items: center; justify-content: center; flex: 1; min-height: 200px; }
.kanban-empty__text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; max-width: 400px; }

/* Kanban — same standard as CrmDealsPage.vue */
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
.deal__value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.deal__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.deal__owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__avatar { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 22px; height: 22px; border-radius: var(--mp-radii-full, 999px); font-size: 10px; font-weight: var(--mp-font-weights-semi-bold); line-height: 1; background: var(--mp-background-neutral-subtle, #eef1f1); color: var(--mp-text-secondary); }
</style>
