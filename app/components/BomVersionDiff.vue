<script setup lang="ts">
/**
 * Composition diff between two versions of a regular BOM — raw-material lines
 * (added / removed / changed / unchanged with the qty move) plus production cost +
 * routing, closed by the per-unit cost delta. Shared by the work-order drift
 * drawer and the parent-BOM review drawer, so a "what changed" reads the same
 * everywhere. Δ shows "n/a" when either side has an unpriced line.
 */
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { catalogProduct, bomUnitCost, type BomContent } from '~/data/billOfMaterials'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ from: BomContent; to: BomContent; fromLabel: string; toLabel: string }>()
const { t } = useLocale()

type Change = 'added' | 'removed' | 'changed' | 'same'
const CHANGE: Record<Change, { type: 'completed' | 'critical' | 'information' | 'announcement'; label: string }> = {
  added: { type: 'completed', label: 'Added' },
  removed: { type: 'critical', label: 'Removed' },
  changed: { type: 'information', label: 'Changed' },
  same: { type: 'announcement', label: 'Unchanged' },
}
const rows = computed(() => {
  const ids = [...new Set([...props.from.rawMaterials.map(r => r.productId), ...props.to.rawMaterials.map(r => r.productId)])]
  return ids.map(id => {
    const a = props.from.rawMaterials.find(r => r.productId === id)
    const b = props.to.rawMaterials.find(r => r.productId === id)
    const change: Change = !a ? 'added' : !b ? 'removed' : (a.needed !== b.needed || a.purchaseCost !== b.purchaseCost) ? 'changed' : 'same'
    return { id, name: catalogProduct(id)?.name ?? id, unit: (b ?? a)!.unit, fromQty: a?.needed, toQty: b?.needed, change }
  })
})
const conv = (c: BomContent) => c.productionCost.reduce((s, x) => s + x.amount, 0) + c.routing.reduce((s, x) => s + x.amount, 0)
const conversionChanged = computed(() => conv(props.from) !== conv(props.to))
/** per finished-good unit; undefined = "n/a" */
const unitDelta = computed(() => {
  const a = bomUnitCost(props.from)
  const b = bomUnitCost(props.to)
  return a === undefined || b === undefined ? undefined : Math.round(b - a)
})
const signed = (n?: number) => (n === undefined ? t('n/a') : n > 0 ? `+${formatIDR(n)}` : n < 0 ? `−${formatIDR(Math.abs(n))}` : formatIDR(0))
</script>

<template>
  <table class="bvd-table">
    <thead>
      <tr>
        <th>{{ t('Raw material') }}</th><th>{{ t('Change') }}</th>
        <th class="bvd-num">{{ fromLabel }}</th><th class="bvd-num">{{ toLabel }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id" :class="{ 'bvd-muted': r.change === 'same' }">
        <td>{{ r.name }}</td>
        <td><ErpStatusBadge :status="r.change" :type="CHANGE[r.change].type" :label="t(CHANGE[r.change].label)" /></td>
        <td class="bvd-num">{{ r.fromQty !== undefined ? `${r.fromQty} ${r.unit}` : '—' }}</td>
        <td class="bvd-num">{{ r.toQty !== undefined ? `${r.toQty} ${r.unit}` : '—' }}</td>
      </tr>
      <tr v-if="conversionChanged">
        <td>{{ t('Production cost and routing') }}</td>
        <td><ErpStatusBadge status="changed" type="information" :label="t('Changed')" /></td>
        <td class="bvd-num">{{ formatIDR(conv(from)) }}</td><td class="bvd-num">{{ formatIDR(conv(to)) }}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr><td colspan="3">{{ t('Estimated cost delta per unit') }}</td><td class="bvd-num">Δ {{ signed(unitDelta) }}</td></tr>
    </tfoot>
  </table>
</template>

<style scoped>
.bvd-table { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-md); }
.bvd-table th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-secondary); text-transform: uppercase; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.bvd-table td { padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); vertical-align: middle; }
.bvd-table tfoot td { font-weight: var(--mp-font-weights-semi-bold); border-bottom: none; }
.bvd-num { text-align: right !important; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bvd-muted td { color: var(--mp-colors-text-secondary); }
</style>
