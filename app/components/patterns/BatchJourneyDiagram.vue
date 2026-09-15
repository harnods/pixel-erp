<script setup lang="ts">
/**
 * BatchJourneyDiagram — the Batch journey as a left-to-right picture (PRD story 11,
 * plan "Later"): where the batch came from → this batch → where it went.
 *
 * A presentation of the journey (story 8) and related batches (story 10) — it adds no
 * data, so the table below stays the source of truth (batchJourneyGraph).
 * - A transaction node is every transaction of one type moving the batch the same way,
 *   with a count and the quantity, so a busy batch doesn't crowd the picture. Clicking
 *   it lists the transactions it groups.
 * - A Work order node also shows the batches on the other side of the link; each opens
 *   that batch's detail page.
 * - Transfers and stock counts don't change the batch total, so they sit under the batch.
 *
 * HTML/CSS columns, not a canvas or SVG graph library: the repo has none, and text nodes
 * stay selectable, translatable and readable by assistive tech in journey order. Below
 * ~900px the columns stack and the arrows turn downward.
 *
 * Transaction numbers are plain text (plan open question 9).
 */
import { computed, ref, watch } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import type { JourneyGraph, JourneyGroup, RelatedBatchRow } from '~/data/batchTraceability'
import { useTraceabilityCells } from '~/composables/useTraceabilityCells'
import { formatDate } from '~/utils/date'

const props = defineProps<{
  graph: JourneyGraph
  productName: string
  batchNo: string
  onHand: number
  unit: string
}>()
const emit = defineEmits<{ openBatch: [row: RelatedBatchRow] }>()
const { t } = useLocale()
const { qtyText, mutationText } = useTraceabilityCells()

const columns = computed(() => [
  { key: 'in', title: t('Came from'), groups: props.graph.incoming },
  { key: 'center', title: t('This batch'), groups: props.graph.internal },
  { key: 'out', title: t('Went to'), groups: props.graph.outgoing },
])

const expanded = ref(new Set<string>())
function toggle(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}
// Opening another batch reuses the page — start its diagram collapsed.
watch(() => props.batchNo, () => { expanded.value = new Set() })

function countText(n: number): string {
  return n === 1 ? t('1 transaction') : t('{n} transactions').replace('{n}', String(n))
}
function groupQty(group: JourneyGroup): string {
  return mutationText(group.direction, group.qty, props.unit)
}
</script>

<template>
  <div class="bjd" role="group" :aria-label="t('Journey at a glance')">
    <template v-for="(col, ci) in columns" :key="col.key">
      <div class="bjd-col" :class="`bjd-col--${col.key}`">
        <span class="bjd-col-title">{{ col.title }}</span>

        <!-- The batch itself sits at the centre of the picture. -->
        <div v-if="col.key === 'center'" class="bjd-batch-card">
          <span class="bjd-batch-card-no">{{ batchNo }}</span>
          <span class="bjd-batch-card-product">{{ productName }}</span>
          <span class="bjd-batch-card-qty">{{ t('On hand') }} {{ qtyText(onHand, unit) }}</span>
        </div>
        <span v-if="col.key === 'center' && col.groups.length" class="bjd-caption">{{ t('Moved within the batch') }}</span>

        <div
          v-for="g in col.groups" :key="g.key"
          class="bjd-node" :class="{ 'bjd-node--open': expanded.has(g.key) }"
        >
          <div
            class="bjd-node-head" role="button" tabindex="0" :aria-expanded="expanded.has(g.key)"
            @click="toggle(g.key)" @keydown.enter.prevent="toggle(g.key)"
          >
            <MpIcon :name="expanded.has(g.key) ? 'chevrons-down' : 'chevrons-right'" size="sm" class="bjd-chevron" />
            <span class="bjd-node-text">
              <span class="bjd-node-title">{{ t(g.type) }}</span>
              <span class="bjd-node-meta">{{ countText(g.count) }} · {{ groupQty(g) }}</span>
            </span>
          </div>

          <div v-if="expanded.has(g.key)" class="bjd-tx-list">
            <div v-for="tx in g.transactions" :key="tx.id" class="bjd-tx">
              <span class="bjd-tx-number">{{ tx.number }}</span>
              <span class="bjd-tx-meta">{{ formatDate(tx.date) }} · {{ mutationText(g.direction, tx.qty, unit) }}</span>
            </div>
          </div>

          <div v-if="g.batches.length" class="bjd-batches">
            <span
              v-for="b in g.batches" :key="`${b.workOrderNumber}::${b.sku}::${b.batchNo}`"
              class="bjd-batch cell-link" role="button" tabindex="0"
              @click="emit('openBatch', b)" @keydown.enter="emit('openBatch', b)"
            >{{ b.batchNo }} · {{ b.productName }}</span>
          </div>
        </div>

        <span v-if="col.key !== 'center' && !col.groups.length" class="bjd-caption">—</span>
      </div>

      <div v-if="ci < columns.length - 1" class="bjd-arrow" aria-hidden="true">
        <MpIcon name="arrows-right" size="md" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.bjd {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-lg, 12px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.bjd-col { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.bjd-col-title {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary);
}
.bjd-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bjd-arrow {
  display: flex; align-items: center; justify-content: center;
  align-self: center; color: var(--mp-icon-default, var(--mp-text-secondary));
}

/* The batch — the one bold-bordered card, so the eye lands on it first. */
.bjd-batch-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px);
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral, #fff);
}
.bjd-batch-card-no { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bjd-batch-card-product { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bjd-batch-card-qty { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

/* Transaction nodes */
.bjd-node {
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral, #fff); overflow: hidden;
}
.bjd-node-head {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); cursor: pointer;
}
.bjd-node-head:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.bjd-node-head:focus-visible { outline: 2px solid var(--mp-border-selected, #029861); outline-offset: -2px; }
.bjd-chevron { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5, 2px); color: var(--mp-icon-default, var(--mp-text-secondary)); }
.bjd-node-text { display: flex; flex-direction: column; min-width: 0; }
.bjd-node-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bjd-node-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }

.bjd-tx-list { display: flex; flex-direction: column; border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.bjd-tx {
  display: flex; justify-content: space-between; gap: var(--mp-spacing-2); flex-wrap: wrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-3) var(--mp-spacing-1) var(--mp-spacing-8, 32px);
  font-size: var(--mp-font-sizes-sm);
}
.bjd-tx + .bjd-tx { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.bjd-tx-number { color: var(--mp-text-default); }
.bjd-tx-meta { color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }

.bjd-batches {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-2) var(--mp-spacing-8, 32px);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.bjd-batch { font-size: var(--mp-font-sizes-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Narrow: stack the columns, arrows point down. */
@media (max-width: 900px) {
  .bjd { grid-template-columns: minmax(0, 1fr); }
  .bjd-arrow { transform: rotate(90deg); }
}
</style>
