<script setup lang="ts">
/**
 * CrmEditProductsDrawer — full-screen drawer for editing a Deal's products. Hosts
 * the ERP sales-order line-items + totals editor in `products-only` mode (the same
 * table: Product · Description · Qty · Unit · Unit price · Discount · Tax · Amount +
 * "Price includes tax", and the Subtotal → Total summary with global discount +
 * shipping). Seeded from the deal, fully editable; Save emits the products/totals
 * back to the deal (no sales order is created).
 */
import { computed } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import NewSalesOrderPage from '~/components/pages/NewSalesOrderPage.vue'
import { dealToSalesPrefill } from '~/data/salesFormPrefill'
import type { Deal, DealProductsPayload } from '~/data/crm'

const props = defineProps<{ open: boolean; deal: Deal | null }>()
const emit = defineEmits<{ close: []; save: [payload: DealProductsPayload] }>()
const { t } = useLocale()

const prefill = computed(() => (props.deal ? dealToSalesPrefill(props.deal) : null))
</script>

<template>
  <ErpDrawer :is-open="open" :title="t('Products')" width="100%" @close="emit('close')">
    <template #title>
      <div class="cxd-header-left">
        <span v-if="deal" class="cxd-eyebrow">{{ deal.name }}</span>
        <h2 class="cxd-title">{{ t('Products') }}</h2>
      </div>
    </template>
    <template #body>
      <NewSalesOrderPage
        embedded
        products-only
        :prefill="prefill"
        @cancel="emit('close')"
        @save-products="(p) => emit('save', p)"
      />
    </template>
  </ErpDrawer>
</template>

<style scoped>
.cxd-header-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.cxd-eyebrow { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.cxd-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-xl, 28px);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
</style>
