<script setup lang="ts">
/**
 * BOM structure (hierarchy) drawer — hosts the multi-level tree table
 * ({@link BomStructureTree}). Opened by "View BOM hierarchy" on a BOM and by the
 * "sub-BOM(s) pinned" link on a work order (then with the work order's pins).
 */
import { MpButton } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import BomStructureTree from '~/components/BomStructureTree.vue'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'

const props = withDefaults(defineProps<{
  isOpen: boolean
  bomId?: string
  version?: number
  /** a work order's multi-level pins (sub-BOM id → version) */
  pins?: Record<string, number>
  showDrift?: boolean
  rootQty?: number
  showActions?: boolean
  subtitle?: string
}>(), { version: undefined, pins: undefined, showDrift: true, rootQty: 1, showActions: true, subtitle: '' })
const emit = defineEmits<{ close: []; openBom: [id: string, version: number]; openDrift: [id: string, fromVersion: number] }>()
const { t } = useLocale()
const router = useRouter()

const record = computed(() => billOfMaterials.find(b => b.id === props.bomId))
function openProduct(productId: string) {
  const sku = catalogProduct(productId)?.sku
  if (sku) router.push(`/product-list/${sku}`)
}
function createWorkOrder(bomId: string) { router.push(`/work-orders/new?source=bom&bomId=${encodeURIComponent(bomId)}`) }
</script>

<template>
  <ErpDrawer :is-open="isOpen && !!record" :title="t('BOM structure')" width="1200px" @close="emit('close')">
    <template #body>
      <div v-if="record" class="bsd-body">
        <p class="bsd-caption">
          {{ subtitle || t('Sub-BOMs resolve to their Active version when a work order is created; the work order pins every level.') }}
        </p>
        <BomStructureTree
          :bom-id="record.id" :version="version" :pins="pins" :show-drift="showDrift" :root-qty="rootQty" :show-actions="showActions"
          @open-bom="(id, v) => emit('openBom', id, v)" @open-drift="(id, v) => emit('openDrift', id, v)"
          @open-product="openProduct" @create-work-order="createWorkOrder"
        />
      </div>
    </template>
    <template #footer>
      <span />
      <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Close') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.bsd-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bsd-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
</style>
