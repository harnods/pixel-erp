<script setup lang="ts">
/**
 * New work order (project) — the two-step budget gate (PRD §5; Stories 3, 6, 18).
 *
 * "I never build out a document that cannot be saved": the budget check happens
 * BEFORE the form, not on save. That inversion is the whole point of the screen.
 *
 * ── Step 1 · the gate
 * Shows Total budget production · Committed · Available, where
 * `Total − Committed = Available` holds on screen AND the gate evaluates against
 * the same Available it displays — both come from one `budgetCheckFor()` call, so
 * the two can never drift apart. Without a "Budget for this work order" value,
 * step 2 is withheld.
 *
 * Phase 1 ships warn + override with a mandatory reason, not a hard block (D6).
 * The honest framing the PRD insists on: the promise is not "commitments cannot
 * exceed budget" but "no budget overrun goes unrecorded". At or under the
 * project's escalation threshold the PM overrides with a reason; above it the
 * document is held for Finance sign-off instead.
 *
 * ── Step 2 · the form
 * Header carries Project · Work package, Budget set aside and Allocated to lines,
 * the last moving as lines are filled. Each line gets a Budget column with a
 * suggested value and the difference against the estimate beneath it. Saving with
 * line budgets over the set-aside is refused, naming the excess.
 *
 * This is a SIBLING of CreateWorkOrderPage.vue, not a modification of it — the
 * ordinary (non-project) work-order flow has no budget pool to gate against and
 * is deliberately left untouched.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea,
  MpButton, MpButtonGroup, MpIcon, toast,
} from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import { formatIDR } from '~/utils/currency'
import { findProject, findWorkPackage, phaseOf } from '~/data/projects'
import {
  budgetCheckFor, evaluateGate, addProjectWorkOrder, type GateVerdict,
} from '~/data/projectBudgets'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'

const props = defineProps<{ projectId: string; workPackageId: string }>()
const router = useRouter()
const { t } = useLocale()

const project = computed(() => findProject(props.projectId))
const workPackage = computed(() => (project.value ? findWorkPackage(project.value, props.workPackageId) : undefined))
const phase = computed(() => (project.value ? phaseOf(project.value, props.workPackageId) : undefined))

function goBack() { router.push(`/projects/${props.projectId}?tab=structure`) }

// ═══ Step 1 · the gate ════════════════════════════════════════════════════════

const STEPS = [
  { key: 'check', label: t('Budget check') },
  { key: 'form',  label: t('Work order') },
]
const currentStep = ref<'check' | 'form'>('check')
const doneSteps = ref<string[]>([])

/**
 * All three figures come from ONE call. Story 3 requires that the gate use the
 * same Available it displays; computing them separately is exactly how those two
 * drift apart.
 */
const check = computed(() => budgetCheckFor(props.projectId))

const requestedRaw = ref('')
const requested = computed(() => Number(requestedRaw.value) || 0)
const overrideReason = ref('')

/** Errors surface on attempted advance, never by disabling the button. */
const showRequestedError = ref(false)
const showReasonError = ref(false)

const verdict = computed<GateVerdict | null>(() => {
  if (!project.value || requested.value <= 0) return null
  return evaluateGate(requested.value, check.value, project.value.escalationThreshold)
})

/** Above the threshold the document is held for Finance — it never reaches step 2. */
const isEscalated = computed(() => verdict.value?.kind === 'escalate')
const isOverride = computed(() => verdict.value?.kind === 'override')

const forwardLabel = computed(() => {
  if (isEscalated.value) return t('Submit for approval')
  if (isOverride.value) return t('Override and continue')
  return t('Continue')
})

function advanceFromGate() {
  showRequestedError.value = false
  showReasonError.value = false

  // Step 2 is withheld without a set-aside value (Story 3).
  if (requested.value <= 0) { showRequestedError.value = true; return }
  // Any overage must carry a reason — that is what makes it recorded rather than
  // merely permitted.
  if ((isOverride.value || isEscalated.value) && !overrideReason.value.trim()) {
    showReasonError.value = true
    return
  }

  if (isEscalated.value) {
    // The forward action to step 2 is withheld; the document is held instead and
    // appears in the Approvals inbox (that inbox is a separate screen).
    toast.notify({
      variant: 'success',
      title: t('Work order held for Finance sign-off'),
      description: t('It appears in the Approvals inbox with the requested amount, the available budget and your reason.'),
    })
    goBack()
    return
  }

  doneSteps.value = ['check']
  currentStep.value = 'form'
}

function selectStep(key: string) {
  if (key === 'check') currentStep.value = 'check'
}

// ═══ Step 2 · the form ════════════════════════════════════════════════════════

/**
 * The work package's custom BOM defines the lines — a project work order is
 * raised against a BOM already attached at registration (Story 19), so the BOM is
 * read-only here rather than a free picker as in the ordinary work-order flow.
 */
const bom = computed(() => billOfMaterials.find(b => b.id === workPackage.value?.bomId))

interface MaterialLine {
  id: number
  productId: string
  name: string
  needed: number
  unit: string
  unitCost: number
  /** Suggested = qty needed × unit buy price. Editable (Story 18). */
  budget: string
}
interface CostLine {
  id: number
  group: string
  account: string
  costDriver: string
  unitCost: number
  multiplier: number
  /** Suggested = cost per unit × multiplier × qty produced. Editable. */
  budget: string
}

const materialLines = ref<MaterialLine[]>([])
const costLines = ref<CostLine[]>([])

const producedQty = computed(() => workPackage.value?.plannedUnits ?? bom.value?.finishedGoodQty ?? 1)

onMounted(() => {
  const b = bom.value
  if (!b) return
  materialLines.value = b.rawMaterials.map((rm, i) => ({
    id: i,
    productId: rm.productId,
    name: catalogProduct(rm.productId)?.name ?? rm.productId,
    needed: rm.needed,
    unit: rm.unit,
    unitCost: rm.purchaseCost,
    // Suggested, never auto-applied as final: it is pre-filled and editable.
    budget: String(rm.needed * rm.purchaseCost),
  }))
  costLines.value = b.productionCost.map((pc, i) => ({
    id: i,
    group: pc.group,
    account: pc.account,
    costDriver: pc.costDriver,
    unitCost: pc.amount,
    multiplier: 1,
    budget: String(pc.amount * 1 * producedQty.value),
  }))
})

const num = (v: string) => Number(v) || 0

/** Estimate per line — what the BOM says it will cost. */
function materialEstimate(l: MaterialLine) { return l.needed * l.unitCost }
function costEstimate(l: CostLine) { return l.unitCost * l.multiplier * producedQty.value }

/** Budget − estimate. Negative means the estimate exceeds the budget. */
function materialDiff(l: MaterialLine) { return num(l.budget) - materialEstimate(l) }
function costDiff(l: CostLine) { return num(l.budget) - costEstimate(l) }

/**
 * The difference reads as a sentence, not a signed number — and an exact match
 * is its own state. "Under budget by Rp0" is the suggested value's resting state
 * and would otherwise sit under every untouched line as noise.
 */
function diffText(diff: number): string {
  if (diff === 0) return t('Matches the estimate')
  return `${diff < 0 ? t('Estimate over budget by') : t('Estimate under budget by')} ${formatIDR(Math.abs(diff))}`
}
function diffClass(diff: number): string {
  if (diff === 0) return 'wg-diff--even'
  return diff < 0 ? 'wg-diff--over' : 'wg-diff--under'
}

/** Moves as lines are filled — the step-2 header reads this live (Story 3). */
const allocatedToLines = computed(() =>
  materialLines.value.reduce((s, l) => s + num(l.budget), 0)
  + costLines.value.reduce((s, l) => s + num(l.budget), 0),
)
const totalEstimate = computed(() =>
  materialLines.value.reduce((s, l) => s + materialEstimate(l), 0)
  + costLines.value.reduce((s, l) => s + costEstimate(l), 0),
)
const overAllocation = computed(() => Math.max(0, allocatedToLines.value - requested.value))

/** Refused on save, naming the excess — the button stays clickable throughout. */
const saveError = ref('')

function save() {
  saveError.value = ''
  if (overAllocation.value > 0) {
    saveError.value = t('Line budgets exceed the budget set aside by')
      + ` ${formatIDR(overAllocation.value)}. `
      + t('Reduce a line budget, or go back and set aside more.')
    return
  }
  if (!workPackage.value) return

  // What is committed to Cost of production is the budget SET ASIDE, not the
  // estimate (D7) — both are stored so the Budget tab can show each.
  addProjectWorkOrder({
    workOrderId: 'wo-1',
    number: `WO-2026-${String(9000 + Math.floor(allocatedToLines.value % 1000)).padStart(4, '0')}`,
    workPackageId: workPackage.value.id,
    status: 'draft',
    budgetSetAside: requested.value,
    costEstimate: totalEstimate.value,
    actual: 0,
    overrideReason: overrideReason.value.trim() || undefined,
  })
  toast.notify({ variant: 'success', title: t('Work order saved') })
  router.push(`/projects/${props.projectId}?tab=budget`)
}
</script>

<template>
  <div v-if="project && workPackage" class="detail-page">
    <!-- ══ Title bar ══════════════════════════════════════════════════════════ -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">
          {{ project.number }} · {{ project.name }}
        </button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New work order') }}</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <ErpStepper :steps="STEPS" :current="currentStep" :done="doneSteps" @select="selectStep" />

      <!-- ══════════════════════ STEP 1 · BUDGET CHECK ══════════════════════ -->
      <section v-if="currentStep === 'check'" class="wg-section">
        <h2 class="wg-section-title">{{ t('Budget check') }}</h2>

        <!-- Which node this work order draws on. Read-only: the work package was
             chosen by the structure row this flow was entered from. -->
        <div class="wg-context">
          <div class="wg-context-item">
            <span class="wg-context-label">{{ t('Project') }}</span>
            <span class="wg-context-value">{{ project.number }} · {{ project.name }}</span>
          </div>
          <div class="wg-context-item">
            <span class="wg-context-label">{{ t('Work package') }}</span>
            <span class="wg-context-value">
              <template v-if="phase && !phase.isAuto">{{ phase.name }} › </template>{{ workPackage.name }}
            </span>
          </div>
        </div>

        <!-- The arithmetic is shown, not just its conclusion. -->
        <div class="wg-gate">
          <div class="wg-gate-item">
            <span class="wg-gate-label">{{ t('Total budget production') }}</span>
            <span class="wg-gate-value">{{ formatIDR(check.total) }}</span>
          </div>
          <span class="wg-gate-op">−</span>
          <div class="wg-gate-item">
            <span class="wg-gate-label">{{ t('Committed') }}</span>
            <span class="wg-gate-value">{{ formatIDR(check.committed) }}</span>
            <span class="wg-gate-note">{{ t('Consumed by other work orders, committed or posted') }}</span>
          </div>
          <span class="wg-gate-op">=</span>
          <div class="wg-gate-item wg-gate-item--available">
            <span class="wg-gate-label">{{ t('Available') }}</span>
            <span class="wg-gate-value">{{ formatIDR(check.available) }}</span>
          </div>
        </div>

        <!-- The Cost of production line is the only pool a work order draws on
             (D1). Say so where the number is, so a zero reads as a real state. -->
        <p v-if="check.total === 0" class="wg-hint">
          {{ t('This project has no Cost of production baseline yet, so there is nothing to draw on. Set one in the budget setup module first.') }}
        </p>

        <div class="wg-form">
          <MpFormControl id="wg-budget" is-required :is-invalid="showRequestedError">
            <MpFormLabel>{{ t('Budget for this work order') }}</MpFormLabel>
            <MpInputGroup id="wg-budget-group">
              <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
              <MpInput
                id="wg-budget-input"
                v-model="requestedRaw"
                type="number"
                is-full-width
                @update:model-value="showRequestedError = false"
              />
            </MpInputGroup>
            <MpFormErrorMessage>{{ t('Enter the budget to set aside for this work order.') }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Verdicts. Over Available is stated with its difference, never a
               bare "not allowed". -->
          <div v-if="verdict?.kind === 'ok'" class="wg-verdict wg-verdict--ok">
            <MpIcon name="check" size="sm" />
            <span>
              {{ t('Within available budget.') }}
              {{ t('Remaining after this work order') }}: {{ formatIDR(verdict.available - requested) }}.
            </span>
          </div>

          <div v-else-if="verdict?.kind === 'override'" class="wg-verdict wg-verdict--warn">
            <MpIcon name="information" size="sm" />
            <span>
              {{ t('Over available by') }} {{ formatIDR(verdict.excess) }}.
              {{ t('This is within the') }} {{ project.escalationThreshold }}%
              {{ t('escalation threshold, so you may override it with a reason. The overage is recorded.') }}
            </span>
          </div>

          <div v-else-if="verdict?.kind === 'escalate'" class="wg-verdict wg-verdict--danger">
            <MpIcon name="information" size="sm" />
            <span>
              {{ t('Over available by') }} {{ formatIDR(verdict.excess) }} —
              {{ t('above the') }} {{ verdict.thresholdPct }}% {{ t('escalation threshold.') }}
              {{ t('This work order is held for Finance sign-off instead of being created now.') }}
            </span>
          </div>

          <!-- Mandatory whenever there is an overage at all. -->
          <MpFormControl v-if="isOverride || isEscalated" id="wg-reason" is-required :is-invalid="showReasonError">
            <MpFormLabel>{{ t('Reason for the overage') }}</MpFormLabel>
            <MpTextarea
              id="wg-reason-input"
              v-model="overrideReason"
              is-full-width
              :rows="3"
              @update:model-value="showReasonError = false"
            />
            <MpFormErrorMessage>{{ t('State why this work order needs more than the available budget.') }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Actions are always rendered and always clickable
               (rule/form-actions-always-present, rule/btn-no-disabled-validation). -->
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="advanceFromGate">{{ forwardLabel }}</MpButton>
          </MpButtonGroup>
        </div>
      </section>

      <!-- ═══════════════════════ STEP 2 · WORK ORDER ═══════════════════════ -->
      <section v-else class="wg-section">
        <!-- Header: what was set aside, and how much of it the lines have taken. -->
        <div class="wg-summary">
          <div class="wg-summary-item">
            <span class="wg-gate-label">{{ t('Project') }} · {{ t('Work package') }}</span>
            <span class="wg-gate-value wg-gate-value--sm">{{ project.number }} · {{ workPackage.name }}</span>
          </div>
          <div class="wg-summary-item">
            <span class="wg-gate-label">{{ t('Budget set aside') }}</span>
            <span class="wg-gate-value">{{ formatIDR(requested) }}</span>
          </div>
          <div class="wg-summary-item">
            <span class="wg-gate-label">{{ t('Allocated to lines') }}</span>
            <span class="wg-gate-value" :class="{ 'wg-over': overAllocation > 0 }">{{ formatIDR(allocatedToLines) }}</span>
            <span v-if="overAllocation > 0" class="wg-gate-note wg-over">
              {{ t('Over by') }} {{ formatIDR(overAllocation) }}
            </span>
          </div>
        </div>

        <!-- The BOM is fixed: it was copied onto this work package at
             registration and only an ECO may change it (Story 19). -->
        <p v-if="bom" class="wg-hint">
          {{ t('Bill of materials') }}: <strong>{{ bom.name }}</strong>
          <template v-if="workPackage.bomVersion"> v{{ workPackage.bomVersion }}</template>
          — {{ t('copied to this work package; changing it requires an engineering change.') }}
        </p>
        <p v-else class="wg-hint">
          {{ t('No bill of materials is attached to this work package, so there are no lines to budget. Attach one from the structure tab first.') }}
        </p>

        <!-- ── Product components ── -->
        <h2 class="wg-section-title">{{ t('Product components') }}</h2>
        <div v-if="materialLines.length" class="wg-table-scroll">
          <table class="wg-table">
            <colgroup>
              <col><col style="width:120px"><col style="width:100px">
              <col style="width:160px"><col style="width:180px"><col style="width:200px">
            </colgroup>
            <thead>
              <tr>
                <th class="wg-th">{{ t('Product') }}</th>
                <th class="wg-th wg-th--right">{{ t('Needed qty') }}</th>
                <th class="wg-th">{{ t('Unit') }}</th>
                <th class="wg-th wg-th--right">{{ t('Unit buy price') }}</th>
                <th class="wg-th wg-th--right">{{ t('Estimated cost') }}</th>
                <th class="wg-th wg-th--right">{{ t('Budget') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in materialLines" :key="line.id" class="wg-tr">
                <td class="wg-td">{{ line.name }}</td>
                <td class="wg-td wg-td--right">{{ line.needed }}</td>
                <td class="wg-td">{{ line.unit }}</td>
                <td class="wg-td wg-td--right">{{ formatIDR(line.unitCost) }}</td>
                <td class="wg-td wg-td--right">{{ formatIDR(materialEstimate(line)) }}</td>
                <td class="wg-td wg-td--input">
                  <MpInputGroup :id="`wg-mat-group-${line.id}`" is-full-width>
                    <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                    <MpInput :id="`wg-mat-${line.id}`" v-model="line.budget" type="number" is-full-width />
                  </MpInputGroup>
                  <!-- The difference sits beneath the budget it belongs to: red
                       when the estimate exceeds it, green when it is below. -->
                  <span class="wg-diff" :class="diffClass(materialDiff(line))">{{ diffText(materialDiff(line)) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="wg-hint">{{ t('This work package has no bill of materials attached, so there are no components to budget.') }}</p>

        <!-- ── Production cost (Labor / Overhead / Other) ── -->
        <h2 class="wg-section-title">{{ t('Production cost') }}</h2>
        <div v-if="costLines.length" class="wg-table-scroll">
          <table class="wg-table">
            <colgroup>
              <col style="width:120px"><col><col style="width:160px">
              <col style="width:120px"><col style="width:180px"><col style="width:200px">
            </colgroup>
            <thead>
              <tr>
                <th class="wg-th">{{ t('Group') }}</th>
                <th class="wg-th">{{ t('Cost account') }}</th>
                <th class="wg-th">{{ t('Cost driver') }}</th>
                <th class="wg-th wg-th--right">{{ t('Multiplier') }}</th>
                <th class="wg-th wg-th--right">{{ t('Estimated cost') }}</th>
                <th class="wg-th wg-th--right">{{ t('Budget') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in costLines" :key="line.id" class="wg-tr">
                <td class="wg-td">{{ line.group }}</td>
                <td class="wg-td">{{ line.account }}</td>
                <td class="wg-td">{{ line.costDriver }}</td>
                <td class="wg-td wg-td--right">{{ line.multiplier }}</td>
                <td class="wg-td wg-td--right">{{ formatIDR(costEstimate(line)) }}</td>
                <td class="wg-td wg-td--input">
                  <MpInputGroup :id="`wg-cost-group-${line.id}`" is-full-width>
                    <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                    <MpInput :id="`wg-cost-${line.id}`" v-model="line.budget" type="number" is-full-width />
                  </MpInputGroup>
                  <span class="wg-diff" :class="diffClass(costDiff(line))">{{ diffText(costDiff(line)) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="wg-hint">{{ t('No production cost lines on this bill of materials.') }}</p>

        <!-- Set-aside vs estimate, side by side — Story 3 requires both be named
             so the committed figure is never mistaken for the estimate. -->
        <div class="wg-totals">
          <div class="wg-total-row">
            <span>{{ t('Estimated total production cost') }}</span>
            <span>{{ formatIDR(totalEstimate) }}</span>
          </div>
          <div class="wg-total-row wg-total-row--strong">
            <span>{{ t('Committed to Cost of production (budget set aside)') }}</span>
            <span>{{ formatIDR(requested) }}</span>
          </div>
        </div>

        <!-- Refusal is inline and names the excess, never a toast
             (rule/form-errors-inline). -->
        <p v-if="saveError" class="wg-save-error">{{ saveError }}</p>

        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="currentStep = 'check'">{{ t('Back') }}</MpButton>
          <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </section>
    </div>
  </div>

  <!-- Not found — a real state, not a crash. -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="router.push('/projects')">{{ t('Projects') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Work package not found') }}</h1>
        </div>
      </div>
    </header>
    <div class="detail-stage">
      <p class="wg-hint">{{ t('This work package no longer exists, or it belongs to another project.') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* ── Page shell (shared detail-page metrics) ────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start;
  background: none; border: none; padding: 0; cursor: pointer;
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
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}

/* ── Sections ──────────────────────────────────────────────────────────── */
.wg-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.wg-section-title {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.wg-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Context (project · work package) ──────────────────────────────────── */
.wg-context { display: flex; gap: var(--mp-spacing-8); flex-wrap: wrap; }
.wg-context-item { display: flex; flex-direction: column; }
.wg-context-label,
.wg-gate-label {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.wg-context-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

/* ── The gate: Total − Committed = Available, shown as the arithmetic ──── */
.wg-gate {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-5);
  flex-wrap: wrap;
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);   /* flat surface, no shadow */
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
}
.wg-gate-item { display: flex; flex-direction: column; min-width: 160px; }
.wg-gate-item--available .wg-gate-value { color: var(--mp-text-selected); }
.wg-gate-op {
  font-size: var(--mp-font-sizes-xl, 20px);
  color: var(--mp-text-secondary);
}
.wg-gate-value {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.wg-gate-value--sm { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); }
.wg-gate-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Verdicts ──────────────────────────────────────────────────────────── */
.wg-verdict {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
}
.wg-verdict--ok { background: var(--mp-background-success, #e6f6ef); color: var(--mp-text-selected); }
.wg-verdict--warn { background: var(--mp-background-warning, #fef6e7); color: var(--mp-text-warning, #7a4c00); }
.wg-verdict--danger { background: var(--mp-background-critical, #fdeceb); color: var(--mp-text-danger); }

/* ── Form column (6-col grid, max 558px — rule/form-field-stacking) ────── */
.wg-form {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  max-width: 558px;
}

/* ── Step-2 summary header ─────────────────────────────────────────────── */
.wg-summary {
  display: flex;
  gap: var(--mp-spacing-8);
  flex-wrap: wrap;
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
}
.wg-summary-item { display: flex; flex-direction: column; min-width: 200px; }
.wg-over { color: var(--mp-text-danger); }

/* ── Line-item tables ──────────────────────────────────────────────────── */
.wg-table-scroll { overflow-x: auto; }
.wg-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.wg-th {
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
.wg-th--right { text-align: right; }
.wg-tr { border-bottom: 1px solid var(--mp-border-default); }
.wg-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  vertical-align: top;
}
.wg-td--right { text-align: right; }
.wg-td--input { padding-top: var(--mp-spacing-1); }

.wg-diff {
  display: block;
  margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  text-align: right;
}
.wg-diff--over { color: var(--mp-text-danger); }
.wg-diff--under { color: var(--mp-text-selected); }
/* An exact match is neither good nor bad news — it stays neutral. */
.wg-diff--even { color: var(--mp-text-secondary); }

/* ── Totals ────────────────────────────────────────────────────────────── */
.wg-totals {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  margin-left: auto;
  min-width: 380px;
  padding-top: var(--mp-spacing-3);
}
.wg-total-row {
  display: flex;
  justify-content: space-between;
  gap: var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.wg-total-row--strong {
  padding-top: var(--mp-spacing-2);
  border-top: 1px solid var(--mp-border-bold);
  font-weight: var(--mp-font-weights-semi-bold);
}

.wg-save-error {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-danger);
}
</style>
