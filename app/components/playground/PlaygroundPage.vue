<script setup lang="ts">
/**
 * PlaygroundPage — interactive sandbox for ERP pattern components.
 * Accessible at /playground (registered in pageRegistry, not in the sidebar).
 *
 * One tab per pattern; each tab pairs a live preview with a control panel
 * that toggles the component's props.
 */
import TablePlayground from './TablePlayground.vue'
import FilterBarPlayground from './FilterBarPlayground.vue'
import PaginationPlayground from './PaginationPlayground.vue'
import StatusBadgePlayground from './StatusBadgePlayground.vue'

const tabs = [
  { key: 'table',      label: 'Table',        comp: TablePlayground },
  { key: 'filterbar',  label: 'Filter Bar',   comp: FilterBarPlayground },
  { key: 'pagination', label: 'Pagination',   comp: PaginationPlayground },
  { key: 'badge',      label: 'Status Badge', comp: StatusBadgePlayground },
] as const

const active = ref<(typeof tabs)[number]['key']>('table')
const current = computed(() => tabs.find(t => t.key === active.value)!.comp)
</script>

<template>
  <div class="pg">
    <div class="pg-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="pg-tab"
        :class="{ 'pg-tab--active': active === t.key }"
        @click="active = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <component :is="current" />
  </div>
</template>

<style scoped>
.pg {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}

.pg-tabs {
  display: flex;
  gap: var(--mp-spacing-1);
  border-bottom: 1px solid var(--mp-border-default);
}

.pg-tab {
  appearance: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.pg-tab:hover { color: var(--mp-text-default); }
.pg-tab--active {
  color: var(--mp-text-default);
  border-bottom-color: var(--mp-text-default);
  font-weight: var(--mp-font-weights-semi-bold);
}
</style>
