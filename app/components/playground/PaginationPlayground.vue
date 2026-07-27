<script setup lang="ts">
/**
 * PaginationPlayground — standalone ErpPagination driven by live controls.
 */
import ErpPagination from '~/components/patterns/ErpPagination.vue'

const total       = ref(123)
const perPage     = ref(25)
const currentPage = ref(1)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

// Keep currentPage in range when total/perPage change
watch([total, perPage], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  if (currentPage.value < 1) currentPage.value = 1
})

function onPageChange(p: number) {
  currentPage.value = Math.min(Math.max(1, p), totalPages.value)
}
function onPerPageChange(n: number) {
  perPage.value = n
  currentPage.value = 1
}
</script>

<template>
  <div class="pg-grid">
    <aside class="panel">
      <p class="panel-title">Props</p>

      <label class="ctrl ctrl--col">
        <span>Total records: <strong>{{ total }}</strong></span>
        <input type="range" min="0" max="500" step="1" v-model.number="total" />
      </label>

      <label class="ctrl ctrl--col">
        <span>Per page</span>
        <select v-model.number="perPage">
          <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>

      <label class="ctrl ctrl--col">
        <span>Current page: <strong>{{ currentPage }}</strong> / {{ totalPages }}</span>
        <input type="range" min="1" :max="totalPages" step="1" v-model.number="currentPage" />
      </label>

      <p class="panel-note">
        Prev disables on page 1, Next disables on the last page. With
        <code>total = 0</code> the range reads <code>0-0 of 0</code>.
      </p>
    </aside>

    <section class="preview">
      <ErpPagination
        :total="total"
        :per-page="perPage"
        :current-page="currentPage"
        @page-change="onPageChange"
        @per-page-change="onPerPageChange"
      />
    </section>
  </div>
</template>

<style scoped>
.pg-grid {
  display: grid;
  grid-template-columns: 260px 1fr;
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
.ctrl--col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.ctrl--col select {
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-md);
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
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
</style>
