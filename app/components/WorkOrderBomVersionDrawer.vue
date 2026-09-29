<script setup lang="ts">
/**
 * What changed between the BOM version a work order is pinned to and the BOM's
 * Active version — opened by the neutral "vN available" indicator on the work
 * order (regular BOM versioning). Information only: the work order keeps its
 * version; only new work orders use the Active one.
 */
import { MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { billOfMaterials, bomVersionContent, catalogProduct } from '~/data/billOfMaterials'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'

const props = defineProps<{ isOpen: boolean; bomId?: string; fromVersion?: number; woNumber?: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

const record = computed(() => billOfMaterials.find(b => b.id === props.bomId))
const from = computed(() => (record.value ? bomVersionContent(record.value, props.fromVersion) : undefined))
const to = computed(() => record.value)

type Change = 'added' | 'removed' | 'changed' | 'same'
const CHANGE: Record<Change, { type: 'completed' | 'critical' | 'warning' | 'announcement'; label: string }> = {
  added: { type: 'completed', label: 'Added' },
  removed: { type: 'critical', label: 'Removed' },
  changed: { type: 'warning', label: 'Changed' },
  same: { type: 'announcement', label: 'Unchanged' },
}
const rows = computed(() => {
  if (!from.value || !to.value) return []
  const ids = [...new Set([...from.value.rawMaterials.map(r => r.productId), ...to.value.rawMaterials.map(r => r.productId)])]
  return ids.map(id => {
    const a = from.value!.rawMaterials.find(r => r.productId === id)
    const b = to.value!.rawMaterials.find(r => r.productId === id)
    const costA = a ? a.needed * a.purchaseCost : 0
    const costB = b ? b.needed * b.purchaseCost : 0
    const change: Change = !a ? 'added' : !b ? 'removed' : (a.needed !== b.needed || a.purchaseCost !== b.purchaseCost) ? 'changed' : 'same'
    return { id, name: catalogProduct(id)?.name ?? id, unit: (b ?? a)!.unit, fromQty: a?.needed, toQty: b?.needed, delta: costB - costA, change }
  })
})
const sum = (c?: { productionCost: { amount: number }[]; routing: { amount: number }[] }) => (c ? c.productionCost.reduce((s, x) => s + x.amount, 0) + c.routing.reduce((s, x) => s + x.amount, 0) : 0)
const conversionDelta = computed(() => sum(to.value) - sum(from.value))
const totalDelta = computed(() => rows.value.reduce((s, r) => s + r.delta, 0) + conversionDelta.value)
const signed = (n: number) => (n > 0 ? `+${formatIDR(n)}` : n < 0 ? `−${formatIDR(Math.abs(n))}` : '—')
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="record ? `${t('What changed in')} v${record.version}` : ''" width="720px" @close="emit('close')">
    <template #body>
      <div v-if="record && from" class="wbv-body">
        <MpBanner id="wbv-info" variant="info">
          <MpBannerIcon />
          <MpBannerDescription>
            {{ woNumber }} {{ t('keeps building') }} v{{ fromVersion }}. v{{ record.version }} {{ t('is Active since') }} {{ formatDate(record.versionCreatedAt) }} — {{ t('only work orders created from now on use it.') }}
          </MpBannerDescription>
        </MpBanner>
        <p v-if="record.versionNote" class="wbv-note">v{{ record.version }} · {{ record.versionCreatedBy }}: {{ record.versionNote }}</p>
        <table class="wbv-table">
          <thead>
            <tr>
              <th>{{ t('Raw material') }}</th><th>{{ t('Change') }}</th>
              <th class="wbv-num">{{ t('Needed qty') }}</th><th class="wbv-num">{{ t('Estimated cost delta') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" :class="{ 'wbv-muted': r.change === 'same' }">
              <td>{{ r.name }}</td>
              <td><ErpStatusBadge :status="r.change" :type="CHANGE[r.change].type" :label="t(CHANGE[r.change].label)" /></td>
              <td class="wbv-num">
                <template v-if="r.change === 'changed' && r.fromQty !== r.toQty">{{ r.fromQty }} → {{ r.toQty }}</template>
                <template v-else>{{ r.toQty ?? r.fromQty }}</template> {{ r.unit }}
              </td>
              <td class="wbv-num">{{ signed(r.delta) }}</td>
            </tr>
            <tr v-if="conversionDelta">
              <td colspan="3">{{ t('Production cost and routing') }}</td>
              <td class="wbv-num">{{ signed(conversionDelta) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td colspan="3">{{ t('Estimated cost delta per batch') }}</td><td class="wbv-num">{{ signed(totalDelta) }}</td></tr>
          </tfoot>
        </table>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.wbv-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.wbv-note { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); }
.wbv-table { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-md); }
.wbv-table th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-secondary); text-transform: uppercase; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.wbv-table td { padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); vertical-align: top; }
.wbv-table tfoot td { font-weight: var(--mp-font-weights-semi-bold); border-bottom: none; }
.wbv-num { text-align: right !important; white-space: nowrap; }
.wbv-muted td { color: var(--mp-colors-text-secondary); }
</style>
