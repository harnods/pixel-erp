<script setup lang="ts">
/**
 * Merge several Purchase Requests into draft Purchase Order(s) (PRD D12 / US-018).
 *
 * Same-SKU lines across the selected requests are SUMMED into one need, and that
 * combined need is rounded ONCE to the chosen vendor's MOQ + purchase multiplier —
 * so three requests for 16 + 22 + 42 become one 80-unit need that rounds to a
 * single MOQ/pack quantity, instead of three separate roundings that over-order.
 *
 * Each merged line shows which requests fed it, keeps the qty editable, and lets
 * purchasing switch the vendor (re-rounding the merged need). The output is always
 * a DRAFT PO (US-020). Mirrors ConvertPrToPoModal.vue / CreatePurchaseRequestModal.
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
  planPosFromPurchaseRequests, skipReasonLabel, defaultConversionWarehouseForMany,
} from '~/data/replenishmentDraftPo'
import { applyMoqAndPack } from '~/data/replenishment'
import { vendorItemsForSku, vendorItemFor, vendorNameFor } from '~/data/vendorItems'
import { warehouses } from '~/data/warehouses'

const props = defineProps<{ isOpen: boolean; prs: PurchaseRequest[] }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', payload: {
    warehouseId: string
    vendorChoices: Record<string, string | null>
    qtyOverrides: Record<string, number>
  }): void
}>()

const { t, tf } = useLocale()

const warehouseId = ref('')
const vendorChoices = reactive<Record<string, string | null>>({})
const qtyOverrides = reactive<Record<string, number>>({})
const qtyError = ref('')
/** Set by a failed confirm: marks every qty cell still at 0 (rule/field-invalid-caption). */
const showQtyErrors = ref(false)
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
  warehouseId.value = defaultConversionWarehouseForMany(props.prs)
})

const plan = computed(() => planPosFromPurchaseRequests(props.prs, warehouseId.value, { ...vendorChoices }, { ...qtyOverrides }))

const totals = computed(() => {
  const groups = plan.value.groups
  return {
    poCount: groups.length,
    vendorCount: new Set(groups.map((g) => g.vendorId)).size,
    lineCount: groups.reduce((n, g) => n + g.lines.length, 0),
  }
})

const totalValue = computed(() => plan.value.groups.reduce((sum, g) => sum + g.total, 0))

const summary = computed(() => [
  { label: t('Purchase requests'), value: props.prs.length },
  { label: t('Draft purchase orders'), value: totals.value.poCount },
  { label: t('Vendors'), value: totals.value.vendorCount },
  { label: t('Products'), value: totals.value.lineCount },
  { label: t('Total estimated value'), value: formatIDR(totalValue.value) },
])

/** Row order follows the selected requests, so a vendor change never moves a line. */
const skuOrder = computed(() => [...new Set(props.prs.flatMap((pr) => pr.lines.map((l) => l.sku)))])

/** One line per linked vendor: terms and lead time visible before picking. */
function vendorOptions(sku: string) {
  return vendorItemsForSku(sku).map((alt) => ({
    vendorId: alt.vendorId,
    label: tf('{vendor} · MOQ {moq} · purchase multiplier {pack} · {n} days', {
      vendor: vendorNameFor(alt.vendorId), moq: alt.moq, pack: alt.packSize, n: alt.leadTimeDays,
    }),
  }))
}

function needFor(sku: string): number {
  let n = 0
  for (const pr of props.prs) for (const l of pr.lines) if (l.sku === sku) n += l.requestedQty
  return n
}

function chooseVendor(sku: string, vendorId: string) {
  vendorChoices[sku] = vendorId
  const vi = vendorId ? vendorItemFor(sku, vendorId) : undefined
  const next = applyMoqAndPack(needFor(sku), vi).purchaseQty
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

function roundNote(line: { vendorItem: { moq: number; packSize: number }; raisedByMoq?: boolean; raisedByPack?: boolean }): string {
  if (line.raisedByMoq) return tf('Raised to MOQ {n}', { n: line.vendorItem.moq })
  if (line.raisedByPack) return tf('Rounded up to purchase multiplier {n}', { n: line.vendorItem.packSize })
  return ''
}

/** "From #90036 (16) + #90078 (22) + #90013 (42)" — makes the merge visible. */
function sourceNote(line: { sources?: { prNumber: number; qty: number }[] }): string {
  if (!line.sources || line.sources.length < 2) return ''
  return tf('From {sources}', { sources: line.sources.map((s) => `#${s.prNumber} (${s.qty})`).join(' + ') })
}

function notesFor(line: DraftPoLine): string[] {
  return [sourceNote(line), roundNote(line)].filter(Boolean)
}

const confirmLabel = computed(() => {
  const n = totals.value.poCount
  return n <= 1 ? t('Create draft purchase order') : tf('Create {n} draft purchase orders', { n })
})

function close() { emit('update:isOpen', false) }

function confirm() {
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
    id="rp-bulk-convert-pr"
    :is-open="isOpen"
    size="xl"
    scroll-behavior="auto"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Merge into purchase order') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <DraftPoPlanForm
          id-prefix="bcpo"
          :banner-title="t('Requests are merged')"
          :banner-description="t(&quot;Same-product lines are combined, then rounded to each vendor's MOQ and purchase multiplier. The order is saved as a draft for approval.&quot;)"
          :summary="summary"
          v-model:warehouse-id="warehouseId"
          :warehouse-options="warehouseOptions"
          :need-label="t('Merged need')"
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
          :empty-text="t('Nothing can be ordered from these requests.')"
          @choose-vendor="chooseVendor"
          @set-qty="setQty"
          @apply="applyRecommendation"
          @dismiss="dismissRecommendation"
        />
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton id="bcpo-cancel" variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton id="bcpo-confirm" variant="primary" is-rounded @click="confirm">{{ confirmLabel }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>
