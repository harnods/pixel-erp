<script setup lang="ts">
import { computed } from 'vue'
import { MpProgress } from '@mekari/pixel3'

const props = defineProps<{
  used: number
  cap: number
  /** Stays hidden below this many used lines — keeps the common small-document
   *  case free of a counter that isn't yet a meaningful signal. Omit to always show. */
  showFrom?: number
}>()
const { t } = useLocale()

const percent = computed(() => props.cap > 0 ? Math.min(100, Math.round((props.used / props.cap) * 100)) : 0)
const isAtCap = computed(() => props.used >= props.cap)
const isNearCap = computed(() => !isAtCap.value && percent.value >= 75)
const color = computed(() => isAtCap.value ? 'negative' : isNearCap.value ? 'warning' : 'information')
const isVisible = computed(() => props.used >= (props.showFrom ?? 0))
</script>

<template>
  <div v-if="isVisible" class="lbc-root">
    <div class="lbc-row">
      <span class="lbc-text" :class="{ 'lbc-text--at-cap': isAtCap }">
        {{ used.toLocaleString('id-ID') }} / {{ cap.toLocaleString('id-ID') }} {{ t('lines used') }}
      </span>
    </div>
    <MpProgress :value="String(percent)" size="sm" :color="color" />
  </div>
</template>

<style scoped>
.lbc-root { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 220px; }
.lbc-row { display: flex; align-items: center; justify-content: space-between; }
.lbc-text { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.lbc-text--at-cap { color: var(--mp-text-danger, #a8352d); font-weight: var(--mp-font-weights-semi-bold); }
</style>
