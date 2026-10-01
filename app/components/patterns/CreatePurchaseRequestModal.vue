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
  MpButton, MpButtonGroup, MpTextlink, MpInput, MpIcon, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import type { WorklistRow } from '~/data/replenishment'
import {
  planPurchaseRequests, prSkipReasonLabel, recomputeQtyForVendor, type PrLine,
} from '~/data/replenishmentPurchaseRequest'
import { vendorItemsForSku, vendorNameFor } from '~/data/vendorItems'
import { vendors } from '~/data/vendors'
import ContentList from '~/components/patterns/ContentList.vue'
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

/**
 * One flat table in the order the user selected the rows. The plan still groups
 * by vendor to build the requests, but a vendor change must not make a line jump
 * to another card, so the table reads from the plan without regrouping.
 */
const lines = computed(() => {
  const byKey = new Map<string, { line: PrLine; leadTimeDays: number; vendorName: string; warehouseName: string }>()
  for (const g of plan.value.groups) {
    for (const line of g.lines) {
      byKey.set(rowKeyFor(line.sku, line.warehouseId), { line, leadTimeDays: g.leadTimeDays, vendorName: g.vendorName, warehouseName: g.warehouseName })
    }
  }
  return props.rows
    .map((r) => byKey.get(r.key))
    .filter((x): x is NonNullable<typeof x> => !!x)
})

const totalValue = computed(() => plan.value.groups.reduce((sum, g) => sum + g.estimatedValue, 0))

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
    ? tf('Suggested qty for {vendor} is {to}. Your qty is {from}', { vendor: vendorName, to, from })
    : tf('Suggested qty without a vendor is {to}. Your qty is {from}', { to, from })
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
    return tf('Vendor MOQ is {n}. Purchasing rounds up the qty on the purchase order', { n: vi.moq })
  }
  if (vi.packSize > 1 && line.finalQty % vi.packSize !== 0) {
    return tf('Purchase multiplier is {n}. Purchasing rounds up the qty on the purchase order', { n: vi.packSize })
  }
  return ''
}

const confirmLabel = computed(() => {
  const n = plan.value.totals.requestCount
  return n > 1 ? tf('Create {n} purchase requests', { n }) : t('Create purchase request')
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
    qtyError.value = t('Enter a qty for at least one product')
    return
  }
  const zeroLines = Object.entries(overrides).filter(([, v]) => v <= 0).length
  if (zeroLines > 0) {
    showQtyErrors.value = true
    qtyError.value = tf('Products with qty 0: {n}. Enter a qty greater than 0', { n: zeroLines })
    return
  }
  emit('confirm', { overrides: { ...overrides }, vendorChoices: { ...vendorChoices } })
}
</script>

<template>
  <!-- scroll-behavior="auto": the body scrolls and the header + footer stay put
       (Pixel MpModal › Usage: Scrollable). -->
  <MpModal
    id="rp-create-pr"
    :is-open="isOpen"
    size="xl"
    scroll-behavior="auto"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Request to purchase') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <!-- Says plainly that purchasing owns the next step (US-020 AC-03). -->
        <MpBanner id="rp-pr-banner" variant="info" align-items="center">
          <MpBannerIcon id="rp-pr-banner-icon" />
          <MpBannerTitle>{{ t('Purchasing takes it from here') }}</MpBannerTitle>
          <MpBannerDescription>
            {{ t('The purchasing team reviews these requests and decides which become purchase orders.') }}
          </MpBannerDescription>
        </MpBanner>

        <!-- Header summary: key/value pairs are ContentList (docs/patterns/ContentList.md). -->
        <div v-if="plan.totals.requestCount" class="rp-po-summary" :style="{ '--rp-po-cols': plan.skipped.length ? 5 : 4 }">
          <ContentList :label="t('Purchase requests')" :value="plan.totals.requestCount" />
          <ContentList :label="t('Vendors')" :value="plan.totals.vendorCount" />
          <ContentList :label="t('Products')" :value="plan.totals.lineCount" />
          <ContentList v-if="plan.skipped.length" :label="t('Skipped products')" :value="plan.skipped.length" />
          <ContentList :label="t('Total estimated value')" :value="formatIDR(totalValue)" />
        </div>
        <p v-else class="rp-po-empty">{{ t('Nothing can be requested from this selection.') }}</p>

        <!-- One table. The vendor is a column, so it is visible and changeable per
             line; lines that share a vendor become one request on confirm. -->
        <div v-if="lines.length" class="rp-po-card">
          <div class="rp-po-table-scroll">
            <table class="rp-po-table">
              <colgroup>
                <col>
                <col class="rp-po-col-vendor">
                <col class="rp-po-col-qty">
                <col class="rp-po-col-qty">
                <col class="rp-po-col-unit">
                <col class="rp-po-col-value">
              </colgroup>
              <thead>
                <tr>
                  <th class="rp-po-th">{{ t('Product') }}</th>
                  <th class="rp-po-th">{{ t('Vendor') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Suggested qty') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Request qty') }}</th>
                  <th class="rp-po-th">{{ t('Unit') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Estimated value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="{ line, leadTimeDays, vendorName, warehouseName } in lines" :key="`${line.sku}-${line.warehouseId}`" class="rp-po-tr">
                  <td class="rp-po-td">
                    <span class="rp-po-product">{{ line.productName }}</span>
                    <span class="rp-po-product-sub">{{ line.sku }} · {{ warehouseName }}</span>
                  </td>

                  <!-- Vendor: a select-like cell (FormTable.md › Select / Search Cell).
                       Switching re-sizes the qty from that vendor's lead time. -->
                  <td class="rp-po-td rp-po-td--select">
                    <MpPopover
                      :id="`rp-pr-vendor-${line.sku}-${line.warehouseId}`"
                      is-close-on-select
                      use-portal
                      :is-keep-alive="false"
                      placement="bottom-start"
                    >
                      <MpPopoverTrigger>
                        <div class="rp-po-vendor-trigger" role="button" tabindex="0">
                          <span class="rp-po-vendor-text">
                            <span class="rp-po-vendor-name">{{ line.vendorId ? vendorName : t('Purchasing to source') }}</span>
                            <span class="rp-po-product-sub">{{ tf('Lead time: {n} days', { n: leadTimeDays }) }}</span>
                          </span>
                          <MpIcon name="chevrons-down" size="sm" class="rp-po-vendor-chevron" />
                        </div>
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

                    <!-- Notes belong to the vendor they describe. -->
                    <span v-if="termsNote(line)" class="rp-po-note">{{ termsNote(line) }}</span>
                    <!-- US-019 AC-05: a vendor new to this product sizes with the category lead time. -->
                    <span v-if="line.newVendorLink" class="rp-po-note">
                      {{ tf('New vendor for this product. Lead time is estimated at {n} days', { n: line.context.leadTimeDays }) }}
                    </span>
                    <!-- US-019 EH-01: the preferred vendor was deactivated. -->
                    <span v-if="rowFor(rowKeyFor(line.sku, line.warehouseId))?.inactivePreferredVendor" class="rp-po-note">
                      {{ t('Preferred vendor is inactive. Purchasing will confirm the vendor') }}
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
                  <td class="rp-po-td">{{ line.unit }}</td>
                  <td class="rp-po-td rp-po-td--num">{{ valueLabel(line.finalQty * line.unitCost, line.unitCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Skipped lines are listed, never silently dropped. -->
        <section v-if="plan.skipped.length" class="rp-po-card rp-po-card--list">
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
.rp-po-empty { margin-top: var(--mp-spacing-4); color: var(--mp-text-secondary); }

/* Header summary — ContentList carries its own 8px rhythm, so no row gap. */
.rp-po-summary {
  display: grid; grid-template-columns: repeat(var(--rp-po-cols, 4), minmax(0, 1fr));
  column-gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-2);
}

/* A boxed table inside a modal: bold outer edge, default inner rules
   (rule/table-outer-border-bold). Never a drop-shadow. */
.rp-po-card {
  margin-top: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.rp-po-card-head {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-vendor {
  margin: 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}

/* Form table — docs/patterns/FormTable.md. */
.rp-po-table-scroll { overflow-x: auto; }
.rp-po-table { width: 100%; min-width: 760px; table-layout: fixed; border-collapse: collapse; }
.rp-po-col-vendor { width: 200px; }
.rp-po-col-qty { width: 128px; }
.rp-po-col-unit { width: 64px; }
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

/* Read-only cells are gray so the editable columns stand out
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

/* Editable cells: white, the cell owns border + focus ring, the control inside is
   borderless and fills the 40px baseline (rule/table-form-cell-no-border). */
.rp-po-td--input, .rp-po-td--select { padding: 0; background: var(--mp-background-neutral); position: relative; }
.rp-po-td--input :deep([class*='input']) {
  width: 100%; height: var(--mp-sizes-10);
  border-color: transparent; border-radius: 0; box-shadow: none !important; /* pixel-police-allow-shadow: strips the input's own ring, the cell draws it */
  text-align: right; font-variant-numeric: tabular-nums;
}
.rp-po-td--input:focus-within::after, .rp-po-td--select:focus-within::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10);
  border: 1px solid var(--mp-border-bold); pointer-events: none;
}
.rp-po-td--input.rp-po-td--error { background: var(--mp-colors-background-danger); }
.rp-po-td--error::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10);
  border: 1px solid var(--mp-colors-border-danger); pointer-events: none;
}
.rp-po-td--error :deep([class*='input']) { background: transparent; }

/* Vendor select trigger — a custom single-root trigger, not a bordered MpSelect. */
.rp-po-vendor-trigger {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
  cursor: pointer;
}
.rp-po-vendor-text { display: flex; flex-direction: column; min-width: 0; }
.rp-po-vendor-name { overflow-wrap: anywhere; }
.rp-po-vendor-chevron { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5); }
.rp-po-td--select .rp-po-note { padding: 0 var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4); }

.rp-po-product { display: block; }
.rp-po-product-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-po-link { display: inline-block; margin-left: calc(-1 * var(--mp-spacing-0\.5)); }
.rp-po-note {
  display: block; margin-top: var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning);
}
.rp-po-note--prompt { padding: var(--mp-spacing-1) var(--mp-spacing-2); color: var(--mp-colors-text-information); }
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
