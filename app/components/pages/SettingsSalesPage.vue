<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpToggle, MpIcon, MpTextarea, MpAutocomplete, MpInput, MpCheckbox,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpFormControl, MpFormLabel, MpTooltip,
  css,
  toast,
} from '@mekari/pixel3'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import { crmCustomers } from '~/data/crm'
import { salesInvoices } from '~/data/salesInvoices'

const { t } = useLocale()

// ─── General settings state ─────────────────────────────────────────────────
const general = reactive({
  defaultPaymentTerms: 'Net 30',
  shippingInfo: true,
  globalDiscount: true,
  lineItemDiscount: true,
  discountAccountPerProduct: true,
  depositDownPayment: true,
  preventNegativeStockSales: true,
  showProfitMarginInternal: true,
  usePriceRules: true,
  defaultMessage: '',
  defaultDeliverySlipMessage: '',
})

// ─── Sales invoice reminders state ──────────────────────────────────────────
interface ReminderRule {
  id: number
  days: number
  timing: string
  subject: string
  body: string
  attachPdf: boolean
  sendCopy: boolean
}

let nextRuleId = 1
const reminders = reactive({
  sendInvoiceReminderEmail: false,
  rules: [] as ReminderRule[],
  applyToSalesInvoices: true,
  applyToSalesOrders: false,
  excludeTransactionAmountUnder: false,
  transactionAmountThreshold: '50.000.000,00',
  excludeSpecificCustomers: false,
  excludedCustomerIds: [] as string[],
  excludeInvoices: false,
  excludedInvoiceIds: [] as string[],
  excludeOrders: false,
})

/**
 * An excluded-items list stays at most VISIBLE_ROWS tall; past that it becomes
 * its own scroll box that pulls the next PAGE_SIZE in as you reach the bottom,
 * so a long exclusion list never pushes the rest of the settings off screen.
 * Same observer-on-a-sentinel approach as ViewSerialDrawer.
 */
const EXCLUDE_VISIBLE_ROWS = 5
const EXCLUDE_PAGE_SIZE = 10

function useCappedList(source: () => string[]) {
  const shown = ref(EXCLUDE_PAGE_SIZE)
  const loadingMore = ref(false)
  const boxEl = ref<HTMLElement | null>(null)
  const sentinelEl = ref<HTMLElement | null>(null)
  let observer: IntersectionObserver | null = null

  const total = computed(() => source().length)
  const isScrollable = computed(() => total.value > EXCLUDE_VISIBLE_ROWS)
  const visible = computed(() => source().slice(0, shown.value))
  const hasMore = computed(() => shown.value < total.value)

  function loadMore() {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    setTimeout(() => {
      shown.value = Math.min(shown.value + EXCLUDE_PAGE_SIZE, total.value)
      loadingMore.value = false
      // The sentinel sits at the bottom of the box and often stays intersecting
      // after a page loads; IntersectionObserver only reports transitions, so
      // without re-arming here the second page never requests a third.
      nextTick(setupObserver)
    }, 300)
  }

  function setupObserver() {
    observer?.disconnect()
    if (!boxEl.value || !sentinelEl.value) return
    observer = new IntersectionObserver(
      entries => { if (entries[0]!.isIntersecting) loadMore() },
      { root: boxEl.value, rootMargin: '0px 0px 80px 0px' },
    )
    observer.observe(sentinelEl.value)
  }

  // Re-arm whenever the list appears or its length changes (add/remove).
  watch(total, () => {
    if (shown.value > total.value) shown.value = Math.max(EXCLUDE_PAGE_SIZE, total.value)
    nextTick(setupObserver)
  })
  watch(isScrollable, () => nextTick(setupObserver))
  onMounted(() => nextTick(setupObserver))
  onUnmounted(() => observer?.disconnect())

  return { shown, loadingMore, boxEl, sentinelEl, total, isScrollable, visible, hasMore, setupObserver }
}

const {
  boxEl: custBoxEl, sentinelEl: custSentinelEl, loadingMore: custLoadingMore,
  total: custTotal, isScrollable: custScrollable, visible: custVisible,
} = useCappedList(() => reminders.excludedCustomerIds)
const {
  boxEl: invBoxEl, sentinelEl: invSentinelEl, loadingMore: invLoadingMore,
  total: invTotal, isScrollable: invScrollable, visible: invVisible,
} = useCappedList(() => reminders.excludedInvoiceIds)

const customerPickerOpen = ref(false)
const customerOptions = computed(() =>
  crmCustomers.map(c => ({ id: c.id, name: c.company, subtitle: c.contact })),
)
function onCustomerPickerSave(ids: string[]) {
  reminders.excludedCustomerIds = ids
  customerPickerOpen.value = false
}
function removeExcludedCustomer(cid: string) {
  reminders.excludedCustomerIds = reminders.excludedCustomerIds.filter(id => id !== cid)
}
function toggleExcludeCustomers() {
  reminders.excludeSpecificCustomers = !reminders.excludeSpecificCustomers
  if (!reminders.excludeSpecificCustomers) reminders.excludedCustomerIds = []
}
function toggleApplyInvoices() {
  reminders.applyToSalesInvoices = !reminders.applyToSalesInvoices
  if (!reminders.applyToSalesInvoices) { reminders.excludeInvoices = false; reminders.excludedInvoiceIds = [] }
}
function toggleExcludeInvoices() {
  reminders.excludeInvoices = !reminders.excludeInvoices
  if (!reminders.excludeInvoices) reminders.excludedInvoiceIds = []
}
const invoicePickerOpen = ref(false)
const invoiceOptions = computed(() =>
  salesInvoices.map(i => ({ id: i.id, name: `${t('Sales Invoice')} #${i.number}`, subtitle: i.customer.name })),
)
function onInvoicePickerSave(ids: string[]) {
  reminders.excludedInvoiceIds = ids
  invoicePickerOpen.value = false
}
function removeExcludedInvoice(iid: string) {
  reminders.excludedInvoiceIds = reminders.excludedInvoiceIds.filter(id => id !== iid)
}
function invoiceLabelOf(iid: string) {
  const inv = salesInvoices.find(i => i.id === iid)
  return inv ? `${t('Sales Invoice')} #${inv.number}` : iid
}
function toggleApplyOrders() {
  reminders.applyToSalesOrders = !reminders.applyToSalesOrders
  if (!reminders.applyToSalesOrders) reminders.excludeOrders = false
}

const reminderRuleSummary = computed(() => {
  if (reminders.rules.length === 0) return t('No reminder rule yet')
  return reminders.rules.map(r => `${r.days} days ${r.timing.toLowerCase()} the due date`).join(', ')
})

// ─── Reminder modal state ───────────────────────────────────────────────────
const TIMING_OPTIONS = [
  { id: 'Before', name: 'Before' },
  { id: 'After', name: 'After' },
]

const PLACEHOLDER_OPTIONS = [
  { label: 'Amount Due', value: '[AmountDue]' },
  { label: 'Contact Name', value: '[NamaPelanggan]' },
  { label: 'Company Name', value: '[NamaPerusahaan]' },
  { label: 'Due Date', value: '[TanggalJatuhTempo]' },
  { label: 'Transaction Number', value: '[NomorTransaksi]' },
  { label: 'Total', value: '[Total]' },
  { label: 'Month Year', value: '[BulanTahun]' },
  { label: 'Month', value: '[Bulan]' },
  { label: 'Link', value: '[Link]' },
  { label: 'Year', value: '[Tahun]' },
]

const DEFAULT_SUBJECT = '[SalesTransactionType] #[NomorTransaksi] from [NamaPerusahaan] is due on [TanggalJatuhTempo]'
const DEFAULT_BODY = `Dear [NamaPelanggan],

We would like to kindly remind you that your invoice due on [TanggalJatuhTempo] is still outstanding. Please make your payment as soon as possible.

If you have paid for the invoice, please ignore this email. If you have any question please contact us at [EmailPerusahaan].

Regards
[NamaPerusahaan]`

const reminderModalOpen = ref(false)
const editingRuleId = ref<number | null>(null)
const modalForm = reactive({
  days: 7,
  timing: 'Before',
  subject: DEFAULT_SUBJECT,
  body: DEFAULT_BODY,
  attachPdf: false,
  sendCopy: false,
})

function openAddReminderModal() {
  editingRuleId.value = null
  modalForm.days = 7
  modalForm.timing = 'Before'
  modalForm.subject = DEFAULT_SUBJECT
  modalForm.body = DEFAULT_BODY
  modalForm.attachPdf = false
  modalForm.sendCopy = false
  reminderModalOpen.value = true
}

function openEditReminderModal(rule: ReminderRule) {
  editingRuleId.value = rule.id
  modalForm.days = rule.days
  modalForm.timing = rule.timing
  modalForm.subject = rule.subject
  modalForm.body = rule.body
  modalForm.attachPdf = rule.attachPdf
  modalForm.sendCopy = rule.sendCopy
  reminderModalOpen.value = true
}

function saveReminderRule() {
  if (editingRuleId.value != null) {
    const idx = reminders.rules.findIndex(r => r.id === editingRuleId.value)
    if (idx >= 0) {
      reminders.rules[idx] = {
        id: editingRuleId.value,
        days: modalForm.days,
        timing: modalForm.timing,
        subject: modalForm.subject,
        body: modalForm.body,
        attachPdf: modalForm.attachPdf,
        sendCopy: modalForm.sendCopy,
      }
    }
  } else {
    reminders.rules.push({
      id: nextRuleId++,
      days: modalForm.days,
      timing: modalForm.timing,
      subject: modalForm.subject,
      body: modalForm.body,
      attachPdf: modalForm.attachPdf,
      sendCopy: modalForm.sendCopy,
    })
  }
  reminderModalOpen.value = false
}

function deleteReminderRule(id: number) {
  const idx = reminders.rules.findIndex(r => r.id === id)
  if (idx >= 0) reminders.rules.splice(idx, 1)
}

function insertPlaceholder(value: string) {
  modalForm.body += value
}

// ─── Email templates ────────────────────────────────────────────────────────
interface TemplateItem {
  label: string
  type: 'email' | 'whatsapp'
  subject: string
  body: string
  sendCopy: boolean
}

const emailTemplates = reactive<TemplateItem[]>([
  { label: 'Sales quote', type: 'email', subject: 'Sales Quote [TransactionNumber] from [CompanyName]', body: 'Hi [CustomerName],\n\nPlease find attached the sales quote [TransactionNumber] for [TotalAmount].\n\nIf you have any questions, please let us know.\n\nThanks,\n[CompanyName]', sendCopy: false },
  { label: 'Sales order', type: 'email', subject: 'Sales Order [TransactionNumber] from [CompanyName]', body: 'Hi [CustomerName],\n\nPlease find attached the sales order [TransactionNumber] for [TotalAmount].\n\nIf you have any questions, please let us know.\n\nThanks,\n[CompanyName]', sendCopy: false },
  { label: 'Sales invoice', type: 'email', subject: 'Sales Invoice [TransactionNumber] from [CompanyName]', body: 'Hi [CustomerName],\nHere\'s invoice [TransactionNumber] for [TotalAmount].\nA payment of [AmountDue] is due on [DueDate].\nIf you have any questions, please let us know.\nThanks, [CompanyName]', sendCopy: false },
  { label: 'Delivery note', type: 'email', subject: 'Delivery Note [TransactionNumber] from [CompanyName]', body: 'Hi [CustomerName],\n\nPlease find attached the delivery note [TransactionNumber].\n\nIf you have any questions, please let us know.\n\nThanks,\n[CompanyName]', sendCopy: false },
  { label: 'Receipt', type: 'email', subject: 'Receipt [TransactionNumber] from [CompanyName]', body: 'Hi [CustomerName],\n\nPlease find attached the receipt [TransactionNumber] for [TotalAmount].\n\nThank you for your payment.\n\nThanks,\n[CompanyName]', sendCopy: false },
])

// ─── WhatsApp message templates ─────────────────────────────────────────────
const whatsappTemplates = reactive<TemplateItem[]>([
  { label: 'Sales invoice', type: 'whatsapp', subject: '', body: 'Hi [CustomerName], thank you for doing business with us. Here\'s invoice [TransactionNumber] for [AmountDue], due on [DueDate]. View your invoice here: [Link]\nPowered by Mekari ERP', sendCopy: false },
  { label: 'Sales order', type: 'whatsapp', subject: '', body: 'Hi [CustomerName], thank you for doing business with us. Here\'s sales order [TransactionNumber] for [TotalAmount]. View your order here: [Link]\nPowered by Mekari ERP', sendCopy: false },
])

// ─── Template edit modal ───────────────────────────────────────────────────
const templateModalOpen = ref(false)
const editingTemplate = ref<TemplateItem | null>(null)
const templateModalForm = reactive({
  subject: '',
  body: '',
  sendCopy: false,
})

function openTemplateModal(tmpl: TemplateItem) {
  editingTemplate.value = tmpl
  templateModalForm.subject = tmpl.subject
  templateModalForm.body = tmpl.body
  templateModalForm.sendCopy = tmpl.sendCopy
  templateModalOpen.value = true
}

function saveTemplate() {
  if (editingTemplate.value) {
    editingTemplate.value.subject = templateModalForm.subject
    editingTemplate.value.body = templateModalForm.body
    editingTemplate.value.sendCopy = templateModalForm.sendCopy
  }
  templateModalOpen.value = false
  toast.notify({ variant: 'success', title: t('Template saved'), maxWidth: 'max-content' })
}

function insertTemplatePlaceholder(value: string) {
  templateModalForm.body += value
}

// ─── General settings toggle definitions ────────────────────────────────────
const GENERAL_TOGGLES = [
  { key: 'shippingInfo', title: t('Shipping info'), desc: t('Add shipping address and tracking number to sales transactions.') },
  { key: 'globalDiscount', title: t('Global discount'), desc: t('Enable a total discount on the order subtotal.') },
  { key: 'lineItemDiscount', title: t('Line item discount'), desc: t('Enable discounts on individual line items.') },
  { key: 'discountAccountPerProduct', title: t('Discount account per product'), desc: t('Enable discount account on each product.') },
  { key: 'depositDownPayment', title: t('Deposit (Down payment)'), desc: t('Enable deposit recording on sales orders.') },
  { key: 'preventNegativeStockSales', title: t('Prevent negative stock sales'), desc: t('Block transactions if there is not enough inventory.') },
  { key: 'showProfitMarginInternal', title: t('Show profit margin (Internal)'), desc: t('Only visible to admins. Not shown on printed documents.') },
  { key: 'usePriceRules', title: t('Use price rules'), desc: t('Automatically apply pricing rules to sales transactions.') },
] as const

// ─── Popover state for template kebab menus ─────────────────────────────────
const isEditing = reactive<Record<string, boolean>>({
  general: false,
  reminders: false,
})

const PAYMENT_TERM_OPTIONS = [
  { id: 'Net 30', name: 'Net 30' },
  { id: 'Net 14', name: 'Net 14' },
  { id: 'Net 45', name: 'Net 45' },
  { id: 'Cash on delivery', name: 'Cash on delivery' },
]

const openMenuId = ref<string | null>(null)
</script>

<template>
  <div class="ss-page" data-devchange="settings-sales-page">

    <!-- ── General settings ──────────────────────────────────────────────── -->
    <section class="ss-section" :class="{ 'ss-section--hoverable': !isEditing.general }">
      <div class="ss-section-header ss-section-header--with-action">
        <div class="ss-section-meta">
          <h2 class="ss-section-title">{{ isEditing.general ? t('Edit general settings') : t('General settings') }}</h2>
          <p class="ss-section-desc">{{ t('Enable or disable features for your sales transactions.') }}</p>
        </div>
        <MpButton
          v-if="!isEditing.general"
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before ss-edit-btn"
          left-icon="edit"
          @click="isEditing.general = true"
        >
          {{ t('Edit') }}
        </MpButton>
      </div>

      <div class="ss-content">
        <div class="ss-row" :class="{ 'ss-row--stacked': isEditing.general }">
          <div class="ss-row-info">
            <span class="ss-row-title">{{ t('Default payment terms') }}</span>
            <span v-if="!isEditing.general" class="ss-row-desc">{{ t('Set the default due date for new sales invoices.') }}</span>
          </div>
          <div v-if="isEditing.general" class="ss-payment-select">
            <MpAutocomplete
              id="ss-payment-terms-ac"
              v-model="general.defaultPaymentTerms"
              :data="PAYMENT_TERM_OPTIONS"
              label-prop="name"
              value-prop="id"
              use-portal
            />
          </div>
          <span v-else class="ss-row-value">{{ general.defaultPaymentTerms }}</span>
        </div>

        <div v-for="toggle in GENERAL_TOGGLES" :key="toggle.key" class="ss-row">
          <div class="ss-row-info">
            <span class="ss-row-title">{{ toggle.title }}</span>
            <span class="ss-row-desc">{{ toggle.desc }}</span>
          </div>
          <MpToggle
            :is-checked="(general as Record<string, unknown>)[toggle.key] as boolean"
            :is-disabled="!isEditing.general"
            :aria-label="toggle.title"
            @update:is-checked="(v: boolean) => { (general as Record<string, unknown>)[toggle.key] = v }"
          />
        </div>

        <div class="ss-row ss-row--stacked">
          <div class="ss-row-info">
            <span class="ss-row-title">{{ t('Default message') }}</span>
            <span v-if="!isEditing.general" class="ss-row-desc">{{ t('Set standard notes for your sales documents.') }}</span>
          </div>
          <template v-if="isEditing.general">
            <MpTextarea
              v-model="general.defaultMessage"
              is-full-width
              :rows="3"
              :maxlength="600"
              :placeholder="t('Enter default message')"
            />
            <span class="ss-counter">{{ general.defaultMessage.length }} / 600</span>
          </template>
          <span v-else class="ss-row-value">{{ general.defaultMessage || '—' }}</span>
        </div>

        <div class="ss-row ss-row--stacked">
          <div class="ss-row-info">
            <span class="ss-row-title">{{ t('Default delivery slip message') }}</span>
            <span v-if="!isEditing.general" class="ss-row-desc">{{ t('Set standard notes for delivery slips.') }}</span>
          </div>
          <template v-if="isEditing.general">
            <MpTextarea
              v-model="general.defaultDeliverySlipMessage"
              is-full-width
              :rows="3"
              :maxlength="600"
              :placeholder="t('Enter default delivery slip message')"
            />
            <span class="ss-counter">{{ general.defaultDeliverySlipMessage.length }} / 600</span>
          </template>
          <span v-else class="ss-row-value">{{ general.defaultDeliverySlipMessage || '—' }}</span>
        </div>
      </div>

      <div v-if="isEditing.general" class="ss-action-bar">
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="isEditing.general = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="isEditing.general = false; toast.notify({ variant: 'success', title: t('General settings changes saved'), maxWidth: 'max-content' })">{{ t('Save changes') }}</MpButton>
      </div>
    </section>

    <div class="ss-divider" />

    <!-- ── Sales invoice reminders ───────────────────────────────────────── -->
    <section class="ss-section" :class="{ 'ss-section--hoverable': !isEditing.reminders }">
      <div class="ss-section-header ss-section-header--with-action">
        <div class="ss-section-meta">
          <h2 class="ss-section-title">{{ isEditing.reminders ? t('Edit sales invoice reminders') : t('Sales invoice reminders') }}</h2>
          <p class="ss-section-desc">{{ t('Automatically send email reminders to customers for overdue invoices.') }}</p>
        </div>
        <MpButton
          v-if="!isEditing.reminders"
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before ss-edit-btn"
          left-icon="edit"
          @click="isEditing.reminders = true"
        >
          {{ t('Edit') }}
        </MpButton>
      </div>

      <div class="ss-content">
        <!-- Send invoice reminder email toggle -->
        <div class="ss-row">
          <div class="ss-row-info">
            <span class="ss-row-title">{{ t('Send invoice reminder email') }}</span>
            <span class="ss-row-desc">{{ t('Enable automated email notifications.') }}</span>
          </div>
          <MpToggle
            :is-checked="reminders.sendInvoiceReminderEmail"
            :is-disabled="!isEditing.reminders"
            :aria-label="t('Send invoice reminder email')"
            @update:is-checked="(v: boolean) => { reminders.sendInvoiceReminderEmail = v }"
          />
        </div>

        <!-- Reminder rule — read-only or edit mode -->
        <div class="ss-row ss-row--stacked">
          <div class="ss-row-info">
            <span class="ss-row-title">{{ t('Reminder rule') }}</span>
            <span class="ss-row-desc">{{ t('Set the timing schedule for email notifications.') }}</span>
          </div>

          <template v-if="isEditing.reminders && reminders.sendInvoiceReminderEmail">
            <!-- Saved reminder rules list -->
            <div v-if="reminders.rules.length > 0" class="ss-reminder-list">
              <span class="ss-reminder-list-label">{{ t('Send reminder:') }}</span>
              <div v-for="rule in reminders.rules" :key="rule.id" class="ss-reminder-item">
                <MpCheckbox :id="`ss-rule-${rule.id}`" :is-checked="true" :aria-label="`${rule.days} days ${rule.timing.toLowerCase()} the due date`" />
                <span class="ss-reminder-item-text">{{ rule.days }} {{ t('days') }} {{ rule.timing.toLowerCase() }} {{ t('the due date') }}</span>
                <MpPopover :id="`ss-rule-menu-${rule.id}`" is-close-on-select use-portal placement="bottom-end">
                  <MpPopoverTrigger>
                    <MpButton variant="ghost" size="sm" left-icon="menu-kebab" :aria-label="t('More actions')" />
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '140px' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="openEditReminderModal(rule)">{{ t('Edit') }}</MpPopoverListItem>
                      <MpPopoverListItem @click="deleteReminderRule(rule.id)">{{ t('Delete') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </div>
            </div>
            <MpButton
              variant="secondary"
              class="btn-enterprise btn-enterprise--secondary ss-add-rule-btn"
              @click="openAddReminderModal"
            >
              {{ t('Add reminder rule') }}
            </MpButton>
          </template>
          <span v-else class="ss-row-value">{{ reminderRuleSummary }}</span>
        </div>

        <!-- Apply to + Exclude from reminders — only in edit mode with toggle on and rules exist -->
        <template v-if="isEditing.reminders && reminders.sendInvoiceReminderEmail && reminders.rules.length > 0">
          <!-- Apply to -->
          <div class="ss-row ss-row--stacked">
            <div class="ss-row-info">
              <span class="ss-row-title">{{ t('Apply to') }}</span>
              <span class="ss-row-desc">{{ t('Select the transaction types that will trigger these automated reminders.') }}</span>
            </div>
            <div class="ss-checkbox-group">
              <label class="ss-checkbox-row">
                <MpCheckbox id="ss-apply-invoices" :is-checked="reminders.applyToSalesInvoices" @change="toggleApplyInvoices" />
                <span>{{ t('Sales Invoices') }}</span>
              </label>
              <label class="ss-checkbox-row">
                <MpCheckbox id="ss-apply-orders" :is-checked="reminders.applyToSalesOrders" @change="toggleApplyOrders" />
                <span>{{ t('Sales Orders') }}</span>
              </label>
            </div>
          </div>

          <!-- Exclude from reminders -->
          <div class="ss-row ss-row--stacked">
            <div class="ss-row-info">
              <span class="ss-row-title">{{ t('Exclude from reminders') }}</span>
              <span class="ss-row-desc">{{ t('Define conditions where auto-reminders should not be sent.') }}</span>
            </div>
            <div class="ss-exclude-group">
              <!-- Transaction amount under -->
              <div class="ss-exclude-item">
                <label class="ss-checkbox-row">
                  <MpCheckbox id="ss-excl-amount" :is-checked="reminders.excludeTransactionAmountUnder" @change="reminders.excludeTransactionAmountUnder = !reminders.excludeTransactionAmountUnder" />
                  <span>{{ t('Transaction amount under') }}</span>
                </label>
                <div v-if="reminders.excludeTransactionAmountUnder" class="ss-exclude-sub">
                  <div class="ss-currency-input">
                    <span class="ss-currency-prefix">Rp</span>
                    <MpInput id="ss-excl-amount-val" v-model="reminders.transactionAmountThreshold" is-full-width />
                  </div>
                </div>
              </div>

              <!-- Exclude specific customers -->
              <div class="ss-exclude-item">
                <label class="ss-checkbox-row">
                  <MpCheckbox id="ss-excl-customers" :is-checked="reminders.excludeSpecificCustomers" @change="toggleExcludeCustomers" />
                  <span>{{ t('Exclude specific customers') }}</span>
                </label>
                <div v-if="reminders.excludeSpecificCustomers" class="ss-exclude-sub">
                  <div
                    v-if="custTotal > 0"
                    ref="custBoxEl"
                    class="ss-excluded-box"
                    :class="{ 'ss-excluded-box--scroll': custScrollable }"
                  >
                    <ul class="ss-excluded-list">
                      <li v-for="cid in custVisible" :key="cid" class="ss-excluded-list-item">
                        <span class="ss-excluded-list-name">{{ crmCustomers.find(c => c.id === cid)?.company ?? cid }}</span>
                        <MpTooltip :label="t('Remove')">
                          <MpButton variant="ghost" size="sm" left-icon="minus-circular" :aria-label="t('Remove')" @click="removeExcludedCustomer(cid)" />
                        </MpTooltip>
                      </li>
                    </ul>
                    <div ref="custSentinelEl" aria-hidden="true" class="ss-excluded-sentinel" />
                    <p v-if="custLoadingMore" class="ss-excluded-loading">{{ t('Loading…') }}</p>
                  </div>
                  <p v-if="custScrollable" class="ss-excluded-count">
                    {{ t('Showing') }} {{ custVisible.length }} {{ t('of') }} {{ custTotal }} {{ t('customers') }}
                  </p>
                  <MpButton variant="secondary" class="btn-enterprise btn-enterprise--secondary" size="sm" @click="customerPickerOpen = true">{{ t('Add customer') }}</MpButton>
                </div>
              </div>

              <!-- Exclude invoices — only shown when Apply to Sales Invoices is checked -->
              <div v-if="reminders.applyToSalesInvoices" class="ss-exclude-item">
                <label class="ss-checkbox-row">
                  <MpCheckbox id="ss-excl-invoices" :is-checked="reminders.excludeInvoices" @change="toggleExcludeInvoices" />
                  <span>{{ t('Exclude invoices') }}</span>
                </label>
                <div v-if="reminders.excludeInvoices" class="ss-exclude-sub">
                  <div
                    v-if="invTotal > 0"
                    ref="invBoxEl"
                    class="ss-excluded-box"
                    :class="{ 'ss-excluded-box--scroll': invScrollable }"
                  >
                    <ul class="ss-excluded-list">
                      <li v-for="iid in invVisible" :key="iid" class="ss-excluded-list-item">
                        <span class="ss-excluded-list-name">{{ invoiceLabelOf(iid) }}</span>
                        <MpTooltip :label="t('Remove')">
                          <MpButton variant="ghost" size="sm" left-icon="minus-circular" :aria-label="t('Remove')" @click="removeExcludedInvoice(iid)" />
                        </MpTooltip>
                      </li>
                    </ul>
                    <div ref="invSentinelEl" aria-hidden="true" class="ss-excluded-sentinel" />
                    <p v-if="invLoadingMore" class="ss-excluded-loading">{{ t('Loading…') }}</p>
                  </div>
                  <p v-if="invScrollable" class="ss-excluded-count">
                    {{ t('Showing') }} {{ invVisible.length }} {{ t('of') }} {{ invTotal }} {{ t('invoices') }}
                  </p>
                  <MpButton variant="secondary" class="btn-enterprise btn-enterprise--secondary" size="sm" @click="invoicePickerOpen = true">{{ t('Add invoice') }}</MpButton>
                </div>
              </div>

              <!-- Exclude orders — only shown when Apply to Sales Orders is checked -->
              <div v-if="reminders.applyToSalesOrders" class="ss-exclude-item">
                <label class="ss-checkbox-row">
                  <MpCheckbox id="ss-excl-orders" :is-checked="reminders.excludeOrders" @change="reminders.excludeOrders = !reminders.excludeOrders" />
                  <span>{{ t('Exclude orders') }}</span>
                </label>
                <div v-if="reminders.excludeOrders" class="ss-exclude-sub">
                  <MpButton variant="secondary" class="btn-enterprise btn-enterprise--secondary" size="sm">{{ t('Add orders') }}</MpButton>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="isEditing.reminders" class="ss-action-bar">
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="isEditing.reminders = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="isEditing.reminders = false; toast.notify({ variant: 'success', title: t('Sales invoice reminders changes saved'), maxWidth: 'max-content' })">{{ t('Save changes') }}</MpButton>
      </div>
    </section>

    <!-- ── Setup email reminder modal ─────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="ss-modal-fade">
        <div v-if="reminderModalOpen" class="ss-modal-scrim">
          <div class="ss-modal" role="dialog" :aria-label="t('Setup email reminder')" @click.stop>
            <header class="ss-modal-header">
              <h2 class="ss-modal-title">{{ t('Setup email reminder') }}</h2>
              <MpButton variant="ghost" size="sm" left-icon="close" :aria-label="t('Close')" @click="reminderModalOpen = false" />
            </header>

            <div class="ss-modal-body">
              <!-- Reminder rules -->
              <h3 class="ss-modal-section-title">{{ t('Reminder rules') }}</h3>
              <span class="ss-modal-field-label">{{ t('Send this reminder:') }}</span>
              <div class="ss-modal-rule-row">
                <div class="ss-modal-days-input">
                  <MpInput id="ss-modal-days" v-model="modalForm.days" type="number" />
                </div>
                <span class="ss-modal-days-label">{{ t('days') }}</span>
                <div class="ss-modal-timing-select">
                  <MpAutocomplete
                    id="ss-modal-timing"
                    v-model="modalForm.timing"
                    :data="TIMING_OPTIONS"
                    label-prop="name"
                    value-prop="id"
                    use-portal
                  />
                </div>
                <span class="ss-modal-timing-label">{{ t('the due date') }}</span>
              </div>

              <!-- Email content -->
              <h3 class="ss-modal-section-title ss-modal-section-title--spaced">{{ t('Email content') }}</h3>

              <div class="ss-modal-field">
                <MpFormControl>
                  <MpFormLabel>{{ t('Subject') }} <span class="ss-required">*</span></MpFormLabel>
                  <MpInput id="ss-modal-subject" v-model="modalForm.subject" is-full-width />
                </MpFormControl>
              </div>

              <div class="ss-modal-field">
                <div class="ss-modal-placeholder-row">
                  <span class="ss-modal-body-label">{{ t('Body') }} <span class="ss-required">*</span></span>
                  <MpPopover id="ss-insert-placeholder" is-close-on-select use-portal placement="bottom-end">
                    <MpPopoverTrigger>
                      <MpButton variant="ghost" size="sm" right-icon="chevrons-down">{{ t('Insert placeholder') }}</MpButton>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '200px' })">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="ph in PLACEHOLDER_OPTIONS" :key="ph.value" @click="insertPlaceholder(ph.value)">{{ t(ph.label) }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </div>
                <MpTextarea id="ss-modal-body" v-model="modalForm.body" is-full-width :rows="14" class="ss-modal-body-textarea" />
              </div>

              <!-- Checkboxes -->
              <div class="ss-modal-checks">
                <label class="ss-checkbox-row">
                  <MpCheckbox id="ss-modal-attach" :is-checked="modalForm.attachPdf" @change="modalForm.attachPdf = !modalForm.attachPdf" />
                  <span>{{ t('Attach PDF to email') }}</span>
                </label>
                <label class="ss-checkbox-row">
                  <MpCheckbox id="ss-modal-copy" :is-checked="modalForm.sendCopy" @change="modalForm.sendCopy = !modalForm.sendCopy" />
                  <span>{{ t('Send a copy to the person who created this transaction') }}</span>
                </label>
              </div>
            </div>

            <footer class="ss-modal-footer">
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost ss-modal-footer-left">{{ t('Send test email') }}</MpButton>
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="reminderModalOpen = false">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="saveReminderRule">{{ t('Save') }}</MpButton>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Template edit modal ──────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="ss-modal-fade">
        <div v-if="templateModalOpen" class="ss-modal-scrim">
          <div class="ss-modal" role="dialog" :aria-label="editingTemplate ? t(`${editingTemplate.label} ${editingTemplate.type} template`) : ''" @click.stop>
            <header class="ss-modal-header">
              <h2 class="ss-modal-title">{{ editingTemplate ? t(`${editingTemplate.label} ${editingTemplate.type === 'email' ? 'email' : 'message'} template`) : '' }}</h2>
              <MpButton variant="ghost" size="sm" left-icon="close" :aria-label="t('Close')" @click="templateModalOpen = false" />
            </header>

            <div class="ss-modal-body">
              <div v-if="editingTemplate?.type === 'email'" class="ss-modal-field">
                <MpFormControl>
                  <MpFormLabel>{{ t('Subject') }} <span class="ss-required">*</span></MpFormLabel>
                  <MpInput id="ss-tmpl-subject" v-model="templateModalForm.subject" is-full-width />
                </MpFormControl>
              </div>

              <div class="ss-modal-field">
                <div class="ss-modal-placeholder-row">
                  <span class="ss-modal-body-label">{{ t(editingTemplate?.type === 'whatsapp' ? 'Message' : 'Body') }} <span class="ss-required">*</span></span>
                  <MpPopover id="ss-tmpl-insert-placeholder" is-close-on-select use-portal placement="bottom-end">
                    <MpPopoverTrigger>
                      <MpButton variant="ghost" size="sm" right-icon="chevrons-down">{{ t('Insert placeholder') }}</MpButton>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '200px' })">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="ph in PLACEHOLDER_OPTIONS" :key="ph.value" @click="insertTemplatePlaceholder(ph.value)">{{ t(ph.label) }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </div>
                <MpTextarea id="ss-tmpl-body" v-model="templateModalForm.body" is-full-width :rows="14" class="ss-modal-body-textarea" />
              </div>

              <div v-if="editingTemplate?.type === 'email'" class="ss-modal-checks">
                <label class="ss-checkbox-row">
                  <MpCheckbox id="ss-tmpl-copy" :is-checked="templateModalForm.sendCopy" @change="templateModalForm.sendCopy = !templateModalForm.sendCopy" />
                  <span>{{ t('Send a copy to the person who created this transaction') }}</span>
                </label>
              </div>
            </div>

            <footer class="ss-modal-footer">
              <div />
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="templateModalOpen = false">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="saveTemplate">{{ t('Save changes') }}</MpButton>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div class="ss-divider" />

    <!-- ── Email templates ───────────────────────────────────────────────── -->
    <section class="ss-section">
      <div class="ss-section-header">
        <div class="ss-section-meta">
          <h2 class="ss-section-title">{{ t('Email templates') }}</h2>
          <p class="ss-section-desc">{{ t('Configure the default subject and body text for customer emails.') }}</p>
        </div>
      </div>

      <div class="ss-content ss-content--narrow">
        <div v-for="tmpl in emailTemplates" :key="tmpl.label" class="ss-row ss-row--template">
          <span class="ss-row-title">{{ t(tmpl.label) }}</span>
          <MpPopover
            :id="`ss-email-${tmpl.label}`"
            is-close-on-select
            use-portal
            placement="bottom-end"
          >
            <MpPopoverTrigger>
              <MpButton
                variant="ghost"
                :aria-label="t('More actions')"
                left-icon="menu-kebab"
              />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px' })">
              <MpPopoverList>
                <MpPopoverListItem @click="openTemplateModal(tmpl)">{{ t('Edit template') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </section>

    <div class="ss-divider" />

    <!-- ── WhatsApp message templates ────────────────────────────────────── -->
    <section class="ss-section">
      <div class="ss-section-header">
        <div class="ss-section-meta">
          <h2 class="ss-section-title">{{ t('WhatsApp message templates') }}</h2>
          <p class="ss-section-desc">{{ t('Configure default message templates for WhatsApp notifications.') }}</p>
        </div>
      </div>

      <div class="ss-content ss-content--narrow">
        <div v-for="tmpl in whatsappTemplates" :key="tmpl.label" class="ss-row ss-row--template">
          <span class="ss-row-title">{{ t(tmpl.label) }}</span>
          <MpPopover
            :id="`ss-wa-${tmpl.label}`"
            is-close-on-select
            use-portal
            placement="bottom-end"
          >
            <MpPopoverTrigger>
              <MpButton
                variant="ghost"
                :aria-label="t('More actions')"
                left-icon="menu-kebab"
              />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px' })">
              <MpPopoverList>
                <MpPopoverListItem @click="openTemplateModal(tmpl)">{{ t('Edit template') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </section>

    <div class="ss-divider" />

    <!-- ── Document layout & branding ────────────────────────────────────── -->
    <section class="ss-section">
      <div class="ss-section-header ss-section-header--with-action">
        <div class="ss-section-meta">
          <h2 class="ss-section-title">{{ t('Document layout & branding') }}</h2>
          <p class="ss-section-desc">{{ t('Customize the look and feel of your PDF documents (Invoices, Quotes, Orders).') }}</p>
        </div>
        <MpButton
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary ss-customize-btn"
        >
          {{ t('Customize design') }}
        </MpButton>
      </div>
    </section>

    <!-- ── Customer select drawer for Exclude specific customers ────────── -->
    <SelectAccessDrawer
      :open="customerPickerOpen"
      :title="t('Select customers')"
      :list-title="t('Customers')"
      :options="customerOptions"
      :model-value="reminders.excludedCustomerIds"
      :empty-title="t('No customer selected')"
      :empty-caption="t('Select customers from the list to exclude them from reminders.')"
      @update:open="customerPickerOpen = $event"
      @save="onCustomerPickerSave"
    />

    <!-- ── Invoice select drawer for Exclude invoices ───────────────────── -->
    <SelectAccessDrawer
      :open="invoicePickerOpen"
      :title="t('Select invoices')"
      :list-title="t('Invoices')"
      :options="invoiceOptions"
      :model-value="reminders.excludedInvoiceIds"
      :empty-title="t('No invoice selected')"
      :empty-caption="t('Select invoices from the list to exclude them from reminders.')"
      @update:open="invoicePickerOpen = $event"
      @save="onInvoicePickerSave"
    />
  </div>
</template>

<style scoped>
/* ─── Page root — 12-column grid ─────────────────────────────────────────── */
.ss-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}

/* ─── Section ────────────────────────────────────────────────────────────── */
.ss-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  padding: var(--mp-spacing-6) 0;
}
.ss-section:first-child { padding-top: 0; }

.ss-section-header {
  grid-column: 1 / -1;
  margin-bottom: var(--mp-spacing-3);
}

.ss-section-header--with-action {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
}

.ss-section-meta {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

/* Hover Edit button — hidden by default, visible on section hover */
.ss-edit-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.ss-section--hoverable:hover .ss-edit-btn {
  opacity: 1;
}
.ss-section-header--with-action > .ss-edit-btn {
  grid-column: 7;
  justify-self: start;
  margin-left: 24px;
}

.ss-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ss-section-desc {
  margin: var(--mp-spacing-0\.5) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}

/* ─── Content area (first 6 cols) ────────────────────────────────────────── */
.ss-content {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

.ss-content--narrow {
  grid-column: 1 / 4;
}

/* Customize design button — within 6-col boundary */
.ss-customize-btn {
  grid-column: 7;
  justify-self: start;
  margin-left: 24px;
}

/* ─── Rows (toggle / value / template) ───────────────────────────────────── */
.ss-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
}

.ss-row-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  flex: 1;
  min-width: 0;
}

.ss-row-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ss-row-desc {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

.ss-row-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  flex-shrink: 0;
}

/* Stacked rows — label on top, textarea below (edit mode) */
.ss-row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: var(--mp-spacing-2);
}

/* Payment terms select — stacked below label, half content width */
.ss-payment-select {
  width: 50%;
}

/* Character counter — bottom-right below textarea */
.ss-counter {
  align-self: flex-end;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* Template rows — just label + kebab, no desc */
.ss-row--template {
  padding: var(--mp-spacing-1) 0;
}
.ss-row--template .ss-row-title {
  font-weight: var(--mp-font-weights-normal);
}

/* ─── Action bar (Save / Cancel) ────────────────────────────────────────── */
.ss-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}

/* ─── Reminder rules list ───────────────────────────────────────────────── */
.ss-reminder-list {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.ss-reminder-list-label {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  margin-bottom: var(--mp-spacing-1);
}

.ss-reminder-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}

.ss-reminder-item-text {
  flex: 1;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.ss-add-rule-btn {
  align-self: flex-start;
  margin-top: var(--mp-spacing-2);
}

/* ─── Checkbox groups (Apply to, Exclude) ──────────────────────────────── */
.ss-checkbox-group {
  display: flex;
  gap: var(--mp-spacing-4);
}

.ss-checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}

.ss-exclude-group {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
}

.ss-exclude-item {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}

.ss-exclude-sub {
  padding-left: 28px;
}

.ss-currency-input {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  max-width: var(--mp-sizes-60, 240px); /* pixel-police-allow: form field width cap */
}

.ss-currency-prefix {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  flex-shrink: 0;
}

.ss-excluded-list {
  list-style: none;
  margin: 0 0 var(--mp-spacing-2) 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

/* Up to 5 rows the list is plain; past that it becomes its own scroll box so a
   long exclusion list never pushes the rest of the settings off screen. The
   max-height is 5 rows plus their gaps, measured off .ss-excluded-list-item. */
.ss-excluded-box {
  --ss-excl-row: var(--mp-sizes-9, 36px);
  margin-bottom: var(--mp-spacing-2);
}
.ss-excluded-box--scroll {
  /* Exactly 5 rows plus their gaps and the box's own padding. */
  max-height: calc(5 * var(--ss-excl-row) + 4 * var(--mp-spacing-1) + 2 * var(--mp-spacing-2));
  overflow-y: auto;
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-2);
}
.ss-excluded-box--scroll .ss-excluded-list { margin-bottom: 0; }
.ss-excluded-sentinel { height: 1px; }
.ss-excluded-loading {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.ss-excluded-count {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.ss-excluded-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1) 0;
  /* Fixed so the scroll box's 5-row cap below is exact, not a guessed pixel
     height — the row height and the cap read the same token. */
  min-height: var(--ss-excl-row);
  box-sizing: border-box;
}

.ss-excluded-list-name {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

/* ─── Modal ─────────────────────────────────────────────────────────────── */
.ss-modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: var(--mp-color-overlay, rgba(20, 23, 28, 0.45)); /* pixel-police-allow: scrim overlay needs alpha */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-6);
}

.ss-modal {
  width: min(720px, 96vw);
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  background: var(--mp-background-neutral, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.35); /* pixel-police-allow-shadow: modal elevation */
  overflow: hidden;
}

.ss-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--mp-sizes-14, 56px); /* pixel-police-allow: modal header height */
  flex-shrink: 0;
  padding: 0 var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}

.ss-modal-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ss-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--mp-spacing-6);
}

.ss-modal-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg, 18px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ss-modal-section-title--spaced {
  margin-top: var(--mp-spacing-6);
}

.ss-modal-field-label {
  display: block;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  margin-bottom: var(--mp-spacing-2);
}

.ss-modal-rule-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.ss-modal-days-input {
  width: var(--mp-sizes-25, 100px); /* pixel-police-allow: days input width */
}

.ss-modal-days-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ss-modal-timing-select {
  width: var(--mp-sizes-35, 140px); /* pixel-police-allow: timing select width */
}

.ss-modal-timing-label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.ss-modal-field {
  margin-bottom: var(--mp-spacing-3);
}

.ss-modal-placeholder-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--mp-spacing-2);
}

.ss-modal-body-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ss-required {
  color: var(--mp-colors-red-400, #e53e3e);
}

.ss-modal-field :deep(textarea.ss-modal-body-textarea) {
  min-height: 320px !important; /* pixel-police-allow: mandatory minimum for email body */
}

.ss-modal-checks {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-4);
}

.ss-modal-footer {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  flex-shrink: 0;
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default);
}

.ss-modal-footer-left {
  margin-right: auto;
}

.ss-modal-fade-enter-active,
.ss-modal-fade-leave-active {
  transition: opacity 200ms ease;
}
.ss-modal-fade-enter-from,
.ss-modal-fade-leave-to {
  opacity: 0;
}

/* ─── Divider ────────────────────────────────────────────────────────────── */
.ss-divider {
  grid-column: 1 / -1;
  height: var(--mp-sizes-px, 1px); /* pixel-police-allow: divider thickness */
  background: var(--mp-border-default, #e3e7e9);
}
</style>
