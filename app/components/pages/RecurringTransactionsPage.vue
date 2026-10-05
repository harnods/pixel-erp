<!-- prod-parity: quickbook/app/views/recurring_schedules/index.html.haml (+ _search_recurring, _table_index, _modal_form_setup/_edit/_delete) -->
<script setup lang="ts">
/**
 * Other lists → Recurring transactions (prod "Recurring Schedule List").
 * Filters: Transaction Type + "Show ended schedule"; search by name. Columns:
 * Name · Transaction Type · Repeat Every · Next Date · Ends. Row actions Edit /
 * Delete. "Create New" (title bar) opens the transaction-type picker.
 */
import { type Ref } from 'vue'
import {
  MpButton, MpButtonGroup, MpCheckbox, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import RecurringScheduleEditModal from '~/components/patterns/RecurringScheduleEditModal.vue'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  recurringSchedules, deleteRecurringSchedule, OTHER_LIST_TRANSACTION_TYPES,
  type RecurringSchedule,
} from '~/data/otherLists'

const { t } = useLocale()
const router = useRouter()

const PERIOD_LABEL: Record<string, string> = { day: 'Days', week: 'Weeks', month: 'Months', year: 'Years' }
type Row = RecurringSchedule & { repeatLabel: string; endsLabel: string; endedNote: string }

function endsLabel(r: RecurringSchedule) {
  if (r.endType === 'after') return `${t('After')} ${r.occurrences} ${t('Occurances')}`
  if (r.endType === 'on') return `${t('On')} ${formatDate(r.endDate)}`
  return t('Never')
}
function endedNote(r: RecurringSchedule) {
  if (r.endedReason === 'fully-paid') return `${t('Fully Paid')} (${t('Ended')})`
  if (r.endedReason === 'qty-insufficient') return `(${t('Quantity of product is insufficient')})`
  if (r.endedReason === 'ended') return `(${t('Ended')})`
  return ''
}

const typeFilter = ref('')
const showEnded = ref(false)
const typeOptions = OTHER_LIST_TRANSACTION_TYPES.map((v) => ({ value: v, label: t(v) }))

const rows = computed<Row[]>(() => recurringSchedules
  .filter((r) => (showEnded.value || !r.endedReason) && (!typeFilter.value || r.transactionType === typeFilter.value))
  .map((r) => ({ ...r, repeatLabel: `${r.repeatEvery} ${t(PERIOD_LABEL[r.period]!)}`, endsLabel: endsLabel(r), endedNote: endedNote(r) })))

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
  defaultSort: { key: 'nextDate', dir: 'asc' },
})

const columns: TableColumn[] = [
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'transactionType', label: t('Transaction Type') },
  { key: 'repeatLabel', label: t('Repeat Every') },
  { key: 'nextDate', label: t('Next Date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'endsLabel', label: t('Ends'), kind: 'address' },
]

const hasActiveFilter = computed(() => !!search.value || !!typeFilter.value || showEnded.value)
function clearFilters() { search.value = ''; typeFilter.value = ''; showEnded.value = false }

function openDetail(r: Row) { router.push(`/recurring-transactions/${r.id}`) }

// ── Edit ──
const editOpen = ref(false)
const editing = ref<RecurringSchedule | null>(null)
function openEdit(r: Row) { editing.value = recurringSchedules.find((s) => s.id === r.id) ?? null; editOpen.value = true }

// ── Delete ──
const deleteOpen = ref(false)
const toDelete = ref<Row | null>(null)
function askDelete(r: Row) { toDelete.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (!toDelete.value) return
  deleteRecurringSchedule(toDelete.value.id)
  successToast(t('Recurring schedule deleted'))
  toDelete.value = null
}

// ── Create New (title bar) → transaction-type picker ──
const createOpen = ref(false)
const createType = ref<string>(OTHER_LIST_TRANSACTION_TYPES[0])
const createSignal = inject<Ref<number>>('recurringCreateSignal', ref(0))
watch(createSignal, () => { createType.value = OTHER_LIST_TRANSACTION_TYPES[0]; createOpen.value = true })
function createNext() {
  createOpen.value = false
  infoToast(t('Not in this prototype'))
}
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
    :has-active-filter="hasActiveFilter"
    bulk-label="recurring schedule"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="rt-type" v-model="typeFilter" :placeholder="t('Transaction Type')" :options="typeOptions" width="200px" />
        <label class="rt-check">
          <MpCheckbox id="rt-show-ended" :is-checked="showEnded" @change="showEnded = !showEnded" />
          <span>{{ t('Show ended schedule') }}</span>
        </label>
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search')" :aria-label="t('Search')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <template #cell-name="{ row }">
      <span class="cell-link cell-text" @click.stop="openDetail(row as unknown as Row)">{{ (row as unknown as Row).name }}</span>
    </template>
    <template #cell-transactionType="{ value }">{{ t(value as string) }}</template>
    <template #cell-nextDate="{ value }">{{ value ? formatDate(value as string) : '-' }}</template>
    <template #cell-endsLabel="{ row }">
      <div class="rt-ends">
        <span>{{ (row as unknown as Row).endsLabel }}</span>
        <span v-if="(row as unknown as Row).endedNote" class="rt-ended">{{ (row as unknown as Row).endedNote }}</span>
      </div>
    </template>

    <template #actions="{ row }">
      <MpPopover :id="`rt-actions-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openDetail(row as unknown as Row)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openEdit(row as unknown as Row)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="askDelete(row as unknown as Row)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No recurring schedules') }}</p>
        <p class="empty-full-desc">{{ t('List of setting a schedule for recurring transactions') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <RecurringScheduleEditModal :is-open="editOpen" :schedule="editing" @close="editOpen = false" />

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete recurring schedule?')"
    :description="t('Are you sure want to delete this?')"
    :confirm-label="t('Delete recurring schedule')"
    @confirm="confirmDelete"
  />

  <MpModal id="recurring-schedule-setup" :is-open="createOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="createOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Set Up Recurring') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="rt-setup">
          <span class="rt-setup-label">{{ t('Transaction Type') }}</span>
          <ErpFilterSelect id="rt-create-type" :model-value="createType" :placeholder="t('Transaction Type')" :options="typeOptions" :is-clearable="false" width="100%" @update:model-value="createType = $event || createType" />
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="createOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="createNext">{{ t('Next') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.rt-check { display: flex; align-items: center; gap: 0; cursor: pointer; color: var(--mp-text-default); white-space: nowrap; }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; min-width: 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-text-subtle); }

.rt-ends { display: flex; flex-direction: column; }
.rt-ended { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.rt-setup { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rt-setup-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
