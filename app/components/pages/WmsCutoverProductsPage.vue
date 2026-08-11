<script setup lang="ts">
/**
 * Data migration → WMS cutover → Set up WMS products.
 *
 * PRD "WMS Conversion Balance Setup" (PD/51260326215), Stories 1–5,
 * FR2–FR3, NFR2, NFR6. Enterprise rewrite of prototype step 3.
 * Route: /data-migration/wms-cutover/products (detailMatch → owns its own
 * 72px title bar + stage, per DESIGN.md → Layout → Stage).
 *
 * Deliberate changes from the prototype:
 *  - Continue is NEVER disabled (Button.md). Story 1 AC asks for a disabled
 *    control; the 100% gate is enforced on click instead, which honours the
 *    gate while telling the user WHICH product is blocking. Flagged for PM.
 *  - The inventory account stays editable after it is chosen — the prototype
 *    locked the select and the row checkbox permanently (a one-way door the
 *    PRD never asks for; its only lock is "once a closing book exists").
 *  - Search + status filter (NFR2 — "search and filter, not just scroll").
 *  - A specific validation reason per row (NFR6, FR13, Story 2 AC).
 *  - Columns are grouped (Inventory / Sales / Purchase) — 13 flat columns
 *    exceed what a user can hold at once.
 *
 * Sell/Buy fields are disabled (not wiped) on toggle-off and cleared at save
 * — FR2.6 as amended, so a stray click can't destroy three filled fields.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpIcon, MpProgress, MpCheckbox, MpBanner, MpBannerIcon, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalHeader, MpModalContent, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpButton, MpButtonGroup, MpSpinner, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  CUTOVER_TOTAL_PRODUCTS, cutoverProducts, cutoverState,
  inventoryAccounts, revenueAccounts, cogsAccounts, taxOptions,
  accountLabel, isCutoverProductComplete, missingCutoverFields, costBasisFor,
  type CutoverProduct, type CoaAccount,
} from '~/data/wmsCutover'

const { t } = useLocale()
const router = useRouter()

// ── Formatting (DESIGN.md → Number format) ──────────────────────────────────
const groupFmt = new Intl.NumberFormat('id-ID')
function fmtAmount(n: number | null): string {
  return n === null ? '' : groupFmt.format(n)
}
function parseAmount(raw: string): number | null {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}
/** Derived unit cost keeps 2dp — it is a division, unlike the entered totals. */
const unitCostFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtUnitCost(n: number): string {
  return `Rp${unitCostFmt.format(n)}`
}

function labelFor(list: CoaAccount[], code: string): string {
  const found = list.find((a) => a.code === code)
  return found ? accountLabel(found) : ''
}

// ── Progress ────────────────────────────────────────────────────────────────
const individuallyDone = computed(() => cutoverProducts.filter(isCutoverProductComplete).length)
const setUpCount = computed(() =>
  Math.min(CUTOVER_TOTAL_PRODUCTS, cutoverState.importedCount + individuallyDone.value),
)
const remaining = computed(() => CUTOVER_TOTAL_PRODUCTS - setUpCount.value)
const percent = computed(() => Math.round((setUpCount.value / CUTOVER_TOTAL_PRODUCTS) * 100))
const isAllSetUp = computed(() => setUpCount.value >= CUTOVER_TOTAL_PRODUCTS)

// ── Search + status filter (max 2 quick filters — Form.md) ──────────────────
const search = ref('')
const statusFilter = ref('') // '' = show all
// PRD Story 1 AC / FR2 vocabulary: "Set up / Incomplete".
const statusOptions = computed(() => [
  { label: t('Incomplete'), value: 'incomplete' },
  { label: t('Set up'),     value: 'set-up'     },
])
const statusLabel = computed(() => statusOptions.value.find((o) => o.value === statusFilter.value)?.label ?? '')

const visibleProducts = computed(() => {
  const s = search.value.trim().toLowerCase()
  return cutoverProducts.filter((p) => {
    if (s && !p.name.toLowerCase().includes(s) && !p.sku.toLowerCase().includes(s)) return false
    if (statusFilter.value === 'set-up' && !isCutoverProductComplete(p)) return false
    if (statusFilter.value === 'incomplete' && isCutoverProductComplete(p)) return false
    return true
  })
})

// ── Row selection + bulk assign ─────────────────────────────────────────────
const selectedIds = ref<string[]>([])
const allVisibleSelected = computed(
  () => visibleProducts.value.length > 0 && visibleProducts.value.every((p) => selectedIds.value.includes(p.id)),
)
const someVisibleSelected = computed(
  () => selectedIds.value.length > 0 && !allVisibleSelected.value,
)

function toggleSelectAll(checked: boolean) {
  selectedIds.value = checked ? visibleProducts.value.map((p) => p.id) : []
}
function toggleRow(id: string, checked: boolean) {
  selectedIds.value = checked
    ? [...selectedIds.value, id]
    : selectedIds.value.filter((x) => x !== id)
}

const bulkAccount = ref('')
function applyBulkAccount() {
  if (!bulkAccount.value) {
    bulkError.value = t('You must select inventory account')
    return
  }
  const n = selectedIds.value.length
  cutoverProducts.forEach((p) => {
    if (selectedIds.value.includes(p.id)) p.inventoryAccount = bulkAccount.value
  })
  toast.notify({
    variant: 'success',
    title: `${n} ${t('products updated')}`,
    maxWidth: 'max-content',
  })
  selectedIds.value = []
  bulkAccount.value = ''
  bulkError.value = ''
}
const bulkError = ref('')

// ── Sell / Buy groups ───────────────────────────────────────────────────────
// FR2.6 (amended): toggling off live-DISABLES the dependent trio but keeps the
// entered values on screen; they are excluded from validation while disabled
// and discarded on save (see `commitToggledOffFields`). This honours FR2.6's
// data contract — a saved record carries no sell fields when I Sell = No —
// without wiping three filled fields on a stray click, which NFR3 ("no silent
// gaps") argues against.
function setSold(p: CutoverProduct, on: boolean) { p.isSold = on }
function setBought(p: CutoverProduct, on: boolean) { p.isBought = on }

/** Apply FR2.6's clearing rule at save time rather than at toggle time. */
function commitToggledOffFields() {
  for (const p of cutoverProducts) {
    if (!p.isSold) {
      p.sellPrice = null
      p.revenueAccount = ''
      p.sellTax = ''
    }
    if (!p.isBought) {
      p.buyPrice = null
      p.cogsAccount = ''
      p.buyTax = ''
    }
  }
}

// ── Validation — fired from Continue, never from a disabled button ──────────
const showErrors = ref(false)
const formError = ref('')

function hasError(p: CutoverProduct, field: string): boolean {
  return showErrors.value && missingCutoverFields(p).includes(field)
}

function goBack() {
  router.push('/data-migration')
}

function submit() {
  if (isAllSetUp.value) {
    showErrors.value = false
    formError.value = ''
    commitToggledOffFields()
    router.push('/data-migration/wms-cutover/opening-balance')
    return
  }

  showErrors.value = true
  const incompleteRows = cutoverProducts.filter((p) => !isCutoverProductComplete(p)).length
  formError.value = incompleteRows > 0
    ? `${t('Set up all products before continuing')} (${setUpCount.value}/${CUTOVER_TOTAL_PRODUCTS} ${t('set up')})`
    : `${t('Import the remaining products before continuing')} (${remaining.value} ${t('left')})`

  // Bring the first unfinished row into view rather than leaving the user to hunt.
  const first = cutoverProducts.find((p) => !isCutoverProductComplete(p))
  if (first) {
    statusFilter.value = ''
    search.value = ''
    requestAnimationFrame(() => {
      document.getElementById(`cutover-row-${first.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }
}

// ── Import modal ────────────────────────────────────────────────────────────
type ImportPhase = 'idle' | 'importing' | 'done'
const isImportOpen = ref(false)
const importPhase = ref<ImportPhase>('idle')
const importFile = ref<{ name: string; size: number } | null>(null)
const importError = ref<'' | 'no-file' | 'format' | 'size'>('')
const importedNow = ref(0)
const skippedNow = ref(0)

const MAX_IMPORT_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = ['csv', 'xls', 'xlsx']

function openImport() {
  isImportOpen.value = true
  importPhase.value = 'idle'
  importFile.value = null
  importError.value = ''
}

function onFileChosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.includes(ext)) {
    importError.value = 'format'
    importFile.value = null
    return
  }
  if (file.size > MAX_IMPORT_BYTES) {
    importError.value = 'size'
    importFile.value = null
    return
  }
  importError.value = ''
  importFile.value = { name: file.name, size: file.size }
}

function removeImportFile() {
  importFile.value = null
  importError.value = ''
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

let importTimer: ReturnType<typeof setTimeout> | undefined
function runImport() {
  if (!importFile.value) {
    importError.value = 'no-file'
    return
  }
  importPhase.value = 'importing'
  importTimer = setTimeout(() => {
    // The rows already listed in the table are the ones the import can't resolve.
    skippedNow.value = cutoverProducts.length
    importedNow.value = CUTOVER_TOTAL_PRODUCTS - skippedNow.value
    cutoverState.importedCount = importedNow.value
    importPhase.value = 'done'
  }, 1200)
}

function closeImport() {
  isImportOpen.value = false
}

// Confirm the import once, however the modal was dismissed (footer button,
// close icon, or overlay) — MpModal owns the open state via v-model.
watch(isImportOpen, (open, wasOpen) => {
  if (wasOpen && !open && importPhase.value === 'done') {
    toast.notify({
      variant: 'success',
      title: `${importedNow.value} ${t('products imported')}`,
      maxWidth: 'max-content',
    })
  }
})

onUnmounted(() => clearTimeout(importTimer))
onMounted(() => { showErrors.value = false })
</script>

<template>
  <div class="cut-page">

    <!-- ── Title bar — 72px, neutral-subtle, breadcrumb above H1 ── -->
    <div class="cut-titlebar">
      <div class="cut-titlebar-left">
        <button type="button" class="cut-breadcrumb" @click="goBack">{{ t('Data migration') }}</button>
        <h1 class="cut-title">{{ t('Set up WMS products') }}</h1>
      </div>
    </div>

    <!-- ── Stage — this page owns its 24px padding ── -->
    <div class="cut-stage">
      <div class="cut-wrapper">

        <!-- Intro, chunked instead of one long paragraph -->
        <div class="cut-intro">
          <p class="cut-intro-lead">
            {{ t('Every WMS product needs a chart-of-accounts route before its inventory can post to the ledger.') }}
          </p>
          <ul class="cut-intro-list">
            <li>{{ t('Import the bulk of your products with the provided template.') }}</li>
            <li>{{ t('Set up the products the import could not resolve in the table below.') }}</li>
            <li>{{ t('Inventory value is entered here because WMS tracks quantity on hand, not monetary value.') }}</li>
          </ul>
        </div>

        <!-- Progress + import -->
        <section class="cut-progress-card">
          <div class="cut-progress-main">
            <!-- Coverage indicator string is specified verbatim in Story 1 AC -->
            <div class="cut-progress-row">
              <span class="cut-progress-text">
                {{ setUpCount }} {{ t('of') }} {{ CUTOVER_TOTAL_PRODUCTS }} {{ t('products set up') }} ({{ percent }}%)
              </span>
            </div>
            <MpProgress :value="String(percent)" size="sm" :color="isAllSetUp ? 'positive' : 'information'" />
            <p class="cut-progress-hint">
              {{ isAllSetUp ? t('All products set up.') : `${remaining} ${t('products remaining')}` }}
            </p>
          </div>
          <div class="cut-progress-action">
            <button
              type="button"
              class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
              @click="openImport"
            >
              <MpIcon name="upload" size="sm" />
              {{ t('Import') }}
            </button>
          </div>
        </section>

        <!-- Filters -->
        <div class="cut-filters">
          <div class="cut-search">
            <MpIcon name="search" size="sm" color="icon.subtle" />
            <input
              v-model="search"
              class="cut-search-input"
              type="text"
              :placeholder="t('Search product or SKU')"
              :aria-label="t('Search product or SKU')"
            >
          </div>

          <MpPopover id="cut-status-filter" is-close-on-select>
            <MpPopoverTrigger>
              <button type="button" class="cut-filter-trigger" :class="{ 'cut-filter-trigger--set': !!statusFilter }">
                <span class="cut-filter-label">{{ statusFilter ? statusLabel : t('Status') }}</span>
                <MpIcon name="chevrons-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem
                  v-for="opt in statusOptions"
                  :key="opt.value"
                  :is-active="opt.value === statusFilter"
                  @click="statusFilter = opt.value"
                >
                  {{ opt.label }}
                </MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>

          <button
            v-if="statusFilter || search"
            type="button"
            class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm"
            @click="statusFilter = ''; search = ''"
          >
            {{ t('Reset filter') }}
          </button>
        </div>

        <!-- Bulk action bar -->
        <div v-if="selectedIds.length" class="cut-bulkbar">
          <span class="cut-bulk-count">{{ selectedIds.length }} {{ t('selected') }}</span>

          <MpPopover id="cut-bulk-account" is-close-on-select>
            <MpPopoverTrigger>
              <button type="button" class="cut-filter-trigger cut-filter-trigger--wide" :class="{ 'cut-filter-trigger--set': !!bulkAccount }">
                <span class="cut-filter-label">
                  {{ bulkAccount ? labelFor(inventoryAccounts, bulkAccount) : t('Select inventory account') }}
                </span>
                <MpIcon name="chevrons-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content', maxWidth: '360px' })">
              <MpPopoverList>
                <MpPopoverListItem
                  v-for="a in inventoryAccounts"
                  :key="a.code"
                  :is-active="a.code === bulkAccount"
                  @click="bulkAccount = a.code; bulkError = ''"
                >
                  {{ accountLabel(a) }}
                </MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>

          <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="applyBulkAccount">
            {{ t('Apply') }}
          </button>
          <button type="button" class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm" @click="selectedIds = []; bulkError = ''">
            {{ t('Clear') }}
          </button>
          <span v-if="bulkError" class="cut-bulk-error">{{ bulkError }}</span>
        </div>

        <!-- Aggregate form error -->
        <p v-if="showErrors && formError" class="cut-form-error">{{ formError }}</p>

        <!-- ── Form table ── -->
        <div class="cut-table-scroll">
          <table class="cut-table">
            <colgroup>
              <col style="width: 264px">
              <col style="width: 230px">
              <col style="width: 140px">
              <col style="width: 110px">
              <col style="width: 130px">
              <col style="width: 64px">
              <col style="width: 120px">
              <col style="width: 200px">
              <col style="width: 130px">
              <col style="width: 64px">
              <col style="width: 120px">
              <col style="width: 200px">
              <col style="width: 130px">
              <col style="width: 120px">
            </colgroup>
            <thead>
              <!-- Grouped header — a flat column run is more than a user can hold -->
              <tr>
                <th class="cut-th cut-th--group" />
                <th class="cut-th cut-th--group" colspan="4">{{ t('Inventory') }}</th>
                <th class="cut-th cut-th--group" colspan="4">{{ t('Sales') }}</th>
                <th class="cut-th cut-th--group" colspan="4">{{ t('Purchase') }}</th>
                <th class="cut-th cut-th--group" />
              </tr>
              <tr>
                <!-- Selection merges into the first data column — no standalone
                     checkbox column (mekari-taste → index-view.md). -->
                <th class="cut-th">
                  <span class="cut-th-select">
                    <MpCheckbox
                      id="cut-select-all"
                      :is-checked="allVisibleSelected"
                      :is-indeterminate="someVisibleSelected"
                      :aria-label="t('Select all products')"
                      @change="toggleSelectAll"
                    />
                    {{ t('Product') }}
                  </span>
                </th>
                <th class="cut-th">{{ t('Inventory account') }} <span class="cut-req">*</span></th>
                <th class="cut-th cut-th--num">{{ t('Inventory value') }} <span class="cut-req">*</span></th>
                <th class="cut-th cut-th--num">{{ t('On-hand qty') }}</th>
                <th class="cut-th cut-th--num">{{ t('Unit cost') }}</th>
                <th class="cut-th cut-th--center">{{ t('Sell') }}</th>
                <th class="cut-th cut-th--num">{{ t('Sell price') }}</th>
                <th class="cut-th">{{ t('Revenue account') }}</th>
                <th class="cut-th">{{ t('Sell tax') }}</th>
                <th class="cut-th cut-th--center">{{ t('Buy') }}</th>
                <th class="cut-th cut-th--num">{{ t('Buy price') }}</th>
                <th class="cut-th">{{ t('COGS account') }}</th>
                <th class="cut-th">{{ t('Buy tax') }}</th>
                <th class="cut-th">{{ t('Status') }}</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="p in visibleProducts" :id="`cutover-row-${p.id}`" :key="p.id">
                <!-- Product — selection lives here, plus why it needs attention -->
                <td class="cut-td cut-td--text">
                  <div class="cut-product-row">
                    <MpCheckbox
                      :id="`cut-check-${p.id}`"
                      :is-checked="selectedIds.includes(p.id)"
                      :aria-label="`${t('Select')} ${p.name}`"
                      @change="(checked: boolean) => toggleRow(p.id, checked)"
                    />
                    <div class="cut-product">
                      <span class="cut-product-name">{{ p.name }}</span>
                      <span class="cut-product-sku">{{ p.sku }}</span>
                      <span v-if="!isCutoverProductComplete(p)" class="cut-product-reason">{{ t(p.reason) }}</span>
                    </div>
                  </div>
                </td>

                <!-- Inventory account (stays editable — never locked) -->
                <td class="cut-td cut-td--select" :class="{ 'cut-td--error': hasError(p, 'inventoryAccount') }">
                  <MpPopover :id="`inv-acct-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <button type="button" class="cut-cell-trigger">
                        <span :class="p.inventoryAccount ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.inventoryAccount ? labelFor(inventoryAccounts, p.inventoryAccount) : t('Select account') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ width: '320px', maxHeight: '260px', overflowY: 'auto', padding: '0' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="a in inventoryAccounts"
                          :key="a.code"
                          :is-active="a.code === p.inventoryAccount"
                          @click="p.inventoryAccount = a.code"
                        >
                          {{ accountLabel(a) }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>

                <!-- Inventory value -->
                <td class="cut-td cut-td--input" :class="{ 'cut-td--error': hasError(p, 'inventoryValue') }">
                  <input
                    :value="fmtAmount(p.inventoryValue)"
                    class="cut-cell-input cut-cell-input--num"
                    type="text"
                    inputmode="numeric"
                    :aria-label="`${t('Inventory value')} — ${p.name}`"
                    @input="p.inventoryValue = parseAmount(($event.target as HTMLInputElement).value)"
                  >
                </td>

                <!-- On-hand qty comes from WMS; unit cost is derived from it.
                     Both read-only — this is the cost basis the cutover seeds
                     into the product's averageCost (OQ10 resolution). -->
                <td class="cut-td cut-td--num cut-td--readonly">{{ groupFmt.format(p.onHandQty) }}</td>
                <td class="cut-td cut-td--num cut-td--readonly">
                  <span v-if="costBasisFor(p) !== null">{{ fmtUnitCost(costBasisFor(p)!) }}</span>
                  <span v-else class="cut-cell-placeholder">—</span>
                </td>

                <!-- Sell group -->
                <td class="cut-td cut-td--center">
                  <MpCheckbox
                    :id="`cut-sell-${p.id}`"
                    :is-checked="p.isSold"
                    :aria-label="`${t('Sell')} — ${p.name}`"
                    @change="(checked: boolean) => setSold(p, checked)"
                  />
                </td>
                <td
                  class="cut-td cut-td--input"
                  :class="{ 'cut-td--error': hasError(p, 'sellPrice'), 'cut-td--off': !p.isSold }"
                >
                  <input
                    :value="fmtAmount(p.sellPrice)"
                    class="cut-cell-input cut-cell-input--num"
                    type="text"
                    inputmode="numeric"
                    :disabled="!p.isSold"
                    :aria-label="`${t('Sell price')} — ${p.name}`"
                    @input="p.sellPrice = parseAmount(($event.target as HTMLInputElement).value)"
                  >
                </td>
                <td
                  class="cut-td cut-td--select"
                  :class="{ 'cut-td--error': hasError(p, 'revenueAccount'), 'cut-td--off': !p.isSold }"
                >
                  <MpPopover :id="`rev-acct-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <button type="button" class="cut-cell-trigger" :disabled="!p.isSold">
                        <span :class="p.revenueAccount ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.revenueAccount ? labelFor(revenueAccounts, p.revenueAccount) : t('Select account') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ width: '300px', padding: '0' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="a in revenueAccounts"
                          :key="a.code"
                          :is-active="a.code === p.revenueAccount"
                          @click="p.revenueAccount = a.code"
                        >
                          {{ accountLabel(a) }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td
                  class="cut-td cut-td--select"
                  :class="{ 'cut-td--error': hasError(p, 'sellTax'), 'cut-td--off': !p.isSold }"
                >
                  <MpPopover :id="`sell-tax-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <button type="button" class="cut-cell-trigger" :disabled="!p.isSold">
                        <span :class="p.sellTax ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.sellTax || t('Select tax') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ width: '220px', padding: '0' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="tax in taxOptions"
                          :key="tax"
                          :is-active="tax === p.sellTax"
                          @click="p.sellTax = tax"
                        >
                          {{ tax }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>

                <!-- Buy group -->
                <td class="cut-td cut-td--center">
                  <MpCheckbox
                    :id="`cut-buy-${p.id}`"
                    :is-checked="p.isBought"
                    :aria-label="`${t('Buy')} — ${p.name}`"
                    @change="(checked: boolean) => setBought(p, checked)"
                  />
                </td>
                <td
                  class="cut-td cut-td--input"
                  :class="{ 'cut-td--error': hasError(p, 'buyPrice'), 'cut-td--off': !p.isBought }"
                >
                  <input
                    :value="fmtAmount(p.buyPrice)"
                    class="cut-cell-input cut-cell-input--num"
                    type="text"
                    inputmode="numeric"
                    :disabled="!p.isBought"
                    :aria-label="`${t('Buy price')} — ${p.name}`"
                    @input="p.buyPrice = parseAmount(($event.target as HTMLInputElement).value)"
                  >
                </td>
                <td
                  class="cut-td cut-td--select"
                  :class="{ 'cut-td--error': hasError(p, 'cogsAccount'), 'cut-td--off': !p.isBought }"
                >
                  <MpPopover :id="`cogs-acct-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <button type="button" class="cut-cell-trigger" :disabled="!p.isBought">
                        <span :class="p.cogsAccount ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.cogsAccount ? labelFor(cogsAccounts, p.cogsAccount) : t('Select account') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ width: '320px', padding: '0' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="a in cogsAccounts"
                          :key="a.code"
                          :is-active="a.code === p.cogsAccount"
                          @click="p.cogsAccount = a.code"
                        >
                          {{ accountLabel(a) }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td
                  class="cut-td cut-td--select"
                  :class="{ 'cut-td--error': hasError(p, 'buyTax'), 'cut-td--off': !p.isBought }"
                >
                  <MpPopover :id="`buy-tax-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <button type="button" class="cut-cell-trigger" :disabled="!p.isBought">
                        <span :class="p.buyTax ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.buyTax || t('Select tax') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ width: '220px', padding: '0' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="tax in taxOptions"
                          :key="tax"
                          :is-active="tax === p.buyTax"
                          @click="p.buyTax = tax"
                        >
                          {{ tax }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>

                <!-- Status -->
                <td class="cut-td cut-td--status">
                  <ErpStatusBadge
                    :status="isCutoverProductComplete(p) ? 'completed' : 'not started'"
                    :label="isCutoverProductComplete(p) ? t('Set up') : t('Incomplete')"
                  />
                </td>
              </tr>

              <!-- Empty state (filter/search returned nothing) -->
              <tr v-if="!visibleProducts.length">
                <td class="cut-td cut-td--empty" colspan="14">
                  <p class="cut-empty-title">{{ t('Product not found') }}</p>
                  <p class="cut-empty-desc">
                    {{ t('Your filter criteria didn’t match any available product. Try adjusting your filter.') }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <MpBanner id="cut-rule-banner" variant="info" is-inline>
          <MpBannerIcon id="cut-rule-banner-icon" />
          <MpBannerDescription id="cut-rule-banner-desc">
            {{ t('Every product must be set up — here or through an import — before the opening balance can be published. There is no default account and no partial publish.') }}
          </MpBannerDescription>
        </MpBanner>

        <p class="cut-help">
          {{ t('Not sure how a product should be routed?') }}
          <a class="cut-help-link" href="#" @click.prevent>{{ t('Contact your activation specialist') }}</a>
        </p>

        <!-- Action group — Continue is never disabled -->
        <div class="cut-actions">
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="goBack">
            {{ t('Cancel') }}
          </button>
          <button type="button" class="btn-enterprise btn-enterprise--primary" @click="submit">
            {{ t('Continue') }}
          </button>
        </div>

      </div>
    </div>

    <!-- ── Import modal ── -->
    <MpModal v-model="isImportOpen">
      <MpModalHeader>
        {{ t('Import WMS products') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalContent>
        <MpModalBody>
          <div class="cut-import">
            <ol class="cut-import-steps">
              <li>{{ t('Download the template — it is pre-filled with all your WMS products.') }}</li>
              <li>{{ t('Fill in the inventory account, inventory value, and sell/buy setup per product.') }}</li>
              <li>{{ t('Upload the completed file below.') }}</li>
            </ol>

            <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before">
              <MpIcon name="download" size="sm" />
              {{ t('Download template file') }}
            </button>

            <!-- Idle / choosing a file -->
            <template v-if="importPhase === 'idle'">
              <div v-if="!importFile" class="cut-dropzone" :class="{ 'cut-dropzone--error': !!importError }">
                <MpIcon name="upload" size="lg" color="icon.subtle" />
                <p class="cut-dropzone-cta">
                  {{ t('Drag a file here, or') }}
                  <label class="cut-dropzone-link">
                    {{ t('choose file') }}
                    <input type="file" accept=".csv,.xls,.xlsx" class="cut-dropzone-input" @change="onFileChosen">
                  </label>
                </p>
                <p class="cut-dropzone-hint">{{ t('File must be in CSV, XLS, or XLSX with a maximum of 10 MB') }}</p>
              </div>

              <div v-else class="cut-file-card">
                <MpIcon name="excel-document" size="md" color="icon.default" />
                <div class="cut-file-info">
                  <span class="cut-file-name">{{ importFile.name }}</span>
                  <span class="cut-file-size">{{ fmtBytes(importFile.size) }}</span>
                </div>
                <button type="button" class="cut-file-remove" :aria-label="t('Remove file')" @click="removeImportFile">
                  <MpIcon name="close" size="sm" />
                </button>
              </div>

              <p v-if="importError === 'no-file'" class="cut-dropzone-error">
                {{ t('You must upload the completed template file') }}
              </p>
              <p v-if="importError === 'format'" class="cut-dropzone-error">
                {{ t('File format not supported. Upload a CSV, XLS, or XLSX file') }}
              </p>
              <p v-if="importError === 'size'" class="cut-dropzone-error">
                {{ t('File size exceeds the 10 MB limit') }}
              </p>
            </template>

            <!-- Processing -->
            <div v-else-if="importPhase === 'importing'" class="cut-import-busy">
              <MpSpinner size="md" />
              <p class="cut-import-busy-text">{{ t('Importing products…') }}</p>
            </div>

            <!-- Outcome — partial by design: some rows always need a human -->
            <MpBanner v-else id="cut-import-result" variant="warning">
              <MpBannerIcon id="cut-import-result-icon" />
              <MpBannerDescription id="cut-import-result-desc">
                {{ importedNow }} {{ t('of') }} {{ CUTOVER_TOTAL_PRODUCTS }} {{ t('products imported') }}.
                {{ skippedNow }} {{ t('products could not be resolved and are listed in the table, with the reason for each.') }}
              </MpBannerDescription>
            </MpBanner>
          </div>
        </MpModalBody>

        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" @click="closeImport">
              {{ importPhase === 'done' ? t('Close') : t('Cancel') }}
            </MpButton>
            <MpButton
              v-if="importPhase !== 'done'"
              variant="primary"
              :is-loading="importPhase === 'importing'"
              @click="runImport"
            >
              {{ t('Import') }}
            </MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
    </MpModal>

  </div>
</template>

<style scoped>
/* ── Page shell ── */
.cut-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Title bar (page-title-bar.md variant C) ── */
.cut-titlebar {
  flex-shrink: 0;
  height: 72px;
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}

.cut-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}

.cut-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  white-space: nowrap;
}
.cut-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }

.cut-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage — detail/form pages supply their own 24px ── */
.cut-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

.cut-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}

/* ── Intro ── */
.cut-intro {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  max-width: 760px;
}

.cut-intro-lead {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.cut-intro-list {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* ── Summary strip — aggregate context above a table, which is the one
   card-like element mekari-taste principle 4 allows. Rendered as a strip with
   1px cell dividers, not a floating card. ── */
.cut-progress-card {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.cut-progress-main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--mp-spacing-2);
  min-width: 280px;
  flex: 1;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
}

.cut-progress-action {
  display: flex;
  align-items: center;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-left: 1px solid var(--mp-border-default);
}

.cut-progress-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
}

.cut-progress-text {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  font-variant-numeric: tabular-nums;
}

.cut-progress-pct,
.cut-progress-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Filters ── */
.cut-filters {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  flex-wrap: wrap;
}

.cut-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 280px;
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.cut-search:focus-within { border-color: var(--mp-border-bold); }

.cut-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.cut-filter-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: 180px;
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
}
.cut-filter-trigger--wide { width: 280px; }
.cut-filter-trigger--set { color: var(--mp-text-default); border-color: var(--mp-border-bold); }

.cut-filter-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Bulk bar ── */
.cut-bulkbar {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  flex-wrap: wrap;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.cut-bulk-count {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.cut-bulk-error,
.cut-form-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-danger);
}

/* ── Form table (FormTable.md) ── */
/* Table sits directly on the stage → border.default 1px + radii-md
   (mekari-taste → index-view.md). border.bold reads as a heavy frame. */
.cut-table-scroll {
  overflow-x: auto;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.cut-table {
  width: 100%;
  min-width: 1900px;
  border-collapse: collapse;
  table-layout: fixed;
}

.cut-th {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  text-align: left;
  vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.cut-th:last-child { border-right: none; }
.cut-th--group {
  height: 32px;
  color: var(--mp-text-default);
  text-transform: none;
}
.cut-th--num { text-align: right; }
.cut-th--center { text-align: center; }
.cut-th--check { padding-left: var(--mp-spacing-3); }

.cut-req { color: var(--mp-text-danger); }

.cut-td {
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral);
  vertical-align: top;
}
.cut-td:last-child { border-right: none; }
.cut-table tbody tr:last-child .cut-td { border-bottom: none; }

.cut-td--center {
  padding: var(--mp-spacing-3);
  text-align: center;
  vertical-align: middle;
}

.cut-td--text { padding: 10px var(--mp-spacing-3); }

/* Selection merged into the first column (mekari-taste → index-view.md) */
.cut-th-select,
.cut-product-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  min-width: 0;
}
.cut-product-row { align-items: flex-start; }
.cut-product-row :deep(label) { margin-top: 2px; }

.cut-product {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cut-product-name {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.cut-product-sku,
.cut-product-reason {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}
.cut-product-reason { color: var(--mp-text-warning, var(--mp-text-secondary)); }

.cut-td--status {
  padding: 10px var(--mp-spacing-2);
  vertical-align: middle;
}

/* Editable cells own the focus ring; the control inside is borderless */
.cut-td--input,
.cut-td--select {
  padding: 0;
  position: relative;
}
.cut-td--input:focus-within::after,
.cut-td--select:focus-within::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2;
  pointer-events: none;
}

.cut-cell-input {
  width: 100%;
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  outline: none;
}
.cut-cell-input--num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cut-cell-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; }

.cut-cell-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: 100%;
  min-height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
  text-align: left;
}
.cut-cell-trigger:disabled { cursor: not-allowed; color: var(--mp-text-disabled); }

.cut-cell-value,
.cut-cell-placeholder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cut-cell-placeholder { color: var(--mp-text-placeholder, var(--mp-text-secondary)); }

/* Not applicable — the group switch is off. Values are preserved, not wiped. */
.cut-td--off { background: var(--mp-background-neutral-subtle); }

/* Read-only / derived cells read as calculated, per FormTable.md → Cell Types */
.cut-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.cut-td--readonly {
  padding: 10px var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  vertical-align: middle;
}

/* Cell-level error (FormTable.md → Error state) */
.cut-td--error {
  background: var(--mp-background-danger-subtle, #FCEEED);
  border-bottom-color: var(--mp-border-danger, #E2483D);
}
.cut-td--error:focus-within {
  box-shadow: inset 0 0 0 1px var(--mp-border-danger, #E2483D);
}

.cut-td--empty {
  padding: var(--mp-spacing-8) var(--mp-spacing-4);
  text-align: center;
}
.cut-empty-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cut-empty-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* ── Help + actions ── */
.cut-help {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}
.cut-help-link {
  color: var(--mp-text-link);
  text-decoration: none;
}
.cut-help-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cut-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-2);
}

/* ── Import modal ── */
.cut-import {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  align-items: flex-start;
}

.cut-import-steps {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

.cut-dropzone {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-6);
  border: 1px dashed var(--mp-border-bold);
  border-radius: var(--mp-radii-lg);
  background: var(--mp-background-neutral-subtle);
  text-align: center;
}
.cut-dropzone--error { border-color: var(--mp-border-danger, #E2483D); }

.cut-dropzone-cta {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.cut-dropzone-link {
  color: var(--mp-text-link);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cut-dropzone-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.cut-dropzone-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.cut-dropzone-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-danger);
}

.cut-file-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}

.cut-file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.cut-file-name {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cut-file-size {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.cut-file-remove {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--mp-spacing-1);
  color: var(--mp-text-secondary);
  display: flex;
}

.cut-import-busy {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-6);
  justify-content: center;
}
.cut-import-busy-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
