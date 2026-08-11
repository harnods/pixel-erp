<script setup lang="ts">
/**
 * Data migration → WMS cutover → Products pending setup.
 *
 * PRD "WMS Conversion Balance Setup" (PD/51260326215), Story 9 + FR10 + FR12.
 * Route: /data-migration/wms-cutover/pending
 *
 * The post-go-live half of the setup screen. A product created in WMS after
 * cutover has no GL routing, so its movements cannot post — they queue here
 * rather than falling back to a default account (FR10, OS3). WMS operations
 * are never blocked by ERP setup status (Story 9 locked decision), which the
 * page states up front so a warehouse user is not alarmed by an "exception".
 *
 * Story 3 AC: this uses the SAME bulk-select + single-account-assign mechanism
 * as initial cleanup — "not two separate features" — so the interaction here is
 * deliberately identical to WmsCutoverProductsPage.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpIcon, MpCheckbox, MpBanner, MpBannerIcon, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTextlink, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  pendingSetupProducts, pendingMovementCount, pendingProductCount, postQueuedEntries,
  inventoryAccounts, accountLabel, type CoaAccount,
} from '~/data/wmsCutover'

const { t } = useLocale()
const router = useRouter()

const groupFmt = new Intl.NumberFormat('id-ID')
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })

function labelFor(list: CoaAccount[], code: string): string {
  const found = list.find((a) => a.code === code)
  return found ? accountLabel(found) : ''
}

const queuedMovements = computed(() => pendingMovementCount())
const unresolvedCount = computed(() => pendingProductCount())
const readyCount = computed(() => pendingSetupProducts.filter((p) => p.inventoryAccount).length)

// ── Bulk select (Story 3, same mechanism as initial cleanup) ────────────────
const selectedIds = ref<string[]>([])
const unresolved = computed(() => pendingSetupProducts.filter((p) => !p.inventoryAccount))
const allSelected = computed(
  () => unresolved.value.length > 0 && unresolved.value.every((p) => selectedIds.value.includes(p.id)),
)
const someSelected = computed(() => selectedIds.value.length > 0 && !allSelected.value)

function toggleSelectAll(checked: boolean) {
  selectedIds.value = checked ? unresolved.value.map((p) => p.id) : []
}
function toggleRow(id: string, checked: boolean) {
  selectedIds.value = checked
    ? [...selectedIds.value, id]
    : selectedIds.value.filter((x) => x !== id)
}

const bulkAccount = ref('')
const bulkError = ref('')

function applyBulkAccount() {
  if (!bulkAccount.value) {
    bulkError.value = t('You must select inventory account')
    return
  }
  const n = selectedIds.value.length
  pendingSetupProducts.forEach((p) => {
    if (selectedIds.value.includes(p.id)) p.inventoryAccount = bulkAccount.value
  })
  toast.notify({ variant: 'success', title: `${n} ${t('products updated')}`, maxWidth: 'max-content' })
  selectedIds.value = []
  bulkAccount.value = ''
  bulkError.value = ''
}

// ── Release the held entries ────────────────────────────────────────────────
const formError = ref('')

function postEntries() {
  if (readyCount.value === 0) {
    formError.value = t('Assign an inventory account to at least one product first')
    return
  }
  formError.value = ''
  const posted = postQueuedEntries()
  selectedIds.value = []
  toast.notify({
    variant: 'success',
    title: `${posted} ${t('journal entries posted')}`,
    maxWidth: 'max-content',
  })
}

function goBack() {
  router.push('/data-migration')
}
</script>

<template>
  <div class="pen-page">

    <!-- ── Title bar ── -->
    <div class="pen-titlebar">
      <div class="pen-titlebar-left">
        <MpTextlink id="pen-breadcrumb" as="a" class="pen-breadcrumb" @click.prevent="goBack">{{ t('Data migration') }}</MpTextlink>
        <h1 class="pen-title">{{ t('Products pending setup') }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="pen-stage">
      <div class="pen-wrapper">

        <!-- Story 9 AC: say plainly that the warehouse is not blocked -->
        <MpBanner id="pen-not-blocked" variant="info">
          <MpBannerIcon id="pen-not-blocked-icon" />
          <MpBannerDescription id="pen-not-blocked-desc">
            {{ t('Warehouse operations are not affected. Receiving, issuing, and transferring stock continue normally for these products — only their journal entries are held until each one has an inventory account.') }}
          </MpBannerDescription>
        </MpBanner>

        <!-- Empty state — everything resolved -->
        <template v-if="!pendingSetupProducts.length">
          <div class="pen-empty">
            <MpIcon name="check" size="lg" color="icon.success" />
            <p class="pen-empty-title">{{ t('No products pending setup') }}</p>
            <p class="pen-empty-desc">
              {{ t('New WMS products will appear here with their held entries until they are routed to an account.') }}
            </p>
          </div>
        </template>

        <template v-else>
          <dl class="pen-meta">
            <div class="pen-meta-item">
              <dt class="pen-meta-label">{{ t('Products pending') }}</dt>
              <dd class="pen-meta-value">{{ unresolvedCount }}</dd>
            </div>
            <div class="pen-meta-item">
              <dt class="pen-meta-label">{{ t('Entries held') }}</dt>
              <dd class="pen-meta-value">{{ queuedMovements }}</dd>
            </div>
          </dl>

          <!-- Bulk action bar -->
          <div v-if="selectedIds.length" class="pen-bulkbar">
            <span class="pen-bulk-count">{{ selectedIds.length }} {{ t('selected') }}</span>

            <MpPopover id="pen-bulk-account" is-close-on-select>
              <MpPopoverTrigger>
                <button type="button" class="pen-trigger pen-trigger--wide" :class="{ 'pen-trigger--set': !!bulkAccount }">
                  <span class="pen-trigger-label">
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
            <span v-if="bulkError" class="pen-error">{{ bulkError }}</span>
          </div>

          <p v-if="formError" class="pen-error">{{ formError }}</p>

          <div class="pen-table-wrap">
            <table class="pen-table">
              <colgroup>
                <col class="pen-col--check">
                <col class="pen-col--product">
                <col class="pen-col--seen">
                <col class="pen-col--entries">
                <col class="pen-col--qty">
                <col class="pen-col--account">
                <col class="pen-col--status">
              </colgroup>
              <thead>
                <tr>
                  <th class="pen-th pen-th--check">
                    <MpCheckbox
                      id="pen-select-all"
                      :is-checked="allSelected"
                      :is-indeterminate="someSelected"
                      :aria-label="t('Select all pending products')"
                      @change="toggleSelectAll"
                    />
                  </th>
                  <th class="pen-th">{{ t('Product') }}</th>
                  <th class="pen-th">{{ t('First seen') }}</th>
                  <th class="pen-th pen-th--num">{{ t('Entries held') }}</th>
                  <th class="pen-th pen-th--num">{{ t('Qty') }}</th>
                  <th class="pen-th">{{ t('Inventory account') }} <span class="pen-req">*</span></th>
                  <th class="pen-th">{{ t('Status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in pendingSetupProducts" :key="p.id">
                  <td class="pen-td pen-td--check">
                    <MpCheckbox
                      :id="`pen-check-${p.id}`"
                      :is-checked="selectedIds.includes(p.id)"
                      :is-disabled="!!p.inventoryAccount"
                      :aria-label="`${t('Select')} ${p.name}`"
                      @change="(checked: boolean) => toggleRow(p.id, checked)"
                    />
                  </td>
                  <td class="pen-td">
                    <div class="pen-product">
                      <span class="pen-product-name">{{ p.name }}</span>
                      <span class="pen-product-sku">{{ p.sku }}</span>
                    </div>
                  </td>
                  <td class="pen-td pen-td--muted">{{ dateFmt.format(new Date(p.discoveredAt)) }}</td>
                  <td class="pen-td pen-td--num">{{ p.queuedMovements }}</td>
                  <td class="pen-td pen-td--num pen-td--muted">{{ groupFmt.format(p.queuedQty) }}</td>

                  <td class="pen-td pen-td--select" :class="{ 'pen-td--error': !p.inventoryAccount && !!formError }">
                    <MpPopover :id="`pen-acct-${p.id}`" placement="bottom-start" use-portal is-close-on-select>
                      <MpPopoverTrigger>
                        <button type="button" class="pen-cell-trigger">
                          <span :class="p.inventoryAccount ? 'pen-cell-value' : 'pen-cell-placeholder'">
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

                  <td class="pen-td pen-td--status">
                    <ErpStatusBadge
                      :status="p.inventoryAccount ? 'completed' : 'pending'"
                      :label="p.inventoryAccount ? t('Ready to post') : t('Held')"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pen-actions">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="goBack">
              {{ t('Back') }}
            </button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="postEntries">
              {{ t('Post held entries') }}
            </button>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
.pen-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Title bar ── */
.pen-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  padding: 0 var(--mp-spacing-6);
}

.pen-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}

.pen-breadcrumb {
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
.pen-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }

.pen-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.pen-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

.pen-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  max-width: 1160px;
}

/* ── Meta ── */
.pen-meta {
  display: flex;
  gap: var(--mp-spacing-8);
  margin: 0;
}

.pen-meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.pen-meta-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.pen-meta-value {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  font-variant-numeric: tabular-nums;
}

/* ── Bulk bar ── */
.pen-bulkbar {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  flex-wrap: wrap;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.pen-bulk-count {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.pen-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-danger);
}

.pen-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
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
.pen-trigger--wide { width: 280px; }
.pen-trigger--set { color: var(--mp-text-default); border-color: var(--mp-border-bold); }

.pen-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Table ── */
.pen-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.pen-table {
  width: 100%;
  min-width: 1110px;
  border-collapse: collapse;
  table-layout: fixed;

  /* Column geometry. Table widths are off the 4px Pixel size scale (no
     --mp-sizes-* token covers 130px/260px/300px), so they live here as named
     local constants rather than as magic numbers in inline style attributes. */
  --pen-col-check: 44px;
  --pen-col-product: 260px;
  --pen-col-seen: 130px;
  --pen-col-entries: 130px;
  --pen-col-qty: 120px;
  --pen-col-account: 300px;
  --pen-col-status: 130px;

  /* Row rhythm, likewise off the token scale: 10px keeps the 40px row height
     with a 20px line box, and 2px is the tight name/SKU stack. */
  --pen-cell-pad-y: 10px;
  --pen-stack-gap: 2px;
}

.pen-col--check   { width: var(--pen-col-check); }
.pen-col--product { width: var(--pen-col-product); }
.pen-col--seen    { width: var(--pen-col-seen); }
.pen-col--entries { width: var(--pen-col-entries); }
.pen-col--qty     { width: var(--pen-col-qty); }
.pen-col--account { width: var(--pen-col-account); }
.pen-col--status  { width: var(--pen-col-status); }

.pen-th {
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
.pen-th:last-child { border-right: none; }
.pen-th--num { text-align: right; }
.pen-th--check { padding-left: var(--mp-spacing-3); }

.pen-req { color: var(--mp-text-danger); }

.pen-td {
  padding: var(--pen-cell-pad-y) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  vertical-align: middle;
}
.pen-td:last-child { border-right: none; }
.pen-table tbody tr:last-child .pen-td { border-bottom: none; }

.pen-td--check { padding-left: var(--mp-spacing-3); }
.pen-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.pen-td--muted { color: var(--mp-text-secondary); }

.pen-product {
  display: flex;
  flex-direction: column;
  gap: var(--pen-stack-gap);
}
.pen-product-name { color: var(--mp-text-default); }
.pen-product-sku {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

/* Editable select cell owns its focus ring (FormTable.md) */
.pen-td--select { padding: 0; position: relative; }
.pen-td--select:focus-within::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2;
  pointer-events: none;
}
.pen-td--error {
  background: var(--mp-background-danger-subtle, #FCEEED);
  border-bottom-color: var(--mp-border-danger, #E2483D);
}

.pen-cell-trigger {
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

.pen-cell-value,
.pen-cell-placeholder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pen-cell-placeholder { color: var(--mp-text-placeholder, var(--mp-text-secondary)); }

/* ── Empty state ── */
.pen-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-10, 40px) var(--mp-spacing-6);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
  background: var(--mp-background-neutral);
  text-align: center;
}
.pen-empty-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pen-empty-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* ── Actions ── */
.pen-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-2);
}
</style>
