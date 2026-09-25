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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpIcon, MpProgress, MpCheckbox, MpBanner, MpBannerIcon, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpButton, MpText, MpUpload, MpTextlink, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import FormatRequirementsAccordion from '~/components/patterns/FormatRequirementsAccordion.vue'
import {
  CUTOVER_TOTAL_PRODUCTS, cutoverProducts, cutoverState,
  inventoryAccounts, revenueAccounts, cogsAccounts, taxOptions,
  accountLabel, isCutoverProductComplete, missingCutoverFields,
  CUTOVER_STEPS, isCutoverStepComplete, coaSourceState, cutoverSetUpCount, applyBulkImport,
  type CutoverProduct, type CoaAccount, type CutoverStep,
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
function labelFor(list: CoaAccount[], code: string): string {
  const found = list.find((a) => a.code === code)
  return found ? accountLabel(found) : ''
}

// ── Progress ────────────────────────────────────────────────────────────────
const setUpCount = computed(() => cutoverSetUpCount())
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

// ── Progressive paging — the catalogue can run to thousands of rows, so render
// in chunks and grow as a sentinel row scrolls into view (mirrors the serial
// drawers' infinite scroll). Reset whenever the filter/search set changes.
const PAGE = 40
const shown = ref(PAGE)
const pagedProducts = computed(() => visibleProducts.value.slice(0, shown.value))
const hasMore = computed(() => shown.value < visibleProducts.value.length)
function loadMore() {
  if (hasMore.value) shown.value = Math.min(shown.value + PAGE, visibleProducts.value.length)
}
watch([search, statusFilter], () => { shown.value = PAGE })

const sentinelEl = ref<HTMLElement | null>(null)
let scrollObserver: IntersectionObserver | null = null
function setupObserver() {
  scrollObserver?.disconnect()
  if (!sentinelEl.value) return
  scrollObserver = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMore() },
    { rootMargin: '0px 0px 240px 0px' },
  )
  scrollObserver.observe(sentinelEl.value)
}

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

// ── Stepper ─────────────────────────────────────────────────────────────────
const doneSteps = computed(() => CUTOVER_STEPS.filter((s) => isCutoverStepComplete(s.key)).map((s) => s.key))
function goStep(step: CutoverStep) {
  router.push(`/data-migration/wms-cutover/${step}`)
}

// Step 2 needs a chart of accounts in place — bounce back to Step 1 if skipped.
onMounted(() => {
  if (!coaSourceState.source) {
    router.replace('/data-migration/wms-cutover/chart-of-accounts')
    return
  }
  nextTick(setupObserver)
})

function cancel() {
  router.push('/data-migration')
}
function goBackStep() {
  router.push('/data-migration/wms-cutover/chart-of-accounts')
}
function saveDraft() {
  toast.notify({ variant: 'success', title: t('Saved as draft'), maxWidth: 'max-content' })
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

// ── Import product mapping (drawer) ──────────────────────────────────────────
type ImportPhase = 'idle' | 'importing'
const isImportOpen = ref(false)
const importPhase = ref<ImportPhase>('idle')
const importFile = ref<{ name: string; size: number } | null>(null)
const importError = ref<'' | 'no-file' | 'format' | 'size'>('')

const MAX_IMPORT_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = ['csv', 'xls', 'xlsx']

// Formatting rules for the product-mapping template (Format requirements accordion).
const formatRequirements = computed(() => [
  t('Maximum 1.000 rows per file.'),
  t('Keep the Product and SKU columns exactly as pre-filled — do not edit them.'),
  t('Enter account codes exactly as in your chart of accounts (e.g. 1-10200).'),
  t('Do not use thousand separators (e.g. 1000, not 1.000).'),
  t('Do not include currency symbols (Rp, $, etc.) in value or price columns.'),
  t('Tip: add a backtick (`) before a code to prevent auto-formatting. Example: `1-10200'),
])

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

let importTimer: ReturnType<typeof setTimeout> | undefined
function runImport() {
  if (!importFile.value) {
    importError.value = 'no-file'
    return
  }
  importPhase.value = 'importing'
  importTimer = setTimeout(() => {
    // Fills the resolvable bulk; the flagged rows stay in the table to fix.
    const { imported, skipped } = applyBulkImport()
    importPhase.value = 'idle'
    isImportOpen.value = false
    const title = skipped > 0
      ? `${imported} ${t('products imported')}, ${skipped} ${t('need attention')}`
      : `${imported} ${t('products imported')}`
    toast.notify({ variant: 'success', title, maxWidth: 'max-content' })
  }, 900)
}

function closeImport() {
  isImportOpen.value = false
}

// Esc closes the import drawer, else clears the selection.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (isImportOpen.value) { isImportOpen.value = false; return }
  if (selectedIds.value.length) selectedIds.value = []
}
onMounted(() => { showErrors.value = false; window.addEventListener('keydown', onKeydown) })
onUnmounted(() => {
  clearTimeout(importTimer)
  scrollObserver?.disconnect()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="cut-page">

    <!-- ── Title bar — 72px, neutral-subtle, breadcrumb above H1 ── -->
    <div class="cut-titlebar">
      <div class="cut-titlebar-left">
        <MpTextlink id="cut-breadcrumb" as="a" class="cut-breadcrumb" @click.prevent="cancel">{{ t('Data migration') }}</MpTextlink>
        <h1 class="cut-title">{{ t('Set up opening balance') }}</h1>
      </div>
    </div>

    <!-- ── Stage — this page owns its 24px padding ── -->
    <div class="cut-stage">
      <div class="cut-wrapper">

        <ErpStepper :steps="CUTOVER_STEPS" current="products" :done="doneSteps" @select="goStep" />

        <!-- Intro, chunked instead of one long paragraph -->
        <div class="cut-intro">
          <p class="cut-intro-lead">
            {{ t('Every WMS product needs a chart-of-accounts route before its inventory can post to the ledger.') }}
          </p>
          <ul class="cut-intro-list">
            <li>{{ t('Download the products CSV — it lists every WMS SKU, ready to map.') }}</li>
            <li>{{ t('Map each SKU to its accounts in a spreadsheet, then upload the file back.') }}</li>
            <li>{{ t('Fix anything the upload could not resolve in the table below.') }}</li>
          </ul>
        </div>

        <!-- Progress -->
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
        </section>

        <MpBanner id="cut-rule-banner" variant="info" is-inline>
          <MpBannerIcon id="cut-rule-banner-icon" />
          <MpBannerDescription id="cut-rule-banner-desc">
            {{ t('Every product must be set up — here or through an import — before the opening balance can be published. There is no default account and no partial publish.') }}
          </MpBannerDescription>
        </MpBanner>

        <!-- Filters — status on the left, search pill on the right (index-page layout) -->
        <div class="cut-filters">
          <div class="cut-filter-left">
            <MpPopover id="cut-status-filter" is-close-on-select>
              <MpPopoverTrigger>
                <MpButton type="button" class="cut-filter-trigger" variant="ghost" :class="{ 'cut-filter-trigger--set': !!statusFilter }">
                  <span class="cut-filter-label">{{ statusFilter ? statusLabel : t('Status') }}</span>
                  <MpIcon name="chevrons-down" size="sm" />
                </MpButton>
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

            <MpButton
              v-if="statusFilter || search"
              type="button"
              class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm"
              variant="ghost"
              @click="statusFilter = ''; search = ''"
            >
              {{ t('Reset filter') }}
            </MpButton>
          </div>

          <div class="cut-filter-right">
            <div class="cut-filter-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input
                v-model="search"
                class="cut-filter-search-input"
                type="text"
                :placeholder="`${t('Search')}...`"
                :aria-label="t('Search product or SKU')"
              >
              <MpButton v-if="search" class="cut-search-clear" type="button" variant="ghost" :aria-label="t('Clear search')" @click="search = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </MpButton>
            </div>

            <MpButton variant="tertiary" is-rounded @click="openImport">{{ t('Import') }}</MpButton>
          </div>
        </div>

        <!-- Bulk action bar -->
        <!-- Aggregate form error -->
        <p v-if="showErrors && formError" class="cut-form-error">{{ formError }}</p>

        <!-- ── Form table ── -->
        <div class="cut-table-scroll">
          <table class="cut-table">
            <colgroup>
              <col class="cut-col--product">
              <col class="cut-col--account">
              <col class="cut-col--value">
              <col class="cut-col--flag">
              <col class="cut-col--price">
              <col class="cut-col--account-wide">
              <col class="cut-col--tax">
              <col class="cut-col--flag">
              <col class="cut-col--price">
              <col class="cut-col--account-wide">
              <col class="cut-col--tax">
              <col class="cut-col--status">
            </colgroup>
            <thead>
              <!-- Bulk-action bar — replaces the column headers while rows are
                   selected (mirrors ErpTablePage's in-header bulk bar). -->
              <tr v-if="selectedIds.length" class="cut-tr-bulk">
                <th :colspan="12" class="cut-th cut-th--bulk">
                  <div class="cut-bulk-bar">
                    <div class="cut-bulk-bar__left">
                      <MpCheckbox
                        id="cut-select-all"
                        :is-checked="allVisibleSelected"
                        :is-indeterminate="someVisibleSelected"
                        :aria-label="t('Select all products')"
                        @change="toggleSelectAll"
                        @click.stop
                      />
                      <span class="cut-bulk-count">{{ selectedIds.length }} {{ t('selected') }}</span>

                      <MpPopover id="cut-bulk-account" is-close-on-select>
                        <MpPopoverTrigger>
                          <MpButton type="button" class="cut-filter-trigger cut-filter-trigger--wide" variant="ghost" :class="{ 'cut-filter-trigger--set': !!bulkAccount }">
                            <span class="cut-filter-label">
                              {{ bulkAccount ? labelFor(inventoryAccounts, bulkAccount) : t('Select inventory account') }}
                            </span>
                            <MpIcon name="chevrons-down" size="sm" />
                          </MpButton>
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

                      <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="applyBulkAccount">
                        {{ t('Apply') }}
                      </MpButton>
                      <span v-if="bulkError" class="cut-bulk-error">{{ bulkError }}</span>
                    </div>
                    <div class="cut-bulk-bar__right">
                      <span>{{ t('Press') }}</span>
                      <kbd class="cut-bulk-kbd">Esc</kbd>
                      <span>{{ t('to deselect') }}</span>
                    </div>
                  </div>
                </th>
              </tr>

              <!-- Grouped header — a flat column run is more than a user can hold -->
              <template v-else>
                <tr>
                  <th class="cut-th cut-th--group" />
                  <th class="cut-th cut-th--group" colspan="2">{{ t('Inventory') }}</th>
                  <th class="cut-th cut-th--group" colspan="4">{{ t('Sales') }}</th>
                  <th class="cut-th cut-th--group" colspan="4">{{ t('Purchase') }}</th>
                  <th class="cut-th cut-th--group" />
                </tr>
                <tr>
                  <!-- Selection merges into the first data column — no standalone
                       checkbox column (mekari-taste → index-view.md). -->
                  <th class="cut-th cut-th--product">
                    <span class="cut-th-select">
                      <MpCheckbox
                        id="cut-select-all-cols"
                        :is-checked="allVisibleSelected"
                        :is-indeterminate="someVisibleSelected"
                        :aria-label="t('Select all products')"
                        @change="toggleSelectAll"
                      />
                      {{ t('Product') }}
                    </span>
                  </th>
                  <th class="cut-th">{{ t('Default inventory account') }} <span class="cut-req">*</span></th>
                  <th class="cut-th">{{ t('Inventory value') }} <span class="cut-req">*</span></th>
                  <th class="cut-th cut-th--center">{{ t('I sell this product') }}</th>
                  <th class="cut-th">{{ t('Default sales price') }}</th>
                  <th class="cut-th">{{ t('Default sales account') }} <span class="cut-req">*</span></th>
                  <th class="cut-th">{{ t('Default sales tax') }}</th>
                  <th class="cut-th cut-th--center">{{ t('I buy this product') }}</th>
                  <th class="cut-th">{{ t('Default purchase cost') }}</th>
                  <th class="cut-th">{{ t('Default purchase account') }} <span class="cut-req">*</span></th>
                  <th class="cut-th">{{ t('Default purchase tax') }}</th>
                  <th class="cut-th">{{ t('Status') }}</th>
                </tr>
              </template>
            </thead>

            <tbody>
              <tr v-for="p in pagedProducts" :id="`cutover-row-${p.id}`" :key="p.id">
                <!-- Product — selection lives here, plus why it needs attention -->
                <td class="cut-td cut-td--text">
                  <div class="cut-product-row">
                    <MpCheckbox
                      :id="`cut-check-${p.id}`"
                      :is-checked="selectedIds.includes(p.id)"
                      :aria-label="`${t('Select')} ${p.name}`"
                      @change="(checked: boolean) => toggleRow(p.id, checked)"
                    />
                    <img
                      v-if="p.img"
                      class="cut-product-thumb"
                      :src="p.img"
                      :alt="p.name"
                      loading="lazy"
                      width="40"
                      height="40"
                    >
                    <div class="cut-product">
                      <span class="cut-product-name">{{ p.name }}</span>
                      <span class="cut-product-sku">{{ p.sku }}</span>
                      <span v-if="!isCutoverProductComplete(p) && p.reason" class="cut-product-reason">{{ t(p.reason) }}</span>
                    </div>
                  </div>
                </td>

                <!-- Inventory account (stays editable — never locked) -->
                <td class="cut-td cut-td--select" :class="{ 'cut-td--error': hasError(p, 'inventoryAccount') }">
                  <MpPopover :id="`inv-acct-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <MpButton type="button" class="cut-cell-trigger" variant="ghost">
                        <span :class="p.inventoryAccount ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.inventoryAccount ? labelFor(inventoryAccounts, p.inventoryAccount) : t('Select account') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </MpButton>
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
                  <div class="cut-money">
                    <span class="cut-money-rp">Rp</span>
                    <input
                      :value="fmtAmount(p.inventoryValue)"
                      class="cut-cell-input cut-cell-input--num"
                      type="text"
                      inputmode="numeric"
                      :aria-label="`${t('Inventory value')} — ${p.name}`"
                      @input="p.inventoryValue = parseAmount(($event.target as HTMLInputElement).value)"
                    >
                  </div>
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
                  <div class="cut-money">
                    <span class="cut-money-rp">Rp</span>
                    <input
                      :value="fmtAmount(p.sellPrice)"
                      class="cut-cell-input cut-cell-input--num"
                      type="text"
                      inputmode="numeric"
                      :disabled="!p.isSold"
                      :aria-label="`${t('Sell price')} — ${p.name}`"
                      @input="p.sellPrice = parseAmount(($event.target as HTMLInputElement).value)"
                    >
                  </div>
                </td>
                <td
                  class="cut-td cut-td--select"
                  :class="{ 'cut-td--error': hasError(p, 'revenueAccount'), 'cut-td--off': !p.isSold }"
                >
                  <MpPopover :id="`rev-acct-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <MpButton type="button" class="cut-cell-trigger" variant="ghost" :is-disabled="!p.isSold">
                        <span :class="p.revenueAccount ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.revenueAccount ? labelFor(revenueAccounts, p.revenueAccount) : t('Select account') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </MpButton>
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
                      <MpButton type="button" class="cut-cell-trigger" variant="ghost" :is-disabled="!p.isSold">
                        <span :class="p.sellTax ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.sellTax || t('Select tax') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </MpButton>
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
                  <div class="cut-money">
                    <span class="cut-money-rp">Rp</span>
                    <input
                      :value="fmtAmount(p.buyPrice)"
                      class="cut-cell-input cut-cell-input--num"
                      type="text"
                      inputmode="numeric"
                      :disabled="!p.isBought"
                      :aria-label="`${t('Buy price')} — ${p.name}`"
                      @input="p.buyPrice = parseAmount(($event.target as HTMLInputElement).value)"
                    >
                  </div>
                </td>
                <td
                  class="cut-td cut-td--select"
                  :class="{ 'cut-td--error': hasError(p, 'cogsAccount'), 'cut-td--off': !p.isBought }"
                >
                  <MpPopover :id="`cogs-acct-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                    <MpPopoverTrigger>
                      <MpButton type="button" class="cut-cell-trigger" variant="ghost" :is-disabled="!p.isBought">
                        <span :class="p.cogsAccount ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.cogsAccount ? labelFor(cogsAccounts, p.cogsAccount) : t('Select account') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </MpButton>
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
                      <MpButton type="button" class="cut-cell-trigger" variant="ghost" :is-disabled="!p.isBought">
                        <span :class="p.buyTax ? 'cut-cell-value' : 'cut-cell-placeholder'">
                          {{ p.buyTax || t('Select tax') }}
                        </span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </MpButton>
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
                <td class="cut-td cut-td--empty" colspan="12">
                  <p class="cut-empty-title">{{ t('Product not found') }}</p>
                  <p class="cut-empty-desc">
                    {{ t('Your filter criteria didn’t match any available product. Try adjusting your filter.') }}
                  </p>
                </td>
              </tr>

              <!-- Sentinel — scrolling it into view loads the next chunk -->
              <tr v-if="hasMore" aria-hidden="true" class="cut-sentinel-row">
                <td colspan="12"><div ref="sentinelEl" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="cut-help">
          {{ t('Not sure how a product should be routed?') }}
          <a class="cut-help-link" href="#" @click.prevent>{{ t('Contact your activation specialist') }}</a>
        </p>

      </div>
    </div>

    <!-- ── Sticky footer — Continue is never disabled ── -->
    <footer class="cut-footer">
      <MpButton type="button" class="btn-enterprise btn-enterprise--ghost" variant="ghost" @click="goBackStep">
        {{ t('Back') }}
      </MpButton>
      <div class="cut-footer-actions">
        <MpButton type="button" class="btn-enterprise btn-enterprise--ghost" variant="ghost" @click="cancel">
          {{ t('Cancel') }}
        </MpButton>
        <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="saveDraft">
          {{ t('Save as draft') }}
        </MpButton>
        <MpButton type="button" class="btn-enterprise btn-enterprise--primary" variant="primary" @click="submit">
          {{ t('Continue') }}
        </MpButton>
      </div>
    </footer>

    <!-- ── Import product mapping drawer ── -->
    <Teleport to="body">
      <Transition name="imd">
        <div v-if="isImportOpen" class="imd-overlay">
          <aside class="imd-panel" role="dialog" :aria-label="t('Import product mapping')">
            <header class="imd-header">
              <MpText weight="semiBold">{{ t('Import product mapping') }}</MpText>
              <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="closeImport" />
            </header>

            <div class="imd-body">
              <p class="imd-intro">{{ t('Follow these steps to import your product mapping into Mekari ERP.') }}</p>

              <!-- Step 1 — Download the template -->
              <div class="imd-step">
                <span class="imd-step-badge">1</span>
                <div class="imd-step-body">
                  <p class="imd-step-title">{{ t('Download the template') }}</p>
                  <p class="imd-step-desc">{{ t('The template lists every WMS product, ready for you to map to accounts.') }}</p>
                  <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" variant="secondary">{{ t('Download template file') }}</MpButton>

                  <FormatRequirementsAccordion :requirements="formatRequirements" />
                </div>
              </div>

              <!-- Step 2 — Upload your file -->
              <div class="imd-step">
                <span class="imd-step-badge">2</span>
                <div class="imd-step-body">
                  <p class="imd-step-title">{{ t('Upload your file') }}</p>
                  <p class="imd-step-desc">{{ t('Upload the completed template to map your products.') }}</p>
                  <MpUpload
                    id="cut-import-upload"
                    accept=".csv,.xls,.xlsx"
                    is-full-width
                    :placeholder="importFile ? importFile.name : t('No file selected')"
                    :button-text="t('Browse file')"
                    @change="onFileChosen"
                  />
                  <p class="imd-upload-hint">{{ t('Supported formats: CSV, XLS, XLSX. Maximum file size 10 MB.') }}</p>
                  <p v-if="importError === 'no-file'" class="imd-error">{{ t('You must upload the completed template file') }}</p>
                  <p v-if="importError === 'format'" class="imd-error">{{ t('File format not supported. Upload a CSV, XLS, or XLSX file') }}</p>
                  <p v-if="importError === 'size'" class="imd-error">{{ t('File size exceeds the 10 MB limit') }}</p>
                </div>
              </div>
            </div>

            <footer class="imd-footer">
              <MpButton variant="ghost" is-rounded @click="closeImport">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded :is-loading="importPhase === 'importing'" @click="runImport">{{ t('Import') }}</MpButton>
            </footer>
          </aside>
        </div>
      </Transition>
    </Teleport>

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
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
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
  background: var(--mp-background-stage, #ffffff);
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
  list-style: disc;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.cut-intro-list li + li { margin-top: var(--mp-spacing-1); }

/* ── Summary strip — aggregate context above a table, which is the one
   card-like element mekari-taste principle 4 allows. Rendered as a strip with
   1px cell dividers, not a floating card. ── */
.cut-progress-card {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
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
  border-left: 1px solid var(--mp-border-default, #e3e7e9);
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
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  flex-wrap: wrap;
}
.cut-filter-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.cut-filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

/* Pill search — canonical index-page search box (ProductsPage .filter-search). */
.cut-filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.cut-filter-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.cut-filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.cut-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.cut-search-clear:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.cut-filter-trigger {
  /* Trigger widths sit between the size tokens (180/280px) — named here. */
  --cut-trigger-w: 180px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: var(--cut-trigger-w);
  height: var(--mp-sizes-9\.5, 38px);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-colors-background-neutral, #fff);
  border: 1px solid var(--mp-colors-border-form, #1d1f2429);
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
/* ── Bulk-action bar in the table header (mirrors ErpTablePage) ── */
.cut-tr-bulk .cut-th--bulk {
  padding: 0 var(--mp-spacing-3);
  height: var(--mp-sizes-12, 48px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  text-transform: none;
  letter-spacing: normal;
  font-weight: var(--mp-font-weights-regular);
}
.cut-bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
}
.cut-bulk-bar__left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  flex-wrap: wrap;
}
.cut-bulk-bar__right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.cut-bulk-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--mp-spacing-1);
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-sm, 4px);
  font-family: inherit;
  font-size: var(--mp-font-sizes-xs, 11px);
  color: var(--mp-text-secondary);
}

.cut-bulk-count {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  white-space: nowrap;
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
  border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-md);
}

/* Progressive-paging sentinel — zero-height, invisible trigger row. */
.cut-sentinel-row td {
  padding: 0;
  height: 0;
  border: none;
  background: transparent;
}
.cut-sentinel-row td > div { height: 1px; }

.cut-table {
  width: 100%;
  min-width: 1900px;
  border-collapse: collapse;
  table-layout: fixed;

  /* Column geometry. Table widths are off the 4px Pixel size scale (no
     --mp-sizes-* token covers 110px/130px/230px/264px), so they live here as
     named local constants rather than magic numbers in inline style attributes.
     The Sales and Purchase groups reuse the same widths by design. */
  --cut-col-product: 264px;
  --cut-col-account: 230px;
  --cut-col-value: 140px;
  --cut-col-qty: 110px;
  --cut-col-cost: 130px;
  --cut-col-flag: 104px;
  --cut-col-price: 120px;
  --cut-col-account-wide: 200px;
  --cut-col-tax: 130px;
  --cut-col-status: 120px;

  /* Row rhythm, likewise off the token scale: 10px keeps the 40px row height
     with a 20px line box, and 2px is the tight name/SKU stack. */
  --cut-cell-pad-y: 10px;
  --cut-stack-gap: 2px;
}

.cut-col--product      { width: var(--cut-col-product); }
.cut-col--account      { width: var(--cut-col-account); }
.cut-col--value        { width: var(--cut-col-value); }
.cut-col--qty          { width: var(--cut-col-qty); }
.cut-col--cost         { width: var(--cut-col-cost); }
.cut-col--flag         { width: var(--cut-col-flag); }
.cut-col--price        { width: var(--cut-col-price); }
.cut-col--account-wide { width: var(--cut-col-account-wide); }
.cut-col--tax          { width: var(--cut-col-tax); }
.cut-col--status       { width: var(--cut-col-status); }

.cut-th {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2);
  text-align: left;
  vertical-align: middle;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  border-right: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  /* Long uppercase labels wrap within their column instead of overlapping. */
  white-space: normal;
  overflow-wrap: break-word;
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-wide, 0.4px);
}
.cut-th:last-child { border-right: none; }
.cut-th--group {
  height: var(--mp-sizes-8, 32px);
  color: var(--mp-text-default);
  text-align: center;
  white-space: nowrap;
}
/* Match the product cell's left inset so the header checkbox lines up exactly
   with the row checkboxes below it (both start at spacing-3). */
.cut-th--product { padding-left: var(--mp-spacing-3); }
.cut-th--num { text-align: right; }
.cut-th--center { text-align: center; }
.cut-th--check { padding-left: var(--mp-spacing-3); }

.cut-req { color: var(--mp-text-danger); }

.cut-td {
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  border-right: 1px solid var(--mp-border-default, #e3e7e9);
  background: var(--mp-background-neutral, #ffffff);
  vertical-align: top;
}
.cut-td:last-child { border-right: none; }
.cut-table tbody tr:last-child .cut-td { border-bottom: none; }

.cut-td--center {
  padding: var(--mp-spacing-3);
  text-align: center;
  vertical-align: middle;
}

.cut-td--text { padding: 10px var(--mp-spacing-3); vertical-align: middle; }

/* Selection merged into the first column (mekari-taste → index-view.md).
   The checkbox is centred against the product block so it lines up with the
   middle-aligned cells across the row. */
.cut-th-select,
.cut-product-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  min-width: 0;
}
/* Product thumbnail — mirrors the inventory table's ProductCell .pc-thumb. */
.cut-product-thumb {
  width: var(--mp-sizes-10, 40px);
  height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md);
  flex-shrink: 0;
  object-fit: cover;
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-subtle, var(--mp-border-default, #e3e7e9));
}

.cut-product {
  display: flex;
  flex-direction: column;
  gap: var(--cut-stack-gap);
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
  padding: var(--cut-cell-pad-y) var(--mp-spacing-2);
  vertical-align: middle;
}

/* Editable cells own the focus ring; the control inside is borderless */
.cut-td--input,
.cut-td--select {
  padding: 0;
  position: relative;
  vertical-align: middle;
}
.cut-td--input:focus-within::after,
.cut-td--select:focus-within::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--mp-border-bold, #8c9596);
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

/* Money cell: fixed "Rp" prefix on the left, right-aligned amount fills the rest. */
.cut-money {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
}
.cut-money-rp {
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.cut-money .cut-cell-input {
  height: auto;
  padding: 0;
  flex: 1;
  min-width: 0;
}
.cut-td--off .cut-money-rp { color: var(--mp-text-disabled); }

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
.cut-td--off { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* Read-only / derived cells read as calculated, per FormTable.md → Cell Types */
.cut-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.cut-td--readonly {
  padding: var(--cut-cell-pad-y) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
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
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
}
.cut-help-link {
  color: var(--mp-text-link);
  text-decoration: none;
}
.cut-help-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Sticky footer — flex sibling below the scrolling stage. */
.cut-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage, #ffffff);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.cut-footer-actions {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

/* ── Import product mapping drawer (self-contained overlay) ── */
.imd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.imd-panel {
  margin: var(--mp-spacing-3);
  width: min(480px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}
.imd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.imd-body {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-5) var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.imd-intro {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* Numbered step (mirrors ImportWarehousesPage `.iw-step`). */
.imd-step { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.imd-step-badge {
  flex-shrink: 0;
  width: 24px; height: 24px;
  border-radius: var(--mp-radii-full, 999px);
  display: flex; align-items: center; justify-content: center;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm); font-variant-numeric: tabular-nums;
}
.imd-step-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
}
.imd-step-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg);
  color: var(--mp-text-default);
}
.imd-step-desc {
  margin: calc(var(--mp-spacing-2) * -1) 0 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.imd-step-body > .btn-enterprise { align-self: flex-start; }


.imd-upload-hint {
  margin: calc(var(--mp-spacing-1) * -1) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.imd-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-danger);
}

.imd-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}

.imd-enter-active, .imd-leave-active { transition: background-color 250ms ease; }
.imd-enter-from, .imd-leave-to { background-color: transparent; }
.imd-enter-active .imd-panel { transition: transform 350ms ease-out; }
.imd-leave-active .imd-panel { transition: transform 250ms ease-in; }
.imd-enter-from .imd-panel,
.imd-leave-to .imd-panel { transform: translateX(calc(100% + 12px)); }
</style>
