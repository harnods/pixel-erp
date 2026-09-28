<script setup lang="ts">
/**
 * CRM-embedded "New Sales Order" form (/crm/deals/:id/create-order).
 * Wraps the ERP NewSalesOrderPage in embedded mode with a CRM-specific header
 * (breadcrumb back to the deal). On save the deal is converted and the user
 * returns to the deal detail; on cancel they go back to the deal.
 */
import { computed } from 'vue'
import { MpButton, MpTextlink, toast } from '@mekari/pixel3'
import NewSalesOrderPage from '~/components/pages/NewSalesOrderPage.vue'
import { getDeal, dealNo } from '~/data/crm'
import { dealToSalesPrefill, pendingSalesPrefill } from '~/data/salesFormPrefill'
import { successToast } from '~/utils/toasts'
import type { SalesOrder } from '~/data/types'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const deal = computed(() => getDeal(props.orderId))
const dealName = computed(() => deal.value?.name ?? '')
const prefill = computed(() => deal.value ? (pendingSalesPrefill.value ?? dealToSalesPrefill(deal.value)) : null)

function goBack() { router.push(`/crm/deals/${props.orderId}`) }

function onCreated(order: SalesOrder) {
  successToast(`${t('Sales order')} #${order.number} ${t('created')}`)
  router.push(`/crm/deals/${props.orderId}`)
}
</script>

<template>
  <div class="crm-so-form">
    <header class="crm-so-bar">
      <div class="crm-so-bar-left">
        <MpTextlink as="a" class="crm-so-crumb" @click.prevent="goBack">{{ dealName || t('Deal') }}</MpTextlink>
        <h1 class="crm-so-h1">{{ t('New sales order') }}</h1>
      </div>
      <div class="crm-so-bar-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</MpButton>
      </div>
    </header>
    <NewSalesOrderPage
      v-if="deal"
      embedded
      :prefill="prefill"
      data-devchange="crm-create-sales-order-inline"
      @cancel="goBack"
      @created="onCreated"
    />
    <div v-else class="crm-so-notfound">{{ t('Deal not found') }}</div>
  </div>
</template>

<style scoped>
.crm-so-form { display: flex; flex-direction: column; height: 100%; }
.crm-so-bar {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 24px 12px; border-bottom: 1px solid var(--mp-color-gray-100);
  flex-shrink: 0;
}
.crm-so-bar-left { display: flex; flex-direction: column; gap: 2px; }
.crm-so-crumb { font-size: 12px; color: var(--mp-color-gray-600); cursor: pointer; }
.crm-so-crumb:hover { color: var(--mp-color-gray-900); }
.crm-so-h1 { font-size: 20px; font-weight: 600; color: var(--mp-color-gray-900); margin: 0; }
.crm-so-bar-right { display: flex; gap: 8px; padding-top: 4px; }
.crm-so-notfound { padding: 48px; text-align: center; color: var(--mp-color-gray-500); }
</style>
