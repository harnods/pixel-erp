<!-- prod-parity: jurnal-frontend-app/src/pages/sales/ProFormaInvoices/Show.vue (+ components/Show/*) and pages/sales/pro_forma_orders/show.vue -->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  getProgressDoc, totalsOf, deleteProgressDocs, markProgressDocPaid, masterLabel, siblingsOf, progressDocs,
} from '~/data/progressInvoices'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const kind = computed(() => (route.path.startsWith('/proforma') ? 'proforma' : 'progress'))
const entity = computed(() => (kind.value === 'progress' ? t('Progress invoice') : t('Proforma invoice')))
const listPath = computed(() => (kind.value === 'progress' ? '/progress-invoice' : '/proforma-invoice'))
const base = computed(() => (kind.value === 'progress' ? '/progress-invoices' : '/proforma-invoices'))

const doc = computed(() => { void progressDocs.value; return getProgressDoc(props.orderId) ?? null })
const totals = computed(() => (doc.value ? totalsOf(doc.value) : null))
const master = computed(() => (doc.value ? masterLabel(doc.value.kind, doc.value.masterNumber) : ''))
const masterPath = computed(() => {
  const d = doc.value
  if (!d) return ''
  return d.kind === 'progress' ? `/sales-invoices/${d.masterId}` : `/sales-orders/${d.masterId}`
})
// Prod ERP copy: proforma_type → "This progress invoice is a progress invoice",
// order_proforma_type → "This proforma invoice is a progress invoice", + master link.
const alertDescription = computed(() => (kind.value === 'progress'
  ? t('This progress invoice is a progress invoice')
  : t('This proforma invoice is a progress invoice')))
const methodLabel = computed(() => (doc.value?.method === 'fixed_amount' ? t('Fixed amount') : t('Percentage')))
const siblings = computed(() => (doc.value ? siblingsOf(doc.value.kind, doc.value.masterId) : []))

const deleteOpen = ref(false)
function runDelete() {
  const d = doc.value
  if (!d) return
  deleteProgressDocs([d.id])
  successToast(`${entity.value} ${d.number} ${t('deleted')}`)
  router.push(listPath.value)
}
function receivePayment() {
  if (!doc.value) return
  markProgressDocPaid(doc.value.id)
  successToast(t('Successfully processed'))
}
function goList() { router.push(listPath.value) }
function goMaster() { if (masterPath.value) router.push(masterPath.value) }
function goSibling(id: string) { router.push(`${base.value}/${id}`) }
function notInPrototype() { infoToast(t('Not in this prototype')) }
function lineFrom(amount: number, pct: number | null) {
  return pct == null ? `${t('From')} ${formatIDR(amount)}` : `${t('From')} ${formatIDR(amount)} (${pct}%)`
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">{{ entity }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ doc ? `${entity} #${doc.number}` : t('Transaction not found') }}</h1>
          <ErpStatusBadge v-if="doc" :status="doc.status" size="md" badge-for="additionalInformation" />
        </div>
      </div>
      <div v-if="doc" class="detail-bar-right">
        <MpPopover id="pgd-print" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after">
              {{ t('Print & preview') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="notInPrototype">{{ t('Print') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ kind === 'progress' ? t('Preview progress invoice') : t('Preview template') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpPopover id="pgd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-after">
              {{ t('Actions') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem v-if="doc.status === 'open'" @click="receivePayment">{{ t('Receive payment') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ kind === 'progress' ? t('Email progress invoice') : t('Email invoice') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ kind === 'progress' ? t('Share progress invoice link') : t('Share invoice link') }}</MpPopoverListItem>
              <MpPopoverListItem class="pgd-danger" @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="detail-stage">
      <div v-if="!doc || !totals" class="pgd-not-found">
        <img src="/illustrations/empty-folder.png" alt="" width="288" height="240" />
        <p class="pgd-not-found-title">{{ t('Transaction not found') }}</p>
        <p class="pgd-not-found-desc">{{ t('This transaction may have been deleted, or the link is incorrect.') }}</p>
      </div>

      <template v-else>
        <!-- ── Header summary ── -->
        <section class="detail-summary">
          <div class="content-list-grid">
            <div class="content-list-col">
              <ContentList :label="t('Customer')">
                <span class="cell-link">{{ doc.customer.name }}</span>
              </ContentList>
            </div>
            <div class="content-list-col">
              <ContentList :label="t('Email')">
                <span v-for="(e, i) in doc.email" :key="i" class="content-list__line">{{ e }}</span>
                <template v-if="!doc.email.length">—</template>
              </ContentList>
            </div>
            <div class="detail-primary-total">
              <div class="pgd-total-line">
                <span class="detail-total-label">{{ t('Total amount') }}</span>
                <span class="detail-total-amount">{{ formatIDR(totals.balance) }}</span>
              </div>
              <!-- Progress invoice flag (prod PopoverTag, hover) → links the master transaction -->
              <MpPopover id="pgd-flag" trigger="hover" use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <span class="pgd-flag"><MpIcon name="information" size="sm" />{{ t('Progress invoice') }}</span>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ width: '280px', padding: 'var(--mp-spacing-3)' })">
                  <div class="pgd-flag-body">
                    <span class="pgd-flag-title">{{ t('Progress invoice') }}</span>
                    <span>{{ alertDescription }} <span class="cell-link" @click="goMaster">{{ master }}</span>.</span>
                  </div>
                </MpPopoverContent>
              </MpPopover>
            </div>
          </div>

          <div class="detail-divider" />

          <div class="content-list-grid">
            <div class="content-list-col">
              <ContentList :label="t('Billing address')" :value="doc.billingAddress || '—'" />
            </div>
            <div class="content-list-col">
              <ContentList :label="t('Transaction date')" :value="formatDate(doc.date)" />
              <ContentList :label="t('Due date')" :value="formatDate(doc.dueDate)" />
              <ContentList :label="t('Term')" :value="doc.term || '—'" />
            </div>
            <div class="content-list-col">
              <ContentList :label="t('Transaction no.')" :value="doc.number" />
              <ContentList :label="kind === 'progress' ? t('Customer reference no.') : t('Reference no.')" :value="doc.customerRefNo || '—'" />
            </div>
            <div class="content-list-col">
              <ContentList :label="kind === 'progress' ? t('Master invoice') : t('Order no.')">
                <span class="cell-link" @click="goMaster">{{ master }}</span>
              </ContentList>
              <ContentList :label="t('Invoicing method')" :value="methodLabel" />
            </div>
            <div class="content-list-col">
              <ContentList :label="t('Tags')">
                <ErpTagList v-if="doc.tags.length" :tags="doc.tags" />
                <template v-else>—</template>
              </ContentList>
            </div>
          </div>
        </section>

        <!-- ── Lines (read-only) ── -->
        <section class="detail-items-section">
          <div class="detail-items-scroll">
            <table class="detail-items">
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Product') }}</th>
                  <th class="detail-th">{{ t('Description') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Amount billed') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Qty') }}</th>
                  <th class="detail-th">{{ t('Units') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Unit price') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Discount') }}</th>
                  <th class="detail-th">{{ t('Tax') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(l, i) in doc.lines" :key="i">
                  <td class="detail-td">
                    <span class="pgd-product">
                      <span class="cell-link">{{ l.product }}</span>
                      <span class="pgd-sub">{{ t('SKU') }}: {{ l.sku }}</span>
                    </span>
                  </td>
                  <td class="detail-td pgd-muted">{{ l.description }}</td>
                  <td class="detail-td detail-td--num">
                    <span class="pgd-billed">
                      <span>{{ l.billedPct != null ? `${l.billedPct}%` : formatIDR(l.billed) }}</span>
                      <span class="pgd-sub">{{ lineFrom(l.masterAmount, null) }}</span>
                    </span>
                  </td>
                  <td class="detail-td detail-td--num">{{ l.qty }}</td>
                  <td class="detail-td">{{ l.unit }}</td>
                  <td class="detail-td detail-td--num">{{ formatIDR(l.unitPrice) }}</td>
                  <td class="detail-td detail-td--num">{{ l.discountPct ? `${l.discountPct}%` : '0%' }}</td>
                  <td class="detail-td">{{ l.taxLabel }}</td>
                  <td class="detail-td detail-td--num">{{ formatIDR(l.billed) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="detail-items-count">{{ t('Showing') }} {{ doc.lines.length }} {{ t('from') }} {{ doc.lines.length }} {{ t('product') }}</div>
        </section>

        <!-- ── Notes + totals ── -->
        <section class="detail-notes">
          <div class="detail-notes-left">
            <ContentList :label="t('Message')" :value="doc.message || '—'" />
            <ContentList :label="t('Memo')" :value="doc.memo || '—'" />
          </div>
          <div class="detail-totals">
            <div class="detail-total-row">
              <span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span>
              <span class="detail-total-row-amt detail-total-row-amt--strong">{{ formatIDR(totals.subtotal) }}</span>
            </div>
            <div class="detail-total-row">
              <span class="detail-total-row-label">{{ totals.taxLabel }}</span>
              <span class="detail-total-row-amt">{{ formatIDR(totals.taxAmount) }}</span>
            </div>
            <div class="detail-total-rule" />
            <div class="detail-total-row">
              <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
              <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(totals.total) }}</span>
            </div>
            <div class="detail-total-row">
              <span class="detail-total-row-label">{{ t('Payment paid') }}</span>
              <span class="detail-total-row-amt">{{ formatIDR(totals.paid) }}</span>
            </div>
            <div class="detail-total-rule" />
            <div class="detail-total-row">
              <span class="detail-total-row-label detail-total-row-label--total">{{ t('Balance due') }}</span>
              <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(totals.balance) }}</span>
            </div>
          </div>
        </section>

        <!-- ── History: other documents billing the same master ── -->
        <section class="pgd-section">
          <h2 class="pgd-section-title">{{ t('Invoice') }}</h2>
          <p v-if="!siblings.length" class="pgd-empty">{{ t('No invoice history yet') }}</p>
          <table v-else class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">{{ t('Date') }}</th>
                <th class="detail-th">{{ t('Number') }}</th>
                <th class="detail-th">{{ t('Status') }}</th>
                <th class="detail-th detail-th--num">{{ t('Total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in siblings" :key="s.id">
                <td class="detail-td">{{ formatDate(s.date) }}</td>
                <td class="detail-td"><span class="cell-link" @click="goSibling(s.id)">{{ entity }} #{{ s.number }}</span></td>
                <td class="detail-td"><ErpStatusBadge :status="s.status" /></td>
                <td class="detail-td detail-td--num">{{ formatIDR(totalsOf(s).total) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </div>

    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="`${t('Delete')} ${entity.toLowerCase()}?`"
      :description="`${t('The deleted')} ${entity.toLowerCase()} ${t('is unable to be restored.')}`"
      :confirm-label="t('Delete')"
      is-danger
      @confirm="runDelete"
    />
  </div>
</template>

<style scoped>
/* Shell copied from CurrentAssetDetailPage.vue / SalesInvoiceDetailsPage.vue */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: none; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
.detail-summary { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.detail-primary-total {
  grid-column: 3 / -1; justify-self: end; align-self: start; padding-top: var(--mp-spacing-2);
  display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-2);
}
.pgd-total-line { display: flex; align-items: baseline; gap: var(--mp-spacing-2); }
.detail-total-label, .detail-total-amount {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap;
}
.pgd-flag {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1); cursor: default;
  padding: 0 var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-subtle);
}
.pgd-flag-body { display: flex; flex-direction: column; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pgd-flag-title { font-weight: var(--mp-font-weights-semi-bold); }
.detail-divider {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(to right, var(--mp-border-default) 0, var(--mp-border-default) 4px, transparent 4px, transparent 8px);
}
.content-list-grid { display: grid; grid-template-columns: minmax(0, 318px) repeat(4, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-scroll { overflow-x: auto; }
.detail-items { width: 100%; border-collapse: collapse; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.pgd-muted { color: var(--mp-text-secondary); }
.pgd-product, .pgd-billed { display: flex; flex-direction: column; }
.pgd-billed { align-items: flex-end; }
.pgd-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-items-count { padding: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); }

.detail-notes { display: grid; grid-template-columns: 1fr 380px; gap: var(--mp-spacing-6); align-items: start; }
.detail-notes-left { display: flex; flex-direction: column; }
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-2); }
.detail-total-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-row-label--strong, .detail-total-row-amt--strong,
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.detail-total-rule {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(to right, var(--mp-border-default) 0, var(--mp-border-default) 4px, transparent 4px, transparent 8px);
}
.pgd-section { display: flex; flex-direction: column; }
.pgd-section-title {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 24px); color: var(--mp-text-default);
}
.pgd-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pgd-danger { color: var(--mp-text-danger); }
.pgd-not-found { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.pgd-not-found-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pgd-not-found-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
