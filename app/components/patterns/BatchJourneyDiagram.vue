<script setup lang="ts">
/**
 * BatchJourneyDiagram — the Batch journey as a flow between parties (PRD story 11):
 * who the batch came from → this batch → who it went to (batchFlowGraph).
 *
 * Built for the two traceability questions: recall ("who got it?") and root cause
 * ("where did it come from?"). So a node is a party — a vendor, a customer, a Work
 * order — not a transaction type — each linked to the batch by one thin line, with the
 * quantity on the node (biggest first), so where most of the batch went reads at a glance.
 * - The batch card in the middle carries the totals (In · Out · On hand), the on-hand
 *   split by warehouse, the moves between warehouses and the attribute changes.
 * - A Work order node lists the batches on its other side; each opens its detail page.
 * - An outgoing node whose stock left before the latest attribute change is tagged, so a
 *   recall can tell who received the batch under its old values.
 * - Selecting a node emits `showTransactions` — the page opens the Log on that
 *   party's lines. The diagram adds no data; the table stays the source of truth.
 *
 * Nodes are HTML (selectable, translatable, read in journey order by assistive tech);
 * only the links are an SVG layer, measured from the rendered nodes. Below ~900px the
 * columns stack and the links drop out — each node still shows its quantity.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import type { BatchFlowGraph, FlowParty, JourneyRow, RelatedBatchRow } from '~/data/batchTraceability'
import { useTraceabilityCells } from '~/composables/useTraceabilityCells'
import { customerName } from '~/data/customers'
import { formatDate } from '~/utils/date'

export interface FlowChange { id: string; date: string; summary: string }

const props = defineProps<{
  graph: BatchFlowGraph
  productName: string
  batchNo: string
  onHand: number
  unit: string
  /** On hand per warehouse, as Stock position lists it. */
  warehouses: { id: string; name: string; qty: number }[]
  /** Attribute changes on the batch, oldest first, already worded. */
  changes: FlowChange[]
  warehouseName: (id: string | null) => string
  /** The transaction the user came from (By transaction) — its node is highlighted. */
  highlightTransaction?: string
}>()
const emit = defineEmits<{
  openBatch: [row: RelatedBatchRow]
  showTransactions: [payload: { label: string; ids: string[] }]
}>()
const { t } = useLocale()
const { qtyText, mutationText, vendorName } = useTraceabilityCells()

// ─── Node text ──────────────────────────────────────────────────────────────────
function partyName(p: FlowParty): string {
  if (p.kind === 'vendor') return vendorName(p.refId)
  if (p.kind === 'customer') return customerName(p.refId)
  if (p.kind === 'work-order') return p.refId
  return t(p.refId)
}
function kindLabel(p: FlowParty): string {
  if (p.kind === 'vendor') return t('Vendor')
  if (p.kind === 'customer') return t('Customer')
  if (p.kind === 'work-order') return t('Work order')
  return ''
}
function countText(n: number): string {
  return n === 1 ? t('1 transaction') : t('{n} transactions').replace('{n}', String(n))
}
function nodeMeta(p: FlowParty): string {
  const parts = [kindLabel(p), p.kind === 'vendor' || p.kind === 'customer' ? p.types.map((type) => t(type)).join(', ') : '', countText(p.transactions.length)]
  if (p.kind === 'work-order' && p.transactions[0]) parts.push(formatDate(p.transactions[0].date))
  return parts.filter(Boolean).join(' · ')
}
function isHighlighted(p: FlowParty): boolean {
  return !!props.highlightTransaction && p.transactions.some((tx) => tx.number === props.highlightTransaction)
}
/** Stock that left before the latest attribute change went out under the old values. */
const latestChangeDay = computed(() => props.changes.at(-1)?.date.slice(0, 10) ?? '')
function leftBeforeChange(p: FlowParty): boolean {
  return p.direction === 'out' && !!latestChangeDay.value && p.transactions.some((tx) => tx.date.slice(0, 10) < latestChangeDay.value)
}
function showTransactions(p: FlowParty) {
  emit('showTransactions', { label: partyName(p), ids: p.transactions.map((tx) => tx.id) })
}
function internalText(row: JourneyRow): string {
  if (row.type === 'Warehouse transfer') {
    return `${props.warehouseName(row.originWarehouseId)} → ${props.warehouseName(row.destinationWarehouseId)}`
  }
  return t(row.type)
}

// ─── Links (SVG layer, measured) ─────────────────────────────────────────────────
interface Link { key: string; d: string; width: number; direction: 'in' | 'out' }
const root = ref<HTMLElement | null>(null)
const size = ref({ width: 0, height: 0 })
const links = ref<Link[]>([])

/** Every link is the same single line — quantity reads from the node, not the stroke. */
const LINK_WIDTH = 1.5

function measure() {
  const el = root.value
  const batch = el?.querySelector<HTMLElement>('.bjd-batch-card')
  if (!el || !batch) return
  const box = el.getBoundingClientRect()
  size.value = { width: box.width, height: box.height }
  const c = batch.getBoundingClientRect()
  const cardMid = c.top - box.top + c.height / 2
  const next: Link[] = []
  for (const side of [props.graph.incoming, props.graph.outgoing]) {
    // Every link meets the card at one point — its vertical middle.
    for (const p of side) {
      const node = el.querySelector<HTMLElement>(`[data-flow-key="${CSS.escape(p.key)}"] .bjd-node-head`)
      if (!node) continue
      const n = node.getBoundingClientRect()
      const nodeY = n.top - box.top + n.height / 2
      const [x1, y1, x2, y2] = p.direction === 'in'
        ? [n.right - box.left, nodeY, c.left - box.left, cardMid]
        : [c.right - box.left, cardMid, n.left - box.left, nodeY]
      const mid = (x1 + x2) / 2
      next.push({ key: p.key, width: LINK_WIDTH, direction: p.direction, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}` })
    }
  }
  links.value = next
}

let observer: ResizeObserver | null = null
onMounted(() => {
  void nextTick(measure)
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(root.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => [props.graph, props.batchNo], () => { void nextTick(measure) })
</script>

<template>
  <div class="bjd-wrap">
    <div ref="root" class="bjd" role="group" :aria-label="t('Journey at a glance')">
      <svg class="bjd-links" :width="size.width" :height="size.height" aria-hidden="true">
        <path v-for="l in links" :key="l.key" :d="l.d" :stroke-width="l.width" :class="`bjd-link bjd-link--${l.direction}`" />
      </svg>

      <template v-for="side in (['in', 'out'] as const)" :key="side">
        <div class="bjd-col" :class="`bjd-col--${side}`">
          <span class="bjd-col-title">{{ side === 'in' ? t('Came from') : t('Went to') }}</span>
          <div
            v-for="p in (side === 'in' ? graph.incoming : graph.outgoing)" :key="p.key"
            class="bjd-node" :class="[`bjd-node--${p.direction}`, { 'bjd-node--highlight': isHighlighted(p) }]"
            :data-flow-key="p.key"
          >
            <div
              class="bjd-node-head" role="button" tabindex="0"
              :aria-label="`${partyName(p)} — ${t('View transactions')}`"
              @click="showTransactions(p)" @keydown.enter.prevent="showTransactions(p)"
            >
              <span class="bjd-node-main">
                <span class="bjd-node-title">{{ partyName(p) }}</span>
                <span class="bjd-node-qty">{{ mutationText(p.direction, p.qty, unit) }}</span>
              </span>
              <span class="bjd-node-meta">{{ nodeMeta(p) }}</span>
              <span v-if="leftBeforeChange(p)" class="bjd-tag">
                <MpIcon name="warning-triangle" size="sm" />{{ t('Before attribute change') }}
              </span>
            </div>
            <div v-if="p.batches.length" class="bjd-batches">
              <span
                v-for="b in p.batches" :key="`${b.sku}::${b.batchNo}`"
                class="bjd-batch cell-link" role="button" tabindex="0"
                @click="emit('openBatch', b)" @keydown.enter="emit('openBatch', b)"
              >{{ b.batchNo }} · {{ b.productName }}</span>
            </div>
          </div>
          <span v-if="!(side === 'in' ? graph.incoming : graph.outgoing).length" class="bjd-caption">—</span>
        </div>

        <!-- The batch sits between the two sides. -->
        <div v-if="side === 'in'" class="bjd-col bjd-col--center">
          <span class="bjd-col-title">{{ t('This batch') }}</span>
          <div class="bjd-batch-card">
            <span class="bjd-batch-card-no">{{ batchNo }}</span>
            <span class="bjd-batch-card-product">{{ productName }}</span>
            <div class="bjd-totals">
              <span><span class="bjd-dot bjd-dot--in" />{{ t('In') }} {{ qtyText(graph.received, unit) }}</span>
              <span><span class="bjd-dot bjd-dot--out" />{{ t('Out') }} {{ qtyText(graph.issued, unit) }}</span>
            </div>
            <span class="bjd-batch-card-qty">{{ t('On hand') }} {{ qtyText(onHand, unit) }}</span>
            <ul v-if="warehouses.length" class="bjd-split">
              <li v-for="w in warehouses" :key="w.id"><span>{{ w.name }}</span><span>{{ qtyText(w.qty, unit) }}</span></li>
            </ul>

            <template v-if="graph.internal.length">
              <span class="bjd-card-caption">{{ t('Moved within the batch') }}</span>
              <ul class="bjd-card-list">
                <li
                  v-for="row in graph.internal" :key="row.id"
                  :class="{ 'bjd-card-item--highlight': row.number === highlightTransaction }"
                >
                  <span>{{ internalText(row) }}</span>
                  <span class="bjd-card-meta">{{ row.number }} · {{ formatDate(row.date) }} · {{ qtyText(row.qty, unit) }}</span>
                </li>
              </ul>
            </template>

            <template v-if="changes.length">
              <span class="bjd-card-caption">{{ t('Attribute changes') }}</span>
              <ul class="bjd-card-list">
                <li v-for="c in changes" :key="c.id" class="bjd-change">
                  <MpIcon name="edit" size="sm" />
                  <span>{{ c.summary }}</span>
                  <span class="bjd-card-meta">{{ formatDate(c.date) }}</span>
                </li>
              </ul>
            </template>
          </div>
        </div>
      </template>
    </div>

    <div class="bjd-legend">
      <span><span class="bjd-swatch bjd-swatch--in" />{{ t('Came in') }}</span>
      <span><span class="bjd-swatch bjd-swatch--out" />{{ t('Went out') }}</span>
      <span class="bjd-legend-hint">{{ t('Select a party to see its transactions.') }}</span>
    </div>
  </div>
</template>

<style scoped>
.bjd-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bjd {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  column-gap: var(--mp-spacing-20, 80px);
  align-items: center;
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-lg, 12px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.bjd-links { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.bjd-link { fill: none; stroke-opacity: 0.6; }
.bjd-link--in { stroke: var(--mp-icon-success, #29a36a); }
.bjd-link--out { stroke: var(--mp-icon-information, #4b61dd); }

.bjd-col { position: relative; display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.bjd-col-title {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary);
}
.bjd-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Party nodes — a coloured edge on the link side says which way stock moved. */
.bjd-node {
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral, #fff); overflow: hidden;
}
.bjd-node--in { box-shadow: inset -3px 0 var(--mp-icon-success, #29a36a); }
.bjd-node--out { box-shadow: inset 3px 0 var(--mp-icon-information, #4b61dd); }
.bjd-node--highlight { border-color: var(--mp-border-selected, #029861); background: var(--mp-background-selected, #e8f1fb); }
.bjd-node-head {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); cursor: pointer;
}
.bjd-node-head:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.bjd-node-head:hover .bjd-node-title { color: var(--mp-text-selected); }
.bjd-node-head:focus-visible { outline: 2px solid var(--mp-border-selected, #029861); outline-offset: -2px; }
.bjd-node-main { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); min-width: 0; }
.bjd-node-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.bjd-node-qty { flex-shrink: 0; font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.bjd-node-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bjd-tag {
  align-self: flex-start; display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  margin-top: var(--mp-spacing-1); padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm); background: var(--mp-background-warning-subtle, #fff6e0);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning, #8a5a00);
}
.bjd-batches {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.bjd-batch { font-size: var(--mp-font-sizes-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The batch — the one bold-bordered card, so the eye lands on it first. */
.bjd-batch-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral, #fff);
}
.bjd-batch-card-no { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bjd-batch-card-product { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bjd-totals { display: flex; gap: var(--mp-spacing-4); flex-wrap: wrap; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.bjd-totals > span { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.bjd-dot { width: 8px; height: 8px; border-radius: var(--mp-radii-full, 999px); }
.bjd-dot--in, .bjd-swatch--in { background: var(--mp-icon-success, #29a36a); }
.bjd-dot--out, .bjd-swatch--out { background: var(--mp-icon-information, #4b61dd); }
.bjd-batch-card-qty { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.bjd-split, .bjd-card-list { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin: 0; padding: 0; list-style: none; }
.bjd-split > li {
  display: flex; justify-content: space-between; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums;
}
.bjd-card-caption {
  margin-top: var(--mp-spacing-2); padding-top: var(--mp-spacing-2);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
}
.bjd-card-list > li { display: flex; flex-direction: column; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.bjd-card-list > li.bjd-change { flex-direction: row; flex-wrap: wrap; align-items: center; column-gap: var(--mp-spacing-1); }
.bjd-card-meta { color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.bjd-card-item--highlight { background: var(--mp-background-selected, #e8f1fb); border-radius: var(--mp-radii-sm); }

.bjd-legend { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-wrap: wrap; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bjd-legend > span { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.bjd-swatch { width: 16px; height: 4px; border-radius: var(--mp-radii-full, 999px); }
.bjd-legend-hint { margin-left: auto; }

/* Narrow: stack the columns (came from, batch, went to); links drop out. */
@media (max-width: 900px) {
  .bjd { grid-template-columns: minmax(0, 1fr); row-gap: var(--mp-spacing-4); }
  .bjd-links { display: none; }
}
</style>
