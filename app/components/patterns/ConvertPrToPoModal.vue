<script setup lang="ts">
/**
 * Convert a Purchase Request into draft Purchase Order(s) (PRD D12 / US-019).
 *
 * This is the moment the demand-coverage NEED the PR carries in STOCK units is
 * finally rounded into a vendor's terms — MOQ raise, then purchase-multiplier
 * (pack) round-up — against the FINAL vendor purchasing picks. Rounding happens
 * here, once, so it is never applied twice on the PR against a vendor that later
 * changes (decision D12).
 *
 *  • Works for replenishment PRs (stock-unit need on the origin) AND manual PRs:
 *    both round the requested qty the same way, and every rounded number is shown
 *    and stays editable so a manual line already in purchase units can be fixed.
 *  • Changing the vendor re-sizes the order for that vendor's terms, except where
 *    the user typed their own number — that is offered, never overwritten.
 *  • The output is always a DRAFT PO (US-020): purchasing still approves/sends it.
 *
 * Body is the shared DraftPoPlanForm (same form table as CreatePurchaseRequestModal).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import DraftPoPlanForm from '~/components/patterns/DraftPoPlanForm.vue'
import type { PurchaseRequest } from '~/data/types'
import type { DraftPoLine } from '~/data/replenishmentDraftPo'
import { formatIDR } from '~/utils/currency'
import {
  planPosFromPurchaseRequest, skipReasonLabel, defaultConversionWarehouse, suggestedVendorForSku,
} from '~/data/replenishmentDraftPo'
import { applyMoqAndPack } from '~/data/replenishment'
import { vendorItemsForSku, vendorItemFor, vendorNameFor } from '~/data/vendorItems'
import { warehouses } from '~/data/warehouses'

const props = defineProps<{ isOpen: boolean; pr: PurchaseRequest | null }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', payload: {
    warehouseId: string
    vendorChoices: Record<string, string | null>
    qtyOverrides: Record<string, number>
  }): void
}>()

const { t, tf } = useLocale()

/** Local, discarded on close — edits never leak out unless the user confirms. */
const warehouseId = ref('')
const vendorChoices = reactive<Record<string, string | null>>({})
const qtyOverrides = reactive<Record<string, number>>({})
const qtyError = ref('')
/** Set by a failed confirm: marks every qty cell still at 0 (rule/field-invalid-caption). */
const showQtyErrors = ref(false)

/** Pending "apply new recommendation?" prompts after a vendor change (US-019 AC-03). */
const pendingRecommend = reactive<Record<string, { from: number; to: number; vendorName: string | null }>>({})

const warehouseOptions = computed(() =>
  warehouses.filter((w) => w.status === 'active').map((w) => ({ value: w.id, label: w.name })),
)

watch(() => props.isOpen, (open) => {
  if (!open) return
  for (const k of Object.keys(vendorChoices)) delete vendorChoices[k]
  for (const k of Object.keys(qtyOverrides)) delete qtyOverrides[k]
  for (const k of Object.keys(pendingRecommend)) delete pendingRecommend[k]
  qtyError.value = ''
  showQtyErrors.value = false
  warehouseId.value = props.pr ? defaultConversionWarehouse(props.pr) : ''
})

/** Re-planned live, so changing a vendor or warehouse visibly re-groups the POs. */
const plan = computed(() => props.pr
  ? planPosFromPurchaseRequest(props.pr, warehouseId.value, { ...vendorChoices }, { ...qtyOverrides })
  : { groups: [], skipped: [] })

const totals = computed(() => {
  const groups = plan.value.groups
  const lineCount = groups.reduce((n, g) => n + g.lines.length, 0)
  return { poCount: groups.length, vendorCount: new Set(groups.map((g) => g.vendorId)).size, lineCount }
})

const totalValue = computed(() => plan.value.groups.reduce((sum, g) => sum + g.total, 0))

const summary = computed(() => [
  { label: t('Draft purchase orders'), value: totals.value.poCount },
  { label: t('Vendors'), value: totals.value.vendorCount },
  { label: t('Products'), value: totals.value.lineCount },
  { label: t('Total estimated value'), value: formatIDR(totalValue.value) },
])

/** Row order follows the request, so a vendor change never moves a line. */
const skuOrder = computed(() => (props.pr ? props.pr.lines.map((l) => l.sku) : []))

/** One line per linked vendor: terms and lead time visible before picking. */
function vendorOptions(sku: string) {
  return vendorItemsForSku(sku).map((alt) => ({
    vendorId: alt.vendorId,
    label: tf('{vendor} · MOQ {moq} · purchase multiplier {pack} · {n} days', {
      vendor: vendorNameFor(alt.vendorId), moq: alt.moq, pack: alt.packSize, n: alt.leadTimeDays,
    }),
  }))
}

/**
 * Switch the vendor and re-size the order for its MOQ / multiplier — unless the
 * user already typed a number, which is offered as a prompt, never overwritten.
 */
function chooseVendor(sku: string, vendorId: string) {
  vendorChoices[sku] = vendorId
  const prLine = props.pr?.lines.find((l) => l.sku === sku)
  if (!prLine) return
  const vi = vendorId ? vendorItemFor(sku, vendorId) : undefined
  const next = applyMoqAndPack(prLine.requestedQty, vi).purchaseQty
  const typed = qtyOverrides[sku]
  if (typed === undefined || typed === next) { delete pendingRecommend[sku]; return }
  pendingRecommend[sku] = { from: typed, to: next, vendorName: vendorId ? vendorNameFor(vendorId) : null }
}

function applyRecommendation(sku: string) {
  const pending = pendingRecommend[sku]
  if (!pending) return
  qtyOverrides[sku] = pending.to
  delete pendingRecommend[sku]
}
function dismissRecommendation(sku: string) { delete pendingRecommend[sku] }

function setQty(sku: string, raw: string) {
  const n = Number(raw)
  if (raw === '' || Number.isNaN(n)) delete qtyOverrides[sku]
  else qtyOverrides[sku] = Math.max(0, Math.floor(n))
  delete pendingRecommend[sku]
  qtyError.value = ''
}

/** How this line was rounded — shown so the number is never a mystery. */
function roundNote(line: { vendorItem: { moq: number; packSize: number }; raisedByMoq?: boolean; raisedByPack?: boolean }): string {
  if (line.raisedByMoq) return tf('Raised to MOQ {n}', { n: line.vendorItem.moq })
  if (line.raisedByPack) return tf('Rounded up to purchase multiplier {n}', { n: line.vendorItem.packSize })
  return ''
}

function notesFor(line: DraftPoLine): string[] {
  return [roundNote(line)].filter(Boolean)
}

const confirmLabel = computed(() => {
  const n = totals.value.poCount
  return n <= 1 ? t('Create draft purchase order') : tf('Create {n} draft purchase orders', { n })
})

function close() { emit('update:isOpen', false) }

function confirm() {
  // No disabled buttons for validation (DESIGN.md) — validate on click.
  if (!warehouseId.value) { qtyError.value = t('Choose a ship-to warehouse'); return }
  if (totals.value.poCount === 0) { qtyError.value = t('Nothing can be ordered from this request.'); return }
  const zeroLines = Object.values(qtyOverrides).filter((v) => v <= 0).length
  if (zeroLines > 0) {
    showQtyErrors.value = true
    qtyError.value = tf('Products with qty 0: {n}. Enter a qty greater than 0', { n: zeroLines })
    return
  }
  emit('confirm', { warehouseId: warehouseId.value, vendorChoices: { ...vendorChoices }, qtyOverrides: { ...qtyOverrides } })
}
</script>

<template>
  <!-- scroll-behavior="auto": hugs short content; once taller than the screen the body
       scrolls while header + footer stay put. Closes only via × / Cancel
       (rule/modal-drawer-close-explicit-only). -->
  <MpModal
    id="rp-convert-pr"
    :is-open="isOpen"
    size="xl"
    scroll-behavior="auto"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Create purchase order') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <DraftPoPlanForm
          id-prefix="cpo"
          :banner-title="t('Saved as a draft order')"
          :banner-description="t(&quot;Quantities are rounded to each vendor's MOQ and purchase multiplier. The order is saved as a draft for approval.&quot;)"
          :summary="summary"
          v-model:warehouse-id="warehouseId"
          :warehouse-options="warehouseOptions"
          :need-label="t('Needed')"
          :groups="plan.groups"
          :skipped="plan.skipped"
          :sku-order="skuOrder"
          :vendor-options="vendorOptions"
          :notes-for="notesFor"
          :skip-label="(r) => t(skipReasonLabel(r))"
          :pending-recommend="pendingRecommend"
          :show-qty-errors="showQtyErrors"
          :qty-overrides="qtyOverrides"
          :error="qtyError"
          :empty-text="t('Nothing can be ordered from this request.')"
          @choose-vendor="chooseVendor"
          @set-qty="setQty"
          @apply="applyRecommendation"
          @dismiss="dismissRecommendation"
        />
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton id="cpo-cancel" variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton id="cpo-confirm" variant="primary" is-rounded @click="confirm">{{ confirmLabel }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>
