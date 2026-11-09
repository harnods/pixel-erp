<script setup lang="ts">
/**
 * Remarks on a reconciliation row (US-013) — a reason from a fixed list plus
 * optional free text, kept on the row and in its Activity.
 *
 * Structured like ReassignTaskModal: MpAutocomplete for the select
 * (rule/select-erpfilterselect — never MpSelect), closes only via × / Cancel
 * (rule/modal-drawer-close-explicit-only), errors inline (rule/form-errors-inline).
 *
 * Save is never disabled (rule/btn-no-disabled-validation, same as Finalize):
 * pressed with notes over 500 characters it shows the inline error and saves
 * nothing. The counter turns red as soon as the limit is passed.
 */
import { computed } from 'vue'
import ContentList from '~/components/patterns/ContentList.vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpAutocomplete, MpTextarea, MpButton,
} from '@mekari/pixel3'
import {
  REMARK_REASONS, REMARK_MAX_CHARS, remarkOf, saveRemark, partyOf, type ReconPair, type ReconSide,
} from '~/data/vatReconciliation'

const props = defineProps<{
  isOpen: boolean
  pair: ReconPair | null
  /** Invoice or faktur number, so the user sees which row they are annotating. */
  rowRef: string
  /** Output (customer) or input (vendor) — names the party label. */
  side?: ReconSide
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { t } = useLocale()

/** The row being annotated: its transaction, or the tax document when there's no transaction. */
const doc = computed(() => props.pair?.erp ?? props.pair?.djp ?? null)
const docIsTransaction = computed(() => !!props.pair?.erp)

const reason = ref('')
const text = ref('')
const reasonError = ref(false)
const lengthError = ref(false)

const options = computed(() => REMARK_REASONS.map(r => ({ label: t(r), value: r })))
const length = computed(() => text.value.length)
const overLimit = computed(() => length.value > REMARK_MAX_CHARS)
// The length error clears as soon as the notes fit again.
watch(overLimit, (over) => { if (!over) lengthError.value = false })

// Opening loads the row's current remark, so Save edits rather than duplicates.
watch(() => [props.isOpen, props.pair?.id] as const, ([open]) => {
  if (!open || !props.pair) return
  const existing = remarkOf(props.pair)
  reason.value = existing?.reason ?? ''
  text.value = existing?.text ?? ''
  reasonError.value = false
  lengthError.value = false
}, { immediate: true })

function save() {
  if (!props.pair) return
  lengthError.value = overLimit.value
  reasonError.value = !reason.value
  if (lengthError.value || reasonError.value) return
  if (!saveRemark(props.pair, reason.value, text.value)) return
  emit('saved')
}
</script>

<template>
  <MpModal
    id="vat-recon-remark-modal"
    :is-open="isOpen"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    size="md"
    :is-keep-alive="false"
    @close="emit('close')"
  >
    <MpModalContent data-devchange="vat-recon-prd-align-remarks">
      <MpModalHeader>
        {{ t('Remarks') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <!-- Which row this remark is for (rule/detail-contentlist). -->
        <div v-if="doc" class="vrm-context" data-devchange="vat-recon-remarks-context" data-test-id="vrm-context">
          <ContentList horizontal :label="docIsTransaction ? t('Transaction number') : t('Tax document number')" :value="doc.ref || rowRef" />
          <ContentList horizontal :label="docIsTransaction ? t('Transaction date') : t('Tax document date')" :value="doc.date" />
          <ContentList horizontal :label="side === 'input' ? t('Vendor') : t('Customer')" :value="partyOf(doc)" />
        </div>
        <p v-else class="vrm-intro">{{ rowRef }}</p>
        <MpFormControl :is-invalid="reasonError" class="vrm-field">
          <MpFormLabel for="vrm-reason" is-required>{{ t('Reason') }}</MpFormLabel>
          <MpAutocomplete
            id="vrm-reason"
            v-model="reason"
            :data="options"
            label-prop="label"
            value-prop="value"
            use-portal
            is-full-width
            :placeholder="t('Select a reason')"
            @update:model-value="reasonError = false"
          />
          <p v-if="reasonError" id="vrm-reason-error" class="vrm-error" role="alert">{{ t('Select a reason.') }}</p>
        </MpFormControl>
        <div class="vrm-field">
          <div class="vrm-label-row">
            <label class="vrm-label" for="vrm-text">{{ t('Notes') }}</label>
            <span class="vrm-count" :class="{ 'is-over': overLimit }" data-test-id="vrm-count">{{ length }} / {{ REMARK_MAX_CHARS }}</span>
          </div>
          <MpTextarea id="vrm-text" v-model="text" :rows="4" is-full-width :is-invalid="lengthError" />
          <p v-if="lengthError" class="vrm-error" role="alert">{{ t('Notes can be up to 500 characters. Shorten them to save.') }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="vrm-actions">
          <MpButton class="btn-enterprise btn-enterprise--ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" is-rounded data-test-id="vrm-save" @click="save">{{ t('Save') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.vrm-context { display: flex; flex-direction: column; margin-bottom: var(--mp-spacing-3); }
.vrm-intro { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.vrm-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.vrm-field + .vrm-field { margin-top: var(--mp-spacing-4); }
.vrm-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.vrm-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vrm-count { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); font-variant-numeric: tabular-nums; }
.vrm-count.is-over { color: var(--mp-colors-red-800); font-weight: var(--mp-font-weights-semi-bold); }
.vrm-error { margin: 0; font-size: var(--mp-font-sizes-xs); color: var(--mp-colors-red-800); }
.vrm-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
