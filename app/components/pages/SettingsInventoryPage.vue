<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  MpButton, MpToggle, MpAutocomplete, MpInput, MpTextarea, MpCheckbox,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpFormControl, MpFormLabel,
  css,
  toast,
} from '@mekari/pixel3'

const { t } = useLocale()

// Costing method is locked once any inventory transaction exists — changing it
// would retroactively alter COGS on posted documents, so the form is disabled.
// In this prototype the seed company already has inventory movement.
const hasInventoryTransactions = true

// ─── Product settings state (committed = saved, draft = being edited) ────────
interface ProductSettings {
  costingMethod: string
  stockInfoOnForms: boolean
  barcodeScanning: boolean
  productVariant: boolean
  serialNumberTracking: boolean
  batchTracking: boolean
}
const PRODUCT_DEFAULTS: ProductSettings = {
  costingMethod: 'average',
  stockInfoOnForms: true,
  barcodeScanning: true,
  productVariant: true,
  serialNumberTracking: true,
  batchTracking: true,
}
const committedProduct = reactive<ProductSettings>({ ...PRODUCT_DEFAULTS })
const draftProduct = reactive<ProductSettings>({ ...PRODUCT_DEFAULTS })

const COSTING_METHOD_OPTIONS = [
  { id: 'average', name: 'Average cost' },
  { id: 'fifo', name: 'FIFO (First In, First Out)' },
]
const costingMethodLabel = computed(() =>
  COSTING_METHOD_OPTIONS.find(o => o.id === committedProduct.costingMethod)?.name ?? '',
)

const PRODUCT_TOGGLES = [
  { key: 'stockInfoOnForms', title: t('Stock info on sales & purchases'), desc: t('Show available quantity (Qty on Hand) while creating sales and purchase forms.') },
  { key: 'barcodeScanning', title: t('Barcode scanning'), desc: t('Enable scanning to quickly add items to transactions using physical barcodes.') },
  { key: 'productVariant', title: t('Product variant'), desc: t('Enable products with multiple attributes (e.g. Size, Color, Material).') },
  { key: 'serialNumberTracking', title: t('Serial number tracking'), desc: t('Track individual items using unique ID.') },
  { key: 'batchTracking', title: t('Batch tracking'), desc: t('Track inventory groups by expiration dates or lot numbers.') },
] as const

const hasProductChanges = computed(() =>
  draftProduct.costingMethod        !== committedProduct.costingMethod        ||
  draftProduct.stockInfoOnForms     !== committedProduct.stockInfoOnForms     ||
  draftProduct.barcodeScanning      !== committedProduct.barcodeScanning      ||
  draftProduct.productVariant       !== committedProduct.productVariant       ||
  draftProduct.serialNumberTracking !== committedProduct.serialNumberTracking ||
  draftProduct.batchTracking        !== committedProduct.batchTracking,
)

// ─── Batch reminders state ──────────────────────────────────────────────────
interface ReminderRule {
  id: number
  days: number
  timing: string
  subject: string
  body: string
  sendCopy: boolean
}
interface ReminderSettings {
  sendBatchExpiryReminder: boolean
  rules: ReminderRule[]
}
const committedReminders = reactive<ReminderSettings>({ sendBatchExpiryReminder: false, rules: [] })
const draftReminders = reactive<ReminderSettings>({ sendBatchExpiryReminder: false, rules: [] })

let nextRuleId = 1

const reminderRuleSummary = computed(() => {
  if (!committedReminders.sendBatchExpiryReminder) return t('Off')
  if (committedReminders.rules.length === 0) return t('No reminder rule yet')
  return committedReminders.rules.map(r => `${r.days} ${t('days')} ${r.timing.toLowerCase()} ${t('the expiry date')}`).join(', ')
})

const hasReminderChanges = computed(() =>
  draftReminders.sendBatchExpiryReminder !== committedReminders.sendBatchExpiryReminder ||
  JSON.stringify(draftReminders.rules) !== JSON.stringify(committedReminders.rules),
)

// ─── Single-section edit + discard guard ────────────────────────────────────
type Section = 'product' | 'reminders'
const editingSection = ref<Section | null>(null)
const discardOpen = ref(false)

const currentHasChanges = computed(() =>
  editingSection.value === 'product'   ? hasProductChanges.value :
  editingSection.value === 'reminders' ? hasReminderChanges.value : false,
)

function startEdit(section: Section) {
  if (section === 'product') {
    Object.assign(draftProduct, committedProduct)
  } else {
    draftReminders.sendBatchExpiryReminder = committedReminders.sendBatchExpiryReminder
    draftReminders.rules = committedReminders.rules.map(r => ({ ...r }))
  }
  editingSection.value = section
}

function requestCancel() {
  if (currentHasChanges.value) discardOpen.value = true
  else exitEdit()
}

function exitEdit() {
  // Roll the draft back to the saved state so a reopened form starts clean.
  if (editingSection.value === 'product') {
    Object.assign(draftProduct, committedProduct)
  } else if (editingSection.value === 'reminders') {
    draftReminders.sendBatchExpiryReminder = committedReminders.sendBatchExpiryReminder
    draftReminders.rules = committedReminders.rules.map(r => ({ ...r }))
  }
  editingSection.value = null
  discardOpen.value = false
}

function saveEdit() {
  if (editingSection.value === 'product') {
    Object.assign(committedProduct, draftProduct)
    toast.notify({ variant: 'success', title: t('Product settings changes saved'), maxWidth: 'max-content' })
  } else if (editingSection.value === 'reminders') {
    committedReminders.sendBatchExpiryReminder = draftReminders.sendBatchExpiryReminder
    committedReminders.rules = draftReminders.rules.map(r => ({ ...r }))
    toast.notify({ variant: 'success', title: t('Batch reminders changes saved'), maxWidth: 'max-content' })
  }
  editingSection.value = null
}

// ─── Reminder modal (operates on the draft rule list) ───────────────────────
const TIMING_OPTIONS = [
  { id: 'Before', name: 'Before' },
  { id: 'After', name: 'After' },
]

const PLACEHOLDER_OPTIONS = [
  { label: 'Batch Number', value: '[BatchNumber]' },
  { label: 'Product Name', value: '[ProductName]' },
  { label: 'Expiry Date', value: '[ExpiryDate]' },
  { label: 'Quantity', value: '[Quantity]' },
  { label: 'Warehouse', value: '[Warehouse]' },
  { label: 'Company Name', value: '[CompanyName]' },
]

const DEFAULT_SUBJECT = 'Batch [BatchNumber] of [ProductName] is expiring on [ExpiryDate]'
const DEFAULT_BODY = `Hi team,

Batch [BatchNumber] of [ProductName] ([Quantity]) stored in [Warehouse] is approaching its expiry date on [ExpiryDate].

Please take the necessary action.

Regards,
[CompanyName]`

const reminderModalOpen = ref(false)
const editingRuleId = ref<number | null>(null)
const modalForm = reactive({
  days: 7,
  timing: 'Before',
  subject: DEFAULT_SUBJECT,
  body: DEFAULT_BODY,
  sendCopy: false,
})

function openAddReminderModal() {
  editingRuleId.value = null
  modalForm.days = 7
  modalForm.timing = 'Before'
  modalForm.subject = DEFAULT_SUBJECT
  modalForm.body = DEFAULT_BODY
  modalForm.sendCopy = false
  reminderModalOpen.value = true
}

function openEditReminderModal(rule: ReminderRule) {
  editingRuleId.value = rule.id
  modalForm.days = rule.days
  modalForm.timing = rule.timing
  modalForm.subject = rule.subject
  modalForm.body = rule.body
  modalForm.sendCopy = rule.sendCopy
  reminderModalOpen.value = true
}

function saveReminderRule() {
  if (editingRuleId.value != null) {
    const idx = draftReminders.rules.findIndex(r => r.id === editingRuleId.value)
    if (idx >= 0) {
      draftReminders.rules[idx] = {
        id: editingRuleId.value,
        days: modalForm.days,
        timing: modalForm.timing,
        subject: modalForm.subject,
        body: modalForm.body,
        sendCopy: modalForm.sendCopy,
      }
    }
  } else {
    draftReminders.rules.push({
      id: nextRuleId++,
      days: modalForm.days,
      timing: modalForm.timing,
      subject: modalForm.subject,
      body: modalForm.body,
      sendCopy: modalForm.sendCopy,
    })
  }
  reminderModalOpen.value = false
}

function deleteReminderRule(id: number) {
  const idx = draftReminders.rules.findIndex(r => r.id === id)
  if (idx >= 0) draftReminders.rules.splice(idx, 1)
}

function insertPlaceholder(value: string) {
  modalForm.body += value
}
</script>

<template>
  <div class="is-page" data-devchange="settings-inventory-page">

    <!-- ── Product settings ──────────────────────────────────────────────── -->
    <section class="is-section" :class="{ 'is-section--hoverable': editingSection === null }">
      <div class="is-section-header is-section-header--with-action">
        <div class="is-section-meta">
          <h2 class="is-section-title">{{ editingSection === 'product' ? t('Edit product settings') : t('Product settings') }}</h2>
          <p class="is-section-desc">{{ t('Configure product features, tracking methods, and visibility settings.') }}</p>
        </div>
        <!-- Only one section edits at a time: hide Edit while any section is open. -->
        <MpButton
          v-if="editingSection === null"
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before is-edit-btn"
          left-icon="edit"
          @click="startEdit('product')"
        >
          {{ t('Edit') }}
        </MpButton>
      </div>

      <div class="is-content">
        <!-- Inventory costing method — locked once transactions exist -->
        <div class="is-row" :class="{ 'is-row--stacked': editingSection === 'product' }">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Inventory costing method') }}</span>
            <span v-if="editingSection !== 'product'" class="is-row-desc">{{ t('A method to calculate the cost of goods sold from the inventory.') }}</span>
          </div>

          <template v-if="editingSection === 'product'">
            <!-- Locked: disabled field + explanation (transactions already posted) -->
            <div v-if="hasInventoryTransactions" class="is-costing-select">
              <MpInput id="is-costing-locked" :model-value="costingMethodLabel" is-full-width is-disabled />
              <span class="is-lock-hint">{{ t('Locked because inventory transactions already exist. Changing it would affect COGS on posted documents.') }}</span>
            </div>
            <!-- Unlocked: editable select (no transactions yet) -->
            <div v-else class="is-costing-select">
              <MpAutocomplete
                id="is-costing-ac"
                v-model="draftProduct.costingMethod"
                :data="COSTING_METHOD_OPTIONS"
                label-prop="name"
                value-prop="id"
                use-portal
              />
            </div>
          </template>
          <span v-else class="is-row-value">{{ costingMethodLabel }}</span>
        </div>

        <div v-for="toggle in PRODUCT_TOGGLES" :key="toggle.key" class="is-row">
          <div class="is-row-info">
            <span class="is-row-title">{{ toggle.title }}</span>
            <span class="is-row-desc">{{ toggle.desc }}</span>
          </div>
          <MpToggle
            :is-checked="editingSection === 'product' ? ((draftProduct as Record<string, unknown>)[toggle.key] as boolean) : ((committedProduct as Record<string, unknown>)[toggle.key] as boolean)"
            :is-disabled="editingSection !== 'product'"
            :aria-label="toggle.title"
            @update:is-checked="(v: boolean) => { (draftProduct as Record<string, unknown>)[toggle.key] = v }"
          />
        </div>
      </div>

      <div v-if="editingSection === 'product'" class="is-action-bar">
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="requestCancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="saveEdit">{{ t('Save changes') }}</MpButton>
      </div>
    </section>

    <div class="is-divider" />

    <!-- ── Batch reminders ───────────────────────────────────────────────── -->
    <section class="is-section" :class="{ 'is-section--hoverable': editingSection === null }">
      <div class="is-section-header is-section-header--with-action">
        <div class="is-section-meta">
          <h2 class="is-section-title">{{ editingSection === 'reminders' ? t('Edit batch reminders') : t('Batch reminders') }}</h2>
          <p class="is-section-desc">{{ t('Automated email reminders for expiring inventory batches.') }}</p>
        </div>
        <MpButton
          v-if="editingSection === null"
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before is-edit-btn"
          left-icon="edit"
          @click="startEdit('reminders')"
        >
          {{ t('Edit') }}
        </MpButton>
      </div>

      <div class="is-content">
        <!-- Send batch expiry reminder email toggle -->
        <div class="is-row">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Send batch expiry reminder email') }}</span>
            <span class="is-row-desc">{{ t('Automatically notify warehouse staff when batches are approaching expiration.') }}</span>
          </div>
          <MpToggle
            :is-checked="editingSection === 'reminders' ? draftReminders.sendBatchExpiryReminder : committedReminders.sendBatchExpiryReminder"
            :is-disabled="editingSection !== 'reminders'"
            :aria-label="t('Send batch expiry reminder email')"
            @update:is-checked="(v: boolean) => { draftReminders.sendBatchExpiryReminder = v }"
          />
        </div>

        <!-- Reminder rule — read-only summary, or editable rule list when toggle on -->
        <div class="is-row is-row--stacked">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Reminder rule') }}</span>
            <span class="is-row-desc">{{ t('Set the timing schedule for expiry notifications.') }}</span>
          </div>

          <template v-if="editingSection === 'reminders' && draftReminders.sendBatchExpiryReminder">
            <div v-if="draftReminders.rules.length > 0" class="is-reminder-list">
              <span class="is-reminder-list-label">{{ t('Send reminder:') }}</span>
              <div v-for="rule in draftReminders.rules" :key="rule.id" class="is-reminder-item">
                <MpCheckbox :id="`is-rule-${rule.id}`" :is-checked="true" :aria-label="`${rule.days} days ${rule.timing.toLowerCase()} the expiry date`" />
                <span class="is-reminder-item-text">{{ rule.days }} {{ t('days') }} {{ rule.timing.toLowerCase() }} {{ t('the expiry date') }}</span>
                <MpPopover :id="`is-rule-menu-${rule.id}`" is-close-on-select use-portal placement="bottom-end">
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
              class="btn-enterprise btn-enterprise--secondary is-add-rule-btn"
              @click="openAddReminderModal"
            >
              {{ t('Add reminder rule') }}
            </MpButton>
          </template>
          <span v-else class="is-row-value">{{ reminderRuleSummary }}</span>
        </div>
      </div>

      <div v-if="editingSection === 'reminders'" class="is-action-bar">
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="requestCancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="saveEdit">{{ t('Save changes') }}</MpButton>
      </div>
    </section>

    <!-- ── Discard confirmation dialog ──────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="is-modal-fade">
        <div v-if="discardOpen" class="is-modal-scrim">
          <div class="is-modal is-modal--sm" role="dialog" :aria-label="t('Discard unsaved changes?')" @click.stop>
            <header class="is-modal-header">
              <h2 class="is-modal-title">{{ t('Discard unsaved changes?') }}</h2>
              <MpButton variant="ghost" size="sm" left-icon="close" :aria-label="t('Close')" @click="discardOpen = false" />
            </header>
            <div class="is-modal-body">
              <p class="is-dialog-body">{{ t('Your changes will not be saved.') }}</p>
            </div>
            <footer class="is-modal-footer">
              <div />
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="discardOpen = false">{{ t('Keep editing') }}</MpButton>
              <MpButton variant="danger" class="btn-enterprise btn-enterprise--danger" @click="exitEdit">{{ t('Discard') }}</MpButton>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Setup email reminder modal ─────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="is-modal-fade">
        <div v-if="reminderModalOpen" class="is-modal-scrim">
          <div class="is-modal" role="dialog" :aria-label="t('Setup email reminder')" @click.stop>
            <header class="is-modal-header">
              <h2 class="is-modal-title">{{ t('Setup email reminder') }}</h2>
              <MpButton variant="ghost" size="sm" left-icon="close" :aria-label="t('Close')" @click="reminderModalOpen = false" />
            </header>

            <div class="is-modal-body">
              <!-- Reminder rules -->
              <h3 class="is-modal-section-title">{{ t('Reminder rules') }}</h3>
              <span class="is-modal-field-label">{{ t('Send this reminder:') }}</span>
              <div class="is-modal-rule-row">
                <div class="is-modal-days-input">
                  <MpInput id="is-modal-days" v-model="modalForm.days" type="number" />
                </div>
                <span class="is-modal-days-label">{{ t('days') }}</span>
                <div class="is-modal-timing-select">
                  <MpAutocomplete
                    id="is-modal-timing"
                    v-model="modalForm.timing"
                    :data="TIMING_OPTIONS"
                    label-prop="name"
                    value-prop="id"
                    use-portal
                  />
                </div>
                <span class="is-modal-timing-label">{{ t('the expiry date') }}</span>
              </div>

              <!-- Email content -->
              <h3 class="is-modal-section-title is-modal-section-title--spaced">{{ t('Email content') }}</h3>

              <div class="is-modal-field">
                <MpFormControl>
                  <MpFormLabel>{{ t('Subject') }} <span class="is-required">*</span></MpFormLabel>
                  <MpInput id="is-modal-subject" v-model="modalForm.subject" is-full-width />
                </MpFormControl>
              </div>

              <div class="is-modal-field">
                <div class="is-modal-placeholder-row">
                  <span class="is-modal-body-label">{{ t('Body') }} <span class="is-required">*</span></span>
                  <MpPopover id="is-insert-placeholder" is-close-on-select use-portal placement="bottom-end">
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
                <MpTextarea id="is-modal-body" v-model="modalForm.body" is-full-width :rows="14" class="is-modal-body-textarea" />
              </div>

              <!-- Checkboxes -->
              <div class="is-modal-checks">
                <label class="is-checkbox-row">
                  <MpCheckbox id="is-modal-copy" :is-checked="modalForm.sendCopy" @change="modalForm.sendCopy = !modalForm.sendCopy" />
                  <span>{{ t('Send a copy to the person who created this batch') }}</span>
                </label>
              </div>
            </div>

            <footer class="is-modal-footer">
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost is-modal-footer-left">{{ t('Send test email') }}</MpButton>
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="reminderModalOpen = false">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="saveReminderRule">{{ t('Save') }}</MpButton>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ─── Page root — 12-column grid ─────────────────────────────────────────── */
.is-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}

/* ─── Section ────────────────────────────────────────────────────────────── */
.is-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  padding: var(--mp-spacing-6) 0;
}
.is-section:first-child { padding-top: 0; }

.is-section-header {
  grid-column: 1 / -1;
  margin-bottom: var(--mp-spacing-3);
}

.is-section-header--with-action {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
}

.is-section-meta {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

/* Hover Edit button — hidden by default, visible on section hover */
.is-edit-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.is-section--hoverable:hover .is-edit-btn {
  opacity: 1;
}
.is-section-header--with-action > .is-edit-btn {
  grid-column: 7;
  justify-self: start;
  margin-left: 24px;
}

.is-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.is-section-desc {
  margin: var(--mp-spacing-0\.5) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}

/* ─── Content area (first 6 cols) ────────────────────────────────────────── */
.is-content {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

/* ─── Rows ───────────────────────────────────────────────────────────────── */
.is-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
}

.is-row-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  flex: 1;
  min-width: 0;
}

.is-row-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.is-row-desc {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

.is-row-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  flex-shrink: 0;
}

/* Stacked rows — label on top, control below (edit mode) */
.is-row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: var(--mp-spacing-2);
}

/* Costing method select — stacked below label, half content width */
.is-costing-select {
  width: 50%;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.is-lock-hint {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

/* ─── Action bar (Save / Cancel) ────────────────────────────────────────── */
.is-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}

/* ─── Reminder rules list ───────────────────────────────────────────────── */
.is-reminder-list {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.is-reminder-list-label {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  margin-bottom: var(--mp-spacing-1);
}

.is-reminder-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}

.is-reminder-item-text {
  flex: 1;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.is-add-rule-btn {
  align-self: flex-start;
  margin-top: var(--mp-spacing-2);
}

/* ─── Checkbox row ──────────────────────────────────────────────────────── */
.is-checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}

/* ─── Modal ─────────────────────────────────────────────────────────────── */
.is-modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: var(--mp-color-overlay, rgba(20, 23, 28, 0.45)); /* pixel-police-allow: scrim overlay needs alpha */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-6);
}

.is-modal {
  width: min(720px, 96vw);
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  background: var(--mp-background-neutral, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.35); /* pixel-police-allow-shadow: modal elevation */
  overflow: hidden;
}

.is-modal--sm {
  width: min(440px, 96vw);
}

.is-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--mp-sizes-14, 56px); /* pixel-police-allow: modal header height */
  flex-shrink: 0;
  padding: 0 var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}

.is-modal-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.is-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--mp-spacing-6);
}

.is-dialog-body {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.is-modal-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg, 18px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.is-modal-section-title--spaced {
  margin-top: var(--mp-spacing-6);
}

.is-modal-field-label {
  display: block;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  margin-bottom: var(--mp-spacing-2);
}

.is-modal-rule-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.is-modal-days-input {
  width: var(--mp-sizes-25, 100px); /* pixel-police-allow: days input width */
}

.is-modal-days-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.is-modal-timing-select {
  width: var(--mp-sizes-35, 140px); /* pixel-police-allow: timing select width */
}

.is-modal-timing-label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.is-modal-field {
  margin-bottom: var(--mp-spacing-3);
}

.is-modal-placeholder-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--mp-spacing-2);
}

.is-modal-body-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.is-required {
  color: var(--mp-colors-red-400, #e53e3e);
}

.is-modal-field :deep(textarea.is-modal-body-textarea) {
  min-height: 320px !important; /* pixel-police-allow: mandatory minimum for email body */
}

.is-modal-checks {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-4);
}

.is-modal-footer {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  flex-shrink: 0;
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default);
}

.is-modal-footer-left {
  margin-right: auto;
}

.is-modal-fade-enter-active,
.is-modal-fade-leave-active {
  transition: opacity 200ms ease;
}
.is-modal-fade-enter-from,
.is-modal-fade-leave-to {
  opacity: 0;
}

/* ─── Divider ────────────────────────────────────────────────────────────── */
.is-divider {
  grid-column: 1 / -1;
  height: var(--mp-sizes-px, 1px); /* pixel-police-allow: divider thickness */
  background: var(--mp-border-default, #e3e7e9);
}
</style>
