<script setup lang="ts">
/**
 * Newer-version indicator (PRD v6.2 Story 9): shown wherever a work order is pinned
 * to a version that is no longer Active. Neutral — it never blocks, never moves a
 * pin, and its only action is opening the diff. Hidden on completed / cancelled work
 * orders (their as-built record is final).
 */
import { MpIcon } from '@mekari/pixel3'
import BomVersionDiffDrawer from './BomVersionDiffDrawer.vue'
import { getCustomBom, currentVersion } from '~/data/projectBoms'
import type { ProjectWoStatus } from '~/data/projectTransactions'

const props = defineProps<{ bomId?: string; version?: number; status: ProjectWoStatus; woNumber?: string; id?: string }>()
const { t } = useLocale()

const active = computed(() => {
  const b = getCustomBom(props.bomId)
  return b ? currentVersion(b).version : undefined
})
const show = computed(() => props.version !== undefined && active.value !== undefined && props.version < active.value && props.status !== 'Completed' && props.status !== 'Cancelled')
const open = ref(false)
</script>

<template>
  <template v-if="show">
    <span
      :id="id" class="pm-version-hint" role="button" tabindex="0" data-devchange="eco-newer-version-hint"
      :aria-label="`v${active} ${t('available')} — ${t('view what changed')}`"
      @click.stop="open = true" @keydown.enter="open = true"
    ><MpIcon name="info" size="sm" />v{{ active }} {{ t('available') }}</span>
    <BomVersionDiffDrawer :open="open" :bom-id="bomId" :from-version="version" :to-version="active" :wo-number="woNumber" @close="open = false" />
  </template>
</template>
