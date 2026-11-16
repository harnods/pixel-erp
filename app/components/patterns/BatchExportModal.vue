<script setup lang="ts">
/**
 * BatchExportModal — product detail "Export batches" (ATINV-9083).
 *
 * Exports THIS product's batches in the Update batches template format, so the file can
 * be edited and imported back. Optional filter: only batches with an empty required
 * attribute. If the filter matches nothing, nothing downloads and an inline message
 * explains why (rule/form-errors-inline). The Unassigned batch is never exported.
 */
import { ref, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpCheckbox, MpText,
} from '@mekari/pixel3'
import { buildBatchExport } from '~/data/batchUpdateImport'
import { writeBatchExportXlsx } from '~/utils/batchExportXlsx'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ open: boolean; sku: string }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useLocale()

const onlyRequiredEmpty = ref(false)
const noMatch = ref(false)
/** The file write failed (rule/form-errors-inline) — Export stays clickable to retry. */
const writeFailed = ref(false)
const isExporting = ref(false)

// Fresh state on every open; changing the filter clears a stale error.
watch(() => props.open, (open) => {
  if (!open) return
  onlyRequiredEmpty.value = false
  noMatch.value = false
  writeFailed.value = false
}, { immediate: true })
watch(onlyRequiredEmpty, () => { noMatch.value = false; writeFailed.value = false })

async function exportBatches() {
  if (isExporting.value) return
  const data = buildBatchExport({ skus: [props.sku], onlyRequiredEmpty: onlyRequiredEmpty.value })
  writeFailed.value = false
  if (!data.rows.length) return void (noMatch.value = true)
  isExporting.value = true
  try {
    await writeBatchExportXlsx(data, `${props.sku}-batches.xlsx`, t)
    successToast(t('Batches exported'))
    emit('close')
  } catch {
    writeFailed.value = true
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <MpModal
    id="batch-export-modal" :is-open="open" size="md"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Export batches') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="bem-body" data-devchange="batch-export-modal">
          <MpText class="bem-caption">{{ t('The file uses the Update batches template, so you can edit it and import it back.') }}</MpText>
          <MpCheckbox id="bem-required-empty" :is-checked="onlyRequiredEmpty" @change="onlyRequiredEmpty = !onlyRequiredEmpty">{{ t('Only batches with an empty required attribute') }}</MpCheckbox>
          <p v-if="noMatch" class="bem-error" role="alert">{{ t('No batches match these filters') }}</p>
          <p v-if="writeFailed" class="bem-error" role="alert" data-devchange="batch-export-write-error">{{ t('Couldn’t create the file. Try again') }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="exportBatches">{{ t('Export') }}</button>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.bem-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bem-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.bem-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
</style>
