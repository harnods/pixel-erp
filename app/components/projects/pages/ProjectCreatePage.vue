<script setup lang="ts">
/**
 * + Project — one create flow that adapts to the job shape (Story 1).
 *
 *  • No physical production → BOM, MRP, work-order, work-center and reservation
 *    fields are not shown at all; the project is created at depth 1 with one
 *    auto work package mirroring the project (unless the user opts into phases).
 *  • Production → phases, work packages, BOM and production plan become available.
 *  • Output · milestone → the flow states the project must have phases (a depth-1
 *    project can't carry progress weight).
 *  • Pegging is mandatory — no Enforced/Optional choice is offered (D2).
 *  • Created as Draft; method, measure and production flag lock at approval (Story 7).
 */
import {
  MpButton, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpRadio, MpCheckbox, MpDatePicker, MpTextlink,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmActionError from '../PmActionError.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { createProject, projects, type RecognitionMethod, type OutputMeasure, type WorkPackageType } from '~/data/projects'
import { customers } from '~/data/customers'
import { logAudit } from '~/data/projectAudit'
import { TODAY_ISO } from '~/data/master'
import { rp, pct, parseAmount, isoToDmy, dmyToIso } from '~/utils/projectFormat'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()
const { asActor, actor } = useProjectRole()

const step = ref(1)
const STEPS = ['Job shape', 'Details', 'Structure', 'Review']

// ── Step 1: shape ──
const isProduction = ref<boolean | null>(null)
const method = ref<RecognitionMethod | ''>('')
const measure = ref<OutputMeasure>('milestone')
const usePhases = ref(false)

const phasesRequired = computed(() => isProduction.value === true || (method.value === 'output' && measure.value === 'milestone'))
watch(phasesRequired, v => { if (v) usePhases.value = true }, { immediate: true })
const depth = computed(() => (usePhases.value ? 3 : 1))

// ── Step 2: details ──
const form = reactive({
  name: '',
  customer: '',
  salesOrderNo: '',
  contractValue: '',
  pm: 'Rizal Candra',
  priority: 'medium' as 'high' | 'medium' | 'low',
  startDate: '2026-07-06',
  endDate: '2026-10-30',
  defaultWarehouse: 'Workshop Cileungsi',
  longTerm: false,
  branch: '',
  department: '',
  costCenter: '',
  fundingSource: '',
})
const PMS = ['Rizal Candra', 'Dewi Lestari', 'Andi Pratama']
const WAREHOUSES = ['Workshop Cileungsi', 'Gudang Utama Bekasi']
const pmOptions = PMS
const warehouseOptions = WAREHOUSES
const priorityOptions = computed(() => [
  { value: 'high', label: t('High') },
  { value: 'medium', label: t('Medium') },
  { value: 'low', label: t('Low') },
])
const wpTypeOptions = computed(() => [
  { value: 'production', label: t('Production') },
  { value: 'service', label: t('Service') },
])
const customerOptions = computed(() => [...new Set([...projects.map(p => p.customer), ...customers.map(c => c.name)])])

// ── Step 3: structure ──
interface WpDraft { name: string; type: WorkPackageType | ''; plannedUnits: string; unit: string }
interface PhaseDraft { name: string; rabValue: string; weight: string; wps: WpDraft[] }
const phaseDrafts = ref<PhaseDraft[]>([])
// Every structure field starts empty — the placeholder hints what goes in it.
function newWp(): WpDraft { return { name: '', type: '', plannedUnits: '', unit: '' } }
function addPhase() { phaseDrafts.value.push({ name: '', rabValue: '', weight: '', wps: [newWp()] }) }
const structureAction = useProjectAction()
function removePhase(i: number) {
  if (phaseDrafts.value.length === 1 && phasesRequired.value) { structureAction.fail(t('This project needs at least one phase.')); return }
  structureAction.clear()
  phaseDrafts.value.splice(i, 1)
}
watch(usePhases, v => { if (v && !phaseDrafts.value.length) { addPhase(); addPhase() } })

const isMilestone = computed(() => method.value === 'output' && measure.value === 'milestone')
const isUnit = computed(() => method.value === 'output' && measure.value === 'unit')
const weightSum = computed(() => Math.round(phaseDrafts.value.reduce((s, p) => s + (Number(p.weight.replace(',', '.')) || 0), 0) * 100) / 100)
const rabSum = computed(() => phaseDrafts.value.reduce((s, p) => s + parseAmount(p.rabValue), 0))
function suggestWeights() {
  if (!rabSum.value) { structureAction.fail(t('Enter each phase’s RAB value first.')); return }
  structureAction.clear()
  phaseDrafts.value.forEach(p => { p.weight = String(Math.round((parseAmount(p.rabValue) / rabSum.value) * 1000) / 10).replace('.', ',') })
}

// ── Validation ──
const touched = ref(false)
const step1Error = computed(() => {
  if (isProduction.value === null) return t('Answer whether the job involves physical production.')
  if (!method.value) return t('Choose how revenue is recognised.')
  return ''
})
const step2Errors = computed(() => ({
  name: !form.name.trim() ? t('Enter the project name.') : '',
  customer: !form.customer.trim() ? t('Enter the customer.') : '',
  contractValue: !parseAmount(form.contractValue) ? t('Enter the contract value.') : '',
  dates: form.endDate < form.startDate ? t('End date must be after the start date.') : '',
}))
const step3Error = computed(() => {
  if (!usePhases.value) return ''
  if (!phaseDrafts.value.length) return t('Add at least one phase.')
  if (phaseDrafts.value.some(p => !p.name.trim())) return t('Every phase needs a name.')
  if (phaseDrafts.value.some(p => p.wps.some(w => !w.name.trim()))) return t('Every work package needs a name, or remove the empty row.')
  if (isProduction.value && phaseDrafts.value.some(p => p.wps.some(w => !w.type))) return t('Choose production or service for every work package.')
  if (phaseDrafts.value.some(p => p.wps.some(w => parseAmount(w.plannedUnits) > 0 && !w.unit.trim()))) return t('Enter the unit for every work package with planned units.')
  if (isUnit.value && !phaseDrafts.value.some(p => p.wps.some(w => parseAmount(w.plannedUnits) > 0))) return t('Unit-measured Output needs planned units on at least one work package.')
  return ''
})
const weightWarning = computed(() => isMilestone.value && usePhases.value && weightSum.value !== 100
  ? `${t('Progress weights total')} ${pct(weightSum.value)} — ${t('they must total 100% before the project can be approved.')}` : '')

function next() {
  touched.value = true
  if (step.value === 1 && step1Error.value) return
  if (step.value === 2 && Object.values(step2Errors.value).some(Boolean)) return
  if (step.value === 3 && step3Error.value) return
  touched.value = false
  step.value++
}
const wpTypeLabel = (v: string) => (v === 'production' ? t('Production') : v === 'service' ? t('Service') : '—')
function fmtAmount(v: string) { const n = parseAmount(v); return n ? n.toLocaleString('id-ID') : '' }
function back() { if (step.value > 1) step.value--; else router.push('/projects') }

const methodText = computed(() => {
  if (method.value === 'tm') return 'T&M'
  if (method.value === 'input') return 'Input (cost-to-cost)'
  if (method.value === 'output') return measure.value === 'unit' ? 'Output · unit' : 'Output · milestone'
  return '—'
})

function create() {
  const p = createProject({
    name: form.name.trim(), customer: form.customer.trim(), salesOrderNo: form.salesOrderNo.trim() || undefined,
    isProduction: !!isProduction.value, method: method.value as RecognitionMethod, measure: method.value === 'output' ? measure.value : undefined,
    contractValue: parseAmount(form.contractValue), pm: form.pm, priority: form.priority, longTerm: form.longTerm,
    defaultWarehouse: isProduction.value ? form.defaultWarehouse : undefined,
    dimensions: { branch: form.branch || undefined, department: form.department || undefined, costCenter: form.costCenter || undefined, fundingSource: form.fundingSource || undefined },
    startDate: form.startDate, endDate: form.endDate,
    phases: usePhases.value ? phaseDrafts.value.map(ph => ({
      name: ph.name.trim(),
      progressWeightPct: isMilestone.value ? Number(ph.weight.replace(',', '.')) || 0 : undefined,
      rabValue: parseAmount(ph.rabValue) || undefined,
      workPackages: ph.wps.filter(w => w.name.trim()).map(w => ({ name: w.name.trim(), type: (w.type || (isProduction.value ? 'production' : 'service')) as WorkPackageType, plannedUnits: parseAmount(w.plannedUnits) || undefined, unit: parseAmount(w.plannedUnits) ? w.unit.trim() : undefined })),
    })) : [],
  }, TODAY_ISO)
  logAudit({ actor: actor.value, role: asActor.value.role, projectId: p.id, kind: 'structure', summary: `Created project ${p.code} as Draft — ${p.isProduction ? 'production' : 'service'}, depth ${p.depth}, ${methodText.value}` })
  successToast(`${p.code} ${t('created as draft')}`)
  router.push(`/projects/${p.id}`)
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('New project')" :breadcrumb="{ label: t('Projects'), to: '/projects' }" />

    <div class="pm-stage">
      <div class="pm-form-width">
        <div v-if="step === 4" class="pm-stack pm-gap-3 pm-mb-5">
          <MpBanner id="pc-review-draft" variant="info">
            <MpBannerIcon />
            <MpBannerTitle>{{ t('The project is created as Draft') }}</MpBannerTitle>
            <MpBannerDescription>{{ t('Nothing consumes budget until the project is approved. Set the budget baseline in Budget setup, then approve — the recognition method, measure and production flag lock at approval.') }}</MpBannerDescription>
          </MpBanner>
          <MpBanner v-if="weightWarning" id="pc-review-weight" variant="warning">
            <MpBannerIcon /><MpBannerDescription>{{ weightWarning }}</MpBannerDescription>
          </MpBanner>
        </div>
        <!-- Stepper -->
        <div class="pm-steps">
          <template v-for="(s, i) in STEPS" :key="s">
            <div class="pm-step" :class="{ 'pm-step--active': step === i + 1 }">
              <span class="pm-step-num">{{ i + 1 }}</span>{{ t(s) }}
            </div>
            <span v-if="i < STEPS.length - 1" class="pm-step-line" />
          </template>
        </div>

        <!-- ── Step 1: job shape ── -->
        <div v-if="step === 1" class="pm-stack pm-gap-6">
          <MpFormControl id="pc-shape-fc" is-required>
            <MpFormLabel>{{ t('Does this job involve physical production?') }}</MpFormLabel>
            <div class="pm-grid-2 pm-mt-2">
              <label class="pm-choice" :class="{ 'pm-choice--active': isProduction === true }">
                <MpRadio id="pc-shape-yes" name="shape" :is-checked="isProduction === true" @change="isProduction = true">
                  <span class="pm-choice-title">{{ t('Yes — we make something') }}</span>
                  <template #description>{{ t('Custom fabrication, karoseri, interior fit-out. Phases, work packages, BOM, production plan and stock reservation are available.') }}</template>
                </MpRadio>
              </label>
              <label class="pm-choice" :class="{ 'pm-choice--active': isProduction === false }">
                <MpRadio id="pc-shape-no" name="shape" :is-checked="isProduction === false" @change="isProduction = false">
                  <span class="pm-choice-title">{{ t('No — it’s a service engagement') }}</span>
                  <template #description>{{ t('Audit, tax, advisory, retainer. No BOM, work orders or reservations. Created with one work package that mirrors the project.') }}</template>
                </MpRadio>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl id="pc-method-fc" is-required>
            <MpFormLabel>{{ t('How is revenue recognised?') }}</MpFormLabel>
            <MpFormHelpText>{{ t('One method and one measure per project. It locks when the project is approved.') }}</MpFormHelpText>
            <div class="pm-grid-3 pm-mt-2">
              <label class="pm-choice" :class="{ 'pm-choice--active': method === 'tm' }">
                <MpRadio id="pc-method-tm" name="method" :is-checked="method === 'tm'" @change="method = 'tm'">
                  <span class="pm-choice-title">{{ t('Time & materials') }}</span>
                  <template #description>{{ t('Bill time and cost incurred. Each entry gets a bill / write-down / write-up decision.') }}</template>
                </MpRadio>
              </label>
              <label class="pm-choice" :class="{ 'pm-choice--active': method === 'input' }">
                <MpRadio id="pc-method-input" name="method" :is-checked="method === 'input'" @change="method = 'input'">
                  <span class="pm-choice-title">{{ t('Input (cost-to-cost)') }}</span>
                  <template #description>{{ t('% complete = actual cost ÷ budget, applied to contract value.') }}</template>
                </MpRadio>
              </label>
              <label class="pm-choice" :class="{ 'pm-choice--active': method === 'output' }">
                <MpRadio id="pc-method-output" name="method" :is-checked="method === 'output'" @change="method = 'output'">
                  <span class="pm-choice-title">{{ t('Output') }}</span>
                  <template #description>{{ t('% complete from achieved phases (by BAST) or confirmed units.') }}</template>
                </MpRadio>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl v-if="method === 'output'" id="pc-measure-fc" is-required>
            <MpFormLabel>{{ t('Output measure') }}</MpFormLabel>
            <div class="pm-stack pm-gap-3 pm-mt-2">
              <MpRadio id="pc-measure-milestone" name="pc-measure" :is-checked="measure === 'milestone'" @change="measure = 'milestone'">
                {{ t('Milestone') }}
                <template #description>{{ t('Progress weight per phase; a phase is achieved by its BAST.') }}</template>
              </MpRadio>
              <MpRadio id="pc-measure-unit" name="pc-measure" :is-checked="measure === 'unit'" @change="measure = 'unit'">
                {{ t('Unit') }}
                <template #description>{{ t('Confirmed ÷ planned units across work packages.') }}</template>
              </MpRadio>
            </div>
            <MpBanner v-if="measure === 'milestone'" id="pc-milestone-note" variant="info" class="pm-mt-3">
              <MpBannerIcon /><MpBannerDescription>{{ t('Milestone-measured Output must have phases — the progress weight lives on each phase and a depth-1 project can’t carry it. Phases are switched on below.') }}</MpBannerDescription>
            </MpBanner>
          </MpFormControl>

          <MpCheckbox v-if="isProduction === false" id="pc-use-phases" :is-checked="usePhases" :is-disabled="phasesRequired" @change="usePhases = !usePhases">
            {{ t('Break this engagement into phases') }}
            <template #description>{{ phasesRequired ? t('Required for milestone-measured Output.') : t('Optional. You can add the first phase later — the project is promoted without moving any cost.') }}</template>
          </MpCheckbox>

          <PmActionError id="pc-step1-error" :error="touched ? step1Error : ''" />
        </div>

        <!-- ── Step 2: details ── -->
        <div v-else-if="step === 2" class="pm-stack pm-gap-5">
          <div class="pm-grid-2">
            <MpFormControl id="pc-name-fc" is-required :is-invalid="touched && !!step2Errors.name">
              <MpFormLabel>{{ t('Project name') }}</MpFormLabel>
              <MpInput id="pc-name" v-model="form.name" />
              <MpFormErrorMessage>{{ step2Errors.name }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="pc-cust-fc" is-required :is-invalid="touched && !!step2Errors.customer">
              <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
              <ErpFilterSelect id="pc-cust" v-model="form.customer" :placeholder="t('Select customer')" :options="customerOptions" width="100%" />
              <MpFormErrorMessage>{{ step2Errors.customer }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="pc-so-fc">
              <MpFormLabel>{{ t('Linked contract / sales order number') }}</MpFormLabel>
              <MpInput id="pc-so" v-model="form.salesOrderNo" />
              <MpFormHelpText>{{ t('Billing terms live on the contract, not on the project structure.') }}</MpFormHelpText>
            </MpFormControl>
            <MpFormControl id="pc-cv-fc" is-required :is-invalid="touched && !!step2Errors.contractValue">
              <MpFormLabel>{{ t('Contract value') }}</MpFormLabel>
              <MpInputGroup id="pc-cv-group">
                <MpInputLeftAddon id="pc-cv-addon" has-background>Rp</MpInputLeftAddon>
                <MpInput id="pc-cv" v-model="form.contractValue" inputmode="numeric" @blur="form.contractValue = fmtAmount(form.contractValue)" />
              </MpInputGroup>
              <MpFormErrorMessage>{{ step2Errors.contractValue }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="pc-pm-fc">
              <MpFormLabel>{{ t('Project manager') }}</MpFormLabel>
              <ErpFilterSelect id="pc-pm" v-model="form.pm" :placeholder="t('Select project manager')" :options="pmOptions" width="100%" :is-clearable="false" />
            </MpFormControl>
            <MpFormControl id="pc-pr-fc">
              <MpFormLabel>{{ t('Priority') }}</MpFormLabel>
              <ErpFilterSelect id="pc-pr" :model-value="form.priority" :placeholder="t('Priority')" :options="priorityOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => (form.priority = (v || 'medium') as 'high' | 'medium' | 'low')" />
              <MpFormHelpText>{{ t('Shown to other projects when they compete for reserved stock.') }}</MpFormHelpText>
            </MpFormControl>
            <MpFormControl id="pc-sd-fc">
              <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
              <MpDatePicker id="pc-sd" :model-value="isoToDmy(form.startDate)" format="DD/MM/YYYY" value-type="format" use-portal is-full-width @update:model-value="(v: string) => (form.startDate = dmyToIso(v))" />
            </MpFormControl>
            <MpFormControl id="pc-ed-fc" :is-invalid="touched && !!step2Errors.dates">
              <MpFormLabel>{{ t('End date') }}</MpFormLabel>
              <MpDatePicker id="pc-ed" :model-value="isoToDmy(form.endDate)" format="DD/MM/YYYY" value-type="format" use-portal is-full-width @update:model-value="(v: string) => (form.endDate = dmyToIso(v))" />
              <MpFormErrorMessage>{{ step2Errors.dates }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl v-if="isProduction" id="pc-wh-fc">
              <MpFormLabel>{{ t('Default warehouse') }}</MpFormLabel>
              <ErpFilterSelect id="pc-wh" v-model="form.defaultWarehouse" :placeholder="t('Select warehouse')" :options="warehouseOptions" width="100%" :is-clearable="false" />
            </MpFormControl>
          </div>
          <MpCheckbox id="pc-long-term" :is-checked="form.longTerm" @change="form.longTerm = !form.longTerm">
            {{ t('Long-term project (create an asset at technical completion)') }}
          </MpCheckbox>

          <div>
            <h3 class="pm-h3">{{ t('Dimension defaults') }}</h3>
            <p class="pm-caption pm-m-0">{{ t('Pre-filled on every line tagged to this project. Dimensions are reporting axes only — there is no dimension-level budget.') }}</p>
          </div>
          <div class="pm-grid-2">
            <MpFormControl id="pc-b-fc"><MpFormLabel>{{ t('Branch') }}</MpFormLabel><MpInput id="pc-b" v-model="form.branch" /></MpFormControl>
            <MpFormControl id="pc-d-fc"><MpFormLabel>{{ t('Department') }}</MpFormLabel><MpInput id="pc-d" v-model="form.department" /></MpFormControl>
            <MpFormControl id="pc-c-fc"><MpFormLabel>{{ t('Cost center') }}</MpFormLabel><MpInput id="pc-c" v-model="form.costCenter" /></MpFormControl>
            <MpFormControl id="pc-f-fc"><MpFormLabel>{{ t('Funding source') }}</MpFormLabel><MpInput id="pc-f" v-model="form.fundingSource" /></MpFormControl>
          </div>
        </div>

        <!-- ── Step 3: structure ── -->
        <div v-else-if="step === 3" class="pm-stack pm-gap-4">
          <MpBanner v-if="!usePhases" id="pc-depth1" variant="info">
            <MpBannerIcon />
            <MpBannerTitle>{{ t('Depth 1 — one work package') }}</MpBannerTitle>
            <MpBannerDescription>{{ t('No phase or work package is shown. One work package is created automatically, mirroring the project, so cost has somewhere to land. Add the first phase any time from the Structure tab.') }}</MpBannerDescription>
          </MpBanner>

          <template v-else>
            <div>
              <h3 class="pm-h3">{{ t('Phases and work packages') }}</h3>
              <p class="pm-caption pm-m-0">{{ t('A phase groups work. A work package is the unit you budget, produce and complete. A phase with no work package gets one automatically.') }}</p>
            </div>

            <MpBanner v-if="isMilestone" id="pc-weight-total" :variant="weightSum === 100 ? 'info' : 'warning'">
              <MpBannerIcon />
              <MpBannerTitle>{{ t('Progress weight total') }}: {{ pct(weightSum) }}</MpBannerTitle>
              <MpBannerDescription>
                {{ weightSum === 100 ? t('Weights total 100%.') : `${t('Difference')}: ${pct(Math.abs(100 - weightSum))}. ${t('Enter each phase’s RAB value to get a suggestion (phase RAB ÷ total RAB), then adjust.')}` }}
                <MpTextlink id="pc-suggest" as="a" @click.prevent="suggestWeights">{{ t('Suggest from RAB') }}</MpTextlink>
              </MpBannerDescription>
            </MpBanner>
            <PmActionError id="pc-structure-error" :error="structureAction.error.value" />

            <div v-for="(ph, pi) in phaseDrafts" :key="pi" class="pm-card pm-stack pm-gap-3">
              <!-- Phase row — delete sits top-right, in the same column as each row's remove -->
              <div class="pm-phase-row">
                <div class="pm-phase-fields" :class="{ 'pm-phase-fields--weight': isMilestone }">
                  <MpFormControl :id="`pc-ph-${pi}-fc`" is-required>
                    <MpFormLabel>{{ t('Phase') }} {{ pi + 1 }}</MpFormLabel>
                    <MpInput :id="`pc-ph-${pi}`" v-model="ph.name" :placeholder="t('e.g. Interior')" />
                  </MpFormControl>
                  <MpFormControl v-if="isMilestone" :id="`pc-ph-rab-${pi}-fc`">
                    <MpFormLabel>{{ t('Phase RAB value') }}</MpFormLabel>
                    <MpInputGroup :id="`pc-ph-rab-${pi}-group`">
                      <MpInputLeftAddon :id="`pc-ph-rab-${pi}-addon`" has-background>Rp</MpInputLeftAddon>
                      <MpInput :id="`pc-ph-rab-${pi}`" v-model="ph.rabValue" inputmode="numeric" placeholder="0" @blur="ph.rabValue = fmtAmount(ph.rabValue)" />
                    </MpInputGroup>
                  </MpFormControl>
                  <MpFormControl v-if="isMilestone" :id="`pc-ph-w-${pi}-fc`">
                    <MpFormLabel>{{ t('Progress weight') }}</MpFormLabel>
                    <MpInputGroup :id="`pc-ph-w-${pi}-group`">
                      <MpInput :id="`pc-ph-w-${pi}`" v-model="ph.weight" inputmode="decimal" placeholder="0" />
                      <MpInputRightAddon :id="`pc-ph-w-${pi}-addon`" has-background>%</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                </div>
                <MpButton :id="`pc-ph-remove-${pi}`" variant="ghost" is-rounded left-icon="delete" :aria-label="t('Remove phase')" class="pm-row-remove" @click="removePhase(pi)" />
              </div>

              <!-- Work package rows: number · name · type · planned units · unit · remove -->
              <div v-for="(wp, wi) in ph.wps" :key="wi" class="pm-wp-row" :class="{ 'pm-wp-row--units': isProduction || isUnit, 'pm-wp-row--type': isProduction }">
                <span class="pm-wp-no">{{ pi + 1 }}.{{ wi + 1 }}</span>
                <MpInput :id="`pc-wp-${pi}-${wi}`" v-model="wp.name" :placeholder="t('Work package name')" :aria-label="t('Work package name')" />
                <ErpFilterSelect v-if="isProduction" :id="`pc-wp-type-${pi}-${wi}`" :model-value="wp.type" :placeholder="t('Type')" :options="wpTypeOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (wp.type = v as WorkPackageType)" />
                <MpInput v-if="isProduction || isUnit" :id="`pc-wp-units-${pi}-${wi}`" v-model="wp.plannedUnits" inputmode="numeric" :placeholder="t('Planned units')" :aria-label="t('Planned units')" />
                <MpInput v-if="isProduction || isUnit" :id="`pc-wp-unit-${pi}-${wi}`" v-model="wp.unit" :placeholder="t('Unit')" :aria-label="t('Unit')" />
                <MpButton :id="`pc-wp-remove-${pi}-${wi}`" variant="ghost" is-rounded left-icon="minus-circular" :aria-label="t('Remove work package')" class="pm-row-remove" @click="ph.wps.splice(wi, 1)" />
              </div>
              <div><MpButton :id="`pc-wp-add-${pi}`" variant="ghost" is-rounded left-icon="add" @click="ph.wps.push(newWp())">{{ t('Work package') }}</MpButton></div>
            </div>
            <div><MpButton id="pc-add-phase" variant="secondary" is-rounded left-icon="add" @click="addPhase">{{ t('New phase') }}</MpButton></div>
            <p v-if="isProduction" class="pm-caption pm-m-0">{{ t('Attach a BOM to each production work package from the Structure tab after the project is created — selecting a master BOM copies it into a custom BOM v1.') }}</p>
          </template>
          <PmActionError id="pc-step3-error" :error="touched ? step3Error : ''" />
        </div>

        <!-- ── Step 4: review (banners sit at the top of the stage, above the stepper) ── -->
        <div v-else class="pm-stack pm-gap-5">
          <section>
            <h3 class="pm-h3 pm-mb-3">{{ t('Details') }}</h3>
            <div class="pm-grid-2">
              <div><div class="pm-stat-label">{{ t('Project name') }}</div><div class="pm-body">{{ form.name }}</div></div>
              <div><div class="pm-stat-label">{{ t('Customer') }}</div><div class="pm-body">{{ form.customer }}</div></div>
              <div><div class="pm-stat-label">{{ t('Contract value') }}</div><div class="pm-body">{{ rp(parseAmount(form.contractValue)) }}</div></div>
              <div><div class="pm-stat-label">{{ t('Project manager') }}</div><div class="pm-body">{{ form.pm }}</div></div>
              <div><div class="pm-stat-label">{{ t('Shape') }}</div><div class="pm-body">{{ isProduction ? t('Production') : t('Service') }} · {{ t('Depth') }} {{ depth }}</div></div>
              <div><div class="pm-stat-label">{{ t('Recognition') }}</div><div class="pm-body">{{ t(methodText) }}</div></div>
              <div><div class="pm-stat-label">{{ t('Pegging') }}</div><div class="pm-body">{{ t('Mandatory — every line on a project document names its project') }}</div></div>
            </div>
          </section>

          <section>
            <h3 class="pm-h3 pm-mb-3">{{ t('Structure') }}</h3>
            <div class="pm-table-wrap">
              <table class="pm-table">
                <thead>
                  <tr>
                    <th>{{ t('Phase / work package') }}</th>
                    <th v-if="isProduction">{{ t('Type') }}</th>
                    <th v-if="isProduction || isUnit" class="pm-num">{{ t('Planned units') }}</th>
                    <th v-if="isMilestone" class="pm-num">{{ t('Phase RAB value') }}</th>
                    <th v-if="isMilestone" class="pm-num">{{ t('Progress weight') }}</th>
                  </tr>
                </thead>
                <tbody v-if="usePhases">
                  <template v-for="(ph, pi) in phaseDrafts" :key="pi">
                    <tr class="pm-tr-sub">
                      <td class="pm-strong">{{ pi + 1 }}. {{ ph.name }}</td>
                      <td v-if="isProduction" />
                      <td v-if="isProduction || isUnit" />
                      <td v-if="isMilestone" class="pm-num">{{ parseAmount(ph.rabValue) ? rp(parseAmount(ph.rabValue)) : '—' }}</td>
                      <td v-if="isMilestone" class="pm-num">{{ pct(Number(ph.weight.replace(',', '.')) || 0) }}</td>
                    </tr>
                    <tr v-for="(wp, wi) in ph.wps.filter(w => w.name.trim())" :key="wi">
                      <td class="pm-pl-6">{{ pi + 1 }}.{{ wi + 1 }} {{ wp.name }}</td>
                      <td v-if="isProduction">{{ wpTypeLabel(wp.type) }}</td>
                      <td v-if="isProduction || isUnit" class="pm-num">{{ parseAmount(wp.plannedUnits) ? `${parseAmount(wp.plannedUnits)} ${wp.unit}` : '—' }}</td>
                      <td v-if="isMilestone" />
                      <td v-if="isMilestone" />
                    </tr>
                    <tr v-if="!ph.wps.some(w => w.name.trim())">
                      <td class="pm-pl-6 pm-muted" :colspan="1 + (isProduction ? 1 : 0) + (isProduction || isUnit ? 1 : 0) + (isMilestone ? 2 : 0)">{{ pi + 1 }}.1 {{ ph.name }} ({{ t('created automatically') }})</td>
                    </tr>
                  </template>
                </tbody>
                <tbody v-else>
                  <tr>
                    <td>{{ form.name }} <span class="pm-muted">({{ t('1 work package (auto)') }})</span></td>
                    <td v-if="isProduction">{{ t('Production') }}</td>
                    <td v-if="isProduction || isUnit" class="pm-num">—</td>
                  </tr>
                </tbody>
                <tfoot v-if="isMilestone && usePhases">
                  <tr><td :colspan="1 + (isProduction ? 1 : 0) + (isProduction || isUnit ? 1 : 0)">{{ t('Total') }}</td><td class="pm-num">{{ rp(rabSum) }}</td><td class="pm-num" :class="{ 'pm-neg': weightSum !== 100 }">{{ pct(weightSum) }}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <div class="pm-footer">
          <MpButton id="pc-back" variant="ghost" is-rounded @click="back">{{ step === 1 ? t('Cancel') : t('Back') }}</MpButton>
          <MpButton v-if="step < 4" id="pc-next" variant="primary" is-rounded @click="next">{{ t('Next') }}</MpButton>
          <MpButton v-else id="pc-create" variant="primary" is-rounded @click="create">{{ t('Create draft project') }}</MpButton>
        </div>
      </div>
    </div>
  </div>
</template>
