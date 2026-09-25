<script setup lang="ts">
/**
 * Recognition & billing tab (PRD §6, Stories 8, 9, 12; prototype gaps P1, P2).
 *
 * Two postings on two independent clocks:
 *   • Recognition — Output·milestone: verify a phase by its BAST → recognises that
 *     phase's weight. Output·unit / Input: a recognition run posts the difference
 *     between live % complete and what's recognised. T&M: each unbilled entry gets
 *     a bill / write-down / write-up decision before invoicing.
 *   • Billing — contract/SO terms (DP, progress, settlement). Issuing a term
 *     invoice bills the customer and recognises nothing.
 * WIP = recognised − billed is the reconciling balance (underbilled asset /
 * overbilled liability) — so the DP-before-progress case is representable.
 */
import {
  MpButton, MpInput, MpTag, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerDescription,
} from '@mekari/pixel3'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import type { Project } from '~/data/projects'
import { projectPhases, projectWorkPackages, weightTotal, usesMilestone, usesUnits } from '~/data/projects'
import { projectBudgetTotal } from '~/data/projectBudgets'
import { projectActual } from '~/data/projectTransactions'
import {
  projectTerms, projectRecognition, projectInvoiceList, termInvoice, recognisedToDate, billedToDate, wipPosition,
  percentComplete, recognitionDue, unitProgress, tmEntries, type BillingTerm,
} from '~/data/projectRecognition'
import { projectPolicy } from '~/data/projectPolicy'
import { verifyPhase, runRecognition, issueTermInvoice, setTmDecision, invoiceTm, markInvoicePaid } from '~/data/projectActions'
import { rp, pct } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()
const recAction = useProjectAction()
const tmAction = useProjectAction()
const billAction = useProjectAction()
const verifyAction = useProjectAction()
const termAction = useProjectAction()

const active = computed(() => props.project.status === 'active')
const isMilestone = computed(() => usesMilestone(props.project))
const isUnit = computed(() => usesUnits(props.project))
const isInput = computed(() => props.project.method === 'input')
const isTm = computed(() => props.project.method === 'tm')

const recognised = computed(() => recognisedToDate(props.project.id))
const billed = computed(() => billedToDate(props.project.id))
const wip = computed(() => wipPosition(props.project.id))
const pc = computed(() => percentComplete(props.project))
const due = computed(() => recognitionDue(props.project))
const total = computed(() => weightTotal(props.project.id))

// ── Verify phase (BAST) ──
const verify = reactive({ open: false, phaseId: '', bastNo: '', touched: false })
const verifyPhaseObj = computed(() => projectPhases(props.project.id).find(p => p.id === verify.phaseId))
const verifyBlock = computed(() => {
  if (!active.value) return t('Only an active project can recognise revenue.')
  if (total.value !== 100) return `${t('Progress weights total')} ${pct(total.value)}, ${t('not 100%. Fix them on the Structure tab first.')}`
  if (props.project.reweightRequired) return t('The contract value changed. Reconfirm the unverified weights on the Structure tab first.')
  return ''
})
function openVerify(phaseId: string) {
  if (verifyBlock.value) { recAction.fail(verifyBlock.value); return }
  recAction.clear(); verifyAction.clear()
  Object.assign(verify, { open: true, phaseId, bastNo: '', touched: false })
}
function doVerify() {
  verify.touched = true
  if (!verify.bastNo.trim()) return
  if (verifyAction.run(verifyPhase(verify.phaseId, verify.bastNo, asActor.value))) verify.open = false
}

// ── Term invoice ──
const termConfirm = reactive({ open: false, term: null as BillingTerm | null })
function triggerMet(term: BillingTerm): boolean {
  if (term.trigger === 'signing') return true
  if (term.trigger === 'progress') return (pc.value ?? 0) >= (term.triggerPct ?? 0)
  return projectWorkPackages(props.project.id).every(w => w.status === 'technically_complete')
}
function triggerText(term: BillingTerm): string {
  if (term.trigger === 'signing') return t('On contract signing')
  if (term.trigger === 'progress') return `${t('Cumulative progress')} ≥ ${pct(term.triggerPct)}`
  return t('At handover (all work packages complete)')
}
function openIssue(term: BillingTerm) {
  if (props.project.status === 'draft') { billAction.fail(t('Approve the project before issuing term invoices.')); return }
  billAction.clear(); termAction.clear()
  termConfirm.term = term; termConfirm.open = true
}
function doIssue() {
  if (!termConfirm.term) return
  if (termAction.run(issueTermInvoice(termConfirm.term.id, asActor.value))) termConfirm.open = false
}

// ── T&M decisions ──
const tmRows = computed(() => tmEntries(props.project.id))
const tmDraft = reactive<Record<string, { decision: '' | 'bill' | 'write_down' | 'write_up'; amount: string }>>({})
watch(tmRows, rows => {
  for (const l of rows) {
    if (tmDraft[l.id]) continue
    tmDraft[l.id] = { decision: l.tm!.decision === 'pending' ? '' : l.tm!.decision, amount: String(l.tm!.billAmount ?? l.tm!.hours * l.tm!.billRate) }
  }
}, { immediate: true })
function tmState(id: string) {
  return tmDraft[id] ?? { decision: '' as const, amount: '' }
}
function applyTm(id: string) {
  const s = tmState(id)
  if (!s.decision) return
  setTmDecision(id, s.decision, Number(s.amount.replace(/\D/g, '')) || 0, asActor.value)
}
function setDecision(id: string, v: string) {
  if (!active.value) { tmAction.fail(t('Only an active project can recognise revenue.')); return }
  tmState(id).decision = v as '' | 'bill' | 'write_down' | 'write_up'
  applyTm(id)
}
const decisionOptions = computed(() => [
  { value: 'bill', label: t('Bill') },
  { value: 'write_down', label: t('Write-down') },
  { value: 'write_up', label: t('Write-up') },
])
const tmPending = computed(() => tmRows.value.filter(l => l.tm?.decision === 'pending').length)
const tmReady = computed(() => tmRows.value.filter(l => l.tm && l.tm.decision !== 'pending' && !l.tm.invoiceNo))
function doInvoiceTm() {
  if (!active.value) { tmAction.fail(t('Only an active project can recognise revenue.')); return }
  if (!tmReady.value.length) { tmAction.fail(t('Decide at least one entry before invoicing.')); return }
  tmAction.run(invoiceTm(props.project.id, asActor.value))
}
function doRun() {
  if (!active.value) { recAction.fail(t('Only an active project can recognise revenue.')); return }
  if (!due.value) { recAction.fail(t('Nothing to recognise — recognised revenue already matches % complete.')); return }
  recAction.run(runRecognition(props.project.id, asActor.value))
}
function doPaid(id: string) { markInvoicePaid(id); billAction.clear() }

const inputBudget = computed(() => projectBudgetTotal(props.project.id))
const unit = computed(() => unitProgress(props.project.id))
const unitWps = computed(() => projectWorkPackages(props.project.id).filter(w => w.plannedUnits))
</script>

<template>
  <div class="pm-stack pm-gap-5">
    <!-- Two clocks -->
    <div class="pm-kpis">
      <div class="pm-kpi pm-kpi--bordered">
        <div class="pm-kpi-title">{{ t('Recognised to date') }}</div>
        <div class="pm-kpi-period">{{ pc !== undefined ? `${pct(pc)} ${t('complete')} · ` : '' }}{{ t('Revenue clock — progress') }}</div>
        <div class="pm-kpi-amount">{{ rp(recognised) }}</div>
      </div>
      <div class="pm-kpi pm-kpi--bordered">
        <div class="pm-kpi-title">{{ t('Billed to date') }}</div>
        <div class="pm-kpi-period">{{ t('Billing clock — contract terms') }}</div>
        <div class="pm-kpi-amount">{{ rp(billed) }}</div>
      </div>
      <div class="pm-kpi">
        <div class="pm-kpi-title">{{ t('WIP position') }}</div>
        <div class="pm-kpi-period">{{ wip > 0 ? t('Underbilled — contract asset (recognised > billed)') : wip < 0 ? t('Overbilled — contract liability (billed > recognised)') : t('Recognised equals billed') }}</div>
        <div class="pm-kpi-amount" :class="wip > 0 ? 'pm-pos' : wip < 0 ? 'pm-neg' : ''">{{ rp(Math.abs(wip)) }}</div>
      </div>
    </div>
    <MpBanner id="pm-rec-separation" variant="info">
      <MpBannerIcon />
      <MpBannerDescription>{{ t('Recognition and billing are separate postings. Verifying progress recognises revenue and issues no invoice; issuing a term invoice bills the customer and recognises nothing. WIP is the reconciling balance.') }}</MpBannerDescription>
    </MpBanner>

    <!-- ── Recognition ── -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Recognition') }}</h2>
          <p class="pm-caption pm-m-0">
            <template v-if="isMilestone">{{ t('Output · milestone — % complete is the sum of achieved phases’ progress weights. A phase is achieved by its BAST, not by judgement.') }}</template>
            <template v-else-if="isUnit">{{ t('Output · unit — % complete = confirmed ÷ planned units across work packages.') }}</template>
            <template v-else-if="isInput">{{ t('Input (cost-to-cost) — % complete = actual cost ÷ budget, applied to contract value. Recalculates as cost posts.') }}</template>
            <template v-else>{{ t('Time & materials — each unbilled entry carries a bill / write-down / write-up decision before invoicing.') }}</template>
          </p>
        </div>
        <MpTag id="pm-method-locked">{{ t('Method locked at approval') }}</MpTag>
      </div>

      <MpBanner v-if="project.status === 'draft'" id="pm-rec-draft" variant="info" class="pm-mb-3">
        <MpBannerIcon /><MpBannerDescription>{{ t('Approve the project before recognising revenue.') }}</MpBannerDescription>
      </MpBanner>
      <PmActionError id="pm-rec-error" :error="recAction.error.value" class="pm-mb-3" />

      <!-- Milestone -->
      <template v-if="isMilestone">
        <MpBanner v-if="total !== 100" id="pm-rec-weights" variant="danger" class="pm-mb-3">
          <MpBannerIcon />
          <MpBannerDescription>
            {{ t('Progress weights total') }} {{ pct(total) }} — {{ t('verification is blocked until they total 100%.') }}
            <MpTextlink id="pm-rec-fix-structure" as="a" @click.prevent="router.replace({ query: { tab: 'structure' } })">{{ t('Fix on Structure tab') }}</MpTextlink>
          </MpBannerDescription>
        </MpBanner>
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead><tr><th>{{ t('Phase') }}</th><th class="pm-num">{{ t('Progress weight') }}</th><th class="pm-num">{{ t('Revenue at this weight') }}</th><th>{{ t('BAST') }}</th><th /></tr></thead>
            <tbody>
              <tr v-for="ph in projectPhases(project.id).filter(p => !p.auto)" :key="ph.id">
                <td>{{ ph.order }}. {{ ph.name }}</td>
                <td class="pm-num">{{ pct(ph.progressWeightPct) }}</td>
                <td class="pm-num">{{ rp(((ph.progressWeightPct ?? 0) / 100) * project.contractValue) }}</td>
                <td>
                  <template v-if="ph.verifiedAt"><ErpStatusBadge v-bind="badgeProps('flag', 'verified', t)" /><span class="pm-cell-sub">{{ ph.bastNo }} · {{ formatDate(ph.verifiedAt) }}</span></template>
                  <span v-else class="pm-muted">{{ t('Not yet') }}</span>
                </td>
                <td class="pm-cell-actions">
                  <MpButton v-if="!ph.verifiedAt" :id="`pm-verify-${ph.id}`" variant="secondary" is-rounded size="sm" @click="openVerify(ph.id)">{{ t('Verify by BAST') }}</MpButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="pm-caption pm-mt-2 pm-mb-2">{{ t('With weight on the phase, revenue steps rather than glides — split a large phase to smooth it.') }}</p>
      </template>

      <!-- Unit -->
      <template v-else-if="isUnit">
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead><tr><th>{{ t('Work package') }}</th><th>{{ t('Type') }}</th><th class="pm-num">{{ t('Planned') }}</th><th class="pm-num">{{ t('Confirmed') }}</th><th class="pm-num">{{ t('Counts toward %') }}</th></tr></thead>
            <tbody>
              <tr v-for="w in unitWps" :key="w.id">
                <td>{{ w.code }} {{ w.name }}</td>
                <td>{{ w.type === 'production' ? t('Production') : t('Service') }}</td>
                <td class="pm-num">{{ w.plannedUnits }} {{ w.unit }}</td>
                <td class="pm-num">{{ w.confirmedUnits ?? 0 }} {{ w.unit }}</td>
                <td class="pm-num">{{ projectPolicy.qtyPocOption === 'A' || w.type === 'production' ? t('Yes') : t('No — cost still flows to WIP') }}</td>
              </tr>
            </tbody>
            <tfoot><tr><td colspan="2">{{ t('Total') }}</td><td class="pm-num">{{ unit.planned }}</td><td class="pm-num">{{ unit.confirmed }}</td><td class="pm-num">{{ pct(unit.pct) }}</td></tr></tfoot>
          </table>
        </div>
        <p class="pm-caption pm-mt-2">
          {{ t('Open question 6 — service work packages in a unit-measured project:') }} {{ projectPolicy.qtyPocOption === 'A' ? t('option A (all planned units count)') : t('option B (only production work packages count)') }}.
          <MpTextlink id="pm-rec-settings" as="a" @click.prevent="router.push('/project-settings')">{{ t('Change in Project settings') }}</MpTextlink>
        </p>
      </template>

      <!-- Input -->
      <template v-else-if="isInput">
        <MpBanner v-if="inputBudget === undefined" id="pm-rec-no-budget" variant="warning">
          <MpBannerIcon />
          <MpBannerDescription>
            {{ t('Budget not set — % complete can’t be computed for cost-to-cost until a baseline exists.') }} {{ t('Link a plan in the Budget module.') }}
          </MpBannerDescription>
        </MpBanner>
        <div v-else class="pm-card pm-card--flat">
          <div class="pm-grid-3">
            <ContentList :label="t('Actual cost')" :value="rp(projectActual(project.id))" />
            <ContentList :label="t('Budget')" :value="rp(inputBudget)" />
            <ContentList :label="t('% complete')" :value="pct(pc)" />
          </div>
        </div>
      </template>

      <!-- T&M -->
      <template v-else-if="isTm">
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead><tr><th>{{ t('Entry') }}</th><th>{{ t('Person') }}</th><th class="pm-num">{{ t('Hours') }}</th><th class="pm-num">{{ t('Cost') }}</th><th class="pm-num">{{ t('At bill rate') }}</th><th>{{ t('Decision') }}</th><th class="pm-num">{{ t('Bill amount') }}</th><th>{{ t('Invoice') }}</th></tr></thead>
            <tbody>
              <tr v-for="l in tmRows" :key="l.id">
                <td class="pm-wrap">{{ l.description }}<span class="pm-cell-sub">{{ l.docNo }} · {{ formatDate(l.date) }}</span></td>
                <td>{{ l.tm!.person }}</td>
                <td class="pm-num">{{ l.tm!.hours }}</td>
                <td class="pm-num">{{ rp(l.amount) }}</td>
                <td class="pm-num">{{ rp(l.tm!.hours * l.tm!.billRate) }}<span class="pm-cell-sub">{{ rp(l.tm!.billRate) }}/{{ t('hr') }}</span></td>
                <td>
                  <template v-if="l.tm!.invoiceNo">{{ l.tm!.decision === 'bill' ? t('Bill') : l.tm!.decision === 'write_down' ? t('Write-down') : t('Write-up') }}</template>
                  <ErpFilterSelect v-else :id="`tm-decision-${l.id}`" :model-value="tmState(l.id).decision" :placeholder="t('Decide…')" :options="decisionOptions" :is-clearable="false" width="140px" @update:model-value="(v: string) => setDecision(l.id, v)" />
                  <span v-if="!l.tm!.invoiceNo && l.tm!.decision === 'pending'" class="pm-cell-sub pm-warn">{{ t('Awaiting decision') }}</span>
                </td>
                <td class="pm-num">
                  <MpInput v-if="!l.tm!.invoiceNo && (tmState(l.id).decision === 'write_down' || tmState(l.id).decision === 'write_up')" :id="`tm-amount-${l.id}`" v-model="tmState(l.id).amount" class="pm-w-cell" inputmode="numeric" :aria-label="t('Bill amount')" @blur="applyTm(l.id)" />
                  <template v-else>{{ rp(l.tm!.billAmount ?? l.tm!.hours * l.tm!.billRate) }}</template>
                </td>
                <td>{{ l.tm!.invoiceNo ?? '—' }}</td>
              </tr>
              <tr v-if="!tmRows.length"><td colspan="8"><div class="pm-empty-inline">{{ t('No time entries yet.') }}</div></td></tr>
            </tbody>
          </table>
        </div>
        <PmActionError id="pm-tm-error" :error="tmAction.error.value" class="pm-mt-3" />
        <div class="pm-row pm-mt-3">
          <span class="pm-muted pm-small">{{ tmPending }} {{ t('awaiting a decision') }} · {{ tmReady.length }} {{ t('ready to invoice') }}</span>
          <span class="pm-spacer" />
          <MpButton id="pm-tm-invoice" variant="primary" is-rounded @click="doInvoiceTm">{{ t('Invoice decided entries') }}</MpButton>
        </div>
      </template>

      <!-- Run (Input / Unit) -->
      <div v-if="(isUnit || isInput) && pc !== undefined" class="pm-card pm-mt-3">
        <div class="pm-row">
          <div>
            <div class="pm-strong">{{ t('Recognition due') }}: <span :class="due ? 'pm-info' : ''">{{ rp(due) }}</span></div>
            <div class="pm-caption">{{ pct(pc) }} × {{ rp(project.contractValue) }} − {{ rp(recognised) }} {{ t('already recognised') }}</div>
          </div>
          <span class="pm-spacer" />
          <MpButton id="pm-rec-run" variant="primary" is-rounded @click="doRun">{{ t('Run recognition') }}</MpButton>
        </div>
      </div>

      <h3 class="pm-h3 pm-mt-5 pm-mb-2">{{ t('Recognition postings') }}</h3>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Date') }}</th><th>{{ t('Description') }}</th><th class="pm-num">{{ t('Cumulative %') }}</th><th class="pm-num">{{ t('Revenue') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in projectRecognition(project.id)" :key="r.id">
              <td><span class="pm-row pm-row--nowrap pm-gap-2">{{ r.no }}<ErpStatusBadge v-if="r.kind === 'catch_up'" v-bind="badgeProps('flag', 'catch-up', t)" /></span></td>
              <td>{{ formatDate(r.date) }}</td>
              <td class="pm-wrap">{{ r.description }}<span class="pm-cell-sub">{{ r.by }}</span></td>
              <td class="pm-num">{{ r.cumulativePct !== undefined ? pct(r.cumulativePct) : '—' }}</td>
              <td class="pm-num">{{ rp(r.amount) }}</td>
            </tr>
            <tr v-if="!projectRecognition(project.id).length"><td colspan="5"><div class="pm-empty-inline">{{ t('Nothing recognised yet.') }}</div></td></tr>
          </tbody>
          <tfoot v-if="projectRecognition(project.id).length"><tr><td colspan="4">{{ t('Recognised to date') }}</td><td class="pm-num">{{ rp(recognised) }}</td></tr></tfoot>
        </table>
      </div>
    </section>

    <!-- ── Billing ── -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Billing') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Terms come from the contract') }}<template v-if="project.salesOrderNo"> ({{ project.salesOrderNo }})</template>{{ t(', never from the structure. A trigger may reference cumulative progress; the amount always comes from the contract.') }}</p>
        </div>
      </div>
      <PmActionError id="pm-bill-error" :error="billAction.error.value" class="pm-mb-3" />
      <div v-if="!isTm" class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Term') }}</th><th class="pm-num">{{ t('Share') }}</th><th>{{ t('Trigger') }}</th><th class="pm-num">{{ t('Amount') }}</th><th>{{ t('Invoice') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="term in projectTerms(project.id)" :key="term.id">
              <td>{{ term.label }}</td>
              <td class="pm-num">{{ pct(term.pct) }}</td>
              <td>{{ triggerText(term) }}<span class="pm-cell-sub" :class="triggerMet(term) ? 'pm-pos' : ''">{{ triggerMet(term) ? t('Trigger met') : t('Not met yet') }}</span></td>
              <td class="pm-num">{{ rp((term.pct / 100) * project.contractValue) }}</td>
              <td>
                <template v-if="termInvoice(term.id)">{{ termInvoice(term.id)!.no }}<span class="pm-cell-sub">{{ formatDate(termInvoice(term.id)!.date) }}</span></template>
                <span v-else class="pm-muted">—</span>
              </td>
              <td class="pm-cell-actions">
                <MpButton v-if="!termInvoice(term.id)" :id="`pm-issue-${term.id}`" variant="secondary" is-rounded size="sm" @click="openIssue(term)">{{ t('Issue term invoice') }}</MpButton>
              </td>
            </tr>
            <tr v-if="!projectTerms(project.id).length"><td colspan="6"><div class="pm-empty-inline">{{ t('No billing terms on the linked contract.') }}</div></td></tr>
          </tbody>
        </table>
      </div>

      <h3 class="pm-h3 pm-mt-5 pm-mb-2">{{ t('Invoices') }}</h3>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Date') }}</th><th>{{ t('Description') }}</th><th class="pm-num">{{ t('Amount') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="inv in projectInvoiceList(project.id)" :key="inv.id">
              <td>{{ inv.no }}</td>
              <td>{{ formatDate(inv.date) }}</td>
              <td>{{ inv.description }}</td>
              <td class="pm-num">{{ rp(inv.amount) }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('invoice', inv.status, t)" /></td>
              <td><MpTextlink v-if="inv.status === 'unpaid'" :id="`pm-pay-${inv.id}`" as="a" @click.prevent="doPaid(inv.id)">{{ t('Record payment') }}</MpTextlink></td>
            </tr>
            <tr v-if="!projectInvoiceList(project.id).length"><td colspan="6"><div class="pm-empty-inline">{{ t('No invoices yet.') }}</div></td></tr>
          </tbody>
          <tfoot v-if="projectInvoiceList(project.id).length"><tr><td colspan="3">{{ t('Billed to date') }}</td><td class="pm-num">{{ rp(billed) }}</td><td colspan="2" /></tr></tfoot>
        </table>
      </div>
    </section>

    <!-- Verify modal -->
    <PmOverlay id="pm-verify-modal" :open="verify.open" variant="modal" :title="t('Verify progress by BAST')" :subtitle="verifyPhaseObj ? `${verifyPhaseObj.name} · ${pct(verifyPhaseObj.progressWeightPct)}` : ''" @close="verify.open = false">
      <MpFormControl id="bast-no-fc" is-required :is-invalid="verify.touched && !verify.bastNo.trim()">
        <MpFormLabel>{{ t('BAST number') }}</MpFormLabel>
        <MpInput id="bast-no" v-model="verify.bastNo" />
        <MpFormErrorMessage>{{ t('Enter the BAST number — a phase is achieved by third-party evidence.') }}</MpFormErrorMessage>
      </MpFormControl>
      <div v-if="verifyPhaseObj" class="pm-card pm-card--flat pm-grid-2">
        <ContentList :label="t('Revenue recognised')" :value="rp(((verifyPhaseObj.progressWeightPct ?? 0) / 100) * project.contractValue)" />
        <ContentList :label="t('Invoice issued')" :value="t('None — billing follows the contract terms')" />
      </div>
      <PmActionError id="pm-verify-error" :error="verifyAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="verify.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doVerify">{{ t('Verify and recognise') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- Term invoice confirm -->
    <PmOverlay id="pm-term-modal" :open="termConfirm.open" variant="modal" :title="t('Issue term invoice')" :subtitle="termConfirm.term?.label" @close="termConfirm.open = false">
      <template v-if="termConfirm.term">
        <div class="pm-card pm-card--flat pm-grid-2">
          <ContentList :label="t('Amount billed')" :value="rp((termConfirm.term.pct / 100) * project.contractValue)" />
          <ContentList :label="t('Revenue recognised')" :value="t('None — recognition follows progress')" />
        </div>
        <MpBanner v-if="!triggerMet(termConfirm.term)" id="pm-term-trigger" variant="warning">
          <MpBannerIcon />
          <MpBannerDescription>{{ t('This term’s trigger isn’t met yet') }} ({{ triggerText(termConfirm.term) }}). {{ t('You can still bill it if the customer agreed.') }}</MpBannerDescription>
        </MpBanner>
        <p class="pm-body pm-m-0">{{ t('WIP after this invoice') }}: <strong :class="wip - (termConfirm.term.pct / 100) * project.contractValue < 0 ? 'pm-neg' : 'pm-pos'">{{ rp(Math.abs(wip - (termConfirm.term.pct / 100) * project.contractValue)) }} {{ wip - (termConfirm.term.pct / 100) * project.contractValue < 0 ? t('overbilled') : t('underbilled') }}</strong></p>
        <PmActionError id="pm-term-error" :error="termAction.error.value" />
      </template>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="termConfirm.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doIssue">{{ t('Issue invoice') }}</MpButton>
      </template>
    </PmOverlay>
  </div>
</template>
