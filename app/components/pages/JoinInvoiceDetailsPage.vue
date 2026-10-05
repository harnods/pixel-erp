<!-- prod-parity: jurnal-frontend-app/src/pages/sales/merged_invoices/show.vue · purchases/merged_invoices/show.vue -->
<script setup lang="ts">
/** Join invoice detail — /join-invoices/:id and /join-purchase-invoices/:id */
import { ref, computed, watch, onUnmounted } from 'vue'
import { MpButton, MpTextlink } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  getJoinInvoice, deleteJoinInvoice, joinNumber, joinLines, joinTotal, joinRemaining, joinStatus, type JoinKind,
} from '~/data/joinInvoices'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const kind = computed<JoinKind>(() => (route.path.startsWith('/join-purchase') ? 'purchase' : 'sales'))
const isSales = computed(() => kind.value === 'sales')
const base = computed(() => (isSales.value ? '/join-invoices' : '/join-purchase-invoices'))
/** Sidebar list page (Sales › Join invoice → /join-invoice). */
const listPath = computed(() => (isSales.value ? '/join-invoice' : '/join-purchase-invoices'))
const listLabel = computed(() => (isSales.value ? t('Join invoice') : t('Join purchase invoices')))
// Keep the sidebar on Sales › Join invoice / Purchases › Join purchase invoices on these routes.
const { setActiveSectionOverride } = useNavigation()
watch(isSales, (v) => setActiveSectionOverride(v ? 'Join invoice' : 'Join purchase invoices'), { immediate: true })
onUnmounted(() => setActiveSectionOverride(null))

const ji = computed(() => getJoinInvoice(props.orderId))
const lines = computed(() => (ji.value ? joinLines(ji.value) : []))
const status = computed(() => (ji.value ? joinStatus(ji.value) : 'open'))
const total = computed(() => (ji.value ? joinTotal(ji.value) : 0))
const remaining = computed(() => (ji.value ? joinRemaining(ji.value) : 0))
const emails = computed(() => (ji.value?.email ? ji.value.email.split(',').map((e) => e.trim()).filter(Boolean) : []))
const invoiceLink = (id: string) => (isSales.value ? `/sales-invoices/${id}` : `/purchase-invoices/${id}`)

function edit() { router.push(`${base.value}/${props.orderId}/edit`) }
function printPreview() { infoToast(t('Not in this prototype')) }
function sendPayment() { infoToast(t('Not in this prototype')) }
const deleteOpen = ref(false)
function confirmDelete() {
  deleteJoinInvoice(props.orderId)
  successToast(isSales.value ? t('Join invoice successfully deleted.') : t('Join invoice deleted'))
  router.push(listPath.value)
}
</script>

<template>
  <div v-if="ji" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="jis-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="router.push(listPath)">{{ listLabel }}</MpTextlink>
        </nav>
        <div class="detail-titlerow">
          <h1 class="detail-title">{{ joinNumber(ji) }}</h1>
          <ErpStatusBadge :status="status" badge-for="additionalInformation" size="md" />
        </div>
      </div>
    </header>

    <div class="detail-stage-wrapper">
      <div class="detail-stage">
        <section class="jis-head">
          <h2 v-if="!isSales" class="jis-section-title">{{ t('Join Invoice Detail') }}</h2>
          <div class="jis-head-row">
            <div class="content-list-grid">
              <div class="content-list-col">
                <ContentList :label="isSales ? t('Customer') : t('Vendor')">
                  <span class="cell-link">{{ ji.contactName }}</span>
                </ContentList>
              </div>
              <div class="content-list-col">
                <ContentList :label="t('Email')">
                  <span v-if="emails.length" class="jis-tags"><span v-for="e in emails" :key="e" class="jis-tag">{{ e }}</span></span>
                  <template v-else>-</template>
                </ContentList>
              </div>
            </div>
            <div class="jis-total">
              <span v-if="!isSales" class="jis-total-label">{{ t('Total join invoice') }}</span>
              <span class="jis-total-value">{{ isSales ? `${t('Total')} ${formatIDR(total)}` : formatIDR(total) }}</span>
            </div>
          </div>
        </section>

        <section class="bd-meta content-list-grid jis-meta">
          <div class="content-list-col">
            <ContentList :label="t('Transaction no.')" :value="joinNumber(ji)" />
            <ContentList :label="t('Billing address')" :value="ji.billingAddress || '-'" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Transaction date')" :value="formatDate(ji.transactionDate)" />
            <ContentList :label="t('Due date')" :value="formatDate(ji.dueDate)" />
            <ContentList :label="t('Terms of payment')" :value="ji.term || '-'" />
          </div>
        </section>

        <section class="detail-items-section">
          <table class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">{{ isSales ? t('Sales Invoice') : t('Purchase invoice') }}</th>
                <th class="detail-th">{{ t('Description') }}</th>
                <th class="detail-th">{{ t('Due date') }}</th>
                <th class="detail-th">{{ t('Status') }}</th>
                <th class="detail-th detail-th--num">{{ t('Amount billed') }}</th>
                <th class="detail-th detail-th--num">{{ t('Remaining billed') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lines" :key="l.id">
                <td class="detail-td"><a class="cell-link" @click.prevent="router.push(invoiceLink(l.id))">{{ l.label }}</a></td>
                <td class="detail-td">{{ l.description || '-' }}</td>
                <td class="detail-td">{{ formatDate(l.dueDate) }}</td>
                <td class="detail-td"><ErpStatusBadge :status="l.status" /></td>
                <td class="detail-td detail-td--num">{{ formatIDR(l.total) }}</td>
                <td class="detail-td detail-td--num">{{ formatIDR(l.balance) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="detail-items-count">{{ t('Showing {current} of {total} invoice').replace('{current}', String(lines.length)).replace('{total}', String(lines.length)) }}</div>
        </section>

        <section class="detail-notes">
          <div class="detail-notes-left">
            <ContentList :label="t('Message')"><p class="detail-note-text">{{ ji.message || '-' }}</p></ContentList>
            <ContentList :label="t('Memo')"><p class="detail-note-text">{{ ji.memo || '-' }}</p></ContentList>
          </div>
          <div class="detail-totals">
            <div class="detail-total-row"><span>{{ t('Total remaining billed') }}</span><span>{{ formatIDR(remaining) }}</span></div>
          </div>
        </section>
      </div>

      <footer class="detail-footer">
        <MpButton variant="ghost" is-rounded @click="deleteOpen = true">{{ t('Delete') }}</MpButton>
        <div class="detail-footer-right">
          <MpButton variant="secondary" is-rounded @click="edit">{{ t('Edit') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="printPreview">{{ t('Print & preview') }}</MpButton>
          <MpButton v-if="remaining > 0" variant="primary" is-rounded @click="sendPayment">{{ t('Send payment') }}</MpButton>
        </div>
      </footer>
    </div>

    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete joining the invoice?')"
      :description="t('The deleted invoice will be unable to be restored.')"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />
  </div>
  <div v-else class="jis-not-found">
    <p>{{ t('We couldn\'t load this join invoice.') }}</p>
    <MpTextlink id="jis-back" as="a" class="detail-breadcrumb" @click.prevent="router.push(listPath)">{{ listLabel }}</MpTextlink>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-self: flex-start; }
.detail-breadcrumb { cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.detail-stage-wrapper { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow: hidden; }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.jis-head { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-6); border-bottom: 1px dashed var(--mp-border-default); }
.jis-section-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.jis-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); }
.jis-total { display: flex; flex-direction: column; align-items: flex-end; }
.jis-total-label { color: var(--mp-text-secondary); }
.jis-total-value { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.jis-tags { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.jis-tag { padding: 0 var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); }
.content-list-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 318px)); gap: 0 var(--mp-spacing-6); }
.content-list-col { display: flex; flex-direction: column; }
.cell-link { color: var(--mp-text-link); cursor: pointer; white-space: nowrap; }
.detail-items { width: 100%; border-collapse: collapse; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); }
.detail-th--num, .detail-td--num { text-align: right; white-space: nowrap; }
.detail-td { height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.detail-items-count { padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); color: var(--mp-text-secondary); }
.detail-notes { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.detail-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); width: min(432px, 100%); }
.detail-note-text { margin: 0; white-space: pre-line; }
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: min(428px, 100%); }
.detail-total-row { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }
.detail-footer-right { display: flex; gap: var(--mp-spacing-2); }
.jis-not-found { padding: var(--mp-spacing-6); }
</style>
