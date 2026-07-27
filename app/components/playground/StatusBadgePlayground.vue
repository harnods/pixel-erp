<script setup lang="ts">
/**
 * StatusBadgePlayground — every known ErpStatusBadge status by type group,
 * plus a free-text field to test the fallback for unknown statuses.
 */
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'

const groups = [
  { type: 'completed',    color: 'green',  statuses: ['paid', 'approved', 'active', 'completed', 'verified', 'success'] },
  { type: 'warning',      color: 'yellow', statuses: ['open', 'pending', 'draft', 'in review', 'on progress'] },
  { type: 'critical',     color: 'red',    statuses: ['overdue', 'rejected', 'failed', 'voided', 'expired', 'error'] },
  { type: 'information',  color: 'gray',   statuses: ['inactive', 'archived', 'cancelled', 'not started'] },
  { type: 'announcement', color: 'purple', statuses: ['new', 'beta', 'vip', 'featured'] },
]

const custom = ref('partially processed')
</script>

<template>
  <div class="pg-col">
    <section class="card">
      <p class="card-title">Try a custom status</p>
      <div class="try-row">
        <input v-model="custom" class="try-input" type="text" placeholder="e.g. partially processed" />
        <ErpStatusBadge :status="custom" />
      </div>
      <p class="note">
        Unknown statuses fall back to <code>information</code> (gray) with the raw
        text as the label. To give a status its own color, add it to
        <code>statusConfig</code> in <code>ErpStatusBadge.vue</code>.
      </p>
    </section>

    <section v-for="g in groups" :key="g.type" class="card">
      <p class="card-title">
        <code>{{ g.type }}</code> <span class="muted">— {{ g.color }}</span>
      </p>
      <div class="badge-row">
        <ErpStatusBadge v-for="s in g.statuses" :key="s" :status="s" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.pg-col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  max-width: 720px;
}
.card {
  padding: var(--mp-spacing-4);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.card-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.card-title code {
  font-family: monospace;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-1);
  border-radius: var(--mp-radii-sm);
}
.muted { color: var(--mp-text-subtle); font-weight: var(--mp-font-weights-regular); }
.badge-row, .try-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.try-input {
  width: 260px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  outline: none;
}
.note {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}
.note code {
  font-family: monospace;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-1);
  border-radius: var(--mp-radii-sm);
}
</style>
