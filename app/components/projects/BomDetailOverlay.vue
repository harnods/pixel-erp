<script setup lang="ts">
/**
 * Custom BOM detail (Stories 19, 23, §8): the copy's origin statement, a
 * non-blocking "master has changed" notice, and the immutable version history
 * with revert (revert appends a new version — history is never overwritten).
 */
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpTextlink } from '@mekari/pixel3'
import PmOverlay from './PmOverlay.vue'
import PmActionError from './PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { getCustomBom, currentVersion, masterBoms, masterDiverged, bomUnitCost, diffComponents } from '~/data/projectBoms'
import { revertBom } from '~/data/projectActions'
import { rp, num } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ open: boolean; bomId?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()
const { asActor } = useProjectRole()
const action = useProjectAction()

const bom = computed(() => getCustomBom(props.bomId))
const viewVersion = ref<number | null>(null)
watch(() => props.bomId, () => { viewVersion.value = null; action.clear() })
const shown = computed(() => {
  const b = bom.value
  if (!b) return undefined
  return b.versions.find(v => v.version === viewVersion.value) ?? currentVersion(b)
})
const master = computed(() => masterBoms.find(m => m.id === bom.value?.masterBomId))
const compare = ref(false)
const compareRows = computed(() => (bom.value && master.value ? diffComponents(currentVersion(bom.value).components, master.value.components).filter(r => r.change !== 'same') : []))
const SOURCE = { copy: { type: 'announcement', label: 'Copy' }, eco: { type: 'information', label: 'Engineering change' }, revert: { type: 'warning', label: 'Revert' } } as const

function doRevert(v: number) {
  if (!bom.value) return
  if (action.run(revertBom(bom.value.id, v, asActor.value))) viewVersion.value = null
}
</script>

<template>
  <PmOverlay id="pm-bom-detail" :open="open && !!bom" :title="bom?.name ?? ''" :subtitle="bom ? `${t('Custom BOM')} · v${currentVersion(bom).version}` : ''" wide @close="emit('close')">
    <template v-if="bom && shown">
      <MpBanner id="bom-origin" variant="info">
        <MpBannerIcon />
        <MpBannerDescription>
          {{ t('Copied from') }} <strong>{{ bom.masterName }}</strong><template v-if="master?.archived"> ({{ t('archived') }})</template> {{ t('on') }} {{ formatDate(bom.copiedAt) }}.
          {{ t('Later changes to the master do not affect this copy.') }}
        </MpBannerDescription>
      </MpBanner>

      <MpBanner v-if="masterDiverged(bom)" id="bom-master-changed" variant="info">
        <MpBannerIcon />
        <MpBannerTitle>{{ t('The master has changed since this copy') }}</MpBannerTitle>
        <MpBannerDescription>
          {{ t('Master is now v') }}{{ master?.version }}, {{ t('this copy was taken from v') }}{{ bom.masterVersionAtCopy }}. {{ t('This is informational — nothing changes on the project unless you raise an engineering change.') }}
          <MpTextlink id="bom-compare-toggle" as="a" @click.prevent="compare = !compare">{{ compare ? t('Hide comparison') : t('Compare with master') }}</MpTextlink>
        </MpBannerDescription>
      </MpBanner>
      <div v-if="compare && masterDiverged(bom)" class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Component') }}</th><th>{{ t('Change') }}</th><th class="pm-num">{{ t('This copy') }}</th><th class="pm-num">{{ t('Master') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in compareRows" :key="r.name"><td>{{ r.name }}</td><td>{{ r.change === 'added' ? t('Only in master') : r.change === 'removed' ? t('Only in copy') : t('Different') }}</td><td class="pm-num">{{ r.fromQty !== undefined ? `${num(r.fromQty)} ${r.unit}` : '—' }}</td><td class="pm-num">{{ r.toQty !== undefined ? `${num(r.toQty)} ${r.unit}` : '—' }}</td></tr>
            <tr v-if="!compareRows.length"><td colspan="4" class="pm-muted">{{ t('Components are the same; costs or production steps differ.') }}</td></tr>
          </tbody>
        </table>
      </div>

      <MpBanner v-if="bom.archived" id="bom-archived" variant="warning">
        <MpBannerIcon />
        <MpBannerDescription>{{ t('Archived on') }} {{ formatDate(bom.archived.at) }} — {{ bom.archived.reason }}</MpBannerDescription>
      </MpBanner>

      <div class="pm-row">
        <h3 class="pm-h3">{{ t('Version') }} v{{ shown.version }}</h3>
        <ErpStatusBadge :status="shown.source" :type="SOURCE[shown.source].type" :label="shown.source === 'eco' && shown.refNo ? shown.refNo : t(SOURCE[shown.source].label)" />
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
        <h3 class="pm-h3 pm-mb-2">{{ t('Version history') }}</h3>
        <PmActionError id="bom-revert-error" :error="action.error.value" />
        <div class="pm-timeline">
          <div v-for="v in [...bom.versions].reverse()" :key="v.version" class="pm-tl-item pm-tl-item--compact">
            <div class="pm-tl-date">{{ formatDate(v.createdAt) }}</div>
            <span class="pm-tl-dot" :class="{ 'pm-tl-dot--muted': v.version !== currentVersion(bom).version }" />
            <div>
              <div class="pm-tl-summary"><strong>v{{ v.version }}</strong> — {{ v.note }}</div>
              <div class="pm-tl-meta">
                <span>{{ v.createdBy }}</span>
                <MpTextlink v-if="viewVersion !== v.version" :id="`bom-view-v${v.version}`" as="a" @click.prevent="viewVersion = v.version">{{ t('View') }}</MpTextlink>
                <MpTextlink v-if="v.version !== currentVersion(bom).version" :id="`bom-revert-v${v.version}`" as="a" @click.prevent="doRevert(v.version)">{{ t('Revert to this version') }}</MpTextlink>
                <ErpStatusBadge v-if="v.version === currentVersion(bom).version" v-bind="badgeProps('flag', 'current', t)" />
              </div>
            </div>
          </div>
        </div>
        <p class="pm-caption">{{ t('Versions are immutable. Revert saves the earlier content as a new version.') }}</p>
      </div>
    </template>
  </PmOverlay>
</template>
