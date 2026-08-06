<script setup lang="ts">
/**
 * EditClassificationModal — "Edit classification" (Figma 4707:65141).
 *
 * Reclassifies a file under review when OCR guessed wrong. The classification
 * the file already has is left out of the list — picking it again would be a
 * no-op — so an expense offers Payment receipt + Invoice, an invoice offers
 * Payment receipt + Expense, and so on.
 *
 * The caller owns what "save" means (each surface moves the file somewhere
 * different), so this only reports the chosen classification.
 */
import { ref, computed, watch } from 'vue'
import {
  MpRadio,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'

export type Classification = 'payment_receipt' | 'invoice' | 'expense'

const props = defineProps<{
  isOpen: boolean
  /** What the file is classified as right now — omitted from the choices. */
  current: Classification
}>()

const emit = defineEmits<{ close: []; save: [Classification] }>()

const { t } = useLocale()

const OPTIONS: { value: Classification; label: string; caption: string }[] = [
  {
    value: 'payment_receipt',
    label: t('Payment receipt'),
    caption: t('A document confirming a payment you received from a vendor or supplier.'),
  },
  {
    value: 'invoice',
    label: t('Invoice'),
    caption: t('A document confirming items you ordered from a vendor or supplier.'),
  },
  {
    value: 'expense',
    label: t('Expense'),
    caption: t('A receipt or nota for costs paid directly such as meals, transport, or supplies.'),
  },
]

const choices = computed(() => OPTIONS.filter((o) => o.value !== props.current))

const pending = ref<Classification | ''>('')
// Reopening should always start from a clean slate rather than the last pick.
watch(() => props.isOpen, (open) => { if (open) pending.value = '' })

function save() {
  if (!pending.value) return
  emit('save', pending.value)
}
</script>

<template>
  <MpModal
    id="edit-classification-modal"
    :is-open="isOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="emit('close')"
  >
    <MpModalOverlay />
    <MpModalContent>
      <MpModalHeader>
        {{ t('Edit classification') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="ecm-label">{{ t('Classification') }}</p>
        <div class="ecm-group">
          <div v-for="opt in choices" :key="opt.value" class="ecm-option">
            <label class="ecm-radio">
              <MpRadio
                :id="`ecm-${opt.value}`"
                name="ecm-classification"
                :value="opt.value"
                :is-checked="pending === opt.value"
                @change="pending = opt.value"
              />
              <span>{{ opt.label }}</span>
            </label>
            <p class="ecm-caption">{{ opt.caption }}</p>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="emit('close')">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" :disabled="!pending" @click="save">{{ t('Save') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.ecm-label {
  margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.ecm-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* No gap — MpRadio renders its own 12px control-to-label gap internally */
.ecm-radio {
  display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
/* Caption sits under the label, aligned past the 16px control + its 12px gap */
.ecm-caption {
  margin: 0; padding-left: var(--mp-spacing-8, 32px);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
}
/* .btn-enterprise has no disabled state of its own — Save stays inert until a
   classification is picked, so it needs one here. */
.modal-footer-btns .btn-enterprise:disabled {
  background: var(--mp-background-disabled, #f0f1f3);
  border-color: var(--mp-background-disabled, #f0f1f3);
  color: var(--mp-text-disabled, #9aa4b2);
  cursor: not-allowed;
}
</style>
