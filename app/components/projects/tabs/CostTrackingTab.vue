<script setup lang="ts">
/**
 * Cost tracking tab — read-only rollup of cost entered on real ERP documents
 * (Expense, Purchase, Timesheet, PR, PO, WO) with Project at line level
 * (PRD §9, Story 14). Groupable by work package, cost account, source document
 * or any dimension. Ambiguous entries (scrap, consumables, factory overhead)
 * must be classified before they count toward project actual.
 */
import { MpButton, MpButtonGroup, MpIcon, MpSegmentedControl, MpTextlink } from '@mekari/pixel3'
import WoJournalOverlay from '../WoJournalOverlay.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import type { Project } from '~/data/projects'
import { getWorkPackage, projectWorkPackages } from '~/data/projects'
import { accountName, COGM_ACCOUNT } from '~/data/projectBudgets'
import { projectCostLines, projectWos, countsAsProjectCost, woCommitted } from '~/data/projectTransactions'
import { classifyCost } from '~/data/projectActions'
import { rp } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const { asActor } = useProjectRole()

type GroupBy = 'wp' | 'account' | 'doc' | 'branch' | 'department' | 'costCenter' | 'fundingSource'
const groupBy = ref<GroupBy>('wp')
const kindFilter = ref<'all' | 'actual' | 'committed'>('all')
const groupOptions = computed(() => GROUPS.map(g => ({ value: g.key, label: t(g.label) })))
const kindOptions = computed(() => [
  { id: 'ct-kind-all', label: t('All'), value: 'all' },
  { id: 'ct-kind-actual', label: t('Actual'), value: 'actual' },
  { id: 'ct-kind-committed', label: t('Committed'), value: 'committed' },
])
function setGroup(v: string) { groupBy.value = (v || 'wp') as GroupBy }
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
  successToast(c === 'project' ? t('Counted as project cost') : t('Absorbed as overhead — not project cost'))
}
const journalWo = ref<string | undefined>()
</script>

<template>
  <div class="pm-stack pm-gap-4">
    <div v-if="needsClass.length" class="pm-card pm-card--warning">
      <h3 class="pm-h3 pm-mb-2">{{ t('Needs classification') }} ({{ needsClass.length }})</h3>
      <p class="pm-caption pm-mt-2 pm-mb-3">{{ t('Scrap, consumables and factory overhead don’t count toward project actual until someone decides: project cost, or absorbed as overhead.') }}</p>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <tbody>
            <tr v-for="r in needsClass" :key="r.id">
              <td>{{ formatDate(r.date) }}</td>
              <td>{{ r.docNo }}</td>
              <td class="pm-wrap">{{ r.description }}<span class="pm-cell-sub">{{ t(r.ambiguous === 'scrap' ? 'Scrap' : r.ambiguous === 'consumables' ? 'Consumables' : 'Factory overhead') }} · {{ getWorkPackage(r.wpId)?.code }} {{ getWorkPackage(r.wpId)?.name }}</span></td>
              <td class="pm-num">{{ rp(r.amount) }}</td>
              <td>
                <MpButtonGroup v-if="project.status !== 'closed'" class="pm-cell-actions">
                  <MpButton :id="`ct-classify-project-${r.id}`" variant="secondary" is-rounded size="sm" @click="classify(r, 'project')">{{ t('Project cost') }}</MpButton>
                  <MpButton :id="`ct-classify-overhead-${r.id}`" variant="ghost" is-rounded size="sm" @click="classify(r, 'overhead')">{{ t('Absorb as overhead') }}</MpButton>
                </MpButtonGroup>
                <span v-else class="pm-caption">{{ t('Project is closed') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pm-row">
      <div>
        <h2 class="pm-h2">{{ t('Cost tracking') }}</h2>
        <p class="pm-caption pm-m-0">{{ t('Read-only. Cost is entered on real documents with the project on every line — there is no parallel entry surface here.') }}</p>
      </div>
    </div>

    <div class="pm-filters">
      <span class="pm-small pm-muted">{{ t('Group by') }}</span>
      <ErpFilterSelect id="ct-group" :model-value="groupBy" :placeholder="t('Group by')" :options="groupOptions" :is-clearable="false" @update:model-value="setGroup" />
      <MpSegmentedControl id="ct-kind" name="ct-kind" v-model="kindFilter" :data="kindOptions" />
      <span class="pm-spacer" />
      <span class="pm-small pm-muted">{{ t('Actual') }} <strong class="pm-strong">{{ rp(totals.actual) }}</strong> · {{ t('Committed') }} <strong class="pm-strong">{{ rp(totals.committed) }}</strong></span>
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
                <span class="pm-row pm-row--nowrap pm-gap-1">
                  <MpIcon :name="collapsed.has(g.key) ? 'chevrons-right' : 'chevrons-down'" size="sm" />
                  <span>{{ g.key }}</span>
                  <span class="pm-muted"> · {{ g.items.length }} {{ t('entries') }}</span>
                </span>
              </td>
              <td class="pm-num">{{ rp(g.actual) }}<span v-if="g.committed" class="pm-cell-sub">+ {{ rp(g.committed) }} {{ t('committed') }}</span></td>
            </tr>
            <template v-if="!collapsed.has(g.key)">
              <tr v-for="r in g.items" :key="r.id">
                <td>{{ formatDate(r.date) }}</td>
                <td>
                  <MpTextlink v-if="r.woId" :id="`ct-journal-${r.id}`" as="a" @click.prevent="journalWo = r.woId">{{ r.docNo }}</MpTextlink>
                  <template v-else>{{ r.docNo }}</template>
                  <span class="pm-cell-sub">{{ t(r.docType) }}</span>
                </td>
                <td class="pm-wrap">{{ r.description }}</td>
                <td v-if="groupBy !== 'wp'">{{ getWorkPackage(r.wpId)?.auto ? '—' : `${getWorkPackage(r.wpId)?.code} ${getWorkPackage(r.wpId)?.name}` }}</td>
                <td v-if="groupBy !== 'account'">{{ t(accountName(r.account)) }}</td>
                <td>
                  <ErpStatusBadge v-bind="badgeProps('cost', r.kind, t)" />
                  <span v-if="r.ambiguous && !r.classification" class="pm-cell-sub pm-warn">{{ t('Not counted — classify first') }}</span>
                  <span v-else-if="r.classification === 'overhead'" class="pm-cell-sub">{{ t('Absorbed as overhead') }}</span>
                </td>
                <td class="pm-num" :class="{ 'pm-muted': !r.counts }">{{ rp(r.amount) }}</td>
              </tr>
            </template>
          </template>
          <tr v-if="!groups.length"><td colspan="7"><div class="pm-empty-inline">{{ t('No cost recorded yet.') }}</div></td></tr>
        </tbody>
      </table>
    </div>

    <WoJournalOverlay :wo-id="journalWo" @close="journalWo = undefined" />
  </div>
</template>
