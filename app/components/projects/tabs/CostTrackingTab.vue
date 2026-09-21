<script setup lang="ts">
/**
 * Cost tracking tab — read-only rollup of cost entered on real ERP documents
 * (Expense, Purchase, Timesheet, PR, PO, WO) with Project at line level
 * (PRD §9, Story 14). Groupable by work package, cost account, source document
 * or any dimension. Ambiguous entries (scrap, consumables, factory overhead)
 * must be classified before they count toward project actual.
 */
import WoJournalOverlay from '../WoJournalOverlay.vue'
import type { Project } from '~/data/projects'
import { getWorkPackage, projectWorkPackages } from '~/data/projects'
import { accountName, COGM_ACCOUNT } from '~/data/projectBudgets'
import { projectCostLines, projectWos, countsAsProjectCost, woCommitted } from '~/data/projectTransactions'
import { classifyCost } from '~/data/projectActions'
import { rp } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { toast } from '@mekari/pixel3'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const { asActor } = useProjectRole()

type GroupBy = 'wp' | 'account' | 'doc' | 'branch' | 'department' | 'costCenter' | 'fundingSource'
const groupBy = ref<GroupBy>('wp')
const kindFilter = ref<'all' | 'actual' | 'committed'>('all')
const GROUPS: { key: GroupBy; label: string }[] = [
  { key: 'wp', label: 'Work package' },
  { key: 'account', label: 'Cost account' },
  { key: 'doc', label: 'Source document' },
  { key: 'branch', label: 'Branch' },
  { key: 'department', label: 'Department' },
  { key: 'costCenter', label: 'Cost center' },
  { key: 'fundingSource', label: 'Funding source' },
]

interface Row {
  id: string; date: string; docType: string; docNo: string; description: string; wpId: string; account: string
  amount: number; kind: 'actual' | 'committed'; dims: Record<string, string | undefined>; counts: boolean
  ambiguous?: string; classification?: string; woId?: string; lineId?: string
}

const allRows = computed<Row[]>(() => {
  const dims = props.project.dimensions as Record<string, string | undefined>
  const out: Row[] = projectCostLines(props.project.id).map(l => ({
    id: l.id, lineId: l.id, date: l.date, docType: l.docType, docNo: l.docNo, description: l.description, wpId: l.wpId, account: l.account,
    amount: l.amount, kind: l.kind, dims: (l.dimensions ?? dims) as Record<string, string | undefined>, counts: countsAsProjectCost(l),
    ambiguous: l.ambiguous, classification: l.classification,
  }))
  for (const w of projectWos(props.project.id)) {
    if (w.status === 'Draft') continue
    if (w.actual) out.push({ id: `${w.id}-a`, woId: w.id, date: w.completedAt ?? w.createdAt, docType: 'Work order', docNo: w.number, description: `${t('Absorbed production cost')} — ${w.qty} ${w.unit}`, wpId: w.wpId, account: COGM_ACCOUNT, amount: w.actual, kind: 'actual', dims, counts: true })
    const c = woCommitted(w)
    if (c) out.push({ id: `${w.id}-c`, woId: w.id, date: w.createdAt, docType: 'Work order', docNo: w.number, description: t('Budget set aside, not yet consumed'), wpId: w.wpId, account: COGM_ACCOUNT, amount: c, kind: 'committed', dims, counts: true })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
})
const rows = computed(() => allRows.value.filter(r => kindFilter.value === 'all' || r.kind === kindFilter.value))
const needsClass = computed(() => allRows.value.filter(r => r.ambiguous && !r.classification))

function groupKey(r: Row): string {
  switch (groupBy.value) {
    case 'wp': { const w = getWorkPackage(r.wpId); return w ? (w.auto ? props.project.name : `${w.code} ${w.name}`) : '—' }
    case 'account': return `${r.account} ${t(accountName(r.account))}`
    case 'doc': return t(r.docType)
    default: return r.dims[groupBy.value] ?? t('(none)')
  }
}
const order = computed(() => new Map(projectWorkPackages(props.project.id).map((w, i) => [w.auto ? props.project.name : `${w.code} ${w.name}`, i])))
const groups = computed(() => {
  const m = new Map<string, Row[]>()
  for (const r of rows.value) { const k = groupKey(r); m.set(k, [...(m.get(k) ?? []), r]) }
  const list = [...m.entries()].map(([key, items]) => ({
    key, items,
    actual: items.filter(i => i.kind === 'actual' && i.counts).reduce((s, i) => s + i.amount, 0),
    committed: items.filter(i => i.kind === 'committed').reduce((s, i) => s + i.amount, 0),
  }))
  if (groupBy.value === 'wp') list.sort((a, b) => (order.value.get(a.key) ?? 99) - (order.value.get(b.key) ?? 99))
  else list.sort((a, b) => a.key.localeCompare(b.key))
  return list
})
const totals = computed(() => ({
  actual: groups.value.reduce((s, g) => s + g.actual, 0),
  committed: groups.value.reduce((s, g) => s + g.committed, 0),
}))
const collapsed = ref<Set<string>>(new Set())
function toggle(k: string) { const s = new Set(collapsed.value); s.has(k) ? s.delete(k) : s.add(k); collapsed.value = s }

function classify(r: Row, c: 'project' | 'overhead') {
  if (!r.lineId) return
  classifyCost(r.lineId, c, asActor.value)
  toast.notify({ variant: 'success', title: c === 'project' ? t('Counted as project cost') : t('Absorbed as overhead — not project cost') })
}
const journalWo = ref<string | undefined>()
</script>

<template>
  <div class="pm-stack" style="gap: 16px">
    <div v-if="needsClass.length" class="pm-card" style="border-color: #fbdca6; background: #fffaf0">
      <div class="pm-row" style="margin-bottom: 8px">
        <h3 class="pm-h3">{{ t('Needs classification') }} ({{ needsClass.length }})</h3>
      </div>
      <p class="pm-desc" style="margin: 0 0 10px">{{ t('Scrap, consumables and factory overhead don’t count toward project actual until someone decides: project cost, or absorbed as overhead.') }}</p>
      <div class="pm-table-wrap" style="background: #fff">
        <table class="pm-table">
          <tbody>
            <tr v-for="r in needsClass" :key="r.id">
              <td>{{ formatDate(r.date) }}</td>
              <td>{{ r.docNo }}</td>
              <td class="pm-wrap">{{ r.description }}<span class="pm-cell-sub">{{ t(r.ambiguous === 'scrap' ? 'Scrap' : r.ambiguous === 'consumables' ? 'Consumables' : 'Factory overhead') }} · {{ getWorkPackage(r.wpId)?.code }} {{ getWorkPackage(r.wpId)?.name }}</span></td>
              <td class="pm-num">{{ rp(r.amount) }}</td>
              <td>
                <div class="pm-row" style="gap: 6px; flex-wrap: nowrap">
                  <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" :disabled="project.status === 'closed'" @click="classify(r, 'project')">{{ t('Project cost') }}</button>
                  <button class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm" type="button" :disabled="project.status === 'closed'" @click="classify(r, 'overhead')">{{ t('Absorb as overhead') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pm-row">
      <div>
        <h2 class="pm-h2">{{ t('Cost tracking') }}</h2>
        <p class="pm-desc">{{ t('Read-only. Cost is entered on real documents with the project on every line — there is no parallel entry surface here.') }}</p>
      </div>
    </div>

    <div class="pm-filters" style="margin-bottom: 0">
      <label class="pm-small pm-muted" for="ct-group">{{ t('Group by') }}</label>
      <select id="ct-group" v-model="groupBy" class="pm-select">
        <option v-for="g in GROUPS" :key="g.key" :value="g.key">{{ t(g.label) }}</option>
      </select>
      <div class="pm-seg">
        <button type="button" :class="{ 'pm-seg--active': kindFilter === 'all' }" @click="kindFilter = 'all'">{{ t('All') }}</button>
        <button type="button" :class="{ 'pm-seg--active': kindFilter === 'actual' }" @click="kindFilter = 'actual'">{{ t('Actual') }}</button>
        <button type="button" :class="{ 'pm-seg--active': kindFilter === 'committed' }" @click="kindFilter = 'committed'">{{ t('Committed') }}</button>
      </div>
      <span class="pm-spacer" />
      <span class="pm-small pm-muted">{{ t('Actual') }} <strong class="pm-strong" style="color: var(--mp-text-default)">{{ rp(totals.actual) }}</strong> · {{ t('Committed') }} <strong style="color: var(--mp-text-default)">{{ rp(totals.committed) }}</strong></span>
    </div>

    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead>
          <tr>
            <th>{{ t('Date') }}</th>
            <th>{{ t('Source document') }}</th>
            <th>{{ t('Description') }}</th>
            <th v-if="groupBy !== 'wp'">{{ t('Work package') }}</th>
            <th v-if="groupBy !== 'account'">{{ t('Account') }}</th>
            <th>{{ t('Type') }}</th>
            <th class="pm-num">{{ t('Amount') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="g in groups" :key="g.key">
            <tr class="pm-tr-sub pm-tr-click" @click="toggle(g.key)">
              <td :colspan="groupBy === 'wp' || groupBy === 'account' ? 5 : 6">
                <span style="display: inline-block; width: 16px">{{ collapsed.has(g.key) ? '▸' : '▾' }}</span>{{ g.key }}
                <span class="pm-muted" style="font-weight: 400"> · {{ g.items.length }} {{ t('entries') }}</span>
              </td>
              <td class="pm-num">{{ rp(g.actual) }}<span v-if="g.committed" class="pm-cell-sub">+ {{ rp(g.committed) }} {{ t('committed') }}</span></td>
            </tr>
            <template v-if="!collapsed.has(g.key)">
              <tr v-for="r in g.items" :key="r.id">
                <td>{{ formatDate(r.date) }}</td>
                <td>
                  <button v-if="r.woId" class="pm-link" type="button" @click="journalWo = r.woId">{{ r.docNo }}</button>
                  <template v-else>{{ r.docNo }}</template>
                  <span class="pm-cell-sub">{{ t(r.docType) }}</span>
                </td>
                <td class="pm-wrap">{{ r.description }}</td>
                <td v-if="groupBy !== 'wp'">{{ getWorkPackage(r.wpId)?.auto ? '—' : `${getWorkPackage(r.wpId)?.code} ${getWorkPackage(r.wpId)?.name}` }}</td>
                <td v-if="groupBy !== 'account'">{{ t(accountName(r.account)) }}</td>
                <td>
                  <span class="pm-pill" :class="r.kind === 'actual' ? 'pm-pill--green' : 'pm-pill--blue'">{{ r.kind === 'actual' ? t('Actual') : t('Committed') }}</span>
                  <span v-if="r.ambiguous && !r.classification" class="pm-cell-sub pm-warn">{{ t('Not counted — classify first') }}</span>
                  <span v-else-if="r.classification === 'overhead'" class="pm-cell-sub">{{ t('Absorbed as overhead') }}</span>
                </td>
                <td class="pm-num" :class="{ 'pm-muted': !r.counts }">{{ rp(r.amount) }}</td>
              </tr>
            </template>
          </template>
          <tr v-if="!groups.length"><td colspan="7"><div class="pm-empty">{{ t('No cost recorded yet.') }}</div></td></tr>
        </tbody>
      </table>
    </div>

    <WoJournalOverlay :wo-id="journalWo" @close="journalWo = undefined" />
  </div>
</template>
