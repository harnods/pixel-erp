<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/settings/inventory/views/GoodsAndServicesSettingsView.vue -->
<script setup lang="ts">
import {
  MpButton, MpToggle, MpIcon, MpAutocomplete, MpTooltip,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  css,
} from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  getInventorySettings, saveInventorySettings, COST_METHOD_OPTIONS,
  REMINDER_NAME_MAX_LENGTH, REMINDER_PLACEHOLDERS,
  type InventorySettings, type ProductFeature, type BatchReminderRule,
} from '~/data/inventorySettings'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()

// ─── State ───────────────────────────────────────────────────────────────────
const committed = reactive<InventorySettings>(getInventorySettings())
const features = ref<ProductFeature[]>(committed.features.map(f => ({ ...f })))
const costMethod = ref(committed.costMethod)
const reminderActive = ref(committed.batchReminderActive)
const reminders = ref<BatchReminderRule[]>(committed.reminders.map(r => ({ ...r })))

const isEditingProduct = ref(false)
const isEditingReminders = ref(false)
const isSaving = ref(false)

const costMethodLabel = computed(() => COST_METHOD_OPTIONS.find(o => o.id === committed.costMethod)?.name ?? '-')

function isDeactivateLocked(f: ProductFeature): boolean {
  return f.value && f.inUse && !!f.lockedReason
}

function persist() {
  saveInventorySettings(JSON.parse(JSON.stringify(committed)) as InventorySettings)
}

// ─── Product settings ────────────────────────────────────────────────────────
function cancelProduct() {
  features.value = committed.features.map(f => ({ ...f }))
  costMethod.value = committed.costMethod
  isEditingProduct.value = false
}
async function saveProduct() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 500))
  committed.features = features.value.map(f => ({ ...f }))
  committed.costMethod = costMethod.value
  persist()
  isSaving.value = false
  isEditingProduct.value = false
  successToast(t('Product settings changes saved'))
}

// ─── Batch reminders ─────────────────────────────────────────────────────────
function cancelReminders() {
  reminderActive.value = committed.batchReminderActive
  reminders.value = committed.reminders.map(r => ({ ...r }))
  isEditingReminders.value = false
}
async function saveReminders() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 500))
  committed.batchReminderActive = reminderActive.value
  committed.reminders = reminders.value.map(r => ({ ...r }))
  persist()
  isSaving.value = false
  isEditingReminders.value = false
  successToast(t('Batch reminder settings saved'))
}
function reminderRowText(r: BatchReminderRule): string {
  return `${r.threshold} ${t('days')} ${r.beforeExpiry ? t('before') : t('after')} ${t('the expiry date')}`
}
function resendEmail() { successToast(t('Email sent. Please check your inbox')) }

// ─── Email reminder settings modal ───────────────────────────────────────────
const TIMING_OPTIONS = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
]
const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ threshold: '7', timing: 'before', name: '', subject: '', body: '' })
const errors = reactive({ name: '', subject: '', body: '', threshold: '' })
const focusedField = ref<'subject' | 'body'>('body')

function openReminderModal(r?: BatchReminderRule) {
  editingId.value = r?.id ?? null
  form.threshold = String(r?.threshold ?? 7)
  form.timing = r ? (r.beforeExpiry ? 'before' : 'after') : 'before'
  form.name = r?.name ?? t('Reminder')
  form.subject = r?.subject ?? ''
  form.body = r?.body ?? ''
  Object.assign(errors, { name: '', subject: '', body: '', threshold: '' })
  modalOpen.value = true
}
function insertPlaceholder(token: string) {
  if (focusedField.value === 'subject') form.subject += token
  else form.body += token
}
function saveReminderRule() {
  const days = Number(form.threshold)
  errors.threshold = Number.isInteger(days) && days > 0 ? '' : t('Enter a number of days greater than 0')
  errors.name = form.name.trim() ? '' : t('You must fill in reminder title')
  if (!errors.name && reminders.value.some(r => r.id !== editingId.value && r.name.trim().toLowerCase() === form.name.trim().toLowerCase())) {
    errors.name = t('Title has been used. Enter a different one')
  }
  errors.subject = form.subject.trim() ? '' : t('Subject is required')
  errors.body = form.body.trim() ? '' : t('Body is required')
  if (errors.threshold || errors.name || errors.subject || errors.body) return
  const rule: BatchReminderRule = {
    id: editingId.value ?? `rem-${Date.now()}`,
    name: form.name.trim(), threshold: days, beforeExpiry: form.timing === 'before',
    subject: form.subject, body: form.body,
  }
  const i = reminders.value.findIndex(r => r.id === rule.id)
  if (i >= 0) reminders.value.splice(i, 1, rule)
  else reminders.value.push(rule)
  modalOpen.value = false
  successToast(t('Reminder rule saved'))
}

// ─── Delete reminder ─────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const reminderToDelete = ref<BatchReminderRule | null>(null)
function askDelete(r: BatchReminderRule) { reminderToDelete.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (reminderToDelete.value) {
    reminders.value = reminders.value.filter(r => r.id !== reminderToDelete.value!.id)
    successToast(t('Reminder rule deleted'))
  }
  reminderToDelete.value = null
}
</script>

<template>
  <div class="is-page">

    <!-- ── Product settings ─────────────────────────────────────────────── -->
    <section class="is-section">
      <div class="is-section-header">
        <div class="is-section-meta">
          <h2 class="is-section-title">{{ t('Product settings') }}</h2>
          <p class="is-section-desc">{{ t('Configure product features, tracking methods, and visibility settings.') }}</p>
        </div>
        <button
          v-if="!isEditingProduct"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="isEditingProduct = true"
        >
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <div class="is-rows">
        <div class="is-row">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Inventory costing method') }}</span>
            <span class="is-row-desc">{{ t('A method to calculate the cost of goods sold from the inventory.') }}</span>
          </div>
          <MpAutocomplete
            v-if="isEditingProduct && committed.isCostMethodEditable"
            id="is-cost-method-ac"
            v-model="costMethod"
            :data="COST_METHOD_OPTIONS"
            label-prop="name"
            value-prop="id"
            use-portal
            class="is-select"
          />
          <span v-else class="is-row-value">{{ t(costMethodLabel) }}</span>
        </div>

        <div v-for="f in features" :key="f.code" class="is-row">
          <div class="is-row-info">
            <span class="is-row-title">{{ t(f.label) }}</span>
            <span class="is-row-desc">{{ t(f.description) }}</span>
          </div>
          <MpTooltip v-if="isDeactivateLocked(f)" :label="t(f.lockedReason ?? '')" placement="top">
            <span class="is-toggle">
              <MpToggle :is-checked="f.value" is-disabled :aria-label="t(f.label)" />
            </span>
          </MpTooltip>
          <span v-else class="is-toggle">
            <MpToggle
              v-model:is-checked="f.value"
              :is-disabled="!isEditingProduct || isSaving"
              :aria-label="t(f.label)"
            />
          </span>
        </div>
      </div>

      <div v-if="isEditingProduct" class="is-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="cancelProduct">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveProduct">
          {{ isSaving ? t('Saving…') : t('Save changes') }}
        </button>
      </div>
    </section>

    <!-- ── Batch reminders ──────────────────────────────────────────────── -->
    <section class="is-section">
      <div class="is-section-header">
        <div class="is-section-meta">
          <h2 class="is-section-title">{{ isEditingReminders ? t('Edit batch reminders') : t('Batch reminders') }}</h2>
          <p class="is-section-desc">{{ t('Automated email reminders for expiring inventory batches.') }}</p>
        </div>
        <button
          v-if="!isEditingReminders"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="isEditingReminders = true"
        >
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <MpBanner v-if="!committed.emailConfirmed" id="is-email-banner" variant="warning" class="is-banner">
        <MpBannerIcon id="is-email-banner-icon" />
        <MpBannerTitle>{{ t('Email address not verified') }}</MpBannerTitle>
        <MpBannerDescription>
          {{ t('To receive batch reminders, verify your email address by clicking the confirmation link in your inbox.') }}
          <a class="is-link" @click="resendEmail">{{ t('Resend email') }}</a>
        </MpBannerDescription>
      </MpBanner>

      <div class="is-rows">
        <div class="is-row">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Send batch expiry reminder email') }}</span>
            <span class="is-row-desc">{{ t('Automatically notify warehouse staff when batches are approaching expiration.') }}</span>
          </div>
          <span class="is-toggle">
            <MpToggle
              v-model:is-checked="reminderActive"
              :is-disabled="!isEditingReminders || isSaving"
              :aria-label="t('Send batch expiry reminder email')"
            />
          </span>
        </div>

        <div v-if="isEditingReminders && reminderActive" class="is-row is-row--top">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Reminder rule') }}</span>
            <span class="is-row-desc">{{ t('Set the timing schedule for email notifications.') }}</span>
          </div>
          <div class="is-reminders">
            <div v-for="r in reminders" :key="r.id" class="is-reminder">
              <span class="is-reminder-text">
                <MpIcon name="envelope" size="sm" />
                {{ reminderRowText(r) }}
              </span>
              <MpPopover :id="`is-reminder-actions-${r.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Reminder actions')" is-rounded />
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="openReminderModal(r)">{{ t('Edit') }}</MpPopoverListItem>
                    <MpPopoverListItem @click="askDelete(r)">{{ t('Delete') }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </div>
            <button class="btn-enterprise btn-enterprise--secondary is-add-reminder" @click="openReminderModal()">
              {{ t('Add reminder rule') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="isEditingReminders" class="is-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="cancelReminders">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveReminders">
          {{ isSaving ? t('Saving…') : t('Save changes') }}
        </button>
      </div>
    </section>

    <!-- ── Email reminder settings modal ─────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="erm">
        <div v-if="modalOpen" class="erm-overlay">
          <div class="erm-panel" role="dialog" aria-modal="true" :aria-label="t('Email reminder settings')">
            <header class="erm-header">
              <span class="erm-title">{{ t('Email reminder settings') }}</span>
              <MpButton class="erm-close" is-rounded :aria-label="t('Close')" @click="modalOpen = false">
                <MpIcon name="close" size="md" />
              </MpButton>
            </header>
            <div class="erm-body">
              <h3 class="erm-section-title">{{ t('Reminder rules') }}</h3>
              <p class="erm-text">{{ t('Send this reminder:') }}</p>
              <div class="erm-rule-row">
                <div class="erm-days">
                  <MpInput id="erm-threshold" v-model="form.threshold" type="number" :is-invalid="!!errors.threshold" />
                  <span class="erm-suffix">{{ t('days') }}</span>
                </div>
                <ErpFilterSelect
                  id="erm-timing"
                  :model-value="form.timing"
                  placeholder="Before"
                  :options="TIMING_OPTIONS"
                  :is-clearable="false"
                  width="140px"
                  @update:model-value="(v: string) => (form.timing = v)"
                />
                <span class="erm-text">{{ t('the expiry date') }}</span>
              </div>
              <p v-if="errors.threshold" class="erm-error">{{ errors.threshold }}</p>

              <h3 class="erm-section-title erm-section-title--spaced">{{ t('Email content') }}</h3>
              <MpFormControl id="erm-name" is-required :is-invalid="!!errors.name">
                <div class="erm-label-row">
                  <MpFormLabel>{{ t('Reminder title') }}</MpFormLabel>
                  <span class="erm-counter">{{ form.name.length }}/{{ REMINDER_NAME_MAX_LENGTH }}</span>
                </div>
                <MpInput id="erm-name-input" v-model="form.name" :maxlength="REMINDER_NAME_MAX_LENGTH" />
                <MpFormErrorMessage>{{ errors.name }}</MpFormErrorMessage>
              </MpFormControl>
              <MpFormControl id="erm-subject" is-required :is-invalid="!!errors.subject">
                <MpFormLabel>{{ t('Subject') }}</MpFormLabel>
                <MpInput id="erm-subject-input" v-model="form.subject" @focus="focusedField = 'subject'" />
                <MpFormErrorMessage>{{ errors.subject }}</MpFormErrorMessage>
              </MpFormControl>
              <div class="erm-insert">
                <MpPopover id="erm-placeholder" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <MpButton variant="textLink" right-icon="chevrons-down" is-rounded>{{ t('Insert placeholder') }}</MpButton>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem v-for="p in REMINDER_PLACEHOLDERS" :key="p.value" @click="insertPlaceholder(p.value)">
                        {{ t(p.label) }}
                      </MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </div>
              <MpFormControl id="erm-body" is-required :is-invalid="!!errors.body">
                <MpFormLabel>{{ t('Body') }}</MpFormLabel>
                <MpTextarea id="erm-body-input" v-model="form.body" class="erm-textarea" @focus="focusedField = 'body'" />
                <MpFormErrorMessage>{{ errors.body }}</MpFormErrorMessage>
              </MpFormControl>
            </div>
            <footer class="erm-footer">
              <button class="btn-enterprise btn-enterprise--ghost" @click="modalOpen = false">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" @click="saveReminderRule">{{ editingId ? t('Save changes') : t('Save') }}</button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete reminder rule?')"
      :description="t(`This reminder rule will be permanently removed and can't be undone.`)"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.is-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-8);
  overflow-y: auto;
  height: 100%;
}
.is-section { grid-column: 1 / 8; display: flex; flex-direction: column; }
.is-section-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3);
}
.is-section-meta { display: flex; flex-direction: column; }
.is-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.is-section-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.is-banner { margin-bottom: var(--mp-spacing-3); }
.is-link { color: var(--mp-text-link); cursor: pointer; font-weight: var(--mp-font-weights-semi-bold); }
.is-rows { display: flex; flex-direction: column; }
.is-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-6); padding: var(--mp-spacing-3) 0;
}
.is-row--top { align-items: flex-start; }
.is-row-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.is-row-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.is-row-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.is-row-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); flex-shrink: 0; }
.is-select { width: 240px; flex-shrink: 0; }
.is-toggle { display: inline-flex; flex-shrink: 0; }
.is-reminders { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-2); flex-shrink: 0; min-width: 320px; }
.is-reminder {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  width: 100%; padding: var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.is-reminder-text { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.is-add-reminder { align-self: flex-start; }
.is-action-bar { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
.is-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }


/* Email reminder settings — centred dialog, same shell as CouriersPage's modal. */
.erm-enter-active, .erm-leave-active { transition: opacity 200ms ease; }
.erm-enter-from, .erm-leave-to { opacity: 0; }
.erm-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(8, 13, 14, 0.45));
  display: flex; align-items: center; justify-content: center;
}
.erm-panel {
  width: min(640px, calc(100% - 32px)); max-height: calc(100% - 48px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-lg, 12px);
}
.erm-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.erm-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.erm-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default);
}
.erm-close:hover { background: var(--mp-background-neutral-hovered); }
.erm-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.erm-section-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.erm-section-title--spaced { margin-top: var(--mp-spacing-2); }
.erm-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.erm-rule-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.erm-days { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 140px; }
.erm-suffix { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.erm-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.erm-label-row { display: flex; align-items: center; justify-content: space-between; }
.erm-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.erm-insert { display: flex; justify-content: flex-end; margin-bottom: calc(-1 * var(--mp-spacing-3)); }
.erm-textarea { min-height: 200px; }
.erm-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default);
}
</style>
