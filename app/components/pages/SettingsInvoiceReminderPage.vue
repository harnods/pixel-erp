<!-- prod-parity: jurnal-doctor/services/quickbook/app/views/company/_invoice_reminder.html.haml (+ company/modal_form/_add_interval_invoice_reminder) -->
<script setup lang="ts">
import {
  MpToggle, MpCheckbox, MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, toast,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { customers } from '~/data/customers'
import { salesInvoices } from '~/data/salesInvoices'
import { salesOrders } from '~/data/salesOrders'
import { formatIDR } from '~/utils/currency'
import {
  getInvoiceReminderSettings, saveInvoiceReminderSettings,
  REMINDER_TYPE_OPTIONS, EMAIL_TEMPLATE_PLACEHOLDERS, MAX_REMINDER_INTERVALS,
  DEFAULT_REMINDER_HEADER, DEFAULT_REMINDER_BODY,
  type InvoiceReminderSettings, type ReminderInterval,
} from '~/data/companySettings'

const { t } = useLocale()

const clone = (v: InvoiceReminderSettings): InvoiceReminderSettings => JSON.parse(JSON.stringify(v))
const committed = reactive<InvoiceReminderSettings>(getInvoiceReminderSettings())
const draft = reactive<InvoiceReminderSettings>(clone(committed))

const isEditing = ref(false)
const isSaving = ref(false)
const discardOpen = ref(false)
const hasChanges = computed(() => JSON.stringify(draft) !== JSON.stringify(committed))

const view = computed(() => (isEditing.value ? draft : committed))
const contentDisabled = computed(() => !isEditing.value || !draft.isEnabled)
const sortedIntervals = computed(() => [...view.value.intervals].sort((a, b) => a.days - b.days))
const showInvoiceExclude = computed(() => view.value.reminderType !== 'order')
const showOrderExclude = computed(() => view.value.reminderType !== 'invoice')

function startEdit() { Object.assign(draft, clone(committed)); isEditing.value = true }
function requestCancel() { if (hasChanges.value) discardOpen.value = true; else exitEdit() }
function exitEdit() { Object.assign(draft, clone(committed)); isEditing.value = false; discardOpen.value = false }
async function saveEdit() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 500))
  // An exclusion with nothing picked is off, as the server stores it.
  if (!draft.excludedCustomerIds.length) draft.offCustomer = false
  if (!draft.excludedInvoiceIds.length) draft.offInvoice = false
  if (!draft.excludedOrderIds.length) draft.offOrder = false
  Object.assign(committed, clone(draft))
  saveInvoiceReminderSettings(clone(committed))
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: t('Invoice reminder changes saved'), maxWidth: 'max-content' })
}

function intervalLabel(days: number): string {
  if (days === 0) return t('On the day')
  return `${Math.abs(days)} ${t('days')} ${days > 0 ? t('after') : t('before')}`
}

// ── Interval modal ───────────────────────────────────────────────────────────
const intervalOpen = ref(false)
const intervalEditId = ref<string | null>(null)
const iv = reactive({ days: '3', when: 'before' as 'before' | 'after', header: '', body: '', includePdf: true })
const ivError = ref('')
const bodyEl = ref<HTMLElement | null>(null)
const WHEN_OPTIONS = [{ value: 'before', label: 'Before' }, { value: 'after', label: 'After' }]

function openInterval(ri?: ReminderInterval) {
  intervalEditId.value = ri?.id ?? null
  iv.days = String(ri ? Math.abs(ri.days) : 3)
  iv.when = ri && ri.days > 0 ? 'after' : 'before'
  iv.header = ri?.headerEmail ?? DEFAULT_REMINDER_HEADER
  iv.body = ri?.bodyEmail ?? DEFAULT_REMINDER_BODY
  iv.includePdf = ri?.includePdf ?? true
  ivError.value = ''
  intervalOpen.value = true
}
function insertPlaceholder(p: string) {
  iv.body = `${iv.body}[${p}]`
}
function saveInterval() {
  const n = Number(iv.days)
  if (iv.days === '' || !Number.isInteger(n) || n < 0) { ivError.value = t('Enter a whole number of days, 0 or more'); return }
  const days = iv.when === 'before' ? -n : n
  const clash = draft.intervals.some(r => r.days === days && r.id !== intervalEditId.value)
  if (clash) { ivError.value = t('An interval with this timing already exists'); return }
  const rec: ReminderInterval = { id: intervalEditId.value ?? `ri-${Date.now()}`, days, includePdf: iv.includePdf, headerEmail: iv.header, bodyEmail: iv.body }
  const idx = draft.intervals.findIndex(r => r.id === rec.id)
  if (idx >= 0) draft.intervals.splice(idx, 1, rec)
  else draft.intervals.push(rec)
  intervalOpen.value = false
}
const deleteTarget = ref<ReminderInterval | null>(null)
const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v: boolean) => { if (!v) deleteTarget.value = null } })
function confirmDeleteInterval() {
  if (deleteTarget.value) draft.intervals = draft.intervals.filter(r => r.id !== deleteTarget.value!.id)
  deleteTarget.value = null
}

// ── Exclusion list modal (customers / invoices / orders) ─────────────────────
type ListKind = 'customer' | 'invoice' | 'order'
const listKind = ref<ListKind | null>(null)
const listSearch = ref('')
const listPicked = ref<string[]>([])
const LIST_META: Record<ListKind, { title: string; field: 'excludedCustomerIds' | 'excludedInvoiceIds' | 'excludedOrderIds'; flag: 'offCustomer' | 'offInvoice' | 'offOrder' }> = {
  customer: { title: 'Add customer', field: 'excludedCustomerIds', flag: 'offCustomer' },
  invoice:  { title: 'Add invoice',  field: 'excludedInvoiceIds',  flag: 'offInvoice' },
  order:    { title: 'Add order',    field: 'excludedOrderIds',    flag: 'offOrder' },
}
const listRows = computed(() => {
  if (!listKind.value) return []
  const rows = listKind.value === 'customer'
    ? customers.map(c => ({ id: c.id, primary: c.name, secondary: '' }))
    : listKind.value === 'invoice'
      ? salesInvoices.slice(0, 40).map(s => ({ id: s.id, primary: `${t('Sales invoice')} #${s.number}`, secondary: s.customer.name }))
      : salesOrders.slice(0, 40).map(s => ({ id: s.id, primary: `${t('Sales order')} #${s.number}`, secondary: s.customer.name }))
  const q = listSearch.value.trim().toLowerCase()
  return q ? rows.filter(r => `${r.primary} ${r.secondary}`.toLowerCase().includes(q)) : rows
})
function openList(kind: ListKind) {
  listKind.value = kind
  listSearch.value = ''
  listPicked.value = [...view.value[LIST_META[kind].field]]
}
function togglePick(id: string, on: boolean) {
  listPicked.value = on ? [...listPicked.value, id] : listPicked.value.filter(x => x !== id)
}
function saveList() {
  if (!listKind.value) return
  const meta = LIST_META[listKind.value]
  draft[meta.field] = [...listPicked.value]
  draft[meta.flag] = listPicked.value.length > 0
  listKind.value = null
}
</script>

<template>
  <div class="ws-page">
    <section class="ws-section">
      <div class="ws-section-header">
        <div class="ws-section-meta">
          <h2 class="ws-section-title">{{ t('Invoice reminder') }}</h2>
        </div>
        <button v-if="!isEditing" class="btn-enterprise btn-enterprise--secondary" @click="startEdit">{{ t('Edit') }}</button>
      </div>

      <div class="ws-toggle-list">
        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">{{ t('Send invoice reminder email') }}</span>
          </div>
          <MpToggle id="ir-enabled" v-model:is-checked="draft.isEnabled" :is-disabled="!isEditing" :aria-label="t('Send invoice reminder email')" />
        </div>

        <div class="ir-content" :class="{ 'ir-content--off': !view.isEnabled }">
          <div class="ws-toggle-row ws-toggle-row--rule">
            <div class="ws-toggle-info">
              <span class="ws-toggle-title">{{ t('Sales type') }}</span>
            </div>
            <ErpFilterSelect
              v-if="isEditing"
              id="ir-sales-type"
              v-model="draft.reminderType"
              :placeholder="t('Select sales type')"
              :options="REMINDER_TYPE_OPTIONS.map(o => ({ value: o.value, label: t(o.label) }))"
              :is-clearable="false"
              :is-disabled="contentDisabled"
              width="100%"
            />
            <span v-else class="ws-rule-value">{{ t(REMINDER_TYPE_OPTIONS.find(o => o.value === committed.reminderType)?.label ?? '') }}</span>
          </div>

          <h3 class="ws-subsection-title ws-subsection-title--spaced">{{ t('Interval') }}</h3>
          <div class="ir-timeline">
            <template v-for="(ri, i) in sortedIntervals" :key="ri.id">
              <div class="ir-interval" :class="{ 'ir-interval--due': ri.days === 0 }">
                <span class="ir-interval-label">{{ intervalLabel(ri.days) }}</span>
                <span v-if="ri.days === 0" class="ir-interval-due">{{ t('Due date') }}</span>
                <div v-if="!contentDisabled" class="ir-interval-actions">
                  <button class="btn-enterprise btn-enterprise--plain btn-enterprise--icon ir-icon-btn" :aria-label="t('Edit interval')" @click="openInterval(ri)"><MpIcon name="edit" size="sm" /></button>
                  <button class="btn-enterprise btn-enterprise--plain btn-enterprise--icon ir-icon-btn" :aria-label="t('Delete interval')" @click="deleteTarget = ri"><MpIcon name="delete" size="sm" /></button>
                </div>
              </div>
              <span v-if="i < sortedIntervals.length - 1" class="ir-line" aria-hidden="true" />
            </template>
            <span v-if="!sortedIntervals.length" class="ws-toggle-desc ws-toggle-desc--note">{{ t('No interval yet') }}</span>
          </div>
          <div v-if="!contentDisabled && draft.intervals.length < MAX_REMINDER_INTERVALS" class="ir-add">
            <span class="cell-link" @click="openInterval()">+ {{ t('Add interval') }}</span>
          </div>

          <div v-if="view.intervals.length" class="ir-check-row">
            <MpCheckbox id="ir-send-copy" :is-checked="view.sendCopy" :is-disabled="contentDisabled" @change="(on: boolean) => draft.sendCopy = on">
              {{ t('Send me a copy') }}
            </MpCheckbox>
          </div>

          <h3 class="ws-subsection-title ws-subsection-title--spaced">{{ t('Reminder off for') }}</h3>
          <div class="ir-exclude">
            <div class="ir-check-row">
              <MpCheckbox id="ir-off-amount" :is-checked="view.offAmount" :is-disabled="contentDisabled" @change="(on: boolean) => draft.offAmount = on">
                {{ t('Amount under') }}
              </MpCheckbox>
              <MpInputGroup v-if="isEditing" id="ir-amount-under-group" class="ir-amount">
                <MpInputLeftAddon>Rp</MpInputLeftAddon>
                <MpInput
                  id="ir-amount-under"
                  :model-value="draft.amountUnder"
                  type="number"
                  :is-disabled="contentDisabled || !draft.offAmount"
                  @update:model-value="(v: string | number) => draft.amountUnder = Number(v) || 0"
                />
              </MpInputGroup>
              <span v-else class="ws-rule-value">{{ formatIDR(committed.amountUnder) }}</span>
            </div>
            <div class="ir-check-row">
              <MpCheckbox id="ir-off-customer" :is-checked="view.offCustomer" :is-disabled="contentDisabled" @change="(on: boolean) => draft.offCustomer = on">
                {{ view.excludedCustomerIds.length }} {{ t('Selected customers') }}
              </MpCheckbox>
              <span v-if="isEditing && !contentDisabled" class="cell-link" @click="openList('customer')">{{ t('See/Add list') }}</span>
            </div>
            <div v-if="showInvoiceExclude" class="ir-check-row">
              <MpCheckbox id="ir-off-invoice" :is-checked="view.offInvoice" :is-disabled="contentDisabled" @change="(on: boolean) => draft.offInvoice = on">
                {{ view.excludedInvoiceIds.length }} {{ t('Selected invoices') }}
              </MpCheckbox>
              <span v-if="isEditing && !contentDisabled" class="cell-link" @click="openList('invoice')">{{ t('See/Add list') }}</span>
            </div>
            <div v-if="showOrderExclude" class="ir-check-row">
              <MpCheckbox id="ir-off-order" :is-checked="view.offOrder" :is-disabled="contentDisabled" @change="(on: boolean) => draft.offOrder = on">
                {{ view.excludedOrderIds.length }} {{ t('Selected orders') }}
              </MpCheckbox>
              <span v-if="isEditing && !contentDisabled" class="cell-link" @click="openList('order')">{{ t('See/Add list') }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isEditing" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveEdit">
          {{ isSaving ? t('Saving…') : t('Save changes') }}
        </button>
      </div>
    </section>

    <!-- ── Add / edit interval ── -->
    <Teleport to="body">
      <Transition name="cem">
        <div v-if="intervalOpen" class="cem-overlay">
          <div class="cem-panel cem-panel--wide" role="dialog" aria-modal="true" :aria-label="t('Invoice reminder')">
            <p class="cem-title">{{ intervalEditId ? t('Edit interval') : t('Add interval') }}</p>
            <MpFormControl id="ir-iv-days-ctl" :is-invalid="!!ivError" class="cem-form">
              <MpFormLabel>{{ t('Send reminder') }}</MpFormLabel>
              <div class="ir-iv-row">
                <MpInput id="ir-iv-days" v-model="iv.days" type="number" class="ir-iv-days" :is-invalid="!!ivError" />
                <span class="ir-iv-text">{{ t('days') }}</span>
                <ErpFilterSelect id="ir-iv-when" v-model="iv.when" :placeholder="t('Before')" :options="WHEN_OPTIONS.map(o => ({ value: o.value, label: t(o.label) }))" :is-clearable="false" width="140px" />
                <span class="ir-iv-text">{{ t('invoice due date') }}</span>
              </div>
              <MpFormErrorMessage v-if="ivError">{{ ivError }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="ir-iv-header-ctl" class="cem-form">
              <div class="ir-iv-labelrow">
                <MpFormLabel>{{ t('Email template') }}</MpFormLabel>
                <span class="ir-iv-note">*{{ t('Use [placeholder] as part of email content') }}</span>
              </div>
              <MpInput id="ir-iv-header" v-model="iv.header" is-full-width :aria-label="t('Email subject')" />
            </MpFormControl>
            <div ref="bodyEl" class="cem-form">
              <MpTextarea id="ir-iv-body" v-model="iv.body" is-full-width :aria-label="t('Email body')" class="ir-iv-body" />
            </div>
            <div class="cem-form">
              <MpCheckbox id="ir-iv-pdf" :is-checked="iv.includePdf" @change="(on: boolean) => iv.includePdf = on">
                {{ t('Include invoice PDF as email attachment') }}
              </MpCheckbox>
            </div>
            <div class="ir-placeholders">
              <button v-for="p in EMAIL_TEMPLATE_PLACEHOLDERS" :key="p" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="insertPlaceholder(p)">[{{ p }}]</button>
            </div>
            <div class="cem-footer">
              <button class="btn-enterprise btn-enterprise--ghost" @click="intervalOpen = false">{{ t('Back') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" @click="saveInterval">{{ t('Save') }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Exclusion list (customers / invoices / orders) ── -->
    <Teleport to="body">
      <Transition name="cem">
        <div v-if="listKind" class="cem-overlay">
          <div class="cem-panel cem-panel--wide" role="dialog" aria-modal="true" :aria-label="t(LIST_META[listKind].title)">
            <p class="cem-title">{{ t(LIST_META[listKind].title) }}</p>
            <div class="filter-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input v-model="listSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            </div>
            <div class="ir-list">
              <div v-for="r in listRows" :key="r.id" class="ir-list-row">
                <MpCheckbox :id="`ir-pick-${r.id}`" :is-checked="listPicked.includes(r.id)" @change="(on: boolean) => togglePick(r.id, on)">
                  <span class="ir-list-primary">{{ r.primary }}</span>
                  <span v-if="r.secondary" class="ir-list-secondary">{{ r.secondary }}</span>
                </MpCheckbox>
              </div>
              <p v-if="!listRows.length" class="ws-toggle-desc ws-toggle-desc--note">{{ t('No results found') }}</p>
            </div>
            <div class="cem-footer">
              <span class="ir-picked">{{ listPicked.length }} {{ t('selected') }}</span>
              <button class="btn-enterprise btn-enterprise--ghost" @click="listKind = null">{{ t('Back') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" @click="saveList">{{ t('Save') }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete interval?')"
      :description="t('Deleted interval cannot be restored.')"
      :confirm-label="t('Delete')"
      @confirm="confirmDeleteInterval"
    />
    <ConfirmModal
      v-model:is-open="discardOpen"
      :title="t('Discard unsaved changes?')"
      :description="t('Your changes will not be saved.')"
      :confirm-label="t('Discard')"
      :cancel-label="t('Keep editing')"
      @confirm="exitEdit"
    />
  </div>
</template>

<style scoped>
.ws-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-6);
}
.ws-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}
.ws-section-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
  margin-bottom: var(--mp-spacing-3);
}
.ws-section-meta { grid-column: 1 / 7; display: flex; flex-direction: column; }
.ws-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-section-header > button { grid-column: 7 / -1; justify-self: start; }
.ws-toggle-list { grid-column: 1 / 7; display: flex; flex-direction: column; }
.ws-subsection-title {
  margin: 0;
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-subsection-title--spaced { margin-top: var(--mp-spacing-3); }
.ws-rule-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ws-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
}
.ws-toggle-row--rule {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: var(--mp-spacing-6);
  align-items: center;
}
.ws-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.ws-toggle-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-toggle-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ws-toggle-desc--note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.ws-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}
.ws-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }

.ir-content { display: flex; flex-direction: column; }
.ir-content--off { opacity: 0.5; }

.ir-timeline {
  /* Up to 5 intervals on one line, as on the server form — may run past the
     6-column field area into the empty right half of the stage. */
  display: flex;
  align-items: center;
  width: max-content;
  padding: var(--mp-spacing-2) 0;
}
.ir-interval {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-0\.5);
  min-width: var(--mp-sizes-28, 112px);
  padding: var(--mp-spacing-3) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-stage);
}
.ir-interval--due { border-color: var(--mp-text-danger); }
.ir-interval-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ir-interval-due { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.ir-interval-actions { display: flex; gap: var(--mp-spacing-1); }
.ir-icon-btn { width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); }
.ir-line { width: var(--mp-spacing-6); height: 1px; background: var(--mp-border-default); }
.ir-add { padding: var(--mp-spacing-1) 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); }

.ir-exclude { display: flex; flex-direction: column; }
.ir-check-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  min-height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1) 0;
  font-size: var(--mp-font-sizes-md);
}
.ir-amount { width: var(--mp-sizes-56, 224px); }

/* Modal shell — same Teleport overlay as CouriersPage / ConfirmModal. */
.cem-enter-active, .cem-leave-active { transition: opacity 200ms ease; }
.cem-enter-from, .cem-leave-to { opacity: 0; }
.cem-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay);
  display: flex; align-items: center; justify-content: center;
}
.cem-panel {
  width: min(440px, calc(100% - 32px));
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-lg);
  padding: var(--mp-spacing-5) var(--mp-spacing-5) var(--mp-spacing-4);
}
.cem-panel--wide { width: min(640px, calc(100% - 32px)); }
.cem-title {
  margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cem-form { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.cem-footer {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-5);
}

.ir-iv-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ir-iv-days { width: var(--mp-sizes-20, 80px); }
.ir-iv-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.ir-iv-labelrow { display: flex; justify-content: space-between; align-items: baseline; gap: var(--mp-spacing-2); }
.ir-iv-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.ir-iv-body :deep(textarea) { min-height: var(--mp-sizes-48, 192px); }
.ir-placeholders { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full);
  color: var(--mp-text-subtle);
  margin-bottom: var(--mp-spacing-3);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.ir-list { max-height: var(--mp-sizes-80, 320px); overflow-y: auto; display: flex; flex-direction: column; }
.ir-list-row { padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); }
.ir-list-primary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ir-list-secondary { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.ir-picked { margin-right: auto; font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
</style>
