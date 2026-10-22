<script setup lang="ts">
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpIcon, MpButton, MpTextlink,
  MpFormControl, MpFormLabel, MpInput, MpAutocomplete, MpDatePicker, MpToggle,
  css, toast,
} from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import DetailActionsMenu from '~/components/patterns/DetailActionsMenu.vue'
import PrintShareMenu from '~/components/patterns/PrintShareMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { recurringBills, persistRecurringBills, type RecurringBill } from '~/data/bills'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const template = computed(() => recurringBills.find(r => r.id === props.orderId))

function goBack() { router.push('/expenses?tab=Recurring+expenses') }

function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function unitLabel(unit: string) {
  const map: Record<string, string> = { day: t('Day'), week: t('Week'), month: t('Month'), year: t('Year') }
  return map[unit] ?? unit
}
function endRepeatSummary(tmpl: RecurringBill) {
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
  persistRecurringBills()
  recurringDrawerOpen.value = false
  toast.notify({ variant: 'success', title: t('Recurring settings updated') })
}

function toggleAutoEmail() {
  const tmpl = template.value
  if (tmpl?.schedule) {
    tmpl.schedule.sendAutoEmail = !tmpl.schedule.sendAutoEmail
    persistRecurringBills()
    toast.notify({ variant: 'success', title: t(tmpl.schedule.sendAutoEmail ? 'Automatic email enabled' : 'Automatic email disabled') })
  }
}

// ── Delete ──
const deleteOpen = ref(false)
function confirmDelete() {
  const idx = recurringBills.findIndex(r => r.id === props.orderId)
  if (idx !== -1) recurringBills.splice(idx, 1)
  persistRecurringBills()
  deleteOpen.value = false
  toast.notify({ variant: 'success', title: t('Recurring expense deleted') })
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
        <MpTextlink id="rbill-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Expenses') }}</MpTextlink>
        <h1 class="detail-title">{{ t('Recurring expense not found') }}</h1>
      </div>
    </header>
  </div>

  <div v-else class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="rbill-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Expenses') }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ template.beneficiary.name }}</h1>
          <ErpStatusBadge :status="template.status" :type="template.status === 'completed' ? 'announcement' : undefined" badge-for="additionalInformation" size="md" />
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Header summary ── -->
      <section class="detail-summary">
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Beneficiary')">{{ template.beneficiary.name }}</ContentList>
            <ContentList :label="t('Category')" :value="template.category" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Next expense')">
              <template v-if="template.status !== 'completed'">{{ formatDateLong(template.nextDate) }}</template>
              <template v-else>—</template>
            </ContentList>
            <ContentList v-if="template.schedule" :label="t('Start date')" :value="formatDateLong(template.schedule.startDate)" />
          </div>
          <div class="content-list-col">
            <ContentList v-if="template.schedule" :label="t('Repeats every')">{{ template.schedule.repeatInterval }} {{ unitLabel(template.schedule.repeatUnit) }}</ContentList>
            <ContentList v-if="template.schedule" :label="t('End repeat')">{{ endRepeatSummary(template) }}</ContentList>
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Frequency')" :value="t(template.frequency)" />
            <ContentList :label="t('Generated')">{{ template.createdCount }}</ContentList>
          </div>
          <div class="detail-primary-total">
            <span class="detail-total-label">{{ t('Total') }}</span>
            <span class="detail-total-amount">{{ formatIDR(template.amount) }}</span>
          </div>
        </div>
      </section>

      <!-- ── Tabs — Recurring history ── -->
      <MpTabs v-if="hasHistory" id="rbill-detail-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="rbill-tab-history" :value="0">{{ t('Recurring history') }}</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <h3 class="detail-tab-heading">{{ t('Transactions') }}</h3>
            <table class="detail-linked">
              <colgroup>
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--number" />
                <col class="detail-linked-col--amount" />
                <col class="detail-linked-col--status" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in template.history" :key="entry.billNumber" class="detail-item-row">
                  <td class="detail-td">{{ formatDateNumeric(entry.date) }}</td>
                  <td class="detail-td">
                    <a class="cell-link cell-text" @click.stop>{{ entry.billNumber }}</a>
                  </td>
                  <td class="detail-td detail-td--num">{{ formatIDR(entry.amount) }}</td>
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
        <PrintShareMenu id="rbill-print" />
        <DetailActionsMenu id="rbill-actions" :groups="actionGroups" />
      </div>
    </div><!-- /detail-stage -->

    <!-- ── Delete confirm ── -->
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete recurring expense?')"
      :description="`${template.templateName} ${t('will be permanently deleted. This cannot be undone.')}`"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />

    <!-- ── Edit recurring settings drawer ── -->
    <ErpDrawer :is-open="recurringDrawerOpen" :title="t('Edit recurring settings')" @close="recurringDrawerOpen = false">
      <template #body>
        <MpFormControl id="rbill-edit-repeat">
          <MpFormLabel>{{ t('Repeats every') }}</MpFormLabel>
          <div class="recur-edit-repeat-row">
            <MpInput id="rbill-edit-interval" v-model.number="editRepeatInterval" type="number" :min="1" class="recur-edit-num" />
            <MpAutocomplete id="rbill-edit-unit" v-model="editRepeatUnit" :data="repeatUnitOptions" label-prop="label" value-prop="value" use-portal is-full-width class="recur-edit-unit" />
          </div>
        </MpFormControl>

        <MpFormControl id="rbill-edit-end">
          <MpFormLabel>{{ t('End repeat') }}</MpFormLabel>
          <MpAutocomplete id="rbill-edit-end-inp" v-model="editEndRepeat" :data="endRepeatOptions" label-prop="label" value-prop="value" use-portal is-full-width />
          <div v-if="editEndRepeat === 'after'" class="recur-edit-sub">
            <MpInput id="rbill-edit-end-count" v-model.number="editEndAfterCount" type="number" :min="1" class="recur-edit-count" />
            <span class="recur-edit-sublabel">{{ t('occurrences') }}</span>
          </div>
          <div v-if="editEndRepeat === 'on'" class="recur-edit-sub">
            <MpDatePicker id="rbill-edit-end-date" v-model="editEndOnDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>

        <MpFormControl id="rbill-edit-start">
          <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
          <MpDatePicker id="rbill-edit-start-date" v-model="editStartDate" format="DD/MM/YYYY" value-type="format" use-portal />
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
.detail-linked-col--amount { width: 200px; }
.detail-linked-col--status { width: 160px; }

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
