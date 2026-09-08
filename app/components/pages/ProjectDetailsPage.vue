<script setup lang="ts">
/**
 * Project detail — Structure + Budget tabs (PRD §1 and §3; Stories 2, 4, 9, 20).
 *
 * Two tabs of one page, switched with in-page MpTabs (docs/patterns/tabs.md §2 —
 * these belong to the record, not to a page section). The PRD's project also has
 * Cost tracking, Recognition & billing, Changes, Production & materials and
 * Completion tabs; those are NOT stubbed here. A tab that renders nothing reads
 * as broken, so only the two that are built are shown.
 *
 * ── Structure tab
 * A nested accordion over the fixed three levels: Project → Phase → Work package.
 * Depth is opted into, semantics are fixed — a depth-1 (service) project renders
 * its single auto work package flat, with no phase chrome and no weight input,
 * because a depth-1 project cannot carry progress weight (Story 1).
 *
 * Edit and delete are permitted only while nothing has started against a node. A
 * refusal is WRITTEN WHERE THE BUTTON IS rather than greying the control — the
 * PRD is explicit about this, and it matches rule/btn-no-disabled-validation: a
 * disabled control hides its reason.
 *
 * ── Budget tab
 * Read-only. Budget creation and revision live in a separate budget-setup module
 * (D5), which PRD v5 records as not yet built (gap P4) — so the tab links out and
 * says so plainly instead of offering an edit the spec forbids. Two panels only:
 * Budget detail (P&L by account) and Production monitoring. The cascade,
 * variance-by-account and revision-log panels were removed by D5 and are absent
 * here by design, not by omission.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpButton, MpIcon, MpBadge, MpSkeleton, toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import {
  findProject, methodLabel, SHAPE_LABEL,
  projectPercentComplete, projectRecognised, projectWip, progressWeightTotal,
  phaseLockReason, workPackageLockReason, canDeleteWorkPackage,
  type Phase, type WorkPackage,
} from '~/data/projects'
import {
  findProjectBudget, workOrdersForProject, isUnbudgeted, lineVariance,
  budgetTotals, workOrderVariance,
  type ProjectBudgetLine, type ProjectWorkOrderLine,
} from '~/data/projectBudgets'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const project = computed(() => findProject(props.orderId))

// ─── Tabs ─────────────────────────────────────────────────────────────────────
// ?tab= drives the initial tab so the portfolio can deep-link straight to Budget
// (Story 15: "I land on the project's Budget tab").
const TABS = ['structure', 'budget'] as const
const activeTabIndex = ref(TABS.indexOf((route.query.tab as typeof TABS[number]) ?? 'structure') === -1
  ? 0
  : TABS.indexOf((route.query.tab as typeof TABS[number]) ?? 'structure'))

// ─── Loading ──────────────────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 700) })

// ─── Structure: accordion open state ──────────────────────────────────────────
// Open to Level 2 by default (PRD §1) — every phase expanded on arrival.
const openPhases = ref<Set<string>>(new Set())
onMounted(() => {
  project.value?.phases.forEach(ph => openPhases.value.add(ph.id))
})
function togglePhase(id: string) {
  const next = new Set(openPhases.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openPhases.value = next
}

/** A depth-1 project has no phase level at all — its auto node renders flat. */
const isFlat = computed(() => project.value?.depth === 1)
const flatWorkPackages = computed<WorkPackage[]>(() =>
  project.value?.phases.flatMap(ph => ph.workPackages) ?? [],
)

// ─── Progress weight (Story 9) ────────────────────────────────────────────────
// Weight lives on the phase (D3). PRD v5 records that the prototype still keeps
// it on a separate milestone list (gap P2) — this follows the PRD.
const showsWeight = computed(() =>
  project.value?.method === 'output' && project.value?.measure === 'milestone' && !isFlat.value,
)
const weightTotal = computed(() => (project.value ? progressWeightTotal(project.value) : 0))
const weightIsBalanced = computed(() => Math.abs(weightTotal.value - 100) < 0.05)
const weightDifference = computed(() => Number((100 - weightTotal.value).toFixed(1)))

// ─── Refusal reasons, surfaced not hidden (Story 20) ──────────────────────────
// Each menu item stays clickable; acting on a locked node prints the reason
// inline beneath the row it belongs to.
const refusal = ref<{ nodeId: string; message: string } | null>(null)
function refuse(nodeId: string, message: string) { refusal.value = { nodeId, message } }
function clearRefusal() { refusal.value = null }

function editPhase(phase: Phase) {
  const reason = phaseLockReason(phase)
  if (reason) return refuse(phase.id, t("Can't edit this phase — ") + reason + '.')
  clearRefusal()
  toast.notify({ variant: 'greeting', title: t('Edit phase is not built yet') })
}
function deletePhase(phase: Phase) {
  const reason = phaseLockReason(phase)
  if (reason) return refuse(phase.id, t("Can't delete this phase — ") + reason + '.')
  clearRefusal()
  toast.notify({ variant: 'greeting', title: t('Delete phase is not built yet') })
}
function editWorkPackage(wp: WorkPackage) {
  const reason = workPackageLockReason(wp)
  if (reason) return refuse(wp.id, t("Can't edit this work package — ") + reason + '.')
  clearRefusal()
  toast.notify({ variant: 'greeting', title: t('Edit work package is not built yet') })
}
function deleteWorkPackage(wp: WorkPackage) {
  if (!project.value) return
  const reason = canDeleteWorkPackage(project.value, wp)
  if (reason) return refuse(wp.id, t("Can't delete this work package — ") + reason + '.')
  clearRefusal()
  toast.notify({ variant: 'greeting', title: t('Delete work package is not built yet') })
}

/** Only a production work package can raise a work order (PRD §7). */
function canCreateWorkOrder(wp: WorkPackage): boolean {
  return wp.type === 'production'
}
function createWorkOrder(wp: WorkPackage) {
  if (!project.value) return
  router.push(`/projects/${project.value.id}/work-packages/${wp.id}/work-orders/new`)
}

// ─── Budget tab data ──────────────────────────────────────────────────────────
const budget = computed(() => (project.value ? findProjectBudget(project.value.id) : undefined))
const budgetLines = computed<ProjectBudgetLine[]>(() => budget.value?.lines ?? [])
const totals = computed(() => (budget.value ? budgetTotals(budget.value) : null))
const monitoringRows = computed<ProjectWorkOrderLine[]>(() =>
  project.value ? workOrdersForProject(project.value.id) : [],
)

/** The budget-setup module is gap P4 — say so rather than shipping a dead link. */
function openBudgetModule() {
  toast.notify({
    variant: 'greeting',
    title: t('Budget setup module is not available yet'),
    description: t('Budget creation and revision will live there. This page stays read-only.'),
  })
}

function workPackageName(id: string): string {
  return flatWorkPackages.value.find(wp => wp.id === id)?.name ?? '—'
}

// ─── Formatters ───────────────────────────────────────────────────────────────
/** A missing baseline is "Not set", never Rp 0 (Story 2). */
function money(v: number | undefined | null): string {
  return v === undefined || v === null ? t('Not set') : formatIDR(v)
}
function percentText(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}%`
}
const WO_STATUS_LABEL: Record<ProjectWorkOrderLine['status'], string> = {
  draft: 'Draft',
  released: 'Released',
  'in progress': 'In progress',
  completed: 'Completed',
}

// ─── Activity log (rule/detail-activity-log-always) ───────────────────────────
// Record-level provenance. This is NOT the PRD's cross-project audit page (D4) —
// that page does not exist yet (gap P3), so "View history" says so instead of
// routing nowhere.
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const p = project.value
  if (!p) return []
  const entries: ActivityEntry[] = []
  if (p.approvedAt) {
    entries.push({
      date: p.approvedAt, user: p.approvedBy ?? p.updatedBy, activity: 'Approved',
      details: [
        { label: 'Status', value: 'Draft → Active' },
        { label: 'Recognition method', value: methodLabel(p) },
        { label: 'Production flag', value: p.shape === 'production' ? 'Production' : 'Service' },
      ],
    })
  }
  entries.push({
    date: p.createdAt, user: p.createdBy, activity: 'Created',
    details: [
      { label: 'Project number', value: p.number },
      { label: 'Contract value', value: formatIDR(p.contractValue) },
      { label: 'Customer', value: p.customerName },
    ],
  })
  return entries
})

function openAuditPage() {
  toast.notify({
    variant: 'greeting',
    title: t('Audit page is not available yet'),
    description: t('It will open filtered to this project.'),
  })
}

// ─── Approval (Story 7) ───────────────────────────────────────────────────────
// The header action is labelled by role. There is no real auth in the prototype,
// so the PM label is used; a Finance user would read "Approve draft → active".
function submitForApproval() {
  toast.notify({ variant: 'success', title: t('Project submitted for approval') })
}
</script>

<template>
  <div v-if="project" class="detail-page">
    <!-- ══ Title bar ══════════════════════════════════════════════════════════ -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="router.push('/projects')">{{ t('Projects') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ project.number }} · {{ project.name }}</h1>
          <ErpStatusBadge :status="project.status" badge-for="additionalInformation" size="md" />
        </div>
      </div>

      <div class="detail-bar-right">
        <MpButton variant="ghost" is-rounded @click="openAuditPage">{{ t('View history') }}</MpButton>
        <!-- Shown only while Draft — nothing consumes budget before sign-off. -->
        <MpButton v-if="project.status === 'draft'" variant="primary" is-rounded @click="submitForApproval">
          {{ t('Submit for approval') }}
        </MpButton>
      </div>
    </header>

    <!-- ══ Stage ══════════════════════════════════════════════════════════════ -->
    <div class="detail-stage">
      <!-- ── Header summary ── -->
      <section class="pd-summary">
        <div class="pd-summary-grid">
          <div class="pd-col">
            <ContentList :label="t('Customer')" :value="project.customerName" />
            <ContentList :label="t('Project manager')" :value="project.pmOwner" />
          </div>
          <div class="pd-col">
            <ContentList :label="t('Shape')" :value="t(SHAPE_LABEL[project.shape])" />
            <ContentList :label="t('Recognition')" :value="methodLabel(project)" />
          </div>
          <div class="pd-col">
            <ContentList :label="t('% complete')" :value="percentText(projectPercentComplete(project))" />
            <ContentList :label="t('Escalation threshold')" :value="`${project.escalationThreshold}%`" />
          </div>
          <div class="pd-col">
            <ContentList :label="t('Recognised revenue')">
              {{ projectRecognised(project) === null ? '—' : formatIDR(projectRecognised(project)!) }}
            </ContentList>
            <ContentList :label="t('Billed to date')" :value="formatIDR(project.billed)" />
          </div>
          <div class="pd-col pd-col--emphasis">
            <!-- Recognised and billed are shown separately with WIP as the
                 reconciling balance — the two clocks never collapse into one
                 (Story 8). -->
            <span class="pd-emphasis-label">{{ t('Contract value') }}</span>
            <span class="pd-emphasis-value">{{ formatIDR(project.contractValue) }}</span>
            <span
              v-if="projectWip(project) !== null"
              class="pd-wip"
              :class="projectWip(project)! >= 0 ? 'pd-wip--asset' : 'pd-wip--liability'"
            >
              {{ projectWip(project)! >= 0 ? t('Underbilled') : t('Overbilled') }}
              {{ formatIDR(Math.abs(projectWip(project)!)) }}
            </span>
          </div>
        </div>
      </section>

      <!-- ══ Tabs ══════════════════════════════════════════════════════════════ -->
      <MpTabs id="project-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab value="structure">{{ t('Structure') }}</MpTab>
          <MpTab value="budget">{{ t('Budget') }}</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ══════════════════════════ STRUCTURE ══════════════════════════ -->
          <MpTabPanel value="structure">
            <!-- Progress-weight guard: verification is blocked while the phases
                 do not total exactly 100% (Story 9). Inline, not a toast. -->
            <div v-if="showsWeight && !loading" class="pd-weight" :class="weightIsBalanced ? 'pd-weight--ok' : 'pd-weight--off'">
              <MpIcon :name="weightIsBalanced ? 'check' : 'information'" size="sm" />
              <span v-if="weightIsBalanced">{{ t('Progress weight totals 100%.') }}</span>
              <span v-else>
                {{ t('Progress weight totals') }} {{ weightTotal.toFixed(1) }}% —
                {{ weightDifference > 0 ? t('add') : t('remove') }} {{ Math.abs(weightDifference) }}%.
                {{ t('Verification is blocked until it reaches 100%.') }}
              </span>
            </div>

            <div class="pd-structure-head">
              <h2 class="pd-section-title">{{ t('Project structure') }}</h2>
              <MpButton v-if="!isFlat" variant="secondary" left-icon="add" is-rounded>{{ t('New phase') }}</MpButton>
              <!-- A depth-1 project is promoted to depth 3 by adding its first
                   phase — cost is never migrated (Story 20). -->
              <MpButton v-else variant="secondary" left-icon="add" is-rounded>{{ t('New phase') }}</MpButton>
            </div>

            <!-- Loading — 3 solid skeleton rows (rule/skeleton-3-rows). -->
            <div v-if="loading" class="pd-skeletons">
              <MpSkeleton v-for="n in 3" :key="n" class="erp-skeleton pd-skeleton-row" duration="0s" />
            </div>

            <!-- Depth 1 · flat. No phase row, no accordion, no weight input. -->
            <div v-else-if="isFlat" class="pd-accordion">
              <p class="pd-flat-note">
                {{ t('This project has no phases. Adding one promotes it to a phased structure without moving any cost.') }}
              </p>
              <div v-for="wp in flatWorkPackages" :key="wp.id" class="pd-wp pd-wp--flat">
                <div class="pd-wp-main">
                  <span class="pd-wp-number">{{ wp.number }}</span>
                  <span class="pd-wp-name">{{ wp.name }}</span>
                  <MpBadge for="tableStatus" type="announcement">{{ t(wp.type === 'production' ? 'Production' : 'Service') }}</MpBadge>
                  <ErpStatusBadge :status="wp.status" :label="t(wp.status === 'not started' ? 'Not started' : wp.status === 'in progress' ? 'In progress' : 'Completed')" />
                </div>
                <div class="pd-wp-meta">
                  <span>{{ t('Budget') }} <strong>{{ money(wp.budget) }}</strong></span>
                  <span>{{ t('Committed') }} <strong>{{ formatIDR(wp.committed) }}</strong></span>
                  <span>{{ t('Actual') }} <strong>{{ formatIDR(wp.actual) }}</strong></span>
                </div>
                <MpPopover :id="`wp-menu-${wp.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <button class="pd-kebab" :aria-label="t('Work package options')">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="editWorkPackage(wp)">{{ t('Edit work package') }}</MpPopoverListItem>
                      <MpPopoverListItem v-if="canCreateWorkOrder(wp)" @click="createWorkOrder(wp)">{{ t('Create work order') }}</MpPopoverListItem>
                      <MpPopoverListItem @click="deleteWorkPackage(wp)">{{ t('Delete work package') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </div>
              <p v-if="refusal && flatWorkPackages.some(w => w.id === refusal!.nodeId)" class="pd-refusal">
                {{ refusal.message }}
              </p>
            </div>

            <!-- Depth 3 · nested accordion, open to Level 2 by default. -->
            <div v-else class="pd-accordion">
              <template v-for="phase in project.phases" :key="phase.id">
                <!-- Level 2 — the whole row toggles, not just the chevron
                     (rule/table-accordion-row-click: larger hit target). -->
                <div class="pd-phase">
                  <button class="pd-phase-row" :aria-expanded="openPhases.has(phase.id)" @click="togglePhase(phase.id)">
                    <MpIcon :name="openPhases.has(phase.id) ? 'chevrons-down' : 'chevrons-right'" size="sm" />
                    <span class="pd-phase-name">{{ phase.name }}</span>
                    <MpBadge v-if="phase.isVerified" for="tableStatus" type="completed">{{ t('Verified') }}</MpBadge>
                    <span class="pd-phase-spacer" />
                    <span v-if="showsWeight" class="pd-phase-weight">
                      {{ t('Weight') }} <strong>{{ (phase.progressWeight ?? 0).toFixed(1) }}%</strong>
                    </span>
                  </button>
                  <MpPopover :id="`ph-menu-${phase.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                    <MpPopoverTrigger>
                      <button class="pd-kebab pd-kebab--phase" :aria-label="t('Phase options')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <MpPopoverListItem @click="editPhase(phase)">{{ t('Edit phase') }}</MpPopoverListItem>
                        <MpPopoverListItem>{{ t('New work package') }}</MpPopoverListItem>
                        <MpPopoverListItem @click="deletePhase(phase)">{{ t('Delete phase') }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </div>

                <!-- The refusal prints where the control that refused it sits. -->
                <p v-if="refusal?.nodeId === phase.id" class="pd-refusal">{{ refusal.message }}</p>

                <!-- Level 3 -->
                <template v-if="openPhases.has(phase.id)">
                  <template v-for="wp in phase.workPackages" :key="wp.id">
                    <div class="pd-wp">
                      <div class="pd-wp-main">
                        <span class="pd-wp-number">{{ wp.number }}</span>
                        <span class="pd-wp-name">{{ wp.name }}</span>
                        <MpBadge for="tableStatus" type="announcement">{{ t(wp.type === 'production' ? 'Production' : 'Service') }}</MpBadge>
                        <ErpStatusBadge :status="wp.status" :label="t(wp.status === 'not started' ? 'Not started' : wp.status === 'in progress' ? 'In progress' : 'Completed')" />
                        <span v-if="wp.bomName" class="pd-wp-bom">{{ wp.bomName }} v{{ wp.bomVersion }}</span>
                      </div>
                      <div class="pd-wp-meta">
                        <span>{{ t('Budget') }} <strong>{{ money(wp.budget) }}</strong></span>
                        <span>{{ t('Committed') }} <strong>{{ formatIDR(wp.committed) }}</strong></span>
                        <span>{{ t('Actual') }} <strong>{{ formatIDR(wp.actual) }}</strong></span>
                        <span v-if="wp.plannedUnits">
                          {{ t('Units') }} <strong>{{ wp.confirmedUnits ?? 0 }} / {{ wp.plannedUnits }}</strong>
                        </span>
                      </div>
                      <MpPopover :id="`wp-menu-${wp.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <button class="pd-kebab" :aria-label="t('Work package options')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </MpPopoverTrigger>
                        <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content', whiteSpace: 'nowrap' })">
                          <MpPopoverList>
                            <MpPopoverListItem @click="editWorkPackage(wp)">{{ t('Edit work package') }}</MpPopoverListItem>
                            <MpPopoverListItem v-if="canCreateWorkOrder(wp)" @click="createWorkOrder(wp)">{{ t('Create work order') }}</MpPopoverListItem>
                            <MpPopoverListItem @click="deleteWorkPackage(wp)">{{ t('Delete work package') }}</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </div>
                    <p v-if="refusal?.nodeId === wp.id" class="pd-refusal pd-refusal--wp">{{ refusal.message }}</p>
                  </template>
                </template>
              </template>
            </div>
          </MpTabPanel>

          <!-- ═══════════════════════════ BUDGET ═══════════════════════════ -->
          <MpTabPanel value="budget">
            <!-- Read-only banner. The project page never edits the baseline (D5). -->
            <div class="pd-banner">
              <MpIcon class="pd-banner-icon" name="info" size="md" />
              <span>
                {{ t('Read-only — the budget baseline is created and revised in the budget setup module.') }}
              </span>
              <button class="pd-banner-link" type="button" @click="openBudgetModule">{{ t('Manage budget') }}</button>
            </div>

            <!-- ── Budget detail (P&L by account) ── -->
            <section class="pd-panel">
              <div class="pd-panel-head">
                <h2 class="pd-section-title">{{ t('Budget detail') }}</h2>
                <!-- Accountability is visible: who approved the baseline, and when. -->
                <span v-if="budget" class="pd-approved">
                  {{ t('Approved by') }} {{ budget.approvedBy }} · {{ formatDate(budget.approvedAt) }}
                </span>
              </div>
              <p v-if="budget" class="pd-source">{{ t('Source') }}: {{ budget.sourceDocuments.join(' · ') }}</p>

              <div v-if="loading" class="pd-skeletons">
                <MpSkeleton v-for="n in 3" :key="n" class="erp-skeleton pd-skeleton-row" duration="0s" />
              </div>

              <!-- No approved plan exists. A missing budget is a real state — it
                   renders "not set", never Rp 0 (Story 2). -->
              <p v-else-if="!budget" class="pd-empty">
                {{ t('Budget not set. This project has no approved plan yet — link an approved RAB/RAP in the budget setup module.') }}
              </p>

              <!-- A wide table scrolls inside its own container rather than
                   pushing the page sideways (rule/table-no-outer-border). -->
              <div v-else class="pd-table-scroll">
                <table class="pd-table">
                <colgroup>
                  <col style="min-width:260px"><col style="width:200px"><col style="width:200px"><col style="width:200px">
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">{{ t('Account') }}</th>
                    <th class="pd-th pd-th--right">{{ t('Baseline') }}</th>
                    <th class="pd-th pd-th--right">{{ t('Actual') }}</th>
                    <th class="pd-th pd-th--right">{{ t('Variance') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="line in budgetLines"
                    :key="line.accountCode"
                    class="pd-tr"
                    :class="{ 'pd-tr--unbudgeted': isUnbudgeted(line) }"
                  >
                    <td class="pd-td">
                      <!-- Postings are read by account code — the cell always
                           leads with it (rule/journal-entry-structure's principle). -->
                      <span class="pd-account">{{ line.accountCode }} {{ line.accountName }}</span>
                      <span v-if="isUnbudgeted(line)" class="pd-unbudgeted-tag">{{ t('Unbudgeted') }}</span>
                      <span v-else-if="line.isCostOfProduction" class="pd-account-note">
                        {{ t('Consumed by work orders — never counted again in an ordinary cost row') }}
                      </span>
                    </td>
                    <td class="pd-td pd-td--right" :class="{ 'pd-notset': line.baselineAmount === undefined }">
                      {{ money(line.baselineAmount) }}
                    </td>
                    <td class="pd-td pd-td--right">{{ formatIDR(line.actual) }}</td>
                    <td class="pd-td pd-td--right" :class="{ 'pd-negative': (lineVariance(line) ?? 0) < 0 }">
                      {{ lineVariance(line) === null ? '—' : formatIDR(lineVariance(line)!) }}
                    </td>
                  </tr>
                </tbody>
                <tfoot v-if="totals">
                  <tr class="pd-tr pd-tr--total">
                    <td class="pd-td">{{ t('Total') }}</td>
                    <td class="pd-td pd-td--right">{{ formatIDR(totals.baseline) }}</td>
                    <td class="pd-td pd-td--right">{{ formatIDR(totals.actual) }}</td>
                    <td class="pd-td pd-td--right" :class="{ 'pd-negative': totals.variance < 0 }">
                      {{ formatIDR(totals.variance) }}
                    </td>
                  </tr>
                </tfoot>
                </table>
              </div>
            </section>

            <!-- ── Production monitoring ── -->
            <section class="pd-panel">
              <h2 class="pd-section-title">{{ t('Production monitoring') }}</h2>
              <p class="pd-source">
                {{ t('Baseline is the budget set aside on the work order, not its cost estimate — so variance reads actual against set-aside.') }}
              </p>

              <div v-if="loading" class="pd-skeletons">
                <MpSkeleton v-for="n in 3" :key="n" class="erp-skeleton pd-skeleton-row" duration="0s" />
              </div>

              <p v-else-if="!monitoringRows.length" class="pd-empty">
                {{ t('No work orders raised against this project yet.') }}
              </p>

              <div v-else class="pd-table-scroll">
                <table class="pd-table">
                <colgroup>
                  <col style="width:170px"><col style="width:200px"><col style="width:150px">
                  <col style="width:190px"><col style="width:170px"><col style="width:190px">
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">{{ t('Work order') }}</th>
                    <th class="pd-th">{{ t('Work package') }}</th>
                    <th class="pd-th">{{ t('Status') }}</th>
                    <th class="pd-th pd-th--right">{{ t('Baseline') }}</th>
                    <th class="pd-th pd-th--right">{{ t('Actual') }}</th>
                    <th class="pd-th pd-th--right">{{ t('Variance') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="wo in monitoringRows" :key="wo.id" class="pd-tr">
                    <td class="pd-td">
                      <span class="cell-link" @click="router.push(`/work-orders/${wo.workOrderId}`)">{{ wo.number }}</span>
                    </td>
                    <td class="pd-td">{{ workPackageName(wo.workPackageId) }}</td>
                    <td class="pd-td"><ErpStatusBadge :status="wo.status" :label="t(WO_STATUS_LABEL[wo.status])" /></td>
                    <td class="pd-td pd-td--right">
                      {{ formatIDR(wo.budgetSetAside) }}
                      <!-- Both figures are named so set-aside is never mistaken
                           for the estimate (Story 3). -->
                      <span class="pd-estimate">{{ t('Estimate') }} {{ formatIDR(wo.costEstimate) }}</span>
                    </td>
                    <td class="pd-td pd-td--right">{{ formatIDR(wo.actual) }}</td>
                    <td class="pd-td pd-td--right" :class="{ 'pd-negative': workOrderVariance(wo) < 0 }">
                      {{ formatIDR(workOrderVariance(wo)) }}
                      <span v-if="wo.setAsideReleased" class="pd-estimate">{{ t('Set-aside released') }}</span>
                    </td>
                  </tr>
                </tbody>
                </table>
              </div>
            </section>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

      <!-- Provenance line — the only trigger for the activity log
           (rule/activity-log-trigger). -->
      <button class="detail-updated" @click.prevent="activityOpen = true">
        {{ t('Last updated by') }} {{ project.updatedBy }} {{ t('on') }} {{ formatDate(project.updatedAt) }}
      </button>
    </div>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="`${project.number} · ${project.name}`"
      :entries="activityEntries"
      @close="activityOpen = false"
    />
  </div>

  <!-- Not found is a real state, not a crash (reachable-states.md). -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="router.push('/projects')">{{ t('Projects') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Project not found') }}</h1>
        </div>
      </div>
    </header>
    <div class="detail-stage">
      <p class="pd-empty">{{ t('This project no longer exists, or you do not have access to it.') }}</p>
      <MpButton variant="secondary" is-rounded class="pd-notfound-cta" @click="router.push('/projects')">
        {{ t('Back to projects') }}
      </MpButton>
    </div>
  </div>
</template>

<style scoped>
/* ── Page shell (shared detail-page metrics) ────────────────────────────── */
.detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-width: 0;
}
.detail-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-breadcrumb {
  align-self: flex-start;   /* required: without it the button stretches full width */
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);   /* 32px between regions */
}

/* ── Header summary ────────────────────────────────────────────────────── */
/* auto-fit rather than a fixed 5-column track: the content column narrows a lot
   when the level-2 nav panel is open, and a fixed grid let the emphasis amount
   overlap its neighbour there. */
.pd-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  column-gap: var(--mp-spacing-6);
  row-gap: var(--mp-spacing-4);
}
.pd-col { display: flex; flex-direction: column; }   /* ContentList carries its own spacing */
.pd-col--emphasis { align-items: flex-end; text-align: right; padding-top: var(--mp-spacing-2); }
.pd-emphasis-label {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.pd-emphasis-value {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pd-wip { margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
.pd-wip--asset { color: var(--mp-text-selected); }
.pd-wip--liability { color: var(--mp-text-danger); }

/* ── Tabs (active = text.selected + border.selected) ───────────────────── */
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

/* ── Sections ──────────────────────────────────────────────────────────── */
.pd-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pd-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-8); }
.pd-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.pd-approved, .pd-source {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.pd-empty {
  margin: 0;
  padding: var(--mp-spacing-4) 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.pd-notfound-cta { align-self: flex-start; }

/* ── Read-only banner ──────────────────────────────────────────────────── */
.pd-banner {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-6);
  background: var(--mp-background-information, #e8f1fb);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.pd-banner-icon { flex-shrink: 0; }
.pd-banner-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: var(--mp-text-link);
}
.pd-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Progress-weight guard ─────────────────────────────────────────────── */
.pd-weight {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-4);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
}
.pd-weight--ok { background: var(--mp-background-success, #e6f6ef); color: var(--mp-text-selected); }
.pd-weight--off { background: var(--mp-background-critical, #fdeceb); color: var(--mp-text-danger); }

/* ── Structure accordion ───────────────────────────────────────────────── */
.pd-structure-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-3);
}
.pd-accordion { display: flex; flex-direction: column; }
.pd-flat-note {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* Level 2 — the frame tone; content rows below are lighter (frames vs content). */
.pd-phase {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--mp-border-default);
  border-bottom: none;
  background: var(--mp-background-neutral-subtle);
}
.pd-phase:first-child { border-radius: var(--mp-radii-md) var(--mp-radii-md) 0 0; }
.pd-phase-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  min-width: 0;
}
.pd-phase-row:hover { background: var(--mp-background-neutral-hovered); }
.pd-phase-name {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pd-phase-spacer { flex: 1; }
.pd-phase-weight { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Level 3 — content tone, indented under its phase. */
.pd-wp {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4) var(--mp-spacing-3) var(--mp-spacing-10);
  border: 1px solid var(--mp-border-default);
  border-bottom: none;
  background: var(--mp-background-stage);
}
.pd-wp--flat { padding-left: var(--mp-spacing-4); }
.pd-wp:last-child { border-bottom: 1px solid var(--mp-border-default); border-radius: 0 0 var(--mp-radii-md) var(--mp-radii-md); }
/* The row is two blocks that must never overlap: identity (left, absorbs the
   slack and truncates) and figures (right, fixed). Everything inside the
   identity block except the name is flex-shrink:0 so badges keep their shape. */
.pd-wp-main {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
.pd-wp-number { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); flex-shrink: 0; }
.pd-wp-main :deep([data-pixel-component="MpBadge"]) { flex-shrink: 0; }
.pd-wp-name {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  flex: 1 1 auto;
  min-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pd-wp-bom {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}
.pd-wp-meta {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-5);
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.pd-wp-meta strong { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.pd-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  flex-shrink: 0;
  align-self: center;
  margin-right: var(--mp-spacing-2);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.pd-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* The refusal reason sits where the control that refused it is — never a
   silently disabled button, never a toast. */
.pd-refusal {
  margin: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-bottom: none;
  background: var(--mp-background-critical, #fdeceb);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-danger);
}
.pd-refusal--wp { padding-left: var(--mp-spacing-10); }

/* ── Read-only tables ──────────────────────────────────────────────────── */
.pd-table-scroll { overflow-x: auto; }
.pd-table { width: 100%; min-width: 860px; border-collapse: collapse; table-layout: fixed; }
.pd-th {
  height: var(--mp-sizes-7, 28px);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}
.pd-th--right { text-align: right; }
/* Headers can abut when the content column is narrow — keep a real gutter. */
.pd-th + .pd-th { padding-left: var(--mp-spacing-4); }
.pd-tr { border-bottom: 1px solid var(--mp-border-default); }
.pd-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  vertical-align: top;
}
.pd-td--right { text-align: right; }
.pd-tr--total { border-top: 1px solid var(--mp-border-bold); border-bottom: none; }
.pd-tr--total .pd-td { font-weight: var(--mp-font-weights-semi-bold); }

/* An account with actuals and no baseline is surfaced, never absorbed. */
.pd-tr--unbudgeted { background: var(--mp-background-warning, #fef6e7); }
.pd-unbudgeted-tag {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-warning, #7a4c00);
}
.pd-account { display: block; }
.pd-account-note,
.pd-estimate {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.pd-notset { color: var(--mp-text-subtle); }
.pd-negative { color: var(--mp-text-danger); }

.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Provenance line ───────────────────────────────────────────────────── */
.detail-updated {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Skeletons — solid and static (rule/skeleton-solid-static) ─────────── */
.pd-skeletons { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pd-skeleton-row { height: 40px; width: 100%; }
.erp-skeleton {
  background-image: none !important;
  background-color: var(--mp-border-default) !important;
  animation: none !important;
}
</style>
