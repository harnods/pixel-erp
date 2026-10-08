<script setup lang="ts">
/**
 * FormatRequirementsAccordion — collapsible "Format requirements" box shown under
 * a Download-template button on import screens (Figma: Master Pages 3464-4736).
 * Collapsed = a bordered header row with a chevron; expanded reveals a bulleted
 * list of formatting rules plus a "Check the import guide" link. The rules are
 * passed in so each import (chart of accounts, product mapping, …) stays
 * contextual.
 */
import { ref } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'

defineProps<{ requirements: string[] }>()

const { t } = useLocale()
const open = ref(false)
</script>

<template>
  <div class="fmt" :class="{ 'fmt--open': open }">
    <MpButton class="fmt-head" :aria-expanded="open" @click="open = !open">
      <span class="fmt-title">{{ t('Format requirements') }}</span>
      <MpIcon :name="open ? 'chevrons-down' : 'chevrons-right'" size="sm" color="icon.default" />
    </MpButton>

    <div v-if="open" class="fmt-body">
      <ul class="fmt-list">
        <li v-for="(r, i) in requirements" :key="i">{{ r }}</li>
      </ul>
      <p class="fmt-help">
        {{ t('Need help?') }}
        <a class="fmt-link" href="#" @click.prevent>{{ t('Check the import guide') }}</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.fmt {
  width: 100%;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.fmt-head {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: 100% !important;
  padding: var(--mp-spacing-3) var(--mp-spacing-4) !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  min-width: 0 !important;
}
.fmt-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.fmt-body {
  padding: 0 var(--mp-spacing-4) var(--mp-spacing-4);
}
.fmt-list {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.fmt-help {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.fmt-link { color: var(--mp-text-link); text-decoration: none; }
.fmt-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
