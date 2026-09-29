<script setup lang="ts">
/**
 * "What changed" between two versions of a project BOM — opened by the neutral
 * newer-version indicator (PRD v6.2 Story 9). Information only: opening it never
 * changes a pin, and it carries no action beyond the link to the ECO that
 * published the newer version.
 */
import { MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import PmOverlay from '../PmOverlay.vue'
import EcoDiff from '../EcoDiff.vue'
import { getCustomBom, getVersion } from '~/data/projectBoms'
import { engineeringChanges, ecoPath } from '~/data/projectChanges'
import { formatDate } from '~/utils/date'

const props = defineProps<{ open: boolean; bomId?: string; fromVersion?: number; toVersion?: number; woNumber?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()
const router = useRouter()

const bom = computed(() => getCustomBom(props.bomId))
const to = computed(() => getVersion(bom.value, props.toVersion))
const eco = computed(() => (to.value?.refNo ? engineeringChanges.find(e => e.no === to.value!.refNo) : undefined))
</script>

<template>
  <PmOverlay
    id="pm-version-diff" :open="open && !!bom && !!to" wide
    :title="`${t('What changed in')} v${toVersion}`"
    :subtitle="bom ? `${bom.name} · v${fromVersion} → v${toVersion}` : ''"
    @close="emit('close')"
  >
    <template v-if="bom && to && fromVersion !== undefined">
      <MpBanner id="pm-version-diff-info" variant="info">
        <MpBannerIcon />
        <MpBannerDescription>
          <template v-if="woNumber">{{ woNumber }} {{ t('stays on') }} v{{ fromVersion }} — {{ t('this is information only. It moves to a newer version only if the PM adopts it in an engineering change.') }}</template>
          <template v-else>{{ t('Information only — nothing changes by opening this.') }}</template>
        </MpBannerDescription>
      </MpBanner>
      <p class="pm-body pm-m-0">
        v{{ to.version }} {{ t('published by') }} {{ to.createdBy }} {{ t('on') }} {{ formatDate(to.createdAt) }} — {{ to.note }}
        <template v-if="eco">
          · <span class="pm-link" role="link" tabindex="0" @click="router.push(ecoPath(eco))" @keydown.enter="router.push(ecoPath(eco))">{{ eco.no }}</span>
        </template>
      </p>
      <EcoDiff :bom-id="bom.id" :base-version="fromVersion" :proposed="to" />
    </template>
  </PmOverlay>
</template>
