<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

defineProps<{
  /** Anchor id for sidebar navigation */
  id?: string
  /** Component / demo title */
  title: string
  /** Tag(s) shown as a code chip, e.g. "MpButton" */
  tag?: string
  /** rule/* IDs that govern this component in the ERP */
  rules?: string[]
  /** Short note about the Enterprise override, if any */
  override?: string
  /** Correct-usage snippet shown under "For AI agents" */
  snippet?: string
}>()

// Error boundary: if a demo child throws while rendering, show a failure card
// instead of blanking the whole page. This is the audit signal — a red card means
// this component is rendered wrong.
const err = ref(false)
const errMsg = ref('')
onErrorCaptured((e) => {
  err.value = true
  errMsg.value = (e as Error)?.message ?? String(e)
  return false
})
</script>

<template>
  <section :id="id" class="demo">
    <div class="demo__head">
      <h3 class="demo__title">{{ title }}</h3>
      <code v-if="tag" class="demo__tag">{{ tag }}</code>
      <span v-if="override" class="demo__ovr">Enterprise override</span>
    </div>
    <p v-if="override" class="demo__note">{{ override }}</p>

    <div class="demo__stage" :class="{ 'demo__stage--err': err }">
      <template v-if="!err"><slot /></template>
      <div v-else class="demo__err">
        <strong>⚠ render failed</strong>
        <span>{{ errMsg }}</span>
      </div>
    </div>

    <div v-if="rules && rules.length" class="demo__rules">
      <span v-for="r in rules" :key="r" class="demo__rule">{{ r }}</span>
    </div>

    <details v-if="snippet" class="demo__code">
      <summary>For AI agents — correct usage</summary>
      <pre><code>{{ snippet }}</code></pre>
    </details>
  </section>
</template>

<style scoped>
.demo {
  scroll-margin-top: var(--mp-spacing-6);
  border: 1px solid var(--mp-border-subtle, #e5e7e7);
  border-radius: var(--mp-radii-lg, 12px);
  background: var(--mp-background-neutral, #ffffff);
  padding: var(--mp-spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
}
.demo__head { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.demo__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.demo__tag {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px);
}
.demo__ovr {
  margin-left: auto;
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-warning, #8a5a00);
  background: var(--mp-background-warning-subtle, #fdf4e3);
  border: 1px solid var(--mp-border-warning, #e3b667);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-full, 999px);
}
.demo__note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: 1.5; }
.demo__stage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mp-spacing-3);
  min-height: var(--mp-spacing-9);
  padding: var(--mp-spacing-4);
  border: 1px dashed var(--mp-border-subtle, #e5e7e7);
  border-radius: var(--mp-radii-md, 8px);
  background: var(--mp-background-stage, #ffffff);
}
.demo__stage--err {
  border-style: solid;
  border-color: var(--mp-border-critical, #e0868f);
  background: var(--mp-background-critical-subtle, #fdeff0);
}
.demo__err { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.demo__err strong { color: var(--mp-text-critical, #c8102e); font-size: var(--mp-font-sizes-sm); }
.demo__err span { font-size: var(--mp-font-sizes-xs, 0.6875rem); color: var(--mp-text-secondary); font-family: var(--mp-font-families-mono, monospace); }
.demo__rules { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.demo__rule {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-text-link, #0a6e4e);
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px);
}
.demo__code { font-size: var(--mp-font-sizes-sm); }
.demo__code summary { cursor: pointer; color: var(--mp-text-secondary); }
.demo__code pre {
  margin-top: var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  border: 1px solid var(--mp-border-subtle, #e5e7e7);
  border-radius: var(--mp-radii-md, 8px);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  overflow-x: auto;
}
.demo__code code { font-family: var(--mp-font-families-mono, monospace); white-space: pre; font-size: var(--mp-font-sizes-xs, 0.6875rem); line-height: 1.6; }
</style>
