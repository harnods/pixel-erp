<!-- prod-parity: jurnal-frontend-app/src/pages/reports/sales_list/components/more-filter.vue · sales_by_customer/components/filter.vue · sales_by_product/components/filter-drawer.vue -->
<script setup lang="ts">
/**
 * Sales reports — filter drawer, one shell for the three Sales reports
 * (prod has one drawer per report; the fields differ by `kind`):
 *   list     → "Filter report": dates, period, transaction type, date by,
 *              customer (Individual / Group), status, group with tag
 *   customer → "Report filter": dates, period, transaction type, tag, customer,
 *              product category, sort by
 *   product  → "Report filter": dates, period, transaction type, tag, customer,
 *              product category, product, View detailed version, sort by
 * Edits a local draft; commits only on the primary button. Same overlay shell as
 * the other report drawers (GeneralLedgerFiltersDrawer).
 */
import { MpIcon, MpButton, MpCheckbox, MpRadio, MpFormControl, MpFormLabel, MpInputTag, MpDatePicker, type DataInterface } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  PERIOD_OPTIONS, LIST_TRANSACTION_TYPES, REPORT_TRANSACTION_TYPES, LIST_STATUSES,
  CUSTOMER_SORT_OPTIONS, PRODUCT_SORT_OPTIONS, PRODUCT_DETAIL_SORT_OPTIONS,
  salesPeriodRange, periodForRange, isoToDmy, dmyToIso, defaultSalesReportFilters, type SalesReportFilters,
} from '~/data/salesReports'
import { customers } from '~/data/customers'
import { contactGroups } from '~/data/contactGroups'
import { tags } from '~/data/tags'
import { CATALOG } from '~/data/catalog'

const props = defineProps<{
  isOpen: boolean
  kind: 'list' | 'customer' | 'product'
  modelValue: SalesReportFilters
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: SalesReportFilters): void
}>()

const { t } = useLocale()

const clone = (f: SalesReportFilters): SalesReportFilters => JSON.parse(JSON.stringify(f))
const draft = ref<SalesReportFilters>(clone(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) draft.value = clone(props.modelValue) })

const title = computed(() => (props.kind === 'list' ? 'Filter report' : 'Report filter'))
const typeOptions = computed(() => (props.kind === 'list' ? LIST_TRANSACTION_TYPES : REPORT_TRANSACTION_TYPES))
const periodOptions = PERIOD_OPTIONS.map((p) => ({ value: p.id, label: p.label }))
const sortOptions = computed(() =>
  props.kind === 'customer' ? CUSTOMER_SORT_OPTIONS : draft.value.showDetail ? PRODUCT_DETAIL_SORT_OPTIONS : PRODUCT_SORT_OPTIONS)

const customerNames = customers.map((c) => c.name)
const groupNames = computed(() => contactGroups.filter((g) => g.type === 'customer').map((g) => g.name))
const tagNames = computed(() => tags.filter((x) => !x.archived).map((x) => x.name))
const categoryNames = [...new Set(CATALOG.map((c) => c.category))]
const productNames = CATALOG.map((c) => c.name)

// MpInputTag speaks DataInterface; the draft keeps plain names.
function toData(arr: string[]): DataInterface[] { return arr.map((s) => ({ id: s, text: s, value: s, isInvalid: false, isReadOnly: false })) }
function fromData(d: DataInterface[]): string[] { return d.map((x) => String(x.value ?? x.text)) }
type ListKey = 'customers' | 'groups' | 'statuses' | 'tags' | 'categories' | 'products'
function setList(k: ListKey, d: DataInterface[]) { draft.value[k] = fromData(d) }

// Period ↔ dates stay in sync, as in prod (change_period / set_period_by_date).
function onPeriod(id: string) {
  draft.value.period = id || 'custom'
  const r = salesPeriodRange(draft.value.period)
  if (r) { draft.value.start = isoToDmy(r[0]); draft.value.end = isoToDmy(r[1]) }
}
function onStart(v: string) {
  draft.value.start = v
  if (dmyToIso(v) > dmyToIso(draft.value.end)) draft.value.end = v
  draft.value.period = periodForRange(dmyToIso(draft.value.start), dmyToIso(draft.value.end))
}
function onEnd(v: string) {
  draft.value.end = v
  if (dmyToIso(v) < dmyToIso(draft.value.start)) draft.value.start = v
  draft.value.period = periodForRange(dmyToIso(draft.value.start), dmyToIso(draft.value.end))
}
function onShowDetail() {
  draft.value.showDetail = !draft.value.showDetail
  if (!sortOptions.value.some((o) => o.value === draft.value.sortBy)) draft.value.sortBy = 'product_name'
}

const dateError = ref('')
function close() { dateError.value = ''; emit('update:isOpen', false) }
function apply() {
  if (!dmyToIso(draft.value.start) || !dmyToIso(draft.value.end)) { dateError.value = t('You must fill in date range'); return }
  dateError.value = ''
  emit('apply', clone(draft.value))
  close()
}
function reset() {
  const d = defaultSalesReportFilters(props.kind)
  draft.value = { ...d, start: draft.value.start, end: draft.value.end, period: draft.value.period }
}
</script>

<template>
  <Transition name="srf">
    <div v-if="isOpen" class="srf-overlay" @click.self="close">
      <div class="srf-panel" role="dialog" :aria-label="t(title)">
        <header class="srf-head">
          <span class="srf-title">{{ t(title) }}</span>
          <MpButton class="srf-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="close"><MpIcon name="close" size="sm" /></MpButton>
        </header>

        <div class="srf-body">
          <div class="srf-row">
            <MpFormControl id="srf-start-fc" class="srf-grow">
              <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
              <MpDatePicker id="srf-start" :model-value="draft.start" format="DD/MM/YYYY" value-type="format" use-portal is-full-width :is-clearable="false" @update:model-value="(v: string) => onStart(v)" />
            </MpFormControl>
            <span class="srf-dash">-</span>
            <MpFormControl id="srf-end-fc" class="srf-grow">
              <MpFormLabel>{{ t('End date') }}</MpFormLabel>
              <MpDatePicker id="srf-end" :model-value="draft.end" format="DD/MM/YYYY" value-type="format" use-portal is-full-width :is-clearable="false" @update:model-value="(v: string) => onEnd(v)" />
            </MpFormControl>
          </div>
          <p v-if="dateError" class="srf-error">{{ dateError }}</p>

          <MpFormControl id="srf-period-fc">
            <MpFormLabel>{{ t('Period') }}</MpFormLabel>
            <ErpFilterSelect id="srf-period" :model-value="draft.period" :placeholder="t('Period')" :options="periodOptions" width="100%" :is-clearable="false" @update:model-value="onPeriod" />
          </MpFormControl>

          <MpFormControl id="srf-type-fc">
            <MpFormLabel>{{ t('Transaction type') }}</MpFormLabel>
            <ErpFilterSelect id="srf-type" v-model="draft.transactionType" :placeholder="t('Transaction type')" :options="typeOptions" width="100%" :is-clearable="false" />
          </MpFormControl>

          <!-- ── Sales list ── -->
          <template v-if="kind === 'list'">
            <MpFormControl id="srf-dateby-fc">
              <MpFormLabel>{{ t('Date by') }}</MpFormLabel>
              <ErpFilterSelect
                id="srf-dateby" :model-value="draft.dateBy" :placeholder="t('Date by')" width="100%" :is-clearable="false"
                :options="[{ value: 'transaction_date', label: t('Transaction date') }, { value: 'due_date', label: t('Due date') }]"
                @update:model-value="(v: string) => (draft.dateBy = (v || 'transaction_date') as SalesReportFilters['dateBy'])"
              />
            </MpFormControl>

            <MpFormControl id="srf-customer-fc">
              <div class="srf-label-row">
                <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
                <div class="srf-radios">
                  <MpRadio id="srf-ctype-individual" name="srf-ctype" :is-checked="draft.customerType === 'individual'" @change="draft.customerType = 'individual'">Individual</MpRadio>
                  <MpRadio id="srf-ctype-group" name="srf-ctype" :is-checked="draft.customerType === 'group'" @change="draft.customerType = 'group'">Group</MpRadio>
                </div>
              </div>
              <MpInputTag v-if="draft.customerType === 'individual'" id="srf-customers" :data="toData(draft.customers)" :suggestions="customerNames" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down :placeholder="t('Select all')" @change="(d: DataInterface[]) => setList('customers', d)" />
              <MpInputTag v-else id="srf-groups" :data="toData(draft.groups)" :suggestions="groupNames" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down :placeholder="t('Select all')" @change="(d: DataInterface[]) => setList('groups', d)" />
            </MpFormControl>

            <MpFormControl id="srf-status-fc">
              <MpFormLabel>Status</MpFormLabel>
              <MpInputTag id="srf-status" :data="toData(draft.statuses)" :suggestions="LIST_STATUSES" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down :placeholder="t('Select all')" @change="(d: DataInterface[]) => setList('statuses', d)" />
            </MpFormControl>

            <MpFormControl id="srf-tags-fc">
              <MpFormLabel>{{ t('Group with tag') }}</MpFormLabel>
              <MpInputTag id="srf-tags" :data="toData(draft.tags)" :suggestions="tagNames" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down @change="(d: DataInterface[]) => setList('tags', d)" />
              <div class="srf-radios srf-radios--below">
                <MpRadio id="srf-taglogic-and" name="srf-taglogic" :is-checked="draft.tagLogic === 'and'" @change="draft.tagLogic = 'and'">{{ t('Include all') }}</MpRadio>
                <MpRadio id="srf-taglogic-or" name="srf-taglogic" :is-checked="draft.tagLogic === 'or'" @change="draft.tagLogic = 'or'">{{ t('Either') }}</MpRadio>
              </div>
            </MpFormControl>
          </template>

          <!-- ── Sales by customer / by product ── -->
          <template v-else>
            <MpFormControl id="srf-tags-fc">
              <MpFormLabel>Tag</MpFormLabel>
              <MpInputTag id="srf-tags" :data="toData(draft.tags)" :suggestions="tagNames" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down :placeholder="t('Choose tag')" @change="(d: DataInterface[]) => setList('tags', d)" />
              <div class="srf-radios srf-radios--below">
                <MpRadio id="srf-taglogic-and" name="srf-taglogic" :is-checked="draft.tagLogic === 'and'" @change="draft.tagLogic = 'and'">{{ t('Include all') }}</MpRadio>
                <MpRadio id="srf-taglogic-or" name="srf-taglogic" :is-checked="draft.tagLogic === 'or'" @change="draft.tagLogic = 'or'">{{ t('Either') }}</MpRadio>
              </div>
              <p class="srf-hint">{{ t('Example: Selecting two tags, A and B.') }} {{ t('Include all will show data of tag A and B.') }} {{ t('Either will show data of tag A, B, or both.') }}</p>
            </MpFormControl>

            <MpFormControl id="srf-customer-fc">
              <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
              <MpInputTag id="srf-customers" :data="toData(draft.customers)" :suggestions="customerNames" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down :placeholder="t('Choose customer')" @change="(d: DataInterface[]) => setList('customers', d)" />
            </MpFormControl>

            <MpFormControl id="srf-category-fc">
              <MpFormLabel>{{ t('Product category') }}</MpFormLabel>
              <MpInputTag id="srf-categories" :data="toData(draft.categories)" :suggestions="categoryNames" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down :placeholder="t('Choose product category')" @change="(d: DataInterface[]) => setList('categories', d)" />
              <div class="srf-radios srf-radios--below">
                <MpRadio id="srf-catlogic-and" name="srf-catlogic" :is-checked="draft.categoryLogic === 'and'" @change="draft.categoryLogic = 'and'">{{ t('Include all') }}</MpRadio>
                <MpRadio id="srf-catlogic-or" name="srf-catlogic" :is-checked="draft.categoryLogic === 'or'" @change="draft.categoryLogic = 'or'">{{ t('Either') }}</MpRadio>
              </div>
            </MpFormControl>

            <template v-if="kind === 'product'">
              <MpFormControl id="srf-product-fc">
                <MpFormLabel>{{ t('Product') }}</MpFormLabel>
                <MpInputTag id="srf-products" :data="toData(draft.products)" :suggestions="productNames" is-show-suggestions :is-enable-create-new-tag="false" is-show-icon-chevron-down :placeholder="t('Choose product')" @change="(d: DataInterface[]) => setList('products', d)" />
              </MpFormControl>

              <MpCheckbox id="srf-show-detail" :is-checked="draft.showDetail" @change="onShowDetail">
                <span class="srf-check-text">
                  <span>{{ t('View detailed version') }}</span>
                  <span class="srf-check-sub">{{ t('This will show transaction number and discount info with product type grouping.') }}</span>
                </span>
              </MpCheckbox>
            </template>

            <MpFormControl id="srf-sort-fc">
              <MpFormLabel>{{ t('Sort by') }}</MpFormLabel>
              <ErpFilterSelect id="srf-sort" :model-value="draft.sortBy" :placeholder="t('Sort by')" :options="sortOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => (draft.sortBy = v || draft.sortBy)" />
              <div class="srf-radios srf-radios--below">
                <MpRadio id="srf-sort-asc" name="srf-sort" :is-checked="draft.sortLogic === 'asc'" @change="draft.sortLogic = 'asc'">{{ t('Ascending') }}</MpRadio>
                <MpRadio id="srf-sort-desc" name="srf-sort" :is-checked="draft.sortLogic === 'desc'" @change="draft.sortLogic = 'desc'">{{ t('Descending') }}</MpRadio>
              </div>
            </MpFormControl>
          </template>
        </div>

        <footer class="srf-foot">
          <MpButton variant="ghost" is-rounded @click="reset">{{ t('Reset filter') }}</MpButton>
          <div class="srf-foot-actions">
            <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton is-rounded @click="apply">{{ kind === 'list' ? 'Filter' : t('Apply') }}</MpButton>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.srf-enter-active, .srf-leave-active { transition: background-color 250ms ease; }
.srf-enter-from, .srf-leave-to { background-color: transparent; }
.srf-enter-active .srf-panel { transition: transform 350ms ease-out; }
.srf-leave-active .srf-panel { transition: transform 250ms ease-in; }
.srf-enter-from .srf-panel, .srf-leave-to .srf-panel { transform: translateX(calc(100% + 12px)); }

.srf-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.srf-panel { margin: var(--mp-spacing-3); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: 24px; overflow: hidden; }
.srf-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.srf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.srf-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default); }
.srf-close:hover { background: var(--mp-background-neutral-hovered); }

.srf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5); padding: var(--mp-spacing-4); }
.srf-row { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); }
.srf-grow { flex: 1; min-width: 0; }
.srf-dash { padding-bottom: var(--mp-spacing-2); color: var(--mp-text-default); }
.srf-error { margin: calc(var(--mp-spacing-4) * -1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.srf-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-1); }
.srf-radios { display: flex; align-items: center; gap: var(--mp-spacing-6); }
.srf-radios--below { margin-top: var(--mp-spacing-3); }
.srf-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.srf-body :deep(.efs) { display: flex; width: 100%; }
.srf-check-text { display: flex; flex-direction: column; }
.srf-check-sub { color: var(--mp-text-secondary); }

.srf-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.srf-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
