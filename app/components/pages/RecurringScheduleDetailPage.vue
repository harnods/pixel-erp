<!-- prod-parity: quickbook/app/views/recurring_schedules/show.html.haml (+ _table_show) -->
<script setup lang="ts">
/**
 * Recurring Schedule detail — Repeats every / Ending summary, then the list of
 * transactions the schedule generated (Date · Transaction Number · Contact
 * Person · Status · Total · Tags). Footer: Delete, Cancel, Edit. Full-page:
 * routed via detailMatch (/recurring-transactions/:id), owns its title bar.
 */
import { MpButton, MpButtonGroup } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import RecurringScheduleEditModal from '~/components/patterns/RecurringScheduleEditModal.vue'
import { formatDate } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import { getRecurringSchedule, deleteRecurringSchedule, type RecurringLine } from '~/data/otherLists'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const schedule = computed(() => getRecurringSchedule(props.orderId))
const PERIOD_LABEL: Record<string, string> = { day: 'Days', week: 'Weeks', month: 'Months', year: 'Years' }
const repeatLabel = computed(() => schedule.value ? `${schedule.value.repeatEvery} ${t(PERIOD_LABEL[schedule.value.period]!)}` : '')
const endingLabel = computed(() => {
  const s = schedule.value
  if (!s) return ''
  if (s.endType === 'after') return `${t('After')} ${s.occurrences} ${t('Occurances')}`
  if (s.endType === 'on') return `${t('On')} ${formatDate(s.endDate)}`
  return t('Never')
})

type Row = RecurringLine & { id: string }
const rows = computed<Row[]>(() => (schedule.value?.lines ?? []).map((l, i) => ({ ...l, id: `${props.orderId}-${i}` })))
const { currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<Row>(rows, {
  perPage: 25, defaultSort: { key: 'date', dir: 'desc' },
})
const columns: TableColumn[] = [
  { key: 'date', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'transactionNo', label: t('Transaction Number'), kind: 'name' },
  { key: 'contact', label: t('Contact Person'), kind: 'name' },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'total', label: t('Total'), kind: 'amount', align: 'right' },
  { key: 'tags', label: t('Tags'), kind: 'tags' },
]

function back() { router.push('/recurring-transactions') }
const editOpen = ref(false)
const deleteOpen = ref(false)
function confirmDelete() {
  if (!schedule.value) return
  deleteRecurringSchedule(schedule.value.id)
  successToast(t('Recurring schedule deleted'))
  back()
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-breadcrumb-row">
          <button class="detail-breadcrumb" @click="back">{{ t('Recurring transactions') }}</button>
        </div>
        <h1 class="detail-title">{{ schedule?.name ?? t('Recurring Schedule') }}</h1>
      </div>
    </header>

    <div class="detail-stage">
      <template v-if="schedule">
        <section class="rsd-summary">
          <ContentList :label="t('Transaction Type')" :value="t(schedule.transactionType)" />
          <ContentList :label="t('Repeats every')" :value="repeatLabel" />
          <ContentList :label="t('Ending')" :value="endingLabel" />
          <ContentList :label="t('Next Date')" :value="schedule.nextDate ? formatDate(schedule.nextDate) : '-'" />
        </section>

        <ErpTablePage
          :columns="columns"
          :rows="(paginated as unknown as Record<string, unknown>[])"
          :total="total"
          :current-page="currentPage"
          :per-page="perPage"
          :sort-key="sortKey"
          :sort-dir="sortDir"
          bulk-label="transaction"
          @page-change="setPage"
          @per-page-change="setPerPage"
          @sort-change="setSort"
        >
          <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
          <template #cell-transactionNo="{ row }">
            <span v-if="(row as unknown as Row).transactionNo" class="cell-link cell-text">{{ (row as unknown as Row).transactionNo }}</span>
            <span v-else class="rsd-deleted">{{ t('Transaction has been deleted') }}</span>
          </template>
          <template #cell-contact="{ row }">{{ (row as unknown as Row).transactionNo ? (row as unknown as Row).contact : '' }}</template>
          <template #cell-status="{ row }">{{ (row as unknown as Row).transactionNo ? t((row as unknown as Row).status) : '' }}</template>
          <template #cell-total="{ row }">{{ (row as unknown as Row).transactionNo ? formatIDR((row as unknown as Row).total) : '' }}</template>
          <template #cell-tags="{ value }">
            <div v-if="(value as string[])?.length" class="tags-cell">
              <span v-for="tag in (value as string[])" :key="tag" class="erp-tag">{{ tag }}</span>
            </div>
            <span v-else>-</span>
          </template>
          <template #empty>
            <div class="empty-full">
              <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">{{ t('No transactions yet') }}</p>
              <p class="empty-full-desc">{{ t('Transactions created by this schedule will appear here.') }}</p>
            </div>
          </template>
        </ErpTablePage>

        <div class="rsd-footer">
          <MpButton variant="secondary" is-rounded @click="deleteOpen = true">{{ t('Delete') }}</MpButton>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="back">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="editOpen = true">{{ t('Edit') }}</MpButton>
          </MpButtonGroup>
        </div>
      </template>
      <p v-else class="rsd-missing">{{ t('Recurring schedule not found') }}</p>
    </div>

    <RecurringScheduleEditModal :is-open="editOpen" :schedule="schedule ?? null" @close="editOpen = false" />
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete recurring schedule?')"
      :description="t('Are you sure want to delete this?')"
      :confirm-label="t('Delete recurring schedule')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
.rsd-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mp-spacing-6); }
.rsd-deleted { color: var(--mp-text-danger); }
.rsd-footer { display: flex; align-items: center; justify-content: space-between; }
.rsd-missing { margin: 0; color: var(--mp-text-secondary); }
.tags-cell { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.erp-tag { display: inline-flex; align-items: center; background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md); padding: 0 var(--mp-spacing-1\.5); max-height: var(--mp-sizes-5, 20px); border-radius: var(--mp-radii-sm); white-space: nowrap; }
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
