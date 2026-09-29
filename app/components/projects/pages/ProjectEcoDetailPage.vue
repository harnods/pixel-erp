<script setup lang="ts">
/**
 * Engineering change (ECO) — the PM's decision page, under its project at
 * /projects/:id/engineering-changes/:ecoId and reached from the Production tab's
 * engineering-change list (PRD v6.2 §7 · Story 8;
 * BOM Versioning & ECO-lite P-05 blocks, P-06 routing, P-08 disposition, P-11 lifecycle).
 *
 * The version is already published and Active — this page never gates it. It
 * assembles what the PM needs to decide which EXISTING work orders adopt it:
 *   1. change identity — reason code, who published, SO addendum
 *   2. composition diff with per-line and total cost delta (Δ n/a when uncosted)
 *   3. cost impact of the decision beside the work-package budget
 *   4. existing work orders with the route computed from each one's status
 *   5. the adoption decision: none · selected · all open (+ note)
 *   6. material disposition — mandatory per affected line before Implemented
 *   7. lifecycle Open → Decided → Implemented → Closed, each step with actor + date
 *
 * One primary action per status (rule/btn-one-primary). It is never disabled —
 * a refusal shows inline next to it (rule/btn-no-disabled-validation). The
 * Production tab stays information-only; this page is the surface that owns the
 * PM's decision (Finance only sees it when it crosses the escalation threshold).
 */
import {
  MpButton, MpRadio, MpCheckbox, MpTextarea, MpFormControl, MpFormLabel, MpFormHelpText,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu, { type PmMenuItem } from '../PmMenu.vue'
import PmActionError from '../PmActionError.vue'
import EcoDiff from '../EcoDiff.vue'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import DetailJumpTo, { type JumpItem } from '~/components/patterns/DetailJumpTo.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import {
  engineeringChanges, getEco, ecoPath, ECO_REASON_LABELS, ECO_ROUTE_LABELS, ECO_ROUTE_HINTS, ECO_DISPOSITION_LABELS,
  type EcoAdoption, type EcoDisposition,
} from '~/data/projectChanges'
import { getProject, getWorkPackage, projectSos } from '~/data/projects'
import { getCustomBom, getVersion, currentVersion } from '~/data/projectBoms'
import { projectWorkOrders, woGate } from '~/data/projectTransactions'
import { approvals } from '~/data/projectApprovals'
import { auditLog, AUDIT_KIND_LABELS } from '~/data/projectAudit'
import { ecoPreview, decideEco, setEcoDisposition, implementEco, closeEco } from '~/data/projectActions'
import { rp, rpSigned, pct } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ projectId?: string; ecoId: string }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()
const action = useProjectAction()

const eco = computed(() => getEco(props.ecoId))
const project = computed(() => getProject(eco.value?.projectId ?? props.projectId))
const wp = computed(() => (eco.value ? getWorkPackage(eco.value.wpId) : undefined))
const bom = computed(() => (eco.value ? getCustomBom(eco.value.customBomId) : undefined))
const toV = computed(() => (eco.value ? getVersion(bom.value, eco.value.toVersion) : undefined))
const toIsActive = computed(() => !!bom.value && !!toV.value && currentVersion(bom.value).version === toV.value.version)
const addendum = computed(() => (eco.value?.addendumSoId ? projectSos(eco.value.projectId).find(so => so.id === eco.value!.addendumSoId) : undefined))
const projectPath = computed(() => (project.value ? `/projects/${project.value.id}?tab=production` : '/projects'))
const jumpItems = computed<JumpItem[]>(() => engineeringChanges.map(e => ({ id: e.id, primary: `${e.no} · ${e.title}`, secondary: `${getProject(e.projectId)?.code} · v${e.fromVersion} → v${e.toVersion}` })))

// ── Decision form (Open only) ──
const isOpen = computed(() => eco.value?.status === 'open')
const form = reactive({ adoption: '' as '' | EcoAdoption, selected: [] as string[], note: '', addendumSoId: '', override: '', touched: false })
watch(() => props.ecoId, () => {
  Object.assign(form, { adoption: '', selected: [], note: '', addendumSoId: '', override: '', touched: false })
  action.clear()
}, { immediate: true })

const preview = computed(() => (eco.value ? ecoPreview(eco.value, isOpen.value ? form.adoption || undefined : eco.value.adoption, isOpen.value ? form.selected : eco.value.decisions.map(d => d.woId)) : undefined))
const adoptable = computed(() => preview.value?.rows.filter(r => r.route !== 'untouched') ?? [])
const allSelected = computed(() => adoptable.value.length > 0 && adoptable.value.every(r => form.selected.includes(r.wo.id)))
const someSelected = computed(() => form.selected.length > 0 && !allSelected.value)
function setAdoption(a: EcoAdoption) {
  form.adoption = a
  if (a !== 'selected') form.selected = []
}
function toggleWo(id: string, on: boolean) {
  if (form.adoption !== 'selected') form.adoption = 'selected'
  form.selected = on ? [...new Set([...form.selected, id])] : form.selected.filter(x => x !== id)
}
function toggleAll(on: boolean) {
  form.adoption = 'selected'
  form.selected = on ? adoptable.value.map(r => r.wo.id) : []
}
const needsAddendum = computed(() => eco.value?.reason === 'customer_request' && !addendum.value && (preview.value?.rows.some(r => r.adopt) ?? false))
const addendumOptions = computed(() => (eco.value ? projectSos(eco.value.projectId).filter(so => so.isAddendum) : []).map(so => ({ value: so.id, label: `${so.number} · ${rp(so.value)}` })))

// ── Budget position (commitment ledger — the number the gate uses) ──
const gate = computed(() => (wp.value ? woGate(wp.value.id) : undefined))
const availableAfter = computed(() => (gate.value?.available === undefined || !preview.value ? undefined : gate.value.available - preview.value.total))

// ── Dispositions ──
const dispOptions = computed(() => (Object.keys(ECO_DISPOSITION_LABELS) as EcoDisposition[]).map(k => ({ value: k, label: t(ECO_DISPOSITION_LABELS[k]) })))
function setDisp(lineId: string, v: string) {
  if (!eco.value) return
  action.run(setEcoDisposition(eco.value.id, lineId, (v || undefined) as EcoDisposition | undefined, asActor.value), t('Disposition saved'))
}
const undecidedCount = computed(() => eco.value?.dispositions.filter(l => !l.disposition).length ?? 0)

// ── Primary action per status ──
const primary = computed(() => {
  switch (eco.value?.status) {
    case 'open': return { label: t('Save decision'), run: saveDecision }
    case 'decided': return { label: t('Mark implemented'), run: () => eco.value && action.run(implementEco(eco.value.id, asActor.value)) }
    case 'implemented': return { label: t('Close engineering change'), run: () => eco.value && action.run(closeEco(eco.value.id, asActor.value)) }
    default: return undefined
  }
})
function saveDecision() {
  form.touched = true
  if (!eco.value) return
  if (!form.adoption) { action.fail(`${t('Choose which existing work orders adopt')} v${eco.value.toVersion}.`); return }
  action.run(decideEco(eco.value.id, { adoption: form.adoption, selectedWoIds: form.selected, note: form.note, addendumSoId: form.addendumSoId || undefined, addendumOverride: form.override }, asActor.value))
}
const pendingApproval = computed(() => (eco.value ? approvals.find(a => a.kind === 'eco' && a.refId === eco.value!.id && a.status === 'pending') : undefined))

const bomView = ref<string | undefined>()
const menu = computed<PmMenuItem[]>(() => (eco.value ? [
  { label: t('Open project'), action: () => router.push(projectPath.value) },
  { label: t('All engineering changes'), action: () => router.push('/engineering-changes') },
  { label: t('View project BOM'), action: () => (bomView.value = eco.value!.customBomId) },
  { label: t('View history'), action: () => router.push(`/project-audit-log?project=${eco.value!.projectId}`) },
] : []))

// ── Lifecycle (actor + date on every reached step) ──
const steps = computed(() => {
  const e = eco.value
  if (!e) return []
  const order = ['open', 'decided', 'implemented', 'closed']
  const reached = e.status === 'pending_approval' ? 0 : order.indexOf(e.status)
  return [
    { key: 'open', label: t('Open'), who: e.publishedBy, at: e.publishedAt, note: `${t('Published')} v${e.toVersion}` },
    { key: 'decided', label: e.status === 'pending_approval' ? t('Pending approval') : t('Decided'), who: e.decidedBy, at: e.decidedAt, note: e.approvedBy ? `${t('Approved by')} ${e.approvedBy}` : '' },
    { key: 'implemented', label: t('Implemented'), who: e.implementedBy, at: e.implementedAt, note: e.dispositions.length ? `${e.dispositions.length} ${t('disposition line(s) posted')}` : '' },
    { key: 'closed', label: t('Closed'), who: e.closedBy, at: e.closedAt, note: '' },
  ].map((s, i) => ({ ...s, done: i <= reached && !!s.at, current: i === reached + 1 || (e.status === 'pending_approval' && s.key === 'decided') }))
})

// ── Activity log (this ECO's audit entries) ──
const activityOpen = ref(false)
const entries = computed(() => (eco.value ? auditLog.filter(a => a.refNo === eco.value!.no).slice().sort((a, b) => b.at.localeCompare(a.at)) : []))
const activityEntries = computed<ActivityEntry[]>(() => entries.value.map(e => ({
  date: e.at, user: e.actor, activity: t(AUDIT_KIND_LABELS[e.kind]),
  details: [{ label: t('Summary'), value: e.summary }, ...(e.reason ? [{ label: t('Reason'), value: e.reason }] : [])],
})))
const woById = (id?: string) => projectWorkOrders.find(w => w.id === id)
const tone = (v: number) => (v > 0 ? 'pm-neg' : v < 0 ? 'pm-pos' : '')
</script>

<template>
  <div v-if="eco && project && bom" class="pm-page" data-devchange="eco-detail">
    <PmTitleBar :title="`${eco.no} · ${eco.title}`" :breadcrumb="{ label: `${project.code} · ${project.name}`, to: projectPath }">
      <template #badges>
        <ErpStatusBadge v-bind="badgeProps('eco', eco.status, t)" badge-for="additionalInformation" />
        <DetailJumpTo
          id="eco-detail-jump" :items="jumpItems" :aria-label="t('Switch engineering change')"
          :placeholder="t('Search engineering change...')" :empty-text="t('No engineering changes found')"
          @select="(id: string) => { const e = getEco(id); if (e) router.push(ecoPath(e)) }"
        />
      </template>
      <template #actions>
        <PmMenu id="eco-detail-actions" :items="menu" :label="t('Actions')" />
        <MpButton v-if="eco.status === 'pending_approval'" variant="secondary" is-rounded @click="router.push('/project-approvals')">{{ t('In Approvals') }}</MpButton>
        <MpButton v-if="primary" id="eco-primary" variant="primary" is-rounded data-devchange="eco-decision" @click="primary.run">{{ primary.label }}</MpButton>
      </template>
    </PmTitleBar>

    <div class="pm-stage pm-stack pm-gap-5">
      <!-- 1 · Change identity -->
      <section class="detail-summary">
        <div class="content-list-grid">
          <div class="content-list-col"><ContentList :label="t('Project')" :value="`${project.code} · ${project.name}`" /></div>
          <div class="content-list-col"><ContentList :label="t('Project BOM')" :value="`${bom.name} · ${wp?.code} ${wp?.name}`" /></div>
          <div class="detail-primary-total">
            <span class="detail-total-label">{{ t('Delta per unit') }}</span>
            <span class="detail-total-amount" :class="tone(preview?.unitDelta ?? 0)">{{ rpSigned(preview?.unitDelta ?? 0) }}</span>
          </div>
        </div>
        <div class="detail-divider" />
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Version')">v{{ eco.fromVersion }} → v{{ eco.toVersion }}<template v-if="toIsActive"> ({{ t('Active') }})</template></ContentList>
            <ContentList :label="t('Reason code')" :value="t(ECO_REASON_LABELS[eco.reason])" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Published by')" :value="`${eco.publishedBy} (${t('Production')}) · ${formatDate(eco.publishedAt)}`" />
            <ContentList :label="t('Decision by')" :value="eco.decidedBy ? `${eco.decidedBy} · ${formatDate(eco.decidedAt)}` : `${project.pm} (${t('Project manager')})`" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('SO addendum')">
              <template v-if="addendum">{{ addendum.number }} · {{ rp(addendum.value) }}</template>
              <span v-else-if="eco.addendumOverride" class="pm-warn">{{ t('Overridden — added scope not yet under contract') }}</span>
              <template v-else>{{ eco.reason === 'customer_request' ? t('Not linked yet') : t('Not needed') }}</template>
            </ContentList>
            <ContentList :label="t('What changed')" :value="eco.note || eco.title" />
          </div>
        </div>
      </section>

      <MpBanner v-if="eco.status === 'open'" id="eco-published-info" variant="info">
        <MpBannerIcon />
        <MpBannerDescription>
          v{{ eco.toVersion }} {{ t('is already Active — every work order created from now on uses it. You only decide whether existing work orders adopt it; the ones you leave keep') }} v{{ eco.fromVersion }}.
        </MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="eco.status === 'pending_approval'" id="eco-pending-info" variant="warning">
        <MpBannerIcon />
        <MpBannerTitle>{{ t('Waiting for Finance') }}</MpBannerTitle>
        <MpBannerDescription>
          {{ t('The cost delta is above the') }} {{ pct(preview?.thresholdPct ?? 0) }} {{ t('escalation threshold, so the decision is held in Approvals') }}<template v-if="pendingApproval"> ({{ t('raised by') }} {{ pendingApproval.requestedBy }} · {{ formatDate(pendingApproval.requestedAt) }})</template>. {{ t('Nothing moves until it’s approved.') }}
        </MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="eco.status === 'decided' && undecidedCount" id="eco-disposition-info" variant="warning">
        <MpBannerIcon />
        <MpBannerDescription>{{ undecidedCount }} {{ t('material line(s) still need a disposition before this ECO can be implemented.') }}</MpBannerDescription>
      </MpBanner>

      <!-- 3 · Cost impact beside the budget -->
      <section v-if="preview" class="pm-section">
        <div class="pm-kpis">
          <div class="pm-kpi pm-kpi--bordered">
            <div class="pm-kpi-title">{{ t('Delta per unit') }}</div>
            <div class="pm-kpi-period">v{{ eco.fromVersion }} → v{{ eco.toVersion }}<template v-if="preview.uncosted"> · {{ t('partially uncosted') }}</template></div>
            <div class="pm-kpi-amount" :class="tone(preview.unitDelta)">{{ rpSigned(preview.unitDelta) }}</div>
          </div>
          <div class="pm-kpi pm-kpi--bordered">
            <div class="pm-kpi-title">{{ t('Impact of this decision') }}</div>
            <div class="pm-kpi-period">{{ preview.rows.filter(r => r.adopt).reduce((s, r) => s + r.units, 0) }} {{ t('adopted units') }} + {{ preview.futureUnits }} {{ t('future units') }}</div>
            <div class="pm-kpi-amount" :class="tone(preview.total)">{{ rpSigned(preview.total) }}</div>
          </div>
          <div class="pm-kpi">
            <div class="pm-kpi-title">{{ t('Budget available after') }}</div>
            <div class="pm-kpi-period">{{ t('Cost of production') }} · {{ wp?.code }} · {{ t('threshold') }} {{ pct(preview.thresholdPct) }}</div>
            <div class="pm-kpi-amount" :class="{ 'pm-neg': (availableAfter ?? 0) < 0 }">{{ availableAfter === undefined ? t('Not set') : rp(availableAfter) }}</div>
          </div>
        </div>
      </section>

      <!-- 2 · Composition diff -->
      <section class="pm-section">
        <h2 class="pm-h2">{{ t('What changed') }}</h2>
        <EcoDiff v-if="toV" :bom-id="bom.id" :base-version="eco.fromVersion" :proposed="toV" />
      </section>

      <!-- 4 + 5 · Existing work orders & adoption decision -->
      <section class="pm-section" data-devchange="eco-adoption">
        <div class="pm-section-head">
          <div>
            <h2 class="pm-h2">{{ t('Existing work orders on') }} v{{ eco.fromVersion }}</h2>
            <p class="pm-caption pm-m-0">{{ t('The route is computed from each work order’s status — it can’t be picked. Work orders that don’t adopt keep their version and show a neutral “newer version available” indicator.') }}</p>
          </div>
        </div>

        <MpFormControl v-if="isOpen" id="eco-adoption-fc" is-required :is-invalid="form.touched && !form.adoption" class="pm-mb-3">
          <MpFormLabel>{{ t('Which existing work orders adopt') }} v{{ eco.toVersion }}?</MpFormLabel>
          <div class="pm-grid-3 pm-mt-2">
            <label class="pm-choice" :class="{ 'pm-choice--active': form.adoption === 'none' }">
              <MpRadio id="eco-adopt-none" name="eco-adopt" :is-checked="form.adoption === 'none'" @change="setAdoption('none')">
                <span class="pm-choice-title">{{ t('None') }}</span>
                <template #description>{{ t('Every existing work order stays on') }} v{{ eco.fromVersion }}.</template>
              </MpRadio>
            </label>
            <label class="pm-choice" :class="{ 'pm-choice--active': form.adoption === 'selected' }">
              <MpRadio id="eco-adopt-selected" name="eco-adopt" :is-checked="form.adoption === 'selected'" @change="setAdoption('selected')">
                <span class="pm-choice-title">{{ t('Selected work orders') }}</span>
                <template #description>{{ t('Tick the work orders below.') }}</template>
              </MpRadio>
            </label>
            <label class="pm-choice" :class="{ 'pm-choice--active': form.adoption === 'all_open' }">
              <MpRadio id="eco-adopt-all" name="eco-adopt" :is-checked="form.adoption === 'all_open'" @change="setAdoption('all_open')">
                <span class="pm-choice-title">{{ t('All open work orders') }}</span>
                <template #description>{{ adoptable.length }} {{ t('open work order(s) adopt; completed ones stay as built.') }}</template>
              </MpRadio>
            </label>
          </div>
        </MpFormControl>

        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead>
              <tr>
                <th>
                  <MpCheckbox v-if="isOpen && adoptable.length" id="eco-wo-all" :is-checked="allSelected" :is-indeterminate="someSelected" :aria-label="t('Select all open work orders')" @change="(v: boolean) => toggleAll(v)">{{ t('Work order') }}</MpCheckbox>
                  <template v-else>{{ t('Work order') }}</template>
                </th>
                <th>{{ t('Status') }}</th>
                <th class="pm-num">{{ t('Qty') }}</th>
                <th>{{ t('Route') }}</th>
                <th class="pm-num">{{ t('Units on') }} v{{ eco.toVersion }}</th>
                <th class="pm-num">{{ t('Delta') }}</th>
              </tr>
            </thead>
            <tbody>
              <!-- Open: live preview of every existing WO -->
              <template v-if="isOpen && preview">
                <tr v-for="r in preview.rows" :key="r.wo.id" :class="{ 'pm-tr-muted': r.route === 'untouched' }">
                  <td>
                    <MpCheckbox v-if="r.route !== 'untouched'" :id="`eco-wo-${r.wo.id}`" :is-checked="r.adopt" @change="(v: boolean) => toggleWo(r.wo.id, v)">{{ r.wo.number }}</MpCheckbox>
                    <template v-else>{{ r.wo.number }}</template>
                  </td>
                  <td><ErpStatusBadge v-bind="badgeProps('wo', r.wo.status, t)" /></td>
                  <td class="pm-num">{{ r.wo.qty }} {{ r.wo.unit }}<span v-if="r.wo.completedQty" class="pm-cell-sub">{{ r.wo.completedQty }} {{ t('completed') }}</span></td>
                  <td class="pm-wrap">{{ t(ECO_ROUTE_LABELS[r.route]) }}<span class="pm-cell-sub">{{ t(ECO_ROUTE_HINTS[r.route]) }}</span></td>
                  <td class="pm-num">{{ r.adopt ? r.units : '—' }}</td>
                  <td class="pm-num" :class="tone(r.delta)">{{ r.adopt ? rpSigned(r.delta) : '—' }}</td>
                </tr>
                <tr v-if="!preview.rows.length"><td colspan="6"><div class="pm-empty-inline">{{ t('No existing work order uses') }} v{{ eco.fromVersion }} — {{ t('choose None to record the decision.') }}</div></td></tr>
              </template>
              <!-- Decided and later: the frozen decision -->
              <template v-else>
                <tr v-for="d in eco.decisions" :key="d.woId">
                  <td>{{ d.woNumber }}<span v-if="d.newWoId" class="pm-cell-sub">→ {{ woById(d.newWoId)?.number }} {{ t('on') }} v{{ eco.toVersion }}</span></td>
                  <td><ErpStatusBadge v-if="woById(d.woId)" v-bind="badgeProps('wo', woById(d.woId)!.status, t)" /></td>
                  <td class="pm-num">{{ woById(d.woId)?.qty }} {{ woById(d.woId)?.unit }}</td>
                  <td class="pm-wrap">{{ t(ECO_ROUTE_LABELS[d.route]) }}<span class="pm-cell-sub">{{ t(ECO_ROUTE_HINTS[d.route]) }}</span></td>
                  <td class="pm-num">{{ d.units }}</td>
                  <td class="pm-num" :class="tone(d.delta)">{{ rpSigned(d.delta) }}</td>
                </tr>
                <tr v-if="!eco.decisions.length"><td colspan="6"><div class="pm-empty-inline">{{ t('No existing work order adopted') }} v{{ eco.toVersion }}. {{ t('They keep their pinned version.') }}</div></td></tr>
              </template>
            </tbody>
            <tfoot v-if="preview">
              <tr><td colspan="5">{{ t('Future units — built from') }} v{{ eco.toVersion }} {{ t('automatically') }} ({{ preview.futureUnits }})</td><td class="pm-num" :class="tone(preview.futureDelta)">{{ rpSigned(preview.futureDelta) }}</td></tr>
              <tr><td colspan="5">{{ t('Budget revision on decision') }}</td><td class="pm-num" :class="tone(eco.budgetRevisionAmount ?? preview.total)">{{ rpSigned(eco.budgetRevisionAmount ?? preview.total) }}</td></tr>
            </tfoot>
          </table>
        </div>

        <template v-if="isOpen">
          <div v-if="needsAddendum" class="pm-grid-2 pm-mt-4" data-devchange="eco-addendum-gate">
            <MpFormControl id="eco-addendum-fc">
              <MpFormLabel>{{ t('SO addendum') }}</MpFormLabel>
              <ErpFilterSelect id="eco-addendum" v-model="form.addendumSoId" :placeholder="t('Select SO addendum')" :options="addendumOptions" width="100%" />
              <MpFormHelpText>{{ addendumOptions.length ? t('A customer request can’t be adopted without its addendum.') : t('No SO addendum on this project yet — raise one in Sales, or override with a reason.') }}</MpFormHelpText>
            </MpFormControl>
            <MpFormControl v-if="!form.addendumSoId" id="eco-override-fc">
              <MpFormLabel>{{ t('Or override with a reason') }}</MpFormLabel>
              <MpTextarea id="eco-override" v-model="form.override" />
              <MpFormHelpText>{{ t('Flags the project as added scope not yet under contract.') }}</MpFormHelpText>
            </MpFormControl>
          </div>
          <MpFormControl id="eco-note-fc" class="pm-mt-4">
            <MpFormLabel>{{ t('Decision note') }}</MpFormLabel>
            <MpTextarea id="eco-note" v-model="form.note" />
          </MpFormControl>
          <p v-if="preview?.needsApproval" class="pm-caption pm-warn pm-mt-2 pm-m-0">{{ t('This decision is above the') }} {{ pct(preview.thresholdPct) }} {{ t('escalation threshold — saving sends it to Finance for approval.') }}</p>
        </template>
        <div v-else-if="eco.decisionNote" class="pm-mt-4"><ContentList :label="t('Decision note')" :value="eco.decisionNote" /></div>
      </section>

      <!-- 6 · Material disposition -->
      <section v-if="eco.status !== 'open' && eco.status !== 'pending_approval'" class="pm-section" data-devchange="eco-disposition">
        <h2 class="pm-h2">{{ t('Material disposition') }}</h2>
        <p class="pm-caption pm-m-0 pm-mb-3">{{ t('Every on-hand line of a removed component needs a decision before the ECO is implemented. Scrap is charged to the project.') }}</p>
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead><tr><th>{{ t('Item') }}</th><th>{{ t('Where it is') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Disposition') }}</th><th class="pm-num">{{ t('Charge to project') }}</th></tr></thead>
            <tbody>
              <tr v-for="l in eco.dispositions" :key="l.id">
                <td>{{ l.itemName }}</td>
                <td>{{ l.source === 'issued' ? t('Issued to the floor') : t('Released to project stock') }}</td>
                <td class="pm-num">{{ l.qty }} {{ l.unit }}</td>
                <td>
                  <ErpFilterSelect v-if="eco.status === 'decided'" :id="`eco-disp-${l.id}`" :model-value="l.disposition ?? ''" :placeholder="t('Select disposition')" :options="dispOptions" width="200px" @update:model-value="(v: string) => setDisp(l.id, v)" />
                  <template v-else>{{ l.disposition ? t(ECO_DISPOSITION_LABELS[l.disposition]) : '—' }}<span v-if="l.postedAt" class="pm-cell-sub">{{ t('Posted') }} {{ formatDate(l.postedAt) }}</span></template>
                </td>
                <td class="pm-num">{{ l.disposition === 'scrap' ? rp(l.qty * (l.unitCost ?? 0)) : '—' }}</td>
              </tr>
              <tr v-if="!eco.dispositions.length"><td colspan="5"><div class="pm-empty-inline">{{ t('No material is affected — nothing to dispose of.') }}</div></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <PmActionError id="eco-action-error" :error="action.error.value" />

      <!-- 7 · Lifecycle -->
      <section class="pm-section">
        <h2 class="pm-h2 pm-mb-3">{{ t('Progress') }}</h2>
        <div class="pm-eco-lifecycle">
          <div v-for="s in steps" :key="s.key" class="pm-eco-step" :class="{ 'pm-eco-step--done': s.done, 'pm-eco-step--current': s.current }">
            <span class="pm-eco-step-dot" />
            <div>
              <div class="pm-body pm-strong">{{ s.label }}</div>
              <div class="pm-caption">
                <template v-if="s.done">{{ s.who }} · {{ formatDate(s.at) }}<template v-if="s.note"> · {{ s.note }}</template></template>
                <template v-else>{{ t('Not yet') }}</template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <p class="pm-m-0">
        <span class="pm-link" role="link" tabindex="0" @click="activityOpen = true" @keydown.enter="activityOpen = true">
          <template v-if="entries[0]">{{ t('Last updated by') }} {{ entries[0].actor }} {{ t('on') }} {{ formatDate(entries[0].at) }}</template>
          <template v-else>{{ t('Created by') }} {{ eco.publishedBy }} {{ t('on') }} {{ formatDate(eco.publishedAt) }}</template>
        </span>
      </p>
    </div>

    <ActivityLogModal :is-open="activityOpen" :subject="`${eco.no} · ${eco.title}`" :entries="activityEntries" @close="activityOpen = false" />
    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
  <div v-else class="pm-page">
    <PmTitleBar :title="t('Engineering change not found')" :breadcrumb="{ label: project ? `${project.code} · ${project.name}` : t('Projects'), to: projectPath }" />
    <div class="pm-stage">
      <div class="pm-empty-inline">
        <div class="pm-empty-title">{{ t('This engineering change doesn’t exist or was removed.') }}</div>
        <MpButton variant="secondary" is-rounded class="pm-empty-cta" @click="router.push(projectPath)">{{ project ? t('Back to Production') : t('Go to projects') }}</MpButton>
      </div>
    </div>
  </div>
</template>
