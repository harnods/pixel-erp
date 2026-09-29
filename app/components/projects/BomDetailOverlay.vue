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
import { getCustomBom, currentVersion, masterBoms, bomUnitCost } from '~/data/projectBoms'
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
