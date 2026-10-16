<script setup lang="ts">
import { reactive, computed } from 'vue'
import {
  MpButton, MpToggle, MpAutocomplete, MpInput,
  toast,
} from '@mekari/pixel3'

const { t } = useLocale()

// Costing method is locked once any inventory transaction exists — changing it
// would retroactively alter COGS on posted documents, so the form is disabled.
// In this prototype the seed company already has inventory movement.
const hasInventoryTransactions = true

// ─── Product settings state ─────────────────────────────────────────────────
const product = reactive({
  costingMethod: 'average',
  stockInfoOnForms: true,
  barcodeScanning: true,
  productVariant: true,
  serialNumberTracking: true,
  batchTracking: true,
})

const COSTING_METHOD_OPTIONS = [
  { id: 'average', name: 'Average cost' },
  { id: 'fifo', name: 'FIFO (First In, First Out)' },
]
const costingMethodLabel = computed(() =>
  COSTING_METHOD_OPTIONS.find(o => o.id === product.costingMethod)?.name ?? '',
)

const PRODUCT_TOGGLES = [
  { key: 'stockInfoOnForms', title: t('Stock info on sales & purchases'), desc: t('Show available quantity (Qty on Hand) while creating sales and purchase forms.') },
  { key: 'barcodeScanning', title: t('Barcode scanning'), desc: t('Enable scanning to quickly add items to transactions using physical barcodes.') },
  { key: 'productVariant', title: t('Product variant'), desc: t('Enable products with multiple attributes (e.g. Size, Color, Material).') },
  { key: 'serialNumberTracking', title: t('Serial number tracking'), desc: t('Track individual items using unique ID.') },
  { key: 'batchTracking', title: t('Batch tracking'), desc: t('Track inventory groups by expiration dates or lot numbers.') },
] as const

// ─── Batch reminders state ──────────────────────────────────────────────────
const reminders = reactive({
  sendBatchExpiryReminder: false,
})

// ─── Edit mode ──────────────────────────────────────────────────────────────
const isEditing = reactive<Record<string, boolean>>({
  product: false,
  reminders: false,
})
</script>

<template>
  <div class="is-page" data-devchange="settings-inventory-page">

    <!-- ── Product settings ──────────────────────────────────────────────── -->
    <section class="is-section" :class="{ 'is-section--hoverable': !isEditing.product }">
      <div class="is-section-header is-section-header--with-action">
        <div class="is-section-meta">
          <h2 class="is-section-title">{{ isEditing.product ? t('Edit product settings') : t('Product settings') }}</h2>
          <p class="is-section-desc">{{ t('Configure product features, tracking methods, and visibility settings.') }}</p>
        </div>
        <MpButton
          v-if="!isEditing.product"
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before is-edit-btn"
          left-icon="edit"
          @click="isEditing.product = true"
        >
          {{ t('Edit') }}
        </MpButton>
      </div>

      <div class="is-content">
        <!-- Inventory costing method — locked once transactions exist -->
        <div class="is-row" :class="{ 'is-row--stacked': isEditing.product }">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Inventory costing method') }}</span>
            <span v-if="!isEditing.product" class="is-row-desc">{{ t('A method to calculate the cost of goods sold from the inventory.') }}</span>
          </div>

          <template v-if="isEditing.product">
            <!-- Locked: disabled field + explanation (transactions already posted) -->
            <div v-if="hasInventoryTransactions" class="is-costing-select">
              <MpInput id="is-costing-locked" :model-value="costingMethodLabel" is-full-width is-disabled />
              <span class="is-lock-hint">{{ t('Locked because inventory transactions already exist. Changing it would affect COGS on posted documents.') }}</span>
            </div>
            <!-- Unlocked: editable select (no transactions yet) -->
            <div v-else class="is-costing-select">
              <MpAutocomplete
                id="is-costing-ac"
                v-model="product.costingMethod"
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
            :is-checked="(product as Record<string, unknown>)[toggle.key] as boolean"
            :is-disabled="!isEditing.product"
            :aria-label="toggle.title"
            @update:is-checked="(v: boolean) => { (product as Record<string, unknown>)[toggle.key] = v }"
          />
        </div>
      </div>

      <div v-if="isEditing.product" class="is-action-bar">
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="isEditing.product = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="isEditing.product = false; toast.notify({ variant: 'success', title: t('Product settings changes saved'), maxWidth: 'max-content' })">{{ t('Save changes') }}</MpButton>
      </div>
    </section>

    <div class="is-divider" />

    <!-- ── Batch reminders ───────────────────────────────────────────────── -->
    <section class="is-section" :class="{ 'is-section--hoverable': !isEditing.reminders }">
      <div class="is-section-header is-section-header--with-action">
        <div class="is-section-meta">
          <h2 class="is-section-title">{{ isEditing.reminders ? t('Edit batch reminders') : t('Batch reminders') }}</h2>
          <p class="is-section-desc">{{ t('Automated email reminders for expiring inventory batches.') }}</p>
        </div>
        <MpButton
          v-if="!isEditing.reminders"
          variant="secondary"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before is-edit-btn"
          left-icon="edit"
          @click="isEditing.reminders = true"
        >
          {{ t('Edit') }}
        </MpButton>
      </div>

      <div class="is-content">
        <div class="is-row">
          <div class="is-row-info">
            <span class="is-row-title">{{ t('Send batch expiry reminder email') }}</span>
            <span class="is-row-desc">{{ t('Automatically notify warehouse staff when batches are approaching expiration.') }}</span>
          </div>
          <MpToggle
            :is-checked="reminders.sendBatchExpiryReminder"
            :is-disabled="!isEditing.reminders"
            :aria-label="t('Send batch expiry reminder email')"
            @update:is-checked="(v: boolean) => { reminders.sendBatchExpiryReminder = v }"
          />
        </div>
      </div>

      <div v-if="isEditing.reminders" class="is-action-bar">
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="isEditing.reminders = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" @click="isEditing.reminders = false; toast.notify({ variant: 'success', title: t('Batch reminders changes saved'), maxWidth: 'max-content' })">{{ t('Save changes') }}</MpButton>
      </div>
    </section>
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
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
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
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
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

/* ─── Divider ────────────────────────────────────────────────────────────── */
.is-divider {
  grid-column: 1 / -1;
  height: var(--mp-sizes-px, 1px); /* pixel-police-allow: divider thickness */
  background: var(--mp-border-default, #e3e7e9);
}
</style>
