<script setup lang="ts">
import { ref, computed } from 'vue'
import { MpButton, MpSelect, MpDatePicker, MpBadge, toast, css } from '@mekari/pixel3'
import {
  inboundQuickView,
  quickViewWarehouseOptions,
  quickViewOperatorOptions,
} from '~/data/inboundQuickView'
import { TODAY_ISO } from '~/data/master'

// ── Filters ──────────────────────────────────────────────────────────────────
const warehouse = ref('all')
const operator = ref('all')
// MpDatePicker round-trips DD/MM/YYYY strings; the metrics work in ISO YYYY-MM-DD.
const [ty, tm, td] = TODAY_ISO.split('-')
const pickerDate = ref(`${td}/${tm}/${ty}`)
const isoDate = computed(() => {
  const [d, m, y] = pickerDate.value.split('/')
  return y && m && d ? `${y}-${m}-${d}` : TODAY_ISO
})

const warehouseOptions = quickViewWarehouseOptions()
const operatorOptions = quickViewOperatorOptions()

const m = computed(() =>
  inboundQuickView({ warehouseId: warehouse.value, date: isoDate.value, operator: operator.value }),
)
const isEmpty = computed(() => {
  const x = m.value
  return x.pending.total + x.receiving.total + x.putaway.total + x.closed.total +
    x.idle.none + x.idle.receivingOpen + x.idle.putawayOpen === 0
})

const filterLine = computed(() => {
  const wh = warehouseOptions.find((o) => o.value === warehouse.value)?.label ?? 'All warehouses'
  const op = operatorOptions.find((o) => o.value === operator.value)?.label ?? 'All'
  return `${wh} · ${isoDate.value} · Operator: ${op}`
})
function drill(target: string, opts?: { noOperator?: boolean }) {
  const line = opts?.noOperator ? filterLine.value.replace(/ · Operator: .*/, '') : filterLine.value
  toast.notify({ variant: 'success', title: `${target} — filters carried over: ${line}`, maxWidth: 'max-content' })
}
function refresh() {
  toast.notify({ variant: 'success', title: 'Quick view refreshed', maxWidth: 'max-content' })
}

// ── Cards ────────────────────────────────────────────────────────────────────
type Row = { n: number; label: string; danger?: boolean; onClick?: () => void }
const statCards = computed<
  { key: string; title: string; sub: string; total: number; accent: string; onTotal: () => void; rows: Row[] }[]
>(() => {
  const x = m.value
  const openPending = () => drill('Inbound delivery · Receipts · Status PENDING', { noOperator: true })
  const openReceiving = () => drill('Inbound delivery · Receiving · Status IN PROCESS')
  const openPutaway = () => drill('Inbound delivery · Putaway · Status IN PROCESS')
  const openClosed = () => drill('Inbound delivery · Receipts · Status COMPLETED', { noOperator: true })
  return [
    {
      key: 'pending', title: 'Pending inbound', sub: 'Not worked on yet · no receiving or putaway task',
      total: x.pending.total, accent: 'var(--mp-text-default)', onTotal: openPending,
      rows: [
        { n: x.pending.due, label: 'Should arrive on this date', onClick: openPending },
        { n: x.pending.overdue, label: 'Should have arrived earlier, still pending', danger: true, onClick: openPending },
      ],
    },
    {
      key: 'receiving', title: 'Inbound on receiving', sub: 'Receiving in progress, started on this date',
      total: x.receiving.total, accent: 'var(--mp-text-link)', onTotal: openReceiving,
      rows: [
        { n: x.receiving.due, label: 'Expected on this date', onClick: openReceiving },
        { n: x.receiving.late, label: 'Expected earlier', danger: true, onClick: openReceiving },
        { n: x.receiving.early, label: 'Expected later, arrived early', onClick: openReceiving },
      ],
    },
    {
      key: 'putaway', title: 'Inbound on putaway', sub: 'Putaway in progress, started on this date',
      total: x.putaway.total, accent: 'var(--mp-text-link)', onTotal: openPutaway,
      rows: [
        { n: x.putaway.due, label: 'Expected on this date', onClick: openPutaway },
        { n: x.putaway.late, label: 'Expected earlier', danger: true, onClick: openPutaway },
        { n: x.putaway.early, label: 'Expected later, put away early', onClick: openPutaway },
      ],
    },
    {
      key: 'closed', title: 'Closed inbound', sub: 'Closed on this date',
      total: x.closed.total, accent: 'var(--mp-text-success)', onTotal: openClosed,
      rows: [
        { n: x.closed.onTime, label: 'Expected on this date', onClick: openClosed },
        { n: x.closed.late, label: 'Expected earlier', onClick: openClosed },
        { n: x.closed.early, label: 'Expected later, closed early', onClick: openClosed },
      ],
    },
  ]
})

// ── Styling (Panda css() — DT2.4 tokens only) ───────────────────────────────
// NB: the surrounding `.stage` (in [...slug].vue) already supplies the white
// surface + 24px padding on all sides + column gap — the page root must NOT add
// its own padding (that double-pads). It only lays out its own sections.
const stage = css({ display: 'flex', flexDirection: 'column', gap: 'var(--mp-spacing-5)' })
const filterBar = css({
  display: 'flex', alignItems: 'flex-end', gap: 'var(--mp-spacing-3)', flexWrap: 'wrap',
  padding: 'var(--mp-spacing-4)', background: 'var(--mp-background-neutral)',
  border: '1px solid var(--mp-border-subtle)', borderRadius: 'var(--mp-radii-lg)',
})
const field = css({ display: 'flex', flexDirection: 'column', gap: 'var(--mp-spacing-1)' })
const fieldLabel = css({ fontSize: '13px', fontWeight: '600', color: 'var(--mp-text-default)' })
const hint = css({ fontSize: '13px', color: 'var(--mp-text-secondary)', maxWidth: '260px', paddingBottom: 'var(--mp-spacing-2)' })
const sectionHead = css({ display: 'flex', alignItems: 'baseline', gap: 'var(--mp-spacing-2)' })
const sectionTitle = css({ margin: '0', fontSize: '19px', fontWeight: '700', color: 'var(--mp-text-default)' })
const emptyNote = css({
  padding: 'var(--mp-spacing-3) var(--mp-spacing-4)', background: 'var(--mp-background-neutral)',
  border: '1px solid var(--mp-border-subtle)', borderRadius: 'var(--mp-radii-md)',
  fontSize: '14px', color: 'var(--mp-text-secondary)',
})
const grid = css({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--mp-spacing-4)' })
const card = css({
  background: 'var(--mp-background-neutral)', border: '1px solid var(--mp-border-default)',
  borderRadius: 'var(--mp-radii-lg)',
  padding: 'var(--mp-spacing-5)', display: 'flex', flexDirection: 'column', gap: 'var(--mp-spacing-4)',
})
const cardWide = `${card} ${css({ gridColumn: 'span 2' })}`
const cardHead = css({ display: 'flex', flexDirection: 'column', gap: 'var(--mp-spacing-1)' })
const cardTitle = css({ fontSize: '14px', fontWeight: '600', color: 'var(--mp-text-default)' })
const cardSub = css({ fontSize: '12px', color: 'var(--mp-text-secondary)' })
const bigRow = css({ display: 'flex', alignItems: 'baseline', gap: 'var(--mp-spacing-2)', cursor: 'pointer' })
const bigNum = css({ fontSize: '40px', fontWeight: '700', lineHeight: '1', letterSpacing: '-0.02em' })
const unit = css({ fontSize: '13px', color: 'var(--mp-text-secondary)' })
const rows = css({ display: 'flex', flexDirection: 'column', gap: 'var(--mp-spacing-1)', borderTop: '1px solid var(--mp-border-subtle)', paddingTop: 'var(--mp-spacing-3)' })
const rowItem = css({ display: 'flex', alignItems: 'center', gap: 'var(--mp-spacing-3)', padding: 'var(--mp-spacing-2)', borderRadius: 'var(--mp-radii-sm)', cursor: 'pointer', _hover: { background: 'var(--mp-background-neutral-subtle)' } })
const rowNum = css({ fontSize: '18px', fontWeight: '700', minWidth: '28px' })
const rowLabel = css({ fontSize: '13px', color: 'var(--mp-text-secondary)', flex: '1' })
const idleGrid = css({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--mp-spacing-3)' })
const idleTile = css({ padding: 'var(--mp-spacing-4)', border: '1px solid var(--mp-border-subtle)', borderRadius: 'var(--mp-radii-md)', display: 'flex', flexDirection: 'column', gap: 'var(--mp-spacing-2)' })
const idleTileClickable = `${idleTile} ${css({ cursor: 'pointer', _hover: { borderColor: 'var(--mp-border-bold)', background: 'var(--mp-background-neutral-subtle)' } })}`
const idleNum = css({ fontSize: '30px', fontWeight: '700', lineHeight: '1', color: 'var(--mp-text-default)' })
const idleLabel = css({ fontSize: '13px', color: 'var(--mp-text-secondary)' })
const idleHint = css({ fontSize: '11px', fontWeight: '600', color: 'var(--mp-text-link)' })
const headerRow = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--mp-spacing-4)' })
const updated = css({ fontSize: '13px', color: 'var(--mp-text-secondary)' })
</script>

<template>
  <div :class="stage">
    <!-- Header actions -->
    <div :class="headerRow">
      <div :class="sectionHead">
        <h2 :class="sectionTitle">Inbound quick view</h2>
        <MpBadge for="additionalInformation" type="completed" size="sm">Live</MpBadge>
      </div>
      <div :class="css({ display: 'flex', alignItems: 'center', gap: 'var(--mp-spacing-3)' })">
        <span :class="updated">Updated {{ isoDate }} · Asia/Jakarta</span>
        <MpButton variant="secondary" size="sm" is-rounded @click="refresh">Refresh</MpButton>
      </div>
    </div>

    <!-- Filters -->
    <div :class="filterBar">
      <div :class="field">
        <span :class="fieldLabel">Warehouse</span>
        <MpSelect id="iqv-warehouse" size="sm" :model-value="warehouse" @change="(_e: Event, v: string) => (warehouse = v)">
          <option v-for="o in warehouseOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </MpSelect>
      </div>
      <div :class="field">
        <span :class="fieldLabel">Date</span>
        <MpDatePicker id="iqv-date" v-model="pickerDate" format="DD/MM/YYYY" value-type="format" size="sm" use-portal />
      </div>
      <div :class="field">
        <span :class="fieldLabel">Operator (receiver / putaway PIC)</span>
        <MpSelect id="iqv-operator" size="sm" :model-value="operator" @change="(_e: Event, v: string) => (operator = v)">
          <option v-for="o in operatorOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </MpSelect>
      </div>
      <span :class="hint">Live view. Operator filter does not apply to pending and closed inbound.</span>
    </div>

    <div v-if="isEmpty" :class="emptyNote">
      No inbound activity for this warehouse and date. Cards show zero.
    </div>

    <!-- Cards -->
    <div :class="grid">
      <div v-for="c in statCards" :key="c.key" :class="card">
        <div :class="cardHead">
          <span :class="cardTitle">{{ c.title }}</span>
          <span :class="cardSub">{{ c.sub }}</span>
        </div>
        <div :class="bigRow" @click="c.onTotal">
          <span :class="bigNum" :style="{ color: c.accent }">{{ c.total }}</span>
          <span :class="unit">inbound</span>
        </div>
        <div :class="rows">
          <div v-for="(r, i) in c.rows" :key="i" :class="rowItem" @click="r.onClick && r.onClick()">
            <span :class="rowNum" :style="{ color: r.danger ? 'var(--mp-text-critical)' : 'var(--mp-text-default)' }">{{ r.n }}</span>
            <span :class="rowLabel">{{ r.label }}</span>
          </div>
        </div>
      </div>

      <!-- No ongoing action (spans two columns) -->
      <div :class="cardWide">
        <div :class="css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--mp-spacing-4)' })">
          <div :class="cardHead">
            <span :class="cardTitle">Inbound with no ongoing action</span>
            <span :class="cardSub">In progress, but nothing is being worked on right now</span>
          </div>
          <MpBadge for="additionalInformation" type="warning" size="sm">Needs action</MpBadge>
        </div>
        <div :class="idleGrid">
          <div :class="idleTile">
            <span :class="idleNum">{{ m.idle.none }}</span>
            <span :class="idleLabel">No task at all</span>
            <span :class="css({ fontSize: '11px', color: 'var(--mp-text-disabled)' })">No drill-down</span>
          </div>
          <div :class="idleTileClickable" @click="drill('Inbound delivery · Receiving · Status OPEN')">
            <span :class="idleNum">{{ m.idle.receivingOpen }}</span>
            <span :class="idleLabel">Receiving task open, not started</span>
            <span :class="idleHint">Open receiving list</span>
          </div>
          <div :class="idleTileClickable" @click="drill('Inbound delivery · Putaway · Status OPEN')">
            <span :class="idleNum">{{ m.idle.putawayOpen }}</span>
            <span :class="idleLabel">Putaway task open, not started</span>
            <span :class="idleHint">Open putaway list</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
