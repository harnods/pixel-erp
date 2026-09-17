<script setup lang="ts">
/**
 * Inline "New product" for the WMS Standalone package — opened from a product
 * combobox when what the operator is receiving isn't in the catalogue yet.
 *
 * Deliberately NOT the full New product form. WMS has no pricing, costing or
 * accounting, so selling price, sales/purchase/discount/inventory accounts and
 * tax all stay out; what's left is what a warehouse actually needs to identify
 * and stock an item. Tracking isn't a yes/no here either — a WMS product is
 * always tracked, so the only question is how.
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpAutocomplete,
} from '@mekari/pixel3'
import BarcodeSettingsButton from '~/components/patterns/BarcodeSettingsButton.vue'
import { PRODUCTS, type Product } from '~/data/inventory'
import { customProducts, addCustomProduct } from '~/data/customProducts'

const props = defineProps<{
  open: boolean
  /** Prefills the name when the operator typed a search term before adding. */
  initialName?: string
}>()
const emit = defineEmits<{
  'update:open': [boolean]
  'created': [product: Product]
}>()

const { t } = useLocale()

const NAME_MAX = 60

const name = ref('')
const sku = ref('')
const unit = ref('')
const barcode = ref('')
const minStock = ref('')
const trackStockBy = ref('Quantity')

const nameError = ref('')
const skuError = ref('')
const unitError = ref('')

const unitOptions = computed(() =>
  [...new Set(['Pcs', ...PRODUCTS.map(p => p.unit)])].sort().map(u => ({ label: u, value: u })),
)
const trackStockByOptions = [
  { label: t('Quantity'), value: 'Quantity' },
  { label: t('Batch'), value: 'Batch' },
  { label: t('Serial number'), value: 'Serial number' },
]

function reset() {
  name.value = props.initialName?.trim() ?? ''
  sku.value = ''
  unit.value = ''
  barcode.value = ''
  minStock.value = ''
  trackStockBy.value = 'Quantity'
  nameError.value = ''
  skuError.value = ''
  unitError.value = ''
}
watch(() => props.open, (isOpen) => { if (isOpen) reset() })

function close() { emit('update:open', false) }

function validate(): boolean {
  nameError.value = ''
  skuError.value = ''
  unitError.value = ''

  if (!name.value.trim()) nameError.value = t('You must fill in product name')
  if (!sku.value.trim()) {
    skuError.value = t('You must fill in SKU')
  } else {
    // A duplicate SKU would silently point stock at the wrong product later.
    const taken = [...PRODUCTS, ...customProducts].some(
      p => p.sku.toUpperCase() === sku.value.trim().toUpperCase(),
    )
    if (taken) skuError.value = t('SKU already taken')
  }
  if (!unit.value) unitError.value = t('You must select base unit')

  return !(nameError.value || skuError.value || unitError.value)
}

function save() {
  if (!validate()) return
  const product = addCustomProduct({
    sku: sku.value.trim(),
    name: name.value.trim(),
    desc: '',
    img: '',
    // WMS doesn't ask for a category — it's an ERP merchandising field. Left
    // unset rather than guessed, so nothing downstream reads a fabricated one.
    category: 'Uncategorized',
    unit: unit.value,
    // Scanning is how a warehouse identifies stock, so the barcode is a WMS
    // field even though pricing isn't. Blank is fine — the product simply has
    // no real barcode yet.
    barcode: barcode.value.trim() || undefined,
    // No pricing in the WMS package; these exist on the shared Product type.
    sellPrice: 0,
    buyPrice: 0,
    averageCost: 0,
    lastPurchaseCost: 0,
    minStock: minStock.value ? Number(minStock.value.replace(/\D/g, '')) : undefined,
    trackStockBy: trackStockBy.value,
  })
  emit('created', product)
  close()
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="wms-new-product" :is-open="open" size="md" :is-keep-alive="false" @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('New product') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="npm-fields">
          <MpFormControl id="npm-name" is-required :is-invalid="!!nameError">
            <div class="npm-label-row">
              <MpFormLabel>{{ t('Product name') }}</MpFormLabel>
              <span class="npm-counter">{{ name.length }} / {{ NAME_MAX }}</span>
            </div>
            <MpInput
              id="npm-name-input" v-model="name" :maxlength="NAME_MAX"
              :placeholder="t('Enter product name')" is-full-width :is-invalid="!!nameError"
              @input="nameError = ''"
            />
            <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="npm-row">
            <MpFormControl id="npm-sku" class="npm-field" is-required :is-invalid="!!skuError">
              <MpFormLabel>{{ t('SKU') }}</MpFormLabel>
              <MpInput
                id="npm-sku-input" v-model="sku" :placeholder="t('Enter SKU')"
                is-full-width :is-invalid="!!skuError" @input="skuError = ''"
              />
              <MpFormErrorMessage>{{ skuError }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="npm-unit" class="npm-field" is-required :is-invalid="!!unitError">
              <MpFormLabel>{{ t('Base unit') }}</MpFormLabel>
              <MpAutocomplete
                id="npm-unit-ac" v-model="unit" :data="unitOptions" label-prop="label" value-prop="value"
                :placeholder="t('Select base unit')" is-searchable use-portal is-full-width
                :is-invalid="!!unitError" @update:model-value="unitError = ''"
              />
              <MpFormErrorMessage>{{ unitError }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <MpFormControl id="npm-barcode">
            <div class="npm-label-row">
              <MpFormLabel>{{ t('Barcode') }}</MpFormLabel>
              <BarcodeSettingsButton @generated="barcode = $event" />
            </div>
            <MpInput
              id="npm-barcode-input" v-model="barcode"
              :placeholder="t('Enter barcode or generate')" is-full-width
            />
          </MpFormControl>

          <h3 class="npm-section-title">{{ t('Inventory info') }}</h3>

          <div class="npm-row">
            <MpFormControl id="npm-min-stock" class="npm-field">
              <MpFormLabel>{{ t('Min. stock') }}</MpFormLabel>
              <div class="npm-suffix-wrap">
                <input
                  id="npm-min-stock-input" v-model="minStock" class="npm-suffix-input"
                  type="text" inputmode="numeric" placeholder="0"
                />
                <span class="npm-suffix-chip">{{ unit || 'Pcs' }}</span>
              </div>
            </MpFormControl>

            <MpFormControl id="npm-track-by" class="npm-field" is-required>
              <MpFormLabel>{{ t('Track stock by') }}</MpFormLabel>
              <MpAutocomplete
                id="npm-track-by-ac" v-model="trackStockBy" :data="trackStockByOptions"
                label-prop="label" value-prop="value" is-searchable use-portal is-full-width
              />
            </MpFormControl>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="npm-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.npm-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.npm-row { display: flex; gap: var(--mp-spacing-4); }
.npm-field { flex: 1; min-width: 0; }
.npm-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); }
.npm-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.npm-section-title {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.npm-suffix-wrap {
  display: flex; align-items: center;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); overflow: hidden;
}
.npm-suffix-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.npm-suffix-chip {
  flex-shrink: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-left: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.npm-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }
</style>
