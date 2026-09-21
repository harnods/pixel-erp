<script setup lang="ts">
/**
 * Inventory › Grades — the company's Grade List (Batch Attribute PRD stories 3 / 3a,
 * plan Phase 1, docs/prd/batch-attribute-plan.md).
 *
 * The list keeps 1–10 grades and a grade used by any batch can't be deleted, so the
 * delete path either confirms or explains the block — the action is never hidden.
 * Blocked attempts still go through grades.ts so the failed action lands in the
 * activity log (story 3a). Rank is set on creation and never changes, and grades
 * have no Active/Inactive status (design review, 21 Sep 2026).
 *
 * Deliberate departures from docs/design/RULES.md:
 * - Default sort is Rank ascending, not alphabetical (rule/table-default-sort-alpha):
 *   rank IS the order of a grade list.
 * - Name/description caps are 50/256 from the PRD, not the counter defaults 60/250
 *   (rule/input-char-counter) — same counter pattern, product-specified limits.
 * - The activity log opens from a "Last updated by …" line above the table: an index
 *   page has no detail summary to put rule/activity-log-trigger's line under.
 * - The row menu has no "View details" (index-page-format): there is no detail page.
 * - The Empty state scenario (rule/index-scenario-fab) previews a state real data
 *   can't reach — a Grade List always keeps at least one grade.
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpText,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpTextlink, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { formatDateTimeLong } from '~/utils/date'
import { successToast } from '~/utils/toasts'
import { useGradeModal } from '~/composables/useGradeModal'
import {
  grades, gradeById, gradeActivity,
  createGrade, updateGrade, deleteGrade,
  GRADE_NAME_MAX, GRADE_DESCRIPTION_MAX, MIN_ACTIVE_GRADES,
  type Grade, type GradeError,
} from '~/data/grades'
import { countBatchesUsingGrade } from '~/data/batchStore'

const { t } = useLocale()

// ─── Scenario (demo) ────────────────────────────────────────────────────────────
const scenario = ref('data')

// ─── Columns ────────────────────────────────────────────────────────────────────
// Rank leads — it IS the list's order. Rank is numeric, so it right-aligns. Three
// columns, so there's no column-settings menu to hide any of them.
const columns: TableColumn[] = [
  { key: 'rank', label: t('Rank'), align: 'right', sortable: true, sortType: 'number' },
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'description', label: t('Description'), kind: 'address' },
]

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
    case 'max-active': return t('The list already has 10 grades. Delete a grade before adding another')
    case 'last-active': return t('A grade list must keep at least one grade.')
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

// ─── Delete ────────────────────────────────────────────────────────────────────
/** A block the user can only acknowledge (no alternative action to offer). */
const blocked = ref<{ title: string; body: string } | null>(null)

const deleteTarget = ref<Grade | null>(null)
const deleteOpen = computed({
  get: () => !!deleteTarget.value,
  set: (v: boolean) => { if (!v) deleteTarget.value = null },
})

function requestDelete(g: Grade) {
  // Used by batches, or the list's only grade: explain the block. The attempt still
  // goes through deleteGrade so it's recorded in the activity log (story 3a).
  if (countBatchesUsingGrade(g.id) > 0 || grades().length <= MIN_ACTIVE_GRADES) {
    const result = deleteGrade(g.id)
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

const emptyIllustration = '/illustrations/empty-folder.png'
const asGrade = (row: unknown) => row as Grade
</script>

<template>
  <ErpTablePage
    :columns="columns"
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
    bulk-label="grade"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
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

  <!-- ── Delete an unused grade ── -->
  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete grade?')"
    :description="t('Deleted grade cannot be restored.')"
    :confirm-label="t('Delete grade')"
    @confirm="confirmDelete"
  />

  <!-- ── A block with nothing else to offer — acknowledge only. Closes only on its
       own controls (rule/modal-drawer-close-explicit-only). ── -->
  <MpModal
    id="grade-blocked-modal" :is-open="!!blocked" size="md"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" :is-keep-alive="false" @close="blocked = null"
  >
    <MpModalContent>
      <MpModalHeader>{{ blocked?.title }}<MpModalCloseButton /></MpModalHeader>
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

/* rule/table-actions-column: a single 38px button in the 44px column, top-aligned.
   At 38px, a top-aligned kebab lands on a single-line row's middle; a smaller one
   sits high, which is what made this column look off-centre. */
.row-kebab {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9\.5, 38px) !important; height: var(--mp-sizes-9\.5, 38px) !important;
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
