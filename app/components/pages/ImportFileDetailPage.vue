<!-- prod-parity: jurnal-frontend-app/src/pages/other-lists/import-group/show/show.vue -->
<script setup lang="ts">
/**
 * Import file detail — summary boxes (Number of import rows · Failed to import ·
 * Successful data import) and the list of rows the import created. Header badge
 * carries the import status. Full-page: /export-and-import/:id via detailMatch.
 */
import {
  MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatDate, formatDateTimeLong } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { getImportFile, type ImportLine, type ProductImportLine } from '~/data/otherLists'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const file = computed(() => getImportFile(props.orderId))

type BadgeType = 'completed' | 'warning' | 'critical' | 'announcement'
const STATUS: Record<string, { label: string; type: BadgeType }> = {
  ok: { label: 'Completed', type: 'completed' },
  pending_delete: { label: 'Pending deletion', type: 'warning' },
  queue: { label: 'In queue', type: 'warning' },
  processing: { label: 'In progress', type: 'warning' },
  partial_ok: { label: 'Partially imported', type: 'warning' },
  failed: { label: 'Failed to import', type: 'critical' },
  failed_to_delete: { label: 'Failed to delete', type: 'critical' },
}
const status = computed(() => STATUS[file.value?.status ?? 'ok']!)
const failedRows = computed(() => file.value ? Math.max(file.value.totalRows - file.value.passedRows, 0) : 0)
function rowsLabel(n: number) { return `${n} ${t(n === 1 ? 'row' : 'rows')}` }
const isFailed = computed(() => failedRows.value > 0)
const isProduct = computed(() => file.value?.kind === 'product')
const isSales = computed(() => ['Sales invoice', 'Sales order', 'Sales quote'].includes(file.value?.feature ?? ''))

type Row = (ImportLine | ProductImportLine) & { id: string }
const rows = computed<Row[]>(() => {
  const f = file.value
  if (!f) return []
  const src = (f.kind === 'product' ? f.productLines : f.lines) as (ImportLine | ProductImportLine)[]
  return src.map((l, i) => ({ ...l, id: `${f.id}-${i}` }))
})
const { currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<Row>(rows, { perPage: 25 })

const columns = computed<TableColumn[]>(() => isProduct.value
  ? [
      { key: 'code', label: t('Product code'), kind: 'number' },
      { key: 'name', label: t('Name'), kind: 'name' },
      { key: 'buyPrice', label: t('Buy price'), kind: 'amount', align: 'right' },
      { key: 'sellPrice', label: t('Sell price'), kind: 'amount', align: 'right' },
      { key: 'trackInventory', label: t('Track inventory'), align: 'center' },
      { key: 'category', label: t('Product category') },
    ]
  : [
      { key: 'importStatus', label: t('Import status'), kind: 'status' },
      { key: 'number', label: t('Number'), kind: 'number' },
      { key: 'date', label: t('Transaction date'), kind: 'date' },
      { key: 'contact', label: isSales.value ? t('Customer') : t('Vendor'), kind: 'name' },
      { key: 'dueDate', label: t('Due date'), kind: 'date' },
      { key: 'status', label: t('Transaction status'), kind: 'status' },
      { key: 'balanceDue', label: t('Balance due'), kind: 'amount', align: 'right' },
      { key: 'total', label: t('Total'), kind: 'amount', align: 'right' },
      { key: 'tags', label: t('Tags'), kind: 'tags' },
    ])

function back() { router.push('/export-and-import?tab=Import') }
function notInPrototype() { infoToast(t('Not in this prototype')) }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-breadcrumb-row">
          <button class="detail-breadcrumb" @click="back">{{ t('Export & import') }}</button>
        </div>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ file?.fileName ?? t('Import group') }}</h1>
          <ErpStatusBadge v-if="file" :status="file.status" :label="t(status.label)" :type="status.type" badge-for="additionalInformation" size="md" />
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <template v-if="file">
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Number of import rows') }}</div>
            <div class="stat-amount">{{ rowsLabel(file.totalRows) }}</div>
            <a class="stat-link" @click="notInPrototype">{{ t('Download file') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Failed to import') }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': isFailed }">{{ rowsLabel(failedRows) }}</div>
            <MpPopover v-if="isFailed" id="iid-failed-action" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
              <MpPopoverTrigger>
                <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent class="erp-dropdown-menu">
                <MpPopoverList>
                  <MpPopoverListItem @click="notInPrototype">{{ t('Download incorrect data') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="notInPrototype">{{ t('Reimport') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Successful data import') }}</div>
            <div class="stat-amount">{{ rowsLabel(file.passedRows) }}</div>
          </div>
        </div>

        <section class="iid-list">
          <div class="iid-list-head">
            <span class="iid-list-title">{{ t('List of successful') }} {{ t(file.feature).toLowerCase() }} {{ t('import') }}</span>
            <span class="iid-list-meta">{{ t('Import date') }}: {{ formatDateTimeLong(file.createdAt) }} (GMT+7)</span>
          </div>
          <ErpTablePage
            :columns="columns"
            :rows="(paginated as unknown as Record<string, unknown>[])"
            :total="total"
            :current-page="currentPage"
            :per-page="perPage"
            :sort-key="sortKey"
            :sort-dir="sortDir"
            bulk-label="row"
            @page-change="setPage"
            @per-page-change="setPerPage"
            @sort-change="setSort"
          >
            <template #cell-importStatus="{ value }">
              <ErpStatusBadge :status="String(value).toLowerCase()" :label="t(value as string)" />
            </template>
            <template #cell-number="{ value }"><span class="cell-link cell-text">{{ value }}</span></template>
            <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
            <template #cell-dueDate="{ value }">{{ formatDate(value as string) }}</template>
            <template #cell-status="{ value }"><ErpStatusBadge :status="String(value).toLowerCase()" :label="t(value as string)" /></template>
            <template #cell-balanceDue="{ value }">{{ formatIDR(value as number) }}</template>
            <template #cell-total="{ value }">{{ formatIDR(value as number) }}</template>
            <template #cell-buyPrice="{ value }">{{ formatIDR(value as number) }}</template>
            <template #cell-sellPrice="{ value }">{{ formatIDR(value as number) }}</template>
            <template #cell-name="{ value }"><span class="cell-link cell-text">{{ value }}</span></template>
            <template #cell-trackInventory="{ value }">
              <span class="iid-track" :class="value ? 'iid-track--yes' : 'iid-track--no'" :aria-label="value ? t('Yes') : t('No')">
                <MpIcon :name="value ? 'done' : 'error'" size="sm" />
              </span>
            </template>
            <template #cell-tags="{ value }">
              <div v-if="(value as string[])?.length" class="tags-cell">
                <span v-for="tag in (value as string[])" :key="tag" class="erp-tag">{{ tag }}</span>
              </div>
              <span v-else>-</span>
            </template>
            <template #empty>
              <div class="empty-full">
                <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
                <template v-if="file.status === 'failed'">
                  <p class="empty-full-title">{{ t('Failed to import file') }}</p>
                  <p class="empty-full-desc">{{ t('The imported data does not match the template. Please fix and fill in the template according to the error reason given.') }}</p>
                </template>
                <template v-else>
                  <p class="empty-full-title">{{ t('No data yet') }}</p>
                  <p class="empty-full-desc">{{ t('The imported data will appear here.') }}</p>
                </template>
              </div>
            </template>
          </ErpTablePage>
        </section>
      </template>
      <p v-else class="iid-missing">{{ t('File not found') }}</p>
    </div>
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
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
/* Stats band — copied from BillsIndexPage */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-card:last-child { border-right: none; }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }
.stat-card :deep(.mp-button) { align-self: flex-start; }
.erp-tag { display: inline-flex; align-items: center; background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md); padding: 0 var(--mp-spacing-1\.5); max-height: var(--mp-sizes-5, 20px); border-radius: var(--mp-radii-sm); white-space: nowrap; }
.iid-list { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.iid-list-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.iid-list-title { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.iid-list-meta { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.iid-track { display: inline-flex; }
.iid-track--yes { color: var(--mp-colors-text-success); }
.iid-track--no { color: var(--mp-text-danger); }
.iid-missing { margin: 0; color: var(--mp-text-secondary); }
.tags-cell { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.empty-full { display: flex; flex-direction: column; align-items: center; text-align: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; max-width: 480px; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
