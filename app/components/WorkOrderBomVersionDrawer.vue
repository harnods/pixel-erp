<script setup lang="ts">
/**
 * What changed between the BOM version a work order is pinned to and the BOM's
 * Active version — opened by the neutral "vN available" indicator on the work
 * order (V-06). Cumulative across every hop (v1 → v3 shows v1 vs v3), with the
 * per-unit cost delta. Information only: the work order keeps its pin; only new
 * work orders use the Active version. Also used for a sub-BOM level of the WO.
 */
import { MpBanner, MpBannerIcon, MpBannerDescription, MpButton } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import BomVersionDiff from '~/components/BomVersionDiff.vue'
import { billOfMaterials, bomVersionContent } from '~/data/billOfMaterials'
import { formatDateLong as formatDate } from '~/utils/date'

const props = defineProps<{ isOpen: boolean; bomId?: string; fromVersion?: number; woNumber?: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

const record = computed(() => billOfMaterials.find(b => b.id === props.bomId))
const from = computed(() => (record.value ? bomVersionContent(record.value, props.fromVersion) : undefined))
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="record ? `${record.name} · v${fromVersion} → v${record.version}` : ''" width="720px" @close="emit('close')">
    <template #body>
      <div v-if="record && from" class="wbv-body" data-devchange="wo-drift-diff">
        <MpBanner id="wbv-info" variant="info">
          <MpBannerIcon />
          <MpBannerDescription>
            {{ woNumber }} {{ t('keeps building') }} v{{ fromVersion }}. v{{ record.version }} {{ t('is Active since') }} {{ formatDate(record.versionCreatedAt) }} — {{ t('only work orders created from now on use it.') }}
          </MpBannerDescription>
        </MpBanner>
        <p v-if="record.versionNote" class="wbv-note">v{{ record.version }} · {{ record.versionCreatedBy }}: {{ record.versionNote }}</p>
        <BomVersionDiff :from="from" :to="record" :from-label="`v${fromVersion}`" :to-label="`v${record.version}`" />
      </div>
      <MpBanner v-else id="wbv-error" variant="danger">
        <MpBannerIcon />
        <MpBannerDescription>{{ t('This version could not be loaded — please retry.') }}</MpBannerDescription>
      </MpBanner>
    </template>
    <template #footer>
      <span />
      <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Close') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.wbv-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.wbv-note { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); }
</style>
