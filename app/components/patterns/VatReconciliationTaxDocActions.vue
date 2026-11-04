<script setup lang="ts">
/**
 * What to do about a sales invoice that has no faktur in Coretax — shared by
 * the workspace row ("Not found in Coretax" panel) and the detail drawer.
 *
 * The fix lives on the invoice, so the actions depend on how far its tax
 * document got in ERP (erpFakturOf):
 *
 *   none       → Create tax document ↗   opens the invoice in a new tab with the
 *                                         Create drawer already open
 *   draft      → Submit to DJP           right here, after a confirm
 *                Edit tax document ↗     new tab, the draft open in edit mode
 *   submitted  → View tax document ↗     waiting on DJP — nothing to do here
 *   rejected   → View tax document ↗     fixed and resubmitted on the invoice
 *   approved   → View tax document ↗     approved in ERP, Coretax not synced yet
 *
 * Anything that leaves this screen opens a NEW TAB (and says so with the
 * `newtab` icon): the user is mid-reconciliation and should not lose their
 * place in the masa to go fix one invoice.
 */
import { MpButton, MpBadge } from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { successToast } from '~/utils/toasts'
import { erpFakturOf, salesInvoiceTaxDocUrl, ERP_FAKTUR_HINTS, type ReconPair } from '~/data/vatReconciliation'
import { updateTaxDocumentStatus, DJP_STATUS_CONFIG } from '~/data/taxDocuments'
import { useTaxSubmissionPermission } from '~/composables/useTaxSubmissionPermission'

const props = withDefaults(defineProps<{
  pair: ReconPair
  /** Render the one-line explanation above the buttons (the row panel does; the
   *  drawer already explains the state in its own body). */
  showHint?: boolean
  /** `sm` in the row panel; `md` in a drawer footer, beside its other buttons. */
  size?: 'sm' | 'md'
  /** `row` — buttons only, side by side (the workspace row shows the hint as
   *  its own subtitle); `stack` — hint above the buttons. */
  layout?: 'row' | 'stack'
}>(), { showHint: true, size: 'sm', layout: 'stack' })

const { t } = useLocale()
const { canSubmitTaxDocument } = useTaxSubmissionPermission()

const faktur = computed(() => erpFakturOf(props.pair))

const hint = computed(() => (faktur.value ? ERP_FAKTUR_HINTS[faktur.value.state] : ''))
const badge = computed(() => (faktur.value?.doc ? DJP_STATUS_CONFIG[faktur.value.doc.status] : null))

function openInNewTab(action: 'create' | 'edit' | 'view') {
  const f = faktur.value
  if (!f) return
  window.open(salesInvoiceTaxDocUrl(f.salesInvoiceId, action, f.doc?.id), '_blank', 'noopener')
}

// ── Submit a draft without leaving reconciliation ────────────────────────────
const confirmOpen = ref(false)
/** Inline, under the buttons (rule/form-errors-inline) — never a toast. */
const permissionError = ref(false)
function askSubmit() {
  // Denied outright rather than hidden — the user needs to know the action
  // exists and who to ask for it (PRD-05 AC-009, same as the invoice page).
  permissionError.value = !canSubmitTaxDocument.value
  if (permissionError.value) return
  confirmOpen.value = true
}
function doSubmit() {
  const doc = faktur.value?.doc
  if (!doc) return
  updateTaxDocumentStatus(doc.id, 'awaiting-approval')
  successToast(t('Submitted to DJP'))
}
</script>

<template>
  <div v-if="faktur" class="vrt" :class="`vrt--${layout}`" data-devchange="vat-recon-tax-doc-actions">
    <div v-if="showHint && layout === 'stack'" class="vrt-hint">
      <MpBadge v-if="badge" :type="badge.type" for="tableStatus" size="sm">{{ t(badge.label) }}</MpBadge>
      <span>{{ t(hint) }}</span>
    </div>
    <div class="vrt-actions">
      <template v-if="faktur.state === 'none'">
        <MpButton variant="primary" v-bind="{ size }" is-rounded right-icon="newtab" @click="openInNewTab('create')">
          {{ t('Create tax document') }}
        </MpButton>
      </template>
      <!-- Draft: Edit (secondary) then Submit (primary) — the primary sits last,
           where the eye ends, like every form footer. -->
      <template v-else-if="faktur.state === 'draft'">
        <MpButton variant="secondary" v-bind="{ size }" is-rounded right-icon="newtab" @click="openInNewTab('edit')">
          {{ t('Edit tax document') }}
        </MpButton>
        <MpButton variant="primary" v-bind="{ size }" is-rounded @click="askSubmit">
          {{ t('Submit to DJP') }}
        </MpButton>
      </template>
      <MpButton v-else variant="secondary" v-bind="{ size }" is-rounded right-icon="newtab" @click="openInNewTab('view')">
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
      :confirm-label="t('Submit to DJP')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      @confirm="doSubmit"
    />
  </div>
</template>

<style scoped>
.vrt { display: flex; flex-direction: column; gap: var(--mp-spacing-2); align-items: flex-start; }
.vrt--row { align-items: flex-end; }
.vrt-hint {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.vrt-actions { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.vrt-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }
</style>
