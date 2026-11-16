<script setup lang="ts">
/**
 * What to do about a transaction whose tax document isn't found — shared by the
 * workspace row's expand and the detail drawer footer. The fix depends on how
 * far the transaction's OWN tax document got (taxDocSubState, PM 2026-11-05):
 *
 *   none       Find another tax document (opt-in, `show-find`) · Create tax document ↗
 *   draft      Edit tax document ↗ · Submit tax document
 *   submitted  Refresh status — a simulated DJP check; one seed is approved
 *              (the row then reconciles), the rest stay processing
 *   rejected   View tax document ↗
 *
 * Secondary first, primary last (where the eye ends, like every form footer).
 * Anything that leaves this screen opens a NEW TAB (`newtab` icon) so the user
 * keeps their place in the masa.
 */
import { MpButton, MpBadge } from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { infoToast, successToast } from '~/utils/toasts'
import {
  erpFakturOf, salesInvoiceTaxDocUrl, taxDocSubState, statusReasonOf, refreshOwnTaxDocStatus,
  REFRESH_SIMULATED_MS, type ReconPair,
} from '~/data/vatReconciliation'
import { updateTaxDocumentStatus, DJP_STATUS_CONFIG } from '~/data/taxDocuments'
import { useTaxSubmissionPermission } from '~/composables/useTaxSubmissionPermission'

const props = withDefaults(defineProps<{
  pair: ReconPair
  /** Render the one-line explanation above the buttons. */
  showHint?: boolean
  size?: 'sm' | 'md'
  /** `row` — buttons only, side by side; `stack` — hint above the buttons. */
  layout?: 'row' | 'stack'
  /** `none` only: also offer "Find another tax document" (the row expand does). */
  showFind?: boolean
  /** Variant of the main action — the workspace row expand uses tertiary (the page keeps one primary). */
  mainVariant?: 'primary' | 'tertiary'
}>(), { showHint: true, size: 'sm', layout: 'stack', showFind: false, mainVariant: 'primary' })

const emit = defineEmits<{ find: [] }>()

const { t } = useLocale()
const { canSubmitTaxDocument } = useTaxSubmissionPermission()

const faktur = computed(() => erpFakturOf(props.pair))
const sub = computed(() => taxDocSubState(props.pair))
const hint = computed(() => statusReasonOf(props.pair) ?? '')
const badge = computed(() => (faktur.value?.doc ? DJP_STATUS_CONFIG[faktur.value.doc.status] : null))

function openInNewTab(action: 'create' | 'edit' | 'view') {
  const f = faktur.value
  if (!f) return
  window.open(salesInvoiceTaxDocUrl(f.salesInvoiceId, action, f.doc?.id), '_blank', 'noopener')
}

// ── Submit a draft without leaving reconciliation ────────────────────────────
// Same operation as the bulk "Submit to DJP" bar (draft → awaiting approval).
const confirmOpen = ref(false)
/** Inline, under the buttons (rule/form-errors-inline) — never a toast. */
const permissionError = ref(false)
function askSubmit() {
  permissionError.value = !canSubmitTaxDocument.value
  if (permissionError.value) return
  confirmOpen.value = true
}
function doSubmit() {
  const doc = faktur.value?.doc
  if (!doc) return
  updateTaxDocumentStatus(doc.id, 'awaiting-approval')
  successToast(t('Tax document submitted'))
}

// ── Refresh status (simulated DJP check) ─────────────────────────────────────
const refreshing = ref(false)
function refreshStatus() {
  if (refreshing.value) return
  refreshing.value = true
  const pair = props.pair
  setTimeout(() => {
    const outcome = refreshOwnTaxDocStatus(pair)
    refreshing.value = false
    if (outcome === 'approved') successToast(t('Tax document approved'))
    else infoToast(t('Tax document is still being processed'))
  }, REFRESH_SIMULATED_MS)
}
</script>

<template>
  <div v-if="sub" class="vrt" :class="`vrt--${layout}`" :data-substate="sub" data-devchange="vat-recon-tax-doc-substates">
    <div v-if="showHint && layout === 'stack'" class="vrt-hint">
      <MpBadge v-if="badge" :type="badge.type" for="tableStatus" size="sm">{{ t(badge.label) }}</MpBadge>
      <span>{{ t(hint) }}</span>
    </div>
    <div class="vrt-actions">
      <template v-if="sub === 'none'">
        <MpButton v-if="showFind" variant="secondary" v-bind="{ size }" is-rounded @click="emit('find')">
          {{ t('Find another tax document') }}
        </MpButton>
        <MpButton v-if="faktur" :variant="mainVariant" v-bind="{ size }" is-rounded right-icon="newtab" @click="openInNewTab('create')">
          {{ t('Create tax document') }}
        </MpButton>
      </template>
      <template v-else-if="sub === 'draft'">
        <MpButton variant="secondary" v-bind="{ size }" is-rounded right-icon="newtab" @click="openInNewTab('edit')">
          {{ t('Edit tax document') }}
        </MpButton>
        <MpButton :variant="mainVariant" v-bind="{ size }" is-rounded @click="askSubmit">
          {{ t('Submit tax document') }}
        </MpButton>
      </template>
      <MpButton v-else-if="sub === 'submitted'" :variant="mainVariant" v-bind="{ size }" is-rounded :is-loading="refreshing" @click="refreshStatus">
        {{ t('Refresh status') }}
      </MpButton>
      <MpButton v-else :variant="mainVariant" v-bind="{ size }" is-rounded right-icon="newtab" @click="openInNewTab('view')">
        {{ t('View tax document') }}
      </MpButton>
    </div>
    <p v-if="permissionError" class="vrt-error" role="alert">
      {{ t("You don't have permission to submit tax documents to DJP. Ask an administrator for access.") }}
    </p>

    <ConfirmModal
      v-model:is-open="confirmOpen"
      :title="t('Submit tax document to DJP?')"
      :description="`${t('The draft tax document for sales invoice')} #${pair.erp?.ref} ${t('will be sent to DJP for approval. It can no longer be edited after this.')}`"
      :confirm-label="t('Submit tax document')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      @confirm="doSubmit"
    />
  </div>
</template>

<style scoped>
.vrt { display: flex; flex-direction: column; gap: var(--mp-spacing-2); align-items: flex-start; }
.vrt-hint {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.vrt-actions { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.vrt-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }
</style>
