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
import PmMenu, { type PmMenuItem } from '../PmMenu.vue'
import PmOverlay from '../PmOverlay.vue'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import {
  projectPhases, phaseWorkPackages, weightTotal, suggestedWeight, addPhase, updatePhase, deletePhase,
  addWorkPackage, updateWorkPackage, deleteWorkPackage, wpStatusLabel, getPhase, getWorkPackage,
  type Project, type Phase, type WorkPackage, type WorkPackageType,
} from '~/data/projects'
import { phaseTotal, wpBudget, getBudget } from '~/data/projectBudgets'
import { wpActual, wpCommitted, phaseActual, phaseCommitted, projectWorkOrders } from '~/data/projectTransactions'
import { getCustomBom, masterBoms, currentVersion, masterDiverged } from '~/data/projectBoms'
import { phaseLockReason, wpStarted, logStructure, replaceCustomBom, reconfirmWeights } from '~/data/projectActions'
import { rp, pct, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'
import { toast } from '@mekari/pixel3'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()

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
  updatePhase(ph.id, { progressWeightPct: v })
  logStructure(props.project.id, `Progress weight on phase ${ph.name}: ${pct(ph.progressWeightPct ?? 0)} → ${pct(v)}`, asActor.value)
}
function applySuggestions() {
  for (const ph of phases.value) {
    if (ph.verifiedAt || ph.auto) continue
    const s = suggestedWeight(ph)
    if (s !== undefined) updatePhase(ph.id, { progressWeightPct: s })
  }
  logStructure(props.project.id, 'Applied suggested progress weights (phase RAB ÷ total RAB)', asActor.value)
  toast.notify({ variant: 'success', title: t('Suggested weights applied — review and adjust if needed') })
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
  } else {
    const wasDepth1 = props.project.depth === 1
    addPhase(props.project.id, data)
    logStructure(props.project.id, wasDepth1 ? `Added first phase ${data.name} — promoted from depth 1 to depth 3 (no cost moved)` : `Added phase ${data.name}`, asActor.value)
    if (wasDepth1) toast.notify({ variant: 'success', title: t('Promoted to depth 3 — existing cost stays on its work package') })
  }
  phaseDrawer.open = false
}

// ── Work package drawer ──
const wpDrawer = reactive({
  open: false, id: '', phaseId: '', name: '', type: 'production' as WorkPackageType, masterBomId: '', plannedUnits: '', unit: 'Unit',
  site: '', workCenter: '', planStart: '', planEnd: '', replaceReason: '', touched: false,
})
function openAddWp(ph: Phase) {
  Object.assign(wpDrawer, { open: true, id: '', phaseId: ph.id, name: '', type: props.project.isProduction ? 'production' : 'service', masterBomId: '', plannedUnits: '', unit: 'Unit', site: '', workCenter: '', planStart: '', planEnd: '', replaceReason: '', touched: false })
}
function openEditWp(wp: WorkPackage) {
  const b = getCustomBom(wp.customBomId)
  Object.assign(wpDrawer, { open: true, id: wp.id, phaseId: wp.phaseId, name: wp.name, type: wp.type, masterBomId: b?.masterBomId ?? '', plannedUnits: wp.plannedUnits ? String(wp.plannedUnits) : '', unit: wp.unit ?? 'Unit', site: wp.site ?? '', workCenter: wp.workCenter ?? '', planStart: wp.planStart ?? '', planEnd: wp.planEnd ?? '', replaceReason: '', touched: false })
}
const editingWp = computed(() => (wpDrawer.id ? getWorkPackage(wpDrawer.id) : undefined))
const editingBom = computed(() => getCustomBom(editingWp.value?.customBomId))
const bomChanging = computed(() => wpDrawer.type === 'production' && (editingBom.value?.masterBomId ?? '') !== wpDrawer.masterBomId)
const bomOpenWo = computed(() => editingBom.value ? projectWorkOrders.find(w => w.customBomId === editingBom.value!.id && w.status !== 'Completed') : undefined)
const selectedMaster = computed(() => masterBoms.find(m => m.id === wpDrawer.masterBomId))
const wpErrors = computed(() => ({
  name: !wpDrawer.name.trim() ? t('Enter the work package name.') : '',
  bom: selectedMaster.value && !selectedMaster.value.components.length ? t('This master BOM has no components, so it can’t be used. Pick another BOM or leave it empty.') : '',
  replace: bomChanging.value && editingBom.value && bomOpenWo.value ? `${t('An open work order')} (${bomOpenWo.value.number}) ${t('uses this BOM, so it can’t be replaced. Raise an engineering change instead.')}` : '',
  reason: bomChanging.value && editingBom.value && !bomOpenWo.value && !wpDrawer.replaceReason.trim() ? t('Enter a reason for replacing the BOM.') : '',
  units: isUnit.value && wpDrawer.type === 'production' && !parseAmount(wpDrawer.plannedUnits) ? t('Unit-measured Output needs planned units.') : '',
}))
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
    if (!notifyResult(replaceCustomBom(wpId, wpDrawer.masterBomId || undefined, wpDrawer.replaceReason, asActor.value), wpDrawer.masterBomId ? t('Master copied into custom BOM v1 — the master is untouched') : t('BOM removed'))) return
  } else {
    toast.notify({ variant: 'success', title: t('Work package saved') })
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
  toast.notify({ variant: 'success', title: t('Deleted') })
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
    { label: t('Delete phase'), danger: true, separatorBefore: true, action: () => askDelete('phase', ph.id, ph.name, !!ph.progressWeightPct), disabledReason: lock ?? (wps.some(w => wpStarted(w.id)) ? t('A work package in this phase has started') : undefined) },
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
  items.push({ label: t('Delete work package'), danger: true, separatorBefore: true, action: () => askDelete('wp', wp.id, `${wp.code} ${wp.name}`),
    disabledReason: wp.auto ? t('The auto work package on a depth-1 project can’t be deleted') : started ?? (phaseWorkPackages(wp.phaseId).length === 1 && !getPhase(wp.phaseId)?.auto ? t('A phase needs at least one work package — delete the phase instead') : undefined) })
  return items
}

const STATUS_TONE: Record<string, string> = { not_started: 'pm-pill--gray', in_progress: 'pm-pill--yellow', technically_complete: 'pm-pill--green' }
function dateRange(a?: string, b?: string) { return a || b ? `${formatDate(a)} – ${formatDate(b)}` : '—' }
function consumedClass(consumed: number, budget?: number) { return budget !== undefined && consumed > budget ? 'pm-neg' : '' }
</script>

<template>
  <div class="pm-stack" style="gap: 16px">
    <!-- Reweight after a change order -->
    <div v-if="project.reweightRequired" class="pm-banner pm-banner--warn">
      <div class="pm-banner-body">
        <div class="pm-banner-title">{{ t('Reconfirm progress weights') }}</div>
        {{ t('An approved change order changed the contract value. Verified phases stay as they are; confirm the unverified weights still total 100% of the new value before verifying more progress.') }}
      </div>
      <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="notifyResult(reconfirmWeights(project.id, asActor), t('Weights reconfirmed'))">{{ t('Reconfirm at 100%') }}</button>
    </div>

    <!-- Weight summary (Output · milestone) -->
    <div v-if="isMilestone && project.depth === 3" class="pm-banner" :class="total === 100 ? 'pm-banner--success' : 'pm-banner--error'">
      <div class="pm-banner-body">
        <div class="pm-banner-title">{{ t('Progress weight total') }}: {{ pct(total) }}</div>
        <template v-if="total === 100">{{ t('Weights total 100%. Each phase is achieved by its own BAST, which recognises that phase’s weight.') }}</template>
        <template v-else>{{ total < 100 ? t('Short by') : t('Over by') }} {{ pct(Math.abs(100 - total)) }}. {{ t('Verification is blocked until the weights total 100%.') }}</template>
      </div>
      <button v-if="canSuggest && !closed" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="applySuggestions">{{ t('Suggest from RAB') }}</button>
    </div>
    <div v-else-if="isMilestone && project.depth === 1" class="pm-banner pm-banner--error">
      <div class="pm-banner-body">{{ t('Milestone-measured Output needs phases — a depth-1 project can’t carry progress weight. Add the first phase.') }}</div>
    </div>

    <div class="pm-row">
      <div>
        <h2 class="pm-h2">{{ t('Project structure') }}</h2>
        <p class="pm-desc">
          <template v-if="project.depth === 1">{{ t('Depth 1 — one work package mirrors the project so cost has somewhere to land. Add a phase to break it down; no cost moves.') }}</template>
          <template v-else>{{ phases.length }} {{ t('phases') }} · {{ phases.reduce((s, p) => s + phaseWorkPackages(p.id).length, 0) }} {{ t('work packages') }}. {{ t('Budget is read-only here — it’s maintained in Budget setup.') }}</template>
        </p>
      </div>
      <span class="pm-spacer" />
      <button v-if="project.depth === 3" class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm" type="button" @click="toggleAll">{{ allOpen ? t('Collapse all') : t('Expand all') }}</button>
      <button v-if="!closed" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="openAddPhase">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        {{ t('Phase') }}
      </button>
    </div>

    <div class="pm-tree-scroll">
      <div class="pm-tree">
        <div class="pm-tree-head">
          <span>{{ t('Phase / work package') }}</span>
          <span>{{ t('Status') }}</span>
          <span>{{ isMilestone ? t('Progress weight') : isUnit ? t('Units') : t('Type') }}</span>
          <span style="text-align: right">{{ t('Budget') }}</span>
          <span style="text-align: right">{{ t('Committed + actual') }}</span>
          <span>{{ t('Planned dates') }}</span>
          <span />
        </div>

        <template v-for="ph in phases" :key="ph.id">
          <!-- Phase row (hidden for the auto node on depth 1) -->
          <div v-if="!ph.auto" class="pm-tree-row pm-tree-row--phase">
            <div class="pm-tree-name">
              <button class="pm-tree-toggle" :class="{ 'pm-tree-toggle--open': openPhases.has(ph.id) }" type="button" :aria-label="t('Expand')" :aria-expanded="openPhases.has(ph.id)" @click="toggle(ph.id)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
              <div class="pm-tree-name-text">
                <div class="pm-strong">{{ ph.order }}. {{ ph.name }}</div>
                <div class="pm-small pm-muted">{{ phaseWorkPackages(ph.id).length }} {{ t('work packages') }}<template v-if="ph.rabValue"> · RAB {{ rp(ph.rabValue) }}</template></div>
              </div>
            </div>
            <div>
              <span v-if="ph.verifiedAt" class="pm-pill pm-pill--green" :title="`${ph.bastNo} · ${formatDate(ph.verifiedAt)}`">{{ t('Verified') }}</span>
              <span v-else class="pm-muted pm-small">—</span>
            </div>
            <div>
              <template v-if="isMilestone">
                <span v-if="ph.verifiedAt" class="pm-strong">{{ pct(ph.progressWeightPct) }}</span>
                <div v-else class="pm-input-group">
                  <input
                    class="pm-input pm-input--sm pm-input--num pm-weight-input" inputmode="decimal" :value="weightValue(ph)" :disabled="closed"
                    :aria-label="`${t('Progress weight')} ${ph.name}`"
                    @input="weightDraft[ph.id] = ($event.target as HTMLInputElement).value" @blur="commitWeight(ph)" @keydown.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <span class="pm-addon" style="padding: 0 6px">%</span>
                </div>
                <div v-if="!ph.verifiedAt && suggestedWeight(ph) !== undefined && suggestedWeight(ph) !== ph.progressWeightPct" class="pm-small pm-muted">{{ t('Suggested') }} {{ pct(suggestedWeight(ph)) }}</div>
              </template>
              <span v-else class="pm-muted pm-small">—</span>
            </div>
            <div class="pm-num">
              <template v-if="hasBudget">{{ rp(phaseTotal(ph.id, project.id)) }}</template>
              <span v-else class="pm-warn pm-small">{{ t('Not set') }}</span>
            </div>
            <div class="pm-num" :class="consumedClass(phaseActual(ph.id) + phaseCommitted(ph.id), hasBudget ? phaseTotal(ph.id, project.id) : undefined)">{{ rp(phaseActual(ph.id) + phaseCommitted(ph.id)) }}</div>
            <div class="pm-small pm-muted">{{ dateRange(phaseWorkPackages(ph.id)[0]?.planStart, phaseWorkPackages(ph.id).slice(-1)[0]?.planEnd) }}</div>
            <PmMenu :items="phaseMenu(ph)" kebab :label="t('Options')" />
          </div>

          <!-- Work package rows -->
          <template v-if="ph.auto || openPhases.has(ph.id)">
            <div v-for="wp in phaseWorkPackages(ph.id)" :key="wp.id" class="pm-tree-row" :class="{ 'pm-tree-row--wp': !ph.auto }">
              <div class="pm-tree-name">
                <div class="pm-tree-name-text">
                  <div>
                    <span class="pm-muted">{{ wp.auto ? '' : wp.code }}</span> {{ wp.name }}
                    <span v-if="wp.auto" class="pm-pill pm-pill--gray" style="margin-left: 4px">{{ t('Auto') }}</span>
                  </div>
                  <div class="pm-small pm-muted pm-row" style="gap: 6px; margin-top: 2px">
                    <span v-if="project.isProduction">{{ wp.type === 'production' ? t('Production') : t('Service') }}</span>
                    <template v-if="wp.type === 'production'">
                      <span>·</span>
                      <button v-if="wp.customBomId" class="pm-link pm-small" type="button" @click="bomView = wp.customBomId">
                        {{ getCustomBom(wp.customBomId)?.name }} v{{ currentVersion(getCustomBom(wp.customBomId)!).version }}
                      </button>
                      <span v-else class="pm-warn">{{ t('No BOM yet') }}</span>
                      <span v-if="wp.customBomId && masterDiverged(getCustomBom(wp.customBomId)!)" class="pm-pill pm-pill--blue" style="height: 18px">{{ t('Master changed') }}</span>
                    </template>
                    <template v-if="wp.site"><span>·</span><span>{{ wp.site }}</span></template>
                  </div>
                </div>
              </div>
              <div><span class="pm-pill" :class="STATUS_TONE[wp.status]">{{ t(wpStatusLabel(wp.status)) }}</span><div v-if="wp.bastPct && wp.bastPct < 100" class="pm-small pm-muted">BAST {{ wp.bastPct }}%</div></div>
              <div class="pm-small">
                <template v-if="wp.plannedUnits">{{ wp.confirmedUnits ?? 0 }} / {{ wp.plannedUnits }} {{ wp.unit }}</template>
                <span v-else class="pm-muted">—</span>
              </div>
              <div class="pm-num">
                <template v-if="hasBudget">{{ wpBudget(wp.id) !== undefined ? rp(wpBudget(wp.id)) : '—' }}</template>
                <span v-else class="pm-warn pm-small">{{ t('Not set') }}</span>
              </div>
              <div class="pm-num" :class="consumedClass(wpActual(wp.id) + wpCommitted(wp.id), wpBudget(wp.id))">
                {{ rp(wpActual(wp.id) + wpCommitted(wp.id)) }}
                <div class="pm-small pm-muted">{{ t('actual') }} {{ rp(wpActual(wp.id)) }}</div>
              </div>
              <div class="pm-small pm-muted">{{ dateRange(wp.planStart, wp.planEnd) }}</div>
              <PmMenu :items="wpMenu(wp)" kebab :label="t('Options')" />
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- Phase drawer -->
    <PmOverlay :open="phaseDrawer.open" :title="phaseDrawer.id ? t('Edit phase') : t('Add phase')" :subtitle="!phaseDrawer.id && project.depth === 1 ? t('Adding the first phase promotes the project to depth 3 — the existing work package moves under it with its cost.') : ''" @close="phaseDrawer.open = false">
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="ph-name">{{ t('Phase name') }}</label>
        <input id="ph-name" v-model="phaseDrawer.name" class="pm-input" :aria-invalid="phaseDrawer.touched && !phaseDrawer.name.trim()" />
        <span v-if="phaseDrawer.touched && !phaseDrawer.name.trim()" class="pm-error">{{ t('Enter the phase name.') }}</span>
      </div>
      <template v-if="isMilestone">
        <div class="pm-field">
          <label class="pm-label" for="ph-rab">{{ t('Phase RAB value') }}</label>
          <div class="pm-input-group"><span class="pm-addon">Rp</span><input id="ph-rab" v-model="phaseDrawer.rab" class="pm-input pm-input--num" inputmode="numeric" /></div>
          <span class="pm-help">{{ t('Contract-side value of this phase from the approved RAB. Used for the weight suggestion — never the internal cost plan (RAP).') }}</span>
        </div>
        <div class="pm-field">
          <label class="pm-label" for="ph-w">{{ t('Progress weight') }}</label>
          <div class="pm-input-group" style="max-width: 160px"><input id="ph-w" v-model="phaseDrawer.weight" class="pm-input pm-input--num" inputmode="decimal" /><span class="pm-addon">%</span></div>
          <span v-if="phaseSuggestion !== undefined" class="pm-help">
            {{ t('Suggested') }}: {{ pct(phaseSuggestion) }} ({{ t('phase RAB ÷ total RAB') }}).
            <button class="pm-link pm-small" type="button" @click="phaseDrawer.weight = String(phaseSuggestion).replace('.', ',')">{{ t('Use suggestion') }}</button>
          </span>
          <span class="pm-help">{{ t('Measures progress, not billing — billing terms live on the contract.') }}</span>
        </div>
      </template>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="phaseDrawer.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="savePhase">{{ t('Save') }}</button>
      </template>
    </PmOverlay>

    <!-- Work package drawer -->
    <PmOverlay :open="wpDrawer.open" :title="wpDrawer.id ? t('Edit work package') : t('Add work package')" :subtitle="getPhase(wpDrawer.phaseId)?.auto ? project.name : getPhase(wpDrawer.phaseId)?.name" @close="wpDrawer.open = false">
      <div v-if="editingWp && wpStarted(editingWp.id)" class="pm-banner pm-banner--warn">
        <div class="pm-banner-body">{{ wpStarted(editingWp.id) }}. {{ t('Only the BOM (while no open work order uses it) and plan details can change.') }}</div>
      </div>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="wp-name">{{ t('Work package name') }}</label>
        <input id="wp-name" v-model="wpDrawer.name" class="pm-input" :disabled="!!(editingWp && wpStarted(editingWp.id))" :aria-invalid="wpDrawer.touched && !!wpErrors.name" />
        <span v-if="wpDrawer.touched && wpErrors.name" class="pm-error">{{ wpErrors.name }}</span>
      </div>
      <div v-if="project.isProduction" class="pm-field">
        <span class="pm-label">{{ t('Type') }}</span>
        <div class="pm-seg">
          <button type="button" :class="{ 'pm-seg--active': wpDrawer.type === 'production' }" :disabled="!!(editingWp && wpStarted(editingWp.id))" @click="wpDrawer.type = 'production'">{{ t('Production') }}</button>
          <button type="button" :class="{ 'pm-seg--active': wpDrawer.type === 'service' }" :disabled="!!(editingWp && wpStarted(editingWp.id))" @click="wpDrawer.type = 'service'">{{ t('Service') }}</button>
        </div>
      </div>
      <template v-if="project.isProduction && wpDrawer.type === 'production'">
        <div class="pm-field">
          <label class="pm-label" for="wp-bom">{{ t('Bill of materials') }}</label>
          <select id="wp-bom" v-model="wpDrawer.masterBomId" class="pm-select" :aria-invalid="wpDrawer.touched && !!(wpErrors.bom || wpErrors.replace)">
            <option value="">{{ t('No BOM yet — attach later') }}</option>
            <option v-for="m in masterBoms.filter(x => !x.archived)" :key="m.id" :value="m.id">{{ m.number }} · {{ m.name }}{{ m.components.length ? '' : ` (${t('no components')})` }}</option>
          </select>
          <span v-if="wpErrors.bom" class="pm-error">{{ wpErrors.bom }}</span>
          <span v-else-if="wpErrors.replace" class="pm-error">{{ wpErrors.replace }}</span>
          <span v-else class="pm-help">{{ t('The master is copied into a custom BOM v1 linked to this work package. The master stays untouched, and later changes to it never reach the copy.') }}</span>
        </div>
        <div v-if="bomChanging && editingBom && !bomOpenWo" class="pm-field">
          <label class="pm-label pm-label-req" for="wp-rr">{{ t('Reason for replacing the BOM') }}</label>
          <input id="wp-rr" v-model="wpDrawer.replaceReason" class="pm-input" :aria-invalid="wpDrawer.touched && !!wpErrors.reason" />
          <span class="pm-help">{{ t('The current copy is archived, not deleted.') }}</span>
        </div>
      </template>
      <div v-if="project.isProduction || isUnit" class="pm-grid-2">
        <div class="pm-field">
          <label class="pm-label" :class="{ 'pm-label-req': isUnit && wpDrawer.type === 'production' }" for="wp-units">{{ t('Planned units') }}</label>
          <input id="wp-units" v-model="wpDrawer.plannedUnits" class="pm-input pm-input--num" inputmode="numeric" :aria-invalid="wpDrawer.touched && !!wpErrors.units" />
          <span v-if="wpDrawer.touched && wpErrors.units" class="pm-error">{{ wpErrors.units }}</span>
        </div>
        <div class="pm-field"><label class="pm-label" for="wp-unit">{{ t('Unit') }}</label><input id="wp-unit" v-model="wpDrawer.unit" class="pm-input" /></div>
      </div>
      <div class="pm-grid-2">
        <div class="pm-field"><label class="pm-label" for="wp-site">{{ t('Site') }}</label><input id="wp-site" v-model="wpDrawer.site" class="pm-input" /></div>
        <div v-if="project.isProduction" class="pm-field"><label class="pm-label" for="wp-wc">{{ t('Work center') }}</label><input id="wp-wc" v-model="wpDrawer.workCenter" class="pm-input" /></div>
        <div class="pm-field"><label class="pm-label" for="wp-ps">{{ t('Planned start') }}</label><input id="wp-ps" v-model="wpDrawer.planStart" type="date" class="pm-input" /></div>
        <div class="pm-field"><label class="pm-label" for="wp-pe">{{ t('Planned end') }}</label><input id="wp-pe" v-model="wpDrawer.planEnd" type="date" class="pm-input" /></div>
      </div>
      <p class="pm-help">{{ t('Budget for this work package is set in Budget setup. A suggested budget is computed from the BOM × planned units there — never auto-applied.') }}</p>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="wpDrawer.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="saveWp">{{ t('Save') }}</button>
      </template>
    </PmOverlay>

    <!-- Delete confirm -->
    <PmOverlay :open="confirmDel.open" variant="modal" :title="confirmDel.kind === 'phase' ? t('Delete phase?') : t('Delete work package?')" @close="confirmDel.open = false">
      <p class="pm-desc" style="margin: 0"><strong>{{ confirmDel.label }}</strong> {{ t('will be removed. Nothing has started against it.') }}</p>
      <div v-if="confirmDel.kind === 'phase' && confirmDel.weighted" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ t('This phase carries a progress weight. After deleting it, reweight the remaining phases to 100%.') }}</div></div>
      <div v-if="confirmDel.kind === 'phase' && phases.filter(p => !p.auto).length === 1" class="pm-banner pm-banner--info"><div class="pm-banner-body">{{ t('This is the last phase — the project returns to depth 1 with an auto work package.') }}</div></div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="confirmDel.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--danger" type="button" @click="doDelete">{{ t('Delete') }}</button>
      </template>
    </PmOverlay>

    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
