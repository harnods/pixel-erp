<script setup lang="ts">
/**
 * Collects print options (how many copies, how many columns per sheet) before
 * handing off to the actual barcode-label PDF generator — a small step ahead
 * of PdfPreviewModal.vue in the same "Print barcode" flow.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpFormControl, MpFormLabel, MpInput, MpRadio, MpButton,
} from '@mekari/pixel3'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; confirm: [{ qty: number; columns: 1 | 2 | 3 }] }>()

const qtyDraft = ref('1')
const columnsDraft = ref('1')
watch(() => props.open, (o) => {
  if (o) { qtyDraft.value = '1'; columnsDraft.value = '1' }
})

const columnOptions: { label: string; value: string }[] = [
  { label: '1 column', value: '1' },
  { label: '2 columns', value: '2' },
  { label: '3 columns', value: '3' },
]

function confirm() {
  const qty = Math.max(1, parseInt(qtyDraft.value, 10) || 1)
  const columns = (parseInt(columnsDraft.value, 10) || 1) as 1 | 2 | 3
  emit('confirm', { qty, columns })
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="print-barcode-options-modal" :is-open="open" size="md" :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>Print barcode<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="pbo-form">
          <MpFormControl id="pbo-qty" is-required>
            <MpFormLabel>Print quantity</MpFormLabel>
            <MpInput id="pbo-qty-input" v-model="qtyDraft" inputmode="numeric" is-full-width />
          </MpFormControl>

          <MpFormControl id="pbo-columns" is-required>
            <MpFormLabel>Paper label</MpFormLabel>
            <div class="pbo-radio-group">
              <MpRadio
                v-for="opt in columnOptions" :key="opt.value"
                :id="`pbo-col-${opt.value}`" name="pbo-columns" :value="opt.value"
                :is-checked="columnsDraft === opt.value" @change="columnsDraft = opt.value"
              >
                {{ opt.label }}
              </MpRadio>
            </div>
          </MpFormControl>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="pbo-footer-btns">
          <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">Preview</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.pbo-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pbo-radio-group { display: flex; gap: var(--mp-spacing-6); align-items: center; flex-wrap: wrap; }
.pbo-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
