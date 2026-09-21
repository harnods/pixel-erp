<script setup lang="ts">
/**
 * New document — cost captured on a real ERP document with Project at line
 * level (PRD §4, §5; Stories 5, 6, 14).
 *
 * Pegging is mandatory, all-or-nothing per document (D2):
 *   • every line names a project node → project document, budget-checked
 *   • no line names one → ordinary expense, consumes no project budget
 *   • some lines only → refused, naming how many are untagged, offering quick fixes
 * Budget check (phase 1 = warn + override for every document type, D6):
 *   committed + actual + this amount vs the work package and its rolled-up
 *   parents. At/under the effective threshold → PM overrides with a reason;
 *   above it → held for Finance and shown in the Approvals inbox.
 * Production labour can only go through a work order (D1), so Cost of
 * production is not offered here and timesheets post to Direct labour only.
 */
import PmTitleBar from '../PmTitleBar.vue'
import { getProject, peggableNodes, getWorkPackage, nodeLabel } from '~/data/projects'
import { COST_ACCOUNTS, COGM_ACCOUNT, LABOUR_ACCOUNT, accountName } from '~/data/projectBudgets'
import { peggedDocuments, type PeggedDocument } from '~/data/projectTransactions'
import { effectiveMode } from '~/data/projectPolicy'
import { saveDocument, peggingState, checkDocument } from '~/data/projectActions'
import { rp, pct, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor } = useProjectRole()

type DocType = PeggedDocument['docType']
const DOC_TYPES: { key: DocType; label: string }[] = [
  { key: 'PR', label: 'Purchase request' },
  { key: 'PO', label: 'Purchase order' },
  { key: 'Expense', label: 'Expense' },
  { key: 'Timesheet', label: 'Timesheet' },
]
const docType = ref<DocType>((['PR', 'PO', 'Expense', 'Timesheet'].includes(String(route.query.type)) ? route.query.type : 'PO') as DocType)
const vendor = ref('')
const nodes = computed(() => peggableNodes({ includeDraft: true }))
const presetProject = typeof route.query.project === 'string' ? getProject(route.query.project) : undefined
const presetWp = typeof route.query.wp === 'string' ? route.query.wp : (presetProject ? nodes.value.find(n => n.projectId === presetProject.id)?.id : '')

interface LineDraft { description: string; account: string; amount: string; wpId: string }
const lines = ref<LineDraft[]>([
  { description: '', account: '5-50300', amount: '', wpId: presetWp ?? '' },
])
const accountOptions = computed(() => docType.value === 'Timesheet'
  ? COST_ACCOUNTS.filter(a => a.code === LABOUR_ACCOUNT)
  : COST_ACCOUNTS.filter(a => a.code !== COGM_ACCOUNT))
watch(docType, v => { if (v === 'Timesheet') lines.value.forEach(l => { l.account = LABOUR_ACCOUNT }) })
function addLine() { lines.value.push({ description: '', account: docType.value === 'Timesheet' ? LABOUR_ACCOUNT : '5-50300', amount: '', wpId: lines.value.find(l => l.wpId)?.wpId ?? '' }) }

const parsed = computed(() => lines.value.map(l => ({ description: l.description, account: l.account, amount: parseAmount(l.amount), wpId: l.wpId || undefined })))
const filled = computed(() => parsed.value.filter(l => l.amount > 0 || l.description.trim() || l.wpId))
const peg = computed(() => peggingState(filled.value))
const firstNode = computed(() => filled.value.find(l => l.wpId)?.wpId)
function tagAllWith(wpId: string) { lines.value.forEach(l => { if (!l.wpId) l.wpId = wpId }) }
function untagAll() { lines.value.forEach(l => { l.wpId = '' }) }

const checks = computed(() => (peg.value.state === 'all' ? checkDocument(filled.value.filter(l => l.amount > 0)) : []))
const verdict = computed<'within' | 'override' | 'escalate' | 'no_budget' | 'none'>(() => {
  if (!checks.value.length) return 'none'
  if (checks.value.some(c => c.result.verdict === 'escalate')) return 'escalate'
  if (checks.value.some(c => c.result.verdict === 'override')) return 'override'
  if (checks.value.some(c => c.result.verdict === 'no_budget')) return 'no_budget'
  return 'within'
})
const mode = computed(() => effectiveMode(docType.value))
const reason = ref('')
const total = computed(() => filled.value.reduce((s, l) => s + l.amount, 0))

const touched = ref(false)
const result = ref<PeggedDocument | null>(null)
function save() {
  touched.value = true
  const res = saveDocument({ docType: docType.value, vendor: vendor.value || undefined, lines: filled.value, overrideReason: reason.value }, asActor.value)
  if (notifyResult(res) && 'doc' in res && res.doc) {
    result.value = res.doc
    lines.value = [{ description: '', account: docType.value === 'Timesheet' ? LABOUR_ACCOUNT : '5-50300', amount: '', wpId: '' }]
    reason.value = ''
    vendor.value = ''
    touched.value = false
  }
}
function budgetLink(wpId: string, need: number) {
  const wp = getWorkPackage(wpId)!
  return `/budget-setup/${wp.projectId}?returnTo=${encodeURIComponent(route.fullPath)}&wp=${wpId}&need=${Math.round(need)}&doc=${encodeURIComponent(t(DOC_TYPES.find(d => d.key === docType.value)!.label))}`
}
const DOC_STATUS: Record<PeggedDocument['status'], { label: string; tone: string }> = {
  posted: { label: 'Posted to project', tone: 'pm-pill--green' },
  held: { label: 'Held for Finance', tone: 'pm-pill--yellow' },
  ordinary: { label: 'Ordinary expense', tone: 'pm-pill--gray' },
  rejected: { label: 'Rejected', tone: 'pm-pill--red' },
  draft: { label: 'Draft (MRP)', tone: 'pm-pill--blue' },
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('New document')" :breadcrumb="presetProject ? { label: `${presetProject.code} · ${presetProject.name}`, to: `/projects/${presetProject.id}` } : undefined" :subtitle="t('Purchase request, purchase order, expense or timesheet — with the project on every line.')" />
    <div class="pm-stage">
      <div class="pm-stack" style="gap: 16px; max-width: 1180px">
        <div v-if="result" class="pm-banner" :class="result.status === 'held' ? 'pm-banner--warn' : 'pm-banner--success'">
          <div class="pm-banner-body">
            <div class="pm-banner-title">{{ result.docNo }} — {{ t(DOC_STATUS[result.status].label) }}</div>
            <template v-if="result.status === 'held'">{{ t('Finance sees it in the Approvals inbox; you can see its held state below.') }}</template>
            <template v-else-if="result.status === 'ordinary'">{{ t('No line named a project, so it saved as an ordinary expense and consumed no project budget.') }}</template>
            <template v-else>{{ t('Every line is pegged — the project’s Cost tracking and Budget tabs include it now.') }}</template>
          </div>
          <button v-if="result.lines[0]?.wpId" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="router.push(`/projects/${getWorkPackage(result.lines[0].wpId!)?.projectId}?tab=cost`)">{{ t('Open project') }}</button>
        </div>

        <div class="pm-card">
          <div class="pm-grid-3">
            <div class="pm-field">
              <span class="pm-label">{{ t('Document type') }}</span>
              <div class="pm-seg" style="flex-wrap: wrap">
                <button v-for="d in DOC_TYPES" :key="d.key" type="button" :class="{ 'pm-seg--active': docType === d.key }" @click="docType = d.key">{{ t(d.label) }}</button>
              </div>
            </div>
            <div v-if="docType !== 'Timesheet'" class="pm-field">
              <label class="pm-label" for="nd-v">{{ t('Vendor') }}</label>
              <input id="nd-v" v-model="vendor" class="pm-input" :placeholder="t('Optional for a request')" />
            </div>
            <div class="pm-field">
              <span class="pm-label">{{ t('Budget check policy') }}</span>
              <span class="pm-small">{{ mode === 'off' ? t('Off for this document type') : t('Warn + override with reason (company policy, phase 1)') }}</span>
            </div>
          </div>
          <p v-if="docType === 'Timesheet'" class="pm-help" style="margin-top: 10px">{{ t('Timesheets record non-production labour only. Production labour is recorded through a work order and absorbed into Cost of production.') }}</p>
        </div>

        <!-- Pegging state -->
        <div v-if="filled.length && peg.state === 'partial'" class="pm-banner pm-banner--error">
          <div class="pm-banner-body">
            <div class="pm-banner-title">{{ peg.untagged }} {{ t('of') }} {{ filled.length }} {{ t('lines have no project') }}</div>
            {{ t('If any line names a project, every line must. A partly tagged document can’t be saved — it’s the “forgot” pattern, and it looks exactly like deliberate non-project cost.') }}
            <div class="pm-row" style="margin-top: 8px">
              <button v-if="firstNode" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="tagAllWith(firstNode)">{{ t('Tag untagged lines with') }} {{ nodeLabel(firstNode) }}</button>
              <button class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm" type="button" @click="untagAll">{{ t('Remove project from all lines') }}</button>
            </div>
          </div>
        </div>
        <div v-else-if="filled.length && peg.state === 'none'" class="pm-banner pm-banner--neutral">
          <div class="pm-banner-body">{{ t('No line names a project — this saves as an ordinary expense and consumes no project budget.') }}</div>
        </div>

        <!-- Lines -->
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead>
              <tr>
                <th style="min-width: 260px">{{ t('Description') }}</th>
                <th style="min-width: 180px">{{ t('Account') }}</th>
                <th style="min-width: 300px">{{ t('Project') }}</th>
                <th>{{ t('Dimensions') }}</th>
                <th class="pm-num" style="min-width: 170px">{{ t('Amount') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, i) in lines" :key="i">
                <td><input v-model="l.description" class="pm-input pm-input--sm" :placeholder="t('What is it for?')" /></td>
                <td>
                  <select v-model="l.account" class="pm-select pm-input--sm">
                    <option v-for="a in accountOptions" :key="a.code" :value="a.code">{{ t(a.name) }}</option>
                  </select>
                </td>
                <td>
                  <select v-model="l.wpId" class="pm-select pm-input--sm" :aria-invalid="peg.state === 'partial' && !l.wpId && (!!l.description || !!l.amount)">
                    <option value="">{{ peg.state === 'none' || filled.length === 0 ? t('No project (ordinary expense)') : t('Required — pick a project node') }}</option>
                    <option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.label }}</option>
                  </select>
                </td>
                <td class="pm-wrap" style="min-width: 160px">
                  <template v-if="l.wpId">
                    <span v-for="(v, key) in getProject(getWorkPackage(l.wpId)!.projectId)!.dimensions" :key="key" class="pm-pill pm-pill--outline" style="margin: 0 4px 4px 0">{{ v }}</span>
                  </template>
                  <span v-else class="pm-muted pm-small">—</span>
                </td>
                <td class="pm-num"><input v-model="l.amount" class="pm-input pm-input--sm pm-input--num" inputmode="numeric" placeholder="0" @blur="l.amount = parseAmount(l.amount) ? parseAmount(l.amount).toLocaleString('id-ID') : ''" /></td>
                <td>
                  <button class="pm-icon-btn" type="button" :aria-label="t('Remove line')" :disabled="lines.length === 1" @click="lines.splice(i, 1)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot><tr><td colspan="4"><button class="pm-link" type="button" style="font-weight: 600" @click="addLine">+ {{ t('Line') }}</button></td><td class="pm-num">{{ rp(total) }}</td><td /></tr></tfoot>
          </table>
        </div>
        <p class="pm-help">{{ t('One document can split across several projects. Dimensions default from each project and are reporting-only.') }}</p>

        <!-- Budget check -->
        <div v-if="checks.length" class="pm-card">
          <div class="pm-row" style="margin-bottom: 10px">
            <h3 class="pm-h3">{{ t('Budget check') }}</h3>
            <span class="pm-pill" :class="{ 'pm-pill--green': verdict === 'within', 'pm-pill--yellow': verdict === 'override', 'pm-pill--red': verdict === 'escalate', 'pm-pill--gray': verdict === 'no_budget' }">
              {{ verdict === 'within' ? t('Within budget') : verdict === 'override' ? t('Over — override with reason') : verdict === 'escalate' ? t('Over threshold — Finance sign-off') : t('Budget not set') }}
            </span>
          </div>
          <div v-for="c in checks" :key="c.wpId" style="margin-bottom: 12px">
            <div class="pm-small pm-strong" style="margin-bottom: 4px">{{ nodeLabel(c.wpId) }} · {{ t('this document') }} {{ rp(c.result.requested) }} · {{ t('threshold') }} {{ pct(c.result.threshold) }}</div>
            <div v-if="c.result.verdict === 'no_budget'" class="pm-muted pm-small">{{ t('This project has no budget baseline — it reads “not set”, not zero.') }}</div>
            <div v-else class="pm-table-wrap">
              <table class="pm-table">
                <thead><tr><th>{{ t('Level') }}</th><th class="pm-num">{{ t('Budget') }}</th><th class="pm-num">{{ t('Committed') }}</th><th class="pm-num">{{ t('Actual') }}</th><th class="pm-num">{{ t('Available') }}</th><th class="pm-num">{{ t('Over by') }}</th></tr></thead>
                <tbody>
                  <tr v-for="lv in c.result.levels" :key="lv.level">
                    <td>{{ t(lv.level) }}<span class="pm-cell-sub">{{ lv.label }}</span></td>
                    <td class="pm-num">{{ rp(lv.budget) }}</td>
                    <td class="pm-num">{{ rp(lv.committed) }}</td>
                    <td class="pm-num">{{ rp(lv.actual) }}</td>
                    <td class="pm-num" :class="{ 'pm-neg': lv.available < 0 }">{{ rp(lv.available) }}</td>
                    <td class="pm-num" :class="lv.overBy ? 'pm-neg' : 'pm-muted'">{{ lv.overBy ? `${rp(lv.overBy)} (${pct(lv.overPct)})` : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="c.result.worst" class="pm-row" style="margin-top: 6px">
              <button class="pm-link pm-small" type="button" @click="router.push(budgetLink(c.wpId, c.result.worst.overBy))">{{ t('Add budget in Budget setup') }} →</button>
            </div>
          </div>
          <div v-if="verdict === 'override' || verdict === 'escalate'" class="pm-field">
            <label class="pm-label pm-label-req" for="nd-reason">{{ t('Reason for exceeding the budget') }}</label>
            <textarea id="nd-reason" v-model="reason" class="pm-textarea" style="min-height: 60px" :aria-invalid="touched && !reason.trim()" />
            <span v-if="touched && !reason.trim()" class="pm-error">{{ t('A reason is required.') }}</span>
            <span class="pm-help">{{ verdict === 'escalate' ? t('Above the threshold, the document is held for Finance sign-off. You’ll see it as held; Finance sees it in the Approvals inbox.') : t('At or under the threshold, your override is recorded with this reason. No overrun goes unrecorded.') }}</span>
          </div>
        </div>

        <div class="pm-form-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="router.back()">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!filled.length || peg.state === 'partial'" @click="save">
            {{ verdict === 'escalate' ? t('Save and send to Finance') : t('Save') }}
          </button>
        </div>

        <!-- Recent -->
        <section class="pm-section">
          <h2 class="pm-h2" style="margin-bottom: 10px">{{ t('Recent documents') }}</h2>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Date') }}</th><th>{{ t('Lines') }}</th><th class="pm-num">{{ t('Amount') }}</th><th>{{ t('Status') }}</th></tr></thead>
              <tbody>
                <tr v-for="d in peggedDocuments.slice(0, 12)" :key="d.id">
                  <td>{{ d.docNo }}<span class="pm-cell-sub">{{ d.vendor ?? d.createdBy }}</span></td>
                  <td>{{ formatDate(d.date) }}</td>
                  <td class="pm-wrap">
                    <div v-for="(l, i) in d.lines.slice(0, 3)" :key="i" class="pm-small">{{ l.description }} · {{ t(accountName(l.account)) }} · {{ l.wpId ? nodeLabel(l.wpId) : t('no project') }}</div>
                    <div v-if="d.lines.length > 3" class="pm-small pm-muted">+{{ d.lines.length - 3 }}</div>
                  </td>
                  <td class="pm-num">{{ rp(d.lines.reduce((s, l) => s + l.amount, 0)) }}</td>
                  <td>
                    <span class="pm-pill" :class="DOC_STATUS[d.status].tone">{{ t(DOC_STATUS[d.status].label) }}</span>
                    <span v-if="d.override" class="pm-cell-sub">{{ t('Over by') }} {{ rp(d.override.overBy) }} ({{ pct(d.override.overPct) }})</span>
                  </td>
                </tr>
                <tr v-if="!peggedDocuments.length"><td colspan="5"><div class="pm-empty">{{ t('No documents yet.') }}</div></td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
