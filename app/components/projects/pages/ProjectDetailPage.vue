<script setup lang="ts">
/**
 * Project page — header + in-page tabs (PRD "Mockup & Design"; tabs.md §2 → MpTabs
 * inside the stage): Structure · Budget · Cost tracking · Recognition & billing ·
 * Changes — commercial & engineering · Production & materials (production only) · Completion.
 *
 * Header: status badge, role-labelled approval button while Draft (Story 7; OQ7:
 * Finance approves), View history → the cross-project audit page (PRD D4), Actions.
 * The record's Activity log opens from the "Last updated by … on …" line
 * (rule/detail-activity-log-always, rule/activity-log-trigger).
 */
import {
  MpButton, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpBanner, MpBannerIcon, MpBannerDescription,
  MpFormControl, MpFormLabel, MpTextarea, MpFormErrorMessage,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu, { type PmMenuItem } from '../PmMenu.vue'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import StructureTab from '../tabs/StructureTab.vue'
import BudgetTab from '../tabs/BudgetTab.vue'
import CostTrackingTab from '../tabs/CostTrackingTab.vue'
import RecognitionTab from '../tabs/RecognitionTab.vue'
import ChangesTab from '../tabs/ChangesTab.vue'
import ProductionTab from '../tabs/ProductionTab.vue'
import CompletionTab from '../tabs/CompletionTab.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import DetailJumpTo, { type JumpItem } from '~/components/patterns/DetailJumpTo.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { projects, getProject, methodLabel, weightTotal } from '~/data/projects'
import { getBudget } from '~/data/projectBudgets'
import { projectSummary } from '~/data/projectSummary'
import { pendingChanges } from '~/data/projectChanges'
import { auditLog, AUDIT_KIND_LABELS } from '~/data/projectAudit'
import { approveProject, reopenProject } from '~/data/projectActions'
import { rp, pct } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ projectId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { current, asActor, isFinance, actor } = useProjectRole()

const project = computed(() => getProject(props.projectId))
// Sibling records for the title-bar jump switcher (rule/detail-jump-to).
const jumpItems = computed<JumpItem[]>(() => projects.map(p => ({ id: p.id, primary: `${p.code} · ${p.name}`, secondary: p.customer })))
const summary = computed(() => (project.value ? projectSummary(project.value.id) : undefined))
const changesPending = computed(() => {
  if (!project.value) return 0
  const { vos, ecos } = pendingChanges(project.value.id)
  return vos.length + ecos.length
})

const TABS = computed(() => {
  const list = [
    { key: 'structure', label: 'Structure' },
    { key: 'budget', label: 'Budget' },
    { key: 'cost', label: 'Cost tracking' },
    { key: 'recognition', label: 'Recognition & billing' },
    { key: 'changes', label: 'Changes — commercial & engineering' },
  ]
  if (project.value?.isProduction) list.push({ key: 'production', label: 'Production & materials' })
  list.push({ key: 'completion', label: 'Completion' })
  return list
})
const activeTab = computed({
  get: () => {
    const q = String(route.query.tab ?? 'structure')
    return TABS.value.some(x => x.key === q) ? q : 'structure'
  },
  set: (key: string) => { router.replace({ query: { ...route.query, tab: key } }) },
})
// MpTabs' v-model is the tab index (same as WarehouseDetailsPage)
const activeTabIndex = computed({
  get: () => Math.max(0, TABS.value.findIndex(x => x.key === activeTab.value)),
  set: (idx: number) => { activeTab.value = TABS.value[idx]?.key ?? 'structure' },
})

// ── Approval gate (Draft only, role-labelled; OQ7 provisional: Finance approves) ──
const approveOpen = ref(false)
const approve = useProjectAction()
const approveLabel = computed(() => (isFinance.value ? `${t('Approve as')} ${t(current.value.label)}` : t('Waiting for Finance approval')))
const approveRefusal = computed(() => {
  if (!isFinance.value) return t('Finance / Controller approves project release. Switch “View as” to approve.')
  if (project.value && actor.value === project.value.pm) return t('You manage this project, so someone else must approve it.')
  return ''
})
const approveWarnings = computed(() => {
  const p = project.value
  if (!p) return []
  const out: string[] = []
  if (!getBudget(p.id)) out.push(t('No budget baseline yet — approval is allowed, but every budget check will read “not set” until one is linked in Budget setup.'))
  if (p.method === 'output' && p.measure === 'milestone' && weightTotal(p.id) !== 100) out.push(`${t('Progress weights total')} ${pct(weightTotal(p.id))}, ${t('not 100%.')}`)
  return out
})
function openApprove() { approve.clear(); approveOpen.value = true }
function doApprove() {
  if (!project.value) return
  if (approveRefusal.value) { approve.fail(approveRefusal.value); return }
  if (approve.run(approveProject(project.value.id, asActor.value), t('Project approved'))) approveOpen.value = false
}

// ── Re-open approval ──
const reopenOpen = ref(false)
const reopenReason = ref('')
const reopenTouched = ref(false)
const reopen = useProjectAction()
function doReopen() {
  reopenTouched.value = true
  if (!project.value || !reopenReason.value.trim()) return
  if (reopen.run(reopenProject(project.value.id, reopenReason.value, asActor.value), t('Project re-opened to Draft'))) {
    reopenOpen.value = false; reopenReason.value = ''; reopenTouched.value = false
  }
}

const actions = computed<PmMenuItem[]>(() => {
  const p = project.value
  if (!p) return []
  const closed = p.status === 'closed'
  return [
    { label: t('New work order'), action: () => router.push(`/projects/${p.id}/work-orders/new`), disabledReason: !p.isProduction ? t('Service projects have no work orders') : closed ? t('Project is closed') : undefined },
    { label: t('New document'), action: () => router.push(`/project-documents/new?project=${p.id}`), disabledReason: closed ? t('Project is closed') : undefined },
    { label: t('Capture site change'), action: () => router.push(`/site-change-capture?project=${p.id}`), disabledReason: closed ? t('Project is closed') : undefined },
    { label: t('Open in Budget setup'), action: () => router.push(`/budget-setup/${p.id}?returnTo=${encodeURIComponent(`/projects/${p.id}?tab=budget`)}`) },
    { label: t('Re-open approval'), action: () => { reopen.clear(); reopenOpen.value = true }, disabledReason: p.status !== 'active' ? t('Only an active project can be re-opened') : undefined },
    { label: t('Close project'), action: () => { activeTab.value = 'completion' }, disabledReason: closed ? t('Already closed') : undefined },
  ]
})

// ── Activity log (this record's audit entries, newest first) ──
const activityOpen = ref(false)
const projectAudit = computed(() => (project.value ? auditLog.filter(e => e.projectId === project.value!.id).slice().sort((a, b) => b.at.localeCompare(a.at)) : []))
const activityEntries = computed<ActivityEntry[]>(() => projectAudit.value.map(e => ({
  date: e.at, user: e.actor, activity: t(AUDIT_KIND_LABELS[e.kind]),
  details: [{ label: t('Summary'), value: e.summary }, ...(e.reason ? [{ label: t('Reason'), value: e.reason }] : []), ...(e.refNo ? [{ label: t('Document'), value: e.refNo }] : [])],
})))
const lastEntry = computed(() => projectAudit.value[0])
</script>

<template>
  <div v-if="project && summary" class="pm-page">
    <PmTitleBar :title="`${project.code} · ${project.name}`" :breadcrumb="{ label: t('Projects'), to: '/projects' }">
      <template #badges>
        <ErpStatusBadge v-bind="badgeProps('project', project.status, t)" badge-for="additionalInformation" />
        <DetailJumpTo
          id="pm-detail-jump" :items="jumpItems" :aria-label="t('Switch project')"
          :placeholder="t('Search project...')" :empty-text="t('No projects found')"
          @select="(id: string) => router.push(`/projects/${id}`)"
        />
      </template>
      <template #actions>
        <MpButton variant="secondary" is-rounded @click="router.push(`/project-audit-log?project=${project.id}`)">{{ t('View history') }}</MpButton>
        <PmMenu id="pm-detail-actions" :items="actions" :label="t('Actions')" />
        <MpButton v-if="project.status === 'draft'" variant="primary" is-rounded data-devchange="pm-release-approval" @click="openApprove">{{ approveLabel }}</MpButton>
      </template>
    </PmTitleBar>

    <div class="pm-stage">
      <!-- Header summary (details-page-format §A.4): primary row + one emphasis amount,
           dashed divider, then the ContentList grid (rule/detail-contentlist). -->
      <section class="detail-summary pm-mb-5">
        <div class="content-list-grid">
          <div class="content-list-col"><ContentList :label="t('Customer')" :value="project.customer" /></div>
          <div class="content-list-col"><ContentList :label="t('Project manager')" :value="project.pm" /></div>
          <div class="detail-primary-total">
            <span class="detail-total-label">{{ t('Contract value') }}</span>
            <span class="detail-total-amount">{{ rp(project.contractValue) }}</span>
          </div>
        </div>

        <div class="detail-divider" />

        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Recognition')" :value="`${t(methodLabel(project))} · ${project.status === 'draft' ? t('Locks at approval') : t('Locked at approval')}`" />
            <ContentList :label="t('Shape')" :value="`${project.isProduction ? t('Production') : t('Service')} · ${t('Depth')} ${project.depth}`" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Budget (cost)')">
              <template v-if="summary.budget !== undefined">{{ rp(summary.budget) }}</template>
              <span v-else class="pm-warn">{{ t('Not set') }}</span>
            </ContentList>
            <ContentList :label="t('Committed + actual')">
              <span :class="{ 'pm-neg': summary.budget !== undefined && summary.consumed > summary.budget }">{{ rp(summary.consumed) }}</span>
              <template v-if="summary.budget"> · {{ pct(summary.consumed / summary.budget * 100, 0) }} {{ t('of budget') }}</template>
            </ContentList>
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Completed')" :value="summary.percentComplete !== undefined ? pct(summary.percentComplete) : '—'" />
            <ContentList :label="t('WIP position')">
              <span :class="summary.wip > 0 ? 'pm-pos' : summary.wip < 0 ? 'pm-neg' : ''">{{ rp(Math.abs(summary.wip)) }}</span>
              · {{ summary.wip > 0 ? t('Underbilled (asset)') : summary.wip < 0 ? t('Overbilled (liability)') : t('Balanced') }}
            </ContentList>
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Sales order')" :value="project.salesOrderNo || '—'" />
            <ContentList :label="t('Priority')" :value="t(project.priority === 'high' ? 'High' : project.priority === 'medium' ? 'Medium' : 'Low')" />
          </div>
        </div>
      </section>

      <MpTabs id="pm-detail-tabs" data-devchange="pm-pixel-rework" v-model="activeTabIndex" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab v-for="tab in TABS" :id="`pm-tab-${tab.key}`" :key="tab.key" :value="tab.key">
            {{ t(tab.label) }}<template v-if="tab.key === 'changes' && changesPending"> ({{ changesPending }})</template>
          </MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel v-for="tab in TABS" :key="tab.key" :value="tab.key">
            <div v-if="activeTab === tab.key" class="pm-mt-5">
              <StructureTab v-if="tab.key === 'structure'" :project="project" />
              <BudgetTab v-else-if="tab.key === 'budget'" :project="project" />
              <CostTrackingTab v-else-if="tab.key === 'cost'" :project="project" />
              <RecognitionTab v-else-if="tab.key === 'recognition'" :project="project" />
              <ChangesTab v-else-if="tab.key === 'changes'" :project="project" />
              <ProductionTab v-else-if="tab.key === 'production'" :project="project" />
              <CompletionTab v-else-if="tab.key === 'completion'" :project="project" />
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

      <p class="pm-mt-5 pm-m-0">
        <span class="pm-link" role="link" tabindex="0" @click="activityOpen = true" @keydown.enter="activityOpen = true">
          <template v-if="lastEntry">{{ t('Last updated by') }} {{ lastEntry.actor }} {{ t('on') }} {{ formatDate(lastEntry.at) }}</template>
          <template v-else>{{ t('Created by') }} {{ project.pm }} {{ t('on') }} {{ formatDate(project.createdAt) }}</template>
        </span>
      </p>
    </div>

    <ActivityLogModal :is-open="activityOpen" :subject="`${project.code} · ${project.name}`" :entries="activityEntries" @close="activityOpen = false" />

    <!-- Approve -->
    <PmOverlay id="pm-approve-modal" :open="approveOpen" variant="modal" :title="t('Approve project')" :subtitle="`${project.code} · Draft → Active`" @close="approveOpen = false">
      <p class="pm-body">{{ t('On approval the recognition method, measure and production flag lock. Draft work orders and purchase requests can then go firm and start consuming budget.') }}</p>
      <div class="pm-card pm-card--flat pm-grid-2">
        <ContentList :label="t('Recognition')" :value="t(methodLabel(project))" />
        <ContentList :label="t('Shape')" :value="project.isProduction ? t('Production') : t('Service')" />
      </div>
      <MpBanner v-for="(w, i) in approveWarnings" :id="`pm-approve-warn-${i}`" :key="w" variant="warning">
        <MpBannerIcon /><MpBannerDescription>{{ w }}</MpBannerDescription>
      </MpBanner>
      <PmActionError id="pm-approve-error" :error="approve.error.value || approveRefusal" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="approveOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doApprove">{{ isFinance ? approveLabel : t('Approve') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- Re-open -->
    <PmOverlay id="pm-reopen-modal" :open="reopenOpen" variant="modal" :title="t('Re-open approval')" :subtitle="project.code" @close="reopenOpen = false">
      <p class="pm-body">{{ t('The project returns to Draft so the method, measure or production flag can change. This is written to the audit log.') }}</p>
      <MpFormControl id="reopen-reason-fc" :is-invalid="reopenTouched && !reopenReason.trim()" is-required>
        <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
        <MpTextarea id="reopen-reason" v-model="reopenReason" />
        <MpFormErrorMessage>{{ t('Enter a reason for re-opening.') }}</MpFormErrorMessage>
      </MpFormControl>
      <PmActionError id="pm-reopen-error" :error="reopen.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="reopenOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doReopen">{{ t('Re-open') }}</MpButton>
      </template>
    </PmOverlay>
  </div>
  <div v-else class="pm-page">
    <PmTitleBar :title="t('Project not found')" :breadcrumb="{ label: t('Projects'), to: '/projects' }" />
    <div class="pm-stage"><div class="pm-empty-inline">{{ t('This project doesn’t exist or was removed.') }}</div></div>
  </div>
</template>
