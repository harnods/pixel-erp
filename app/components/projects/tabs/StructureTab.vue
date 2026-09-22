<script setup lang="ts">
/**
 * Structure tab — nested accordion, open to Level 2 (PRD §1, Stories 9, 19, 20).
 *
 *  • Output · milestone: the progress weight lives on each phase row, with a
 *    total summary green at 100% / red otherwise (difference stated). A verified
 *    phase can't be deleted or reweighted. No weight input on a depth-1 auto node.
 *  • One Options menu per row, scoped to its level. Edit/delete only while
 *    nothing has started; a refusal states its reason where the button is.
 *  • Adding the first phase promotes depth 1 → 3 without moving cost; deleting
 *    the last phase returns the project to an auto node.
 *  • Production work package: picking a master BOM copies it into custom BOM v1.
 */
import {
  MpButton, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpFormControl, MpFormLabel,
  MpFormErrorMessage, MpFormHelpText, MpSegmentedControl, MpDatePicker, MpTextlink, MpTag,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmMenu, { type PmMenuItem } from '../PmMenu.vue'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  projectPhases, phaseWorkPackages, weightTotal, suggestedWeight, addPhase, updatePhase, deletePhase,
  addWorkPackage, updateWorkPackage, deleteWorkPackage, getPhase, getWorkPackage,
  type Project, type Phase, type WorkPackage, type WorkPackageType,
} from '~/data/projects'
import { phaseTotal, wpBudget, getBudget } from '~/data/projectBudgets'
import { wpActual, wpCommitted, phaseActual, phaseCommitted, projectWorkOrders } from '~/data/projectTransactions'
import { getCustomBom, masterBoms, currentVersion, masterDiverged } from '~/data/projectBoms'
import { phaseLockReason, wpStarted, logStructure, replaceCustomBom, reconfirmWeights } from '~/data/projectActions'
import { rp, pct, parseAmount, isoToDmy, dmyToIso } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()
const pageAction = useProjectAction()
const wpAction = useProjectAction()

const phases = computed(() => projectPhases(props.project.id))
const isMilestone = computed(() => props.project.method === 'output' && props.project.measure === 'milestone')
const isUnit = computed(() => props.project.method === 'output' && props.project.measure === 'unit')
const closed = computed(() => props.project.status === 'closed')
const total = computed(() => weightTotal(props.project.id))
const hasBudget = computed(() => !!getBudget(props.project.id))

// Accordion — open to Level 2 (phases visible, work packages collapsed)
const openPhases = ref<Set<string>>(new Set())
function toggle(id: string) {
  const s = new Set(openPhases.value)
  s.has(id) ? s.delete(id) : s.add(id)
  openPhases.value = s
}
const allOpen = computed(() => phases.value.every(p => openPhases.value.has(p.id)))
function toggleAll() { openPhases.value = allOpen.value ? new Set() : new Set(phases.value.map(p => p.id)) }

// ── Inline weight edit ──
const weightDraft = reactive<Record<string, string>>({})
function weightValue(ph: Phase) { return weightDraft[ph.id] ?? (ph.progressWeightPct !== undefined ? String(ph.progressWeightPct).replace('.', ',') : '') }
function commitWeight(ph: Phase) {
  const raw = weightDraft[ph.id]
  if (raw === undefined) return
  const v = Number(raw.replace(',', '.'))
  delete weightDraft[ph.id]
  if (Number.isNaN(v) || v === ph.progressWeightPct) return
  const before = ph.progressWeightPct ?? 0 // read before updatePhase mutates the reactive phase
  updatePhase(ph.id, { progressWeightPct: v })
  logStructure(props.project.id, `Progress weight on phase ${ph.name}: ${pct(before)} → ${pct(v)}`, asActor.value)
}
function applySuggestions() {
  for (const ph of phases.value) {
    if (ph.verifiedAt || ph.auto) continue
    const s = suggestedWeight(ph)
    if (s !== undefined) updatePhase(ph.id, { progressWeightPct: s })
  }
  logStructure(props.project.id, 'Applied suggested progress weights (phase RAB ÷ total RAB)', asActor.value)
  successToast(t('Suggested weights applied — review and adjust if needed'))
}
const canSuggest = computed(() => phases.value.some(p => !p.auto && !p.verifiedAt && p.rabValue))

// ── Phase drawer ──
const phaseDrawer = reactive({ open: false, id: '' as string, name: '', weight: '', rab: '', touched: false })
function openAddPhase() { Object.assign(phaseDrawer, { open: true, id: '', name: '', weight: '', rab: '', touched: false }) }
function openEditPhase(ph: Phase) {
  Object.assign(phaseDrawer, { open: true, id: ph.id, name: ph.name, weight: ph.progressWeightPct !== undefined ? String(ph.progressWeightPct).replace('.', ',') : '', rab: ph.rabValue ? String(ph.rabValue) : '', touched: false })
}
const phaseSuggestion = computed(() => {
  const rab = parseAmount(phaseDrawer.rab)
  if (!rab) return undefined
  const others = phases.value.filter(p => !p.auto && p.id !== phaseDrawer.id).reduce((s, p) => s + (p.rabValue ?? 0), 0)
  return Math.round((rab / (others + rab)) * 1000) / 10
})
function savePhase() {
  phaseDrawer.touched = true
  if (!phaseDrawer.name.trim()) return
  const data = {
    name: phaseDrawer.name.trim(),
    progressWeightPct: isMilestone.value && phaseDrawer.weight !== '' ? Number(phaseDrawer.weight.replace(',', '.')) : undefined,
    rabValue: parseAmount(phaseDrawer.rab) || undefined,
  }
  if (phaseDrawer.id) {
    updatePhase(phaseDrawer.id, data)
    logStructure(props.project.id, `Edited phase ${data.name}`, asActor.value)
    successToast(t('Phase saved'))
  } else {
    const wasDepth1 = props.project.depth === 1
    addPhase(props.project.id, data)
    logStructure(props.project.id, wasDepth1 ? `Added first phase ${data.name} — promoted from depth 1 to depth 3 (no cost moved)` : `Added phase ${data.name}`, asActor.value)
    successToast(wasDepth1 ? t('Promoted to depth 3 — existing cost stays on its work package') : t('Phase saved'))
  }
  phaseDrawer.open = false
}

// ── Work package drawer ──
const wpDrawer = reactive({
  open: false, id: '', phaseId: '', name: '', type: 'production' as WorkPackageType, masterBomId: '', plannedUnits: '', unit: 'Unit',
  site: '', workCenter: '', planStart: '', planEnd: '', replaceReason: '', touched: false,
})
function openAddWp(ph: Phase) {
  wpAction.clear()
  Object.assign(wpDrawer, { open: true, id: '', phaseId: ph.id, name: '', type: props.project.isProduction ? 'production' : 'service', masterBomId: '', plannedUnits: '', unit: 'Unit', site: '', workCenter: '', planStart: '', planEnd: '', replaceReason: '', touched: false })
}
function openEditWp(wp: WorkPackage) {
  wpAction.clear()
  const b = getCustomBom(wp.customBomId)
  Object.assign(wpDrawer, { open: true, id: wp.id, phaseId: wp.phaseId, name: wp.name, type: wp.type, masterBomId: b?.masterBomId ?? '', plannedUnits: wp.plannedUnits ? String(wp.plannedUnits) : '', unit: wp.unit ?? 'Unit', site: wp.site ?? '', workCenter: wp.workCenter ?? '', planStart: wp.planStart ?? '', planEnd: wp.planEnd ?? '', replaceReason: '', touched: false })
}
const editingWp = computed(() => (wpDrawer.id ? getWorkPackage(wpDrawer.id) : undefined))
const editingStarted = computed(() => (editingWp.value ? wpStarted(editingWp.value.id) : undefined))
const editingBom = computed(() => getCustomBom(editingWp.value?.customBomId))
const bomChanging = computed(() => wpDrawer.type === 'production' && (editingBom.value?.masterBomId ?? '') !== wpDrawer.masterBomId)
const bomOpenWo = computed(() => editingBom.value ? projectWorkOrders.find(w => w.customBomId === editingBom.value!.id && w.status !== 'Completed') : undefined)
const selectedMaster = computed(() => masterBoms.find(m => m.id === wpDrawer.masterBomId))
const bomOptions = computed(() => masterBoms.filter(x => !x.archived).map(m => ({ value: m.id, label: `${m.number} · ${m.name}${m.components.length ? '' : ` (${t('no components')})`}` })))
const typeOptions = computed(() => [
  { id: 'wp-type-production', label: t('Production'), value: 'production' },
  { id: 'wp-type-service', label: t('Service'), value: 'service' },
])
const wpErrors = computed(() => ({
  name: !wpDrawer.name.trim() ? t('Enter the work package name.') : '',
  bom: selectedMaster.value && !selectedMaster.value.components.length ? t('This master BOM has no components, so it can’t be used. Pick another BOM or leave it empty.') : '',
  replace: bomChanging.value && editingBom.value && bomOpenWo.value ? `${t('An open work order')} (${bomOpenWo.value.number}) ${t('uses this BOM, so it can’t be replaced. Raise an engineering change instead.')}` : '',
  reason: bomChanging.value && editingBom.value && !bomOpenWo.value && !wpDrawer.replaceReason.trim() ? t('Enter a reason for replacing the BOM.') : '',
  units: isUnit.value && wpDrawer.type === 'production' && !parseAmount(wpDrawer.plannedUnits) ? t('Unit-measured Output needs planned units.') : '',
}))
function setType(v: string) { if (!editingStarted.value) wpDrawer.type = v as WorkPackageType }
function saveWp() {
  wpDrawer.touched = true
  if (Object.values(wpErrors.value).some(Boolean)) return
  const base = {
    name: wpDrawer.name.trim(), type: props.project.isProduction ? wpDrawer.type : 'service' as WorkPackageType,
    plannedUnits: parseAmount(wpDrawer.plannedUnits) || undefined, unit: parseAmount(wpDrawer.plannedUnits) ? wpDrawer.unit : undefined,
    site: wpDrawer.site || undefined, workCenter: wpDrawer.workCenter || undefined, planStart: wpDrawer.planStart || undefined, planEnd: wpDrawer.planEnd || undefined,
  }
  let wpId = wpDrawer.id
  if (wpId) {
    updateWorkPackage(wpId, base)
    logStructure(props.project.id, `Edited work package ${editingWp.value?.code} ${base.name}`, asActor.value)
  } else {
    const wp = addWorkPackage(wpDrawer.phaseId, base)
    wpId = wp.id
    logStructure(props.project.id, `Added work package ${wp.code} ${wp.name} under ${getPhase(wpDrawer.phaseId)?.name}`, asActor.value)
    const s = new Set(openPhases.value); s.add(wpDrawer.phaseId); openPhases.value = s
  }
  if (base.type === 'production' && bomChanging.value) {
    if (!wpAction.run(replaceCustomBom(wpId, wpDrawer.masterBomId || undefined, wpDrawer.replaceReason, asActor.value), wpDrawer.masterBomId ? t('Master copied into custom BOM v1 — the master is untouched') : t('BOM removed'))) return
  } else {
    successToast(t('Work package saved'))
  }
  wpDrawer.open = false
}

// ── Delete confirm ──
const confirmDel = reactive({ open: false, kind: '' as 'phase' | 'wp' | '', id: '', label: '', weighted: false })
function askDelete(kind: 'phase' | 'wp', id: string, label: string, weighted = false) { Object.assign(confirmDel, { open: true, kind, id, label, weighted }) }
function doDelete() {
  if (confirmDel.kind === 'phase') {
    const last = phases.value.filter(p => !p.auto).length === 1
    deletePhase(confirmDel.id)
    logStructure(props.project.id, `Deleted phase ${confirmDel.label}${last ? ' — last phase, project returned to an auto node (depth 1)' : ''}`, asActor.value)
  } else {
    deleteWorkPackage(confirmDel.id)
    logStructure(props.project.id, `Deleted work package ${confirmDel.label}`, asActor.value)
  }
  confirmDel.open = false
  successToast(t('Deleted'))
}

// ── BOM detail ──
const bomView = ref<string | undefined>()

// ── Row menus ──
function phaseMenu(ph: Phase): PmMenuItem[] {
  const lock = closed.value ? t('Project is closed') : phaseLockReason(ph.id)
  const wps = phaseWorkPackages(ph.id)
  return [
    { label: t('Edit phase'), action: () => openEditPhase(ph), disabledReason: lock },
    { label: t('Add work package'), action: () => openAddWp(ph), disabledReason: closed.value ? t('Project is closed') : undefined },
    { label: t('Delete phase'), danger: true, action: () => askDelete('phase', ph.id, ph.name, !!ph.progressWeightPct), disabledReason: lock ?? (wps.some(w => wpStarted(w.id)) ? t('A work package in this phase has started') : undefined) },
  ]
}
function wpMenu(wp: WorkPackage): PmMenuItem[] {
  const started = closed.value ? t('Project is closed') : wpStarted(wp.id)
  const items: PmMenuItem[] = [
    { label: t('Edit work package'), action: () => openEditWp(wp), disabledReason: started && wp.type !== 'production' ? started : undefined },
  ]
  if (wp.type === 'production') {
    items.push({ label: wp.customBomId ? t('View custom BOM') : t('Attach BOM'), action: () => (wp.customBomId ? (bomView.value = wp.customBomId) : openEditWp(wp)) })
    items.push({ label: t('New work order'), action: () => router.push(`/projects/${props.project.id}/work-orders/new?wp=${wp.id}`), disabledReason: closed.value ? t('Project is closed') : !hasBudget.value ? t('Budget not set — link a plan in Budget setup first') : undefined })
  }
  items.push({ label: t('Record BAST'), action: () => router.replace({ query: { tab: 'completion' } }), disabledReason: props.project.status !== 'active' ? t('Only an active project records BAST') : undefined })
  items.push({ label: t('Delete work package'), danger: true, action: () => askDelete('wp', wp.id, `${wp.code} ${wp.name}`),
    disabledReason: wp.auto ? t('The auto work package on a depth-1 project can’t be deleted') : started ?? (phaseWorkPackages(wp.phaseId).length === 1 && !getPhase(wp.phaseId)?.auto ? t('A phase needs at least one work package — delete the phase instead') : undefined) })
  return items
}

function dateRange(a?: string, b?: string) { return a || b ? `${formatDate(a)} – ${formatDate(b)}` : '—' }
function consumedClass(consumed: number, budget?: number) { return budget !== undefined && consumed > budget ? 'pm-neg' : '' }
function doReconfirm() { pageAction.run(reconfirmWeights(props.project.id, asActor.value), t('Weights reconfirmed')) }
</script>

<template>
  <div class="pm-stack pm-gap-4">
    <!-- Reweight after a change order -->
    <MpBanner v-if="project.reweightRequired" id="pm-reweight-banner" variant="warning">
      <MpBannerIcon />
      <MpBannerTitle>{{ t('Reconfirm progress weights') }}</MpBannerTitle>
      <MpBannerDescription>
        {{ t('An approved change order changed the contract value. Verified phases stay as they are; confirm the unverified weights still total 100% of the new value before verifying more progress.') }}
        <MpTextlink id="pm-reconfirm-weights" as="a" @click.prevent="doReconfirm">{{ t('Reconfirm at 100%') }}</MpTextlink>
      </MpBannerDescription>
    </MpBanner>
    <PmActionError id="pm-structure-error" :error="pageAction.error.value" />

    <!-- Weight summary (Output · milestone) -->
    <MpBanner v-if="isMilestone && project.depth === 3" id="pm-weight-summary" :variant="total === 100 ? 'info' : 'danger'">
      <MpBannerIcon />
      <MpBannerTitle>{{ t('Progress weight total') }}: {{ pct(total) }}</MpBannerTitle>
      <MpBannerDescription>
        <template v-if="total === 100">{{ t('Weights total 100%. Each phase is achieved by its own BAST, which recognises that phase’s weight.') }}</template>
        <template v-else>{{ total < 100 ? t('Short by') : t('Over by') }} {{ pct(Math.abs(100 - total)) }}. {{ t('Verification is blocked until the weights total 100%.') }}</template>
        <MpTextlink v-if="canSuggest && !closed" id="pm-suggest-weights" as="a" @click.prevent="applySuggestions">{{ t('Suggest from RAB') }}</MpTextlink>
      </MpBannerDescription>
    </MpBanner>
    <MpBanner v-else-if="isMilestone && project.depth === 1" id="pm-weight-depth1" variant="danger">
      <MpBannerIcon />
      <MpBannerDescription>{{ t('Milestone-measured Output needs phases — a depth-1 project can’t carry progress weight. Add the first phase.') }}</MpBannerDescription>
    </MpBanner>

    <div class="pm-row">
      <div>
        <h2 class="pm-h2">{{ t('Project structure') }}</h2>
        <p class="pm-caption pm-m-0">
          <template v-if="project.depth === 1">{{ t('Depth 1 — one work package mirrors the project so cost has somewhere to land. Add a phase to break it down; no cost moves.') }}</template>
          <template v-else>{{ phases.length }} {{ t('phases') }} · {{ phases.reduce((s, p) => s + phaseWorkPackages(p.id).length, 0) }} {{ t('work packages') }}. {{ t('Budget is read-only here — it’s maintained in Budget setup.') }}</template>
        </p>
      </div>
      <span class="pm-spacer" />
      <MpButton v-if="project.depth === 3" id="pm-toggle-all" variant="ghost" is-rounded @click="toggleAll">{{ allOpen ? t('Collapse all') : t('Expand all') }}</MpButton>
      <MpButton v-if="!closed" id="pm-add-phase" variant="secondary" is-rounded left-icon="add" @click="openAddPhase">{{ t('New phase') }}</MpButton>
    </div>

    <div class="pm-tree-scroll">
      <div class="pm-tree">
        <div class="pm-tree-head">
          <span>{{ t('Phase / work package') }}</span>
          <span>{{ t('Status') }}</span>
          <span>{{ isMilestone ? t('Progress weight') : isUnit ? t('Units') : t('Type') }}</span>
          <span class="pm-num">{{ t('Budget') }}</span>
          <span class="pm-num">{{ t('Committed + actual') }}</span>
          <span>{{ t('Planned dates') }}</span>
          <span />
        </div>

        <template v-for="ph in phases" :key="ph.id">
          <!-- Phase row (hidden for the auto node on depth 1) -->
          <div v-if="!ph.auto" class="pm-tree-row pm-tree-row--phase">
            <div class="pm-tree-name">
              <MpButton :id="`pm-toggle-${ph.id}`" variant="ghost" is-rounded :aria-label="t('Expand')" :aria-expanded="openPhases.has(ph.id)" @click="toggle(ph.id)">
                <MpIcon :name="openPhases.has(ph.id) ? 'chevrons-down' : 'chevrons-right'" size="sm" />
              </MpButton>
              <div>
                <div class="pm-strong">{{ ph.order }}. {{ ph.name }}</div>
                <div class="pm-caption">{{ phaseWorkPackages(ph.id).length }} {{ t('work packages') }}<template v-if="ph.rabValue"> · RAB {{ rp(ph.rabValue) }}</template></div>
              </div>
            </div>
            <div>
              <template v-if="ph.verifiedAt">
                <ErpStatusBadge v-bind="badgeProps('flag', 'verified', t)" />
                <div class="pm-caption">{{ ph.bastNo }} · {{ formatDate(ph.verifiedAt) }}</div>
              </template>
              <span v-else class="pm-muted">—</span>
            </div>
            <div>
              <template v-if="isMilestone">
                <span v-if="ph.verifiedAt" class="pm-strong">{{ pct(ph.progressWeightPct) }}</span>
                <MpInputGroup v-else :id="`pm-weight-group-${ph.id}`" class="pm-w-cell">
                  <MpInput
                    :id="`pm-weight-${ph.id}`" :model-value="weightValue(ph)" inputmode="decimal" :is-disabled="closed"
                    :aria-label="`${t('Progress weight')} ${ph.name}`"
                    @update:model-value="(v: string) => (weightDraft[ph.id] = v)" @blur="commitWeight(ph)" @keydown.enter="commitWeight(ph)"
                  />
                  <MpInputRightAddon has-background>%</MpInputRightAddon>
                </MpInputGroup>
                <div v-if="!ph.verifiedAt && suggestedWeight(ph) !== undefined && suggestedWeight(ph) !== ph.progressWeightPct" class="pm-caption">{{ t('Suggested') }} {{ pct(suggestedWeight(ph)) }}</div>
              </template>
              <span v-else class="pm-muted">—</span>
            </div>
            <div class="pm-num">
              <template v-if="hasBudget">{{ rp(phaseTotal(ph.id, project.id)) }}</template>
              <span v-else class="pm-warn">{{ t('Not set') }}</span>
            </div>
            <div class="pm-num" :class="consumedClass(phaseActual(ph.id) + phaseCommitted(ph.id), hasBudget ? phaseTotal(ph.id, project.id) : undefined)">{{ rp(phaseActual(ph.id) + phaseCommitted(ph.id)) }}</div>
            <div class="pm-caption">{{ dateRange(phaseWorkPackages(ph.id)[0]?.planStart, phaseWorkPackages(ph.id).slice(-1)[0]?.planEnd) }}</div>
            <PmMenu :id="`pm-phase-menu-${ph.id}`" :items="phaseMenu(ph)" kebab :label="t('Options')" />
          </div>

          <!-- Work package rows -->
          <template v-if="ph.auto || openPhases.has(ph.id)">
            <div v-for="wp in phaseWorkPackages(ph.id)" :key="wp.id" class="pm-tree-row" :class="{ 'pm-tree-row--wp': !ph.auto }">
              <div class="pm-tree-name">
                <div>
                  <div class="pm-row pm-gap-1">
                    <span v-if="!wp.auto" class="pm-muted">{{ wp.code }}</span>
                    <span>{{ wp.name }}</span>
                    <MpTag v-if="wp.auto" :id="`pm-auto-${wp.id}`">{{ t('Auto') }}</MpTag>
                  </div>
                  <div class="pm-caption pm-row pm-gap-1">
                    <span v-if="project.isProduction">{{ wp.type === 'production' ? t('Production') : t('Service') }}</span>
                    <template v-if="wp.type === 'production'">
                      <span>·</span>
                      <MpTextlink v-if="wp.customBomId" :id="`pm-bom-link-${wp.id}`" as="a" @click.prevent="bomView = wp.customBomId">
                        {{ getCustomBom(wp.customBomId)?.name }} v{{ currentVersion(getCustomBom(wp.customBomId)!).version }}
                      </MpTextlink>
                      <span v-else class="pm-warn">{{ t('No BOM yet') }}</span>
                      <ErpStatusBadge v-if="wp.customBomId && masterDiverged(getCustomBom(wp.customBomId)!)" v-bind="badgeProps('flag', 'master-changed', t)" />
                    </template>
                    <template v-if="wp.site"><span>·</span><span>{{ wp.site }}</span></template>
                  </div>
                </div>
              </div>
              <div>
                <ErpStatusBadge v-bind="badgeProps('wp', wp.status, t)" />
                <div v-if="wp.bastPct && wp.bastPct < 100" class="pm-caption">BAST {{ wp.bastPct }}%</div>
              </div>
              <div class="pm-small">
                <template v-if="wp.plannedUnits">{{ wp.confirmedUnits ?? 0 }} / {{ wp.plannedUnits }} {{ wp.unit }}</template>
                <span v-else class="pm-muted">—</span>
              </div>
              <div class="pm-num">
                <template v-if="hasBudget">{{ wpBudget(wp.id) !== undefined ? rp(wpBudget(wp.id)) : '—' }}</template>
                <span v-else class="pm-warn">{{ t('Not set') }}</span>
              </div>
              <div class="pm-num" :class="consumedClass(wpActual(wp.id) + wpCommitted(wp.id), wpBudget(wp.id))">
                {{ rp(wpActual(wp.id) + wpCommitted(wp.id)) }}
                <div class="pm-caption">{{ t('actual') }} {{ rp(wpActual(wp.id)) }}</div>
              </div>
              <div class="pm-caption">{{ dateRange(wp.planStart, wp.planEnd) }}</div>
              <PmMenu :id="`pm-wp-menu-${wp.id}`" :items="wpMenu(wp)" kebab :label="t('Options')" />
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- Phase drawer -->
    <PmOverlay id="pm-phase-drawer" :open="phaseDrawer.open" :title="phaseDrawer.id ? t('Edit phase') : t('New phase')" @close="phaseDrawer.open = false">
      <MpBanner v-if="!phaseDrawer.id && project.depth === 1" id="pm-phase-promote" variant="info">
        <MpBannerIcon />
        <MpBannerDescription>{{ t('Adding the first phase promotes the project to depth 3 — the existing work package moves under it with its cost.') }}</MpBannerDescription>
      </MpBanner>
      <MpFormControl id="ph-name-fc" is-required :is-invalid="phaseDrawer.touched && !phaseDrawer.name.trim()">
        <MpFormLabel>{{ t('Phase name') }}</MpFormLabel>
        <MpInput id="ph-name" v-model="phaseDrawer.name" />
        <MpFormErrorMessage>{{ t('Enter the phase name.') }}</MpFormErrorMessage>
      </MpFormControl>
      <template v-if="isMilestone">
        <MpFormControl id="ph-rab-fc">
          <MpFormLabel>{{ t('Phase RAB value') }}</MpFormLabel>
          <MpInputGroup id="ph-rab-group">
            <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
            <MpInput id="ph-rab" v-model="phaseDrawer.rab" inputmode="numeric" />
          </MpInputGroup>
          <MpFormHelpText>{{ t('Contract-side value of this phase from the approved RAB. Used for the weight suggestion — never the internal cost plan (RAP).') }}</MpFormHelpText>
        </MpFormControl>
        <MpFormControl id="ph-w-fc">
          <MpFormLabel>{{ t('Progress weight') }}</MpFormLabel>
          <MpInputGroup id="ph-w-group" class="pm-maxw-short">
            <MpInput id="ph-w" v-model="phaseDrawer.weight" inputmode="decimal" />
            <MpInputRightAddon has-background>%</MpInputRightAddon>
          </MpInputGroup>
          <MpFormHelpText v-if="phaseSuggestion !== undefined">
            {{ t('Suggested') }}: {{ pct(phaseSuggestion) }} ({{ t('phase RAB ÷ total RAB') }}).
            <MpTextlink id="ph-use-suggestion" as="a" @click.prevent="phaseDrawer.weight = String(phaseSuggestion).replace('.', ',')">{{ t('Use suggestion') }}</MpTextlink>
          </MpFormHelpText>
          <MpFormHelpText>{{ t('Measures progress, not billing — billing terms live on the contract.') }}</MpFormHelpText>
        </MpFormControl>
      </template>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="phaseDrawer.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="savePhase">{{ t('Save') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- Work package drawer -->
    <PmOverlay id="pm-wp-drawer" :open="wpDrawer.open" :title="wpDrawer.id ? t('Edit work package') : t('New work package')" :subtitle="getPhase(wpDrawer.phaseId)?.auto ? project.name : getPhase(wpDrawer.phaseId)?.name" @close="wpDrawer.open = false">
      <MpBanner v-if="editingStarted" id="pm-wp-started" variant="warning">
        <MpBannerIcon />
        <MpBannerDescription>{{ editingStarted }}. {{ t('Only the BOM (while no open work order uses it) and plan details can change.') }}</MpBannerDescription>
      </MpBanner>
      <MpFormControl id="wp-name-fc" is-required :is-invalid="wpDrawer.touched && !!wpErrors.name">
        <MpFormLabel>{{ t('Work package name') }}</MpFormLabel>
        <MpInput id="wp-name" v-model="wpDrawer.name" :is-read-only="!!editingStarted" />
        <MpFormErrorMessage>{{ wpErrors.name }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl v-if="project.isProduction" id="wp-type-fc">
        <MpFormLabel>{{ t('Type') }}</MpFormLabel>
        <MpSegmentedControl id="wp-type" name="wp-type" :model-value="wpDrawer.type" :data="typeOptions" @update:model-value="setType" />
        <MpFormHelpText v-if="editingStarted">{{ t('The type can’t change once work has started.') }}</MpFormHelpText>
      </MpFormControl>
      <template v-if="project.isProduction && wpDrawer.type === 'production'">
        <MpFormControl id="wp-bom-fc" :is-invalid="wpDrawer.touched && !!(wpErrors.bom || wpErrors.replace)">
          <MpFormLabel>{{ t('Bill of materials') }}</MpFormLabel>
          <ErpFilterSelect id="wp-bom" v-model="wpDrawer.masterBomId" :placeholder="t('No BOM yet — attach later')" :options="bomOptions" width="100%" />
          <MpFormErrorMessage>{{ wpErrors.bom || wpErrors.replace }}</MpFormErrorMessage>
          <MpFormHelpText v-if="!wpErrors.bom && !wpErrors.replace">{{ t('The master is copied into a custom BOM v1 linked to this work package. The master stays untouched, and later changes to it never reach the copy.') }}</MpFormHelpText>
        </MpFormControl>
        <MpFormControl v-if="bomChanging && editingBom && !bomOpenWo" id="wp-rr-fc" is-required :is-invalid="wpDrawer.touched && !!wpErrors.reason">
          <MpFormLabel>{{ t('Reason for replacing the BOM') }}</MpFormLabel>
          <MpInput id="wp-rr" v-model="wpDrawer.replaceReason" />
          <MpFormErrorMessage>{{ wpErrors.reason }}</MpFormErrorMessage>
          <MpFormHelpText>{{ t('The current copy is archived, not deleted.') }}</MpFormHelpText>
        </MpFormControl>
      </template>
      <div v-if="project.isProduction || isUnit" class="pm-grid-2">
        <MpFormControl id="wp-units-fc" :is-required="isUnit && wpDrawer.type === 'production'" :is-invalid="wpDrawer.touched && !!wpErrors.units">
          <MpFormLabel>{{ t('Planned units') }}</MpFormLabel>
          <MpInput id="wp-units" v-model="wpDrawer.plannedUnits" inputmode="numeric" />
          <MpFormErrorMessage>{{ wpErrors.units }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="wp-unit-fc">
          <MpFormLabel>{{ t('Unit') }}</MpFormLabel>
          <MpInput id="wp-unit" v-model="wpDrawer.unit" />
        </MpFormControl>
      </div>
      <div class="pm-grid-2">
        <MpFormControl id="wp-site-fc">
          <MpFormLabel>{{ t('Site') }}</MpFormLabel>
          <MpInput id="wp-site" v-model="wpDrawer.site" />
        </MpFormControl>
        <MpFormControl v-if="project.isProduction" id="wp-wc-fc">
          <MpFormLabel>{{ t('Work center') }}</MpFormLabel>
          <MpInput id="wp-wc" v-model="wpDrawer.workCenter" />
        </MpFormControl>
        <MpFormControl id="wp-ps-fc">
          <MpFormLabel>{{ t('Planned start') }}</MpFormLabel>
          <MpDatePicker id="wp-ps" :model-value="isoToDmy(wpDrawer.planStart)" format="DD/MM/YYYY" value-type="format" use-portal is-full-width @update:model-value="(v: string) => (wpDrawer.planStart = dmyToIso(v))" />
        </MpFormControl>
        <MpFormControl id="wp-pe-fc">
          <MpFormLabel>{{ t('Planned end') }}</MpFormLabel>
          <MpDatePicker id="wp-pe" :model-value="isoToDmy(wpDrawer.planEnd)" format="DD/MM/YYYY" value-type="format" use-portal is-full-width @update:model-value="(v: string) => (wpDrawer.planEnd = dmyToIso(v))" />
        </MpFormControl>
      </div>
      <p class="pm-caption pm-m-0">{{ t('Budget for this work package is set in Budget setup. A suggested budget is computed from the BOM × planned units there — never auto-applied.') }}</p>
      <PmActionError id="pm-wp-error" :error="wpAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="wpDrawer.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="saveWp">{{ t('Save') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- Delete confirm -->
    <PmOverlay id="pm-delete-modal" :open="confirmDel.open" variant="modal" :title="confirmDel.kind === 'phase' ? t('Delete phase?') : t('Delete work package?')" @close="confirmDel.open = false">
      <p class="pm-body pm-m-0"><strong>{{ confirmDel.label }}</strong> {{ t('will be removed. Nothing has started against it.') }}</p>
      <MpBanner v-if="confirmDel.kind === 'phase' && confirmDel.weighted" id="pm-delete-weighted" variant="warning">
        <MpBannerIcon /><MpBannerDescription>{{ t('This phase carries a progress weight. After deleting it, reweight the remaining phases to 100%.') }}</MpBannerDescription>
      </MpBanner>
      <MpBanner v-if="confirmDel.kind === 'phase' && phases.filter(p => !p.auto).length === 1" id="pm-delete-last" variant="info">
        <MpBannerIcon /><MpBannerDescription>{{ t('This is the last phase — the project returns to depth 1 with an auto work package.') }}</MpBannerDescription>
      </MpBanner>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="confirmDel.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="danger" is-rounded @click="doDelete">{{ t('Delete') }}</MpButton>
      </template>
    </PmOverlay>

    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
