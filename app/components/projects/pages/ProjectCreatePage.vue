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
import PmTitleBar from '../PmTitleBar.vue'
import { createProject, projects, type RecognitionMethod, type OutputMeasure, type WorkPackageType } from '~/data/projects'
import { customers } from '~/data/customers'
import { logAudit } from '~/data/projectAudit'
import { TODAY_ISO } from '~/data/master'
import { rp, pct, parseAmount } from '~/utils/projectFormat'
import { toast } from '@mekari/pixel3'

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
const customerOptions = computed(() => [...new Set([...projects.map(p => p.customer), ...customers.map(c => c.name)])])

// ── Step 3: structure ──
interface WpDraft { name: string; type: WorkPackageType; plannedUnits: string; unit: string }
interface PhaseDraft { name: string; rabValue: string; weight: string; wps: WpDraft[] }
const phaseDrafts = ref<PhaseDraft[]>([])
function newWp(): WpDraft { return { name: '', type: isProduction.value ? 'production' : 'service', plannedUnits: '', unit: 'Unit' } }
function addPhase() { phaseDrafts.value.push({ name: '', rabValue: '', weight: '', wps: [newWp()] }) }
function removePhase(i: number) { phaseDrafts.value.splice(i, 1) }
watch(usePhases, v => { if (v && !phaseDrafts.value.length) { addPhase(); addPhase() } })

const isMilestone = computed(() => method.value === 'output' && measure.value === 'milestone')
const isUnit = computed(() => method.value === 'output' && measure.value === 'unit')
const weightSum = computed(() => Math.round(phaseDrafts.value.reduce((s, p) => s + (Number(p.weight.replace(',', '.')) || 0), 0) * 100) / 100)
const rabSum = computed(() => phaseDrafts.value.reduce((s, p) => s + parseAmount(p.rabValue), 0))
function suggestWeights() {
  if (!rabSum.value) return
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
      workPackages: ph.wps.filter(w => w.name.trim()).map(w => ({ name: w.name.trim(), type: w.type, plannedUnits: parseAmount(w.plannedUnits) || undefined, unit: parseAmount(w.plannedUnits) ? w.unit : undefined })),
    })) : [],
  }, TODAY_ISO)
  logAudit({ actor: actor.value, role: asActor.value.role, projectId: p.id, kind: 'structure', summary: `Created project ${p.code} as Draft — ${p.isProduction ? 'production' : 'service'}, depth ${p.depth}, ${methodText.value}` })
  toast.notify({ variant: 'success', title: `${p.code} ${t('created as draft')}` })
  router.push(`/projects/${p.id}`)
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Project')" :breadcrumb="{ label: t('Projects'), to: '/projects' }" />

    <div class="pm-stage">
      <div style="max-width: 920px">
        <!-- Stepper -->
        <div class="pm-steps">
          <template v-for="(s, i) in STEPS" :key="s">
            <div class="pm-step" :class="{ 'pm-step--active': step === i + 1, 'pm-step--done': step > i + 1 }">
              <span class="pm-step-num">{{ step > i + 1 ? '✓' : i + 1 }}</span>{{ t(s) }}
            </div>
            <span v-if="i < STEPS.length - 1" class="pm-step-line" />
          </template>
        </div>

        <!-- ── Step 1: job shape ── -->
        <div v-if="step === 1" class="pm-stack" style="gap: 24px">
          <div class="pm-field">
            <span class="pm-label pm-label-req">{{ t('Does this job involve physical production?') }}</span>
            <div class="pm-grid-2">
              <label class="pm-choice" :class="{ 'pm-choice--active': isProduction === true }">
                <input v-model="isProduction" type="radio" :value="true" name="shape" />
                <div>
                  <div class="pm-choice-title">{{ t('Yes — we make something') }}</div>
                  <div class="pm-choice-desc">{{ t('Custom fabrication, karoseri, interior fit-out. Phases, work packages, BOM, production plan and stock reservation are available.') }}</div>
                </div>
              </label>
              <label class="pm-choice" :class="{ 'pm-choice--active': isProduction === false }">
                <input v-model="isProduction" type="radio" :value="false" name="shape" />
                <div>
                  <div class="pm-choice-title">{{ t('No — it’s a service engagement') }}</div>
                  <div class="pm-choice-desc">{{ t('Audit, tax, advisory, retainer. No BOM, work orders or reservations. Created with one work package that mirrors the project.') }}</div>
                </div>
              </label>
            </div>
          </div>

          <div class="pm-field">
            <span class="pm-label pm-label-req">{{ t('How is revenue recognised?') }}</span>
            <span class="pm-help">{{ t('One method and one measure per project. It locks when the project is approved.') }}</span>
            <div class="pm-grid-3">
              <label class="pm-choice" :class="{ 'pm-choice--active': method === 'tm' }">
                <input v-model="method" type="radio" value="tm" name="method" />
                <div>
                  <div class="pm-choice-title">{{ t('Time & materials') }}</div>
                  <div class="pm-choice-desc">{{ t('Bill time and cost incurred. Each entry gets a bill / write-down / write-up decision.') }}</div>
                </div>
              </label>
              <label class="pm-choice" :class="{ 'pm-choice--active': method === 'input' }">
                <input v-model="method" type="radio" value="input" name="method" />
                <div>
                  <div class="pm-choice-title">{{ t('Input (cost-to-cost)') }}</div>
                  <div class="pm-choice-desc">{{ t('% complete = actual cost ÷ budget, applied to contract value.') }}</div>
                </div>
              </label>
              <label class="pm-choice" :class="{ 'pm-choice--active': method === 'output' }">
                <input v-model="method" type="radio" value="output" name="method" />
                <div>
                  <div class="pm-choice-title">{{ t('Output') }}</div>
                  <div class="pm-choice-desc">{{ t('% complete from achieved phases (by BAST) or confirmed units.') }}</div>
                </div>
              </label>
            </div>
          </div>

          <div v-if="method === 'output'" class="pm-field">
            <span class="pm-label pm-label-req">{{ t('Output measure') }}</span>
            <div class="pm-seg" role="radiogroup">
              <button type="button" :class="{ 'pm-seg--active': measure === 'milestone' }" @click="measure = 'milestone'">{{ t('Milestone — progress weight per phase') }}</button>
              <button type="button" :class="{ 'pm-seg--active': measure === 'unit' }" @click="measure = 'unit'">{{ t('Unit — confirmed ÷ planned units') }}</button>
            </div>
            <div v-if="measure === 'milestone'" class="pm-banner pm-banner--info" style="margin-top: 8px">
              <div class="pm-banner-body">{{ t('Milestone-measured Output must have phases — the progress weight lives on each phase and a depth-1 project can’t carry it. Phases are switched on below.') }}</div>
            </div>
          </div>

          <div v-if="isProduction === false" class="pm-field">
            <label class="pm-check">
              <input v-model="usePhases" type="checkbox" :disabled="phasesRequired" />
              {{ t('Break this engagement into phases') }}
            </label>
            <span class="pm-help">{{ t('Optional. You can add the first phase later — the project is promoted without moving any cost.') }}</span>
          </div>

          <p v-if="touched && step1Error" class="pm-error">{{ step1Error }}</p>
        </div>

        <!-- ── Step 2: details ── -->
        <div v-else-if="step === 2" class="pm-stack" style="gap: 18px">
          <div class="pm-grid-2">
            <div class="pm-field">
              <label class="pm-label pm-label-req" for="pc-name">{{ t('Project name') }}</label>
              <input id="pc-name" v-model="form.name" class="pm-input" :aria-invalid="touched && !!step2Errors.name" :placeholder="t('e.g. Interior Gedung Pascasarjana')" />
              <span v-if="touched && step2Errors.name" class="pm-error">{{ step2Errors.name }}</span>
            </div>
            <div class="pm-field">
              <label class="pm-label pm-label-req" for="pc-cust">{{ t('Customer') }}</label>
              <input id="pc-cust" v-model="form.customer" class="pm-input" list="pc-customers" :aria-invalid="touched && !!step2Errors.customer" :placeholder="t('Select or type a customer')" />
              <datalist id="pc-customers"><option v-for="c in customerOptions" :key="c" :value="c" /></datalist>
              <span v-if="touched && step2Errors.customer" class="pm-error">{{ step2Errors.customer }}</span>
            </div>
            <div class="pm-field">
              <label class="pm-label" for="pc-so">{{ t('Linked contract / sales order number') }}</label>
              <input id="pc-so" v-model="form.salesOrderNo" class="pm-input" placeholder="SO/2026/0000" />
              <span class="pm-help">{{ t('Billing terms live on the contract, not on the project structure.') }}</span>
            </div>
            <div class="pm-field">
              <label class="pm-label pm-label-req" for="pc-cv">{{ t('Contract value') }}</label>
              <div class="pm-input-group">
                <span class="pm-addon">Rp</span>
                <input id="pc-cv" v-model="form.contractValue" class="pm-input pm-input--num" inputmode="numeric" :aria-invalid="touched && !!step2Errors.contractValue" placeholder="0" />
              </div>
              <span v-if="touched && step2Errors.contractValue" class="pm-error">{{ step2Errors.contractValue }}</span>
              <span v-else-if="parseAmount(form.contractValue)" class="pm-help">{{ rp(parseAmount(form.contractValue)) }}</span>
            </div>
            <div class="pm-field">
              <label class="pm-label" for="pc-pm">{{ t('Project manager') }}</label>
              <select id="pc-pm" v-model="form.pm" class="pm-select"><option v-for="p in PMS" :key="p" :value="p">{{ p }}</option></select>
            </div>
            <div class="pm-field">
              <label class="pm-label" for="pc-pr">{{ t('Priority') }}</label>
              <select id="pc-pr" v-model="form.priority" class="pm-select">
                <option value="high">{{ t('High') }}</option>
                <option value="medium">{{ t('Medium') }}</option>
                <option value="low">{{ t('Low') }}</option>
              </select>
              <span class="pm-help">{{ t('Shown to other projects when they compete for reserved stock.') }}</span>
            </div>
            <div class="pm-field">
              <label class="pm-label" for="pc-sd">{{ t('Start date') }}</label>
              <input id="pc-sd" v-model="form.startDate" type="date" class="pm-input" />
            </div>
            <div class="pm-field">
              <label class="pm-label" for="pc-ed">{{ t('End date') }}</label>
              <input id="pc-ed" v-model="form.endDate" type="date" class="pm-input" :aria-invalid="touched && !!step2Errors.dates" />
              <span v-if="touched && step2Errors.dates" class="pm-error">{{ step2Errors.dates }}</span>
            </div>
            <div v-if="isProduction" class="pm-field">
              <label class="pm-label" for="pc-wh">{{ t('Default warehouse') }}</label>
              <select id="pc-wh" v-model="form.defaultWarehouse" class="pm-select"><option v-for="w in WAREHOUSES" :key="w" :value="w">{{ w }}</option></select>
            </div>
            <div class="pm-field" style="justify-content: flex-end">
              <label class="pm-check"><input v-model="form.longTerm" type="checkbox" /> {{ t('Long-term project (create an asset at technical completion)') }}</label>
            </div>
          </div>

          <div>
            <h3 class="pm-h3">{{ t('Dimension defaults') }}</h3>
            <p class="pm-desc">{{ t('Pre-filled on every line tagged to this project. Dimensions are reporting axes only — there is no dimension-level budget.') }}</p>
          </div>
          <div class="pm-grid-4">
            <div class="pm-field"><label class="pm-label" for="pc-b">{{ t('Branch') }}</label><input id="pc-b" v-model="form.branch" class="pm-input" /></div>
            <div class="pm-field"><label class="pm-label" for="pc-d">{{ t('Department') }}</label><input id="pc-d" v-model="form.department" class="pm-input" /></div>
            <div class="pm-field"><label class="pm-label" for="pc-c">{{ t('Cost center') }}</label><input id="pc-c" v-model="form.costCenter" class="pm-input" /></div>
            <div class="pm-field"><label class="pm-label" for="pc-f">{{ t('Funding source') }}</label><input id="pc-f" v-model="form.fundingSource" class="pm-input" /></div>
          </div>
        </div>

        <!-- ── Step 3: structure ── -->
        <div v-else-if="step === 3" class="pm-stack" style="gap: 16px">
          <div v-if="!usePhases" class="pm-banner pm-banner--neutral">
            <div class="pm-banner-body">
              <div class="pm-banner-title">{{ t('Depth 1 — one work package') }}</div>
              {{ t('No phase or work package is shown. One work package is created automatically, mirroring the project, so cost has somewhere to land. Add the first phase any time from the Structure tab.') }}
            </div>
          </div>

          <template v-else>
            <div class="pm-row">
              <div>
                <h3 class="pm-h3">{{ t('Phases and work packages') }}</h3>
                <p class="pm-desc">{{ t('A phase groups work. A work package is the unit you budget, produce and complete. A phase with no work package gets one automatically.') }}</p>
              </div>
            </div>

            <div v-if="isMilestone" class="pm-banner" :class="weightSum === 100 ? 'pm-banner--success' : 'pm-banner--warn'">
              <div class="pm-banner-body">
                <div class="pm-banner-title">{{ t('Progress weight total') }}: {{ pct(weightSum) }}</div>
                {{ weightSum === 100 ? t('Weights total 100%.') : `${t('Difference')}: ${pct(Math.abs(100 - weightSum))}. ${t('Enter each phase’s RAB value to get a suggestion (phase RAB ÷ total RAB), then adjust.')}` }}
              </div>
              <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" :disabled="!rabSum" @click="suggestWeights">{{ t('Suggest from RAB') }}</button>
            </div>

            <div v-for="(ph, pi) in phaseDrafts" :key="pi" class="pm-card">
              <div class="pm-row" style="align-items: flex-end; gap: 12px">
                <div class="pm-field" style="flex: 2; min-width: 200px">
                  <label class="pm-label pm-label-req">{{ t('Phase') }} {{ pi + 1 }}</label>
                  <input v-model="ph.name" class="pm-input" :placeholder="t('e.g. Interior')" />
                </div>
                <div v-if="isMilestone" class="pm-field" style="flex: 1; min-width: 160px">
                  <label class="pm-label">{{ t('Phase RAB value') }}</label>
                  <input v-model="ph.rabValue" class="pm-input pm-input--num" inputmode="numeric" placeholder="0" />
                </div>
                <div v-if="isMilestone" class="pm-field" style="width: 130px">
                  <label class="pm-label">{{ t('Progress weight') }}</label>
                  <div class="pm-input-group"><input v-model="ph.weight" class="pm-input pm-input--num" inputmode="decimal" placeholder="0" /><span class="pm-addon">%</span></div>
                </div>
                <button class="pm-icon-btn" type="button" :aria-label="t('Remove phase')" :disabled="phaseDrafts.length === 1 && phasesRequired" @click="removePhase(pi)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
                </button>
              </div>
              <div class="pm-stack" style="margin-top: 12px; gap: 8px; padding-left: 16px; border-left: 2px solid var(--mp-border-default)">
                <div v-for="(wp, wi) in ph.wps" :key="wi" class="pm-row" style="gap: 8px">
                  <span class="pm-muted pm-small" style="width: 36px">{{ pi + 1 }}.{{ wi + 1 }}</span>
                  <input v-model="wp.name" class="pm-input" style="flex: 2; min-width: 180px" :placeholder="t('Work package name')" />
                  <select v-if="isProduction" v-model="wp.type" class="pm-select" style="width: 140px">
                    <option value="production">{{ t('Production') }}</option>
                    <option value="service">{{ t('Service') }}</option>
                  </select>
                  <input v-if="isProduction || isUnit" v-model="wp.plannedUnits" class="pm-input pm-input--num" style="width: 110px" inputmode="numeric" :placeholder="t('Planned units')" />
                  <input v-if="isProduction || isUnit" v-model="wp.unit" class="pm-input" style="width: 80px" :placeholder="t('Unit')" />
                  <button class="pm-icon-btn" type="button" :aria-label="t('Remove work package')" @click="ph.wps.splice(wi, 1)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
                  </button>
                </div>
                <button class="pm-link pm-small" type="button" style="align-self: flex-start" @click="ph.wps.push(newWp())">+ {{ t('Work package') }}</button>
              </div>
            </div>
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" style="align-self: flex-start" @click="addPhase">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
              {{ t('Phase') }}
            </button>
            <p v-if="isProduction" class="pm-help">{{ t('Attach a BOM to each production work package from the Structure tab after the project is created — selecting a master BOM copies it into a custom BOM v1.') }}</p>
          </template>
          <p v-if="touched && step3Error" class="pm-error">{{ step3Error }}</p>
        </div>

        <!-- ── Step 4: review ── -->
        <div v-else class="pm-stack" style="gap: 16px">
          <div class="pm-card">
            <div class="pm-kv">
              <div><div class="pm-kv-label">{{ t('Project name') }}</div><div class="pm-kv-value">{{ form.name }}</div></div>
              <div><div class="pm-kv-label">{{ t('Customer') }}</div><div class="pm-kv-value">{{ form.customer }}</div></div>
              <div><div class="pm-kv-label">{{ t('Contract value') }}</div><div class="pm-kv-value">{{ rp(parseAmount(form.contractValue)) }}</div></div>
              <div><div class="pm-kv-label">{{ t('Project manager') }}</div><div class="pm-kv-value">{{ form.pm }}</div></div>
              <div><div class="pm-kv-label">{{ t('Shape') }}</div><div class="pm-kv-value">{{ isProduction ? t('Production') : t('Service') }} · {{ t('Depth') }} {{ depth }}</div></div>
              <div><div class="pm-kv-label">{{ t('Recognition') }}</div><div class="pm-kv-value">{{ t(methodText) }}</div></div>
              <div><div class="pm-kv-label">{{ t('Structure') }}</div><div class="pm-kv-value">{{ usePhases ? `${phaseDrafts.length} ${t('phases')}, ${phaseDrafts.reduce((s, p) => s + Math.max(p.wps.filter(w => w.name.trim()).length, 1), 0)} ${t('work packages')}` : t('1 work package (auto)') }}</div></div>
              <div><div class="pm-kv-label">{{ t('Pegging') }}</div><div class="pm-kv-value">{{ t('Mandatory — every line on a project document names its project') }}</div></div>
            </div>
          </div>
          <div v-if="weightWarning" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ weightWarning }}</div></div>
          <div class="pm-banner pm-banner--info">
            <div class="pm-banner-body">
              <div class="pm-banner-title">{{ t('The project is created as Draft') }}</div>
              {{ t('Nothing consumes budget until the project is approved. Set the budget baseline in Budget setup, then approve — the recognition method, measure and production flag lock at approval.') }}
            </div>
          </div>
        </div>

        <div class="pm-form-footer" style="margin-top: 24px; border-top: 1px solid var(--mp-border-default)">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="back">{{ step === 1 ? t('Cancel') : t('Back') }}</button>
          <button v-if="step < 4" class="btn-enterprise btn-enterprise--primary" type="button" @click="next">{{ t('Next') }}</button>
          <button v-else class="btn-enterprise btn-enterprise--primary" type="button" @click="create">{{ t('Create draft project') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
