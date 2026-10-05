<!-- prod-parity: jurnal-frontend-app/src/pages/reports/sales_list/sales_list.vue (filter bar, export, states) · sales_by_customer/sales_by_customer.vue · sales_by_product/index.vue -->
<script setup lang="ts">
/**
 * Shared shell for the three Sales reports (Sales list / Sales by customer /
 * Sales by product). Prod gives all three the same frame: page header with the
 * currency, Start date · End date · Period · Filter|Show · Filter (drawer, red dot
 * when narrowed) on the left, Export ▾ (PDF · Excel · CSV) on the right, then the
 * report table with its blank / loading / not-found states and pagination.
 * The page owns the table (default slot); this owns the controls.
 * Layout/classes follow the house report page (GeneralLedgerReportPage).
 */
import { MpIcon, MpButton, MpDatePicker, MpFormControl, MpFormLabel, MpSpinner, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import SalesReportFiltersDrawer from '~/components/patterns/SalesReportFiltersDrawer.vue'
import { infoToast } from '~/utils/toasts'
import {
  PERIOD_OPTIONS, salesPeriodRange, periodForRange, isoToDmy, dmyToIso, moreFilterActive, type SalesReportFilters,
} from '~/data/salesReports'

const props = withDefaults(defineProps<{
  title: string
  kind: 'list' | 'customer' | 'product'
  modelValue: SalesReportFilters
  state: 'idle' | 'loading' | 'ready'
  hasRows: boolean
  /** prod: Sales list says "Filter", the v3 reports say "Show" */
  runLabel?: string
  loadingLabel?: string
  /** pagination — rows on the current page are the page's job */
  page?: number
  pageSize?: number
  totalItems?: number
  itemNoun?: string
}>(), { runLabel: 'Filter', loadingLabel: 'Loading transactions', page: 1, pageSize: 25, totalItems: 0, itemNoun: 'data' })

const emit = defineEmits<{
  (e: 'update:modelValue', v: SalesReportFilters): void
  (e: 'run'): void
  (e: 'update:page', v: number): void
}>()

const { t } = useLocale()
const router = useRouter()

// ── Filter bar (writes straight into the filters; Filter/Show runs the report) ──
const periodOptions = PERIOD_OPTIONS.map((p) => ({ value: p.id, label: p.label }))
function patch(p: Partial<SalesReportFilters>) { emit('update:modelValue', { ...props.modelValue, ...p }) }
function onPeriod(id: string) {
  const period = id || 'custom'
  const r = salesPeriodRange(period)
  patch(r ? { period, start: isoToDmy(r[0]), end: isoToDmy(r[1]) } : { period })
}
function onStart(v: string) {
  const end = dmyToIso(v) > dmyToIso(props.modelValue.end) ? v : props.modelValue.end
  patch({ start: v, end, period: periodForRange(dmyToIso(v), dmyToIso(end)) })
}
function onEnd(v: string) {
  const start = dmyToIso(v) < dmyToIso(props.modelValue.start) ? v : props.modelValue.start
  patch({ start, end: v, period: periodForRange(dmyToIso(start), dmyToIso(v)) })
}

const formError = ref('')
function run() {
  if (!dmyToIso(props.modelValue.start) || !dmyToIso(props.modelValue.end)) { formError.value = t('You must fill in date range'); return }
  formError.value = ''
  emit('run')
}

const drawerOpen = ref(false)
const narrowed = computed(() => moreFilterActive(props.modelValue))
function onApplyDrawer(v: SalesReportFilters) { emit('update:modelValue', v); nextTick(() => emit('run')) }

// ── Export / example (need a backend) ─────────────────────────────────────────
const exportTypes = ['PDF', 'Excel', 'CSV']
function notInPrototype() { infoToast(t('Not in this prototype')) }

// ── Captions + pagination ────────────────────────────────────────────────────
const rangeCaption = computed(() => `${props.modelValue.start} - ${props.modelValue.end}`)
const totalPages = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)))
const from = computed(() => (props.totalItems ? (props.page - 1) * props.pageSize + 1 : 0))
const to = computed(() => Math.min(props.totalItems, props.page * props.pageSize))
</script>

<template>
  <div class="srs">
    <header class="srs-titlebar">
      <div class="srs-titlebar-left">
        <MpButton variant="textLink" is-rounded class="srs-breadcrumb" @click="router.push('/sales-report')">{{ t('Sales') }}</MpButton>
        <h1 class="srs-title">{{ t(title) }} <span class="srs-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="srs-stage">
      <!-- ── Filter bar ── -->
      <div class="srs-controls">
        <div class="srs-controls-left">
          <MpFormControl id="srs-start-fc" class="srs-date">
            <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
            <MpDatePicker id="srs-start" :model-value="modelValue.start" format="DD/MM/YYYY" value-type="format" use-portal is-full-width :is-clearable="false" @update:model-value="(v: string) => onStart(v)" />
          </MpFormControl>
          <MpFormControl id="srs-end-fc" class="srs-date">
            <MpFormLabel>{{ t('End date') }}</MpFormLabel>
            <MpDatePicker id="srs-end" :model-value="modelValue.end" format="DD/MM/YYYY" value-type="format" use-portal is-full-width :is-clearable="false" @update:model-value="(v: string) => onEnd(v)" />
          </MpFormControl>
          <MpFormControl id="srs-period-fc" class="srs-date">
            <MpFormLabel>{{ t('Period') }}</MpFormLabel>
            <ErpFilterSelect id="srs-period" :model-value="modelValue.period" :placeholder="t('Period')" :options="periodOptions" width="172px" :is-clearable="false" @update:model-value="onPeriod" />
          </MpFormControl>
          <MpButton is-rounded @click="run">{{ t(runLabel) }}</MpButton>
          <MpButton variant="secondary" is-rounded class="srs-more" @click="drawerOpen = true">
            <span class="srs-more-icon"><MpIcon name="filter" size="sm" /><span v-if="narrowed" class="srs-dot" /></span>
            {{ kind === 'list' ? t('More filter') : t('Filter') }}
          </MpButton>
        </div>

        <div class="srs-controls-right">
          <slot name="actions" />
          <MpPopover id="srs-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="secondary" is-rounded right-icon="caret-down">{{ t('Export') }}</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '120px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="x in exportTypes" :key="x" @click="notInPrototype">{{ x }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <p v-if="formError" class="srs-form-error">{{ formError }}</p>

      <div v-if="kind !== 'list'" class="srs-example">
        <a class="srs-link" @click="notInPrototype"><MpIcon name="pdf-document" size="sm" /> {{ t('View example') }}</a>
      </div>

      <!-- ── Report ── -->
      <div class="srs-report">
        <div v-if="state === 'idle'" class="srs-empty srs-empty--idle">
          <img src="/illustrations/report-empty.png" alt="" class="srs-empty-img" width="240" height="200" />
          <p class="srs-empty-title">{{ t('Report will appear here') }}</p>
          <p class="srs-empty-desc">{{ t('Select dates or period, then click') }} <strong>{{ t(runLabel) }}</strong> {{ t('button.') }}</p>
        </div>

        <div v-else-if="state === 'loading'" class="srs-loading">
          <MpSpinner />
          <p class="srs-empty-title">{{ t(loadingLabel) }}</p>
          <p v-if="kind === 'list'" class="srs-empty-desc">{{ t('This process takes time. You can directly download the report by clicking the Export button') }}</p>
        </div>

        <div v-else-if="!hasRows" class="srs-empty">
          <img src="/illustrations/empty-folder.png" alt="" class="srs-empty-img" width="240" height="200" />
          <p class="srs-empty-title">{{ t('There was no report data on this date/period') }}</p>
          <p class="srs-empty-desc">{{ t('Recheck the filter or select another date/period.') }}</p>
        </div>

        <template v-else>
          <div class="srs-report-head">
            <span class="srs-caption">{{ rangeCaption }}</span>
            <slot name="head-right" />
          </div>
          <div class="srs-table-wrap">
            <slot />
          </div>
          <div class="srs-pagination">
            <span class="srs-caption">{{ t('Showing') }} {{ from }}-{{ to }} {{ t('of') }} {{ totalItems }} {{ t(itemNoun) }}</span>
            <div v-if="totalPages > 1" class="srs-pager">
              <span class="srs-caption">{{ t('Page') }} {{ page }} {{ t('of') }} {{ totalPages }}</span>
              <MpButton variant="ghost" is-rounded :aria-label="t('Prev page')" @click="page > 1 && emit('update:page', page - 1)"><MpIcon name="chevrons-left" size="sm" /></MpButton>
              <MpButton variant="ghost" is-rounded :aria-label="t('Next page')" @click="page < totalPages && emit('update:page', page + 1)"><MpIcon name="chevrons-right" size="sm" /></MpButton>
            </div>
          </div>
        </template>
      </div>
    </div>

    <SalesReportFiltersDrawer v-model:is-open="drawerOpen" :kind="kind" :model-value="modelValue" @apply="onApplyDrawer" />
  </div>
</template>

<style scoped>
.srs { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.srs-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.srs-titlebar-left { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
.srs-breadcrumb { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); }
.srs-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.srs-title-cur { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.srs-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-top-left-radius: var(--mp-radii-lg); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }

.srs-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.srs-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.srs-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; }
.srs-date { width: 172px; }
.srs-more-icon { position: relative; display: inline-flex; margin-right: var(--mp-spacing-1); }
.srs-dot { position: absolute; top: calc(var(--mp-spacing-1) * -1); right: calc(var(--mp-spacing-1) * -1); width: var(--mp-spacing-2); height: var(--mp-spacing-2); border-radius: var(--mp-radii-full); background: var(--mp-colors-background-danger, var(--mp-text-danger)); border: 1px solid var(--mp-background-stage); }
.srs-form-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.srs-example { display: flex; justify-content: flex-end; }
.srs-link { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; font-size: var(--mp-font-sizes-md); }
.srs-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.srs-report { display: flex; flex-direction: column; min-width: 0; }
.srs-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.srs-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.srs-table-wrap { overflow-x: auto; }
.srs-pagination { display: flex; align-items: center; justify-content: space-between; padding-top: var(--mp-spacing-4); }
.srs-pager { display: flex; align-items: center; gap: var(--mp-spacing-1); }

.srs-empty, .srs-loading { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10) 0; text-align: center; }
.srs-empty--idle { padding: 72px 0 64px; }
.srs-loading { padding: 120px 0; gap: var(--mp-spacing-1); }
.srs-empty-img { width: 240px; height: 200px; object-fit: contain; }
.srs-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.srs-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
