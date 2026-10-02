<script setup lang="ts">
/**
 * BarcodeSettingsButton — the small settings icon next to a Barcode field label
 * (Figma: Barcode settings / Customize barcode format). The field itself stays
 * freely editable (free-typed or generated) — this button just owns the format
 * modal and, on submit, generates the next barcode and hands it back to the
 * field via the `generated` event.
 *
 * `kind` selects WHICH format/counter this instance edits — a product's SKU, a
 * batch, a serial number, or a storage bin each auto-generate independently (see
 * `~/data/barcodeConfig.ts`), so the same button dropped next to any of those
 * fields never shares state with the others. Defaults to 'sku' (its original use).
 *
 * One MpModal, default centered behaviour (no custom placement): a vertical form
 * (standard/prefix/separator/padding/start number) with a live preview, driven by
 * the `kind`'s own config store. "Generate barcode" persists the format AND
 * consumes the next counter value in one step.
 */
import {
  MpIcon, MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage, MpInput, MpRadio, MpBanner, MpBannerDescription, MpButton, toast,
} from '@mekari/pixel3'
import {
  getBarcodeConfig, setBarcodeFormat, generateNextBarcode, formatBarcodeValue,
  type BarcodeFormat, type BarcodeKind,
} from '~/data/barcodeConfig'

const props = withDefaults(defineProps<{ kind?: BarcodeKind }>(), { kind: 'sku' })
const emit = defineEmits<{ generated: [string] }>()

const KIND_LABEL: Record<BarcodeKind, string> = {
  sku: 'SKU', batch: 'Batch', serial: 'Serial number', bin: 'Bin',
}
const KIND_PLURAL: Record<BarcodeKind, string> = {
  sku: 'products', batch: 'batches', serial: 'serial numbers', bin: 'storage bins',
}
const config = computed(() => getBarcodeConfig(props.kind))

// Only the real standards have a fixed digit length; 'Custom' has none — its
// Zero-padding is whatever the user typed.
const STANDARD_DIGITS: Record<'EAN-13' | 'UPC-A' | 'EAN-8', number> = { 'EAN-13': 13, 'UPC-A': 12, 'EAN-8': 8 }
const formatOptions: { label: string; value: BarcodeFormat }[] = [
  { label: 'EAN-13', value: 'EAN-13' },
  { label: 'UPC-A', value: 'UPC-A' },
  { label: 'EAN-8', value: 'EAN-8' },
  { label: 'Custom', value: 'Custom' },
]

const isOpen = ref(false)

const formatDraft = ref<BarcodeFormat>(config.value.format)
const prefixDraft = ref(config.value.prefix)
const paddingDraft = ref(String(config.value.padding))
const startNumberDraft = ref(String(config.value.startNumber))
const separatorDraft = ref(config.value.separator)
const startNumberError = ref('')

function open() {
  formatDraft.value = config.value.format
  prefixDraft.value = config.value.prefix
  paddingDraft.value = String(config.value.padding)
  startNumberDraft.value = String(config.value.startNumber)
  separatorDraft.value = config.value.separator
  startNumberError.value = ''
  isOpen.value = true
}
function close() {
  isOpen.value = false
}

// A real standard is a fixed digit sequence — no prefix/separator, and its
// digit count is part of the standard's definition, not a preference. Those
// fields only make sense (and only show) under "Custom".
watch(formatDraft, (f) => {
  if (f !== 'Custom') {
    paddingDraft.value = String(STANDARD_DIGITS[f])
    prefixDraft.value = ''
    separatorDraft.value = ''
  }
})

// Live preview from the DRAFT values (not yet saved) so every change is visible
// immediately, same numbering base (counter) the real generator will use next.
const paddingDraftNum = computed(() => Math.max(1, parseInt(paddingDraft.value, 10) || 1))
const previewDraft = computed(() => {
  const start = parseInt(startNumberDraft.value, 10) || 0
  return formatBarcodeValue(start + config.value.counter, {
    prefix: prefixDraft.value, padding: paddingDraftNum.value, separator: separatorDraft.value,
  })
})

// A cosmetic bar pattern, not a real scannable encoding — each character
// contributes 4 thin bar/gap elements (narrow fixed widths, like a real
// barcode's modules) so the pattern visibly changes with the value without
// implementing an actual symbology.
const barcodePreviewBars = computed(() => previewDraft.value.split('').flatMap((ch) => {
  const code = ch.charCodeAt(0)
  return [
    { isBar: true, width: 1 + (code % 2) },
    { isBar: false, width: 1 + ((code + 1) % 2) },
    { isBar: true, width: 1 + ((code + 2) % 3) },
    { isBar: false, width: 1 },
  ]
}))

function generate() {
  startNumberError.value = ''
  const startDigits = startNumberDraft.value.trim().length
  if (formatDraft.value !== 'Custom' && startDigits > paddingDraftNum.value) {
    startNumberError.value = `Start number must be at most ${paddingDraftNum.value} digits for ${formatDraft.value}`
    return
  }

  setBarcodeFormat(props.kind, {
    format: formatDraft.value,
    prefix: prefixDraft.value.trim(),
    padding: paddingDraftNum.value,
    startNumber: parseInt(startNumberDraft.value, 10) || config.value.startNumber,
    separator: separatorDraft.value.trim(),
  })
  const value = generateNextBarcode(props.kind)
  emit('generated', value)
  toast.notify({ variant: 'success', title: 'Barcode generated', maxWidth: 'max-content' })
  close()
}
</script>

<template>
  <span class="bcs-trigger" title="Auto-generated" role="button" :aria-label="`${KIND_LABEL[props.kind]} barcode settings`" @click="open">
    <MpIcon name="settings" size="sm" />
  </span>

  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    :id="`barcode-settings-modal-${props.kind}`"
    :is-open="isOpen"
    size="md"
    :is-keep-alive="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>
        Customize {{ KIND_LABEL[props.kind] }} barcode format
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>

        <div class="bcs-form">
          <MpFormControl id="bcs-standard" is-required>
            <MpFormLabel>Barcode standard</MpFormLabel>
            <div class="bcs-radio-group">
              <MpRadio
                v-for="opt in formatOptions" :key="opt.value"
                :id="`bcs-standard-${opt.value}`" name="bcs-standard" :value="opt.value"
                :is-checked="formatDraft === opt.value" @change="formatDraft = opt.value"
              >
                {{ opt.label }}
              </MpRadio>
            </div>
            <MpFormHelpText v-if="formatDraft !== 'Custom'">Sets the barcode length to {{ STANDARD_DIGITS[formatDraft] }} digits.</MpFormHelpText>
            <MpFormHelpText v-else>Zero-padding is free to set for a custom format.</MpFormHelpText>
          </MpFormControl>

          <template v-if="formatDraft === 'Custom'">
            <MpFormControl id="bcs-prefix">
              <MpFormLabel>Prefix</MpFormLabel>
              <MpInput id="bcs-prefix-input" v-model="prefixDraft" placeholder="e.g. PRD" is-full-width />
            </MpFormControl>

            <MpFormControl id="bcs-separator">
              <MpFormLabel>Separator</MpFormLabel>
              <MpInput id="bcs-separator-input" v-model="separatorDraft" placeholder="e.g. -" is-full-width />
            </MpFormControl>

            <MpFormControl id="bcs-padding" is-required>
              <MpFormLabel>Zero-padding (digits)</MpFormLabel>
              <MpInput id="bcs-padding-input" v-model="paddingDraft" inputmode="numeric" is-full-width />
            </MpFormControl>
          </template>

          <MpFormControl id="bcs-start" is-required :is-invalid="!!startNumberError">
            <div class="bcs-label-row">
              <MpFormLabel>Start number</MpFormLabel>
              <span class="bcs-counter">{{ startNumberDraft.length }} / {{ paddingDraftNum }}</span>
            </div>
            <MpInput
              id="bcs-start-input" v-model="startNumberDraft" inputmode="numeric" is-full-width
              :maxlength="paddingDraftNum" @update:model-value="startNumberError = ''"
            />
            <MpFormErrorMessage v-if="startNumberError">{{ startNumberError }}</MpFormErrorMessage>
            <MpFormHelpText v-else>The first number to generate — later barcodes increment from here.</MpFormHelpText>
          </MpFormControl>

          <div class="bcs-preview">
            <span class="bcs-preview-label">Preview</span>
            <div class="bcs-barcode">
              <div class="bcs-barcode-bars">
                <span
                  v-for="(bar, i) in barcodePreviewBars" :key="i" class="bcs-barcode-bar"
                  :style="{ width: `${bar.width}px`, background: bar.isBar ? 'var(--mp-text-default)' : 'transparent' }"
                />
              </div>
              <span class="bcs-barcode-digits">{{ previewDraft }}</span>
            </div>
          </div>

          <MpBanner variant="info">
            <MpBannerDescription>This format only applies to new {{ KIND_PLURAL[props.kind] }} created from now on — barcodes already assigned to existing {{ KIND_PLURAL[props.kind] }} won't change.</MpBannerDescription>
          </MpBanner>
        </div>

      </MpModalBody>
      <MpModalFooter>
        <div class="bcs-footer-btns">
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="close">Cancel</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" @click="generate">Generate barcode</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.bcs-trigger { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }

.bcs-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

.bcs-radio-group { display: flex; gap: var(--mp-spacing-6); align-items: center; flex-wrap: wrap; }

.bcs-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }
.bcs-counter { flex-shrink: 0; font-size: 12px; font-weight: var(--mp-font-weights-regular); line-height: 16px; color: var(--mp-text-secondary); text-align: right; }

.bcs-preview {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle);
  border-radius: var(--mp-radii-md);
}
.bcs-preview-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.bcs-barcode { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) 0; }
.bcs-barcode-bars {
  display: flex; align-items: stretch; width: fit-content; max-width: 100%; height: 64px;
  background: #fff; padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
}
.bcs-barcode-bar { height: 100%; flex-shrink: 0; }
.bcs-barcode-digits { font-family: var(--mp-font-family-mono, monospace); letter-spacing: 0.15em; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.bcs-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
