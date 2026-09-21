<script setup lang="ts">
/**
 * LineBudgetPlayground — drives LineBudgetCounter (Stock Adjustment's pooled
 * 10,000-line budget) with a fake `used` count, so the show/hide threshold and
 * the at-cap blocking state can be checked without filling in thousands of
 * real Product/Batch lines.
 */
import LineBudgetCounter from '~/components/patterns/LineBudgetCounter.vue'
import { STOCK_ADJUSTMENT_LINE_CAP, STOCK_ADJUSTMENT_COUNTER_SHOW_FROM } from '~/utils/stockAdjustmentLimits'

const used = ref(30)

const CASES = [
  { key: 'below', label: '1. Below 2,000 — counter hidden', used: 30 },
  { key: 'at', label: '2. Reaches 2,000 and beyond — counter shows', used: 2000 },
  { key: 'back', label: '3. Crosses back below 2,000 — hides again', used: 1500 },
  { key: 'over', label: '4. Beyond 10,000 — blocked', used: 10500 },
] as const

const atLineCap = computed(() => used.value >= STOCK_ADJUSTMENT_LINE_CAP)
const isVisible = computed(() => used.value >= STOCK_ADJUSTMENT_COUNTER_SHOW_FROM)
const stateLabel = computed(() => {
  if (!isVisible.value) return 'Counter hidden'
  if (atLineCap.value) return 'Counter visible — blocked'
  return 'Counter visible'
})
</script>

<template>
  <div class="pg-grid">
    <aside class="panel">
      <p class="panel-title">Scenario</p>

      <div class="preset-list">
        <button
          v-for="c in CASES"
          :key="c.key"
          class="preset-btn"
          :class="{ 'preset-btn--active': used === c.used }"
          type="button"
          @click="used = c.used"
        >
          {{ c.label }}
        </button>
      </div>

      <label class="ctrl ctrl--col">
        <span>Used lines: <strong>{{ used.toLocaleString('id-ID') }}</strong> / {{ STOCK_ADJUSTMENT_LINE_CAP.toLocaleString('id-ID') }}</span>
        <input type="range" min="0" max="11000" step="10" v-model.number="used" />
      </label>

      <p class="panel-note">
        Counter appears once <code>used &gt;= {{ STOCK_ADJUSTMENT_COUNTER_SHOW_FROM.toLocaleString('id-ID') }}</code>
        (<code>STOCK_ADJUSTMENT_COUNTER_SHOW_FROM</code> in <code>stockAdjustmentLimits.ts</code>),
        and Product/Batch additions block once <code>used &gt;= {{ STOCK_ADJUSTMENT_LINE_CAP.toLocaleString('id-ID') }}</code>.
      </p>
    </aside>

    <section class="preview">
      <div class="mock-toolbar">
        <h2 class="mock-wh-name">Gudang Jakarta Pusat</h2>
        <LineBudgetCounter :used="used" :cap="STOCK_ADJUSTMENT_LINE_CAP" :show-from="STOCK_ADJUSTMENT_COUNTER_SHOW_FROM" />
      </div>
      <button class="mock-select-btn" type="button" :disabled="atLineCap">
        + Select product
      </button>
      <p v-if="atLineCap" class="mock-limit-msg">Maximum 10.000 lines reached. Remove a product or batch to add more.</p>
      <p class="state-label">State: <strong>{{ stateLabel }}</strong></p>
    </section>
  </div>
</template>

<style scoped>
.pg-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: var(--mp-spacing-5);
  align-items: start;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.panel-title {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  color: var(--mp-text-subtle);
}
.preset-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.preset-btn {
  text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  cursor: pointer;
}
.preset-btn:hover { background: var(--mp-background-neutral-hovered); }
.preset-btn--active { border-color: var(--mp-border-bold); font-weight: var(--mp-font-weights-semi-bold); }
.ctrl--col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.panel-note {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}
.panel-note code {
  font-family: monospace;
  background: var(--mp-background-neutral);
  padding: 0 var(--mp-spacing-1);
  border-radius: var(--mp-radii-sm);
}
.preview {
  min-width: 0;
  padding: var(--mp-spacing-5);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.mock-toolbar { display: flex; align-items: center; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
.mock-wh-name { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mock-select-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-default);
}
.mock-select-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.mock-limit-msg { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
.state-label { margin: var(--mp-spacing-4) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
