<script setup lang="ts">
/**
 * Inventory › Grades — the company's Grade List (Batch Attribute PRD stories 3 / 3a,
 * plan Phase 1, docs/prd/batch-attribute-plan.md).
 *
 * The list must keep 1–10 active grades and a grade used by any batch can't be
 * deleted, so every status/delete path either confirms or explains the block — the
 * action is never hidden. Blocked attempts still go through grades.ts so the failed
 * action lands in the activity log (story 3a).
 *
 * Deliberate departures from docs/design/RULES.md:
 * - Default sort is Rank ascending, not alphabetical (rule/table-default-sort-alpha):
 *   rank IS the order of a grade list.
 * - Name/description caps are 50/256 from the PRD, not the counter defaults 60/250
 *   (rule/input-char-counter) — same counter pattern, product-specified limits.
 * - The activity log opens from each row's Last updated cell. rule/activity-log-trigger
 *   describes a detail page's provenance link; grades have no detail page, and that
 *   cell is the same "last updated by" line for its grade.
 * - The row menu has no "View details" (index-page-format): there is no detail page.
 * - The Empty state scenario (rule/index-scenario-fab) previews a state real data
 *   can't reach — a Grade List always keeps at least one active grade.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpText, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpTextlink, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { formatDateTimeLong } from '~/utils/date'
import { successToast } from '~/utils/toasts'
import { useGradeModal } from '~/composables/useGradeModal'
import {
  grades, activeGrades, gradeById, gradeActivity,
  createGrade, updateGrade, setGradeStatus, deleteGrade, reorderGrades,
  GRADE_NAME_MAX, GRADE_DESCRIPTION_MAX, MIN_ACTIVE_GRADES,
  type Grade, type GradeError,
} from '~/data/grades'
import { countBatchesUsingGrade } from '~/data/batchStore'

const { t } = useLocale()

// ─── Scenario (demo) ────────────────────────────────────────────────────────────
const scenario = ref('data')

// ─── Columns ────────────────────────────────────────────────────────────────────
// Name first: the identity column is the one pinned on horizontal scroll
// (rule/table-sticky-first-col). Rank is numeric, so it right-aligns.
const allColumns: TableColumn[] = [
  { key: 'rank', label: t('Rank'), align: 'right', sortable: true, sortType: 'number' },
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'description', label: t('Description'), kind: 'address' },
  { key: 'status', label: t('Status'), kind: 'status', sortable: true, sortType: 'text' },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allColumns.map(c => [c.key, true])))
const columnItems = allColumns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed(() => allColumns.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Rows / table state ─────────────────────────────────────────────────────────
const rows = computed<Grade[]>(() => (scenario.value === 'empty' ? [] : grades()))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Grade>(rows, {
  perPage: 25,
  defaultSort: { key: 'rank', dir: 'asc' },
  filterFn: (row, s) =>
    !s || row.name.toLowerCase().includes(s) || row.description.toLowerCase().includes(s),
})

// ── Reorder (drag) ─────────────────────────────────────────────────────────────
// Dragging sets the rank, so it is only offered while the list IS in rank order:
// another sort, a search, a status filter or a second page would all make the drop
// position mean something different from where the row lands.
const canReorder = computed(() =>
  sortKey.value === 'rank' && sortDir.value === 'asc'
  && !search.value.trim() && total.value <= perPage.value,
)
function onReorder(from: number, to: number) {
  const ids = paginated.value.map((g) => g.id)
  const [moved] = ids.splice(from, 1)
  if (!moved) return
  ids.splice(to, 0, moved)
  reorderGrades(ids)
}

function clearFilters() {
  search.value = ''
}

// ─── Loading (first paint) ─────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Create / edit modal ───────────────────────────────────────────────────────
// Opened from the title bar ([...slug].vue), the empty state, a row name, or Edit.
const { isOpen: formOpen, editingId, openCreate, openEdit, close: closeForm } = useGradeModal()
const editing = computed(() => (editingId.value ? gradeById(editingId.value) : undefined))

const formName = ref('')
const formDescription = ref('')
const nameError = ref('')
const descriptionError = ref('')
const formError = ref('')
const isSaving = ref(false)

watch(formOpen, (open) => {
  if (!open) return
  formName.value = editing.value?.name ?? ''
  formDescription.value = editing.value?.description ?? ''
  nameError.value = ''
  descriptionError.value = ''
  formError.value = ''
})

function errorText(e: GradeError): string {
  switch (e.code) {
    case 'name-required': return t('You must fill in name')
    case 'name-taken': return t('Name already taken')
    case 'max-active': return t('The list already has 10 active grades. Please deactivate a grade before adding another')
    case 'last-active': return t('At least one grade must stay active. Activate or add another grade first.')
    case 'in-use': return t('This grade is used by batches, so it cannot be deleted.')
    // Name/description lengths are capped by maxlength, and a vanished grade can't be
    // edited from this page — kept so every code maps to readable copy.
    default: return t('Something went wrong, please try again')
  }
}

async function saveForm() {
  if (isSaving.value) return
  nameError.value = ''
  descriptionError.value = ''
  formError.value = ''
  const target = editing.value
  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  const result = target
    ? updateGrade(target.id, { name: formName.value, description: formDescription.value })
    : createGrade({ name: formName.value, description: formDescription.value })
  isSaving.value = false
  if (!result.ok) {
    for (const e of result.errors) {
      if (e.field === 'name') nameError.value = errorText(e)
      else if (e.field === 'description') descriptionError.value = errorText(e)
      else formError.value = errorText(e)
    }
    return
  }
  successToast(target ? t('Grade changes saved') : t('Grade saved'))
  closeForm()
}

// ─── Status & delete ───────────────────────────────────────────────────────────
/** A block the user can only acknowledge (no alternative action to offer). */
const blocked = ref<{ title: string; body: string } | null>(null)

const deactivateTarget = ref<Grade | null>(null)
const deleteTarget = ref<Grade | null>(null)
/** An active grade that's used by batches: offer Deactivate instead of Delete. */
const deactivateInsteadTarget = ref<Grade | null>(null)

const confirmOpen = (target: typeof deactivateTarget) => computed({
  get: () => !!target.value,
  set: (v: boolean) => { if (!v) target.value = null },
})
const deactivateOpen = confirmOpen(deactivateTarget)
const deleteOpen = confirmOpen(deleteTarget)
const deactivateInsteadOpen = confirmOpen(deactivateInsteadTarget)

function isLastActive(g: Grade): boolean {
  return g.status === 'active' && activeGrades().length <= MIN_ACTIVE_GRADES
}

function requestDeactivate(g: Grade) {
  if (isLastActive(g)) {
    // Recorded as a failed attempt, then explained.
    setGradeStatus(g.id, 'inactive')
    blocked.value = {
      title: t('Grade cannot be deactivated'),
      body: t('At least one grade must stay active. Activate or add another grade first.'),
    }
    return
  }
  deactivateTarget.value = g
}

function deactivate(g: Grade) {
  const result = setGradeStatus(g.id, 'inactive')
  if (result.ok) {
    successToast(t('Grade deactivated'))
    return
  }
  blocked.value = { title: t('Grade cannot be deactivated'), body: errorText(result.errors[0]!) }
}

function activate(g: Grade) {
  const result = setGradeStatus(g.id, 'active')
  if (result.ok) {
    successToast(t('Grade activated'))
    return
  }
  blocked.value = {
    title: t('Grade cannot be activated'),
    body: t('A grade list can have up to 10 active grades. Deactivate another grade first.'),
  }
}

function requestDelete(g: Grade) {
  const inUse = countBatchesUsingGrade(g.id) > 0
  if (inUse && !isLastActive(g) && g.status === 'active') {
    deleteGrade(g.id) // recorded as a failed attempt
    deactivateInsteadTarget.value = g
    return
  }
  if (inUse || isLastActive(g)) {
    const result = deleteGrade(g.id) // recorded as a failed attempt
    blocked.value = {
      title: t('Grade cannot be deleted'),
      body: result.ok ? '' : errorText(result.errors[0]!),
    }
    return
  }
  deleteTarget.value = g
}

function confirmDelete() {
  const g = deleteTarget.value
  if (!g) return
  const result = deleteGrade(g.id)
  if (result.ok) {
    successToast(t('Grade deleted'))
    return
  }
  blocked.value = { title: t('Grade cannot be deleted'), body: errorText(result.errors[0]!) }
}

// ─── Activity log (whole list) ─────────────────────────────────────────────────
/** The most recent change across the list — the provenance line that opens the log
 *  (rule/activity-log-trigger: the line IS the affordance, click the thing it says). */
const lastUpdated = computed(() =>
  rows.value.reduce<Grade | null>((latest, g) => (!latest || g.updatedAt > latest.updatedAt ? g : latest), null),
)
// The Last updated column is gone, so the list's own log opens from the link above
// the table and carries every grade's entries together, newest first.
const listActivityOpen = ref(false)
const listActivityEntries = computed<ActivityEntry[]>(() => {
  const recorded = gradeActivity().map(e => ({
    date: e.date,
    user: e.user,
    activity: t(e.activity),
    details: e.details.map(d => ({ label: t(d.label), value: d.value })),
  }))
  // Seed grades were created before anything was recorded — derive that first entry
  // from the record itself so the trail still starts at creation
  // (rule/activity-log-entries).
  const created = new Set(gradeActivity().filter(e => e.activity === 'Created grade').map(e => e.gradeId))
  const seeded = rows.value
    .filter(g => !created.has(g.id))
    .map(g => ({
      date: g.createdAt,
      user: 'System',
      activity: t('Created grade'),
      details: [{ label: t('Name'), value: g.name }, { label: t('Rank'), value: String(g.rank) }],
    }))
  return [...recorded, ...seeded].sort((a, b) => b.date.localeCompare(a.date))
})

// ─── Export ─────────────────────────────────────────────────────────────────────
const exportOpen = ref(false)
const exportColumns = [
  { key: 'name', label: t('Name'), required: true },
  { key: 'rank', label: t('Rank') },
  { key: 'description', label: t('Description') },
  { key: 'status', label: t('Status') },
  { key: 'updatedAt', label: t('Last updated') },
]
function onExport() {
  exportOpen.value = false
  successToast(t('Grades exported'))
}

const emptyIllustration = '/illustrations/empty-folder.png'
const asGrade = (row: unknown) => row as Grade
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :search="search"
    :has-active-search="!!search.trim()"
    filter-empty-label="grade"
    :sortable-rows="canReorder"
    bulk-label="grade"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
    @reorder="onReorder"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- rule/activity-log-trigger: the "Last updated by … " provenance line IS the
             trigger. An index page has no detail summary, so it sits above the table. -->
        <MpTextlink
          v-if="lastUpdated" id="grade-activity-log" as="a" class="grade-updated"
          @click.prevent="listActivityOpen = true"
        >
          {{ t('Last updated by') }} {{ lastUpdated.updatedBy }} {{ t('on') }} {{ formatDateTimeLong(lastUpdated.updatedAt) }}
        </MpTextlink>
      </div>
      <div class="filter-right">
        <!-- rule/filter-bar-icon-group: ghost icon tools in one group, each tooltipped. -->
        <MpButtonGroup class="filter-btn-group">
          <ColumnSettingsMenu id="grade-columns" :items="columnItems" :visibility="columnVisibility" :tooltip="t('Column settings')" />
          <MpTooltip id="tt-grade-export" :label="t('Export')" placement="bottom" use-portal>
            <MpButton
              variant="ghost" is-rounded class="filter-icon-btn"
              left-icon="download" :aria-label="t('Export')" @click="exportOpen = true"
            />
          </MpTooltip>
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')">
          <MpButton
            v-if="search" variant="ghost" class="filter-search-clear"
            left-icon="close" :aria-label="t('Clear search')" @click="search = ''"
          />
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-name="{ value, row }">
      <span
        class="cell-link" role="button" tabindex="0"
        @click.stop="openEdit(asGrade(row).id)" @keydown.enter="openEdit(asGrade(row).id)"
      >{{ value }}</span>
    </template>

    <template #cell-description="{ value }">
      <span class="grade-wrap">{{ value || '—' }}</span>
    </template>

    <template #cell-status="{ value }">
      <ErpStatusBadge :status="String(value)" :label="value === 'active' ? t('Active') : t('Inactive')" />
    </template>

    <!-- ── Row actions (no tooltip on the kebab — rule/table-actions-no-tooltip) ── -->
    <template #actions="{ row }">
      <MpPopover
        :id="`grade-actions-${asGrade(row).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" class="row-kebab" left-icon="menu-kebab" :aria-label="t('More actions')" />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openEdit(asGrade(row).id)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="asGrade(row).status === 'active'" @click="requestDeactivate(asGrade(row))">
              {{ t('Deactivate') }}
            </MpPopoverListItem>
            <MpPopoverListItem v-else @click="activate(asGrade(row))">{{ t('Activate') }}</MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-colors-text-critical, #d93b3b)' })"
              @click="requestDelete(asGrade(row))"
            >{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Empty state (never had data) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('No grades') }}</p>
        <p class="empty-full-desc">{{ t('Grades will appear here.') }}</p>
        <MpButton variant="secondary" is-rounded left-icon="add" @click="openCreate">{{ t('New grade') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Create / edit grade — a form, so overlay clicks don't discard input ── -->
  <MpModal
    id="grade-form-modal" :is-open="formOpen" size="md"
    is-close-on-esc :is-keep-alive="false" @close="closeForm"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ editing ? t('Edit grade') : t('New grade') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="grade-form">
          <MpFormControl id="grade-name" is-required :is-invalid="!!nameError">
            <div class="grade-label-row">
              <MpFormLabel>{{ t('Name') }}</MpFormLabel>
              <span class="grade-counter">{{ formName.length }}/{{ GRADE_NAME_MAX }}</span>
            </div>
            <!-- The control takes MpFormControl's id (grade-name), so no id of its own. -->
            <MpInput
              v-model="formName" :maxlength="GRADE_NAME_MAX"
              :is-invalid="!!nameError" @input="nameError = ''"
            />
            <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="grade-description" :is-invalid="!!descriptionError">
            <div class="grade-label-row">
              <MpFormLabel>{{ t('Description') }}</MpFormLabel>
              <span class="grade-counter">{{ formDescription.length }}/{{ GRADE_DESCRIPTION_MAX }}</span>
            </div>
            <MpTextarea
              v-model="formDescription" :maxlength="GRADE_DESCRIPTION_MAX"
              :is-invalid="!!descriptionError" @input="descriptionError = ''"
            />
            <MpFormErrorMessage>{{ descriptionError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Errors that don't belong to one field (e.g. the 10-active limit). -->
          <p v-if="formError" class="grade-form-error" role="alert">{{ formError }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="closeForm">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="saveForm">{{ editing ? t('Save changes') : t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Deactivate (not destructive — primary, not danger) ── -->
  <ConfirmModal
    v-model:is-open="deactivateOpen"
    :title="t('Deactivate grade?')"
    :description="t('Inactive grades can\'t be selected for new batches. Batches that already use this grade keep it.')"
    :confirm-label="t('Deactivate grade')"
    :is-danger="false"
    @confirm="deactivateTarget && deactivate(deactivateTarget)"
  />

  <!-- ── Delete an unused grade ── -->
  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete grade?')"
    :description="t('Deleted grade cannot be restored.')"
    :confirm-label="t('Delete grade')"
    @confirm="confirmDelete"
  />

  <!-- ── Delete a grade batches use → offer Deactivate instead (PRD story 3) ── -->
  <ConfirmModal
    v-model:is-open="deactivateInsteadOpen"
    :title="t('Deactivate grade instead?')"
    :description="t('This grade is used by batches, so it cannot be deleted. Deactivate it to stop it from being selected for new batches.')"
    :confirm-label="t('Deactivate grade')"
    :is-danger="false"
    @confirm="deactivateInsteadTarget && deactivate(deactivateInsteadTarget)"
  />

  <!-- ── A block with nothing else to offer — acknowledge only ── -->
  <MpModal
    id="grade-blocked-modal" :is-open="!!blocked" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="blocked = null"
  >
    <MpModalContent>
      <MpModalHeader>{{ blocked?.title }}</MpModalHeader>
      <MpModalBody>
        <MpText>{{ blocked?.body }}</MpText>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="blocked = null">{{ t('Close') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ActivityLogModal
    :is-open="listActivityOpen"
    :subject="t('Grades')"
    :entries="listActivityEntries"
    @close="listActivityOpen = false"
  />

  <ExportModal
    :open="exportOpen"
    :title="t('Export grades')"
    :entity-label="t('grades')"
    :columns="exportColumns"
    :total="total"
    @close="exportOpen = false"
    @export="onExport"
  />

  <ScenarioFab v-model="scenario" />
</template>

<style scoped>
/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important; padding: var(--mp-spacing-2) !important;
  color: var(--mp-colors-text-default, #232933);
}
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-colors-text-default, #232933);
}
.filter-search-clear {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px) !important; height: var(--mp-sizes-5, 20px) !important;
  min-width: 0 !important; padding: 0 !important;
}

/* ── Cells ── */
.grade-wrap { white-space: normal; }
.grade-updated { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }

.row-kebab {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px) !important; height: var(--mp-sizes-5, 20px) !important;
  min-width: 0 !important; padding: 0 !important;
  margin-left: auto;
}

/* ── Form ── */
.grade-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.grade-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); }
.grade-counter, .grade-caption {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79);
}
.grade-caption { margin-top: var(--mp-spacing-1); }
.grade-form-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-critical, #d93b3b); }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-default, #232933);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79);
}
</style>
