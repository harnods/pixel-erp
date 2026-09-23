<script setup lang="ts">
/**
 * Data migration → WMS cutover → Step 1: Chart of accounts.
 *
 * A WMS-only customer upgrading to ERP already HAS a chart of accounts — they
 * are not starting from nothing. So this step is a REVIEW, not a source choice:
 * look at the accounts you have, add or edit the ones the WMS split needs,
 * delete the ones you don't, or bring more in by import. FR1 — reuse the
 * existing Set Account (import) flow rather than inventing a second one.
 *
 * Continue confirms the chart is right; that confirmation is the Step 1 gate
 * (isCoaStepComplete), and Step 2's product mapping reads this same live list.
 *
 * Route: /data-migration/wms-cutover/chart-of-accounts (detailMatch → owns its
 * own 72px title bar + stage, per DESIGN.md → Layout → Stage).
 */
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpIcon, MpUpload, MpUploadList, MpProgress, MpButton, MpText, MpTextlink,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import FormatRequirementsAccordion from '~/components/patterns/FormatRequirementsAccordion.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CoaAccountDrawer from '~/components/patterns/CoaAccountDrawer.vue'
import {
  CUTOVER_STEPS, isCutoverStepComplete, type CutoverStep,
  coaAccounts, coaReviewState, COA_CATEGORIES, accountCategory,
  addCoaAccount, updateCoaAccount, deleteCoaAccount, importCoaAccounts,
  coaAccountUsage, confirmCoaReview, type CoaAccount,
} from '~/data/wmsCutover'

const { t } = useLocale()
const router = useRouter()

// ── Stepper ─────────────────────────────────────────────────────────────────
const doneSteps = computed(() => CUTOVER_STEPS.filter((s) => isCutoverStepComplete(s.key)).map((s) => s.key))
function goStep(step: CutoverStep) {
  router.push(`/data-migration/wms-cutover/${step}`)
}

// ── The chart itself ────────────────────────────────────────────────────────
function typeLabel(type?: CoaAccount['type']): string {
  if (type === 'inventory') return t('Inventory')
  if (type === 'revenue') return t('Revenue')
  if (type === 'cogs') return t('Cost of goods sold')
  return '—'
}

const search = ref('')
const categoryFilter = ref('')

const visibleAccounts = computed(() => {
  const q = search.value.trim().toLowerCase()
  return coaAccounts.filter((a) => {
    if (categoryFilter.value && accountCategory(a.code) !== categoryFilter.value) return false
    if (!q) return true
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  })
})

const hasFilter = computed(() => !!search.value || !!categoryFilter.value)
function clearFilters() {
  search.value = ''
  categoryFilter.value = ''
}

// ── Add / edit drawer ───────────────────────────────────────────────────────
const drawerOpen = ref(false)
const editing = ref<CoaAccount | null>(null)
const drawerRef = ref<InstanceType<typeof CoaAccountDrawer> | null>(null)

function openAdd() {
  editing.value = null
  drawerOpen.value = true
}
function openEdit(account: CoaAccount) {
  editing.value = { ...account }
  drawerOpen.value = true
}
function onDrawerSave(payload: { originalCode: string | null; account: CoaAccount }) {
  const error = payload.originalCode
    ? updateCoaAccount(payload.originalCode, payload.account)
    : addCoaAccount(payload.account)
  if (error) {
    drawerRef.value?.rejectSave(t(error))
    return
  }
  drawerOpen.value = false
  toast.notify({
    variant: 'success',
    title: payload.originalCode ? t('Account updated') : t('Account added'),
    maxWidth: 'max-content',
  })
}

// ── Delete ──────────────────────────────────────────────────────────────────
const deleteTarget = ref<CoaAccount | null>(null)
const deleteOpen = ref(false)
const deleteUsage = computed(() => (deleteTarget.value ? coaAccountUsage(deleteTarget.value.code) : 0))

function askDelete(account: CoaAccount) {
  deleteTarget.value = account
  // An account a product already routes to can't be removed — say so instead of
  // opening a confirm the user can only lose (Form.md → actionable errors).
  if (coaAccountUsage(account.code) > 0) {
    toast.notify({
      variant: 'danger',
      title: t('This account is used by a product and cannot be deleted'),
      maxWidth: 'max-content',
    })
    return
  }
  deleteOpen.value = true
}
function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  const error = deleteCoaAccount(target.code)
  if (error) {
    toast.notify({ variant: 'danger', title: t(error), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: t('Account deleted'), maxWidth: 'max-content' })
  deleteTarget.value = null
}

// ── Import — the existing Set Account upload flow, behind an Import button ──
// Imported accounts are ADDED to the chart; they never replace it, so a
// half-done review can't wipe work the customer already did.
type ImportPhase = 'idle' | 'importing' | 'done'
const importOpen = ref(false)
const importFile = ref<File | null>(null)
const importPhase = ref<ImportPhase>('idle')
const importProgress = ref(0)
const importedCount = ref(0)
const MAX_IMPORT_BYTES = 10 * 1024 * 1024
let progTimer: ReturnType<typeof setInterval> | undefined

const coaFormatRequirements = computed(() => [
  t('Maximum 1.000 rows per file.'),
  t('One row per account, with a code, name, and type.'),
  t('Account type must be Asset, Liability, Equity, Income, or Expense.'),
  t('Do not include currency symbols (Rp, $, etc.).'),
  t('Tip: add a backtick (`) before account codes to prevent auto-formatting. Example: `1-10200'),
])

function openImport() {
  importOpen.value = true
  importFile.value = null
  importPhase.value = 'idle'
  importProgress.value = 0
}
function closeImport() {
  importOpen.value = false
  clearInterval(progTimer)
}

function onFileChange(payload: Event | FileList | null) {
  // MpUpload's @change emits a native Event (ev.target.files); older call sites
  // pass a FileList directly — handle both.
  const files: FileList | null | undefined =
    payload && 'target' in payload ? (payload.target as HTMLInputElement).files : (payload as FileList | null)
  const file = files?.[0]
  if (!file) return
  if (file.size > MAX_IMPORT_BYTES) {
    toast.notify({ variant: 'danger', title: t('File size exceeds the 10 MB limit'), maxWidth: 'max-content' })
    return
  }
  importFile.value = file
  importPhase.value = 'idle'
  importProgress.value = 0
}
function removeImportFile() {
  importFile.value = null
  importPhase.value = 'idle'
  importProgress.value = 0
}

function runImport() {
  if (!importFile.value) {
    toast.notify({ variant: 'danger', title: t('You must upload the completed template file'), maxWidth: 'max-content' })
    return
  }
  importPhase.value = 'importing'
  importProgress.value = 0
  clearInterval(progTimer)
  progTimer = setInterval(() => {
    importProgress.value = Math.min(100, importProgress.value + 8)
    if (importProgress.value >= 100) {
      clearInterval(progTimer)
      importedCount.value = importCoaAccounts() // the file stands in for a parsed chart
      importPhase.value = 'done'
      toast.notify({
        variant: 'success',
        title: `${importedCount.value} ${t('accounts imported')}`,
        maxWidth: 'max-content',
      })
    }
  }, 90)
}
onUnmounted(() => clearInterval(progTimer))

// ── Nav ─────────────────────────────────────────────────────────────────────
function cancel() {
  router.push('/data-migration')
}
function saveDraft() {
  toast.notify({ variant: 'success', title: t('Saved as draft'), maxWidth: 'max-content' })
  router.push('/data-migration')
}
function onContinue() {
  if (!coaAccounts.length) {
    toast.notify({ variant: 'danger', title: t('Add at least one account to continue'), maxWidth: 'max-content' })
    return
  }
  confirmCoaReview()
  router.push('/data-migration/wms-cutover/products')
}
</script>

<template>
  <div class="coa-page">

    <!-- ── Title bar ── -->
    <div class="coa-titlebar">
      <div class="coa-titlebar-left">
        <MpTextlink id="coa-breadcrumb" as="a" class="coa-breadcrumb" @click.prevent="cancel">{{ t('Data migration') }}</MpTextlink>
        <h1 class="coa-title">{{ t('Set up opening balance') }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="coa-stage">
      <div class="coa-wrapper">

        <ErpStepper :steps="CUTOVER_STEPS" current="chart-of-accounts" :done="doneSteps" @select="goStep" />

        <div class="coa-intro">
          <p class="coa-intro-lead">
            {{ t('Every WMS product routes to a chart-of-accounts entry. Review the accounts below — add, edit, or import the ones your WMS split needs before mapping products.') }}
          </p>
        </div>

        <!-- ── Filters ── -->
        <div class="coa-filters">
          <div class="coa-filter-left">
            <ErpFilterSelect
              id="coa-category-filter"
              :model-value="categoryFilter"
              :placeholder="t('All categories')"
              :options="COA_CATEGORIES"
              @update:model-value="(v: string) => (categoryFilter = v)"
            />
            <button
              v-if="hasFilter"
              type="button"
              class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm"
              @click="clearFilters"
            >
              {{ t('Reset filter') }}
            </button>
          </div>

          <div class="coa-filter-right">
            <div class="coa-search">
              <MpIcon name="search" size="md" />
              <input
                v-model="search"
                class="coa-search-input"
                type="text"
                :placeholder="`${t('Search code or account name')}...`"
                :aria-label="t('Search code or account name')"
              >
              <button
                v-if="search"
                class="coa-search-clear"
                type="button"
                :aria-label="t('Clear search')"
                @click="search = ''"
              >
                <MpIcon name="close" size="sm" />
              </button>
            </div>

            <MpButton variant="tertiary" is-rounded @click="openImport">{{ t('Import') }}</MpButton>
            <MpButton variant="primary" is-rounded left-icon="add-circular" @click="openAdd">
              {{ t('Add account') }}
            </MpButton>
          </div>
        </div>

        <!-- ── Accounts table ── -->
        <div class="coa-table-wrap">
          <table class="coa-table">
            <thead>
              <tr>
                <th class="coa-th coa-th--code">{{ t('Account code') }}</th>
                <th class="coa-th">{{ t('Account name') }}</th>
                <th class="coa-th coa-th--cat">{{ t('Account category') }}</th>
                <th class="coa-th coa-th--type">{{ t('Product routing') }}</th>
                <th class="coa-th coa-th--actions" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in visibleAccounts" :key="a.code" class="coa-tr">
                <td class="coa-td coa-td--code">{{ a.code }}</td>
                <td class="coa-td">
                  <a class="cell-link" @click.stop="openEdit(a)">{{ a.name }}</a>
                </td>
                <td class="coa-td coa-td--muted">{{ t(accountCategory(a.code)) }}</td>
                <td class="coa-td coa-td--muted">{{ typeLabel(a.type) }}</td>
                <td class="coa-td coa-td--actions">
                  <MpPopover
                    :id="`coa-actions-${a.code}`"
                    is-close-on-select
                    use-portal
                    :is-keep-alive="false"
                    placement="bottom-end"
                  >
                    <MpPopoverTrigger>
                      <button class="row-kebab btn-enterprise" :aria-label="t('More actions')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <MpPopoverListItem @click="openEdit(a)">{{ t('Edit account') }}</MpPopoverListItem>
                        <MpPopoverListItem @click="askDelete(a)">{{ t('Delete account') }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
              </tr>

              <tr v-if="!visibleAccounts.length">
                <td class="coa-td coa-td--empty" colspan="5">
                  <div class="coa-empty">
                    <img :src="'/illustrations/empty-folder.png'" alt="" class="coa-empty-illustration">
                    <p class="coa-empty-title">{{ hasFilter ? t('No accounts found') : t('No accounts') }}</p>
                    <p class="coa-empty-desc">
                      {{ hasFilter ? t('No accounts match your filters.') : t('Accounts will appear here.') }}
                    </p>
                    <button
                      type="button"
                      class="btn-enterprise btn-enterprise--secondary"
                      @click="hasFilter ? clearFilters() : openAdd()"
                    >
                      {{ hasFilter ? t('Clear all filters') : t('+ Add account') }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="coa-count">
          {{ visibleAccounts.length }} {{ t('of') }} {{ coaAccounts.length }} {{ t('accounts') }}
        </p>

      </div>
    </div>

    <!-- ── Add / edit drawer ── -->
    <CoaAccountDrawer
      ref="drawerRef"
      :is-open="drawerOpen"
      :account="editing"
      @update:is-open="(v: boolean) => (drawerOpen = v)"
      @save="onDrawerSave"
    />

    <!-- ── Delete confirmation ── -->
    <ConfirmModal
      :is-open="deleteOpen"
      :title="t('Delete this account?')"
      :description="deleteTarget
        ? `${deleteTarget.code} ${deleteTarget.name} ${t('will be removed from your chart of accounts. You can add it again later.')}`
        : ''"
      :confirm-label="t('Delete account')"
      :cancel-label="t('Cancel')"
      @update:is-open="(v: boolean) => (deleteOpen = v)"
      @confirm="confirmDelete"
    />

    <!-- ── Import drawer — the existing upload flow, behind the Import button ── -->
    <Teleport to="body">
      <Transition name="coa-dw">
        <div v-if="importOpen" class="coa-dw-overlay">
          <aside class="coa-dw-panel" role="dialog" :aria-label="t('Import accounts')">
            <header class="coa-dw-header">
              <MpText weight="semiBold">{{ t('Import accounts') }}</MpText>
              <MpButton left-icon="close" variant="ghost" is-rounded :aria-label="t('Close')" @click="closeImport" />
            </header>

            <div class="coa-dw-body">
              <p class="coa-dw-lead">
                {{ t('Imported accounts are added to your chart of accounts. Accounts you already have are kept as they are.') }}
              </p>

              <ul class="coa-import-steps">
                <li>{{ t('Download the template and fill in your accounts.') }}</li>
                <li>{{ t('Upload the completed file below.') }}</li>
              </ul>

              <button type="button" class="btn-enterprise btn-enterprise--secondary">
                {{ t('Download template file') }}
              </button>

              <FormatRequirementsAccordion :requirements="coaFormatRequirements" />

              <div class="coa-field">
                <label class="coa-field-label" for="coa-own-upload">{{ t('Upload accounts') }}</label>
                <MpUpload
                  id="coa-own-upload"
                  accept=".csv,.xls,.xlsx"
                  is-full-width
                  :placeholder="t('or drag and drop here')"
                  :button-text="t('Choose file')"
                  @change="onFileChange"
                />
                <p class="coa-upload-hint">{{ t('File must be in CSV, XLS, or XLSX with a maximum of 10 MB') }}</p>

                <MpUploadList
                  v-if="importFile"
                  id="coa-own-file"
                  :title="importFile.name"
                  status="success"
                  :subtitle="importPhase === 'done' ? t('Imported') : t('Ready to import')"
                  icon-name="excel-document"
                  :is-show-download-button="false"
                  :is-show-remove-button="importPhase !== 'importing'"
                  @remove="removeImportFile"
                />
              </div>

              <div v-if="importPhase === 'importing'" class="coa-import-progress">
                <MpProgress :value="String(importProgress)" size="sm" color="information" />
                <span class="coa-import-progress-text">{{ t('Importing accounts…') }} {{ importProgress }}%</span>
              </div>

              <div v-else-if="importPhase === 'done'" class="coa-import-done">
                <MpIcon name="check" size="sm" color="icon.positive" />
                <span>{{ importedCount }} {{ t('accounts imported') }}</span>
              </div>
            </div>

            <footer class="coa-dw-footer">
              <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="closeImport">
                {{ importPhase === 'done' ? t('Close') : t('Cancel') }}
              </button>
              <button
                v-if="importPhase !== 'done'"
                type="button"
                class="btn-enterprise btn-enterprise--primary"
                @click="runImport"
              >
                {{ t('Import') }}
              </button>
            </footer>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Sticky footer (first step — no Back) ── -->
    <footer class="coa-footer">
      <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancel">
        {{ t('Cancel') }}
      </button>
      <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="saveDraft">
        {{ t('Save as draft') }}
      </button>
      <button type="button" class="btn-enterprise btn-enterprise--primary" @click="onContinue">
        {{ t('Continue') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.coa-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Title bar (mirrors the products/opening-balance cutover pages) ── */
.coa-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.coa-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}
.coa-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: var(--mp-font-sizes-xs, 12px);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  white-space: nowrap;
}
.coa-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.coa-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px);
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.coa-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-20, 80px);
}
.coa-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  max-width: 960px;
}

/* ── Intro ── */
.coa-intro { max-width: 760px; }
.coa-intro-lead {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* ── Filters — category on the left, search + actions on the right ── */
.coa-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  flex-wrap: wrap;
}
.coa-filter-left,
.coa-filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.coa-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  min-width: 240px;
  max-width: 320px;
  height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-icon-secondary);
}
/* Every typeable control shows a focus state — bold neutral border (Form.md). */
.coa-search:focus-within {
  border-color: var(--mp-border-bold, #8c9596);
  box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596);
}
.coa-search-input {
  flex: 1 0 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.coa-search-input::placeholder { color: var(--mp-text-placeholder); }
.coa-search-clear {
  display: inline-flex;
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: var(--mp-radii-full);
  background: transparent;
  color: var(--mp-icon-secondary);
  cursor: pointer;
}
.coa-search-clear:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-icon-default);
}

/* ── Table — ErpTablePage metrics, inline (this is a step page, not an index) ── */
.coa-table-wrap {
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.coa-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}
.coa-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-wide, 0.4px);
  color: var(--mp-text-secondary);
  text-align: left;
  white-space: nowrap;
}
.coa-th--code { width: var(--mp-sizes-40, 160px); }
.coa-th--cat { width: var(--mp-sizes-40, 160px); }
.coa-th--type { width: var(--mp-sizes-48, 192px); }
.coa-th--actions { width: var(--mp-sizes-11, 44px); }

.coa-tr:hover { background: var(--mp-background-neutral-hovered); }
.coa-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  vertical-align: middle;
}
.coa-table tbody tr:last-child .coa-td { border-bottom: none; }
.coa-td--code {
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.coa-td--muted { color: var(--mp-text-secondary); white-space: nowrap; }
.coa-td--actions {
  padding-top: var(--mp-spacing-1);
  padding-bottom: var(--mp-spacing-1);
  text-align: center;
}

/* Row action kebab — the shared ERP row-action button. */
.row-kebab {
  display: flex !important;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  padding: var(--mp-spacing-1) !important;
  min-width: 0 !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer;
  border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-subtle);
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* Empty state — illustration → title (0) → desc (2px) → CTA (12px). */
.coa-td--empty { padding: var(--mp-spacing-6) var(--mp-spacing-2); }
.coa-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.coa-empty-illustration { width: var(--mp-sizes-30, 120px); height: auto; }
.coa-empty-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.coa-empty-desc {
  margin: var(--mp-spacing-0\.5, 2px) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

.coa-count {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Import drawer ── */
.coa-dw-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex;
  justify-content: flex-end;
}
.coa-dw-panel {
  margin: var(--mp-spacing-3);
  width: min(480px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}
.coa-dw-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.coa-dw-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.coa-dw-lead {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.coa-dw-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}

/* Import steps — a real bulleted list (discs must show). */
.coa-import-steps {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  list-style: disc;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.coa-import-steps li { margin: 0; }
.coa-import-steps li + li { margin-top: var(--mp-spacing-1); }

.coa-field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}
.coa-field-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.coa-upload-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.coa-import-progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}
.coa-import-progress-text {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
}
.coa-import-done {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-positive, #2fa36b);
}

.coa-dw-enter-active, .coa-dw-leave-active { transition: background-color 250ms ease; }
.coa-dw-enter-from, .coa-dw-leave-to { background-color: transparent; }
.coa-dw-enter-active .coa-dw-panel { transition: transform 350ms ease-out; }
.coa-dw-leave-active .coa-dw-panel { transition: transform 250ms ease-in; }
.coa-dw-enter-from .coa-dw-panel,
.coa-dw-leave-to .coa-dw-panel { transform: translateX(calc(100% + 12px)); }

/* ── Sticky footer (flex sibling below the scrolling stage) ── */
.coa-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}
</style>
