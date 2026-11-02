<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  MpButton, MpIcon, MpTextlink, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CrmEditProductsDrawer from '~/components/patterns/CrmEditProductsDrawer.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ActivityLogTable from '~/components/patterns/ActivityLogTable.vue'
import {
  getCrmModule, getGenericRecord, genericModuleStages, moveGenericRecordStage,
  genericPipelineFieldId, moduleStores, deleteGenericRecord, isRelatedListType,
  setGenericRecordProducts, genericRecordTotals, genericRecordActivityLog, lineSubtotal,
  type DealProperty, type DealLineItem, type DealProductsPayload, type Deal,
} from '~/data/crm'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()
const moduleId = computed(() => route.path.split('/').filter(Boolean)[1] ?? '')

const moduleName = computed(() => getCrmModule(moduleId.value)?.name ?? moduleId.value)
const rec = computed(() => getGenericRecord(moduleId.value, props.orderId))

const pipelineFieldId = computed(() => genericPipelineFieldId(moduleId.value))
const hasKanban = computed(() => !!pipelineFieldId.value)
const stages = computed(() => genericModuleStages(moduleId.value))
const currentIndex = computed(() => stages.value.findIndex((s) => s.name === rec.value?.stage))

const stores = computed(() => moduleStores(moduleId.value))
const detailSections = computed(() => {
  const detailTab = stores.value.detailLayout.tabs.find((tab) => tab.key === 'details')
  if (!detailTab?.sections?.length) return []
  return detailTab.sections.map((section) => {
    const cols: DealProperty[][] = []
    for (const col of section.cols) {
      const colFields: DealProperty[] = []
      for (const propId of col) {
        if (propId === 'record-name') continue
        const prop = stores.value.properties.find((p) => p.id === propId)
        if (prop) colFields.push(prop)
      }
      if (colFields.length) cols.push(colFields)
    }
    return { ...section, cols, hasFields: cols.some((c) => c.length > 0) }
  })
})

const hasProductListInLayout = computed(() => {
  return detailSections.value.some((s) =>
    s.cols.some((c: DealProperty[]) => c.some((p: DealProperty) => p.type === 'Product list')),
  )
})

function back() { router.push(`/crm/${moduleId.value}`) }

const availableStages = computed(() => {
  const cur = rec.value?.stage
  return stages.value.map((s) => s.name).filter((s) => s !== cur)
})

function moveStage(stage: string) {
  if (!rec.value || stage === rec.value.stage) return
  moveGenericRecordStage(moduleId.value, props.orderId, stage)
  successToast(`${t('Stage changed to')} ${stage}`)
}

const deleteConfirmOpen = ref(false)
function confirmDelete() {
  deleteConfirmOpen.value = false
  deleteGenericRecord(moduleId.value, props.orderId)
  successToast(t('Record deleted'))
  back()
}

function getFieldValue(prop: DealProperty): string {
  if (!rec.value) return '—'
  const v = rec.value.values[prop.variableName] ?? rec.value.values[prop.id]
  return v != null && v !== '' ? String(v) : '—'
}

function fmtDate(iso?: string) {
  return iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—'
}

function isDateType(type: string): boolean {
  return ['Date picker', 'Date and time picker', 'Date range'].includes(type)
}

function displayValue(prop: DealProperty): string {
  const raw = getFieldValue(prop)
  if (raw === '—') return raw
  if (isDateType(prop.type)) return fmtDate(raw)
  return raw
}

function gridClass(colCount: number): string {
  if (colCount <= 2) return 'content-list-grid content-list-grid--2'
  if (colCount === 3) return 'content-list-grid content-list-grid--3'
  return 'content-list-grid content-list-grid--4'
}

// ── Products ──
const money = (n: number) => formatMoney(n, rec.value?.values.currency ?? 'IDR')
const totals = computed(() => rec.value ? genericRecordTotals(rec.value) : null)

const productSearch = ref('')
const visibleProducts = computed(() => {
  const list = rec.value?.products ?? []
  const q = productSearch.value.trim().toLowerCase()
  return q ? list.filter((li) => li.productName.toLowerCase().includes(q) || (li.sku ?? '').toLowerCase().includes(q)) : list
})

function lineDiscountText(li: DealLineItem) {
  if (li.discountType === 'percentage' && li.discount) return `${li.discount}%`
  if (li.discountType === 'fixed' && li.discount) return money(li.discount)
  return ''
}
function deductionText(amount: number) { return amount > 0 ? `(${money(amount)})` : money(0) }

const productDrawerOpen = ref(false)
const dealAdapter = computed<Deal | null>(() => {
  if (!rec.value) return null
  return {
    id: rec.value.id,
    name: rec.value.name,
    customerId: rec.value.values.customer ?? '',
    company: rec.value.values.customer ?? '',
    stage: rec.value.stage as any,
    owner: rec.value.owner,
    value: 0,
    priority: '' as any,
    createdAt: rec.value.createdAt,
    lastActivity: rec.value.createdAt,
    conversion: 'none' as any,
    products: rec.value.products,
    orderDiscountType: rec.value.orderDiscountType,
    orderDiscount: rec.value.orderDiscount,
    shippingFee: rec.value.shippingFee,
    tax: rec.value.tax,
    taxType: rec.value.taxType,
  } as Deal
})

function onProductsSaved(payload: DealProductsPayload) {
  if (!rec.value) return
  setGenericRecordProducts(moduleId.value, rec.value.id, payload)
  productDrawerOpen.value = false
  successToast(t('Products updated'))
}

// ── Activity log ──
const activityEntries = computed(() => rec.value ? genericRecordActivityLog(moduleId.value, rec.value) : [])
</script>

<template>
  <div v-if="rec" class="detail-page">

    <!-- Title bar -->
    <header class="detail-bar" data-devchange="crm-generic-detail-page-overhaul">
      <div class="detail-bar-left">
        <MpTextlink :id="`${moduleId}-breadcrumb`" as="a" class="detail-breadcrumb" @click.prevent="back">{{ moduleName }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ rec.name }}</h1>
        </div>
      </div>
      <div class="detail-titlerow-right">
        <!-- Move to — only when pipeline configured -->
        <MpPopover v-if="hasKanban" :id="`${moduleId}-stage-menu`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="primary" right-icon="chevrons-down" is-rounded>{{ t('Move to') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="stage-dropdown">
            <MpPopoverList>
              <MpPopoverListItem v-for="s in availableStages" :key="s" @click="moveStage(s)">{{ s }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Kebab actions -->
        <MpPopover :id="`${moduleId}-actions`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="actions-dropdown">
            <MpPopoverList>
              <MpPopoverListItem @click="router.push(`/crm/${moduleId}/${orderId}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="deleteConfirmOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <!-- ═══ WITH pipeline: tabs inside stage ═══ -->
    <template v-if="hasKanban">
      <div class="detail-stage">
        <section class="deal-stepper">
          <div class="deal-stepper-labels">
            <div
              v-for="(s, i) in stages" :key="s.name"
              class="deal-step"
              :class="{ 'deal-step--current': i === currentIndex, 'deal-step--done': i <= currentIndex }"
              role="button" tabindex="0"
              @click="moveStage(s.name)"
            >
              <span class="deal-step-name">{{ s.name }}</span>
            </div>
          </div>
          <div class="deal-stepper-bar">
            <span
              v-for="(s, i) in stages" :key="s.name"
              class="deal-bar-seg"
              :class="{ 'deal-bar-seg--filled': i <= currentIndex }"
            />
          </div>
        </section>

        <MpTabs :key="rec.id" :id="`${moduleId}-tabs`" :default-value="0" variant-color="green" class="detail-tabs">
          <MpTabList>
            <MpTab :id="`${moduleId}-tab-details`" value="details">{{ t('Record details') }}</MpTab>
            <MpTab :id="`${moduleId}-tab-activity`" value="activity">{{ t('Activity') }}</MpTab>
          </MpTabList>
          <MpTabPanels>
            <MpTabPanel value="details">
              <!-- shared detail content -->
              <template v-for="section in detailSections" :key="section.id">
                <template v-for="col in section.cols" :key="`emb-${section.id}`">
                  <template v-for="prop in col" :key="`emb-${prop.id}`">
                    <template v-if="prop.type === 'Product list'">
                      <section class="detail-summary detail-items-section" data-devchange="crm-generic-product-list">
                        <div class="deal-files-filterbar">
                          <div class="filter-left" />
                          <div class="filter-right">
                            <div class="filter-search">
                              <MpIcon name="search" size="sm" />
                              <input v-model="productSearch" class="filter-search-input" type="text" :placeholder="t('Search products…')" />
                              <MpButton v-if="productSearch" class="search-clear-btn" type="button" left-icon="close" :aria-label="t('Clear search')" @click="productSearch = ''" />
                            </div>
                            <MpButton variant="tertiary" is-rounded left-icon="add" @click="productDrawerOpen = true">{{ t('Add product') }}</MpButton>
                          </div>
                        </div>
                        <table class="detail-items">
                          <thead>
                            <tr>
                              <th class="detail-th">{{ t('Product') }}</th>
                              <th class="detail-th">{{ t('Description') }}</th>
                              <th class="detail-th detail-th--num">{{ t('Qty') }}</th>
                              <th class="detail-th">{{ t('Unit') }}</th>
                              <th class="detail-th detail-th--num">{{ t('Unit price') }}</th>
                              <th class="detail-th detail-th--num">{{ t('Discount') }}</th>
                              <th class="detail-th">{{ t('Tax') }}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(li, idx) in visibleProducts" :key="li.productId + idx" class="detail-item-row">
                              <td class="detail-td"><ProductCell :name="li.productName" :image="li.image" :desc="li.sku ? `${t('SKU')}: ${li.sku}` : undefined" /></td>
                              <td class="detail-td detail-td--muted">{{ li.description || '—' }}</td>
                              <td class="detail-td detail-td--num">{{ li.quantity }}</td>
                              <td class="detail-td">{{ li.unit }}</td>
                              <td class="detail-td detail-td--num">{{ money(li.originalPrice) }}</td>
                              <td class="detail-td detail-td--num">{{ lineDiscountText(li) }}</td>
                              <td class="detail-td">{{ totals?.taxLabel }}</td>
                            </tr>
                            <tr v-if="!visibleProducts.length">
                              <td class="detail-td detail-td--muted" colspan="7">{{ rec.products?.length ? t('No products match your search.') : t('No products added to this deal yet.') }}</td>
                            </tr>
                          </tbody>
                        </table>
                        <div class="detail-items-count"><span>{{ t('Showing') }} {{ visibleProducts.length }} {{ t('of') }} {{ rec.products?.length ?? 0 }} {{ t('products') }}</span></div>
                      </section>
                      <section v-if="rec.products?.length" class="detail-totals-section detail-summary">
                        <div class="detail-totals">
                          <div class="detail-total-row"><span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span><span class="detail-total-row-amt detail-total-row-amt--strong">{{ money(totals!.subtotal) }}</span></div>
                          <div class="detail-total-row"><span class="detail-total-row-label">{{ t('Discount per line') }}</span><span class="detail-total-row-amt">{{ deductionText(totals!.discountPerLine) }}</span></div>
                          <div class="detail-total-row"><span class="detail-total-row-label">{{ t('Global discount') }}</span><span class="detail-total-row-amt">{{ deductionText(totals!.globalDiscount) }}</span></div>
                          <div v-if="totals!.taxLabel" class="detail-total-row"><span class="detail-total-row-label">{{ totals!.taxLabel }}</span><span class="detail-total-row-amt">{{ money(totals!.taxAmount) }}</span></div>
                          <div v-if="totals!.shippingFee" class="detail-total-row"><span class="detail-total-row-label">{{ t('Shipping fee') }}</span><span class="detail-total-row-amt">{{ money(totals!.shippingFee) }}</span></div>
                          <div class="detail-total-rule" />
                          <div class="detail-total-row"><span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span><span class="detail-total-row-amt detail-total-row-amt--total">{{ money(totals!.total) }}</span></div>
                        </div>
                      </section>
                    </template>
                    <section v-else-if="prop.type === 'Related list'" class="detail-summary detail-embedded-list">
                      <h3 class="detail-section-title">{{ t(prop.name) }}</h3>
                      <div class="detail-embedded-list-empty"><p class="detail-embedded-list-text">{{ t('No items yet.') }}</p></div>
                    </section>
                  </template>
                </template>
                <section v-if="section.cols.some((c: DealProperty[]) => c.some((p: DealProperty) => !isRelatedListType(p.type)))" class="detail-summary">
                  <h3 class="detail-section-title">{{ t(section.name) }}</h3>
                  <div :class="gridClass(section.columns || section.cols.length)">
                    <div v-for="(col, ci) in section.cols" :key="ci" class="content-list-col">
                      <ContentList v-for="prop in col.filter((p: DealProperty) => !isRelatedListType(p.type))" :key="prop.id" :label="t(prop.name)" :value="displayValue(prop)" />
                    </div>
                  </div>
                </section>
              </template>
              <section v-if="!detailSections.length" class="detail-summary">
                <h3 class="detail-section-title">{{ t('Overview') }}</h3>
                <div class="content-list-grid content-list-grid--2">
                  <div class="content-list-col">
                    <ContentList :label="t('Record name')" :value="rec.name" />
                    <ContentList :label="t('Owner')" :value="rec.owner || '—'" />
                  </div>
                </div>
              </section>
            </MpTabPanel>
            <MpTabPanel value="activity">
              <h3 class="detail-tab-heading">{{ t('Activity log') }}</h3>
              <ActivityLogTable :entries="activityEntries" />
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </div>
    </template>

    <!-- ═══ WITHOUT pipeline: tab bar in gray area, panels in stage ═══ -->
    <template v-else>
      <MpTabs :key="rec.id" :id="`${moduleId}-tabs`" :default-value="0" variant-color="green" class="detail-tabs detail-tabs--flat">
        <MpTabList class="detail-tablist-outer">
          <MpTab :id="`${moduleId}-tab-details`" value="details">{{ t('Record details') }}</MpTab>
          <MpTab :id="`${moduleId}-tab-activity`" value="activity">{{ t('Activity') }}</MpTab>
        </MpTabList>
        <MpTabPanels class="detail-panels-outer">
          <MpTabPanel value="details">
            <template v-for="section in detailSections" :key="section.id">
              <template v-for="col in section.cols" :key="`emb-${section.id}`">
                <template v-for="prop in col" :key="`emb-${prop.id}`">
                  <template v-if="prop.type === 'Product list'">
                    <section class="detail-summary detail-items-section" data-devchange="crm-generic-product-list">
                      <div class="deal-files-filterbar">
                        <div class="filter-left" />
                        <div class="filter-right">
                          <div class="filter-search">
                            <MpIcon name="search" size="sm" />
                            <input v-model="productSearch" class="filter-search-input" type="text" :placeholder="t('Search products…')" />
                            <MpButton v-if="productSearch" class="search-clear-btn" type="button" left-icon="close" :aria-label="t('Clear search')" @click="productSearch = ''" />
                          </div>
                          <MpButton variant="tertiary" is-rounded left-icon="add" @click="productDrawerOpen = true">{{ t('Add product') }}</MpButton>
                        </div>
                      </div>
                      <table class="detail-items">
                        <thead>
                          <tr>
                            <th class="detail-th">{{ t('Product') }}</th>
                            <th class="detail-th">{{ t('Description') }}</th>
                            <th class="detail-th detail-th--num">{{ t('Qty') }}</th>
                            <th class="detail-th">{{ t('Unit') }}</th>
                            <th class="detail-th detail-th--num">{{ t('Unit price') }}</th>
                            <th class="detail-th detail-th--num">{{ t('Discount') }}</th>
                            <th class="detail-th">{{ t('Tax') }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(li, idx) in visibleProducts" :key="li.productId + idx" class="detail-item-row">
                            <td class="detail-td"><ProductCell :name="li.productName" :image="li.image" :desc="li.sku ? `${t('SKU')}: ${li.sku}` : undefined" /></td>
                            <td class="detail-td detail-td--muted">{{ li.description || '—' }}</td>
                            <td class="detail-td detail-td--num">{{ li.quantity }}</td>
                            <td class="detail-td">{{ li.unit }}</td>
                            <td class="detail-td detail-td--num">{{ money(li.originalPrice) }}</td>
                            <td class="detail-td detail-td--num">{{ lineDiscountText(li) }}</td>
                            <td class="detail-td">{{ totals?.taxLabel }}</td>
                          </tr>
                          <tr v-if="!visibleProducts.length">
                            <td class="detail-td detail-td--muted" colspan="7">{{ rec.products?.length ? t('No products match your search.') : t('No products added to this deal yet.') }}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div class="detail-items-count"><span>{{ t('Showing') }} {{ visibleProducts.length }} {{ t('of') }} {{ rec.products?.length ?? 0 }} {{ t('products') }}</span></div>
                    </section>
                    <section v-if="rec.products?.length" class="detail-totals-section detail-summary">
                      <div class="detail-totals">
                        <div class="detail-total-row"><span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span><span class="detail-total-row-amt detail-total-row-amt--strong">{{ money(totals!.subtotal) }}</span></div>
                        <div class="detail-total-row"><span class="detail-total-row-label">{{ t('Discount per line') }}</span><span class="detail-total-row-amt">{{ deductionText(totals!.discountPerLine) }}</span></div>
                        <div class="detail-total-row"><span class="detail-total-row-label">{{ t('Global discount') }}</span><span class="detail-total-row-amt">{{ deductionText(totals!.globalDiscount) }}</span></div>
                        <div v-if="totals!.taxLabel" class="detail-total-row"><span class="detail-total-row-label">{{ totals!.taxLabel }}</span><span class="detail-total-row-amt">{{ money(totals!.taxAmount) }}</span></div>
                        <div v-if="totals!.shippingFee" class="detail-total-row"><span class="detail-total-row-label">{{ t('Shipping fee') }}</span><span class="detail-total-row-amt">{{ money(totals!.shippingFee) }}</span></div>
                        <div class="detail-total-rule" />
                        <div class="detail-total-row"><span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span><span class="detail-total-row-amt detail-total-row-amt--total">{{ money(totals!.total) }}</span></div>
                      </div>
                    </section>
                  </template>
                  <section v-else-if="prop.type === 'Related list'" class="detail-summary detail-embedded-list">
                    <h3 class="detail-section-title">{{ t(prop.name) }}</h3>
                    <div class="detail-embedded-list-empty"><p class="detail-embedded-list-text">{{ t('No items yet.') }}</p></div>
                  </section>
                </template>
              </template>
              <section v-if="section.cols.some((c: DealProperty[]) => c.some((p: DealProperty) => !isRelatedListType(p.type)))" class="detail-summary">
                <h3 class="detail-section-title">{{ t(section.name) }}</h3>
                <div :class="gridClass(section.columns || section.cols.length)">
                  <div v-for="(col, ci) in section.cols" :key="ci" class="content-list-col">
                    <ContentList v-for="prop in col.filter((p: DealProperty) => !isRelatedListType(p.type))" :key="prop.id" :label="t(prop.name)" :value="displayValue(prop)" />
                  </div>
                </div>
              </section>
            </template>
            <section v-if="!detailSections.length" class="detail-summary">
              <h3 class="detail-section-title">{{ t('Overview') }}</h3>
              <div class="content-list-grid content-list-grid--2">
                <div class="content-list-col">
                  <ContentList :label="t('Record name')" :value="rec.name" />
                  <ContentList :label="t('Owner')" :value="rec.owner || '—'" />
                </div>
              </div>
            </section>
          </MpTabPanel>
          <MpTabPanel value="activity">
            <h3 class="detail-tab-heading">{{ t('Activity log') }}</h3>
            <ActivityLogTable :entries="activityEntries" />
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </template>

    <!-- Delete confirm -->
    <ConfirmModal
      v-model:is-open="deleteConfirmOpen"
      :title="t('Delete record?')"
      :description="t('Deleted record cannot be restored.')"
      :confirm-label="t('Delete record')"
      @confirm="confirmDelete"
    />

    <!-- Products drawer -->
    <CrmEditProductsDrawer
      :open="productDrawerOpen"
      :deal="dealAdapter"
      @close="productDrawerOpen = false"
      @save="onProductsSaved"
    />
  </div>

  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink :id="`${moduleId}-breadcrumb`" as="a" class="detail-breadcrumb" @click.prevent="back">{{ moduleName }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Not found') }}</h1>
        </div>
      </div>
    </header>
    <div class="detail-stage">
      <div class="detail-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="detail-empty-illustration" width="288" height="240" />
        <p class="detail-empty-title">{{ t('Record not found') }}</p>
        <p class="detail-empty-caption">{{ t('This record does not exist or was removed.') }}</p>
        <MpButton variant="secondary" is-rounded @click="back">{{ t('Back') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* Title bar */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.stage-dropdown { min-width: 200px; width: max-content; white-space: nowrap; }
.actions-dropdown { min-width: 180px; width: max-content; white-space: nowrap; }

/* Stage */
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column;
  gap: var(--mp-spacing-8);
}

/* Pipeline stepper */
.deal-stepper { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.deal-stepper-labels { display: flex; gap: var(--mp-spacing-2); }
.deal-step { flex: 1; display: flex; flex-direction: column; min-width: 0; cursor: pointer; }
.deal-step-name { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal-step--current .deal-step-name { color: var(--mp-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.deal-step--done .deal-step-name { color: var(--mp-text-default); }
.deal-stepper-bar { display: flex; gap: 3px; }
.deal-bar-seg { flex: 1; height: 6px; border-radius: 3px; background: var(--mp-background-neutral-subtle, #eef1f1); }
.deal-bar-seg--filled { background: var(--mp-border-selected, #029861); }

/* Tabs — inside stage (with pipeline) */
.detail-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.detail-tabs :deep([data-pixel-component="MpTabPanels"]) { flex: 1; min-height: 0; overflow-y: auto; }

/* Tabs — flat layout (no pipeline): tab bar in gray area, panels become the stage */
.detail-tabs--flat {
  flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
.detail-tablist-outer {
  flex-shrink: 0;
  padding: 0 var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.detail-tablist-outer :deep([data-pixel-component="MpTabList"]) { margin-bottom: 0 !important; }
.detail-panels-outer {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  padding: var(--mp-spacing-6);
}

/* Tab headings */
.detail-tab-heading { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* Section headings */
.detail-section-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); margin: 0 0 var(--mp-spacing-4) 0;
}
.detail-summary { display: flex; flex-direction: column; margin-top: var(--mp-spacing-6); }

/* Content grids */
.content-list-grid { display: grid; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.content-list-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.content-list-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.content-list-col { display: flex; flex-direction: column; min-width: 0; }

/* Embedded list */
.detail-embedded-list { border: 1px solid var(--mp-border-default, #dde1e1); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-4) var(--mp-spacing-5); }
.detail-embedded-list-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-6) 0; }
.detail-embedded-list-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Product list table — matching CrmDealDetailPage */
.detail-items-section { margin-top: var(--mp-spacing-6); }
.deal-files-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-4); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-icon-default, #536062); }

.detail-items { width: 100%; border-collapse: collapse; }
.detail-th {
  text-align: left; padding: var(--mp-spacing-3) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f4f5f7);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.detail-th--num { text-align: right; }
.detail-td {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  vertical-align: middle;
}
.detail-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.detail-td--muted { color: var(--mp-text-secondary); }
.detail-item-row:hover { background: var(--mp-background-neutral-hovered, #f7f8f9); }
.detail-items-count {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

/* Totals */
.detail-totals-section { padding-top: var(--mp-spacing-4); }
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-2); align-items: flex-end; max-width: 400px; margin-left: auto; }
.detail-total-row { display: flex; align-items: baseline; gap: var(--mp-spacing-6); width: 100%; }
.detail-total-row-label { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: right; }
.detail-total-row-label--strong { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-row-label--total { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-row-amt { width: 180px; text-align: right; font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.detail-total-row-amt--strong { font-weight: var(--mp-font-weights-semi-bold); }
.detail-total-row-amt--total { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); }
.detail-total-rule { width: 100%; height: 1px; background: var(--mp-border-default, #e3e7e9); margin: var(--mp-spacing-2) 0; }

/* Empty */
.detail-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.detail-empty-illustration { max-width: 288px; height: auto; }
.detail-empty-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.detail-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-empty-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
