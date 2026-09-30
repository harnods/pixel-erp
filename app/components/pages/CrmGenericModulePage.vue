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
import { ref, computed, reactive } from 'vue'
import { MpButton, MpButtonGroup, MpIcon, MpTooltip } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpIconSegmented from '~/components/patterns/ErpIconSegmented.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CrmGenericFiltersDrawer, { emptyCrmGenericFilters, type CrmGenericFiltersValue, type CrmGenericFilterField } from '~/components/patterns/CrmGenericFiltersDrawer.vue'
import { useTableState } from '~/composables/useTableState'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  getCrmModule, genericRecordsFor, genericModuleStages, genericStageBadgeType,
  moveGenericRecordStage, createGenericRecord, CRM_CURRENT_USER,
  genericPipelineFieldId, moduleStores, isRelatedListType,
  type GenericModuleRecord, type CrmFieldType, type DealProperty,
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
function openCreate() { router.push(`/crm/${moduleId.value}/new`) }

// ── Filters drawer ──
const filtersOpen = ref(false)
function openFilters() { filtersOpen.value = true }
const filtersValue = reactive<CrmGenericFiltersValue>(emptyCrmGenericFilters())
function onApplyFilters(v: CrmGenericFiltersValue) {
  filtersValue.keyword = v.keyword
  filtersValue.keywordColumn = v.keywordColumn
  filtersValue.fieldFilters = { ...v.fieldFilters }
  search.value = v.keyword
}

// ── Pipeline / kanban detection ──
const pipelineFieldId = computed(() => genericPipelineFieldId(moduleId.value))
const hasKanban = computed(() => !!pipelineFieldId.value)
const pipelineFieldLabel = computed(() => {
  if (!pipelineFieldId.value) return ''
  const stores = moduleStores(moduleId.value)
  const prop = stores.properties.find((p) => p.id === pipelineFieldId.value)
  return prop?.label ?? ''
})

// ── View toggle (list default; board only when kanban is configured) ──
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
      const matchesFilter = !status || row.stage === status
      const matchesSearch = !s || [row.name, row.id, row.owner, ...Object.values(row.values).map((v) => String(v ?? ''))].join(' ').toLowerCase().includes(s)
      const ff = filtersValue.fieldFilters
      const matchesFieldFilters = Object.keys(ff).every((fieldId) => {
        const expected = ff[fieldId]
        if (!expected) return true
        const field = filterFields.value.find((f) => f.id === fieldId)
        if (!field) return true
        const actual = row.values[field.variableName] ?? row.values[fieldId] ?? row.values[fieldId.replace(/-/g, '_')] ?? ''
        return String(actual) === expected
      })
      return matchesFilter && matchesSearch && matchesFieldFilters
    },
  })
function fieldTypeToColumnKind(type: CrmFieldType): TableColumn['kind'] {
  switch (type) {
    case 'currency': return 'amount'
    case 'date': return 'date'
    case 'number': return 'number'
    case 'pick-list': case 'radio': return 'status'
    case 'customer': case 'user': case 'text': default: return 'name'
  }
}
function fieldSortType(type: CrmFieldType): 'text' | 'number' {
  return type === 'number' || type === 'currency' ? 'number' : 'text'
}

const NON_TABLE_TYPES = new Set(['File', 'Image', 'file_upload', 'image_upload'])

const layoutProps = computed<DealProperty[]>(() => {
  const stores = moduleStores(moduleId.value)
  const detailTab = stores.detailLayout.tabs.find((tab) => tab.key === 'details')
  if (!detailTab?.sections?.length) return []
  const seen = new Set<string>()
  const result: DealProperty[] = []
  for (const section of detailTab.sections) {
    for (const col of section.cols) {
      for (const propId of col) {
        if (seen.has(propId)) continue
        seen.add(propId)
        const prop = stores.properties.find((p) => p.id === propId)
        if (prop && !isRelatedListType(prop.type) && !NON_TABLE_TYPES.has(prop.type)) result.push(prop)
      }
    }
  }
  return result
})

const PICKLIST_TYPES = new Set(['Dropdown select', 'Radio select', 'pick_list', 'radio_select', 'Single checkbox', 'Multiple checkboxes', 'multi_select', 'single_checkbox'])

const filterFields = computed<CrmGenericFilterField[]>(() => {
  return layoutProps.value
    .filter((p) => PICKLIST_TYPES.has(p.type))
    .map((p) => ({
      id: p.id,
      variableName: p.variableName,
      label: p.name,
      options: (p.config?.options ?? []).map((o) => ({ value: o.label, label: o.label })),
    }))
})

const layoutColumns = computed<TableColumn[]>(() => {
  const props = layoutProps.value
  if (!props.length) {
    return [{ key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' }]
  }
  const cols: TableColumn[] = []
  for (const p of props) {
    const kind = fieldTypeToColumnKind(p.type)
    cols.push({
      key: p.id, label: t(p.name), kind, sortable: true,
      sortType: fieldSortType(p.type),
      ...(kind === 'amount' ? { align: 'right' as const } : {}),
    })
  }
  return cols
})

const allCols = computed(() => layoutColumns.value)
const columnVisibility = reactive<Record<string, boolean>>({})
const columnVisibilityReady = computed(() => {
  const cols = allCols.value
  for (const c of cols) {
    if (!(c.key in columnVisibility)) columnVisibility[c.key] = true
  }
  return columnVisibility
})
const columnItems = computed(() => allCols.value.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 })))
const columns = computed<TableColumn[]>(() => allCols.value.filter((c) => columnVisibilityReady.value[c.key]))
const hasActiveFilter = computed(() => !!statusFilter.value || Object.keys(filtersValue.fieldFilters).some((k) => !!filtersValue.fieldFilters[k]))

const flatRows = computed(() => {
  return paginated.value.map((r) => {
    const row: Record<string, unknown> = { ...r }
    for (const p of layoutProps.value) {
      if (p.id === 'record-name') {
        row[p.id] = r.name
      } else {
        row[p.id] = r.values[p.variableName] ?? r.values[p.id] ?? r.values[p.id.replace(/-/g, '_')] ?? ''
      }
    }
    return row
  })
})


// ── Kanban ──
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

    <div class="cc-stage">
      <div class="cc-filterbar" data-devchange="crm-generic-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            v-if="hasKanban"
            id="gmp-pipeline-filter"
            :model-value="statusFilter"
            :placeholder="pipelineFieldLabel || t('Stage')"
            :options="stages.map((s) => ({ value: s.name, label: s.name }))"
            @update:model-value="(v: string) => (statusFilter = v)"
          />
          <MpButton
            variant="secondary" left-icon="filter" is-rounded
            class="filter-all-btn"
            @click="openFilters"
          >{{ t('All filters') }}</MpButton>
        </div>
        <div class="filter-right">
          <ErpIconSegmented v-if="hasKanban" id="gmp-view" v-model="view" :options="viewOptions" />
          <MpButtonGroup class="filter-btn-group">
            <ColumnSettingsMenu v-if="view === 'table'" id="gmp-columns" :items="columnItems" :visibility="columnVisibilityReady" />
            <MpTooltip :label="t('Export')" placement="bottom">
              <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded />
            </MpTooltip>
          </MpButtonGroup>
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search records…')" />
            <MpButton v-if="search" class="search-clear-btn" type="button" left-icon="close" :aria-label="t('Clear search')" @click="search = ''" />
          </div>
        </div>
      </div>

      <div v-if="view === 'board' && hasKanban" class="kanban" data-devchange="crm-field-driven-pipeline">
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
        data-devchange="crm-generic-index-all-props"
        :columns="columns"
        :rows="(flatRows as unknown as Record<string, unknown>[])"
        :total="total" :current-page="currentPage" :per-page="perPage"
        :sort-key="sortKey" :sort-dir="sortDir" :search="search" :has-active-filter="hasActiveFilter"
        :filter-empty-label="t('record')"
        @update:current-page="setPage" @update:per-page="setPerPage" @toggle-sort="toggleSort"
      >
        <template #cell-record-name="{ row }">
          <a class="cell-link" @click="goDetail((row as unknown as GenericModuleRecord).id)">{{ (row as unknown as GenericModuleRecord).name }}</a>
        </template>
      </ErpTablePage>
    </div>

    <CrmGenericFiltersDrawer
      id="gmp-filters"
      :is-open="filtersOpen"
      :model-value="filtersValue"
      :columns="columnItems"
      :filter-fields="filterFields"
      @update:is-open="(v: boolean) => (filtersOpen = v)"
      @apply="onApplyFilters"
    />
  </div>
</template>

<style scoped>
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); }
.cc-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); padding-bottom: var(--mp-spacing-5); background: var(--mp-background-stage, #fff); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-icon-default, #536062); }
@media (max-width: 640px) {
  .cc-filterbar { flex-wrap: wrap; }
  .cc-filterbar > :last-child { flex: 1 1 100%; }
}
.cell-link { color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }

.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

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
