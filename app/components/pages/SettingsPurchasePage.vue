<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  MpButton, MpToggle, MpTextarea, MpAutocomplete, MpInput, MpCheckbox,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpFormControl, MpFormLabel,
  css,
  toast,
} from '@mekari/pixel3'

const { t } = useLocale()

// ─── General settings state ─────────────────────────────────────────────────
const general = reactive({
  defaultPaymentTerms: 'Net 30',
  vendorInPurchaseRequest: true,
  shippingInfo: true,
  globalDiscount: true,
  lineItemDiscount: true,
  depositDownPayment: true,
  defaultMessage: '',
})

// ─── Email templates ────────────────────────────────────────────────────────
interface TemplateItem {
  label: string
  type: 'email'
  subject: string
  body: string
  sendCopy: boolean
}

const emailTemplates = reactive<TemplateItem[]>([
  { label: 'Purchase order', type: 'email', subject: 'Purchase Order [TransactionNumber] from [CompanyName]', body: 'Hi [VendorName],\n\nPlease find attached the purchase order [TransactionNumber] for [TotalAmount].\n\nIf you have any questions, please let us know.\n\nThanks,\n[CompanyName]', sendCopy: false },
])

// ─── Template edit modal ───────────────────────────────────────────────────
const PLACEHOLDER_OPTIONS = [
  { label: 'Vendor Name', value: '[VendorName]' },
  { label: 'Company Name', value: '[CompanyName]' },
  { label: 'Transaction Number', value: '[TransactionNumber]' },
  { label: 'Total Amount', value: '[TotalAmount]' },
  { label: 'Due Date', value: '[DueDate]' },
]

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
  { key: 'vendorInPurchaseRequest', title: t('Vendor in purchase request'), desc: t('Allow selecting a preferred vendor when creating internal purchase requests.') },
  { key: 'shippingInfo', title: t('Shipping information'), desc: t('Enable fields for shipping address and delivery dates on Purchase Orders.') },
  { key: 'globalDiscount', title: t('Global discount'), desc: t('Allow a total discount on the subtotal.') },
  { key: 'lineItemDiscount', title: t('Line item discount'), desc: t('Allow discounts per specific product line.') },
  { key: 'depositDownPayment', title: t('Deposit (Down payment)'), desc: t('Allow recording initial deposits on orders.') },
] as const

const isEditing = reactive<Record<string, boolean>>({
  general: false,
})

const PAYMENT_TERM_OPTIONS = [
  { id: 'Net 30', name: 'Net 30' },
  { id: 'Net 14', name: 'Net 14' },
  { id: 'Net 45', name: 'Net 45' },
  { id: 'Cash on delivery', name: 'Cash on delivery' },
]
</script>

<template>
  <div class="ps-page" data-devchange="settings-purchase-page">

    <!-- ── General settings ──────────────────────────────────────────────── -->
    <section class="ps-section" :class="{ 'ps-section--hoverable': !isEditing.general }">
      <div class="ps-section-header ps-section-header--with-action">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ isEditing.general ? t('Edit general settings') : t('General settings') }}</h2>
          <p class="ps-section-desc">{{ t('Configure default values, workflows, and field visibility for purchase documents.') }}</p>
        </div>
        <MpButton
          v-if="!isEditing.general"
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before ps-edit-btn"
          left-icon="edit"
          @click="isEditing.general = true"
        >
          {{ t('Edit') }}
        </MpButton>
      </div>

      <div class="ps-content">
        <div class="ps-row" :class="{ 'ps-row--stacked': isEditing.general }">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Default payment term') }}</span>
            <span v-if="!isEditing.general" class="ps-row-desc">{{ t('Set the default due date for new purchase bills.') }}</span>
          </div>
          <div v-if="isEditing.general" class="ps-payment-select">
            <MpAutocomplete
              id="ps-payment-terms-ac"
              v-model="general.defaultPaymentTerms"
              :data="PAYMENT_TERM_OPTIONS"
              label-prop="name"
              value-prop="id"
              use-portal
            />
          </div>
          <span v-else class="ps-row-value">{{ general.defaultPaymentTerms }}</span>
        </div>

        <div v-for="toggle in GENERAL_TOGGLES" :key="toggle.key" class="ps-row">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ toggle.title }}</span>
            <span class="ps-row-desc">{{ toggle.desc }}</span>
          </div>
          <MpToggle
            :is-checked="(general as Record<string, unknown>)[toggle.key] as boolean"
            :is-disabled="!isEditing.general"
            :aria-label="toggle.title"
            @update:is-checked="(v: boolean) => { (general as Record<string, unknown>)[toggle.key] = v }"
          />
        </div>

        <div class="ps-row ps-row--stacked">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Default message') }}</span>
            <span v-if="!isEditing.general" class="ps-row-desc">{{ t('Set standard notes for your purchase documents.') }}</span>
          </div>
          <template v-if="isEditing.general">
            <MpTextarea
              v-model="general.defaultMessage"
              is-full-width
              :rows="3"
              :maxlength="600"
              :placeholder="t('Enter default message')"
            />
            <span class="ps-counter">{{ general.defaultMessage.length }} / 600</span>
          </template>
          <span v-else class="ps-row-value">{{ general.defaultMessage || '—' }}</span>
        </div>
      </div>

      <div v-if="isEditing.general" class="ps-action-bar">
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="isEditing.general = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="isEditing.general = false; toast.notify({ variant: 'success', title: t('General settings changes saved'), maxWidth: 'max-content' })">{{ t('Save changes') }}</MpButton>
      </div>
    </section>

    <div class="ps-divider" />

    <!-- ── Email templates ───────────────────────────────────────────────── -->
    <section class="ps-section">
      <div class="ps-section-header">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ t('Email templates') }}</h2>
          <p class="ps-section-desc">{{ t('Configure the default subject and body text for vendor emails.') }}</p>
        </div>
      </div>

      <div class="ps-content ps-content--narrow">
        <div v-for="tmpl in emailTemplates" :key="tmpl.label" class="ps-row ps-row--template">
          <span class="ps-row-title">{{ t(tmpl.label) }}</span>
          <MpPopover
            :id="`ps-email-${tmpl.label}`"
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

    <div class="ps-divider" />

    <!-- ── Document layout & branding ────────────────────────────────────── -->
    <section class="ps-section">
      <div class="ps-section-header ps-section-header--with-action">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ t('Document layout & branding') }}</h2>
          <p class="ps-section-desc">{{ t('Customize the look and feel of your PDF documents (Invoices, Orders).') }}</p>
        </div>
        <MpButton
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary ps-customize-btn"
        >
          {{ t('Customize design') }}
        </MpButton>
      </div>
    </section>

    <!-- ── Template edit modal ──────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="ps-modal-fade">
        <div v-if="templateModalOpen" class="ps-modal-scrim">
          <div class="ps-modal" role="dialog" :aria-label="editingTemplate ? t(`${editingTemplate.label} email template`) : ''" @click.stop>
            <header class="ps-modal-header">
              <h2 class="ps-modal-title">{{ editingTemplate ? t(`${editingTemplate.label} email template`) : '' }}</h2>
              <MpButton variant="ghost" size="sm" left-icon="close" :aria-label="t('Close')" @click="templateModalOpen = false" />
            </header>

            <div class="ps-modal-body">
              <div class="ps-modal-field">
                <MpFormControl>
                  <MpFormLabel>{{ t('Subject') }} <span class="ps-required">*</span></MpFormLabel>
                  <MpInput id="ps-tmpl-subject" v-model="templateModalForm.subject" is-full-width />
                </MpFormControl>
              </div>

              <div class="ps-modal-field">
                <div class="ps-modal-placeholder-row">
                  <span class="ps-modal-body-label">{{ t('Body') }} <span class="ps-required">*</span></span>
                  <MpPopover id="ps-tmpl-insert-placeholder" is-close-on-select use-portal placement="bottom-end">
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
                <MpTextarea id="ps-tmpl-body" v-model="templateModalForm.body" is-full-width :rows="14" class="ps-modal-body-textarea" />
              </div>

              <div class="ps-modal-checks">
                <label class="ps-checkbox-row">
                  <MpCheckbox id="ps-tmpl-copy" :is-checked="templateModalForm.sendCopy" @change="templateModalForm.sendCopy = !templateModalForm.sendCopy" />
                  <span>{{ t('Send a copy to the person who created this transaction') }}</span>
                </label>
              </div>
            </div>

            <footer class="ps-modal-footer">
              <div />
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="templateModalOpen = false">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="saveTemplate">{{ t('Save changes') }}</MpButton>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ─── Page root — 12-column grid ─────────────────────────────────────────── */
.ps-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}

/* ─── Section ────────────────────────────────────────────────────────────── */
.ps-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  padding: var(--mp-spacing-6) 0;
}
.ps-section:first-child { padding-top: 0; }

.ps-section-header {
  grid-column: 1 / -1;
  margin-bottom: var(--mp-spacing-3);
}

.ps-section-header--with-action {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
}

.ps-section-meta {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

/* Hover Edit button — hidden by default, visible on section hover */
.ps-edit-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.ps-section--hoverable:hover .ps-edit-btn {
  opacity: 1;
}
.ps-section-header--with-action > .ps-edit-btn {
  grid-column: 7;
  justify-self: start;
  margin-left: 24px;
}

.ps-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ps-section-desc {
  margin: var(--mp-spacing-0\.5) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}

/* ─── Content area (first 6 cols) ────────────────────────────────────────── */
.ps-content {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

.ps-content--narrow {
  grid-column: 1 / 4;
}

/* Customize design button — within 6-col boundary */
.ps-customize-btn {
  grid-column: 7;
  justify-self: start;
  margin-left: 24px;
}

/* ─── Rows (toggle / value / template) ───────────────────────────────────── */
.ps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
}

.ps-row-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  flex: 1;
  min-width: 0;
}

.ps-row-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ps-row-desc {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

.ps-row-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  flex-shrink: 0;
}

/* Stacked rows — label on top, control below (edit mode) */
.ps-row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: var(--mp-spacing-2);
}

/* Payment terms select — stacked below label, half content width */
.ps-payment-select {
  width: 50%;
}

/* Character counter — bottom-right below textarea */
.ps-counter {
  align-self: flex-end;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* Template rows — just label + kebab, no desc */
.ps-row--template {
  padding: var(--mp-spacing-1) 0;
}
.ps-row--template .ps-row-title {
  font-weight: var(--mp-font-weights-normal);
}

/* ─── Action bar (Save / Cancel) ────────────────────────────────────────── */
.ps-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}

/* ─── Checkbox row ──────────────────────────────────────────────────────── */
.ps-checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}

/* ─── Modal ─────────────────────────────────────────────────────────────── */
.ps-modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: var(--mp-color-overlay, rgba(20, 23, 28, 0.45)); /* pixel-police-allow: scrim overlay needs alpha */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-6);
}

.ps-modal {
  width: min(720px, 96vw);
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  background: var(--mp-background-neutral, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.35); /* pixel-police-allow-shadow: modal elevation */
  overflow: hidden;
}

.ps-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--mp-sizes-14, 56px); /* pixel-police-allow: modal header height */
  flex-shrink: 0;
  padding: 0 var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}

.ps-modal-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ps-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--mp-spacing-6);
}

.ps-modal-field {
  margin-bottom: var(--mp-spacing-3);
}

.ps-modal-placeholder-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--mp-spacing-2);
}

.ps-modal-body-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ps-required {
  color: var(--mp-colors-red-400, #e53e3e);
}

.ps-modal-field :deep(textarea.ps-modal-body-textarea) {
  min-height: 320px !important; /* pixel-police-allow: mandatory minimum for email body */
}

.ps-modal-checks {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-4);
}

.ps-modal-footer {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  flex-shrink: 0;
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default);
}

.ps-modal-fade-enter-active,
.ps-modal-fade-leave-active {
  transition: opacity 200ms ease;
}
.ps-modal-fade-enter-from,
.ps-modal-fade-leave-to {
  opacity: 0;
}

/* ─── Divider ────────────────────────────────────────────────────────────── */
.ps-divider {
  grid-column: 1 / -1;
  height: var(--mp-sizes-px, 1px); /* pixel-police-allow: divider thickness */
  background: var(--mp-border-default, #e3e7e9);
}
</style>
