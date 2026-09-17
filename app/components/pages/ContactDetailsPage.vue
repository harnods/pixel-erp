<script setup lang="ts">
/**
 * Contact details — the master-data detail page for one contact.
 *
 * Figma: Contacts › Details › Profile (both tax states: Not validated / Validated).
 * Follows the master-data detail variant in docs/patterns/details-page-format.md,
 * with the Figma's layout specifics: the tab strip sits in the title-bar band,
 * and each section is a 4-column ContentList grid separated by a hairline rule.
 *
 * Route: /{customers|vendors|other-contacts}/:id — the first segment only picks
 * the breadcrumb; the record is the same either way.
 */
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpBadge, MpIcon, MpButton,
  MpInput, MpAutocomplete,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { columnWidth, type ColumnKind } from '~/components/patterns/columnWidths'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { getContact, deleteContact, nitkuFull, type ContactType } from '~/data/contacts'
import { salesInvoices } from '~/data/salesInvoices'
import { vendorItemsForVendor, upsertVendorItem } from '~/data/vendorItems'
import { supplementalSupply } from '~/data/vendorSuppliedProducts'
import { productBySku } from '~/data/inventory'
import { CATALOG } from '~/data/catalog'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ orderId: string }>()

const route = useRoute()
const router = useRouter()
const { t } = useLocale()

const contact = computed(() => getContact(props.orderId))

// ── Breadcrumb / back target follows the list we came from ────────────────────
const LISTS: Record<string, { label: string; type: ContactType }> = {
  'customers':      { label: 'Customers',      type: 'customer' },
  'vendors':        { label: 'Vendors',        type: 'vendor'   },
  'other-contacts': { label: 'Other contacts', type: 'other'    },
}
const listSlug = computed(() => {
  const seg = route.path.split('/').filter(Boolean)[0] ?? 'customers'
  return LISTS[seg] ? seg : 'customers'
})
const listLabel = computed(() => LISTS[listSlug.value]!.label)

// A vendor contact gets a Products tab (the price list we buy at); customers and
// other contacts don't, so it is inserted only when the role is present.
const isVendor = computed(() => contact.value?.types.includes('vendor') ?? false)

// ── Tab persistence via ?tab= so back/forward restores the tab ───────────────
const TAB_NAMES = computed(() =>
  isVendor.value
    ? ['details', 'products', 'transactions', 'files']
    : ['details', 'transactions', 'files'],
)
const activeTabIndex = computed({
  get(): number {
    const idx = TAB_NAMES.value.indexOf(route.query.tab as string)
    return idx >= 0 ? idx : 0
  },
  set(idx: number) {
    router.replace({ query: { ...route.query, tab: TAB_NAMES.value[idx] ?? 'details' } })
  },
})

function goBack() { router.push(`/${listSlug.value}`) }
function goEdit() { router.push(`/${listSlug.value}/${props.orderId}/edit`) }

// ── Derived display values ────────────────────────────────────────────────────
const fullNameDisplay = computed(() => {
  const c = contact.value
  if (!c?.fullName) return ''
  return c.title ? `${c.fullName} (${c.title})` : c.fullName
})
const creditLimitDisplay = computed(() =>
  contact.value?.creditLimit == null ? '' : formatIDR(contact.value.creditLimit))

/** `Last updated by X on 25 Jan 2026, 11:00 (GMT+7)` */
const lastUpdatedDisplay = computed(() => {
  const c = contact.value
  if (!c) return ''
  const d = new Date(c.updatedAt)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${t('Last updated by')} ${c.updatedBy} ${t('on')} ${date}, ${time} (GMT+7)`
})

// ── Transactions tab — sales invoices raised against this contact ─────────────
// Records join on customer name, so a contact with no matching sales record
// (e.g. a brand-new one) shows the empty line rather than a fabricated list.
const transactions = computed(() => {
  const c = contact.value
  if (!c) return []
  const names = [c.displayName, c.companyName].filter(Boolean).map((n) => n.toLowerCase())
  return salesInvoices
    .filter((inv) => names.includes(inv.customer.name.toLowerCase()))
    .slice(0, 20)
})
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Products tab — what this vendor supplies, with MOQ and price ──────────────
// Joined from the vendor master via `vendorMasterId` (see contacts.ts): each row
// is a product this supplier is set up to sell us, carrying the agreed minimum
// order quantity and unit price. Operating-expense vendors (logistics, utilities,
// rent, software) supply no catalogue product, so their list is empty by design.
// The engine (vendorItems) is a reactive array; upsertVendorItem mutates it, so
// this recomputes after every add/edit without extra plumbing.
const vendorEngineRows = computed(() => {
  const masterId = contact.value?.vendorMasterId
  return masterId
    ? vendorItemsForVendor(masterId).filter((vi) => vi.active !== false)
    : []
})

// Editing writes to the engine store (which the replenishment rule reads), so it
// is offered only where that store backs the list — the coffee/packaging/
// equipment suppliers. The two demo distributors (CT007, V008) show a supplemental
// read-only price list and can't be edited here.
const usingSupplemental = computed(() =>
  vendorEngineRows.value.length === 0
  && supplementalSupply(contact.value?.vendorMasterId ?? contact.value?.id ?? '').length > 0)
const canEditProducts = computed(() =>
  !!contact.value?.vendorMasterId && !usingSupplemental.value)

const vendorProducts = computed(() => {
  const c = contact.value
  if (!c) return []
  const masterId = c.vendorMasterId

  let rows = vendorEngineRows.value.map((vi) => ({
    id: vi.id,
    sku: vi.sku,
    name: productBySku(vi.sku)?.name ?? vi.sku,
    moq: vi.moq,
    packSize: vi.packSize,
    unitCost: vi.unitCost,
    purchaseUnit: vi.purchaseUnit,
  }))

  // Fall back to the demo-only supplemental list for the distributor / logistics
  // vendors the engine doesn't cover (keyed by master id, or contact id when a
  // contact has no master link).
  if (!rows.length) {
    rows = supplementalSupply(masterId ?? c.id).map((s) => ({
      id: `sup-${masterId ?? c.id}-${s.sku}`,
      sku: s.sku,
      name: productBySku(s.sku)?.name ?? s.sku,
      moq: s.moq,
      packSize: s.packSize,
      unitCost: s.unitCost,
      purchaseUnit: s.purchaseUnit,
    }))
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name))
})

// ── Add / edit products supplied (writes to the engine store) ─────────────────
const productsEditing = ref(false)
// Per-SKU drafts of the three editable fields, held until Save.
const prodDraft = reactive<Record<string, { moq: string; packSize: string; unitCost: string }>>({})

function startEditProducts(): void {
  for (const k of Object.keys(prodDraft)) delete prodDraft[k]
  for (const p of vendorProducts.value) {
    prodDraft[p.sku] = { moq: String(p.moq), packSize: String(p.packSize), unitCost: String(p.unitCost) }
  }
  productsEditing.value = true
}
function cancelEditProducts(): void {
  productsEditing.value = false
  showAddRow.value = false
}
function saveProducts(): void {
  const masterId = contact.value?.vendorMasterId
  if (!masterId) return
  for (const p of vendorProducts.value) {
    const d = prodDraft[p.sku]
    if (!d) continue
    const moq = Math.max(0, Math.round(Number(d.moq) || 0))
    const packSize = Math.max(1, Math.round(Number(d.packSize) || 1))
    const unitCost = Math.max(0, Math.round(Number(d.unitCost) || 0))
    if (moq === p.moq && packSize === p.packSize && unitCost === p.unitCost) continue
    upsertVendorItem({ vendorId: masterId, sku: p.sku, moq, packSize, unitCost })
  }
  productsEditing.value = false
  showAddRow.value = false
  toast.notify({ variant: 'success', title: t('Products updated'), maxWidth: 'max-content' })
}

// Add a product this vendor supplies — picks from the catalogue SKUs not already
// linked, and captures the same three fields the replenishment rule reads.
const showAddRow = ref(false)
const addForm = reactive({ sku: '', moq: '1', packSize: '1', unitCost: '' })
const availableSkus = computed(() => {
  const taken = new Set(vendorProducts.value.map((p) => p.sku))
  return CATALOG.filter((c) => !taken.has(c.sku)).map((c) => ({ label: `${c.name} (${c.sku})`, value: c.sku }))
})
function openAddRow(): void {
  addForm.sku = ''
  addForm.moq = '1'
  addForm.packSize = '1'
  addForm.unitCost = ''
  showAddRow.value = true
}
function confirmAddProduct(): void {
  const masterId = contact.value?.vendorMasterId
  if (!masterId || !addForm.sku) {
    toast.notify({ variant: 'error', title: t('Choose a product to add.'), maxWidth: 'max-content' })
    return
  }
  upsertVendorItem({
    vendorId: masterId,
    sku: addForm.sku,
    moq: Math.max(0, Math.round(Number(addForm.moq) || 0)),
    packSize: Math.max(1, Math.round(Number(addForm.packSize) || 1)),
    unitCost: addForm.unitCost === '' ? undefined : Math.max(0, Math.round(Number(addForm.unitCost))),
  })
  showAddRow.value = false
  toast.notify({ variant: 'success', title: t('Product added'), maxWidth: 'max-content' })
}
/** Related-records column width — from the shared standard, never hardcoded.
 *  Columns grow to their max (the trailing spacer <col> soaks up the rest). */
function colStyle(kind: ColumnKind) {
  const { minWidth, maxWidth } = columnWidth(kind)
  return { width: maxWidth, minWidth, maxWidth }
}

// ── Title-bar actions ─────────────────────────────────────────────────────────
const CREATE_TRANSACTION_ITEMS = [
  { label: 'Sales quote',      to: '/sales-quotes'    },
  { label: 'Sales order',      to: '/sales-orders'    },
  { label: 'Sales invoice',    to: '/sales-invoices'  },
  { label: 'Purchase invoice', to: '/purchase-invoices' },
]
const isDeleteModalOpen = ref(false)
function confirmDelete() {
  deleteContact(props.orderId)
  toast.notify({ variant: 'success', title: t('Contact deleted'), maxWidth: 'max-content' })
  goBack()
}
</script>

<template>
  <div v-if="contact" class="cd-page">
    <MpTabs id="cd-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="cd-tabs">

      <!-- ── Title bar band: breadcrumb + title + actions, then the tab strip ── -->
      <header class="cd-header">
        <div class="cd-bar">
          <div class="cd-bar-left">
            <a class="cd-breadcrumb" role="link" tabindex="0" @click="goBack" @keydown.enter="goBack">{{ t(listLabel) }}</a>
            <h1 class="cd-title">{{ contact.displayName }}</h1>
          </div>

          <div class="cd-bar-right">
            <MpPopover id="cd-create-tx" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="primary" is-rounded right-icon="chevrons-down">{{ t('Create transaction') }}</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="item in CREATE_TRANSACTION_ITEMS" :key="item.label"
                    @click="router.push(item.to)"
                  >{{ t(item.label) }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>

            <MpPopover id="cd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <button class="cd-kebab" :aria-label="t('More actions')">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="goEdit">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem
                    :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
                    @click="isDeleteModalOpen = true"
                  >{{ t('Delete') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>

        <MpTabList>
          <MpTab id="cd-tab-details" value="details">{{ t('Contact details') }}</MpTab>
          <MpTab v-if="isVendor" id="cd-tab-products" value="products">{{ t('Products') }}</MpTab>
          <MpTab id="cd-tab-transactions" value="transactions">{{ t('Transactions') }}</MpTab>
          <MpTab id="cd-tab-files" value="files">{{ t('Files') }}</MpTab>
        </MpTabList>
      </header>

      <!-- ── Stage ── -->
      <div class="cd-stage">
        <MpTabPanels>

          <!-- ─────────── Contact details ─────────── -->
          <MpTabPanel value="details">
            <div class="cd-sections">

              <!-- Contact info -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Contact info') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Display name')" :value="contact.displayName" />
                  <ContentList :label="t('Full name')" :value="fullNameDisplay || undefined" />
                  <ContentList :label="t('Email')">
                    <template v-if="contact.emails.length">
                      <span v-for="e in contact.emails" :key="e" class="content-list__line">{{ e }}</span>
                    </template>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Mobile')" :value="contact.mobile || undefined" />

                  <ContentList :label="contact.identityType" :value="contact.identityNumber || undefined" />
                  <ContentList :label="t('Contact group')">
                    <template v-if="contact.groups.length">
                      <a v-for="g in contact.groups" :key="g" class="cd-link content-list__line">{{ g }}</a>
                    </template>
                    <template v-else>—</template>
                  </ContentList>
                </div>
              </section>

              <!-- Company info -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Company info') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Company name')" :value="contact.companyName || undefined" />
                  <ContentList :label="t('Billing address')" :value="contact.billingAddress || undefined" />
                  <ContentList :label="t('Shipping address')" :value="contact.shippingAddress || undefined" />
                  <ContentList :label="t('Phone')" :value="contact.phone || undefined" />
                  <ContentList :label="t('Fax')" :value="contact.fax || undefined" />
                </div>
              </section>

              <!-- Tax info — the heading carries the DJP validation state -->
              <section class="cd-section">
                <div class="cd-section-head">
                  <h2 class="cd-section-title cd-section-title--inline">{{ t('Tax info') }}</h2>
                  <MpBadge
                    for="additionalInformation" size="sm"
                    :type="contact.taxStatus === 'validated' ? 'completed' : 'announcement'"
                  >
                    {{ contact.taxStatus === 'validated' ? t('Validated') : t('Not validated') }}
                  </MpBadge>
                </div>
                <div v-if="contact.domicile === 'domestic'" class="cd-grid">
                  <ContentList :label="t('NPWP')" :value="contact.npwp || undefined" />
                  <ContentList :label="t('NITKU')" :value="nitkuFull(contact) || undefined" />
                </div>
                <div v-else class="cd-grid">
                  <ContentList :label="t('Tax Identification Number (TIN)')" :value="contact.tin || undefined" />
                </div>
              </section>

              <!-- Credit limit -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Credit limit') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Amount')" :value="creditLimitDisplay || undefined" />
                </div>
              </section>

              <!-- Bank info — one column per account -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Bank info') }}</h2>
                <div v-if="contact.banks.length" class="cd-grid">
                  <div v-for="(bank, i) in contact.banks" :key="bank.id" class="cd-bank">
                    <div class="cd-bank-head">
                      <span class="cd-bank-title">
                        {{ i === 0 ? t('Primary bank account') : `${t('Bank account')} ${i + 1}` }}
                      </span>
                      <MpBadge v-if="bank.isConnected" for="additionalInformation" type="completed" size="sm">
                        {{ t('Connected') }}
                      </MpBadge>
                    </div>
                    <ContentList :label="t('Bank name')" :value="bank.bankName || undefined" />
                    <ContentList :label="t('Bank branch')" :value="bank.branch || undefined" />
                    <ContentList :label="t('Account no.')" :value="bank.accountNo || undefined" />
                    <ContentList :label="t('Account name')" :value="bank.accountName || undefined" />
                  </div>
                </div>
                <p v-else class="cd-empty">{{ t('No bank account added.') }}</p>
              </section>

              <!-- Default settings -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Default settings') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Accounts receivable account')" :value="contact.arAccount || undefined" />
                  <ContentList :label="t('Accounts payable account')" :value="contact.apAccount || undefined" />
                  <ContentList :label="t('Default payment terms')" :value="contact.paymentTerms || undefined" />
                  <ContentList :label="t('Default currency')" :value="contact.currency || undefined" />
                </div>
              </section>

              <!-- Memo -->
              <section class="cd-section cd-section--last">
                <h2 class="cd-section-title">{{ t('Memo') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Memo')" :value="contact.memo || undefined" />
                </div>
                <a class="cd-updated">{{ lastUpdatedDisplay }}</a>
              </section>

            </div>
          </MpTabPanel>

          <!-- ─────────── Products (vendors only) ─────────── -->
          <MpTabPanel v-if="isVendor" value="products">
            <section class="cd-section cd-section--last">
              <div class="cd-section-head">
                <h2 class="cd-section-title cd-section-title--inline">{{ t('Products supplied') }}</h2>
                <div v-if="canEditProducts" class="cd-prod-actions">
                  <template v-if="productsEditing">
                    <MpButton variant="ghost" size="sm" is-rounded @click="cancelEditProducts">{{ t('Cancel') }}</MpButton>
                    <MpButton variant="primary" size="sm" is-rounded @click="saveProducts">{{ t('Save changes') }}</MpButton>
                  </template>
                  <template v-else>
                    <MpButton variant="ghost" size="sm" is-rounded @click="startEditProducts">
                      <MpIcon name="edit" size="sm" /> {{ t('Edit') }}
                    </MpButton>
                    <MpButton variant="secondary" size="sm" is-rounded @click="openAddRow">
                      + {{ t('Product') }}
                    </MpButton>
                  </template>
                </div>
              </div>
              <!-- MOQ is the minimum the replenishment rule ever orders; the purchase
                   multiple ("kelipatan pembelian") is what it rounds the quantity up to. -->
              <p class="cd-prod-hint">{{ t('Replenishment never orders below the MOQ, and rounds each order up to the purchase multiplier.') }}</p>

              <table v-if="vendorProducts.length || showAddRow" class="cd-table">
                <colgroup>
                  <col :style="colStyle('name')" />
                  <col :style="colStyle('number')" />
                  <col />
                  <col />
                  <col :style="colStyle('unit')" />
                  <col :style="colStyle('amount')" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{{ t('Product') }}</th>
                    <th>{{ t('SKU') }}</th>
                    <th class="cd-td--right">{{ t('MOQ') }}</th>
                    <th class="cd-td--right">{{ t('Purchase multiplier') }}</th>
                    <th>{{ t('Purchase unit') }}</th>
                    <th class="cd-td--right">{{ t('Last Price') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in vendorProducts" :key="p.id">
                    <td>
                      <a class="cd-link" @click="router.push(`/product-list/${p.sku}`)">{{ p.name }}</a>
                    </td>
                    <td>{{ p.sku }}</td>
                    <td class="cd-td--right">
                      <MpInput
                        v-if="productsEditing && prodDraft[p.sku]" :id="`cd-moq-${p.sku}`"
                        v-model="prodDraft[p.sku]!.moq" type="number" :class="css({ width: '84px' })"
                      />
                      <template v-else>{{ p.moq.toLocaleString('id-ID') }}</template>
                    </td>
                    <td class="cd-td--right">
                      <MpInput
                        v-if="productsEditing && prodDraft[p.sku]" :id="`cd-pack-${p.sku}`"
                        v-model="prodDraft[p.sku]!.packSize" type="number" :class="css({ width: '84px' })"
                      />
                      <template v-else>{{ p.packSize.toLocaleString('id-ID') }}</template>
                    </td>
                    <td>{{ p.purchaseUnit }}</td>
                    <td class="cd-td--right">
                      <MpInput
                        v-if="productsEditing && prodDraft[p.sku]" :id="`cd-cost-${p.sku}`"
                        v-model="prodDraft[p.sku]!.unitCost" type="number" :class="css({ width: '132px' })"
                      />
                      <template v-else>{{ formatIDR(p.unitCost) }}</template>
                    </td>
                  </tr>

                  <!-- Add-product row -->
                  <tr v-if="showAddRow" class="cd-add-row">
                    <td>
                      <MpAutocomplete
                        id="cd-add-sku" v-model="addForm.sku" :data="availableSkus"
                        label-prop="label" value-prop="value" is-searchable use-portal is-full-width
                        :placeholder="t('Choose a product')"
                      />
                    </td>
                    <td>{{ addForm.sku || '—' }}</td>
                    <td class="cd-td--right">
                      <MpInput id="cd-add-moq" v-model="addForm.moq" type="number" :class="css({ width: '84px' })" />
                    </td>
                    <td class="cd-td--right">
                      <MpInput id="cd-add-pack" v-model="addForm.packSize" type="number" :class="css({ width: '84px' })" />
                    </td>
                    <td>—</td>
                    <td class="cd-td--right">
                      <div class="cd-add-actions">
                        <MpInput id="cd-add-cost" v-model="addForm.unitCost" type="number" :placeholder="t('Price')" :class="css({ width: '132px' })" />
                        <MpButton variant="primary" size="sm" is-rounded @click="confirmAddProduct">{{ t('Add') }}</MpButton>
                        <MpButton variant="ghost" size="sm" is-rounded @click="showAddRow = false">{{ t('Cancel') }}</MpButton>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="cd-empty">{{ t('This vendor supplies no catalogue products yet.') }}</p>
            </section>
          </MpTabPanel>

          <!-- ─────────── Transactions ─────────── -->
          <MpTabPanel value="transactions">
            <section class="cd-section cd-section--last">
              <h2 class="cd-section-title">{{ t('Transactions') }}</h2>
              <table v-if="transactions.length" class="cd-table">
                <colgroup>
                  <col :style="colStyle('date')" />
                  <col :style="colStyle('number')" />
                  <col :style="colStyle('status')" />
                  <col :style="colStyle('amount')" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>{{ t('Date') }}</th>
                    <th>{{ t('Number') }}</th>
                    <th>{{ t('Status') }}</th>
                    <th class="cd-td--right">{{ t('Total') }}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="inv in transactions" :key="inv.id">
                    <td>{{ formatDate(inv.date) }}</td>
                    <td>
                      <a class="cd-link" @click="router.push(`/sales-invoices/${inv.id}`)">
                        {{ t('Sales Invoice') }} #{{ inv.number }}
                      </a>
                    </td>
                    <td><ErpStatusBadge :status="inv.status" /></td>
                    <td class="cd-td--right">{{ formatIDR(inv.total) }}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p v-else class="cd-empty">{{ t('No transactions yet.') }}</p>
            </section>
          </MpTabPanel>

          <!-- ─────────── Files ─────────── -->
          <MpTabPanel value="files">
            <section class="cd-section cd-section--last">
              <h2 class="cd-section-title">{{ t('Files') }}</h2>
              <p class="cd-empty">
                <MpIcon name="attachment" size="md" />
                {{ t('No files attached to this contact.') }}
              </p>
            </section>
          </MpTabPanel>

        </MpTabPanels>
      </div>
    </MpTabs>

    <ConfirmModal
      v-model:is-open="isDeleteModalOpen"
      :title="t('Delete contact?')"
      :description="`${contact.displayName} ${t('will be removed from your contact list.')}`"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />
  </div>

  <div v-else class="cd-missing">
    <p>{{ t('Contact not found.') }}</p>
    <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Back to') }} {{ t(listLabel) }}</MpButton>
  </div>
</template>

<style scoped>
/* ── Page shell ── */
.cd-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cd-tabs { display: flex; flex-direction: column; min-height: 0; flex: 1; }

/* ── Title bar band (bar + tab strip share the neutral-subtle background) ── */
.cd-header {
  flex-shrink: 0;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
}
.cd-bar {
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.cd-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.cd-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cd-breadcrumb {
  align-self: flex-start; cursor: pointer;
  font-size: 12px; line-height: var(--mp-line-heights-md); color: var(--mp-text-link);
}
.cd-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cd-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* Tab strip sits flush at the bottom of the header band (Figma) */
.cd-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: 0 !important; }
.cd-tabs :deep(.mp-tab--isSelected_true),
.cd-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.cd-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}

/* ── Kebab (self-styled; no longer relies on .btn-enterprise) ── */
.cd-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: 0; border: none; background: transparent;
  border-radius: var(--mp-radii-md); cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.cd-kebab:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }

/* ── Stage ── */
.cd-stage {
  flex: 1; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6);
}

/* ── Sections: 4-column key/value grid, hairline rule between sections ── */
.cd-sections { display: flex; flex-direction: column; }
.cd-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px solid var(--mp-border-default); }
.cd-section:first-child { padding-top: 0; }
.cd-section--last { border-bottom: none; padding-bottom: 0; }
.cd-section-head { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-3); }
.cd-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.cd-section-title--inline { margin-bottom: 0; }

.cd-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6);
  row-gap: 0;
}
/* a value that wraps (addresses) must not stretch the row */
.cd-grid > * { min-width: 0; }

.cd-bank { display: flex; flex-direction: column; }
.cd-bank-head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-1); }
.cd-bank-title {
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.cd-link { color: var(--mp-text-link); cursor: pointer; }
.cd-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cd-product-badge { margin-left: 8px; vertical-align: middle; }
.cd-prod-actions { margin-left: auto; display: flex; gap: var(--mp-spacing-2); }
.cd-prod-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0 0 var(--mp-spacing-4); }
.cd-add-row td { vertical-align: top; }
.cd-add-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); }

.cd-empty {
  margin: 0; display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* Last-updated metadata line */
.cd-updated {
  display: inline-block; align-self: flex-start;
  margin-top: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer;
}
.cd-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Related-records table (Transactions tab) ── */
.cd-table { width: 100%; border-collapse: collapse; }
.cd-table th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-surface, #f1f5f9);
  text-align: left; text-transform: uppercase;
  font-size: 12px; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
  white-space: nowrap;
}
.cd-table td {
  min-height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle;
}
.cd-table th.cd-td--right,
.cd-table td.cd-td--right { text-align: right; }

.cd-missing {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
