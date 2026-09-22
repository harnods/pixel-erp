<script setup lang="ts">
/**
 * ECO diff (PRD §8 property 3): components added / removed / changed with
 * per-line and total cost delta. A component without a standard cost is
 * excluded from the total with a warning (OQ25) — never a silent zero.
 */
import { getCustomBom, diffComponents, type BomComponent, type BomProdCost } from '~/data/projectBoms'
import { rp, rpSigned, num } from '~/utils/projectFormat'

const props = defineProps<{ bomId: string; baseVersion: number; proposed: { components: BomComponent[]; productionCost: BomProdCost[] }; units?: number }>()
const { t } = useLocale()

const base = computed(() => getCustomBom(props.bomId)?.versions.find(v => v.version === props.baseVersion))
const rows = computed(() => (base.value ? diffComponents(base.value.components, props.proposed.components) : []))
const prodDelta = computed(() => {
  if (!base.value) return 0
  return props.proposed.productionCost.reduce((s, p) => s + p.perUnit, 0) - base.value.productionCost.reduce((s, p) => s + p.perUnit, 0)
})
const unitDelta = computed(() => rows.value.reduce((s, r) => s + (r.delta ?? 0), 0) + prodDelta.value)
const missingStd = computed(() => rows.value.filter(r => r.noStandardCost && r.change !== 'same'))
const TONE: Record<string, string> = { added: 'pm-pill--green', removed: 'pm-pill--red', changed: 'pm-pill--yellow', same: 'pm-pill--gray' }
const LABEL: Record<string, string> = { added: 'Added', removed: 'Removed', changed: 'Changed', same: 'Unchanged' }
</script>

<template>
  <div class="pm-stack" style="gap: 8px">
    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead><tr><th>{{ t('Component') }}</th><th>{{ t('Change') }}</th><th class="pm-num">{{ t('Qty per unit') }}</th><th class="pm-num">{{ t('Cost per unit') }}</th><th class="pm-num">{{ t('Delta per unit') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name" :style="{ opacity: r.change === 'same' ? 0.6 : 1 }">
            <td>{{ r.name }}</td>
            <td><span class="pm-pill" :class="TONE[r.change]">{{ t(LABEL[r.change]!) }}</span></td>
            <td class="pm-num">
              <template v-if="r.change === 'changed' && r.fromQty !== r.toQty">{{ num(r.fromQty) }} → {{ num(r.toQty) }}</template>
              <template v-else>{{ num(r.toQty ?? r.fromQty) }}</template> {{ r.unit }}
            </td>
            <td class="pm-num">
              <template v-if="r.change === 'changed'">{{ rp(r.fromCost) }} → {{ rp(r.toCost) }}</template>
              <template v-else>{{ rp(r.toCost ?? r.fromCost) }}</template>
            </td>
            <td class="pm-num" :class="r.delta === undefined ? 'pm-warn' : r.delta > 0 ? 'pm-neg' : r.delta < 0 ? 'pm-pos' : 'pm-muted'">
              {{ r.delta === undefined ? t('No standard cost') : r.delta ? rpSigned(r.delta) : '—' }}
            </td>
          </tr>
          <tr v-if="prodDelta" class="pm-tr-sub"><td colspan="4">{{ t('Production cost (labour, overhead, other)') }}</td><td class="pm-num" :class="prodDelta > 0 ? 'pm-neg' : 'pm-pos'">{{ rpSigned(prodDelta) }}</td></tr>
        </tbody>
        <tfoot>
          <tr><td colspan="4">{{ t('Total delta per unit') }}</td><td class="pm-num" :class="unitDelta > 0 ? 'pm-neg' : unitDelta < 0 ? 'pm-pos' : ''">{{ rpSigned(unitDelta) }}</td></tr>
          <tr v-if="units" data-devchange="pm-eco-affected-units"><td colspan="4">{{ t('Total delta on affected units') }} ({{ units }})</td><td class="pm-num" :class="unitDelta > 0 ? 'pm-neg' : unitDelta < 0 ? 'pm-pos' : ''">{{ rpSigned(unitDelta * units) }}</td></tr>
        </tfoot>
      </table>
    </div>
    <div v-if="missingStd.length" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ missingStd.length }} {{ t('component(s) have no standard cost and are excluded from the total — the real delta may be higher.') }}</div></div>
  </div>
</template>
