<script setup lang="ts">
/**
 * Edit one row's ordering terms (US-04, reached from the row's [...] menu).
 *
 * The table's inline edit is the fast path for changing a number. This is the full
 * path: it is the only place the UNIT of each term can be changed, because a unit
 * change means something different from a number change. Going from "minimum 4" to
 * "minimum 6" is a renegotiation; going from "4 Pallet" to "4 Carton" silently
 * divides the commitment by the conversion factor. Putting the unit behind a
 * deliberate action, with both terms visible at once, makes that consequence
 * visible before it is saved.
 *
 * The two units are independent on purpose: a vendor can set a floor in one unit
 * ("at least 1 Pallet") and step the order in another ("then add Cartons"). Forcing
 * both onto a single purchase unit would make that vendor unrepresentable.
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpInput, MpAutocomplete,
} from '@mekari/pixel3'
import { unitOptionsForSku } from '~/data/productUnits'

const props = defineProps<{
  open: boolean
  sku: string
  productName: string
  moq: number
  moqUnit: string
  purchaseMultiple: number
  multipleUnit: string
}>()
const emit = defineEmits<{
  close: []
  save: [payload: { moq: number; moqUnit: string; purchaseMultiple: number; multipleUnit: string }]
}>()

const { t } = useLocale()

const moq = ref('')
const moqUnit = ref('')
const multiple = ref('')
const multipleUnit = ref('')
const error = ref('')

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  moq.value = String(props.moq)
  moqUnit.value = props.moqUnit
  multiple.value = String(props.purchaseMultiple)
  multipleUnit.value = props.multipleUnit
  error.value = ''
}, { immediate: true })

/** Units a product is actually handled in — its base unit plus every registered
 *  conversion. Offering anything else would let a term reference a unit the
 *  product cannot be converted to. */
const unitOptions = computed(() =>
  unitOptionsForSku(props.sku).map((u) => ({ label: u.name, value: u.name })))

/** A worked example in the user's own numbers, so the rule is read off their data
 *  rather than from an abstract definition. */
const example = computed(() => {
  const m = Number(moq.value)
  const step = Number(multiple.value)
  if (!Number.isFinite(m) || !Number.isFinite(step) || m <= 0 || step <= 0) return ''
  const unit = moqUnit.value || ''
  return [m, m + step, m + step * 2].join(', ') + (unit ? ` ${unit}` : '')
})

function close(): void { emit('close') }

function submit(): void {
  const m = Number(moq.value)
  const step = Number(multiple.value)
  // Rule 20 — a stored term must be a whole number above zero. The button is never
  // disabled; a bad value is reported inline and the input keeps what was typed.
  if (!Number.isInteger(m) || m <= 0 || !Number.isInteger(step) || step <= 0) {
    error.value = t('Quantity must be a whole number above 0. Please check your entry')
    return
  }
  emit('save', {
    moq: m,
    moqUnit: moqUnit.value,
    purchaseMultiple: step,
    multipleUnit: multipleUnit.value,
  })
}
</script>

<template>
  <MpModal
    id="edit-vendor-terms"
    :is-open="open"
    size="md"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Edit ordering terms') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="evt-product">{{ productName }}</p>
        <p class="evt-intro">
          {{ t('These are the two rules this vendor sets for how much you can order. Price is not edited here: it comes from the supplier invoice.') }}
        </p>

        <div class="evt-fields">
          <div class="evt-row">
            <MpFormControl id="evt-moq" class="evt-num" :is-invalid="!!error">
              <MpFormLabel>{{ t('Minimum order qty') }}</MpFormLabel>
              <MpInput id="evt-moq-input" v-model="moq" type="number" is-full-width />
            </MpFormControl>
            <MpFormControl id="evt-moq-unit" class="evt-unit">
              <MpFormLabel>{{ t('Unit') }}</MpFormLabel>
              <MpAutocomplete
                id="evt-moq-unit-ac"
                v-model="moqUnit"
                :data="unitOptions"
                label-prop="label"
                value-prop="value"
                use-portal
                is-full-width
              />
            </MpFormControl>
          </div>
          <p class="evt-caption">{{ t('The smallest amount this vendor will accept on one order') }}</p>

          <div class="evt-row">
            <MpFormControl id="evt-step" class="evt-num" :is-invalid="!!error">
              <MpFormLabel>{{ t('Order in multiples of') }}</MpFormLabel>
              <MpInput id="evt-step-input" v-model="multiple" type="number" is-full-width />
            </MpFormControl>
            <MpFormControl id="evt-step-unit" class="evt-unit">
              <MpFormLabel>{{ t('Unit') }}</MpFormLabel>
              <MpAutocomplete
                id="evt-step-unit-ac"
                v-model="multipleUnit"
                :data="unitOptions"
                label-prop="label"
                value-prop="value"
                use-portal
                is-full-width
              />
            </MpFormControl>
          </div>
          <p class="evt-caption">{{ t('Above the minimum, quantity goes up in this amount only') }}</p>

          <!-- The rule stated in the user's own numbers. Short sentences, one idea
               each, no jargon — a definition of "multiple" helps nobody who did not
               already know the term. -->
          <p v-if="example" class="evt-example">
            <strong>{{ t('You can order') }}:</strong> {{ example }}…
          </p>

          <p v-if="error" class="evt-error">{{ error }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="evt-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">{{ t('Save changes') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.evt-product {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.evt-intro {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.evt-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.evt-row { display: flex; gap: var(--mp-spacing-3); align-items: flex-end; }
.evt-num { flex: 1 1 60%; }
.evt-unit { flex: 1 1 40%; }
.evt-caption {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.evt-example {
  margin: var(--mp-spacing-2) 0 0;
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.evt-error {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-critical, #c0392b);
}
.evt-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }

@media (max-width: 560px) {
  .evt-row { flex-direction: column; align-items: stretch; }
}
</style>
