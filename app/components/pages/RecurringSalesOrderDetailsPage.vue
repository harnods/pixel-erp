<script setup lang="ts">
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpIcon, MpButton, MpTextlink,
  MpFormControl, MpFormLabel, MpInput, MpAutocomplete, MpDatePicker, MpToggle,
  css, toast,
} from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import DetailActionsMenu from '~/components/patterns/DetailActionsMenu.vue'
import PrintShareMenu from '~/components/patterns/PrintShareMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { recurringSalesOrders, type RecurringSalesOrder } from '~/data'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const template = computed(() => recurringSalesOrders.find(r => r.id === props.orderId))

function goBack() { router.push('/sales-orders?tab=Recurring+orders') }

function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function formatUpdatedAt(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

function discountText(pct: number) { return pct > 0 ? `${pct}%` : '' }

function unitLabel(unit: string) {
  const map: Record<string, string> = { day: t('Day'), week: t('Week'), month: t('Month'), year: t('Year') }
  return map[unit] ?? unit
}
function endRepeatSummary(tmpl: RecurringSalesOrder) {
  const s = tmpl.schedule
  if (!s) return '—'
  if (s.endRepeat === 'never') return t('Repeat forever')
  if (s.endRepeat === 'after') return `${t('End after')} ${s.endAfterCount} ${t('occurrences')}`
  if (s.endRepeat === 'on' && s.endOnDate) return `${t('End on')} ${formatDateLong(s.endOnDate)}`
  return '—'
}

// ── Edit recurring settings drawer ──
const recurringDrawerOpen = ref(false)

const editRepeatInterval = ref(1)
const editRepeatUnit = ref('month')
const editEndRepeat = ref('never')
const editEndAfterCount = ref(12)
const editEndOnDate = ref('')
const editStartDate = ref('')

const repeatUnitOptions = [
  { label: t('Day'), value: 'day' },
  { label: t('Week'), value: 'week' },
  { label: t('Month'), value: 'month' },
  { label: t('Year'), value: 'year' },
]
const endRepeatOptions = [
  { label: t('Repeat forever'), value: 'never' },
  { label: t('End after'), value: 'after' },
  { label: t('End on'), value: 'on' },
]

function formatDateDMY(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function openEditDrawer() {
  const s = template.value?.schedule
  if (!s) return
  editRepeatInterval.value = s.repeatInterval
  editRepeatUnit.value = s.repeatUnit
  editEndRepeat.value = s.endRepeat
  editEndAfterCount.value = s.endAfterCount ?? 12
  editEndOnDate.value = s.endOnDate ? formatDateDMY(s.endOnDate) : ''
  editStartDate.value = formatDateDMY(s.startDate)
  recurringDrawerOpen.value = true
}

function saveEditing() {
  const tmpl = template.value
  if (!tmpl?.schedule) return
  tmpl.schedule.repeatInterval = editRepeatInterval.value
  tmpl.schedule.repeatUnit = editRepeatUnit.value as 'day' | 'week' | 'month' | 'year'
  tmpl.schedule.endRepeat = editEndRepeat.value as 'never' | 'after' | 'on'
  tmpl.schedule.endAfterCount = editEndAfterCount.value
  const [d2, m2, y2] = editStartDate.value.split('/')
  tmpl.schedule.startDate = `${y2}-${m2}-${d2}`
  if (editEndRepeat.value === 'on' && editEndOnDate.value) {
    const [d3, m3, y3] = editEndOnDate.value.split('/')
    tmpl.schedule.endOnDate = `${y3}-${m3}-${d3}`
  }
  recurringDrawerOpen.value = false
  toast.notify({ variant: 'success', title: t('Recurring settings updated') })
}

function toggleAutoEmail() {
  const tmpl = template.value
  if (tmpl?.schedule) {
    tmpl.schedule.sendAutoEmail = !tmpl.schedule.sendAutoEmail
    toast.notify({ variant: 'success', title: t(tmpl.schedule.sendAutoEmail ? 'Automatic email enabled' : 'Automatic email disabled') })
  }
}

// ── Delete ──
const deleteOpen = ref(false)
function confirmDelete() {
  const idx = recurringSalesOrders.findIndex(r => r.id === props.orderId)
  if (idx !== -1) recurringSalesOrders.splice(idx, 1)
  deleteOpen.value = false
  toast.notify({ variant: 'success', title: t('Recurring order deleted') })
  goBack()
}

const hasHistory = computed(() => !!template.value?.history?.length)

const actionGroups = computed(() => [
  [
    { label: t('Edit'), onClick: openEditDrawer },
    { label: t('Delete'), onClick: () => { deleteOpen.value = true }, destructive: true },
  ],
])
</script>

<template>
  <!-- Not found -->
  <div v-if="!template" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="rso-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Sales orders') }}</MpTextlink>
        <h1 class="detail-title">{{ t('Recurring order not found') }}</h1>
      </div>
    </header>
  </div>

  <div v-else class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="rso-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Sales orders') }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ template.customer.name }}</h1>
          <ErpStatusBadge :status="template.status" :type="template.status === 'completed' ? 'announcement' : undefined" badge-for="additionalInformation" size="md" />
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Header summary ── -->
      <section class="detail-summary">
        <!-- Primary row -->
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Customer')">{{ template.customer.name }}</ContentList>
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Email')">
              <span v-for="(e, i) in template.email" :key="i" class="content-list__line">{{ e }}</span>
            </ContentList>
          </div>
          <div class="detail-primary-total">
            <span class="detail-total-label">{{ t('Total') }}</span>
            <span class="detail-total-amount">{{ formatIDR(template.totals.total) }}</span>
          </div>
        </div>

        <div class="detail-divider" />

        <!-- Detail grid -->
        <div class="content-list-grid">
          <!-- col 1: addresses -->
          <div class="content-list-col">
            <ContentList :label="t('Billing address')" :value="template.billingAddress" />
            <ContentList :label="t('Ship to')" :value="template.shipTo" />
          </div>
          <!-- col 2: schedule dates -->
          <div class="content-list-col">
            <ContentList :label="t('Next order')">
              <template v-if="template.status !== 'completed'">{{ formatDateLong(template.nextDate) }}</template>
              <template v-else>—</template>
            </ContentList>
            <ContentList v-if="template.schedule" :label="t('Start date')" :value="formatDateLong(template.schedule.startDate)" />
            <ContentList :label="t('Payment terms')" :value="template.paymentTerms" />
          </div>
          <!-- col 3: repeat settings -->
          <div class="content-list-col">
            <ContentList v-if="template.schedule" :label="t('Repeats every')">{{ template.schedule.repeatInterval }} {{ unitLabel(template.schedule.repeatUnit) }}</ContentList>
            <ContentList v-if="template.schedule" :label="t('End repeat')">{{ endRepeatSummary(template) }}</ContentList>
            <ContentList :label="t('Generated')">{{ template.createdCount }}</ContentList>
          </div>
          <!-- col 4: references -->
          <div class="content-list-col">
            <ContentList :label="t('Frequency')" :value="t(template.frequency)" />
            <ContentList :label="t('Reference no.')" :value="template.referenceNo" />
            <ContentList :label="t('Warehouse')" :value="template.warehouse" />
          </div>
          <!-- col 5: tags -->
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
              <ErpTagList v-if="template.tags?.length" :tags="template.tags" />
              <template v-else>—</template>
            </ContentList>
          </div>
        </div>
      </section>

      <!-- ── Line items table ── -->
      <section class="detail-items-section">
        <div class="detail-items-scroll">
          <table class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">{{ t('Product') }}</th>
                <th class="detail-th">{{ t('Description') }}</th>
                <th class="detail-th detail-th--num">{{ t('Qty') }}</th>
                <th class="detail-th">{{ t('Unit') }}</th>
                <th class="detail-th detail-th--num">{{ t('Unit price') }}</th>
                <th class="detail-th detail-th--num">{{ t('Discount') }}</th>
                <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, i) in template.lineItems" :key="i" class="detail-item-row">
                <td class="detail-td">
                  <span class="detail-item-primary">
                    <a class="cell-link detail-item-name" @click.stop>{{ it.product }}</a>
                    <span class="detail-item-sku">{{ t('SKU') }}: {{ it.sku }}</span>
                  </span>
                </td>
                <td class="detail-td detail-td--muted">{{ it.description }}</td>
                <td class="detail-td detail-td--num">{{ it.qty }}</td>
                <td class="detail-td">{{ it.unit }}</td>
                <td class="detail-td detail-td--num">{{ formatIDR(it.unitPrice) }}</td>
                <td class="detail-td detail-td--num">{{ discountText(it.discountPct) }}</td>
                <td class="detail-td detail-td--num">{{ formatIDR(it.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="detail-items-count">
          <span>{{ t('Showing') }} {{ template.lineItems.length }} {{ t('of') }} {{ template.lineItems.length }} {{ t('products') }}</span>
        </div>
      </section>

      <!-- ── Notes + totals ── -->
      <section class="detail-notes">
        <!-- Left: message / memo -->
        <div class="detail-notes-left">
          <ContentList :label="t('Message')">
            <p class="detail-note-text">{{ template.message }}</p>
          </ContentList>
          <ContentList :label="t('Memo')">
            <p class="detail-note-text">{{ template.memo }}</p>
          </ContentList>
        </div>

        <!-- Right: totals summary -->
        <div class="detail-totals">
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--strong">{{ formatIDR(template.totals.subtotal) }}</span>
          </div>
          <div v-if="template.totals.discountPerLine > 0" class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Discount per line') }}</span>
            <span class="detail-total-row-amt">-{{ formatIDR(template.totals.discountPerLine) }}</span>
          </div>
          <div v-if="template.totals.globalDiscount > 0" class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Global discount') }}</span>
            <span class="detail-total-row-amt">-{{ formatIDR(template.totals.globalDiscount) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ template.totals.taxLabel }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(template.totals.taxAmount) }}</span>
          </div>
          <div v-if="template.totals.shippingFee > 0" class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Shipping fee') }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(template.totals.shippingFee) }}</span>
          </div>
          <div class="detail-total-rule" />
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(template.totals.total) }}</span>
          </div>
        </div>
      </section>

      <!-- Last updated -->
      <a class="detail-updated" @click.prevent>{{ t('Last updated by') }} {{ template.lastUpdatedBy }} {{ t('on') }} {{ formatUpdatedAt(template.lastUpdatedAt) }}</a>

      <!-- ── Tabs — Recurring history ── -->
      <MpTabs v-if="hasHistory" id="rso-detail-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="rso-tab-history" :value="0">{{ t('Recurring history') }}</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <h3 class="detail-tab-heading">{{ t('Transactions') }}</h3>
            <table class="detail-linked">
              <colgroup>
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--number" />
                <col class="detail-linked-col--status" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in template.history" :key="entry.orderNumber" class="detail-item-row">
                  <td class="detail-td">{{ formatDateNumeric(entry.date) }}</td>
                  <td class="detail-td">
                    <a class="cell-link cell-text" @click.stop>{{ t('Sales Order') }} #{{ entry.orderNumber }}</a>
                  </td>
                  <td class="detail-td"><ErpStatusBadge :status="entry.status.toLowerCase()" /></td>
                  <td class="detail-td"></td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

      <!-- ── Footer action bar ── -->
      <div class="detail-footer">
        <PrintShareMenu id="rso-print" />
        <DetailActionsMenu id="rso-actions" :groups="actionGroups" />
      </div>
    </div><!-- /detail-stage -->

    <!-- ── Delete confirm ── -->
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete recurring order?')"
      :description="`${template.templateName} ${t('will be permanently deleted. This cannot be undone.')}`"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />

    <!-- ── Edit recurring settings drawer ── -->
    <ErpDrawer :is-open="recurringDrawerOpen" :title="t('Edit recurring settings')" @close="recurringDrawerOpen = false">
      <template #body>
        <MpFormControl id="rso-edit-repeat">
          <MpFormLabel>{{ t('Repeats every') }}</MpFormLabel>
          <div class="recur-edit-repeat-row">
            <MpInput id="rso-edit-interval" v-model.number="editRepeatInterval" type="number" :min="1" class="recur-edit-num" />
            <MpAutocomplete id="rso-edit-unit" v-model="editRepeatUnit" :data="repeatUnitOptions" label-prop="label" value-prop="value" use-portal is-full-width class="recur-edit-unit" />
          </div>
        </MpFormControl>

        <MpFormControl id="rso-edit-end">
          <MpFormLabel>{{ t('End repeat') }}</MpFormLabel>
          <MpAutocomplete id="rso-edit-end-inp" v-model="editEndRepeat" :data="endRepeatOptions" label-prop="label" value-prop="value" use-portal is-full-width />
          <div v-if="editEndRepeat === 'after'" class="recur-edit-sub">
            <MpInput id="rso-edit-end-count" v-model.number="editEndAfterCount" type="number" :min="1" class="recur-edit-count" />
            <span class="recur-edit-sublabel">{{ t('occurrences') }}</span>
          </div>
          <div v-if="editEndRepeat === 'on'" class="recur-edit-sub">
            <MpDatePicker id="rso-edit-end-date" v-model="editEndOnDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>

        <MpFormControl id="rso-edit-start">
          <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
          <MpDatePicker id="rso-edit-start-date" v-model="editStartDate" format="DD/MM/YYYY" value-type="format" use-portal />
        </MpFormControl>

        <div class="recur-view-row recur-auto-toggle">
          <span class="recur-view-label">{{ t('Send automatic email') }}</span>
          <MpToggle :is-checked="template.schedule?.sendAutoEmail ?? false" @change="toggleAutoEmail" />
        </div>
      </template>

      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" @click="recurringDrawerOpen = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="saveEditing">{{ t('Save changes') }}</button>
      </template>
    </ErpDrawer>
  </div>
</template>

<style scoped>
.detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-width: 0;
}
.detail-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Stage ── */
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);
}

/* ── Header summary ── */
.detail-summary { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

.detail-primary-total {
  grid-column: 3 / -1;
  justify-self: end;
  align-self: start;
  padding-top: var(--mp-spacing-2);
  display: flex;
  align-items: baseline;
  gap: var(--mp-spacing-2);
}
.detail-total-label {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.detail-total-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(4, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6);
  row-gap: 0;
}
.content-list-col { display: flex; flex-direction: column; }

.detail-divider {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* ── Line items table ── */
.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items, .detail-linked {
  width: 100%;
  border-collapse: collapse;
}
.detail-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  white-space: nowrap;
}
.detail-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  vertical-align: middle;
}
.detail-td--num {
  text-align: right;
  white-space: nowrap;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4);
}
.detail-items tbody .detail-td { vertical-align: top; }
.detail-td--muted { color: var(--mp-text-secondary); }
.detail-item-primary { display: block; }
.detail-item-name { display: block; color: var(--mp-text-default); }
.detail-item-sku {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
  margin-top: var(--mp-spacing-0\.5);
}
.detail-items-count {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--mp-spacing-3);
  margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}

/* ── Notes + totals ── */
.detail-notes {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: var(--mp-spacing-6);
  align-items: start;
}
.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  white-space: pre-line;
}
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-2); }
.detail-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-row-label--strong, .detail-total-row-amt--strong,
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.detail-total-rule {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* ── Last updated ── */
.detail-updated {
  margin: 0;
  align-self: flex-start;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Tabs ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) {
  color: var(--mp-text-selected) !important;
}
.detail-tabs :deep(.mp-tab-selected-border--isSelected_true) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) {
  margin-bottom: var(--mp-spacing-5) !important;
}

/* ── Linked transactions table ── */
.detail-linked { table-layout: fixed; }
.detail-linked-col--date   { width: 160px; }
.detail-linked-col--number { width: 260px; }
.detail-linked-col--status { width: 160px; }

.detail-tab-heading {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Footer ── */
.detail-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}

/* ── Recurring edit drawer ── */
.recur-view-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.recur-view-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); min-width: 160px; flex-shrink: 0; }
.recur-auto-toggle { padding-top: var(--mp-spacing-2); }
.recur-edit-repeat-row { display: flex; gap: var(--mp-spacing-2); }
.recur-edit-num { flex: 0 0 80px; }
.recur-edit-unit { flex: 1; }
.recur-edit-sub { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
.recur-edit-count { flex: 0 0 80px; }
.recur-edit-sublabel { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
</style>
