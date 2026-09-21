<script setup lang="ts">
/**
 * Add a product to a vendor (TS-002 / US-03).
 *
 * The catalogue normally builds itself from approved Supplier Invoices, so this
 * path exists for the case the derivation cannot cover: a vendor you have agreed
 * terms with but not yet bought from. That is the cold start the PRD calls out —
 * without it, a new vendor's tab is empty until the first invoice clears, which is
 * exactly when a buyer most needs the ordering terms.
 *
 * Consequences of that framing, visible in the form:
 *   • No price field. Price is derived from an approved invoice (Rule 5) and there
 *     is none yet, so the row is created as "no purchase yet". Offering a price box
 *     here would invite someone to type a number the system would then present as
 *     if it came off a document.
 *   • Only inventory-tracked products can be picked (Rule 3). Service and
 *     non-inventory items never carry a vendor supply relationship.
 *   • The pair is unique (Rule 4); products already on this vendor are not offered.
 *
 * Footer actions are always rendered and always clickable — an unmet precondition
 * produces an inline error under the field, never a disabled button
 * (rule/btn-no-disabled-validation, rule/form-errors-inline).
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpInput, MpAutocomplete,
} from '@mekari/pixel3'
import { CATALOG } from '~/data/catalog'
import { upsertVendorItem } from '~/data/vendorItems'
import { largestUnitFor, unitOptionsForSku } from '~/data/productUnits'

const props = defineProps<{
  open: boolean
  vendorMasterId: string
  vendorName: string
  /** SKUs already linked to this vendor — Rule 4 keeps the pair unique. */
  takenSkus: string[]
}>()
const emit = defineEmits<{ close: []; added: [sku: string] }>()

const { t } = useLocale()

const sku = ref('')
const purchaseUnit = ref('')
const moq = ref('')
const purchaseMultiple = ref('')

const skuError = ref('')
const termsError = ref('')

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  sku.value = ''
  purchaseUnit.value = ''
  moq.value = ''
  purchaseMultiple.value = ''
  skuError.value = ''
  termsError.value = ''
})

/** Rule 3 + Rule 4 — inventory products only, and none already on this vendor. */
const options = computed(() => {
  const taken = new Set(props.takenSkus)
  return CATALOG
    .filter((c) => !taken.has(c.sku))
    .map((c) => ({ label: `${c.name} (${c.sku})`, value: c.sku }))
})

const unitOptions = computed(() =>
  sku.value ? unitOptionsForSku(sku.value).map((u) => ({ label: u.name, value: u.name })) : [])

function onSkuChange(v: string): void {
  sku.value = v
  skuError.value = ''
  // Default to the largest registered unit — the natural bulk-buy unit, and the
  // one a vendor's minimum is almost always quoted in.
  purchaseUnit.value = v ? largestUnitFor(v).name : ''
}

function close(): void { emit('close') }

function submit(): void {
  skuError.value = ''
  termsError.value = ''

  if (!sku.value) {
    skuError.value = t('You must select product')
    return
  }

  // Rule 20 — both terms are optional, but a value that IS given must be a whole
  // number above zero. Blank is a legitimate answer: it means "not agreed yet",
  // which is honest, whereas 0 would read as an agreed minimum of nothing.
  const m = moq.value.trim()
  const pm = purchaseMultiple.value.trim()
  const invalid = (v: string) => v !== '' && (!Number.isInteger(Number(v)) || Number(v) <= 0)
  if (invalid(m) || invalid(pm)) {
    termsError.value = t('Quantity must be a whole number above 0. Please check your entry')
    return
  }

  upsertVendorItem({
    vendorId: props.vendorMasterId,
    sku: sku.value,
    moq: m === '' ? 1 : Number(m),
    packSize: pm === '' ? 1 : Number(pm),
    purchaseUnit: purchaseUnit.value || undefined,
  })
  emit('added', sku.value)
}
</script>

<template>
  <MpModal
    id="add-vendor-product"
    :is-open="open"
    size="md"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Add product') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="avp-intro">
          {{ t('Add a product this vendor supplies but has not invoiced you for yet, so its ordering terms are ready before the first purchase order.') }}
        </p>

        <div class="avp-fields">
          <MpFormControl id="avp-sku" is-required :is-invalid="!!skuError">
            <MpFormLabel>{{ t('Product') }}</MpFormLabel>
            <MpAutocomplete
              id="avp-sku-ac"
              :model-value="sku"
              :data="options"
              label-prop="label"
              value-prop="value"
              is-searchable
              use-portal
              is-full-width
              :is-invalid="!!skuError"
              @update:model-value="(v: string) => onSkuChange(v)"
            />
            <MpFormHelpText>{{ t('Only inventory-tracked products can be supplied') }}</MpFormHelpText>
            <MpFormErrorMessage>{{ skuError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl v-if="sku" id="avp-unit">
            <MpFormLabel>{{ t('Purchase unit') }}</MpFormLabel>
            <MpAutocomplete
              id="avp-unit-ac"
              v-model="purchaseUnit"
              :data="unitOptions"
              label-prop="label"
              value-prop="value"
              use-portal
              is-full-width
            />
            <MpFormHelpText>{{ t('Minimum and multiple are counted in this unit') }}</MpFormHelpText>
          </MpFormControl>

          <div class="avp-row">
            <MpFormControl id="avp-moq" :is-invalid="!!termsError">
              <MpFormLabel>{{ t('Min. order qty') }}</MpFormLabel>
              <MpInput id="avp-moq-input" v-model="moq" type="number" is-full-width />
            </MpFormControl>

            <MpFormControl id="avp-multiple" :is-invalid="!!termsError">
              <MpFormLabel>{{ t('Purchase multiple') }}</MpFormLabel>
              <MpInput id="avp-multiple-input" v-model="purchaseMultiple" type="number" is-full-width />
            </MpFormControl>
          </div>

          <!-- One shared caption for both terms: the relationship between them is
               what a buyer needs, not two separate definitions (Rule 21). -->
          <p class="avp-hint">
            {{ t('A valid order quantity is the minimum plus any number of multiples. With a minimum of 100 and a multiple of 25, you can order 100, 125 or 150. Leave either field empty if it is not agreed yet.') }}
          </p>
          <p v-if="termsError" class="avp-error">{{ termsError }}</p>

          <p class="avp-note">
            {{ t('Last price stays empty until a supplier invoice from this vendor is approved for this product.') }}
          </p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="avp-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">{{ t('Add product') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.avp-intro {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.avp-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.avp-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.avp-hint {
  margin: calc(-1 * var(--mp-spacing-3)) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.avp-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-critical, #c0392b);
}
.avp-note {
  margin: 0;
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.avp-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }

@media (max-width: 560px) {
  .avp-row { grid-template-columns: 1fr; }
}
</style>
