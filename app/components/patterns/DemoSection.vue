<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { MpTooltip } from '@mekari/pixel3'
import { ruleMeaning } from '~/data/pixelRules'

defineProps<{
  /** Section heading, e.g. "Variants", "Sizes", "With icon" */
  title: string
  /** Description / when-this-applies sentence under the heading */
  desc?: string
  /** rule/* IDs governing this specific aspect */
  rules?: string[]
  /** Code shown under "Show code" (for AI agents) */
  code?: string
}>()

// Per-section error boundary: a broken example shows red, page survives.
const err = ref(false)
const errMsg = ref('')
onErrorCaptured((e) => {
  err.value = true
  errMsg.value = (e as Error)?.message ?? String(e)
  return false
})
</script>

<template>
  <section class="ds">
    <h2 class="ds__title">{{ title }}</h2>
    <p v-if="desc" class="ds__desc">{{ desc }}</p>
    <div v-if="rules && rules.length" class="ds__rules">
      <MpTooltip v-for="r in rules" :key="r" :label="ruleMeaning(r)">
        <span class="ds__rule">{{ r }}</span>
      </MpTooltip>
    </div>

    <div class="ds__panel">
      <div class="ds__preview" :class="{ 'ds__preview--err': err }">
        <template v-if="!err"><slot /></template>
        <div v-else class="ds__err">
          <strong>⚠ render failed</strong>
          <span>{{ errMsg }}</span>
        </div>
      </div>
      <details v-if="code" class="ds__code">
        <summary><span class="ds__chev">›</span> Show code</summary>
        <pre><code>{{ code }}</code></pre>
      </details>
    </div>
  </section>
</template>

<style scoped>
.ds {
  /* 40px gap between sections, divider centered (20px above + 20px below) */
  margin-top: var(--mp-spacing-5, 20px);
  padding-top: var(--mp-spacing-5, 20px);
  border-top: 1px solid var(--mp-border-subtle, #e5e7e7);
}
.ds:first-child { margin-top: 0; }
.ds__title { font-size: var(--mp-font-sizes-xl, 1.5rem); font-weight: var(--mp-font-weights-semi-bold); }
.ds__desc {
  margin-top: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  line-height: 1.6;
  max-width: 44rem;
}
.ds__rules { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
.ds__rule {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-text-link, #0a6e4e);
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px);
}
.ds__panel {
  margin-top: var(--mp-spacing-5);
  border: 1px solid var(--mp-border-subtle, #e5e7e7);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
  background: var(--mp-background-neutral, #fff);
}
.ds__preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-6);
  min-height: var(--mp-spacing-9);
}
.ds__preview--err { background: var(--mp-background-critical-subtle, #fdeff0); }
.ds__err { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ds__err strong { color: var(--mp-text-critical, #c8102e); font-size: var(--mp-font-sizes-sm); }
.ds__err span { font-size: var(--mp-font-sizes-xs, 0.6875rem); color: var(--mp-text-secondary); font-family: var(--mp-font-families-mono, monospace); }
.ds__code { border-top: 1px solid var(--mp-border-subtle, #e5e7e7); }
.ds__code summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.ds__code summary::-webkit-details-marker { display: none; }
.ds__chev { display: inline-block; transition: transform 0.15s ease; font-size: var(--mp-font-sizes-md); }
.ds__code[open] .ds__chev { transform: rotate(90deg); }
.ds__code pre {
  margin: 0;
  padding: var(--mp-spacing-4) var(--mp-spacing-6) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  border-top: 1px solid var(--mp-border-subtle, #e5e7e7);
  overflow-x: auto;
}
.ds__code code { font-family: var(--mp-font-families-mono, monospace); white-space: pre; font-size: var(--mp-font-sizes-xs, 0.6875rem); line-height: 1.6; }
</style>
