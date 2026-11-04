<!-- prod-parity: jurnal-doctor/services/quickbook/app/views/company/_billing_tab.html.haml (+ company/billings/_package_name, _billing_information, _payment_details, _billing_history) -->
<script setup lang="ts">
import { infoToast } from '~/utils/toasts'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { COMPANY_NAME, billingSummary, billingHistory, type BillingHistoryRow } from '~/data/companySettings'

const { t } = useLocale()

const notInPrototype = () => infoToast(t('Not in this prototype'))

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

    <!-- Upgrade confirmation — Teleport shell (same as CouriersPage). -->
    <Teleport to="body">
      <Transition name="cem">
        <div v-if="upgradeOpen" class="cem-overlay">
          <div class="cem-panel" role="dialog" aria-modal="true" :aria-label="t('Upgrade package confirmation')">
            <p class="cem-title">{{ t('Upgrade package confirmation') }}</p>
            <p class="cem-sub">{{ t('Are you sure you want to upgrade your package?') }}</p>
            <p class="cem-body">{{ t('Learn more about your subscription and proceed by contacting our support team.') }}</p>
            <div class="cem-footer">
              <button class="btn-enterprise btn-enterprise--ghost" @click="upgradeOpen = false">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" @click="contactUs">{{ t('Contact us') }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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

.cem-enter-active, .cem-leave-active { transition: opacity 200ms ease; }
.cem-enter-from, .cem-leave-to { opacity: 0; }
.cem-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay);
  display: flex; align-items: center; justify-content: center;
}
.cem-panel {
  width: min(440px, calc(100% - 32px));
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-lg);
  padding: var(--mp-spacing-5) var(--mp-spacing-5) var(--mp-spacing-4);
}
.cem-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cem-sub { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cem-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cem-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-5); }
</style>
