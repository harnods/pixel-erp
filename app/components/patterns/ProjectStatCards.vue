<script setup lang="ts">
/**
 * ProjectStatCards — the four-up figure strip above Project accounting content.
 *
 * Shared by the portfolio index and the engagement detail page, whose stats change
 * per tab. Surfaces are separated by a 1px border, never a drop-shadow (DESIGN.md).
 */
export interface ProjectStat {
  key: string
  label: string
  value: string
  sub?: string
  /** Renders the figure in the danger colour — over budget, overdue, unbilled. */
  tone?: 'default' | 'adverse' | 'positive' | 'muted'
}

defineProps<{ stats: ProjectStat[] }>()
</script>

<template>
  <div class="psc-grid">
    <div v-for="s in stats" :key="s.key" class="psc-card">
      <div class="psc-label">{{ s.label }}</div>
      <div class="psc-value" :data-tone="s.tone ?? 'default'">{{ s.value }}</div>
      <div v-if="s.sub" class="psc-sub">{{ s.sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.psc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--mp-spacing-3); }
.psc-card {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  background: var(--mp-background-neutral); padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.psc-label {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-1\.5, 6px);
}
.psc-value {
  font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.psc-value[data-tone='adverse'] { color: var(--mp-text-danger, #a8352d); }
.psc-value[data-tone='positive'] { color: var(--mp-text-success, #028454); }
.psc-value[data-tone='muted'] { color: var(--mp-text-secondary); }
.psc-sub { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); margin-top: 2px; }
</style>
