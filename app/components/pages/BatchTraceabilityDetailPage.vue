<script setup lang="ts">
/**
 * Batch traceability detail — one product + one batch (PRD stories 7, 8, 10; plan
 * Phase 3). Route: /inventory-report/batch-traceability/:sku/:batchNo.
 *
 * Four sections, in the PRD's order:
 *  1. Batch information — identity, the transaction that created the batch, and the
 *     attributes as they stand on the batch master today (labelled as such). The
 *     "Last updated by …" line opens the Activity log (rule/activity-log-trigger).
 *  2. Stock position — total on hand, Total received − Total issued = On hand (with a
 *     mismatch warning), and a per-warehouse breakdown with a "View locations" drawer.
 *  3. Batch journey — every transaction that touched the batch, oldest first, with the
 *     running balance across all warehouses. A row expands to the attribute values
 *     recorded on that transaction; values that differ from today's are marked.
 *  4. Related batch — one Work order level each way; a batch opens its own detail page
 *     and the breadcrumb keeps the chain (`?trail=`) so the user can walk back.
 *
 * Entry context never changes content (story 7): `?warehouse=` highlights that line in
 * Stock position (from By batch), `?transaction=` highlights that journey line (from By
 * transaction). The Batch traceability breadcrumb returns to the report with its state
 * intact (useBatchTraceabilityReportState).
 *
 * Deliberate departures from docs/design/RULES.md:
 * - The three tables are the ErpTablePage header/row spec rendered directly, not
 *   ErpTablePage (rule/table-use-erptablepage): the journey needs a full-width expanded
 *   row, which ErpTablePage can't render, and these are short detail sub-tables with no
 *   filter bar or paging — same as BatchDetailsPage's tab tables.
 * - No title-bar Actions menu (details-page-format §C): a report detail has nothing to
 *   edit or archive. Its one action, Export, is a secondary button top-right — there's
 *   no filter bar to hold it (rule/filter-bar-search-export covers list pages).
 * - No Jump-to switcher (rule/detail-jump-to): the batch's "siblings" are whatever the
 *   report returned, which the breadcrumb already goes back to.
 * - Transaction numbers are plain text (plan open question 9).
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpCheckbox, MpIcon, MpTooltip } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import BatchStorageLocationsDrawer from '~/components/patterns/BatchStorageLocationsDrawer.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import { buildExportDocument, downloadExport, type ExportFormat, type ExportSection } from '~/utils/traceabilityExport'
import { successToast } from '~/utils/toasts'
import {
  getBatchTrace, batchStockPosition, batchJourney, batchJourneyTimeline, batchAttributeChanges, relatedBatches, attributeCell,
  type AttributeChangeMarker, type JourneyRow, type RelatedBatchRow, type TraceabilityAccess,
} from '~/data/batchTraceability'
import { TRACE_ATTRIBUTE_COLUMNS, useTraceabilityCells } from '~/composables/useTraceabilityCells'
import { getBatchDetail } from '~/data/productDetails'
import { batchActivityFor } from '~/data/batchStore'
import { batchAttributeDef, formatExpiry, type BatchAttributeKey } from '~/data/batchAttributes'
import { warehouses } from '~/data/warehouses'
import { customerName } from '~/data/customers'
import { formatDate, formatDateTime, formatDateTimeLong } from '~/utils/date'

// orderId is "sku::batchNo" ([...slug].vue decodes the batch number).
const props = defineProps<{ orderId: string }>()
const route = useRoute()
const router = useRouter()
const { t } = useLocale()
const { attributeText, qtyText, mutationText, vendorName } = useTraceabilityCells()

const sku = computed(() => props.orderId.split('::')[0] ?? '')
const batchNo = computed(() => props.orderId.split('::').slice(1).join('::'))

// ─── Scenario (demo) ────────────────────────────────────────────────────────────
const scenario = ref('data')
const scenarios = [
  { label: 'Default', value: 'data' },
  { label: 'Without Batch Attribute add-on', value: 'no-batch-attribute' },
  { label: 'Without Dual Unit Inventory', value: 'no-dual-unit' },
  { label: 'Reconciliation mismatch', value: 'mismatch' },
]
const access = computed<TraceabilityAccess>(() => ({
  batchAttribute: scenario.value !== 'no-batch-attribute',
  dualUnit: scenario.value !== 'no-dual-unit',
}))

// ─── Data ───────────────────────────────────────────────────────────────────────
const trace = computed(() => getBatchTrace(sku.value, batchNo.value, access.value))
const position = computed(() => batchStockPosition(sku.value, batchNo.value, access.value))
const journey = computed(() => batchJourney(sku.value, batchNo.value, access.value))
const related = computed(() => relatedBatches(sku.value, batchNo.value))
const master = computed(() => getBatchDetail(sku.value, batchNo.value))

const unit = computed(() => trace.value?.unit ?? '')
const secondaryUnit = computed(() => trace.value?.secondaryUnit ?? null)

function warehouseName(id: string | null): string {
  return id ? warehouses.find((w) => w.id === id)?.name ?? id : ''
}

// ─── Breadcrumb trail (related-batch drill-through) ─────────────────────────────
interface TrailItem { sku: string; batchNo: string }
const trail = computed<TrailItem[]>(() =>
  String(route.query.trail ?? '')
    .split('|')
    .filter(Boolean)
    .map((s) => {
      const [itemSku, ...rest] = s.split('::')
      return { sku: itemSku ?? '', batchNo: rest.join('::') }
    }),
)
function trailParam(items: TrailItem[]): string {
  return items.map((i) => `${i.sku}::${i.batchNo}`).join('|')
}
function batchPath(itemSku: string, itemBatchNo: string): string {
  return `/inventory-report/batch-traceability/${itemSku}/${encodeURIComponent(itemBatchNo)}`
}
function openRelated(row: RelatedBatchRow) {
  router.push({
    path: batchPath(row.sku, row.batchNo),
    query: { trail: trailParam([...trail.value, { sku: sku.value, batchNo: batchNo.value }]) },
  })
}
function openTrail(index: number) {
  const item = trail.value[index]!
  router.push({ path: batchPath(item.sku, item.batchNo), query: index ? { trail: trailParam(trail.value.slice(0, index)) } : {} })
}
function backToReport() { router.push('/inventory-report/batch-traceability') }

// ─── Entry-point highlight ──────────────────────────────────────────────────────
const highlightWarehouse = computed(() => (typeof route.query.warehouse === 'string' ? route.query.warehouse : ''))
const highlightTransaction = computed(() => (typeof route.query.transaction === 'string' ? route.query.transaction : ''))

// ─── Batch information ──────────────────────────────────────────────────────────
function formatAttribute(key: BatchAttributeKey): string {
  const tr = trace.value
  if (!tr) return ''
  const text = attributeText(attributeCell(sku.value, tr.attributes, key, access.value), key)
  return text || '—'
}
const createdText = computed(() => {
  const tr = trace.value
  if (!tr?.createdDate) return '—'
  return `${formatDate(tr.createdDate)} · ${t(tr.createdByType ?? '')} ${tr.createdByNumber ?? ''}`.trim()
})

// ─── Activity log (same trail as BatchDetailsPage) ──────────────────────────────
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const b = master.value
  if (!b) return []
  const label = (field: string) => (field === 'batchNo' ? 'Number' : field === 'description' ? 'Description' : batchAttributeDef(field as BatchAttributeKey)?.label ?? field)
  const recorded = batchActivityFor(b.id)
  const entries: ActivityEntry[] = recorded.map((e) => ({
    date: e.date,
    user: e.user,
    activity: e.action === 'created' ? 'Created' : 'Updated',
    details: [
      ...e.changes.map((c) => ({
        label: label(c.field),
        value: e.action === 'created' ? String(c.to ?? '—') : `${c.from ?? '—'} → ${c.to ?? '—'}`,
      })),
      // Import / API edits say where they came from (story 9); web is the default.
      ...(e.channel && e.channel !== 'web' ? [{ label: t('Channel'), value: t(CHANNEL_LABELS[e.channel]) }] : []),
    ],
  }))
  // The seeded regrade behind a graded receipt snapshot belongs in the trail too, so the
  // journey marker and the Activity log tell the same story.
  for (const marker of batchAttributeChanges(sku.value, batchNo.value).filter((m) => m.id.endsWith('::regrade'))) {
    entries.push({
      date: marker.date,
      user: marker.user,
      activity: 'Updated',
      details: marker.changes.map((c) => ({ label: label(c.key), value: `${rawAttributeText(c.key, c.from)} → ${rawAttributeText(c.key, c.to)}` })),
    })
  }
  if (!recorded.some((e) => e.action === 'created')) {
    entries.push({
      date: b.createdAt ?? b.updatedAt,
      user: b.createdBy ?? b.updatedBy,
      activity: 'Created',
      details: [
        { label: 'Number', value: b.batchNo },
        ...(b.attributes.expiry_date ? [{ label: 'Expiry date', value: formatExpiry(b.attributes.expiry_date, 'long') }] : []),
      ],
    })
  }
  return entries
})

// ─── Stock position ─────────────────────────────────────────────────────────────
/** Received − Issued, and the on hand it's checked against. The mismatch scenario adds 5
 *  to on hand so the warning can be previewed — the seeded ledger always reconciles. */
const expectedOnHand = computed(() => (position.value ? position.value.received - position.value.issued : 0))
const shownOnHand = computed(() => {
  const total = position.value?.totalBase ?? 0
  return scenario.value === 'mismatch' ? expectedOnHand.value + 5 : total
})
const difference = computed(() => shownOnHand.value - expectedOnHand.value)
const perBase = computed(() => {
  const p = position.value
  return p && p.totalSecondary !== null && p.totalBase ? p.totalSecondary / p.totalBase : null
})
function secondaryQtyText(qty: number): string {
  return perBase.value === null ? t('NA') : qtyText(Math.round(qty * perBase.value * 100) / 100, secondaryUnit.value)
}

const locationsOpen = ref(false)
const locationsWarehouseId = ref<string | null>(null)
function openLocations(warehouseId: string) {
  locationsWarehouseId.value = warehouseId
  locationsOpen.value = true
}

// ─── Batch journey ──────────────────────────────────────────────────────────────
const newestFirst = ref(false)
// Attribute-change markers sit in the journey by date (story 9); the toggle hides them
// so the user can read movements only.
const showChanges = ref(true)
const timeline = computed(() => batchJourneyTimeline(sku.value, batchNo.value, access.value))
const changeCount = computed(() => timeline.value.filter((e) => e.kind === 'change').length)
const journeyEntries = computed(() => {
  const list = showChanges.value ? timeline.value : timeline.value.filter((e) => e.kind === 'movement')
  return newestFirst.value ? [...list].reverse() : list
})
const journeyRows = computed(() => (newestFirst.value ? [...journey.value].reverse() : journey.value))
const expanded = ref(new Set<string>())
function toggleRow(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
// Drill-through reuses this component for another batch — start that one collapsed.
watch(() => props.orderId, () => { expanded.value = new Set() })

function counterpartyText(row: JourneyRow): string {
  if (!row.counterparty) return ''
  return row.counterparty.kind === 'customer' ? customerName(row.counterparty.id) : vendorName(row.counterparty.id)
}
function journeySecondaryMutation(row: JourneyRow): string {
  if (row.secondaryDelta === null) return t('NA')
  // A neutral line (transfer, count) moves no total — show its own quantity instead.
  if (row.direction === 'neutral') return secondaryQtyText(row.qty)
  return mutationText(row.direction, row.secondaryDelta, secondaryUnit.value)
}
function snapshotText(row: JourneyRow, key: BatchAttributeKey): string {
  return attributeText(attributeCell(sku.value, row.attributes, key, access.value), key) || '—'
}
function isChanged(row: JourneyRow, key: BatchAttributeKey): boolean {
  return row.changedAttributes.includes(key) && attributeCell(sku.value, row.attributes, key, access.value).state !== 'na'
}

// ─── Attribute change markers ───────────────────────────────────────────────────
const CHANNEL_LABELS: Record<AttributeChangeMarker['channel'], string> = { web: 'Web', import: 'Import', api: 'API' }

/** A stored attribute value (vendor id, grade id, ISO date) as people read it. */
function rawAttributeText(key: BatchAttributeKey, value: string | null): string {
  return value ? attributeText({ state: 'value', value }, key) : '—'
}
/** "Grade: B → A" — every attribute that one save changed. */
function changeSummary(change: AttributeChangeMarker): string {
  return change.changes
    .map((c) => `${t(batchAttributeDef(c.key).label)}: ${rawAttributeText(c.key, c.from)} → ${rawAttributeText(c.key, c.to)}`)
    .join(' · ')
}
/** "Budi Santoso · 12/04/2026 · Web" — who, when, and where from. */
function changeMeta(change: AttributeChangeMarker): string {
  const when = change.date.length > 10 ? formatDateTime(change.date) : formatDate(change.date)
  return `${change.user} · ${when} · ${t(CHANNEL_LABELS[change.channel])}`
}

const JOURNEY_COLUMNS = 11

// ─── Export (story 12) ──────────────────────────────────────────────────────────
// One batch, so no scope. The modal's "columns" are the page's four sections; each
// becomes a sheet (xlsx) or a titled block (csv). The journey is always oldest first.
const exportOpen = ref(false)
const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'csv']
const exportSections = computed(() => [
  { key: 'information', label: t('Batch information'), required: true },
  { key: 'position', label: t('Stock position') },
  { key: 'journey', label: t('Batch journey') },
  { key: 'related', label: t('Related batch') },
])

function buildSections(keys: string[]): ExportSection[] {
  const tr = trace.value
  const p = position.value
  if (!tr || !p) return []
  const secondary = (qty: number | null) => (qty === null ? t('NA') : qtyText(qty, secondaryUnit.value))
  const sections: ExportSection[] = []

  if (keys.includes('information')) {
    sections.push({
      name: t('Batch information'),
      columns: [t('Product'), t('Product code'), t('Batch number'), t('Description'), t('Created'), ...TRACE_ATTRIBUTE_COLUMNS.map((a) => t(a.label))],
      rows: [[tr.productName, tr.sku, tr.batchNo, tr.description || '—', createdText.value, ...TRACE_ATTRIBUTE_COLUMNS.map((a) => formatAttribute(a.key))]],
    })
  }
  if (keys.includes('position')) {
    sections.push({
      name: t('Stock position'),
      columns: [t('Warehouse'), t('On hand'), t('On hand (secondary unit)')],
      rows: [
        ...p.warehouses.map((w) => [warehouseName(w.warehouseId), qtyText(w.onHandBase, unit.value), secondary(w.onHandSecondary)]),
        [t('Total on hand'), qtyText(shownOnHand.value, unit.value), secondaryQtyText(shownOnHand.value)],
        [t('Total received'), qtyText(p.received, unit.value)],
        [t('Total issued'), qtyText(p.issued, unit.value)],
        ...(difference.value !== 0 ? [[t('Difference'), qtyText(difference.value, unit.value)]] : []),
      ],
    })
  }
  if (keys.includes('journey')) {
    sections.push({
      name: t('Batch journey'),
      columns: [
        t('Date'), t('Transaction type'), t('Transaction number'), t('Warehouse origin'), t('Warehouse destination'),
        t('Counterparty'), t('Mutation'), t('Mutation (secondary unit)'), t('Balance'), t('Balance (secondary unit)'),
        ...TRACE_ATTRIBUTE_COLUMNS.map((a) => `${t(a.label)} (${t('Recorded values')})`),
      ],
      rows: journey.value.map((row) => [
        formatDate(row.date), t(row.type), row.number, warehouseName(row.originWarehouseId), warehouseName(row.destinationWarehouseId),
        counterpartyText(row), mutationText(row.direction, row.qty, unit.value), journeySecondaryMutation(row),
        qtyText(row.balanceBase, unit.value), secondary(row.balanceSecondary),
        ...TRACE_ATTRIBUTE_COLUMNS.map((a) => snapshotText(row, a.key)),
      ]),
    })
    // The change trail travels with the journey (story 9) — one row per changed attribute.
    const markers = batchAttributeChanges(sku.value, batchNo.value)
    if (markers.length) {
      sections.push({
        name: t('Attribute changes'),
        columns: [t('Date'), t('Changed by'), t('Channel'), t('Attribute'), t('From'), t('To')],
        rows: markers.flatMap((m) => m.changes.map((c) => [
          m.date.length > 10 ? formatDateTime(m.date) : formatDate(m.date),
          m.user,
          t(CHANNEL_LABELS[m.channel]),
          t(batchAttributeDef(c.key).label),
          rawAttributeText(c.key, c.from),
          rawAttributeText(c.key, c.to),
        ])),
      })
    }
  }
  if (keys.includes('related')) {
    const rows = (group: 'sources' | 'results', label: string) =>
      related.value[group].map((r) => [label, r.productName, r.batchNo, r.workOrderNumber, formatDate(r.workOrderDate), qtyText(r.qty, r.unit)])
    sections.push({
      name: t('Related batch'),
      columns: [t('Relation'), t('Product'), t('Batch number'), t('Work order number'), t('Work order date'), t('Qty')],
      rows: [...rows('sources', t('Source batch')), ...rows('results', t('Result batch'))],
    })
  }
  return sections
}

async function onExport(payload: { scope: 'all' | 'page' | 'selected'; columns: string[]; format?: ExportFormat }) {
  exportOpen.value = false
  const tr = trace.value
  if (!tr) return
  const doc = buildExportDocument({
    title: `${t('Batch traceability')} — ${tr.productName} · ${tr.batchNo}`,
    exportedOn: formatDateTime(new Date().toISOString()),
    // A detail export isn't filtered — the header names the batch it covers instead.
    filters: [{ label: t('Product'), value: `${tr.productName} (${tr.sku})` }, { label: t('Batch number'), value: tr.batchNo }],
    labels: { exportedOn: t('Exported on'), appliedFilters: t('Applied filters'), noFilters: t('No filters applied') },
    sections: buildSections(payload.columns),
  })
  await downloadExport(doc, `batch-traceability-${tr.sku}-${tr.batchNo.replace(/[^\w-]+/g, '-')}`, payload.format ?? 'xlsx')
  successToast(t('Batch exported'))
}

defineExpose({ buildSections })
</script>

<template>
  <div v-if="trace && position" class="btd-page">
    <!-- ── Title bar ── -->
    <header class="btd-bar">
      <div class="btd-bar-left">
        <nav class="btd-breadcrumb-row" :aria-label="t('Breadcrumb')">
          <MpButton variant="textLink" is-rounded class="btd-breadcrumb" @click="router.push('/inventory-report')">{{ t('Reports') }}</MpButton>
          <span class="btd-breadcrumb-sep">/</span>
          <MpButton variant="textLink" is-rounded class="btd-breadcrumb" @click="backToReport">{{ t('Batch traceability') }}</MpButton>
          <template v-for="(item, i) in trail" :key="`${item.sku}::${item.batchNo}::${i}`">
            <span class="btd-breadcrumb-sep">/</span>
            <MpButton variant="textLink" is-rounded class="btd-breadcrumb" @click="openTrail(i)">{{ item.batchNo }}</MpButton>
          </template>
        </nav>
        <div class="btd-titlerow">
          <h1 class="btd-title">{{ trace.batchNo }}</h1>
          <span class="btd-title-product">{{ trace.productName }}</span>
        </div>
      </div>
      <MpButton variant="secondary" is-rounded @click="exportOpen = true">{{ t('Export') }}</MpButton>
    </header>

    <!-- ── Stage ── -->
    <div class="btd-stage">
      <!-- 1. Batch information -->
      <section class="btd-section">
        <h2 class="btd-section-title">{{ t('Batch information') }}</h2>
        <div class="btd-info">
          <div class="btd-info-col">
            <ContentList :label="t('Product')" :value="trace.productName" />
            <ContentList :label="t('Product code')" :value="trace.sku" />
            <ContentList :label="t('Batch number')" :value="trace.batchNo" />
            <ContentList :label="t('Description')" :value="trace.description || '—'" />
            <ContentList :label="t('Created')" :value="createdText" />
          </div>
          <div class="btd-info-col">
            <p class="btd-info-caption">{{ t('Current values on the batch master') }}</p>
            <ContentList v-for="a in TRACE_ATTRIBUTE_COLUMNS" :key="a.key" :label="t(a.label)" :value="formatAttribute(a.key)" />
          </div>
        </div>
        <a v-if="master" class="btd-updated" @click.prevent="activityOpen = true">
          {{ t('Last updated by {user} on {date}').replace('{user}', master.updatedBy).replace('{date}', formatDateTimeLong(master.updatedAt)) }}
        </a>
      </section>

      <!-- 2. Stock position -->
      <section class="btd-section">
        <h2 class="btd-section-title">{{ t('Stock position') }}</h2>
        <div class="btd-position">
          <div class="btd-total">
            <span class="btd-total-label">{{ t('Total on hand') }}</span>
            <span class="btd-total-value">{{ qtyText(shownOnHand, unit) }}</span>
            <span class="btd-total-secondary">{{ secondaryQtyText(shownOnHand) }}</span>
          </div>
          <div class="btd-reconcile">
            <span>{{ t('Total received') }} {{ qtyText(position.received, unit) }}</span>
            <span class="btd-reconcile-op">−</span>
            <span>{{ t('Total issued') }} {{ qtyText(position.issued, unit) }}</span>
            <span class="btd-reconcile-op">=</span>
            <span>{{ qtyText(expectedOnHand, unit) }}</span>
            <span v-if="difference !== 0" class="btd-mismatch" role="alert">
              <MpIcon name="warning-triangle" size="sm" />
              {{ t("Doesn't match on hand") }} · {{ t('Difference') }} {{ qtyText(difference, unit) }}
            </span>
          </div>
        </div>

        <div class="btd-table-scroll">
          <table class="btd-table">
            <thead>
              <tr>
                <th class="btd-th">{{ t('Warehouse') }}</th>
                <th class="btd-th btd-th--num">{{ t('On hand') }}</th>
                <th class="btd-th btd-th--num">{{ t('On hand (secondary unit)') }}</th>
                <th class="btd-th btd-th--action" />
              </tr>
            </thead>
            <tbody v-if="position.warehouses.length">
              <tr
                v-for="w in position.warehouses" :key="w.warehouseId"
                :class="{ 'btd-row--highlight': w.warehouseId === highlightWarehouse }"
              >
                <td class="btd-td">{{ warehouseName(w.warehouseId) }}</td>
                <td class="btd-td btd-td--num">{{ qtyText(w.onHandBase, unit) }}</td>
                <td class="btd-td btd-td--num" :class="{ 'btd-na': w.onHandSecondary === null }">
                  {{ w.onHandSecondary === null ? t('NA') : qtyText(w.onHandSecondary, secondaryUnit) }}
                </td>
                <td class="btd-td btd-td--action">
                  <MpButton variant="textLink" is-rounded class="btd-link-btn" @click="openLocations(w.warehouseId)">{{ t('View locations') }}</MpButton>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!position.warehouses.length" class="btd-empty">
            <p class="btd-empty-title">{{ t('Not stocked in any warehouse') }}</p>
            <p class="btd-empty-desc">{{ t('This batch has no stock left. Its journey below still shows where it went.') }}</p>
          </div>
        </div>
      </section>

      <!-- 3. Batch journey -->
      <section class="btd-section">
        <h2 class="btd-section-title">{{ t('Batch journey') }}</h2>
        <!-- Wrapped: MpCheckbox puts id/class on its hidden input, so layout lives on this div. -->
        <div v-if="changeCount" class="btd-changes-toggle">
          <MpCheckbox
            id="btd-show-changes"
            :is-checked="showChanges" @change="showChanges = !showChanges"
          >{{ t('Show attribute changes') }} ({{ changeCount }})</MpCheckbox>
        </div>
        <div class="btd-table-scroll">
          <table class="btd-table btd-table--journey">
            <thead>
              <tr>
                <th class="btd-th">
                  <button
                    type="button" class="btd-sort" :aria-sort="newestFirst ? 'descending' : 'ascending'"
                    @click="newestFirst = !newestFirst"
                  >
                    {{ t('Date') }}
                    <MpIcon :name="newestFirst ? 'arrows-down' : 'arrows-up'" size="16px" />
                  </button>
                </th>
                <th class="btd-th">{{ t('Transaction type') }}</th>
                <th class="btd-th">{{ t('Transaction number') }}</th>
                <th class="btd-th">{{ t('Warehouse origin') }}</th>
                <th class="btd-th">{{ t('Warehouse destination') }}</th>
                <th class="btd-th">{{ t('Counterparty') }}</th>
                <th class="btd-th btd-th--num">{{ t('Mutation') }}</th>
                <th class="btd-th btd-th--num">{{ t('Mutation (secondary unit)') }}</th>
                <th class="btd-th btd-th--num">{{ t('Balance') }}</th>
                <th class="btd-th btd-th--num">{{ t('Balance (secondary unit)') }}</th>
                <th class="btd-th btd-th--icon" />
              </tr>
            </thead>
            <tbody v-if="journeyRows.length">
              <template v-for="entry in journeyEntries" :key="entry.kind === 'movement' ? entry.row.id : entry.change.id">
                <!-- Attribute change marker (story 9): no stock moves, so no mutation or balance cells. -->
                <tr v-if="entry.kind === 'change'" class="btd-change-row">
                  <td class="btd-td btd-change" :colspan="JOURNEY_COLUMNS">
                    <span class="btd-change-line">
                      <MpIcon name="edit" size="sm" class="btd-change-icon" />
                      <span class="btd-change-summary">{{ t('Attribute change') }} · {{ changeSummary(entry.change) }}</span>
                      <span class="btd-change-meta">{{ t('Changed by') }} {{ changeMeta(entry.change) }}</span>
                    </span>
                  </td>
                </tr>
                <template v-else>
                <template v-for="row in [entry.row]" :key="row.id">
                <!-- The whole row toggles its snapshot (rule/table-accordion-row-click). -->
                <tr
                  class="btd-journey-row"
                  :class="{ 'btd-row--highlight': row.number === highlightTransaction }"
                  :aria-expanded="expanded.has(row.id)"
                  @click="toggleRow(row.id)"
                >
                  <td class="btd-td">
                    <span class="btd-date-cell">
                      <MpIcon :name="expanded.has(row.id) ? 'chevrons-down' : 'chevrons-right'" size="sm" class="btd-chevron" />
                      {{ formatDate(row.date) }}
                    </span>
                  </td>
                  <td class="btd-td">{{ t(row.type) }}</td>
                  <td class="btd-td">{{ row.number }}</td>
                  <td class="btd-td">{{ warehouseName(row.originWarehouseId) }}</td>
                  <td class="btd-td">{{ warehouseName(row.destinationWarehouseId) }}</td>
                  <td class="btd-td">{{ counterpartyText(row) }}</td>
                  <td class="btd-td btd-td--num">{{ mutationText(row.direction, row.qty, unit) }}</td>
                  <td class="btd-td btd-td--num" :class="{ 'btd-na': row.secondaryDelta === null }">{{ journeySecondaryMutation(row) }}</td>
                  <td class="btd-td btd-td--num">{{ qtyText(row.balanceBase, unit) }}</td>
                  <td class="btd-td btd-td--num" :class="{ 'btd-na': row.balanceSecondary === null }">
                    {{ row.balanceSecondary === null ? t('NA') : qtyText(row.balanceSecondary, secondaryUnit) }}
                  </td>
                  <td class="btd-td btd-td--icon">
                    <MpTooltip
                      v-if="row.changedAttributes.length" :id="`btd-changed-${row.id}`"
                      :label="t('Value at the time of this transaction')" placement="top" use-portal
                    >
                      <span class="btd-changed-dot" :aria-label="t('Value at the time of this transaction')" />
                    </MpTooltip>
                  </td>
                </tr>
                <tr v-if="expanded.has(row.id)" class="btd-snapshot-row">
                  <td class="btd-td btd-snapshot" :colspan="JOURNEY_COLUMNS">
                    <span class="btd-snapshot-caption">{{ t('Recorded values') }}</span>
                    <div class="btd-snapshot-grid">
                      <ContentList v-for="a in TRACE_ATTRIBUTE_COLUMNS" :key="a.key" :label="t(a.label)">
                        <span class="btd-snapshot-value">
                          {{ snapshotText(row, a.key) }}
                          <MpTooltip
                            v-if="isChanged(row, a.key)" :id="`btd-changed-${row.id}-${a.key}`"
                            :label="t('Value at the time of this transaction')" placement="top" use-portal
                          >
                            <span class="btd-changed-dot" :aria-label="t('Value at the time of this transaction')" />
                          </MpTooltip>
                        </span>
                      </ContentList>
                    </div>
                  </td>
                </tr>
                </template>
                </template>
              </template>
            </tbody>
          </table>
          <div v-if="!journeyRows.length" class="btd-empty">
            <p class="btd-empty-title">{{ t('No transactions for this batch yet') }}</p>
          </div>
        </div>
      </section>

      <!-- 4. Related batch -->
      <section class="btd-section">
        <h2 class="btd-section-title">{{ t('Related batch') }}</h2>
        <div v-for="group in (['sources', 'results'] as const)" :key="group" class="btd-related">
          <h3 class="btd-related-title">{{ group === 'sources' ? t('Source batch') : t('Result batch') }}</h3>
          <p class="btd-related-caption">
            {{ group === 'sources'
              ? t('Batches consumed by the work order that produced this batch')
              : t('Batches produced by work orders that consumed this batch') }}
          </p>
          <div class="btd-table-scroll">
            <table v-if="related[group].length" class="btd-table">
              <thead>
                <tr>
                  <th class="btd-th">{{ t('Product') }}</th>
                  <th class="btd-th">{{ t('Batch number') }}</th>
                  <th class="btd-th">{{ t('Work order number') }}</th>
                  <th class="btd-th">{{ t('Work order date') }}</th>
                  <th class="btd-th btd-th--num">{{ group === 'sources' ? t('Qty consumed') : t('Qty produced') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in related[group]" :key="`${r.workOrderNumber}::${r.sku}::${r.batchNo}`">
                  <td class="btd-td">{{ r.productName }}</td>
                  <td class="btd-td">
                    <span class="cell-link" role="button" tabindex="0" @click="openRelated(r)" @keydown.enter="openRelated(r)">{{ r.batchNo }}</span>
                  </td>
                  <td class="btd-td">{{ r.workOrderNumber }}</td>
                  <td class="btd-td">{{ formatDate(r.workOrderDate) }}</td>
                  <td class="btd-td btd-td--num">{{ qtyText(r.qty, r.unit) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="btd-empty-line">{{ group === 'sources' ? t('No source batch') : t('No result batch') }}</p>
          </div>
        </div>
      </section>
    </div>

    <BatchStorageLocationsDrawer
      v-model:is-open="locationsOpen"
      :sku="trace.sku"
      :batch-no="trace.batchNo"
      :warehouse-id="locationsWarehouseId"
      :unit="unit"
    />

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="trace.batchNo"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <ExportModal
      :open="exportOpen"
      :formats="EXPORT_FORMATS"
      :title="t('Export batch')"
      :entity-label="t('Batches')"
      :columns="exportSections"
      :total="1"
      hide-scope
      :show-column-search="false"
      :columns-label="t('Select sections to export')"
      @close="exportOpen = false"
      @export="onExport"
    />

    <ScenarioFab v-model="scenario" :scenarios="scenarios" />
  </div>

  <!-- ── Not found ── -->
  <div v-else class="btd-page">
    <div class="btd-notfound">
      <img src="/illustrations/empty-folder.png" alt="" class="btd-notfound-illustration" width="288" height="240">
      <p class="btd-empty-title">{{ t('Batch not found') }}</p>
      <MpButton variant="secondary" is-rounded @click="backToReport">{{ t('Back to report') }}</MpButton>
    </div>
  </div>
</template>

<style scoped>
/* ── Shell — BatchDetailsPage / details-page-format.md §C ── */
.btd-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.btd-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.btd-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.btd-breadcrumb-row { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-wrap: wrap; }
.btd-breadcrumb {
  padding: 0 !important; height: auto !important; min-width: 0 !important;
  font-size: var(--mp-font-sizes-sm) !important; line-height: var(--mp-line-heights-sm, 16px) !important;
  color: var(--mp-text-link) !important;
}
.btd-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.btd-titlerow { display: flex; align-items: baseline; gap: var(--mp-spacing-3); min-width: 0; }
.btd-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default); white-space: nowrap;
}
.btd-title-product {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.btd-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8, 32px);
}

/* ── Sections ── */
.btd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); min-width: 0; }
.btd-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.btd-info { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; flex-wrap: wrap; }
.btd-info-col { display: flex; flex-direction: column; flex: 1 1 320px; min-width: 0; }
.btd-info-caption { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.btd-updated { align-self: flex-start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.btd-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Stock position ── */
.btd-position { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.btd-total { display: flex; align-items: baseline; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.btd-total-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.btd-total-value { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.btd-total-secondary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.btd-reconcile {
  display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.btd-reconcile-op { color: var(--mp-text-secondary); }
.btd-mismatch {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  color: var(--mp-colors-text-critical, #d93b3b); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Tables — ErpTablePage header/row spec (docs/patterns/ErpTablePage.md) ── */
.btd-table-scroll { overflow-x: auto; }
.btd-table { width: 100%; min-width: max-content; border-collapse: collapse; }
.btd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; white-space: nowrap;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.btd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.btd-th--action, .btd-td--action { width: 1%; }
.btd-th--icon, .btd-td--icon { width: var(--mp-sizes-8, 32px); }
.btd-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  vertical-align: middle; white-space: nowrap; background: var(--mp-background-neutral, #ffffff);
}
.btd-td--num {
  text-align: right; font-variant-numeric: tabular-nums;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
}
.btd-na { color: var(--mp-text-secondary); }
.btd-link-btn { padding: 0 !important; height: auto !important; min-width: 0 !important; }

/* Entry-point highlight — the line the user came from (story 7). */
.btd-row--highlight > .btd-td { background: var(--mp-background-selected, #e8f1fb); }

.btd-sort {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: 0; border: none; background: none; cursor: pointer;
  font: inherit; text-transform: inherit; color: inherit;
}

.btd-journey-row { cursor: pointer; }
.btd-journey-row:hover > .btd-td { background: var(--mp-background-neutral-hovered, #eef0f3); }
.btd-journey-row.btd-row--highlight:hover > .btd-td { background: var(--mp-background-selected, #e8f1fb); }
.btd-date-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.btd-chevron { color: var(--mp-icon-default, var(--mp-text-secondary)); }
.btd-changed-dot {
  display: inline-block; width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px);
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-colors-icon-warning, #e8a100);
}
.btd-snapshot { white-space: normal; background: var(--mp-background-neutral-subtle, #f8f9f9); }
.btd-snapshot-caption { display: block; margin-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.btd-snapshot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--mp-spacing-2) var(--mp-spacing-6); }
.btd-snapshot-value { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

/* ── Attribute change markers (story 9) — quieter than a movement: no stock moved ── */
.btd-changes-toggle { align-self: flex-start; }
.btd-change { white-space: normal; background: var(--mp-background-neutral-subtle, #f8f9f9); }
.btd-change-line { display: flex; align-items: center; gap: var(--mp-spacing-2) var(--mp-spacing-3); flex-wrap: wrap; }
.btd-change-icon { color: var(--mp-icon-default, var(--mp-text-secondary)); flex-shrink: 0; }
.btd-change-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.btd-change-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Related batch ── */
.btd-related { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.btd-related + .btd-related { margin-top: var(--mp-spacing-4); }
.btd-related-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.btd-related-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Empty / not found ── */
.btd-empty { padding: var(--mp-spacing-6) 0; text-align: center; }
.btd-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.btd-empty-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.btd-empty-line { margin: 0; padding: var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.btd-notfound { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-10, 40px) 0; }
.btd-notfound-illustration { width: 288px; height: 240px; object-fit: contain; }
</style>
