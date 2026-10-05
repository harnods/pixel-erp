<script setup lang="ts">
/** Dashboard › Custom dashboard / Mekari Insight — not built in this prototype. */
import { MpIcon } from '@mekari/pixel3'

const { t } = useLocale()
</script>

<template>
  <div class="dnp">
    <div class="dnp__card">
      <MpIcon name="dashboard" size="lg" class="dnp__icon" />
      <p class="dnp__title">{{ t('Not in this prototype') }}</p>
    </div>
  </div>
</template>

<style scoped>
.dnp { display: flex; align-items: center; justify-content: center; min-height: 320px; }
.dnp__card { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); }
.dnp__icon { color: var(--mp-colors-icon-default); }
.dnp__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
