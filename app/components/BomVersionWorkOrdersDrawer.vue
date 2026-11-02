<script setup lang="ts">
/**
 * All work orders created from one BOM version — opened by "Show more (n)" in the
 * Versions table on the BOM detail page. The header names the BOM (name, number,
 * version); the table lists each work order with its finished good and creation
 * date, newest first (rule/table-default-newest-first). Read-only: a work order
 * number opens that work order.
 */
import { MpButton } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'
import { workOrdersOnBomVersion, bomForWorkOrder } from '~/data/workOrders'
import { formatDate } from '~/utils/date'

const props = defineProps<{ isOpen: boolean; bomId?: string; version?: number }>()
const emit = defineEmits<{ close: []; openWorkOrder: [id: string] }>()
const { t } = useLocale()

const record = computed(() => billOfMaterials.find(b => b.id === props.bomId))
const rows = computed(() => {
  if (!record.value || props.version === undefined) return []
  return workOrdersOnBomVersion(record.value.id, props.version)
    .map(w => ({ id: w.id, number: w.number, createdAt: w.createdAt, product: catalogProduct(bomForWorkOrder(w)?.finishedGoodId ?? '')?.name ?? '—' }))
    .sort((a, z) => (z.createdAt ?? '').localeCompare(a.createdAt ?? '') || z.number.localeCompare(a.number))
})
</script>

<template>
  <ErpDrawer :is-open="isOpen && !!record" :title="t('Work orders')" width="720px" @close="emit('close')">
    <template #body>
      <div v-if="record" class="bvw-body" data-devchange="bom-version-wo-drawer">
        <div class="bvw-info">
          <ContentList horizontal :label="t('BOM name')" :value="record.name" />
          <ContentList horizontal :label="t('BOM no.')" :value="record.number" />
          <ContentList horizontal :label="t('Version')" :value="`v${version}`" />
        </div>
        <table class="bvw-table">
          <thead>
            <tr><th>{{ t('Work order number') }}</th><th>{{ t('Product') }}</th><th>{{ t('Creation date') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td><span class="bvw-link" role="link" tabindex="0" @click="emit('openWorkOrder', r.id)" @keydown.enter="emit('openWorkOrder', r.id)">{{ r.number }}</span></td>
              <td>{{ r.product }}</td>
              <td>{{ formatDate(r.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template #footer>
      <span />
      <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Close') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
/* ErpDrawer's width prop goes through runtime css(), which this build doesn't generate — hold the body at the intended width. */
.bvw-body { width: min(var(--mp-sizes-3xl, 43rem), calc(100vw - var(--mp-sizes-18, 4.5rem))); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.bvw-info { display: flex; flex-direction: column; }
/* Hand-rolled read-only table matched to the ERP table metrics (rule/table-header-uppercase,
   rule/table-header-height, rule/table-cell-padding-align, rule/table-cell-text-plain). */
.bvw-table { width: 100%; border-collapse: collapse; background: var(--mp-background-stage, #ffffff); }
.bvw-table th {
  height: var(--mp-sizes-7); padding: var(--mp-spacing-1) var(--mp-spacing-2); text-align: left; white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-colors-text-secondary); background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.bvw-table td {
  padding: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); vertical-align: middle;
}
.bvw-link { color: var(--mp-text-link); cursor: pointer; }
.bvw-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
