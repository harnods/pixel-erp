<script setup lang="ts">
/**
 * Project page — header + tabs (PRD "Mockup & Design"):
 *   Structure · Budget · Cost tracking · Recognition & billing ·
 *   Changes — commercial & engineering · Production & materials (production only) · Completion
 *
 * Header: status pill (Draft / Active / Closed), role-labelled approval button
 * shown only while Draft (Story 7), and View history → audit page pre-filtered (D4).
 */
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu, { type PmMenuItem } from '../PmMenu.vue'
import PmOverlay from '../PmOverlay.vue'
import StructureTab from '../tabs/StructureTab.vue'
import BudgetTab from '../tabs/BudgetTab.vue'
import CostTrackingTab from '../tabs/CostTrackingTab.vue'
import RecognitionTab from '../tabs/RecognitionTab.vue'
import ChangesTab from '../tabs/ChangesTab.vue'
import ProductionTab from '../tabs/ProductionTab.vue'
import CompletionTab from '../tabs/CompletionTab.vue'
import { getProject, methodLabel, weightTotal } from '~/data/projects'
import { getBudget } from '~/data/projectBudgets'
import { projectSummary } from '~/data/projectSummary'
import { pendingApprovals } from '~/data/projectApprovals'
import { approveProject, reopenProject } from '~/data/projectActions'
import { rp, pct } from '~/utils/projectFormat'
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ projectId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { current, asActor } = useProjectRole()

const project = computed(() => getProject(props.projectId))
const summary = computed(() => project.value ? projectSummary(project.value.id) : undefined)

const TABS = computed(() => {
  const p = project.value
  const list = [
    { key: 'structure', label: 'Structure' },
    { key: 'budget', label: 'Budget' },
    { key: 'cost', label: 'Cost tracking' },
    { key: 'recognition', label: 'Recognition & billing' },
    { key: 'changes', label: 'Changes — commercial & engineering' },
  ]
  if (p?.isProduction) list.push({ key: 'production', label: 'Production & materials' })
  list.push({ key: 'completion', label: 'Completion' })
  return list
})
const activeTab = computed(() => {
  const q = String(route.query.tab ?? 'structure')
  return TABS.value.some(x => x.key === q) ? q : 'structure'
})
function setTab(key: string) { router.replace({ query: { ...route.query, tab: key } }) }

const STATUS_TONE = { draft: 'pm-pill--gray', active: 'pm-pill--green', closed: 'pm-pill--blue' } as const
const STATUS_LABEL = { draft: 'Draft', active: 'Active', closed: 'Closed' } as const

// ── Approval gate (Draft only, role-labelled) ──
const approveOpen = ref(false)
const approveLabel = computed(() => `${t('Approve as')} ${t(current.value.label)}`)
const approveBlockers = computed(() => {
  const p = project.value
  if (!p) return []
  const out: string[] = []
  if (!getBudget(p.id)) out.push(t('No budget baseline yet — approval is allowed, but every budget check will read “not set” until one is linked in Budget setup.'))
  if (p.method === 'output' && p.measure === 'milestone' && weightTotal(p.id) !== 100) out.push(`${t('Progress weights total')} ${pct(weightTotal(p.id))}, ${t('not 100%.')}`)
  return out
})
function doApprove() {
  if (!project.value) return
  if (notifyResult(approveProject(project.value.id, asActor.value), t('Project approved'))) approveOpen.value = false
}

// ── Re-open approval ──
const reopenOpen = ref(false)
const reopenReason = ref('')
function doReopen() {
  if (!project.value) return
  if (!reopenReason.value.trim()) return
  if (notifyResult(reopenProject(project.value.id, reopenReason.value, asActor.value), t('Project re-opened to Draft'))) { reopenOpen.value = false; reopenReason.value = '' }
}

const actions = computed<PmMenuItem[]>(() => {
  const p = project.value
  if (!p) return []
  const closed = p.status === 'closed'
  return [
    { label: t('New work order'), action: () => router.push(`/projects/${p.id}/work-orders/new`), disabledReason: !p.isProduction ? t('Service projects have no work orders') : closed ? t('Project is closed') : undefined },
    { label: t('New document'), action: () => router.push(`/project-new-document?project=${p.id}`), disabledReason: closed ? t('Project is closed') : undefined },
    { label: t('Capture site change'), action: () => router.push(`/site-change-capture?project=${p.id}`), disabledReason: closed ? t('Project is closed') : undefined },
    { label: t('Open in Budget setup'), action: () => router.push(`/budget-setup/${p.id}?returnTo=${encodeURIComponent(`/projects/${p.id}?tab=budget`)}`), separatorBefore: true },
    { label: t('Re-open approval'), action: () => { reopenOpen.value = true }, disabledReason: p.status !== 'active' ? t('Only an active project can be re-opened') : undefined, separatorBefore: true },
    { label: t('Close project'), action: () => setTab('completion'), disabledReason: closed ? t('Already closed') : undefined },
  ]
})
</script>

<template>
  <div v-if="project && summary" class="pm-page">
    <PmTitleBar :title="`${project.code} · ${project.name}`" :breadcrumb="{ label: t('Projects'), to: '/projects' }" :subtitle="`${project.customer} · PM ${project.pm}${project.salesOrderNo ? ` · ${project.salesOrderNo}` : ''}`">
      <template #badges>
        <span class="pm-pill pm-pill--lg" :class="STATUS_TONE[project.status]">{{ t(STATUS_LABEL[project.status]) }}</span>
        <span class="pm-pill pm-pill--outline" :title="project.status === 'draft' ? t('Locks at approval') : t('Locked at approval')">
          <svg v-if="project.status !== 'draft'" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" stroke-width="1.8" /></svg>
          {{ t(methodLabel(project)) }}
        </span>
        <span class="pm-pill pm-pill--outline">{{ project.isProduction ? t('Production') : t('Service') }} · {{ t('Depth') }} {{ project.depth }}</span>
      </template>
      <template #actions>
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push(`/project-audit-log?project=${project.id}`)">{{ t('View history') }}</button>
        <PmMenu :items="actions" :label="t('Actions')" />
        <button v-if="project.status === 'draft'" class="btn-enterprise btn-enterprise--primary" type="button" @click="approveOpen = true">{{ approveLabel }}</button>
      </template>
    </PmTitleBar>

    <div class="pm-tabs" role="tablist">
      <button v-for="tab in TABS" :key="tab.key" class="pm-tab" :class="{ 'pm-tab--active': activeTab === tab.key }" role="tab" :aria-selected="activeTab === tab.key" @click="setTab(tab.key)">
        {{ t(tab.label) }}
        <span v-if="tab.key === 'changes' && summary.pendingCount" class="pm-pill pm-pill--blue" style="height: 18px; padding: 0 6px">{{ pendingApprovals(project.id).length || summary.pendingCount }}</span>
      </button>
    </div>

    <div class="pm-stage">
      <!-- KPI strip — same numbers on every tab -->
      <div class="pm-grid-4" style="grid-template-columns: repeat(5, minmax(0, 1fr)); margin-bottom: 20px">
        <div class="pm-card pm-card--flat">
          <div class="pm-stat-label">{{ t('Contract value') }}</div>
          <div class="pm-stat-value" style="font-size: 16px">{{ rp(project.contractValue) }}</div>
        </div>
        <div class="pm-card pm-card--flat">
          <div class="pm-stat-label">{{ t('Budget (cost)') }}</div>
          <div class="pm-stat-value" style="font-size: 16px">
            <template v-if="summary.budget !== undefined">{{ rp(summary.budget) }}</template>
            <span v-else class="pm-warn">{{ t('Not set') }}</span>
          </div>
        </div>
        <div class="pm-card pm-card--flat">
          <div class="pm-stat-label">{{ t('Committed + actual') }}</div>
          <div class="pm-stat-value" style="font-size: 16px" :class="{ 'pm-neg': summary.budget !== undefined && summary.consumed > summary.budget }">{{ rp(summary.consumed) }}</div>
        </div>
        <div class="pm-card pm-card--flat">
          <div class="pm-stat-label">{{ t('% complete') }}</div>
          <div class="pm-stat-value" style="font-size: 16px">{{ summary.percentComplete !== undefined ? pct(summary.percentComplete) : '—' }}</div>
        </div>
        <div class="pm-card pm-card--flat">
          <div class="pm-stat-label">{{ t('WIP position') }}</div>
          <div class="pm-stat-value" style="font-size: 16px" :class="summary.wip > 0 ? 'pm-pos' : summary.wip < 0 ? 'pm-neg' : ''">{{ rp(Math.abs(summary.wip)) }}</div>
          <div class="pm-stat-note">{{ summary.wip > 0 ? t('Underbilled (asset)') : summary.wip < 0 ? t('Overbilled (liability)') : t('Balanced') }}</div>
        </div>
      </div>

      <StructureTab v-if="activeTab === 'structure'" :project="project" />
      <BudgetTab v-else-if="activeTab === 'budget'" :project="project" />
      <CostTrackingTab v-else-if="activeTab === 'cost'" :project="project" />
      <RecognitionTab v-else-if="activeTab === 'recognition'" :project="project" />
      <ChangesTab v-else-if="activeTab === 'changes'" :project="project" />
      <ProductionTab v-else-if="activeTab === 'production'" :project="project" />
      <CompletionTab v-else-if="activeTab === 'completion'" :project="project" />
    </div>

    <!-- Approve -->
    <PmOverlay :open="approveOpen" variant="modal" :title="t('Approve project')" :subtitle="`${project.code} · Draft → Active`" @close="approveOpen = false">
      <p class="pm-desc" style="margin: 0">{{ t('On approval the recognition method, measure and production flag lock. Draft work orders and purchase requests can then go firm and start consuming budget.') }}</p>
      <div class="pm-card pm-card--flat">
        <div class="pm-kv" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
          <div><div class="pm-kv-label">{{ t('Recognition') }}</div><div class="pm-kv-value">{{ t(methodLabel(project)) }}</div></div>
          <div><div class="pm-kv-label">{{ t('Shape') }}</div><div class="pm-kv-value">{{ project.isProduction ? t('Production') : t('Service') }}</div></div>
        </div>
      </div>
      <div v-for="b in approveBlockers" :key="b" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ b }}</div></div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="approveOpen = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="doApprove">{{ approveLabel }}</button>
      </template>
    </PmOverlay>

    <!-- Re-open -->
    <PmOverlay :open="reopenOpen" variant="modal" :title="t('Re-open approval')" :subtitle="project.code" @close="reopenOpen = false">
      <p class="pm-desc" style="margin: 0">{{ t('The project returns to Draft so the method, measure or production flag can change. This is written to the audit log.') }}</p>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="reopen-reason">{{ t('Reason') }}</label>
        <textarea id="reopen-reason" v-model="reopenReason" class="pm-textarea" />
      </div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="reopenOpen = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!reopenReason.trim()" @click="doReopen">{{ t('Re-open') }}</button>
      </template>
    </PmOverlay>
  </div>
  <div v-else class="pm-page">
    <PmTitleBar :title="t('Project not found')" :breadcrumb="{ label: t('Projects'), to: '/projects' }" />
    <div class="pm-stage"><div class="pm-empty">{{ t('This project doesn’t exist or was removed.') }}</div></div>
  </div>
</template>
