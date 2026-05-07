<script setup lang="ts">
import { MpSelect } from '@mekari/pixel3'

const props = withDefaults(defineProps<{
  currentPage: number
  perPage: number
  total: number
}>(), {
  currentPage: 1,
  perPage: 25,
  total: 0,
})

const emit = defineEmits<{
  pageChange: [page: number]
  perPageChange: [perPage: number]
}>()

const perPageOptions = [10, 25, 50, 100]

const totalPages  = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)))
const rangeStart  = computed(() => props.total === 0 ? 0 : (props.currentPage - 1) * props.perPage + 1)
const rangeEnd    = computed(() => Math.min(props.currentPage * props.perPage, props.total))
</script>

<template>
  <div class="erp-pagination">

    <!-- Left: Rows per page + Showing -->
    <div class="pag-left">
      <div class="pag-perpage">
        <span class="pag-label">Rows per page</span>
        <div class="pag-select-wrap">
          <select
            class="pag-select"
            :value="String(perPage)"
            @change="emit('perPageChange', Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="n in perPageOptions" :key="n" :value="String(n)">{{ n }}</option>
          </select>
          <svg class="pag-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <span class="pag-showing">Showing {{ rangeStart }}-{{ rangeEnd }} of {{ total }}</span>
    </div>

    <!-- Right: Page X of Y + nav -->
    <div class="pag-right">
      <span class="pag-label">Page {{ currentPage }} of {{ totalPages }}</span>
      <div class="pag-nav">
        <button
          class="pag-nav-btn"
          :disabled="currentPage <= 1"
          aria-label="Previous page"
          @click="emit('pageChange', currentPage - 1)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class="pag-nav-btn"
          :disabled="currentPage >= totalPages"
          aria-label="Next page"
          @click="emit('pageChange', currentPage + 1)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.erp-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mp-spacing-2, 8px);
  border-top: 1px solid var(--mp-border-default, #dcdfe4);
  flex-shrink: 0;
}

/* Left group */
.pag-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-6, 24px);
}

.pag-perpage {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3, 12px);
}

.pag-label {
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary, #656f80);
  white-space: nowrap;
}

/* Custom select */
.pag-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: var(--mp-radii-sm, 4px);
  cursor: pointer;
}

.pag-select {
  appearance: none;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary, #656f80);
  padding: 4px 24px 4px 8px;
  cursor: pointer;
  border-radius: var(--mp-radii-sm, 4px);
}

.pag-select:hover {
  background: var(--mp-background-neutral-hovered, #f0f1f3);
}

.pag-chevron {
  position: absolute;
  right: 4px;
  pointer-events: none;
  color: var(--mp-text-secondary, #656f80);
  width: 16px;
  height: 16px;
}

.pag-showing {
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary, #656f80);
  white-space: nowrap;
}

/* Right group */
.pag-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4, 16px);
}

.pag-nav {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
}

.pag-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: var(--mp-spacing-2, 8px);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-md, 6px);
  cursor: pointer;
  color: var(--mp-text-default, #272b32);
  transition: background 0.1s;
}

.pag-nav-btn:hover:not(:disabled) {
  background: var(--mp-background-neutral-hovered, #f0f1f3);
}

.pag-nav-btn:disabled {
  color: var(--mp-text-disabled, #c2c7d0);
  cursor: not-allowed;
}
</style>
