<script setup lang="ts">
/**
 * ECO diff (PRD §8 property 3): components added / removed / changed with per-line
 * and total cost delta. A component without a standard cost is excluded from the
 * total with a warning (OQ25) — never a silent zero.
 */
import { MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
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
const CHANGE = {
  added: { type: 'completed', label: 'Added' },
  removed: { type: 'critical', label: 'Removed' },
  changed: { type: 'warning', label: 'Changed' },
  same: { type: 'announcement', label: 'Unchanged' },
} as const
const tone = (v?: number) => (v === undefined ? 'pm-warn' : v > 0 ? 'pm-neg' : v < 0 ? 'pm-pos' : 'pm-muted')
</script>

<template>
  <div class="pm-stack">
    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead><tr><th>{{ t('Component') }}</th><th>{{ t('Change') }}</th><th class="pm-num">{{ t('Qty per unit') }}</th><th class="pm-num">{{ t('Cost per unit') }}</th><th class="pm-num">{{ t('Delta per unit') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name" :class="{ 'pm-tr-muted': r.change === 'same' }">
            <td>{{ r.name }}</td>
            <td><ErpStatusBadge :status="r.change" :type="CHANGE[r.change].type" :label="t(CHANGE[r.change].label)" /></td>
            <td class="pm-num">
              <template v-if="r.change === 'changed' && r.fromQty !== r.toQty">{{ num(r.fromQty) }} → {{ num(r.toQty) }}</template>
              <template v-else>{{ num(r.toQty ?? r.fromQty) }}</template> {{ r.unit }}
            </td>
            <td class="pm-num">
              <template v-if="r.change === 'changed'">{{ rp(r.fromCost) }} → {{ rp(r.toCost) }}</template>
              <template v-else>{{ rp(r.toCost ?? r.fromCost) }}</template>
            </td>
            <td class="pm-num" :class="tone(r.delta)">{{ r.delta === undefined ? t('No standard cost') : r.delta ? rpSigned(r.delta) : '—' }}</td>
          </tr>
          <tr v-if="prodDelta" class="pm-tr-sub"><td colspan="4">{{ t('Production cost (labour, overhead, other)') }}</td><td class="pm-num" :class="tone(prodDelta)">{{ rpSigned(prodDelta) }}</td></tr>
        </tbody>
        <tfoot>
          <tr><td colspan="4">{{ t('Total delta per unit') }}</td><td class="pm-num" :class="tone(unitDelta)">{{ rpSigned(unitDelta) }}</td></tr>
          <tr v-if="units" data-devchange="pm-eco-affected-units"><td colspan="4">{{ t('Total delta on affected units') }} ({{ units }})</td><td class="pm-num" :class="tone(unitDelta)">{{ rpSigned(unitDelta * units) }}</td></tr>
        </tfoot>
      </table>
    </div>
    <MpBanner v-if="missingStd.length" id="eco-diff-missing-std" variant="warning">
      <MpBannerIcon />
      <MpBannerDescription>{{ missingStd.length }} {{ t('component(s) have no standard cost and are excluded from the total — the real delta may be higher.') }}</MpBannerDescription>
    </MpBanner>
  </div>
</template>
