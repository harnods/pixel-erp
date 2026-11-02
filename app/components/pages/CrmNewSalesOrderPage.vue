<script setup lang="ts">
/**
 * CRM-embedded "New Sales Order" form (/crm/deals/:id/create-order).
 * Wraps the ERP NewSalesOrderPage in embedded mode with a CRM-specific header
 * (breadcrumb back to the deal). On save the deal is converted and the user
 * returns to the deal detail; on cancel they go back to the deal.
 */
import { computed } from 'vue'
import { MpTextlink, toast } from '@mekari/pixel3'
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
  display: flex; align-items: center;
  height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  padding-inline: var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle);
  flex-shrink: 0;
}
.crm-so-bar-left { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); }
.crm-so-crumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-link, #165082); cursor: pointer; text-decoration: none; }
.crm-so-crumb:hover { text-decoration: underline; }
.crm-so-h1 { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.crm-so-notfound { padding: var(--mp-spacing-12); text-align: center; color: var(--mp-text-secondary); }
</style>
