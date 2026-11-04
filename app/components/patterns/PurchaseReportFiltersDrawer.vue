<!-- prod-parity: jurnal-frontend-app/src/pages/reports/purchases_list/components/more-filter.vue, purchases_by_vendor/components/filter.vue, purchases_by_product/components/filter-drawer.vue -->
<script setup lang="ts">
/**
 * Filter drawer shared by the three Purchases reports. One shell, three field
 * sets copied from prod:
 *   • list    — "Filter report": date range, Transaction type, Date by, Vendor
 *               (Individual / Group), Status, Group with tag (Include all / Either)
 *   • vendor  — "Report filter": date range, Transaction type, Tag, Vendor,
 *               Product category, Sort by (Ascending / Descending)
 *   • product — "Report filter": date range, Transaction type, Tag, Vendor,
 *               Product category, Product, View detailed version, Sort by
 * Teleport-style overlay (MpDrawer has no structural CSS here). Edits a local
 * draft and commits only on Apply.
 */
import { MpButton, MpIcon, MpCheckbox, MpRadio, MpTooltip, MpFormControl, MpFormLabel, MpInputTag, type DataInterface } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  PUR_RPT_STATUSES, PUR_RPT_VENDOR_GROUPS, purRptVendorNames, purRptProductCategories, purRptProductNames, purRptTags,
  emptyPurRptFilters, type PurRptFilters, type PurRptStatus,
} from '~/data/purchaseReports'

export interface PurchaseReportDrawerValue {
  range: Date[]
  transactionType: string
  filters: PurRptFilters
  sortBy: string
  sortLogic: 'asc' | 'desc'
  showDetail: boolean
}

const props = defineProps<{
  isOpen: boolean
  variant: 'list' | 'vendor' | 'product'
  modelValue: PurchaseReportDrawerValue
  transactionTypes: string[]
  sortOptions?: { value: string; label: string }[]
  /** Sort options shown while "View detailed version" is ticked (product only). */
  detailSortOptions?: { value: string; label: string }[]
  /** Defaults restored by Reset filter. */
  defaults: PurchaseReportDrawerValue
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: PurchaseReportDrawerValue): void
}>()

const id = `prf-${props.variant}`
const title = props.variant === 'list' ? 'Filter report' : 'Report filter'

function toData(arr: string[]): DataInterface[] {
  return arr.map((s) => ({ id: s, text: s, value: s, isInvalid: false, isReadOnly: false }))
}
const fromData = (d: DataInterface[]) => d.map((x) => String(x.value ?? x.text))

const range = ref<Date[]>([...props.modelValue.range])
const transactionType = ref(props.modelValue.transactionType)
const f = reactive<PurRptFilters>(emptyPurRptFilters())
const vendorMode = ref<'individual' | 'group'>('individual')
const vendorData = ref<DataInterface[]>([])
const groupData = ref<DataInterface[]>([])
const statusData = ref<DataInterface[]>([])
const tagData = ref<DataInterface[]>([])
const categoryData = ref<DataInterface[]>([])
const productData = ref<DataInterface[]>([])
const sortBy = ref(props.modelValue.sortBy)
const sortLogic = ref<'asc' | 'desc'>(props.modelValue.sortLogic)
const showDetail = ref(props.modelValue.showDetail)

function load(v: PurchaseReportDrawerValue) {
  range.value = [...v.range]
  transactionType.value = v.transactionType
  Object.assign(f, { ...v.filters })
  vendorMode.value = v.filters.vendorGroups.length ? 'group' : 'individual'
  vendorData.value = toData(v.filters.vendors)
  groupData.value = toData(v.filters.vendorGroups)
  statusData.value = toData(v.filters.statuses.map((s) => PUR_RPT_STATUSES.find((x) => x.id === s)?.label ?? s))
  tagData.value = toData(v.filters.tags)
  categoryData.value = toData(v.filters.productCategories)
  productData.value = toData(v.filters.products)
  sortBy.value = v.sortBy
  sortLogic.value = v.sortLogic
  showDetail.value = v.showDetail
}
load(props.modelValue)
watch(() => props.isOpen, (open) => { if (open) load(props.modelValue) })

const activeSortOptions = computed(() => (props.variant === 'product' && showDetail.value ? props.detailSortOptions : props.sortOptions) ?? [])
watch(activeSortOptions, (opts) => { if (opts.length && !opts.some((o) => o.value === sortBy.value)) sortBy.value = opts[0]!.value })

const statusLabels = ['All', ...PUR_RPT_STATUSES.map((s) => s.label)]

function close() { emit('update:isOpen', false) }
function apply() {
  const statusIds = fromData(statusData.value)
    .filter((l) => l !== 'All')
    .map((l) => PUR_RPT_STATUSES.find((s) => s.label === l)?.id)
    .filter(Boolean) as PurRptStatus[]
  emit('apply', {
    range: [...range.value],
    transactionType: transactionType.value,
    filters: {
      ...f,
      vendors: props.variant === 'list' && vendorMode.value === 'group' ? [] : fromData(vendorData.value),
      vendorGroups: props.variant === 'list' && vendorMode.value === 'group' ? fromData(groupData.value) : [],
      statuses: props.variant === 'list' ? statusIds : [],
      tags: fromData(tagData.value),
      productCategories: props.variant === 'list' ? [] : fromData(categoryData.value),
      products: props.variant === 'product' ? fromData(productData.value) : [],
    },
    sortBy: sortBy.value,
    sortLogic: sortLogic.value,
    showDetail: showDetail.value,
  })
  close()
}
function resetFilter() { load(props.defaults) }

const tagTooltip = 'Example: Selecting two tags, A and B. Include all will show data of tag A and B. Either will show data of tag A, B, or both.'
const categoryTooltip = 'Example: Selecting two categories, A and B. Include all will show data of product category A and B. Either will show data of product category A, B, or both.'
</script>

<template>
  <Transition name="prf">
    <div v-if="isOpen" class="prf-overlay" @click.self="close">
      <div class="prf-panel" role="dialog" :aria-label="title">
        <header class="prf-head">
          <span class="prf-title">{{ title }}</span>
          <MpButton class="prf-close" is-rounded aria-label="Close" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="prf-body">
          <MpFormControl :id="`${id}-date-fc`">
            <MpFormLabel>Start date - End date</MpFormLabel>
            <AdvancedDateRangePicker :id="`${id}-date`" :model-value="range" is-full-width period-mode hide-label @update:model-value="(v: Date[]) => (range = v)" />
          </MpFormControl>

          <MpFormControl :id="`${id}-type-fc`">
            <MpFormLabel>Transaction type</MpFormLabel>
            <ErpFilterSelect :id="`${id}-type`" v-model="transactionType" placeholder="Transaction type" :options="transactionTypes" width="100%" :is-clearable="false" />
          </MpFormControl>

          <!-- Purchase List only: Date by -->
          <MpFormControl v-if="variant === 'list'" :id="`${id}-dateby-fc`">
            <MpFormLabel>Date by</MpFormLabel>
            <ErpFilterSelect
              :id="`${id}-dateby`"
              v-model="f.dateBy"
              placeholder="Date by"
              :options="[{ value: 'transaction_date', label: 'Transaction date' }, { value: 'due_date', label: 'Due date' }]"
              width="100%"
              :is-clearable="false"
            />
          </MpFormControl>

          <!-- Vendor -->
          <MpFormControl :id="`${id}-vendor-fc`">
            <MpFormLabel>Vendor</MpFormLabel>
            <div v-if="variant === 'list'" class="prf-radios">
              <label class="prf-radio"><MpRadio :id="`${id}-vm-ind`" :name="`${id}-vm`" value="individual" :is-checked="vendorMode === 'individual'" @change="vendorMode = 'individual'" /><span>Individual</span></label>
              <label class="prf-radio"><MpRadio :id="`${id}-vm-grp`" :name="`${id}-vm`" value="group" :is-checked="vendorMode === 'group'" @change="vendorMode = 'group'" /><span>Group</span></label>
            </div>
            <MpInputTag
              v-if="variant !== 'list' || vendorMode === 'individual'"
              :id="`${id}-vendor`"
              :data="vendorData"
              :suggestions="purRptVendorNames"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              :placeholder="variant === 'list' ? 'Select all' : variant === 'vendor' ? 'Select vendor' : 'Choose vendor'"
              @change="(d: DataInterface[]) => (vendorData = d)"
            />
            <MpInputTag
              v-else
              :id="`${id}-vgroup`"
              :data="groupData"
              :suggestions="PUR_RPT_VENDOR_GROUPS"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              placeholder="Select all"
              @change="(d: DataInterface[]) => (groupData = d)"
            />
          </MpFormControl>

          <!-- Purchase List only: Status -->
          <MpFormControl v-if="variant === 'list'" :id="`${id}-status-fc`">
            <MpFormLabel>Status</MpFormLabel>
            <MpInputTag
              :id="`${id}-status`"
              :data="statusData"
              :suggestions="statusLabels"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              placeholder="Select all"
              @change="(d: DataInterface[]) => (statusData = d)"
            />
          </MpFormControl>

          <!-- Tag -->
          <MpFormControl :id="`${id}-tag-fc`">
            <MpFormLabel>{{ variant === 'list' ? 'Group with tag' : 'Tag' }}</MpFormLabel>
            <MpInputTag
              :id="`${id}-tag`"
              :data="tagData"
              :suggestions="purRptTags"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              :placeholder="variant === 'product' ? 'Choose tag' : ''"
              @change="(d: DataInterface[]) => (tagData = d)"
            />
            <div class="prf-radios prf-radios--below">
              <label class="prf-radio"><MpRadio :id="`${id}-tl-and`" :name="`${id}-tl`" value="and" :is-checked="f.tagLogic === 'and'" @change="f.tagLogic = 'and'" /><span>Include all</span></label>
              <label class="prf-radio">
                <MpRadio :id="`${id}-tl-or`" :name="`${id}-tl`" value="or" :is-checked="f.tagLogic === 'or'" @change="f.tagLogic = 'or'" /><span>Either</span>
                <MpTooltip v-if="variant !== 'list'" :id="`${id}-tl-tip`" :label="tagTooltip" placement="bottom" use-portal><MpIcon name="info" size="sm" class="prf-info" /></MpTooltip>
              </label>
            </div>
          </MpFormControl>

          <!-- Product category (vendor + product) -->
          <MpFormControl v-if="variant !== 'list'" :id="`${id}-cat-fc`">
            <MpFormLabel>Product category</MpFormLabel>
            <MpInputTag
              :id="`${id}-cat`"
              :data="categoryData"
              :suggestions="purRptProductCategories"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              placeholder="Choose product category"
              @change="(d: DataInterface[]) => (categoryData = d)"
            />
            <div class="prf-radios prf-radios--below">
              <label class="prf-radio"><MpRadio :id="`${id}-cl-and`" :name="`${id}-cl`" value="and" :is-checked="f.productCategoryLogic === 'and'" @change="f.productCategoryLogic = 'and'" /><span>Include all</span></label>
              <label class="prf-radio">
                <MpRadio :id="`${id}-cl-or`" :name="`${id}-cl`" value="or" :is-checked="f.productCategoryLogic === 'or'" @change="f.productCategoryLogic = 'or'" /><span>Either</span>
                <MpTooltip :id="`${id}-cl-tip`" :label="categoryTooltip" placement="bottom" use-portal><MpIcon name="info" size="sm" class="prf-info" /></MpTooltip>
              </label>
            </div>
          </MpFormControl>

          <!-- Product (product only) -->
          <MpFormControl v-if="variant === 'product'" :id="`${id}-product-fc`">
            <MpFormLabel>Product</MpFormLabel>
            <MpInputTag
              :id="`${id}-product`"
              :data="productData"
              :suggestions="purRptProductNames"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              placeholder="Choose product"
              @change="(d: DataInterface[]) => (productData = d)"
            />
          </MpFormControl>

          <label v-if="variant === 'product'" class="prf-check">
            <MpCheckbox :id="`${id}-detail`" :is-checked="showDetail" @change="showDetail = !showDetail" />
            <span class="prf-check-text">
              <span>View detailed version</span>
              <span class="prf-check-sub">This will show transaction number and discount info with product type grouping.</span>
            </span>
          </label>

          <!-- Sort by (vendor + product) -->
          <MpFormControl v-if="variant !== 'list'" :id="`${id}-sort-fc`">
            <MpFormLabel>Sort by</MpFormLabel>
            <ErpFilterSelect :id="`${id}-sort`" v-model="sortBy" placeholder="Sort by" :options="activeSortOptions" width="100%" :is-clearable="false" />
            <div class="prf-radios prf-radios--below">
              <label class="prf-radio"><MpRadio :id="`${id}-sl-asc`" :name="`${id}-sl`" value="asc" :is-checked="sortLogic === 'asc'" @change="sortLogic = 'asc'" /><span>Ascending</span></label>
              <label class="prf-radio"><MpRadio :id="`${id}-sl-desc`" :name="`${id}-sl`" value="desc" :is-checked="sortLogic === 'desc'" @change="sortLogic = 'desc'" /><span>Descending</span></label>
            </div>
          </MpFormControl>
        </div>

        <footer class="prf-foot">
          <a class="prf-reset" role="button" tabindex="0" @click="resetFilter" @keydown.enter="resetFilter"><MpIcon name="undo" size="sm" /> Reset filter</a>
          <div class="prf-foot-actions">
            <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
            <MpButton is-rounded @click="apply">Apply</MpButton>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.prf-enter-active, .prf-leave-active { transition: background-color 250ms ease; }
.prf-enter-from, .prf-leave-to { background-color: transparent; }
.prf-enter-active .prf-panel { transition: transform 350ms ease-out; }
.prf-leave-active .prf-panel { transition: transform 250ms ease-in; }
.prf-enter-from .prf-panel, .prf-leave-to .prf-panel { transform: translateX(calc(100% + 12px)); }

.prf-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.prf-panel { margin: var(--mp-spacing-3, 12px); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.prf-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.prf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prf-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9) !important; height: var(--mp-sizes-9) !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); color: var(--mp-icon-default); }
.prf-close:hover { background: var(--mp-background-neutral-hovered) !important; }

.prf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5); padding: var(--mp-spacing-4); }
.prf-radios { display: flex; align-items: center; gap: var(--mp-spacing-6); margin-bottom: var(--mp-spacing-2); }
.prf-radios--below { margin: var(--mp-spacing-2) 0 0; }
.prf-radio { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.prf-info { color: var(--mp-colors-icon-default); }
.prf-check { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); cursor: pointer; }
.prf-check-text { display: flex; flex-direction: column; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.prf-check-sub { color: var(--mp-text-secondary); }

.prf-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.prf-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.prf-reset { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
</style>
