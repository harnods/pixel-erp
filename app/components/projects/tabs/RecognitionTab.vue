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
import PmOverlay from '../PmOverlay.vue'
import type { Project } from '~/data/projects'
import { projectPhases, projectWorkPackages, weightTotal } from '~/data/projects'
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
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()

const active = computed(() => props.project.status === 'active')
const isMilestone = computed(() => props.project.method === 'output' && props.project.measure === 'milestone')
const isUnit = computed(() => props.project.method === 'output' && props.project.measure === 'unit')
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
function openVerify(phaseId: string) { Object.assign(verify, { open: true, phaseId, bastNo: '', touched: false }) }
function doVerify() {
  verify.touched = true
  if (!verify.bastNo.trim()) return
  if (notifyResult(verifyPhase(verify.phaseId, verify.bastNo, asActor.value))) verify.open = false
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
function doIssue() {
  if (!termConfirm.term) return
  if (notifyResult(issueTermInvoice(termConfirm.term.id, asActor.value))) termConfirm.open = false
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
const tmPending = computed(() => tmRows.value.filter(l => l.tm?.decision === 'pending').length)
const tmReady = computed(() => tmRows.value.filter(l => l.tm && l.tm.decision !== 'pending' && !l.tm.invoiceNo))

const inputBudget = computed(() => projectBudgetTotal(props.project.id))
const unit = computed(() => unitProgress(props.project.id))
const unitWps = computed(() => projectWorkPackages(props.project.id).filter(w => w.plannedUnits))
</script>

<template>
  <div class="pm-stack" style="gap: 20px">
    <!-- Two clocks -->
    <div class="pm-grid-3">
      <div class="pm-card">
        <div class="pm-stat-label">{{ t('Recognised to date') }}</div>
        <div class="pm-stat-value">{{ rp(recognised) }}</div>
        <div class="pm-stat-note">{{ pc !== undefined ? `${pct(pc)} ${t('complete')} · ` : '' }}{{ t('Revenue clock — progress') }}</div>
      </div>
      <div class="pm-card">
        <div class="pm-stat-label">{{ t('Billed to date') }}</div>
        <div class="pm-stat-value">{{ rp(billed) }}</div>
        <div class="pm-stat-note">{{ t('Billing clock — contract terms') }}</div>
      </div>
      <div class="pm-card" :style="{ borderColor: wip < 0 ? '#f6c3c7' : wip > 0 ? '#bfe7d1' : undefined }">
        <div class="pm-stat-label">{{ t('WIP position') }}</div>
        <div class="pm-stat-value" :class="wip > 0 ? 'pm-pos' : wip < 0 ? 'pm-neg' : ''">{{ rp(Math.abs(wip)) }}</div>
        <div class="pm-stat-note">{{ wip > 0 ? t('Underbilled — contract asset (recognised > billed)') : wip < 0 ? t('Overbilled — contract liability (billed > recognised)') : t('Recognised equals billed') }}</div>
      </div>
    </div>
    <div class="pm-banner pm-banner--neutral">
      <div class="pm-banner-body">{{ t('Recognition and billing are separate postings. Verifying progress recognises revenue and issues no invoice; issuing a term invoice bills the customer and recognises nothing. WIP is the reconciling balance.') }}</div>
    </div>

    <!-- ── Recognition ── -->
    <section class="pm-section" style="padding-top: 0">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Recognition') }}</h2>
          <p class="pm-desc">
            <template v-if="isMilestone">{{ t('Output · milestone — % complete is the sum of achieved phases’ progress weights. A phase is achieved by its BAST, not by judgement.') }}</template>
            <template v-else-if="isUnit">{{ t('Output · unit — % complete = confirmed ÷ planned units across work packages.') }}</template>
            <template v-else-if="isInput">{{ t('Input (cost-to-cost) — % complete = actual cost ÷ budget, applied to contract value. Recalculates as cost posts.') }}</template>
            <template v-else>{{ t('Time & materials — each unbilled entry carries a bill / write-down / write-up decision before invoicing.') }}</template>
          </p>
        </div>
        <span class="pm-pill pm-pill--outline">🔒 {{ t('Method locked at approval') }}</span>
      </div>

      <div v-if="project.status === 'draft'" class="pm-banner pm-banner--info" style="margin-bottom: 12px"><div class="pm-banner-body">{{ t('Approve the project before recognising revenue.') }}</div></div>

      <!-- Milestone -->
      <template v-if="isMilestone">
        <div v-if="total !== 100" class="pm-banner pm-banner--error" style="margin-bottom: 12px">
          <div class="pm-banner-body">{{ t('Progress weights total') }} {{ pct(total) }} — {{ t('verification is blocked until they total 100%.') }} <button class="pm-link" type="button" @click="router.replace({ query: { tab: 'structure' } })">{{ t('Fix on Structure tab') }}</button></div>
        </div>
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead><tr><th>{{ t('Phase') }}</th><th class="pm-num">{{ t('Progress weight') }}</th><th class="pm-num">{{ t('Revenue at this weight') }}</th><th>{{ t('BAST') }}</th><th /></tr></thead>
            <tbody>
              <tr v-for="ph in projectPhases(project.id).filter(p => !p.auto)" :key="ph.id">
                <td>{{ ph.order }}. {{ ph.name }}</td>
                <td class="pm-num">{{ pct(ph.progressWeightPct) }}</td>
                <td class="pm-num">{{ rp(((ph.progressWeightPct ?? 0) / 100) * project.contractValue) }}</td>
                <td>
                  <template v-if="ph.verifiedAt"><span class="pm-pill pm-pill--green">{{ t('Verified') }}</span><span class="pm-cell-sub">{{ ph.bastNo }} · {{ formatDate(ph.verifiedAt) }}</span></template>
                  <span v-else class="pm-muted">{{ t('Not yet') }}</span>
                </td>
                <td>
                  <button v-if="!ph.verifiedAt" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" :disabled="!!verifyBlock" :title="verifyBlock" @click="openVerify(ph.id)">{{ t('Verify by BAST') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="verifyBlock && active" class="pm-help" style="margin-top: 6px">{{ verifyBlock }}</p>
        <p class="pm-help" style="margin-top: 6px">{{ t('With weight on the phase, revenue steps rather than glides — split a large phase to smooth it.') }}</p>
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
        <p class="pm-help" style="margin-top: 6px">{{ t('Open question 6 — service work packages in a unit-measured project:') }} {{ projectPolicy.qtyPocOption === 'A' ? t('option A (all planned units count)') : t('option B (only production work packages count)') }}. <button class="pm-link pm-small" type="button" @click="router.push('/project-settings')">{{ t('Change in Project settings') }}</button></p>
      </template>

      <!-- Input -->
      <template v-else-if="isInput">
        <div v-if="inputBudget === undefined" class="pm-banner pm-banner--warn">
          <div class="pm-banner-body">{{ t('Budget not set — % complete can’t be computed for cost-to-cost until a baseline exists.') }} <button class="pm-link" type="button" @click="router.push(`/budget-setup/${project.id}`)">{{ t('Set up budget') }}</button></div>
        </div>
        <div v-else class="pm-card pm-card--flat">
          <div class="pm-grid-3">
            <div><div class="pm-stat-label">{{ t('Actual cost') }}</div><div class="pm-stat-value" style="font-size: 16px">{{ rp(projectActual(project.id)) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Budget') }}</div><div class="pm-stat-value" style="font-size: 16px">{{ rp(inputBudget) }}</div></div>
            <div><div class="pm-stat-label">{{ t('% complete') }}</div><div class="pm-stat-value" style="font-size: 16px">{{ pct(pc) }}</div></div>
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
                  <select v-else v-model="tmState(l.id).decision" class="pm-select pm-input--sm" style="width: 140px" :disabled="!active" @change="applyTm(l.id)">
                    <option value="" disabled>{{ t('Decide…') }}</option>
                    <option value="bill">{{ t('Bill') }}</option>
                    <option value="write_down">{{ t('Write-down') }}</option>
                    <option value="write_up">{{ t('Write-up') }}</option>
                  </select>
                  <span v-if="!l.tm!.invoiceNo && l.tm!.decision === 'pending'" class="pm-cell-sub pm-warn">{{ t('Awaiting decision') }}</span>
                </td>
                <td class="pm-num">
                  <input v-if="!l.tm!.invoiceNo && (tmState(l.id).decision === 'write_down' || tmState(l.id).decision === 'write_up')" v-model="tmState(l.id).amount" class="pm-input pm-input--sm pm-input--num" style="width: 130px" inputmode="numeric" @blur="applyTm(l.id)" />
                  <template v-else>{{ rp(l.tm!.billAmount ?? l.tm!.hours * l.tm!.billRate) }}</template>
                </td>
                <td>{{ l.tm!.invoiceNo ?? '—' }}</td>
              </tr>
              <tr v-if="!tmRows.length"><td colspan="8"><div class="pm-empty">{{ t('No time entries yet.') }}</div></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pm-row" style="margin-top: 10px">
          <span class="pm-muted pm-small">{{ tmPending }} {{ t('awaiting a decision') }} · {{ tmReady.length }} {{ t('ready to invoice') }}</span>
          <span class="pm-spacer" />
          <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!active || !tmReady.length" @click="notifyResult(invoiceTm(project.id, asActor))">{{ t('Invoice decided entries') }}</button>
        </div>
      </template>

      <!-- Run (Input / Unit) -->
      <div v-if="(isUnit || isInput) && pc !== undefined" class="pm-card" style="margin-top: 12px">
        <div class="pm-row">
          <div>
            <div class="pm-strong">{{ t('Recognition due') }}: <span :class="due ? 'pm-info' : ''">{{ rp(due) }}</span></div>
            <div class="pm-small pm-muted">{{ pct(pc) }} × {{ rp(project.contractValue) }} − {{ rp(recognised) }} {{ t('already recognised') }}</div>
          </div>
          <span class="pm-spacer" />
          <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!active || !due" @click="notifyResult(runRecognition(project.id, asActor))">{{ t('Run recognition') }}</button>
        </div>
      </div>

      <h3 class="pm-h3" style="margin: 20px 0 8px">{{ t('Recognition postings') }}</h3>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Date') }}</th><th>{{ t('Description') }}</th><th class="pm-num">{{ t('Cumulative %') }}</th><th class="pm-num">{{ t('Revenue') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in projectRecognition(project.id)" :key="r.id">
              <td>{{ r.no }}<span v-if="r.kind === 'catch_up'" class="pm-pill pm-pill--yellow" style="margin-left: 6px">{{ t('Catch-up') }}</span></td>
              <td>{{ formatDate(r.date) }}</td>
              <td class="pm-wrap">{{ r.description }}<span class="pm-cell-sub">{{ r.by }}</span></td>
              <td class="pm-num">{{ r.cumulativePct !== undefined ? pct(r.cumulativePct) : '—' }}</td>
              <td class="pm-num">{{ rp(r.amount) }}</td>
            </tr>
            <tr v-if="!projectRecognition(project.id).length"><td colspan="5"><div class="pm-empty">{{ t('Nothing recognised yet.') }}</div></td></tr>
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
          <p class="pm-desc">{{ t('Terms come from the contract') }}<template v-if="project.salesOrderNo"> ({{ project.salesOrderNo }})</template>{{ t(', never from the structure. A trigger may reference cumulative progress; the amount always comes from the contract.') }}</p>
        </div>
      </div>
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
              <td>
                <button v-if="!termInvoice(term.id)" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" :disabled="project.status === 'draft'" @click="termConfirm.term = term; termConfirm.open = true">{{ t('Issue term invoice') }}</button>
              </td>
            </tr>
            <tr v-if="!projectTerms(project.id).length"><td colspan="6"><div class="pm-empty">{{ t('No billing terms on the linked contract.') }}</div></td></tr>
          </tbody>
        </table>
      </div>

      <h3 class="pm-h3" style="margin: 20px 0 8px">{{ t('Invoices') }}</h3>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Date') }}</th><th>{{ t('Description') }}</th><th class="pm-num">{{ t('Amount') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="inv in projectInvoiceList(project.id)" :key="inv.id">
              <td>{{ inv.no }}</td>
              <td>{{ formatDate(inv.date) }}</td>
              <td>{{ inv.description }}</td>
              <td class="pm-num">{{ rp(inv.amount) }}</td>
              <td><span class="pm-pill" :class="inv.status === 'paid' ? 'pm-pill--green' : 'pm-pill--yellow'">{{ inv.status === 'paid' ? t('Paid') : t('Unpaid') }}</span></td>
              <td><button v-if="inv.status === 'unpaid'" class="pm-link" type="button" @click="markInvoicePaid(inv.id)">{{ t('Record payment') }}</button></td>
            </tr>
            <tr v-if="!projectInvoiceList(project.id).length"><td colspan="6"><div class="pm-empty">{{ t('No invoices yet.') }}</div></td></tr>
          </tbody>
          <tfoot v-if="projectInvoiceList(project.id).length"><tr><td colspan="3">{{ t('Billed to date') }}</td><td class="pm-num">{{ rp(billed) }}</td><td colspan="2" /></tr></tfoot>
        </table>
      </div>
    </section>

    <!-- Verify modal -->
    <PmOverlay :open="verify.open" variant="modal" :title="t('Verify progress by BAST')" :subtitle="verifyPhaseObj ? `${verifyPhaseObj.name} · ${pct(verifyPhaseObj.progressWeightPct)}` : ''" @close="verify.open = false">
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="bast-no">{{ t('BAST number') }}</label>
        <input id="bast-no" v-model="verify.bastNo" class="pm-input" placeholder="BAST/…" :aria-invalid="verify.touched && !verify.bastNo.trim()" />
        <span v-if="verify.touched && !verify.bastNo.trim()" class="pm-error">{{ t('Enter the BAST number — a phase is achieved by third-party evidence.') }}</span>
      </div>
      <div v-if="verifyPhaseObj" class="pm-card pm-card--flat">
        <div class="pm-kv" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
          <div><div class="pm-kv-label">{{ t('Revenue recognised') }}</div><div class="pm-kv-value pm-strong">{{ rp(((verifyPhaseObj.progressWeightPct ?? 0) / 100) * project.contractValue) }}</div></div>
          <div><div class="pm-kv-label">{{ t('Invoice issued') }}</div><div class="pm-kv-value">{{ t('None — billing follows the contract terms') }}</div></div>
        </div>
      </div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="verify.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="doVerify">{{ t('Verify and recognise') }}</button>
      </template>
    </PmOverlay>

    <!-- Term invoice confirm -->
    <PmOverlay :open="termConfirm.open" variant="modal" :title="t('Issue term invoice')" :subtitle="termConfirm.term?.label" @close="termConfirm.open = false">
      <template v-if="termConfirm.term">
        <div class="pm-card pm-card--flat">
          <div class="pm-kv" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
            <div><div class="pm-kv-label">{{ t('Amount billed') }}</div><div class="pm-kv-value pm-strong">{{ rp((termConfirm.term.pct / 100) * project.contractValue) }}</div></div>
            <div><div class="pm-kv-label">{{ t('Revenue recognised') }}</div><div class="pm-kv-value">{{ t('None — recognition follows progress') }}</div></div>
          </div>
        </div>
        <div v-if="!triggerMet(termConfirm.term)" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ t('This term’s trigger isn’t met yet') }} ({{ triggerText(termConfirm.term) }}). {{ t('You can still bill it if the customer agreed.') }}</div></div>
        <p class="pm-desc" style="margin: 0">{{ t('WIP after this invoice') }}: <strong :class="wip - (termConfirm.term.pct / 100) * project.contractValue < 0 ? 'pm-neg' : 'pm-pos'">{{ rp(Math.abs(wip - (termConfirm.term.pct / 100) * project.contractValue)) }} {{ wip - (termConfirm.term.pct / 100) * project.contractValue < 0 ? t('overbilled') : t('underbilled') }}</strong></p>
      </template>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="termConfirm.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="doIssue">{{ t('Issue invoice') }}</button>
      </template>
    </PmOverlay>
  </div>
</template>
