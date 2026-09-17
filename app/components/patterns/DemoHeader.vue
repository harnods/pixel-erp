<script setup lang="ts">
import { MpTooltip } from '@mekari/pixel3'
import { ruleMeaning } from '~/data/pixelRules'

defineProps<{
  title: string
  tag?: string
  /** overview / when-to-use paragraph */
  lead?: string
  /** Enterprise override note */
  override?: string
  /** Mark the component as deprecated (renders a red badge) */
  deprecated?: boolean
  /** rule/* IDs governing this component */
  rules?: string[]
}>()
</script>

<template>
  <header class="dh">
    <div class="dh__row">
      <h1 class="dh__title">{{ title }}</h1>
      <code v-if="tag" class="dh__tag">{{ tag }}</code>
      <span v-if="deprecated" class="dh__deprecated">Deprecated</span>
      <span v-if="override && !deprecated" class="dh__ovr">Enterprise override</span>
    </div>
    <p v-if="lead" class="dh__lead">{{ lead }}</p>
    <div v-if="rules && rules.length" class="dh__rules">
      <MpTooltip v-for="r in rules" :key="r" :label="ruleMeaning(r)">
        <span class="dh__rule">{{ r }}</span>
      </MpTooltip>
    </div>
  </header>
</template>

<style scoped>
.dh { padding-bottom: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-2); }
.dh__row { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.dh__title { font-size: var(--mp-font-sizes-xxl, 2rem); font-weight: var(--mp-font-weights-bold); }
.dh__tag {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px);
}
.dh__ovr {
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-default, #080d0e);
  background: var(--mp-background-warning-subtle, #fdf4e3);
  border: 1px solid var(--mp-colors-border-bold, #8c9596);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-full, 999px);
}
.dh__deprecated {
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #ffffff;
  background: var(--mp-colors-background-danger-bold, #c33e35);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-full, 999px);
}
.dh__lead {
  margin-top: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  line-height: 1.6;
  max-width: 44rem;
}
.dh__rules { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
.dh__rule {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-text-link, #0a6e4e);
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px);
}
</style>
