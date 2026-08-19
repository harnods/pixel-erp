<script setup lang="ts">
/**
 * CRM (Qontak) — Tasks (/crm/tasks). Full-bleed page that owns its title bar, then
 * either an ERP-standard table (ErpTablePage + useTableState — same filter bar,
 * sort menus, pagination and behaviour as every ERP index page) or a kanban board
 * grouped by task stage (drag a card between columns to change its stage).
 */
import { ref, computed } from 'vue'
import { MpButton, MpIcon, MpSelect, MpSegmentedControl, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { useTableState } from '~/composables/useTableState'
import { formatDate } from '~/utils/date'
import { employees } from '~/data'
import { crmTasks, taskStages, setTaskStage, type CrmTask, type TaskStage } from '~/data/crm'

function soon(what: string) { toast.notify({ variant: 'info', title: `${what} — coming soon`, maxWidth: 'max-content' }) }

// ── View switch (table / kanban) ──────────────────────────────────────────────
const view = ref('table')
const viewOptions = [
  { id: 'tv-table',  value: 'table',  icon: 'table-view-list' },
  { id: 'tv-kanban', value: 'kanban', icon: 'table-view-column' },
]

// ── Owner avatar (from the HR employee directory) ─────────────────────────────
function ownerPhoto(name: string): string | undefined { return employees.find((e) => e.fullName === name)?.photo }
function ownerInitials(name: string): string { return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() }

// ── Badge mapping (Enterprise semantic colours only) ──────────────────────────
function stageType(s: string): 'completed' | 'warning' | 'information' | 'announcement' {
  return s === 'Completed' ? 'completed' : s === 'In progress' ? 'information' : s === 'Waiting' ? 'warning' : 'announcement'
}
function prioType(p: string): 'critical' | 'warning' | 'announcement' {
  return p === 'high' ? 'critical' : p === 'medium' ? 'warning' : 'announcement'
}
const prioLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1)

// ── Filters ───────────────────────────────────────────────────────────────────
const priorityFilter = ref('')
const priorityOptions = [
  { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
]
const stageOptions = taskStages.map((s) => ({ value: s, label: s }))
const stageFilterLabel = computed(() => stageOptions.find((o) => o.value === statusFilter.value)?.label ?? '')
const priorityFilterLabel = computed(() => priorityOptions.find((o) => o.value === priorityFilter.value)?.label ?? '')

// Source pre-filtered by the priority quick-filter; useTableState handles the rest.
const source = computed(() => crmTasks.filter((t) => !priorityFilter.value || t.priority === priorityFilter.value))
function matches(row: CrmTask, s: string, stage: string): boolean {
  const hitsSearch = !s || row.title.toLowerCase().includes(s) || row.relatedTo.toLowerCase().includes(s) || row.owner.toLowerCase().includes(s)
  return hitsSearch && (!stage || row.stage === stage)
}
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<CrmTask>(source, { filterFn: (row, s, status) => matches(row, s, status) })
sortKey.value = 'dueDate'; sortDir.value = 'asc'

// First-load skeleton (ERP guideline: solid, ~1.2s) — table via ErpTablePage's
// :loading, kanban via the skeleton board below.
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const hasActiveFilter = computed(() => !!statusFilter.value || !!priorityFilter.value)
function clearFilters() { statusFilter.value = ''; priorityFilter.value = '' }

const columns: TableColumn[] = [
  { key: 'title',     label: 'Task name',   sortType: 'text', width: '280px' },
  { key: 'stage',     label: 'Task stage',  width: '150px' },
  { key: 'relatedTo', label: 'Related to',  sortType: 'text', width: '220px' },
  { key: 'dueDate',   label: 'Due date',    sortType: 'date', width: '150px' },
  { key: 'priority',  label: 'Priority',    width: '120px' },
  { key: 'owner',     label: 'Owner',       sortType: 'text', width: '200px' },
]

// ── Kanban ────────────────────────────────────────────────────────────────────
const filteredTasks = computed(() => source.value.filter((t) => matches(t, search.value.toLowerCase().trim(), statusFilter.value)))
const kanbanColumns = computed(() => taskStages.map((stage) => ({ stage, cards: filteredTasks.value.filter((t) => t.stage === stage) })))

const draggingId = ref<string | null>(null)
const dragOverStage = ref<TaskStage | null>(null)
function onDragStart(id: string) { draggingId.value = id }
function onDrop(stage: TaskStage) {
  if (draggingId.value) setTaskStage(draggingId.value, stage)
  draggingId.value = null; dragOverStage.value = null
}
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Tasks</h1>
      </div>
      <div class="crm-titlebar__right">
        <button class="crm-btn crm-btn--primary" type="button" @click="soon('New task')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
          New task
        </button>
      </div>
    </header>

    <!-- ── Table view (ERP-standard) ── -->
    <div v-if="view === 'table'" class="crm-tablewrap">
      <ErpTablePage
        :columns="columns"
        :rows="(paginated as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        has-checkbox
        bulk-label="task"
        :loading="loading"
        actions-width="52px"
        filter-empty-label="task"
        :search="search"
        :has-active-filter="hasActiveFilter"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <MpPopover id="task-stage-filter" is-close-on-select>
              <MpPopoverTrigger>
                <MpSelect id="task-stage-select" placeholder="Status" :model-value="statusFilter" is-clearable :class="css({ width: '150px' })" @mousedown.prevent @clear="statusFilter = ''">
                  <option v-if="statusFilter" :value="statusFilter">{{ stageFilterLabel }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '150px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="opt in stageOptions" :key="opt.value" :is-active="opt.value === statusFilter" @click="statusFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
            <MpPopover id="task-prio-filter" is-close-on-select>
              <MpPopoverTrigger>
                <MpSelect id="task-prio-select" placeholder="Priority" :model-value="priorityFilter" is-clearable :class="css({ width: '150px' })" @mousedown.prevent @clear="priorityFilter = ''">
                  <option v-if="priorityFilter" :value="priorityFilter">{{ priorityFilterLabel }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '150px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="opt in priorityOptions" :key="opt.value" :is-active="opt.value === priorityFilter" @click="priorityFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
          <div class="filter-right">
            <MpSegmentedControl id="task-view-switch" name="task-view-switch" v-model="view" :data="viewOptions" />
            <div class="filter-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input v-model="search" class="filter-search-input" type="text" placeholder="Search...">
              <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
        </template>

        <template #cell-title="{ row }">
          <a class="cell-link" @click.stop="soon('Task detail')">{{ (row as CrmTask).title }}</a>
        </template>
        <template #cell-stage="{ row }">
          <ErpStatusBadge :status="(row as CrmTask).stage" :label="(row as CrmTask).stage" :type="stageType((row as CrmTask).stage)" />
        </template>
        <template #cell-dueDate="{ value }">{{ formatDate(value as string) }}</template>
        <template #cell-priority="{ row }">
          <ErpStatusBadge :status="(row as CrmTask).priority" :label="prioLabel((row as CrmTask).priority)" :type="prioType((row as CrmTask).priority)" />
        </template>
        <template #cell-owner="{ row }">
          <span class="owner-cell">
            <span class="owner-avatar">
              <img v-if="ownerPhoto((row as CrmTask).owner)" :src="ownerPhoto((row as CrmTask).owner)" :alt="(row as CrmTask).owner">
              <template v-else>{{ ownerInitials((row as CrmTask).owner) }}</template>
            </span>
            {{ (row as CrmTask).owner }}
          </span>
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`task-actions-${(row as CrmTask).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="row-kebab" type="button" aria-label="More actions">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="soon('Task detail')">View details</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Edit task')">Edit</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Mark as completed')">Mark as completed</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </ErpTablePage>
    </div>

    <!-- ── Kanban view ── -->
    <template v-else>
      <div class="crm-filter">
        <div class="crm-filter__left">
          <MpPopover id="task-stage-filter-k" is-close-on-select>
            <MpPopoverTrigger>
              <MpSelect id="task-stage-select-k" placeholder="Status" :model-value="statusFilter" is-clearable :class="css({ width: '150px' })" @mousedown.prevent @clear="statusFilter = ''">
                <option v-if="statusFilter" :value="statusFilter">{{ stageFilterLabel }}</option>
              </MpSelect>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '150px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="opt in stageOptions" :key="opt.value" :is-active="opt.value === statusFilter" @click="statusFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          <MpPopover id="task-prio-filter-k" is-close-on-select>
            <MpPopoverTrigger>
              <MpSelect id="task-prio-select-k" placeholder="Priority" :model-value="priorityFilter" is-clearable :class="css({ width: '150px' })" @mousedown.prevent @clear="priorityFilter = ''">
                <option v-if="priorityFilter" :value="priorityFilter">{{ priorityFilterLabel }}</option>
              </MpSelect>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '150px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="opt in priorityOptions" :key="opt.value" :is-active="opt.value === priorityFilter" @click="priorityFilter = opt.value">{{ opt.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <div class="crm-filter__right">
          <MpSegmentedControl id="task-view-switch-k" name="task-view-switch-k" v-model="view" :data="viewOptions" />
          <div class="filter-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input v-model="search" class="filter-search-input" type="text" placeholder="Search...">
          </div>
        </div>
      </div>
      <!-- First-load skeleton board -->
      <div v-if="loading" class="kanban">
        <div class="kanban__board">
          <div v-for="s in taskStages" :key="s" class="kcol">
            <div class="kcol__head"><MpSkeleton class="crm-skeleton" width="88px" height="14px" rounded="sm" duration="0s" /></div>
            <div class="kcol__cards">
              <div v-for="n in 3" :key="n" class="tcard tcard--skeleton">
                <MpSkeleton class="crm-skeleton" width="70%" height="12px" rounded="sm" duration="0s" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="kanban">
        <div class="kanban__board">
          <div
            v-for="col in kanbanColumns"
            :key="col.stage"
            class="kcol"
            :class="{ 'kcol--over': dragOverStage === col.stage }"
            @dragover.prevent="dragOverStage = col.stage"
            @dragleave="dragOverStage === col.stage && (dragOverStage = null)"
            @drop="onDrop(col.stage)"
          >
            <div class="kcol__head">
              <span class="kcol__name">{{ col.stage }}</span>
              <span class="kcol__count">{{ col.cards.length }}</span>
            </div>
            <div class="kcol__cards">
              <article
                v-for="t in col.cards"
                :key="t.id"
                class="tcard"
                draggable="true"
                @dragstart="onDragStart(t.id)"
                @dragend="draggingId = null"
                @click="soon('Task detail')"
              >
                <p class="tcard__title">{{ t.title }}</p>
                <p class="tcard__sub">{{ t.type }} · {{ t.relatedTo }}</p>
                <div class="tcard__foot">
                  <ErpStatusBadge :status="t.priority" :label="prioLabel(t.priority)" :type="prioType(t.priority)" />
                  <span class="tcard__due">Due {{ formatDate(t.dueDate) }}</span>
                  <span class="owner-avatar owner-avatar--sm" :title="t.owner">
                    <img v-if="ownerPhoto(t.owner)" :src="ownerPhoto(t.owner)" :alt="t.owner">
                    <template v-else>{{ ownerInitials(t.owner) }}</template>
                  </span>
                </div>
              </article>
              <p v-if="!col.cards.length" class="kcol__empty">No tasks</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.crm-tablewrap {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 0;
}
.crm-tablewrap :deep(.erp-table-page) { height: 100%; }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }

.cell-link { color: var(--mp-text-link, #165082); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-text-subtle); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

.owner-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.owner-avatar {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d);
  font-size: 11px; font-weight: var(--mp-font-weights-semi-bold);
}
.owner-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* Pill search (matches HR/ERP) */
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: 999px; }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Kanban ── */
.kanban { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; padding: var(--mp-spacing-5) var(--mp-spacing-6); background: var(--mp-background-stage, #fff); }
.kanban__board { display: flex; gap: var(--mp-spacing-3); height: 100%; }
.kcol { width: 288px; flex-shrink: 0; height: 100%; display: flex; flex-direction: column; background: var(--mp-background-neutral-subtle, #f8f9fb); border-radius: var(--mp-radii-md, 6px); border: 1px solid transparent; transition: border-color 100ms, background 100ms; }
.kcol--over { border-color: var(--mp-text-selected, #0f6d4d); background: var(--mp-background-nav-stack-hovered, #d6f4e9); }
.kcol__head { flex-shrink: 0; height: 48px; display: flex; align-items: center; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-4); }
.kcol__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.kcol__count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.kcol__cards { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2) var(--mp-spacing-2); }
.kcol__empty { margin: var(--mp-spacing-2) 0 0; text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.tcard { background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px); padding: var(--mp-spacing-3); cursor: grab; }
.tcard:active { cursor: grabbing; }
.tcard:hover { border-color: var(--mp-border-bold, #8c9596); }
.tcard__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tcard__sub { margin: 2px 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.tcard__foot { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.tcard__due { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-left: auto; }
.owner-avatar--sm { width: 22px; height: 22px; }

/* First-load skeleton — solid, no shimmer/animation (ERP guideline). */
.crm-skeleton { background-image: none !important; background-color: var(--mp-border-default) !important; animation: none !important; }
.tcard--skeleton { display: block; cursor: default; min-height: 96px; padding: var(--mp-spacing-4); }
.tcard--skeleton:hover { border-color: var(--mp-border-default, #e3e7e9); }
</style>
