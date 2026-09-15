<script setup lang="ts">
/**
 * Raise Purchase Requests from the worklist (PRD OD-007: US-020..US-023).
 *
 * v2 changed what this produces. Decision D11 made the output a REQUEST to the
 * purchasing team rather than a draft PO, so the copy, the grouping and the
 * quantities all shifted with it:
 *
 *  • Quantities are the demand-coverage NEED in stock units. MOQ and pack
 *    rounding belong to a vendor, and purchasing may source elsewhere, so they
 *    are applied once at PO time (D12 / US-022 VR-02). The vendor's terms are
 *    still shown per line — as information about what will happen later, never
 *    as a rule blocking the request.
 *  • A line with no suggested vendor is NOT skipped. It groups into a
 *    "purchasing to source" request, because a PR — unlike a PO — needs no bound
 *    vendor (US-022 AC-06).
 *  • Changing the suggested vendor re-sizes the quantity from that vendor's lead
 *    time (AC-02), except where the user has typed their own number: that is
 *    never silently overwritten, it is offered (AC-03 / VR-03).
 *
 * The confirmation step is deliberate: grouping, quantities and SKIPPED lines are
 * all visible BEFORE anything is created, so a partial outcome is a decision
 * rather than a surprise afterwards (US-021 EH-01).
 *
 * Custom Teleport overlay, matching ConfirmModal.vue — MpModal has no structural
 * CSS in this Pixel3 build.
 */
import { MpIcon, MpInput, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import type { WorklistRow } from '~/data/replenishment'
import {
  planPurchaseRequests, prSkipReasonLabel, recomputeQtyForVendor, type PrLine,
} from '~/data/replenishmentPurchaseRequest'
import { vendorItemsForSku, vendorNameFor } from '~/data/vendorItems'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ isOpen: boolean; rows: WorklistRow[] }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', payload: {
    overrides: Record<string, number>
    vendorChoices: Record<string, string | null>
  }): void
  (e: 'assign-vendor', sku: string): void
}>()

const { t } = useLocale()

/** Local, discarded on close — edits never leak out unless the user confirms. */
const overrides = reactive<Record<string, number>>({})
const vendorChoices = reactive<Record<string, string | null>>({})
const qtyError = ref('')

/**
 * Pending "apply new recommendation?" prompts, keyed by row (US-022 AC-03).
 * A vendor change re-sizes the quantity, but a number the user typed themselves
 * is theirs — so the new recommendation waits here to be accepted or dismissed
 * instead of overwriting their figure.
 */
const pendingRecommend = reactive<Record<string, { from: number; to: number; vendorName: string }>>({})

watch(() => props.isOpen, (open) => {
  if (!open) return
  for (const k of Object.keys(overrides)) delete overrides[k]
  for (const k of Object.keys(vendorChoices)) delete vendorChoices[k]
  for (const k of Object.keys(pendingRecommend)) delete pendingRecommend[k]
  qtyError.value = ''
})

/** Re-planned live, so changing a vendor visibly re-groups the line. */
const plan = computed(() => planPurchaseRequests(props.rows, { ...overrides }, { ...vendorChoices }))

/** Every vendor that can supply this SKU — the alternate picker's options. */
function alternativesFor(sku: string) {
  return vendorItemsForSku(sku)
}

function rowKeyFor(sku: string, warehouseId: string) { return `${sku}::${warehouseId}` }

function rowFor(rowKey: string): WorklistRow | undefined {
  return props.rows.find((r) => r.key === rowKey)
}

/**
 * Switch the suggested vendor and re-size the request for its lead time.
 *
 * A slower vendor genuinely needs a bigger order — more demand falls inside the
 * window before stock lands — so the number must move with the choice. The one
 * thing that never moves it is a figure the user typed: that gets a prompt.
 */
function chooseVendor(rowKey: string, vendorId: string | null) {
  const row = rowFor(rowKey)
  vendorChoices[rowKey] = vendorId
  if (!row) return

  const next = recomputeQtyForVendor(row, vendorId)
  const typed = overrides[rowKey]
  if (typed === undefined) {
    delete pendingRecommend[rowKey]
    return
  }
  if (typed === next) { delete pendingRecommend[rowKey]; return }
  pendingRecommend[rowKey] = {
    from: typed,
    to: next,
    vendorName: vendorId ? vendorNameFor(vendorId) : t('no vendor'),
  }
}

function applyRecommendation(rowKey: string) {
  const pending = pendingRecommend[rowKey]
  if (!pending) return
  overrides[rowKey] = pending.to
  delete pendingRecommend[rowKey]
}

function dismissRecommendation(rowKey: string) {
  delete pendingRecommend[rowKey]
}

function setQty(rowKey: string, raw: string) {
  const n = Number(raw)
  if (raw === '' || Number.isNaN(n)) delete overrides[rowKey]
  else overrides[rowKey] = Math.max(0, Math.floor(n))
  delete pendingRecommend[rowKey]
  qtyError.value = ''
}

/**
 * What this vendor's terms will do to the line LATER, at PO time.
 *
 * Informational, never blocking. Under D12 the request carries the raw need and
 * purchasing rounds once against whoever actually ships — so telling the
 * requester "this will round up to 100" is useful context, while refusing their
 * number would be wrong.
 */
function termsNote(line: PrLine): string {
  const vi = line.vendorItem
  if (!vi) return ''
  if (line.finalQty < vi.moq) {
    return `${t('Vendor MOQ')} ${vi.moq} — ${t('rounded up when purchasing raises the PO')}`
  }
  if (vi.packSize > 1 && line.finalQty % vi.packSize !== 0) {
    return `${t('Packs of')} ${vi.packSize} — ${t('rounded up at PO')}`
  }
  return ''
}

const confirmLabel = computed(() => {
  const n = plan.value.totals.requestCount
  return n === 1 ? t('Create purchase request') : `${t('Create')} ${n} ${t('purchase requests')}`
})

const summaryLine = computed(() => {
  const { requestCount, vendorCount, lineCount } = plan.value.totals
  if (requestCount === 0) return t('Nothing can be requested from this selection.')
  const reqPart = requestCount === 1 ? t('1 purchase request') : `${requestCount} ${t('purchase requests')}`
  const vendorPart = vendorCount === 1 ? t('1 vendor') : `${vendorCount} ${t('vendors')}`
  const linePart = lineCount === 1 ? t('1 line') : `${lineCount} ${t('lines')}`
  return `${reqPart} · ${vendorPart} · ${linePart}`
})

function close() { emit('update:isOpen', false) }

function confirm() {
  // No disabled buttons for validation (DESIGN.md) — validate on click.
  if (plan.value.totals.requestCount === 0) {
    qtyError.value = t('Enter a quantity for at least one product.')
    return
  }
  const zeroLines = Object.entries(overrides).filter(([, v]) => v <= 0).length
  if (zeroLines > 0) {
    qtyError.value = `${t('Enter a quantity for')} ${zeroLines} ${zeroLines === 1 ? t('product') : t('products')}`
    return
  }
  emit('confirm', { overrides: { ...overrides }, vendorChoices: { ...vendorChoices } })
}
</script>

<template>
  <Transition name="rp-po">
    <div v-if="isOpen" class="rp-po-overlay" @click.self="close">
      <div class="rp-po-panel" role="dialog" aria-modal="true" :aria-label="t('Request to purchase')">
        <header class="rp-po-header">
          <span class="rp-po-title">{{ t('Request to purchase') }}</span>
          <button class="rp-po-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="rp-po-body">
          <p class="rp-po-summary">{{ summaryLine }}</p>
          <!-- Says plainly that purchasing owns the next step (US-020 AC-03). -->
          <p class="rp-po-summary rp-po-summary--muted">
            {{ t('Purchasing reviews these requests and decides which become purchase orders.') }}
          </p>
          <p v-if="plan.skipped.length" class="rp-po-summary rp-po-summary--warning">
            {{ plan.skipped.length }}
            {{ plan.skipped.length === 1 ? t('line skipped') : t('lines skipped') }}
            — {{ t('see below') }}
          </p>

          <!-- One card per suggested vendor + warehouse. An unsourced card is a
               valid request, not an error — purchasing sources it. -->
          <section v-for="group in plan.groups" :key="group.key" class="rp-po-card">
            <header class="rp-po-card-head">
              <div>
                <p class="rp-po-vendor">
                  {{ group.vendorId ? group.vendorName : t('Purchasing to source') }}
                </p>
                <p class="rp-po-card-sub">
                  {{ group.warehouseName }} · {{ t('Needed in') }} {{ group.leadTimeDays }} {{ t('days') }}
                  <template v-if="group.vendorId"> · {{ t('suggested vendor') }}</template>
                </p>
              </div>
              <div class="rp-po-card-total">
                <span class="rp-po-card-total-label">{{ t('Est. value') }}</span>
                <span class="rp-po-card-total-value">{{ formatIDR(group.estimatedValue) }}</span>
              </div>
            </header>

            <table class="rp-po-table">
              <thead>
                <tr>
                  <th class="rp-po-th">{{ t('Product') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Recommended') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Request qty') }}</th>
                  <th class="rp-po-th">{{ t('Unit') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Est. value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in group.lines" :key="`${line.sku}-${line.warehouseId}`">
                  <td class="rp-po-td">
                    <span class="rp-po-product">{{ line.productName }}</span>
                    <span class="rp-po-product-sub">{{ line.sku }}</span>
                    <!-- Switching vendor re-groups this line and re-sizes the qty. -->
                    <MpPopover
                      v-if="alternativesFor(line.sku).length"
                      :id="`rp-pr-vendor-${line.sku}-${line.warehouseId}`"
                      is-close-on-select
                      use-portal
                      :is-keep-alive="false"
                      placement="bottom-start"
                    >
                      <MpPopoverTrigger>
                        <a class="rp-po-change">{{ t('Change vendor') }}</a>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
                        <MpPopoverList>
                          <MpPopoverListItem
                            v-for="alt in alternativesFor(line.sku)"
                            :key="alt.id"
                            :is-active="alt.vendorId === line.vendorId"
                            @click="chooseVendor(rowKeyFor(line.sku, line.warehouseId), alt.vendorId)"
                          >
                            {{ vendorNameFor(alt.vendorId) }} · {{ alt.leadTimeDays }} {{ t('days') }}
                          </MpPopoverListItem>
                          <!-- A request needs no vendor at all (US-022 AC-06). -->
                          <MpPopoverListItem
                            :is-active="line.vendorId === null"
                            @click="chooseVendor(rowKeyFor(line.sku, line.warehouseId), null)"
                          >
                            {{ t('Let purchasing source it') }}
                          </MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <td class="rp-po-td rp-po-td--num rp-po-td--muted">{{ line.recommendedQty }}</td>
                  <td class="rp-po-td rp-po-td--num">
                    <MpInput
                      :id="`rp-pr-qty-${line.sku}-${line.warehouseId}`"
                      :model-value="String(line.finalQty)"
                      type="number"
                      :class="css({ width: '96px' })"
                      @update:model-value="(v: string) => setQty(rowKeyFor(line.sku, line.warehouseId), v)"
                    />
                    <span v-if="termsNote(line)" class="rp-po-cell-note">{{ termsNote(line) }}</span>
                    <!-- Offered, never applied behind the user's back (AC-03). -->
                    <span
                      v-if="pendingRecommend[rowKeyFor(line.sku, line.warehouseId)]"
                      class="rp-po-cell-note rp-po-cell-note--prompt"
                    >
                      {{ t('Recommended') }}
                      {{ pendingRecommend[rowKeyFor(line.sku, line.warehouseId)]!.from }}
                      →
                      {{ pendingRecommend[rowKeyFor(line.sku, line.warehouseId)]!.to }}
                      ({{ pendingRecommend[rowKeyFor(line.sku, line.warehouseId)]!.vendorName }})
                      <a class="rp-po-change" @click="applyRecommendation(rowKeyFor(line.sku, line.warehouseId))">{{ t('Apply') }}</a>
                      <a class="rp-po-change" @click="dismissRecommendation(rowKeyFor(line.sku, line.warehouseId))">{{ t('Keep mine') }}</a>
                    </span>
                  </td>
                  <td class="rp-po-td">{{ line.unit }}</td>
                  <td class="rp-po-td rp-po-td--num">{{ formatIDR(line.finalQty * line.unitCost) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Skipped lines are listed, never silently dropped. -->
          <section v-if="plan.skipped.length" class="rp-po-card rp-po-card--skipped">
            <header class="rp-po-card-head">
              <p class="rp-po-vendor">{{ t('Skipped') }} ({{ plan.skipped.length }})</p>
            </header>
            <ul class="rp-po-skip-list">
              <li v-for="s in plan.skipped" :key="`${s.sku}-${s.warehouseId}`" class="rp-po-skip-item">
                <span class="rp-po-skip-name">{{ s.productName }}</span>
                <span class="rp-po-skip-sub">{{ s.sku }} · {{ s.warehouseName }}</span>
                <span class="rp-po-skip-reason">{{ prSkipReasonLabel(s.reason) }}</span>
              </li>
            </ul>
            <p class="rp-po-skip-hint">
              {{ t('These products need demand or lead-time data before they can be requested.') }}
              <a
                v-if="plan.skipped[0]"
                class="rp-po-skip-link"
                @click="emit('assign-vendor', plan.skipped[0]!.sku)"
              >{{ t('Open setup') }}</a>
            </p>
          </section>
        </div>

        <footer class="rp-po-footer">
          <span v-if="qtyError" class="rp-po-error">{{ qtyError }}</span>
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirm">{{ confirmLabel }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rp-po-enter-active, .rp-po-leave-active { transition: opacity 200ms ease; }
.rp-po-enter-from, .rp-po-leave-to { opacity: 0; }
.rp-po-enter-active .rp-po-panel, .rp-po-leave-active .rp-po-panel { transition: transform 200ms ease, opacity 200ms ease; }
.rp-po-enter-from .rp-po-panel, .rp-po-leave-to .rp-po-panel { transform: scale(0.97); opacity: 0; }

.rp-po-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 48px var(--mp-spacing-4);
  overflow-y: auto;
}
.rp-po-panel {
  width: min(880px, 100%);
  max-height: calc(100vh - 96px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 16px);
  overflow: hidden;
}
.rp-po-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-po-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.rp-po-close:hover { background: var(--mp-background-neutral-hovered); }

.rp-po-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-5); }
.rp-po-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rp-po-summary--warning { margin-top: 2px; color: var(--mp-text-warning); }

/* Cards are separated by a 1px border, never a drop-shadow (DESIGN.md). */
.rp-po-card {
  margin-top: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.rp-po-card--skipped { border-color: var(--mp-border-warning, var(--mp-border-default)); }
.rp-po-card-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-vendor { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-po-card-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total { text-align: right; white-space: nowrap; }
.rp-po-card-total-label { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.rp-po-table { width: 100%; border-collapse: collapse; }
.rp-po-th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.rp-po-th--num { text-align: right; }
.rp-po-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  vertical-align: top;
}
.rp-po-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-po-td--muted { color: var(--mp-text-subtle); }
.rp-po-product { display: block; }
.rp-po-product-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-po-change {
  display: inline-block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer;
}
.rp-po-cell-note {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning);
}

.rp-po-skip-list { display: flex; flex-direction: column; }
.rp-po-skip-item {
  display: flex; align-items: baseline; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rp-po-skip-name { flex: 1; min-width: 0; }
.rp-po-skip-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-po-skip-reason { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning); white-space: nowrap; }
.rp-po-skip-hint {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-po-skip-link { margin-left: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; }

.rp-po-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.rp-po-error { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
.rp-po-summary--muted { color: var(--mp-text-subdued, #6b7280); }
.rp-po-cell-note--prompt { display: block; margin-top: 4px; color: var(--mp-text-informational, #1f6feb); }
.rp-po-cell-note--prompt .rp-po-change { margin-left: 8px; }
