<!--
  ErpLineDimensionsView — read-only "Dimensions" cell for detail pages: each
  assigned dimension rendered as one MpTag chip, "<name> <value>" (dimension
  name semibold, value regular, single space between) — the same flat MpTag
  chip pattern used everywhere else a read-only list of values is shown
  (see ErpTagList), not a stacked label/value box. Non-interactive: no
  is-closable, no click handler — MpTag only shows a pointer cursor / hover
  affordance when a click listener is bound, so leaving it unbound keeps it
  inert.
-->
<script setup lang="ts">
import { MpTag } from '@mekari/pixel3'
defineProps<{ values: { name: string; value: string }[] }>()
</script>

<template>
  <div v-if="values.length" class="eldv">
    <MpTag v-for="v in values" :id="`eldv-tag-${v.name}`" :key="v.name">
      <!-- MpTag's root is display:flex — a bare whitespace text node as a direct
           child gets silently stripped by the flexbox spec's anonymous-item
           rule, collapsing "Branch Bandung" into "BranchBandung". Wrapping
           both spans in one span makes them a single flex item, so the space
           between them is ordinary inline content instead. -->
      <span><span class="eldv-label">{{ v.name }}</span> <span class="eldv-value">{{ v.value }}</span></span>
    </MpTag>
  </div>
</template>

<style scoped>
.eldv { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-1); }
.eldv-label { font-weight: var(--mp-font-weights-semi-bold); }
.eldv-value { font-weight: var(--mp-font-weights-regular, 400); }
</style>
