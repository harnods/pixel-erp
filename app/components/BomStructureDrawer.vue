<script setup lang="ts">
/**
 * BOM structure (hierarchy) drawer, opened by "View BOM hierarchy" on a BOM:
 *  • Components — the multi-level tree table ({@link BomStructureTree}); every
 *    sub-assembly shows its Active version.
 *  • Parents — where-used: every BOM that uses this one, directly or "via" another
 *    BOM, each with its code + Active version.
 */
import { MpButton, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import BomStructureTree from '~/components/BomStructureTree.vue'
import { billOfMaterials, catalogProduct, bomWhereUsed } from '~/data/billOfMaterials'

const props = withDefaults(defineProps<{
  isOpen: boolean
  bomId?: string
  version?: number
  /** a work order's multi-level pins (sub-BOM id → version) */
  pins?: Record<string, number>
  showDrift?: boolean
  rootQty?: number
  showActions?: boolean
}>(), { version: undefined, pins: undefined, showDrift: true, rootQty: 1, showActions: true })
const emit = defineEmits<{ close: []; openBom: [id: string, version: number]; openDrift: [id: string, fromVersion: number] }>()
const { t } = useLocale()
const router = useRouter()

const record = computed(() => billOfMaterials.find(b => b.id === props.bomId))
function openProduct(productId: string) {
  const sku = catalogProduct(productId)?.sku
  if (sku) router.push(`/product-list/${sku}`)
}
function createWorkOrder(bomId: string) { router.push(`/work-orders/new?source=bom&bomId=${encodeURIComponent(bomId)}`) }

// ── Parents tab (where-used, every level) ──
const tab = ref(0)
watch(() => props.isOpen, (o) => { if (o) tab.value = 0 })
const parents = computed(() => (record.value ? bomWhereUsed(record.value.id).sort((a, z) => a.depth - z.depth) : []))
/** How many of this BOM's output (or of the "via" BOM's output) one parent unit needs. */
const qtyUsed = (parentId: string, viaId?: string) => {
  const p = billOfMaterials.find(b => b.id === parentId)
  const child = billOfMaterials.find(b => b.id === (viaId ?? record.value?.id))
  return p && child ? p.rawMaterials.filter(r => r.productId === child.finishedGoodId).reduce((s, r) => s + r.needed, 0) : 0
}
</script>

<template>
  <ErpDrawer :is-open="isOpen && !!record" :title="t('BOM structure')" width="1200px" @close="emit('close')">
    <template #body>
      <div v-if="record" class="bsd-body">
        <!-- No descriptive subtitle under the title (rule/no-page-description-subtitle) -->
        <MpTabs id="bsd-tabs" v-model="tab" is-manual variant-color="green" class="bsd-tabs">
          <MpTabList>
            <MpTab id="bsd-tab-components" value="components">{{ t('Components') }}</MpTab>
            <MpTab id="bsd-tab-parents" value="parents" data-devchange="bom-structure-parents">{{ t('Parents') }} ({{ parents.length }})</MpTab>
          </MpTabList>
          <MpTabPanels>
            <MpTabPanel value="components">
            <BomStructureTree
              :bom-id="record.id" :version="version" :pins="pins" :show-drift="showDrift" :root-qty="rootQty" :show-actions="showActions"
              @open-bom="(id, v) => emit('openBom', id, v)" @open-drift="(id, v) => emit('openDrift', id, v)"
              @open-product="openProduct" @create-work-order="createWorkOrder"
            />
            </MpTabPanel>
            <MpTabPanel value="parents">
              <table v-if="parents.length" class="bsd-table">
                <thead>
                  <tr><th>{{ t('Parent bill of materials') }}</th><th>{{ t('Level') }}</th><th class="bsd-num">{{ t('Qty used') }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="p in parents" :key="p.bom.id">
                    <td>
                      <span class="bsd-link" role="link" tabindex="0" @click="emit('openBom', p.bom.id, p.bom.version)" @keydown.enter="emit('openBom', p.bom.id, p.bom.version)">{{ p.bom.name }}</span>
                      <span class="bsd-sub">{{ p.bom.number }} · v{{ p.bom.version }}</span>
                    </td>
                    <td>{{ p.depth === 1 ? t('Direct') : `${t('via')} ${p.via?.name}` }}</td>
                    <td class="bsd-num">{{ qtyUsed(p.bom.id, p.via?.id) }}</td>
                  </tr>
                </tbody>
              </table>
              <!-- Empty state: illustration + title + caption (rule/empty-state-structure); no create CTA applies here -->
              <div v-else class="bsd-empty">
                <img src="/illustrations/empty-folder.png" alt="" class="bsd-empty-img" />
                <p class="bsd-empty-title">{{ t('No parent bill of materials') }}</p>
                <p class="bsd-empty-caption">{{ t('No bill of materials uses this one as a sub-assembly.') }}</p>
              </div>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
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
/* ErpDrawer's width prop goes through runtime css(), which this build doesn't generate — so the panel would
   shrink to its content (narrow on the Parents tab). Hold the body at the drawer's intended width. */
.bsd-body { width: min(var(--mp-sizes-6xl, 72rem), calc(100vw - var(--mp-sizes-18, 4.5rem))); }
.bsd-tabs :deep(.mp-tab--isSelected_true),
.bsd-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.bsd-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.bsd-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-4) !important; }
/* Hand-rolled read-only table matched to the ERP table metrics (rule/table-header-uppercase,
   rule/table-header-height, rule/table-cell-padding-align, rule/table-cell-text-plain). */
.bsd-table { width: 100%; border-collapse: collapse; background: var(--mp-background-stage, #ffffff); }
.bsd-table th {
  height: var(--mp-sizes-7); padding: var(--mp-spacing-1) var(--mp-spacing-2); text-align: left; white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-colors-text-secondary); background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.bsd-table td {
  padding: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); vertical-align: middle;
}
.bsd-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-8) 0; text-align: center; }
.bsd-empty-img { width: var(--mp-sizes-40, 10rem); }
.bsd-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.bsd-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.bsd-num { text-align: right !important; font-variant-numeric: tabular-nums; }
.bsd-link { color: var(--mp-text-link); cursor: pointer; }
.bsd-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.bsd-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
</style>
