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
 * Pixel MpModal (rule/modal-use-mpmodal), size xl for the per-vendor tables, and
 * closable only via × / Cancel (rule/modal-drawer-close-explicit-only). A failed
 * save keeps the modal — and every edit in it — open with an inline error
 * (US-017 EH-01, rule/form-errors-inline).
 *
 * Each request is a FORM TABLE (docs/patterns/FormTable.md): white header, gray
 * read-only cells, one white borderless qty input per line
 * (rule/table-form-header-white, rule/table-nonform-bg-gray,
 * rule/table-form-cell-no-border), boxed in --mp-border-bold
 * (rule/table-outer-border-bold). Footer is the shared MpButtonGroup
 * (rule/btn-responsive-footer).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpButton, MpButtonGroup, MpTextlink, MpInput,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import type { WorklistRow } from '~/data/replenishment'
import {
  planPurchaseRequests, prSkipReasonLabel, recomputeQtyForVendor, type PrLine,
} from '~/data/replenishmentPurchaseRequest'
import { vendorItemsForSku, vendorNameFor } from '~/data/vendorItems'
import { vendors } from '~/data/vendors'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{
  isOpen: boolean
  rows: WorklistRow[]
  /** Set by the parent when creating the requests failed — shown inline, edits kept. */
  submitError?: string
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', payload: {
    overrides: Record<string, number>
    vendorChoices: Record<string, string | null>
  }): void
  (e: 'assign-vendor', sku: string): void
}>()

const { t, tf } = useLocale()

/** Local, discarded on close — edits never leak out unless the user confirms. */
const overrides = reactive<Record<string, number>>({})
const vendorChoices = reactive<Record<string, string | null>>({})
const qtyError = ref('')
/** Set by a failed confirm: marks every qty cell still at 0 (rule/field-invalid-caption). */
const showQtyErrors = ref(false)

/**
 * Pending "apply new recommendation?" prompts, keyed by row (US-022 AC-03).
 * A vendor change re-sizes the quantity, but a number the user typed themselves
 * is theirs — so the new recommendation waits here to be accepted or dismissed
 * instead of overwriting their figure.
 */
const pendingRecommend = reactive<Record<string, { from: number; to: number; vendorName: string | null }>>({})

watch(() => props.isOpen, (open) => {
  if (!open) return
  for (const k of Object.keys(overrides)) delete overrides[k]
  for (const k of Object.keys(vendorChoices)) delete vendorChoices[k]
  for (const k of Object.keys(pendingRecommend)) delete pendingRecommend[k]
  qtyError.value = ''
  showQtyErrors.value = false
})

/** Re-planned live, so changing a vendor visibly re-groups the line. */
const plan = computed(() => planPurchaseRequests(props.rows, { ...overrides }, { ...vendorChoices }))

/** Every vendor that can supply this SKU — the alternate picker's options. */
function alternativesFor(sku: string) {
  return vendorItemsForSku(sku)
}

/**
 * Vendors that do NOT list this SKU yet (US-019 VR-04 / AC-05). Still selectable:
 * saving the request creates the vendor–SKU link, and until that vendor has its
 * own history the quantity is sized with the category lead time.
 */
function otherVendorsFor(sku: string) {
  const linked = new Set(vendorItemsForSku(sku).map((v) => v.vendorId))
  return vendors.filter((v) => !linked.has(v.id))
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
    vendorName: vendorId ? vendorNameFor(vendorId) : null,
  }
}

/** One whole sentence per case — a request with no vendor reads differently. */
function pendingNote(rowKey: string): string {
  const pending = pendingRecommend[rowKey]
  if (!pending) return ''
  const { from, to, vendorName } = pending
  return vendorName
    ? tf('Suggested qty for {vendor} is {to}. Your qty is {from}.', { vendor: vendorName, to, from })
    : tf('Suggested qty without a vendor is {to}. Your qty is {from}.', { to, from })
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
    return tf('Vendor MOQ is {n}. Purchasing rounds up the qty on the purchase order.', { n: vi.moq })
  }
  if (vi.packSize > 1 && line.finalQty % vi.packSize !== 0) {
    return tf('Vendor sells in packs of {n}. Purchasing rounds up the qty on the purchase order.', { n: vi.packSize })
  }
  return ''
}

const confirmLabel = computed(() => {
  const n = plan.value.totals.requestCount
  return n > 1 ? tf('Create {n} purchase requests', { n }) : t('Create purchase request')
})

/** Label-first counts, so no string needs a singular/plural variant (rule/copy-id-translations). */
const summaryLine = computed(() => {
  const { requestCount, vendorCount, lineCount } = plan.value.totals
  if (requestCount === 0) return t('Nothing can be requested from this selection.')
  return [
    tf('Purchase requests: {n}', { n: requestCount }),
    tf('Vendors: {n}', { n: vendorCount }),
    tf('Products: {n}', { n: lineCount }),
  ].join(' · ')
})

/**
 * A vendor newly linked to a product has no price yet. "Rp0" would read as a free
 * order, so an unknown value shows as a dash.
 */
function valueLabel(value: number, known: number): string {
  return known > 0 ? formatIDR(value) : '—'
}

function close() { emit('update:isOpen', false) }

function confirm() {
  // Never a disabled button (rule/btn-no-disabled-validation) — validate on click.
  if (plan.value.totals.requestCount === 0) {
    qtyError.value = t('Enter a qty for at least one product.')
    return
  }
  const zeroLines = Object.entries(overrides).filter(([, v]) => v <= 0).length
  if (zeroLines > 0) {
    showQtyErrors.value = true
    qtyError.value = tf('Products with qty 0: {n}. Enter a qty greater than 0.', { n: zeroLines })
    return
  }
  emit('confirm', { overrides: { ...overrides }, vendorChoices: { ...vendorChoices } })
}
</script>

<template>
  <MpModal
    id="rp-create-pr"
    :is-open="isOpen"
    size="xl"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Request to purchase') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="rp-po-summary">{{ summaryLine }}</p>
        <!-- Says plainly that purchasing owns the next step (US-020 AC-03). -->
        <p class="rp-po-summary rp-po-summary--muted">
          {{ t('Purchasing reviews these requests and decides which become purchase orders.') }}
        </p>
        <p v-if="plan.skipped.length" class="rp-po-summary rp-po-summary--warning">
          {{ tf('Skipped products: {n}. See the list below.', { n: plan.skipped.length }) }}
        </p>

        <!-- One card per suggested vendor + warehouse. An unsourced card is a
             valid request, not an error — purchasing sources it. -->
        <section v-for="group in plan.groups" :key="group.key" class="rp-po-card">
          <header class="rp-po-card-head">
            <div class="rp-po-card-title">
              <h3 class="rp-po-vendor">
                {{ group.vendorId ? group.vendorName : t('Purchasing to source') }}
              </h3>
              <p class="rp-po-card-sub">
                {{ group.warehouseName }} · {{ tf('Needed in {n} days', { n: group.leadTimeDays }) }}
                <template v-if="group.vendorId"> · {{ t('Suggested vendor') }}</template>
              </p>
            </div>
            <div class="rp-po-card-total">
              <span class="rp-po-card-total-label">{{ t('Estimated value') }}</span>
              <span class="rp-po-card-total-value">{{ valueLabel(group.estimatedValue, group.estimatedValue) }}</span>
            </div>
          </header>

          <div class="rp-po-table-scroll">
            <table class="rp-po-table">
              <colgroup>
                <col>
                <col class="rp-po-col-qty">
                <col class="rp-po-col-qty">
                <col class="rp-po-col-unit">
                <col class="rp-po-col-value">
              </colgroup>
              <thead>
                <tr>
                  <th class="rp-po-th">{{ t('Product') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Suggested qty') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Request qty') }}</th>
                  <th class="rp-po-th">{{ t('Unit') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Estimated value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in group.lines" :key="`${line.sku}-${line.warehouseId}`" class="rp-po-tr">
                  <td class="rp-po-td">
                    <span class="rp-po-product">{{ line.productName }}</span>
                    <span class="rp-po-product-sub">{{ line.sku }}</span>
                    <!-- Switching vendor re-groups this line and re-sizes the qty. -->
                    <MpPopover
                      :id="`rp-pr-vendor-${line.sku}-${line.warehouseId}`"
                      is-close-on-select
                      use-portal
                      :is-keep-alive="false"
                      placement="bottom-start"
                    >
                      <MpPopoverTrigger>
                        <MpTextlink
                          :id="`rp-pr-change-vendor-${line.sku}-${line.warehouseId}`"
                          as="a"
                          class="rp-po-link"
                        >{{ t('Change vendor') }}</MpTextlink>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
                        <MpPopoverList>
                          <MpPopoverListItem
                            v-for="alt in alternativesFor(line.sku)"
                            :key="alt.id"
                            :is-active="alt.vendorId === line.vendorId"
                            @click="chooseVendor(rowKeyFor(line.sku, line.warehouseId), alt.vendorId)"
                          >
                            {{ vendorNameFor(alt.vendorId) }} · {{ tf('{n} days', { n: alt.leadTimeDays }) }}
                          </MpPopoverListItem>
                          <!-- Not linked to this product yet — picking one links it on save. -->
                          <MpPopoverListItem
                            v-for="v in otherVendorsFor(line.sku)"
                            :key="`other-${v.id}`"
                            :is-active="v.id === line.vendorId"
                            @click="chooseVendor(rowKeyFor(line.sku, line.warehouseId), v.id)"
                          >
                            {{ v.name }} · {{ t('New for this product') }}
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

                    <!-- Notes live with the vendor they describe, so the qty cell stays a
                         bare 40px input (FormTable.md › row baseline). -->
                    <span v-if="termsNote(line)" class="rp-po-note">{{ termsNote(line) }}</span>
                    <!-- US-019 AC-05: a vendor new to this product sizes with the category lead time. -->
                    <span v-if="line.newVendorLink" class="rp-po-note">
                      {{ tf('New vendor for this product. Lead time is estimated at {n} days.', { n: line.context.leadTimeDays }) }}
                    </span>
                    <!-- US-019 EH-01: the preferred vendor was deactivated. -->
                    <span v-if="rowFor(rowKeyFor(line.sku, line.warehouseId))?.inactivePreferredVendor" class="rp-po-note">
                      {{ t('Preferred vendor is inactive — purchasing will confirm the vendor.') }}
                    </span>
                    <!-- Offered, never applied behind the user's back (AC-03). -->
                    <span
                      v-if="pendingRecommend[rowKeyFor(line.sku, line.warehouseId)]"
                      class="rp-po-note rp-po-note--prompt"
                    >
                      {{ pendingNote(rowKeyFor(line.sku, line.warehouseId)) }}
                      <span class="rp-po-note-actions">
                        <MpTextlink
                          :id="`rp-pr-apply-${line.sku}-${line.warehouseId}`"
                          as="a"
                          class="rp-po-link"
                          @click.prevent="applyRecommendation(rowKeyFor(line.sku, line.warehouseId))"
                        >{{ t('Use suggested qty') }}</MpTextlink>
                        <MpTextlink
                          :id="`rp-pr-keep-${line.sku}-${line.warehouseId}`"
                          as="a"
                          class="rp-po-link"
                          @click.prevent="dismissRecommendation(rowKeyFor(line.sku, line.warehouseId))"
                        >{{ t('Keep my qty') }}</MpTextlink>
                      </span>
                    </span>
                  </td>
                  <td class="rp-po-td rp-po-td--num">{{ line.recommendedQty }}</td>
                  <td
                    class="rp-po-td rp-po-td--input"
                    :class="{ 'rp-po-td--error': showQtyErrors && line.finalQty <= 0 }"
                  >
                    <MpInput
                      :id="`rp-pr-qty-${line.sku}-${line.warehouseId}`"
                      :model-value="String(line.finalQty)"
                      type="number"
                      :aria-label="t('Request qty')"
                      @update:model-value="(v: string) => setQty(rowKeyFor(line.sku, line.warehouseId), v)"
                    />
                  </td>
                  <td class="rp-po-td">{{ line.unit }}</td>
                  <td class="rp-po-td rp-po-td--num">{{ valueLabel(line.finalQty * line.unitCost, line.unitCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Skipped lines are listed, never silently dropped. -->
        <section v-if="plan.skipped.length" class="rp-po-card">
          <header class="rp-po-card-head">
            <h3 class="rp-po-vendor">{{ tf('Skipped products: {n}', { n: plan.skipped.length }) }}</h3>
          </header>
          <ul class="rp-po-skip-list">
            <li v-for="s in plan.skipped" :key="`${s.sku}-${s.warehouseId}`" class="rp-po-skip-item">
              <span class="rp-po-product">{{ s.productName }}</span>
              <span class="rp-po-product-sub">{{ s.sku }} · {{ s.warehouseName }}</span>
              <span class="rp-po-note">{{ prSkipReasonLabel(s.reason) }}</span>
              <!-- Needs setup = no vendor / lead time yet: the vendor drawer is where
                   that is fixed, for THIS product (not just the first skipped one). -->
              <MpTextlink
                v-if="s.reason === 'needs-setup'"
                :id="`rp-pr-skip-vendors-${s.sku}-${s.warehouseId}`"
                as="a"
                class="rp-po-link"
                @click.prevent="emit('assign-vendor', s.sku)"
              >{{ t('View vendors, lead time and MOQ') }}</MpTextlink>
            </li>
          </ul>
        </section>

        <!-- Errors sit below the form, never in a toast (rule/form-errors-inline). -->
        <p v-if="qtyError || submitError" class="rp-po-error" role="alert">{{ qtyError || submitError }}</p>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton id="rp-pr-cancel" variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton id="rp-pr-confirm" variant="primary" is-rounded @click="confirm">{{ confirmLabel }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.rp-po-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rp-po-summary--muted { color: var(--mp-text-secondary); }
.rp-po-summary--warning { margin-top: var(--mp-spacing-0\.5); color: var(--mp-colors-text-warning); }

/* A boxed table inside a modal: bold outer edge, default inner rules
   (rule/table-outer-border-bold). Never a drop-shadow. */
.rp-po-card {
  margin-top: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.rp-po-card-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-card-title { min-width: 0; }
.rp-po-vendor {
  margin: 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}
.rp-po-card-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total { text-align: right; white-space: nowrap; }
.rp-po-card-total-label { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total-value {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}

/* Form table — docs/patterns/FormTable.md. */
.rp-po-table-scroll { overflow-x: auto; }
.rp-po-table { width: 100%; min-width: 640px; table-layout: fixed; border-collapse: collapse; }
.rp-po-col-qty { width: 136px; }
.rp-po-col-unit { width: 96px; }
.rp-po-col-value { width: 168px; }

/* White header, uppercase, 28px, no vertical dividers
   (rule/table-form-header-white, rule/table-header-uppercase, rule/table-header-height). */
.rp-po-th {
  height: var(--mp-sizes-7);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; text-align: left; white-space: nowrap;
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-th:first-child, .rp-po-td:first-child { padding-left: var(--mp-spacing-4); }
.rp-po-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

/* Read-only cells are gray so the one editable column stands out
   (rule/table-nonform-bg-gray). */
.rp-po-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.rp-po-td:last-child { border-right: none; }
.rp-po-tr:last-child .rp-po-td { border-bottom: none; }
.rp-po-td--num {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
  text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* The cell owns the border and the focus ring; the input inside is borderless and
   fills the 40px baseline (rule/table-form-cell-no-border). */
.rp-po-td--input { padding: 0; background: var(--mp-background-neutral); position: relative; }
.rp-po-td--input :deep([class*='input']) {
  width: 100%; height: var(--mp-sizes-10);
  border-color: transparent; border-radius: 0; box-shadow: none !important; /* pixel-police-allow-shadow: strips the input's own ring, the cell draws it */
  text-align: right; font-variant-numeric: tabular-nums;
}
/* Pinned to the top 40px: a line with notes is taller than its input. */
.rp-po-td--input:focus-within::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10);
  border: 1px solid var(--mp-border-bold); pointer-events: none;
}
.rp-po-td--input.rp-po-td--error { background: var(--mp-colors-background-danger); }
.rp-po-td--error::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10);
  border: 1px solid var(--mp-colors-border-danger); pointer-events: none;
}
.rp-po-td--error :deep([class*='input']) { background: transparent; }

.rp-po-product { display: block; }
.rp-po-product-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
/* MpTextlink keeps its own size and a 2px inline padding (layered !important), so
   pull it back to sit flush with the text above it. */
.rp-po-link { margin-left: calc(-1 * var(--mp-spacing-0\.5)); }
.rp-po-note {
  display: block; margin-top: var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning);
}
.rp-po-note--prompt { margin-top: var(--mp-spacing-1); color: var(--mp-colors-text-information); }
.rp-po-note-actions { display: flex; gap: var(--mp-spacing-3); }

/* A real list, so it keeps its markers (CLAUDE.md › List bullets). */
.rp-po-skip-list {
  list-style: disc outside; margin: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-8);
}
.rp-po-skip-item {
  display: list-item; padding: var(--mp-spacing-1) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}

.rp-po-error { margin-top: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
