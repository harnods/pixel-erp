<script setup lang="ts">
/**
 * ProjectStatCards — the Project accounting figure band (index and project pages).
 *
 * Same markup as every house index page's stats band (BillsIndexPage →
 * `.stats-section` / `.stat-card--bordered` / `.stat-title` / `.stat-period` /
 * `.stat-amount` / `.stat-link`): divider-separated columns sitting on the stage,
 * caption ABOVE the figure, an optional drill-down link under it.
 */
export interface ProjectStat {
  key: string
  label: string
  value: string
  /** Caption shown above the figure (basis, as-of, or what the figure blocks). */
  sub?: string
  /** Figure colour: adverse = danger, positive = success, muted = secondary. */
  tone?: 'default' | 'adverse' | 'positive' | 'muted'
  /** Optional drill-down link under the figure; clicking emits `link` with the key. */
  link?: string
}

defineProps<{ stats: ProjectStat[] }>()
defineEmits<{ link: [key: string] }>()
</script>

<template>
  <div class="stats-section">
    <div
      v-for="(s, i) in stats"
      :key="s.key"
      class="stat-card"
      :class="{ 'stat-card--bordered': i < stats.length - 1 }"
      :data-stat="s.key"
    >
      <div class="stat-title">{{ s.label }}</div>
      <div v-if="s.sub" class="stat-period">{{ s.sub }}</div>
      <div class="stat-amount" :data-tone="s.tone ?? 'default'">{{ s.value }}</div>
      <a v-if="s.link" class="stat-link" @click="$emit('link', s.key)">{{ s.link }}</a>
    </div>
  </div>
</template>

<style scoped>
/* Copied from BillsIndexPage's stats band so index and project pages match it. */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  align-self: stretch;
}
.stat-card:last-child { padding-right: 0; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stat-period {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl);
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.stat-amount[data-tone='adverse'] { color: var(--mp-text-danger); }
.stat-amount[data-tone='positive'] { color: var(--mp-colors-text-success); }
.stat-amount[data-tone='muted'] { color: var(--mp-text-secondary); }
.stat-link {
  display: inline-flex; align-self: flex-start;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
  text-decoration: none; cursor: pointer;
  padding: 0 var(--mp-spacing-0\.5);
}
.stat-link:hover { text-decoration: underline; }

@media (max-width: 640px) {
  .stats-section { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stat-card { flex: 0 0 auto; }
}
</style>
