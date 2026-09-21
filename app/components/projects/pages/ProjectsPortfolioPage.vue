<script setup lang="ts">
/**
 * Projects — portfolio (Story 15). Service engagements and production jobs sit
 * in one list with the same columns and the same PS- series (Story 1). Drilling
 * in lands on the project's Budget tab, not a numberless accordion.
 */
import PmTitleBar from '../PmTitleBar.vue'
import { projects, methodLabel, type Project } from '~/data/projects'
import { projectSummary } from '~/data/projectSummary'
import { pendingApprovals } from '~/data/projectApprovals'
import { rp, rpShort, pct } from '~/utils/projectFormat'

const { t } = useLocale()
const router = useRouter()

const search = ref('')
const statusFilter = ref<'' | Project['status']>('')
const dimKey = ref<'' | 'branch' | 'department' | 'costCenter' | 'fundingSource'>('')
const dimValue = ref('')

const DIMENSIONS = [
  { key: 'branch', label: 'Branch' },
  { key: 'department', label: 'Department' },
  { key: 'costCenter', label: 'Cost center' },
  { key: 'fundingSource', label: 'Funding source' },
] as const

const dimOptions = computed(() => {
  if (!dimKey.value) return []
  const k = dimKey.value
  return [...new Set(projects.map(p => p.dimensions[k]).filter(Boolean) as string[])].sort()
})
watch(dimKey, () => { dimValue.value = '' })

const rows = computed(() => projects
  .filter(p => !statusFilter.value || p.status === statusFilter.value)
  .filter(p => !dimKey.value || !dimValue.value || p.dimensions[dimKey.value] === dimValue.value)
  .filter(p => {
    const s = search.value.trim().toLowerCase()
    return !s || p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || p.customer.toLowerCase().includes(s)
  })
  .map(p => projectSummary(p.id)!)
  .sort((a, b) => b.project.code.localeCompare(a.project.code)))

const open = computed(() => projects.filter(p => p.status !== 'closed').map(p => projectSummary(p.id)!))
const stats = computed(() => ({
  active: projects.filter(p => p.status === 'active').length,
  draft: projects.filter(p => p.status === 'draft').length,
  contract: open.value.reduce((s, r) => s + r.project.contractValue, 0),
  underbilled: open.value.filter(r => r.wip > 0).reduce((s, r) => s + r.wip, 0),
  overbilled: open.value.filter(r => r.wip < 0).reduce((s, r) => s - r.wip, 0),
  overBudget: open.value.filter(r => r.overBudgetNodes.length).length,
  exposure: open.value.reduce((s, r) => s + r.coExposure, 0),
  approvals: pendingApprovals().length,
}))

const STATUS_TONE: Record<Project['status'], string> = { draft: 'pm-pill--gray', active: 'pm-pill--green', closed: 'pm-pill--blue' }
const STATUS_LABEL: Record<Project['status'], string> = { draft: 'Draft', active: 'Active', closed: 'Closed' }

function openProject(id: string) { router.push(`/projects/${id}?tab=budget`) }
function consumedTone(consumed: number, budget?: number) {
  if (!budget) return ''
  const r = consumed / budget
  return r > 1 ? 'pm-bar-fill--red' : r > 0.9 ? 'pm-bar-fill--warn' : ''
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Projects')">
      <template #actions>
        <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" type="button" @click="router.push('/projects/new')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          {{ t('Project') }}
        </button>
      </template>
    </PmTitleBar>

    <div class="pm-stage">
      <!-- Portfolio stats -->
      <div class="pm-grid-4" style="margin-bottom: 20px">
        <div class="pm-card">
          <div class="pm-stat-label">{{ t('Open projects') }}</div>
          <div class="pm-stat-value">{{ stats.active + stats.draft }}</div>
          <div class="pm-stat-note">{{ stats.active }} {{ t('active') }} · {{ stats.draft }} {{ t('draft') }} · {{ rpShort(stats.contract) }} {{ t('contract value') }}</div>
        </div>
        <div class="pm-card">
          <div class="pm-stat-label">{{ t('WIP position') }}</div>
          <div class="pm-stat-value">
            <span class="pm-pos">{{ rpShort(stats.underbilled) }}</span>
            <span class="pm-muted" style="font-weight: 400"> / </span>
            <span class="pm-neg">{{ rpShort(stats.overbilled) }}</span>
          </div>
          <div class="pm-stat-note">{{ t('Underbilled (asset) / overbilled (liability)') }}</div>
        </div>
        <div class="pm-card">
          <div class="pm-stat-label">{{ t('Over budget') }}</div>
          <div class="pm-stat-value" :class="{ 'pm-neg': stats.overBudget }">{{ stats.overBudget }}</div>
          <div class="pm-stat-note">{{ t('Projects with a work package over its budget') }}</div>
        </div>
        <div class="pm-card">
          <div class="pm-stat-label">{{ t('Change-order exposure') }}</div>
          <div class="pm-stat-value" :class="{ 'pm-warn': stats.exposure }">{{ rp(stats.exposure) }}</div>
          <div class="pm-stat-note">
            {{ t('Executed but not signed off') }} ·
            <button class="pm-link" type="button" @click="router.push('/project-approvals')">{{ stats.approvals }} {{ t('approvals pending') }}</button>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="pm-filters">
        <select v-model="statusFilter" class="pm-select" :aria-label="t('Status')">
          <option value="">{{ t('All statuses') }}</option>
          <option value="draft">{{ t('Draft') }}</option>
          <option value="active">{{ t('Active') }}</option>
          <option value="closed">{{ t('Closed') }}</option>
        </select>
        <select v-model="dimKey" class="pm-select" :aria-label="t('Dimension')">
          <option value="">{{ t('Filter by dimension') }}</option>
          <option v-for="d in DIMENSIONS" :key="d.key" :value="d.key">{{ t(d.label) }}</option>
        </select>
        <select v-if="dimKey" v-model="dimValue" class="pm-select" :aria-label="t('Dimension value')">
          <option value="">{{ t('Any') }}</option>
          <option v-for="o in dimOptions" :key="o" :value="o">{{ o }}</option>
        </select>
        <div class="pm-spacer" />
        <label class="pm-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input v-model="search" type="text" :placeholder="t('Search project, customer...')" />
        </label>
      </div>

      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Project') }}</th>
              <th>{{ t('Shape') }}</th>
              <th>{{ t('Method · measure') }}</th>
              <th>{{ t('Status') }}</th>
              <th class="pm-num">{{ t('Budget') }}</th>
              <th class="pm-num">{{ t('Committed') }}</th>
              <th class="pm-num">{{ t('Actual') }}</th>
              <th style="min-width: 130px">{{ t('Consumed') }}</th>
              <th class="pm-num">{{ t('% complete') }}</th>
              <th class="pm-num">{{ t('Billed') }}</th>
              <th class="pm-num">{{ t('WIP position') }}</th>
              <th>{{ t('Flags') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.project.id" class="pm-tr-click" @click="openProject(r.project.id)">
              <td class="pm-wrap" style="min-width: 260px">
                <button class="pm-link pm-strong" type="button" @click.stop="openProject(r.project.id)">{{ r.project.code }}</button>
                <span class="pm-cell-sub" style="color: var(--mp-text-default)">{{ r.project.name }}</span>
                <span class="pm-cell-sub">{{ r.project.customer }} · PM {{ r.project.pm }}</span>
              </td>
              <td>
                <span class="pm-pill pm-pill--outline">{{ r.project.isProduction ? t('Production') : t('Service') }}</span>
                <span class="pm-cell-sub">{{ t('Depth') }} {{ r.project.depth }}</span>
              </td>
              <td>{{ t(methodLabel(r.project)) }}</td>
              <td><span class="pm-pill" :class="STATUS_TONE[r.project.status]">{{ t(STATUS_LABEL[r.project.status]) }}</span></td>
              <td class="pm-num">
                <template v-if="r.budget !== undefined">{{ rp(r.budget) }}</template>
                <span v-else class="pm-warn">{{ t('Not set') }}</span>
              </td>
              <td class="pm-num">{{ rp(r.committed) }}</td>
              <td class="pm-num">{{ rp(r.actual) }}</td>
              <td>
                <template v-if="r.budget">
                  <div class="pm-bar-track"><div class="pm-bar-fill" :class="consumedTone(r.consumed, r.budget)" :style="{ width: Math.min(r.consumed / r.budget * 100, 100) + '%' }" /></div>
                  <span class="pm-cell-sub">{{ pct(r.consumed / r.budget * 100, 0) }} {{ t('of budget') }}</span>
                </template>
                <span v-else class="pm-muted">—</span>
              </td>
              <td class="pm-num">
                <template v-if="r.percentComplete !== undefined">{{ pct(r.percentComplete) }}</template>
                <span v-else class="pm-muted" :title="r.project.method === 'tm' ? t('T&M has no % complete — revenue follows billed time') : t('Budget not set')">—</span>
              </td>
              <td class="pm-num">{{ rp(r.billed) }}</td>
              <td class="pm-num">
                <template v-if="r.wip">
                  <span :class="r.wip > 0 ? 'pm-pos' : 'pm-neg'">{{ rp(Math.abs(r.wip)) }}</span>
                  <span class="pm-cell-sub">{{ r.wip > 0 ? t('Underbilled') : t('Overbilled') }}</span>
                </template>
                <span v-else class="pm-muted">{{ rp(0) }}</span>
              </td>
              <td>
                <div class="pm-row" style="gap: 4px">
                  <span v-if="r.overBudgetNodes.length" class="pm-pill pm-pill--red" :title="r.overBudgetNodes.map(n => n.label).join(', ')">{{ t('Over budget') }} ({{ r.overBudgetNodes.length }})</span>
                  <span v-if="r.coExposure" class="pm-pill pm-pill--yellow">{{ t('CO exposure') }} {{ rpShort(r.coExposure) }}</span>
                  <span v-if="r.pendingCount" class="pm-pill pm-pill--blue">{{ r.pendingCount }} {{ t('pending') }}</span>
                  <span v-if="!r.overBudgetNodes.length && !r.coExposure && !r.pendingCount" class="pm-muted">—</span>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="12"><div class="pm-empty"><div class="pm-empty-title">{{ t('No projects found') }}</div>{{ t('Try a different filter or search.') }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
