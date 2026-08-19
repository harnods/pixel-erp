<script setup lang="ts">
/**
 * CRM (Qontak) — Product detail (/crm/products/:sku). Mirrors the ERP Product
 * details "Product info" section (image + ContentList fields) but limited to
 * photo, name, description, SKU, category, unit and unit price — no other prices
 * or stock quantities. Same product data as the ERP inventory.
 */
import { computed } from 'vue'
import { toast } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import { formatIDR } from '~/utils/currency'
import { getProductDetail } from '~/data/productDetails'

const props = defineProps<{ orderId: string }>()   // route :sku arrives as order-id
const router = useRouter()
function soon(what: string) { toast.notify({ variant: 'info', title: `${what} — coming soon`, maxWidth: 'max-content' }) }
function goBack() { router.push('/crm/products') }

const product = computed(() => getProductDetail(props.orderId))
</script>

<template>
  <div v-if="product" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" type="button" @click="goBack">Products</button>
        <h1 class="detail-title">{{ product.name }}</h1>
      </div>
      <div class="detail-bar-right">
        <button class="crm-btn crm-btn--secondary" type="button" @click="soon('Edit product')">Edit</button>
      </div>
    </header>

    <div class="detail-stage">
      <section class="pd-section">
        <h2 class="pd-section-title">Product info</h2>
        <div class="pd-info-row">
          <div class="pd-image-col">
            <img :src="product.img" :alt="product.name" class="pd-image">
          </div>
          <div class="pd-field-col">
            <ContentList label="Name" :value="product.name" />
            <ContentList label="SKU" :value="product.sku" />
            <ContentList label="Category" :value="product.category" />
            <ContentList label="Unit" :value="product.unit" />
            <ContentList label="Unit price" :value="formatIDR(product.defaultSalesPrice)" />
            <ContentList label="Description">
              <ClampText :text="product.desc" :lines="3" />
            </ContentList>
          </div>
        </div>
      </section>
    </div>
  </div>

  <div v-else class="detail-page">
    <header class="detail-bar"><div class="detail-bar-left"><button class="detail-breadcrumb" type="button" @click="goBack">Products</button><h1 class="detail-title">Product not found</h1></div></header>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: var(--mp-background-neutral-subtle, #f8f9f9); }
.detail-bar { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.detail-bar-left { display: flex; flex-direction: column; gap: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-link, #165082); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default); }
.detail-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.crm-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; white-space: nowrap; border: 1px solid transparent; }
.crm-btn--secondary { background: var(--mp-background-neutral, #fff); border-color: var(--mp-border-bold, #8c9596); color: var(--mp-text-default); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; padding: var(--mp-spacing-6); }
.pd-section-title { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pd-info-row { display: flex; gap: var(--mp-spacing-8); align-items: flex-start; }
.pd-image-col { flex-shrink: 0; }
.pd-image { width: 200px; height: 200px; object-fit: cover; border-radius: var(--mp-radii-md, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral); }
.pd-field-col { display: flex; flex-direction: column; gap: var(--mp-spacing-4); width: 368px; }
</style>
