<script setup lang="ts">
/**
 * Custom BOM detail (Stories 19, 23, §8): the copy's origin statement, a
 * non-blocking "master has changed" badge, and the immutable version history
 * with revert (revert appends a new version — history is never overwritten).
 */
import PmOverlay from './PmOverlay.vue'
import { getCustomBom, currentVersion, masterBoms, masterDiverged, bomUnitCost, diffComponents } from '~/data/projectBoms'
import { revertBom } from '~/data/projectActions'
import { rp, num } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ open: boolean; bomId?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()
const { asActor } = useProjectRole()

const bom = computed(() => getCustomBom(props.bomId))
const viewVersion = ref<number | null>(null)
watch(() => props.bomId, () => { viewVersion.value = null })
const shown = computed(() => {
  const b = bom.value
  if (!b) return undefined
  return b.versions.find(v => v.version === viewVersion.value) ?? currentVersion(b)
})
const master = computed(() => masterBoms.find(m => m.id === bom.value?.masterBomId))
const compare = ref(false)
const compareRows = computed(() => (bom.value && master.value ? diffComponents(currentVersion(bom.value).components, master.value.components).filter(r => r.change !== 'same') : []))

function doRevert(v: number) {
  if (!bom.value) return
  if (notifyResult(revertBom(bom.value.id, v, asActor.value))) viewVersion.value = null
}
</script>

<template>
  <PmOverlay :open="open && !!bom" :title="bom?.name ?? ''" :subtitle="bom ? `${t('Custom BOM')} · v${currentVersion(bom).version}` : ''" wide @close="emit('close')">
    <template v-if="bom && shown">
      <div class="pm-banner pm-banner--neutral">
        <div class="pm-banner-body">
          {{ t('Copied from') }} <strong>{{ bom.masterName }}</strong><template v-if="master?.archived"> ({{ t('archived') }})</template> {{ t('on') }} {{ formatDate(bom.copiedAt) }}.
          {{ t('Later changes to the master do not affect this copy.') }}
        </div>
      </div>
      <div v-if="masterDiverged(bom)" class="pm-banner pm-banner--info">
        <div class="pm-banner-body">
          <div class="pm-banner-title">{{ t('The master has changed since this copy') }}</div>
          {{ t('Master is now v') }}{{ master?.version }}, {{ t('this copy was taken from v') }}{{ bom.masterVersionAtCopy }}. {{ t('This is informational — nothing changes on the project unless you raise an engineering change.') }}
          <div style="margin-top: 6px"><button class="pm-link" type="button" @click="compare = !compare">{{ compare ? t('Hide comparison') : t('Compare with master') }}</button></div>
          <div v-if="compare" class="pm-table-wrap" style="margin-top: 8px; background: #fff">
            <table class="pm-table">
              <thead><tr><th>{{ t('Component') }}</th><th>{{ t('Change') }}</th><th class="pm-num">{{ t('This copy') }}</th><th class="pm-num">{{ t('Master') }}</th></tr></thead>
              <tbody>
                <tr v-for="r in compareRows" :key="r.name"><td>{{ r.name }}</td><td>{{ r.change === 'added' ? t('Only in master') : r.change === 'removed' ? t('Only in copy') : t('Different') }}</td><td class="pm-num">{{ r.fromQty !== undefined ? `${num(r.fromQty)} ${r.unit}` : '—' }}</td><td class="pm-num">{{ r.toQty !== undefined ? `${num(r.toQty)} ${r.unit}` : '—' }}</td></tr>
                <tr v-if="!compareRows.length"><td colspan="4" class="pm-muted">{{ t('Components are the same; costs or production steps differ.') }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div v-if="bom.archived" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ t('Archived on') }} {{ formatDate(bom.archived.at) }} — {{ bom.archived.reason }}</div></div>

      <div class="pm-row">
        <h3 class="pm-h3">{{ t('Version') }} v{{ shown.version }}</h3>
        <span class="pm-pill" :class="shown.source === 'copy' ? 'pm-pill--gray' : shown.source === 'eco' ? 'pm-pill--blue' : 'pm-pill--yellow'">{{ shown.source === 'copy' ? t('Copy') : shown.source === 'eco' ? shown.refNo : t('Revert') }}</span>
        <span class="pm-spacer" />
        <span class="pm-muted pm-small">{{ t('Unit cost') }} {{ rp(bomUnitCost(shown)) }}</span>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Component') }}</th><th class="pm-num">{{ t('Qty per unit') }}</th><th>{{ t('Unit') }}</th><th class="pm-num">{{ t('Standard cost') }}</th><th class="pm-num">{{ t('Line cost') }}</th></tr></thead>
          <tbody>
            <tr v-for="c in shown.components" :key="c.name"><td>{{ c.name }}</td><td class="pm-num">{{ num(c.qty) }}</td><td>{{ c.unit }}</td><td class="pm-num">{{ c.unitCost !== undefined ? rp(c.unitCost) : t('No standard cost') }}</td><td class="pm-num">{{ rp(c.qty * (c.unitCost ?? 0)) }}</td></tr>
            <tr v-for="p in shown.productionCost" :key="p.name" class="pm-tr-sub"><td>{{ p.name }}</td><td class="pm-num">1</td><td>{{ t(p.kind === 'labor' ? 'Labor' : p.kind === 'overhead' ? 'Overhead' : 'Other') }}</td><td class="pm-num">{{ rp(p.perUnit) }}</td><td class="pm-num">{{ rp(p.perUnit) }}</td></tr>
          </tbody>
        </table>
      </div>

      <div>
        <h3 class="pm-h3" style="margin-bottom: 8px">{{ t('Version history') }}</h3>
        <div class="pm-timeline">
          <div v-for="v in [...bom.versions].reverse()" :key="v.version" class="pm-tl-item" style="grid-template-columns: 110px 16px minmax(0,1fr)">
            <div class="pm-tl-date">{{ formatDate(v.createdAt) }}</div>
            <span class="pm-tl-dot" :style="{ background: v.version === currentVersion(bom).version ? '#029861' : '#aeb7c0' }" />
            <div>
              <div class="pm-tl-summary"><strong>v{{ v.version }}</strong> — {{ v.note }}</div>
              <div class="pm-tl-meta">
                <span>{{ v.createdBy }}</span>
                <button v-if="viewVersion !== v.version" class="pm-link" type="button" @click="viewVersion = v.version">{{ t('View') }}</button>
                <button v-if="v.version !== currentVersion(bom).version" class="pm-link" type="button" @click="doRevert(v.version)">{{ t('Revert to this version') }}</button>
                <span v-if="v.version === currentVersion(bom).version" class="pm-pill pm-pill--green">{{ t('Current') }}</span>
              </div>
            </div>
          </div>
        </div>
        <p class="pm-help" style="margin-top: 8px">{{ t('Versions are immutable. Revert saves the earlier content as a new version.') }}</p>
      </div>
    </template>
  </PmOverlay>
</template>
