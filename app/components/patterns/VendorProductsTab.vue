<script setup lang="ts">
/**
 * Vendor detail › Products tab — the Vendor Supply Profile surface.
 *
 * PRD "Vendor Supply Profile" v1.0 (18 Sep 2026), user stories US-01 … US-30.
 * This is the screen that answers "what does this vendor sell us, on what terms,
 * and what did we last pay?" without opening a single historical invoice.
 *
 * The one idea the layout has to carry: MOST OF THIS TAB IS DERIVED, NOT TYPED.
 * The product list builds itself from approved Supplier Invoices (Rule 1) and the
 * last price is read back off the invoice that produced it (Rule 5). Only MoQ and
 * purchase multiple are entered by a person, which is why only those two cells are
 * editable and only those two carry an audit trail.
 *
 * Rules that shape the markup and must not be "tidied" away:
 *   • Rule 7  — the UoM sits ADJACENT to the price at every width. Not a tooltip,
 *               not an overflow menu, not truncated. The price is meaningless
 *               without its basis, and a wrong basis is a real commercial error.
 *   • Rule 28 — help text states the price is a purchasing reference, never
 *               inventory valuation. This exists to stop finance escalations.
 *   • US-06   — a null price and a zero price never render the same. "No purchase
 *               yet" is its own state, not a blank, a dash, or Rp0.
 *   • US-19   — without the price permission the price columns are ABSENT, not
 *               blanked. A blanked column says "there is a number and you can't
 *               have it"; an absent one is simply a narrower table.
 *   • US-05   — an unavailable action states its reason in the menu. A silent grey
 *               item is called out as a defect in the stories, so the reason is
 *               rendered as visible caption text, not tooltip-only.
 *
 * Deliberately NOT here: delivery lead time. It is captured by this release but
 * displayed in the Inventory module (decision 2026-09-17). Adding it here would
 * split the surface, so it stays out even though the data exists.
 */
import { ref, reactive, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpBanner, MpBannerIcon, MpBannerDescription, MpTooltip, MpButton,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTextlink, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import AddVendorProductModal from '~/components/patterns/AddVendorProductModal.vue'
import EditVendorTermsModal from '~/components/patterns/EditVendorTermsModal.vue'
import { useTableState } from '~/composables/useTableState'
import { vendorItemsForVendor, upsertVendorItem } from '~/data/vendorItems'
import { supplementalSupply } from '~/data/vendorSuppliedProducts'
import { lastPriceFor, hasTransactionHistory, markManuallyAdded, type VendorPriceRecord } from '~/data/vendorLastPrice'
import { termsAuditFor, recordTermsChange } from '~/data/vendorTermsAudit'
import { productBySku } from '~/data/inventory'
import { hashStr } from '~/data/cycleCountRecommendations'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'

const props = defineProps<{
  /** Vendor master id (V0NN) — the key both the engine and the price store use. */
  vendorMasterId: string
  /** Contact id, used as the fallback supply key for a contact with no master link. */
  contactId: string
  vendorName: string
  /** Demo scenario from the page's ScenarioFab. */
  scenario: 'data' | 'empty' | 'no-price-permission' | 'backfill'
}>()

const router = useRouter()
const { t } = useLocale()

const emptyIllustration = '/illustrations/empty-folder.png'

/** Rule 24 — the price is gated by its OWN permission, not by vendor read access. */
const canSeePrices = computed(() => props.scenario !== 'no-price-permission')
/** OD-006 — the 24-month backfill is still reading history for this tenant. */
const backfillPending = computed(() => props.scenario === 'backfill')

// ── Rows ──────────────────────────────────────────────────────────────────────
// Engine links first (the coffee/packaging/equipment suppliers); the demo-only
// supplemental list covers the distributor-type vendors the engine doesn't reach.
// Both feed the same row shape so the tab reads identically either way.
const supplyKey = computed(() => props.vendorMasterId || props.contactId)

interface VendorProductRow extends Record<string, unknown> {
  id: string
  sku: string
  product: string
  desc: string
  image: string
  uom: string
  moq: number
  moqUnit: string
  purchaseMultiple: number
  multipleUnit: string
  price: VendorPriceRecord | null
  lastPrice: number | null
  lastPriceDate: string
  termsUpdatedAgo: number
  blockedReason: string
}

const allRows = computed<VendorProductRow[]>(() => {
  if (props.scenario === 'empty') return []

  const engine = props.vendorMasterId
    ? vendorItemsForVendor(props.vendorMasterId).filter((vi) => vi.active !== false)
    : []

  const base = engine.length
    ? engine.map((vi) => ({
      sku: vi.sku, moq: vi.moq, packSize: vi.packSize, purchaseUnit: vi.purchaseUnit,
      // Unset means "same as the purchase unit" — the common case, and what every
      // row created before the two terms could differ still means.
      moqUnit: vi.moqUnit ?? vi.purchaseUnit,
      multipleUnit: vi.multipleUnit ?? vi.purchaseUnit,
    }))
    : supplementalSupply(supplyKey.value).map((s) => ({
      sku: s.sku, moq: s.moq, packSize: s.packSize, purchaseUnit: s.purchaseUnit,
      moqUnit: s.purchaseUnit, multipleUnit: s.purchaseUnit,
    }))

  return base.map((b) => {
    const product = productBySku(b.sku)
    const price = canSeePrices.value ? lastPriceFor(supplyKey.value, b.sku) : null
    // Rule 2 — removal is blocked while any PD or SI references the pair. The
    // reason is carried on the row so the menu can state it rather than grey out.
    const blocked = hasTransactionHistory(supplyKey.value, b.sku)
    return {
      id: `${supplyKey.value}-${b.sku}`,
      sku: b.sku,
      product: product?.name ?? b.sku,
      desc: b.sku,
      image: product?.img ?? '',
      uom: b.purchaseUnit,
      moq: b.moq,
      moqUnit: b.moqUnit,
      purchaseMultiple: b.packSize,
      multipleUnit: b.multipleUnit,
      price,
      // Flat mirrors so the shared sorter can order by price and date.
      lastPrice: price?.grossUnitPrice ?? null,
      lastPriceDate: price?.date ?? '',
      termsUpdatedAgo: hashStr(`${supplyKey.value}:${b.sku}:terms`) % 400,
      blockedReason: blocked
        ? t('Cannot remove product. This product has purchase history with this vendor.')
        : '',
    }
  })
})

// ── Search + paging (US-02, US-07: 25 rows per page, code or name) ────────────
const { search, currentPage, perPage, paginated, total, sortKey, sortDir, setPage, setPerPage, setSort } =
  useTableState<VendorProductRow>(allRows, {
    perPage: 25,
    filterFn: (row, s) =>
      !s || row.product.toLowerCase().includes(s) || row.sku.toLowerCase().includes(s),
    defaultSort: { key: 'product', dir: 'asc' },
  })

// ── Columns ───────────────────────────────────────────────────────────────────
// Widths come from the semantic `kind` standard — never a hardcoded pixel width on
// a name/unit/amount/date column (rule/table-column-kind).
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'product', label: t('Product'), kind: 'name', sortable: true, sortType: 'text' },
    // Each term carries its own unit in-cell, so there is no separate unit column:
    // one shared "Purchase unit" heading would be a lie the moment the minimum and
    // the step are quoted in different units, which is the case this now supports.
    { key: 'moq', label: t('Minimum order qty'), align: 'right', sortable: true, sortType: 'number' },
    // "Purchase multiple" was trade jargon. This header is the whole sentence, so
    // the meaning survives without the tooltip being opened. It wraps to two lines
    // at normal widths, which is the price of it explaining itself.
    { key: 'purchaseMultiple', label: t('Order in multiples of'), align: 'right', sortable: true, sortType: 'number' },
  ]
  // US-19 — no price permission means these columns do not exist for this user.
  // They are not rendered empty; the table is simply narrower.
  if (canSeePrices.value) {
    cols.push(
      { key: 'lastPrice', label: t('Last price'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
      // Its own column again, so "which prices are stale?" is one sort away. The
      // price cell therefore shows only the invoice number — printing the date in
      // both places would be the same fact twice.
      { key: 'lastPriceDate', label: t('Last price date'), kind: 'date', sortable: true, sortType: 'date' },
    )
  }
  return cols
})

const exportColumns = computed(() => columns.value.map((c) => ({ key: c.key, label: c.label })))

// ── Inline edit of MoQ + purchase multiple (US-04) ────────────────────────────
// Per-row, not a whole-table edit mode: only one row is ever dirty, so a
// concurrent-edit conflict can be reported against the row it actually affects.
type EditField = 'moq' | 'purchaseMultiple'
const editing = ref<{ sku: string; field: EditField } | null>(null)
const draft = ref('')
// Per-row inline error. `conflict` distinguishes the two failures, because they
// need different recoveries: a bad value is fixed by retyping it, a concurrent
// edit is fixed by re-reading the row. Offering "Reload" on a typo would be noise.
const rowError = reactive<Record<string, { message: string; conflict: boolean }>>({})

function isEditing(sku: string, field: EditField): boolean {
  return editing.value?.sku === sku && editing.value.field === field
}

function startEdit(row: VendorProductRow, field: EditField): void {
  if (!props.vendorMasterId) return  // supplemental (read-only) vendors
  editing.value = { sku: row.sku, field }
  draft.value = String(row[field])
  delete rowError[row.sku]
  nextTick(() => document.getElementById(`vp-edit-${row.sku}-${field}`)?.focus())
}

function cancelEdit(): void {
  editing.value = null
  draft.value = ''
}

/**
 * Simulated concurrent edit (US-04 conflict state).
 *
 * A deterministic slice of rows behaves as if a colleague saved the same field
 * while this edit was open. The point of designing it is that the recovery must be
 * inline and must not silently discard what was typed.
 */
function isConflicted(sku: string): boolean {
  return hashStr(`${supplyKey.value}:${sku}:conflict`) % 11 === 0
}

function commitEdit(row: VendorProductRow, field: EditField): void {
  const raw = Number(draft.value)

  // Rule 20 — nullable, but when present must be greater than zero. Inline error,
  // never a toast, and the typed value is kept so it can be corrected in place.
  if (!Number.isFinite(raw) || raw <= 0 || !Number.isInteger(raw)) {
    rowError[row.sku] = { message: t('Quantity must be a whole number above 0. Please check your entry'), conflict: false }
    return
  }
  if (isConflicted(row.sku)) {
    rowError[row.sku] = { message: t('Someone else changed this row while you were editing. Please reload to see the current value'), conflict: true }
    return
  }

  const before = row[field] as number
  if (before !== raw) {
    upsertVendorItem({
      vendorId: props.vendorMasterId,
      sku: row.sku,
      moq: field === 'moq' ? raw : row.moq,
      packSize: field === 'purchaseMultiple' ? raw : row.purchaseMultiple,
    })
    // TS-008 — the audit write and the terms write land together. A terms change
    // with no attributed author cannot be disputed, which defeats the point.
    recordTermsChange(supplyKey.value, row.sku, [{
      label: field === 'moq' ? t('Min. order qty') : t('Purchase multiple'),
      from: String(before),
      to: String(raw),
    }])
    successToast(t('Ordering terms updated'))
  }
  delete rowError[row.sku]
  cancelEdit()
}

/**
 * Recover from a concurrent-edit conflict by re-reading the row.
 *
 * Clearing the message alone would leave the user looking at a value they now know
 * is stale, so this drops the local draft as well: the cell returns to whatever the
 * store holds, which is the value they were told to go and look at.
 */
function reloadRow(sku: string): void {
  delete rowError[sku]
  cancelEdit()
}

// ── Row actions ───────────────────────────────────────────────────────────────
const historyRow = ref<VendorProductRow | null>(null)
const editRow = ref<VendorProductRow | null>(null)
const removeRow = ref<VendorProductRow | null>(null)
const addOpen = ref(false)
const exportOpen = ref(false)

function openInvoice(row: VendorProductRow): void {
  if (!row.price?.invoiceAccessible) return
  router.push(`/purchase-invoices/${row.price.invoiceId}`)
}

/**
 * Save both terms and both units from the Edit modal.
 *
 * Every field that actually moved is written to the audit trail, units included —
 * a unit change alters what the number commits to, so it is exactly the kind of
 * change a dispute later turns on.
 */
function saveTerms(payload: { moq: number; moqUnit: string; purchaseMultiple: number; multipleUnit: string }): void {
  const row = editRow.value
  if (!row) return

  const changes: { label: string; from: string; to: string }[] = []
  if (row.moq !== payload.moq) {
    changes.push({ label: t('Minimum order qty'), from: String(row.moq), to: String(payload.moq) })
  }
  if (row.moqUnit !== payload.moqUnit) {
    changes.push({ label: t('Minimum order qty unit'), from: row.moqUnit, to: payload.moqUnit })
  }
  if (row.purchaseMultiple !== payload.purchaseMultiple) {
    changes.push({ label: t('Order in multiples of'), from: String(row.purchaseMultiple), to: String(payload.purchaseMultiple) })
  }
  if (row.multipleUnit !== payload.multipleUnit) {
    changes.push({ label: t('Order multiple unit'), from: row.multipleUnit, to: payload.multipleUnit })
  }

  if (changes.length) {
    upsertVendorItem({
      vendorId: props.vendorMasterId,
      sku: row.sku,
      moq: payload.moq,
      packSize: payload.purchaseMultiple,
      moqUnit: payload.moqUnit,
      multipleUnit: payload.multipleUnit,
    })
    recordTermsChange(supplyKey.value, row.sku, changes)
    successToast(t('Ordering terms updated'))
  }
  editRow.value = null
}

function confirmRemove(): void {
  const row = removeRow.value
  if (!row) return
  // Rule 2 — soft removal. The record is retained for audit and the row hidden; a
  // later Supplier Invoice for the pair recreates it via Rule 1.
  upsertVendorItem({ vendorId: props.vendorMasterId, sku: row.sku, active: false })
  successToast(t('Product removed'))
  removeRow.value = null
}

function onAdded(sku: string): void {
  // A hand-added pair has no invoice behind it, so it must show "no purchase yet"
  // rather than inheriting a price from anywhere.
  markManuallyAdded(supplyKey.value, sku)
  addOpen.value = false
  successToast(t('Product added'))
}

// ── Formatting ────────────────────────────────────────────────────────────────
/** Rule 19 — IDR 0 decimals, foreign currency 2. formatMoney owns the id-ID grouping. */
function priceText(p: VendorPriceRecord): string {
  return p.currency === 'IDR'
    ? formatMoney(Math.round(p.grossUnitPrice), 'IDR')
    : formatMoney(p.grossUnitPrice, p.currency)
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Terms drift (PRD risk register): terms nobody has revisited stop being trusted. */
function termsStale(row: VendorProductRow): boolean {
  return row.termsUpdatedAgo > 270
}

const canEditTerms = computed(() => !!props.vendorMasterId)
</script>

<template>
  <section class="vp-panel">
    <!-- Backfill still reading 24 months of history. Without this banner a
         half-populated tab is indistinguishable from a vendor with no history. -->
    <MpBanner v-if="backfillPending" id="vp-backfill" variant="info" is-inline class="vp-banner">
      <MpBannerIcon id="vp-backfill-icon" />
      <MpBannerDescription id="vp-backfill-desc">
        {{ t('We are still reading the last 24 months of purchase history for this vendor. Products and prices will keep appearing here until it finishes.') }}
      </MpBannerDescription>
    </MpBanner>

    <div class="vp-head">
      <div class="vp-head-text">
        <h2 class="vp-title">{{ t('Products supplied') }}</h2>
        <p class="vp-sub">
          {{ t('This list builds itself. A product appears here after you approve a supplier invoice for it. You only fill in the two order rules.') }}
        </p>
      </div>
      <!-- The create action sits at the top right of the surface it creates into,
           the same place every index page puts it. Import and export are table
           tools, so they live with the table's own controls instead. -->
      <button
        v-if="canEditTerms"
        class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before vp-add-btn"
        type="button"
        @click="addOpen = true"
      >
        <MpIcon name="add" size="sm" /> {{ t('Product') }}
      </button>
    </div>

    <!-- The price-permission state still needs saying in the body: there is no
         Last price column left to hang a tooltip on. -->
    <p v-if="!canSeePrices" class="vp-hint">
      {{ t('Purchase prices are hidden because your role does not include permission to view them. Ask an admin if you need access.') }}
    </p>

    <ErpTablePage
      class="vp-table"
      :columns="columns"
      :rows="paginated"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :search="search"
      :has-active-search="!!search"
      filter-empty-label="product"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-filters="search = ''"
      @clear-search="search = ''"
      @clear-all="search = ''"
    >
      <!-- Search pill + export, right-aligned (rule/filter-bar-search-export) -->
      <template #filters>
        <div class="vp-toolbar">
          <!-- Import sits next to Export: they are the same job in two directions,
               and pairing them keeps the file-transfer tools together. -->
          <button
            v-if="canEditTerms"
            class="btn-enterprise btn-enterprise--secondary"
            type="button"
            @click="router.push(`/vendors/${contactId}/import-terms`)"
          >{{ t('Import terms') }}</button>
          <MpTooltip id="vp-tt-export" :label="t('Export')" placement="bottom" use-portal>
            <MpButton variant="ghost" is-rounded :aria-label="t('Export')" @click="exportOpen = true">
              <MpIcon name="download" size="md" />
            </MpButton>
          </MpTooltip>
          <!-- Search is a rounded form pill, labelled by aria-label rather than a
               placeholder (rule/input-no-placeholder). -->
          <MpInputGroup id="vp-search" class="filter-search">
            <MpInputLeftAddon><MpIcon name="search" size="md" /></MpInputLeftAddon>
            <MpInput v-model="search" type="text" :aria-label="t('Search product code or name')" />
            <MpInputRightAddon v-if="search">
              <MpButton variant="ghost" is-rounded :aria-label="t('Clear search')" @click="search = ''">
                <MpIcon name="close" size="sm" />
              </MpButton>
            </MpInputRightAddon>
          </MpInputGroup>
        </div>
      </template>

      <!-- Column help. Both explanations moved off the page body and onto the
           header they describe, so the tab opens on data rather than on prose.
           The trigger is focusable, so the text is reachable by keyboard and not
           only by hover. -->
      <template #header-moq>
        <MpTooltip
          id="vp-tt-moq"
          :label="t('The smallest amount the vendor accepts on one order. Above it, quantity goes up in fixed amounts: a minimum of 100 with multiples of 25 lets you order 100, 125, or 150.')"
          placement="bottom"
          use-portal
        >
          <span class="vp-th-help" tabindex="0" role="note" @click.stop>
            <MpIcon name="info" size="sm" />
          </span>
        </MpTooltip>
      </template>

      <template #header-lastPrice>
        <MpTooltip
          id="vp-tt-price"
          :label="t('The gross price on the most recent approved supplier invoice, before discount and tax, in the unit it was invoiced in. It is a purchasing reference and is never used for inventory valuation.')"
          placement="bottom"
          use-portal
        >
          <span class="vp-th-help" tabindex="0" role="note" @click.stop>
            <MpIcon name="info" size="sm" />
          </span>
        </MpTooltip>
      </template>

      <!-- Product: photo + name, SKU as the caption line -->
      <template #cell-product="{ row }">
        <ProductCell
          :name="(row as VendorProductRow).product"
          :desc="(row as VendorProductRow).sku"
          :image="(row as VendorProductRow).image"
          linkable
          @name-click="router.push(`/product-list/${(row as VendorProductRow).sku}`)"
        />
      </template>

      <!-- MoQ / purchase multiple: click to edit just this cell -->
      <template #cell-moq="{ row }">
        <div class="vp-editcell">
          <!-- Number and unit read as one value on one line: "6 Pallet". Splitting
               them across lines made the unit look like a caption about the number
               rather than part of it. -->
          <div class="vp-term">
            <MpInput
              v-if="isEditing((row as VendorProductRow).sku, 'moq')"
              :id="`vp-edit-${(row as VendorProductRow).sku}-moq`"
              v-model="draft"
              type="number"
              :class="css({ width: '80px' })"
              @keyup.enter="commitEdit(row as VendorProductRow, 'moq')"
              @keyup.esc="cancelEdit"
              @blur="commitEdit(row as VendorProductRow, 'moq')"
            />
            <button
              v-else-if="canEditTerms"
              class="vp-editable"
              type="button"
              @click="startEdit(row as VendorProductRow, 'moq')"
            >{{ (row as VendorProductRow).moq.toLocaleString('id-ID') }}</button>
            <span v-else>{{ (row as VendorProductRow).moq.toLocaleString('id-ID') }}</span>
            <span class="vp-term-unit">{{ (row as VendorProductRow).moqUnit }}</span>
          </div>

          <!-- Terms nobody has revisited drift away from what the vendor actually
               agreed. Flagging the age is what makes the field keep its trust. -->
          <span v-if="termsStale(row as VendorProductRow)" class="vp-stale">
            {{ t('Last reviewed') }} {{ Math.round((row as VendorProductRow).termsUpdatedAgo / 30) }} {{ t('months ago') }}
          </span>
        </div>
      </template>

      <template #cell-purchaseMultiple="{ row }">
        <div class="vp-editcell">
          <!-- Number and unit read as one value on one line: "6 Pallet". Splitting
               them across lines made the unit look like a caption about the number
               rather than part of it. -->
          <div class="vp-term">
            <MpInput
              v-if="isEditing((row as VendorProductRow).sku, 'purchaseMultiple')"
              :id="`vp-edit-${(row as VendorProductRow).sku}-purchaseMultiple`"
              v-model="draft"
              type="number"
              :class="css({ width: '80px' })"
              @keyup.enter="commitEdit(row as VendorProductRow, 'purchaseMultiple')"
              @keyup.esc="cancelEdit"
              @blur="commitEdit(row as VendorProductRow, 'purchaseMultiple')"
            />
            <button
              v-else-if="canEditTerms"
              class="vp-editable"
              type="button"
              @click="startEdit(row as VendorProductRow, 'purchaseMultiple')"
            >{{ (row as VendorProductRow).purchaseMultiple.toLocaleString('id-ID') }}</button>
            <span v-else>{{ (row as VendorProductRow).purchaseMultiple.toLocaleString('id-ID') }}</span>
            <span class="vp-term-unit">{{ (row as VendorProductRow).multipleUnit }}</span>
          </div>

          <!-- Inline, next to the field it belongs to — never a toast
               (rule/form-errors-inline). Sits on the last editable column so it
               has room to read without squeezing the identity cell. -->
          <span v-if="rowError[(row as VendorProductRow).sku]" class="vp-rowerr">
            {{ rowError[(row as VendorProductRow).sku]!.message }}
            <!-- Only a concurrent edit is recoverable by re-reading; a bad value is
                 recovered by correcting the field that is still open. -->
            <MpTextlink
              v-if="rowError[(row as VendorProductRow).sku]!.conflict"
              :id="`vp-err-${(row as VendorProductRow).sku}`"
              as="a"
              @click.prevent="reloadRow((row as VendorProductRow).sku)"
            >{{ t('Reload') }}</MpTextlink>
          </span>
        </div>
      </template>

      <!-- Last price: the figure and its UoM travel together, always (Rule 7), and
           the document that produced it is one click away directly under the number
           rather than buried in the row menu (TS-007). Verifying a price is the
           commonest thing a buyer does with it, so it gets the shortest path. -->
      <template #cell-lastPrice="{ row }">
        <div class="vp-pricecell">
        <template v-if="(row as VendorProductRow).price">
          <span class="vp-price">
            <span class="vp-price-amount">{{ priceText((row as VendorProductRow).price!) }}</span>
            <span class="vp-price-uom">/ {{ (row as VendorProductRow).price!.uom }}</span>
          </span>
          <!-- US-17 — price, unit and date are one fact off one document, so they
               live in one cell and open that document together. `.cell-link` is the
               shared row-link utility (rule/table-name-link-span), so this is the
               same blue as every other clickable value in the app. -->
          <span
            v-if="(row as VendorProductRow).price!.invoiceAccessible"
            class="cell-link vp-src"
            role="link"
            tabindex="0"
            @click.stop="openInvoice(row as VendorProductRow)"
            @keydown.enter="openInvoice(row as VendorProductRow)"
          >{{ (row as VendorProductRow).price!.invoiceNumber }}</span>
          <!-- Rule 25 — the price still shows when its invoice does not; the link is
               withheld and says why, rather than 404-ing the user. The date stays,
               because how old the price is does not depend on document access. -->
          <span v-else class="vp-src-off">{{ t('No access to invoice') }}</span>
        </template>
        <!-- US-06 AC-02 — an explicit state. Never a dash, never Rp0: zero would
             read as "this vendor gives it away", which is a different claim. -->
        <span v-else class="vp-nopurchase">{{ t('No purchase yet') }}</span>
        </div>
      </template>

      <!-- The date opens the same invoice as the price: one document, one target. -->
      <template #cell-lastPriceDate="{ row }">
        <template v-if="(row as VendorProductRow).price">
          <span
            v-if="(row as VendorProductRow).price!.invoiceAccessible"
            class="cell-link"
            role="link"
            tabindex="0"
            @click.stop="openInvoice(row as VendorProductRow)"
            @keydown.enter="openInvoice(row as VendorProductRow)"
          >{{ formatDate((row as VendorProductRow).price!.date) }}</span>
          <span v-else>{{ formatDate((row as VendorProductRow).price!.date) }}</span>
        </template>
        <span v-else class="vp-muted">—</span>
      </template>

      <template #actions="{ row }">
        <MpPopover
          :id="`vp-menu-${(row as VendorProductRow).sku}`"
          is-close-on-select
          use-portal
          :is-keep-alive="false"
          placement="bottom-end"
        >
          <MpPopoverTrigger>
            <MpButton class="vp-kebab" variant="ghost" is-rounded :aria-label="t('More actions')">
              <MpIcon name="menu-kebab" size="md" />
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="router.push(`/product-list/${(row as VendorProductRow).sku}`)">
                {{ t('View product') }}
              </MpPopoverListItem>

              <!-- Editing both terms AND their units. The inline cell edit changes a
                   number; this changes the agreement, units included. -->
              <MpPopoverListItem v-if="canEditTerms" @click="editRow = row as VendorProductRow">
                {{ t('Edit ordering terms') }}
              </MpPopoverListItem>

              <MpPopoverListItem @click="historyRow = row as VendorProductRow">
                {{ t('Change history') }}
              </MpPopoverListItem>

              <div class="vp-menu-divider" />

              <!-- Rule 2 — removable only while nothing references the pair. The
                   blocked form STATES why (US-05); a bare grey item is a defect. -->
              <MpPopoverListItem
                v-if="canEditTerms && !(row as VendorProductRow).blockedReason"
                class="vp-menu-item--danger"
                @click="removeRow = row as VendorProductRow"
              >{{ t('Remove') }}</MpPopoverListItem>
              <MpPopoverListItem v-else-if="canEditTerms" class="vp-menu-item--off" @click.stop>
                <span class="vp-menu-off-label">{{ t('Remove') }}</span>
                <span class="vp-menu-sub">{{ (row as VendorProductRow).blockedReason }}</span>
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <!-- Never-had-data empty state. Says how the list populates, because the
           answer ("approve an invoice") is not guessable from an empty table. -->
      <template #empty>
        <div class="vp-empty">
          <img :src="emptyIllustration" alt="" class="vp-empty-img" width="288" height="240" />
          <p class="vp-empty-title">{{ t('No products') }}</p>
          <p class="vp-empty-desc">
            {{ t('Products appear here automatically once a supplier invoice from this vendor is approved. You can also add one now to set its ordering terms in advance.') }}
          </p>
          <button
            v-if="canEditTerms"
            class="btn-enterprise btn-enterprise--secondary vp-empty-cta"
            type="button"
            @click="addOpen = true"
          >{{ t('Add product') }}</button>
        </div>
      </template>
    </ErpTablePage>

    <AddVendorProductModal
      v-if="canEditTerms"
      :open="addOpen"
      :vendor-master-id="vendorMasterId"
      :vendor-name="vendorName"
      :taken-skus="allRows.map((r) => r.sku)"
      @close="addOpen = false"
      @added="onAdded"
    />

    <EditVendorTermsModal
      v-if="editRow"
      :open="!!editRow"
      :sku="editRow.sku"
      :product-name="editRow.product"
      :moq="editRow.moq"
      :moq-unit="editRow.moqUnit"
      :purchase-multiple="editRow.purchaseMultiple"
      :multiple-unit="editRow.multipleUnit"
      @close="editRow = null"
      @save="saveTerms"
    />

    <ActivityLogModal
      v-if="historyRow"
      :is-open="!!historyRow"
      :subject="historyRow.product"
      :entries="termsAuditFor(supplyKey, historyRow.sku)"
      @close="historyRow = null"
    />

    <ConfirmModal
      :is-open="!!removeRow"
      :title="t('Remove product?')"
      :description="t('The product stays in your catalogue. It will reappear here if a supplier invoice from this vendor is approved for it again.')"
      :confirm-label="t('Remove')"
      :cancel-label="t('Cancel')"
      @update:is-open="(v: boolean) => { if (!v) removeRow = null }"
      @confirm="confirmRemove"
    />

    <ExportModal
      :open="exportOpen"
      :title="t('Export ordering terms')"
      :entity-label="t('products')"
      :columns="exportColumns"
      :total="total"
      :show-column-search="false"
      @close="exportOpen = false"
      @export="exportOpen = false; successToast(t('Export started'))"
    />
  </section>
</template>

<style scoped>
.vp-panel { display: flex; flex-direction: column; min-height: 0; }
.vp-banner { margin-bottom: var(--mp-spacing-4); }

/* ── Header ── */
.vp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-2);
}
.vp-add-btn { flex-shrink: 0; }
@media (max-width: 640px) {
  .vp-head { flex-direction: column; }
}
.vp-head-text { min-width: 0; }
.vp-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vp-sub {
  margin: 0;
  max-width: 78ch;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
/* Explanations are captions, not cards: secondary colour, small, no border and no
   fill. They are reference text a user reads once, so they must not compete with
   the rows for attention every time the tab is opened. */
/* Header help icon — after the label, subdued, `cursor: help`, matching the
   shipped precedent (ProductDetailsPage's replenishment table: "Safety days (i)").
   ErpTablePage reverses `.th-inner` on right-aligned headers, so the icon has to
   become the FIRST flex item to land visually LAST. */
.vp-th-help {
  display: inline-flex;
  align-items: center;
  color: var(--mp-icon-subdued, #9ca3af);
  cursor: help;
}
.vp-th-help:hover { color: var(--mp-icon-default, #4b5563); }
.vp-table :deep(.erp-th--right) .vp-th-help { order: -1; }
.vp-hint {
  margin: 0 0 var(--mp-spacing-2);
  max-width: 96ch;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.vp-hint:last-of-type { margin-bottom: var(--mp-spacing-4); }

/* ── Toolbar ── */
.vp-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-left: auto;
}
/* The search pill keeps the shared `.filter-search` treatment from erp.css; only
   its width is page-local so the toolbar reads like every other index toolbar. */
.vp-toolbar :deep(.filter-search) { width: var(--mp-sizes-62, 248px); }

/* ── Editable cells ── */
.vp-editcell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--mp-spacing-1);
}
/* An editable value reads as a value, not a button — the affordance is the hover
   underline plus the dotted rule, so the resting table stays calm. */
.vp-editable {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--mp-text-default);
  cursor: text;
  border-bottom: 1px dashed var(--mp-border-default, #e3e7e9);
}
.vp-editable:hover { border-bottom-color: var(--mp-text-link); color: var(--mp-text-link); }
/* The unit sits under its number, quiet enough not to compete with the figure but
   always present — a bare number is not a term. */
/* Number + unit on one baseline; the unit is quieter but sits beside the figure,
   not beneath it. */
.vp-term {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: var(--mp-spacing-1);
  flex-wrap: nowrap;
}
.vp-term-unit {
  white-space: nowrap;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
/* Source line under the price. Only the SIZE is set here — the colour and hover
   underline come from the shared `.cell-link` utility in erp.css, so every
   clickable value in the app stays one colour. */
.vp-src { font-size: var(--mp-font-sizes-sm); }
.vp-src-off {
  font-size: var(--mp-font-sizes-xs);
  color: var(--mp-text-secondary);
}
.vp-stale {
  font-size: var(--mp-font-sizes-xs);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.vp-rowerr {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-xs);
  color: var(--mp-text-critical, #c0392b);
  text-align: right;
  max-width: 220px;
}

/* ── Price cell — the amount and its unit are one object and never separate. ── */
.vp-pricecell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--mp-spacing-0\.5);
}
.vp-price {
  display: inline-flex;
  align-items: baseline;
  gap: var(--mp-spacing-1);
  justify-content: flex-end;
  flex-wrap: wrap;
}
.vp-price-amount { color: var(--mp-text-default); }
.vp-price-uom {
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-sm);
  white-space: nowrap;
}
/* "No purchase yet" is a stated fact, so it is readable text rather than a dash. */
.vp-nopurchase {
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-sm);
}
.vp-muted { color: var(--mp-text-secondary); }

/* ── Row menu ── */
/* Sizing comes from MpButton; only the resting chrome is stripped so the kebab
   reads as an affordance on hover rather than a permanent control on every row. */
.vp-kebab { color: var(--mp-text-default); }
.vp-menu-divider {
  margin: var(--mp-spacing-1) 0;
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.vp-menu-item--danger { color: var(--mp-text-critical, #c0392b); }
.vp-menu-item--off { cursor: not-allowed; }
.vp-menu-off-label { color: var(--mp-text-disabled); display: block; }
/* The reason is visible without hovering — a grey item with no explanation is
   called out as a defect in US-05. */
.vp-menu-sub {
  display: block;
  font-size: var(--mp-font-sizes-xs);
  color: var(--mp-text-secondary);
  white-space: normal;
  max-width: 240px;
}

/* ── Empty state ── */
.vp-empty { display: flex; flex-direction: column; align-items: center; text-align: center; }
.vp-empty-img { margin-bottom: var(--mp-spacing-2); }
.vp-empty-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vp-empty-desc {
  margin: 0;
  max-width: 46ch;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.vp-empty-cta { margin-top: var(--mp-spacing-4); }


</style>
