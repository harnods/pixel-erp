<!-- prod-parity: jurnal-doctor/services/quickbook/app/views/company/_billing_tab.html.haml (+ company/billings/_package_name, _billing_information, _payment_details, _billing_history) -->
<script setup lang="ts">
import { toast } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { COMPANY_NAME, billingSummary, billingHistory, type BillingHistoryRow } from '~/data/companySettings'

const { t } = useLocale()

const notInPrototype = () => toast.notify({ variant: 'info', title: t('Not in this prototype'), maxWidth: 'max-content' })

const upgradeOpen = ref(false)
function contactUs() {
  upgradeOpen.value = false
  notInPrototype()
}

// ── Billing history ──────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'paidDate',  label: t('Pay date'),         kind: 'date' },
  { key: 'period',    label: t('Billing period'),   kind: 'default' },
  { key: 'amount',    label: t('Total amount'),     kind: 'amount', align: 'right' },
  { key: 'invoiceId', label: t('Download invoice'), kind: 'default' },
]
const currentPage = ref(1)
const perPage = ref(10)
const paged = computed(() => billingHistory.slice((currentPage.value - 1) * perPage.value, currentPage.value * perPage.value))
function setPerPage(n: number) { perPage.value = n; currentPage.value = 1 }
</script>

<template>
  <div class="cp-page">

    <!-- ── Subscription package ─────────────────────────────────────────────── -->
    <section class="cp-section">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ t('Subscription package') }}</h2>
          <span class="bl-company">
            {{ COMPANY_NAME }}
            <ErpStatusBadge :status="billingSummary.status.toLowerCase()" />
          </span>
        </div>
        <div class="bl-header-actions">
          <button class="btn-enterprise btn-enterprise--primary" @click="upgradeOpen = true">{{ t('Upgrade now') }}</button>
          <button class="btn-enterprise btn-enterprise--ghost" @click="notInPrototype">{{ t('Compare subscription') }}</button>
        </div>
      </div>
      <div class="bl-list">
        <ContentList horizontal :label="t('Name')" :value="billingSummary.packageName" />
        <ContentList horizontal :label="t('Users')" :value="`${billingSummary.usersUsed} ${t('out of')} ${billingSummary.usersTotal}`" />
        <ContentList horizontal :label="t('Partners')" :value="billingSummary.partners" />
        <ContentList horizontal :label="t('Number of days left')" :value="billingSummary.daysLeft" />
        <ContentList horizontal :label="t('Expiry date')" :value="billingSummary.expiryDate" />
      </div>
    </section>

    <div class="cp-divider" />

    <!-- ── Billing information ──────────────────────────────────────────────── -->
    <section class="cp-section">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ t('Billing information') }}</h2>
        </div>
      </div>
      <div class="bl-list">
        <ContentList horizontal :label="t('Billing cycle')" :value="billingSummary.billingCycle" />
        <ContentList horizontal :label="t('Next billing date')" :value="billingSummary.nextBillingDate" />
      </div>
    </section>

    <div class="cp-divider" />

    <!-- ── Payment details ──────────────────────────────────────────────────── -->
    <section class="cp-section">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ t('Payment details') }}</h2>
        </div>
      </div>
      <p class="bl-text">
        {{ billingSummary.recurringActive
          ? t('Your recurring credit card payment is active.')
          : t('Learn more about your subscription and proceed by contacting our support team.') }}
      </p>
    </section>

    <div class="cp-divider" />

    <!-- ── Billing history ──────────────────────────────────────────────────── -->
    <section class="cp-section cp-section--full">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ t('Billing history') }}</h2>
        </div>
      </div>
      <ErpTablePage
        class="bl-table"
        :columns="columns"
        :rows="(paged as unknown as Record<string, unknown>[])"
        :total="billingHistory.length"
        :current-page="currentPage"
        :per-page="perPage"
        @page-change="(p: number) => currentPage = p"
        @per-page-change="setPerPage"
      >
        <template #cell-paidDate="{ row }">
          <span class="cell-text">{{ (row as unknown as BillingHistoryRow).paidDate ? formatDate((row as unknown as BillingHistoryRow).paidDate) : '-' }}</span>
        </template>
        <template #cell-period="{ row }">
          <span class="cell-text">{{ formatDate((row as unknown as BillingHistoryRow).periodStart) }} - {{ formatDate((row as unknown as BillingHistoryRow).periodEnd) }}</span>
        </template>
        <template #cell-amount="{ row }">
          <span class="cell-text">{{ formatIDR((row as unknown as BillingHistoryRow).amount) }}</span>
        </template>
        <template #cell-invoiceId="{ row }">
          <span v-if="(row as unknown as BillingHistoryRow).invoiceId" class="cell-link cell-text" @click.stop="notInPrototype">{{ t('Download') }}</span>
          <span v-else class="cell-text bl-subtle">{{ t('Invoice not available yet') }}</span>
        </template>
      </ErpTablePage>
    </section>

    <ConfirmModal
      v-model:is-open="upgradeOpen"
      :title="t('Upgrade package confirmation')"
      :description="t('Are you sure you want to upgrade your package? Learn more about your subscription and proceed by contacting our support team.')"
      :confirm-label="t('Contact us')"
      :is-danger="false"
      @confirm="contactUs"
    />
  </div>
</template>

<style scoped>
.cp-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}
.cp-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  padding: var(--mp-spacing-6) 0;
}
.cp-section:first-child { padding-top: 0; }
.cp-section-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
  margin-bottom: var(--mp-spacing-3);
}
.cp-section-meta { grid-column: 1 / 7; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cp-section > :not(.cp-section-header) { grid-column: 1 / 7; }
.cp-section--full > :not(.cp-section-header) { grid-column: 1 / -1; }
.cp-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cp-divider { grid-column: 1 / -1; height: 1px; background: var(--mp-border-default); }

.bl-header-actions {
  grid-column: 7 / -1;
  justify-self: start;
  display: flex;
  gap: var(--mp-spacing-2);
}
.bl-company {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}
.bl-list { display: flex; flex-direction: column; }
.bl-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.bl-subtle { color: var(--mp-text-subtle); }
</style>
