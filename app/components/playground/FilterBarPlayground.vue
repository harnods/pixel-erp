<script setup lang="ts">
/**
 * FilterBarPlayground — the standalone ErpFilterBar container with toggleable
 * controls. Demonstrates spacing, wrap, and the bottom border.
 */
import ErpFilterBar from '~/components/patterns/ErpFilterBar.vue'

const showSearch = ref(true)
const showStatus = ref(true)
const showDate   = ref(false)
const showCreate = ref(true)
const manyItems  = ref(false)
</script>

<template>
  <div class="pg-grid">
    <aside class="panel">
      <p class="panel-title">Controls in slot</p>
      <label class="ctrl"><input type="checkbox" v-model="showSearch" /> Search</label>
      <label class="ctrl"><input type="checkbox" v-model="showStatus" /> Status select</label>
      <label class="ctrl"><input type="checkbox" v-model="showDate" /> Date filter</label>
      <label class="ctrl"><input type="checkbox" v-model="showCreate" /> Create button</label>
      <label class="ctrl"><input type="checkbox" v-model="manyItems" /> Many items (test wrap)</label>

      <p class="panel-note">
        <code>ErpFilterBar</code> is a layout container only: <code>flex</code>,
        gap <code>8px</code>, padding <code>12px 16px</code>, bottom border,
        <code>flex-wrap</code>. Index pages instead use the table's internal
        <code>#filters</code> slot (see ErpFilterBar.md).
      </p>
    </aside>

    <section class="preview">
      <ErpFilterBar>
        <input v-if="showSearch" class="f-search" type="text" placeholder="Search..." />

        <select v-if="showStatus" class="f-select">
          <option>All status</option>
          <option>Open</option>
          <option>Paid</option>
        </select>

        <select v-if="showDate" class="f-select">
          <option>All dates</option>
          <option>This month</option>
          <option>Last 30 days</option>
        </select>

        <template v-if="manyItems">
          <select class="f-select"><option>Customer</option></select>
          <select class="f-select"><option>Owner</option></select>
          <select class="f-select"><option>Region</option></select>
          <select class="f-select"><option>Channel</option></select>
        </template>

        <button v-if="showCreate" class="f-create">+ Create item</button>
      </ErpFilterBar>
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
  gap: var(--mp-spacing-2);
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
.ctrl {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}
.panel-note {
  margin: var(--mp-spacing-2) 0 0;
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
.f-search {
  width: 240px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  outline: none;
}
.f-select {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
}
.f-create {
  margin-left: auto;
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  background: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
  border: none;
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
}
</style>
