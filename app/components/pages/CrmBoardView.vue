<script setup lang="ts">
/**
 * CRM Customers — Board (pipeline) view. Groups the (already view-filtered)
 * customers into columns by lifecycle stage, segment, or contact owner. Used by
 * CrmCustomersPage when the active saved view is of type 'board'. A "Group by"
 * control at the top switches the grouping; the choice is owned by the parent
 * (it lives on the saved view) and emitted back via update:groupBy.
 *
 * When grouping by Segment a customer with several segment tags appears in each
 * matching column (tags are many-to-one), which is the truthful board reading.
 */
import { ref, computed } from 'vue'
import { MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import { formatIDR } from '~/utils/currency'
import { LIFECYCLE_STAGES, CRM_OWNERS, allSegmentTags, CRM_GROUP_BY, type CrmCustomer, type LifecycleStage, type CrmGroupBy } from '~/data/crm'

type Row = CrmCustomer & { lifecycleStage: LifecycleStage; billed: number }

const props = defineProps<{ rows: Row[]; groupBy: CrmGroupBy }>()
const emit = defineEmits<{
  (e: 'update:groupBy', v: CrmGroupBy): void
  (e: 'open', id: string): void
  (e: 'move', payload: { id: string; from: string; to: string }): void
}>()

// ── Drag & drop (same native-HTML5 pattern as the Deals kanban) ──
const draggingId = ref<string | null>(null)
const draggingFrom = ref<string | null>(null)
const dragOverKey = ref<string | null>(null)
function onDragStart(id: string, from: string) { draggingId.value = id; draggingFrom.value = from }
function onDragEnd() { draggingId.value = null; draggingFrom.value = null; dragOverKey.value = null }
function onDrop(to: string) {
  const id = draggingId.value
  const from = draggingFrom.value
  onDragEnd()
  if (id && from !== null && from !== to) emit('move', { id, from, to })
}

const groupByLabel = computed(() => CRM_GROUP_BY.find((g) => g.value === props.groupBy)?.label ?? 'Lifecycle stage')

interface Column { key: string; label: string; rows: Row[]; total: number }

const columns = computed<Column[]>(() => {
  const buckets = new Map<string, Row[]>()
  const order: string[] =
    props.groupBy === 'lifecycle' ? [...LIFECYCLE_STAGES]
    : props.groupBy === 'owner' ? [...CRM_OWNERS]
    : allSegmentTags()
  for (const k of order) buckets.set(k, [])

  for (const r of props.rows) {
    if (props.groupBy === 'segment') {
      const tags = r.segments.length ? r.segments : ['—']
      for (const t of tags) { if (!buckets.has(t)) buckets.set(t, []); buckets.get(t)!.push(r) }
    } else {
      const k = props.groupBy === 'owner' ? (r.owner || '—') : r.lifecycleStage
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k)!.push(r)
    }
  }
  return [...buckets.entries()].map(([key, rows]) => ({
    key, label: key, rows,
    total: rows.reduce((s, r) => s + r.inFlight, 0),
  }))
})

function lifecycleBadge(lc: LifecycleStage) {
  if (lc === 'Customer') return { status: 'active', label: 'Customer' }
  if (lc === 'Opportunity') return { status: 'prospect', type: 'information' as const, label: 'Opportunity' }
  if (lc === 'Lead') return { status: 'prospect', type: 'announcement' as const, label: 'Lead' }
  return { status: 'churned', type: 'announcement' as const, label: 'Former customer' }
}
</script>

<template>
  <div class="cb">
    <!-- Board toolbar — Group by control -->
    <div class="cb-toolbar">
      <span class="cb-groupby-label">Group by</span>
      <MpPopover id="cb-groupby" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <button class="btn-enterprise btn-enterprise--secondary" type="button">
            <MpIcon name="table-view-column" size="sm" />
            <span>{{ groupByLabel }}</span>
            <MpIcon name="chevrons-down" size="sm" />
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
          <MpPopoverList>
            <MpPopoverListItem v-for="g in CRM_GROUP_BY" :key="g.value" :is-active="g.value === groupBy" @click="emit('update:groupBy', g.value)">{{ g.label }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>

    <!-- Columns -->
    <div class="cb-board">
      <section
        v-for="col in columns" :key="col.key"
        class="cb-col" :class="{ 'is-over': dragOverKey === col.key }"
        @dragover.prevent="dragOverKey = col.key"
        @dragleave="dragOverKey === col.key && (dragOverKey = null)"
        @drop="onDrop(col.key)"
      >
        <header class="cb-col-head">
          <span class="cb-col-title">{{ col.label }}</span>
          <span class="cb-col-count">{{ col.rows.length }}</span>
          <span v-if="col.total" class="cb-col-total">{{ formatIDR(col.total) }}</span>
        </header>
        <div class="cb-col-body">
          <article
            v-for="r in col.rows" :key="`${col.key}-${r.id}`"
            class="cb-card" :class="{ 'is-dragging': draggingId === r.id }"
            role="button" tabindex="0" draggable="true"
            @dragstart="onDragStart(r.id, col.key)" @dragend="onDragEnd"
            @click="emit('open', r.id)" @keydown.enter="emit('open', r.id)"
          >
            <div class="cb-card-top">
              <span class="cb-card-name">{{ r.company }}</span>
              <ErpStatusBadge v-if="groupBy !== 'lifecycle'" v-bind="lifecycleBadge(r.lifecycleStage)" />
            </div>
            <ErpTagList v-if="r.segments.length && groupBy !== 'segment'" :tags="r.segments" />
            <div class="cb-card-meta">
              <span class="cb-card-owner"><MpIcon name="profile" size="sm" />{{ r.owner || '—' }}</span>
              <span v-if="r.inFlight" class="cb-card-value">{{ formatIDR(r.inFlight) }}</span>
            </div>
          </article>
          <p v-if="!col.rows.length" class="cb-col-empty">No customers</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cb { display: flex; flex-direction: column; min-height: 0; }

.cb-toolbar { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.cb-groupby-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.cb-board { display: flex; gap: var(--mp-spacing-4); overflow-x: auto; padding-bottom: var(--mp-spacing-3); align-items: flex-start; }
.cb-col { flex: 0 0 288px; width: 288px; display: flex; flex-direction: column; background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default); border-radius: 12px; max-height: 100%; transition: background 0.12s ease, border-color 0.12s ease; }
.cb-col.is-over { background: var(--mp-background-brand-subtle, #e8f5f0); border-color: var(--mp-border-brand, #0a6e4e); }
.cb-col-head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-2); }
.cb-col-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cb-col-count { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral, #fff); border-radius: 999px; padding: 1px 8px; }
.cb-col-total { margin-left: auto; flex-shrink: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

.cb-col-body { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2) var(--mp-spacing-2); overflow-y: auto; }
.cb-card { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default); border-radius: 8px; cursor: pointer; }
.cb-card:hover { border-color: var(--mp-border-bold, #c4c9d0); }
.cb-card:active { cursor: grabbing; }
.cb-card.is-dragging { opacity: 0.45; }
.cb-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-2); }
.cb-card-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.cb-card-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.cb-card-owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cb-card-value { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.cb-col-empty { margin: 0; padding: var(--mp-spacing-4) 0; text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
</style>
