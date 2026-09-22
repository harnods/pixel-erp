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
import {
  MpButton, MpIcon, MpInput, MpTextarea, MpTag, MpSegmentedControl, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { getProject, peggableNodes, getWorkPackage, nodeLabel } from '~/data/projects'
import { COST_ACCOUNTS, COGM_ACCOUNT, LABOUR_ACCOUNT, accountName } from '~/data/projectBudgets'
import { peggedDocuments, type PeggedDocument } from '~/data/projectTransactions'
import { effectiveMode } from '~/data/projectPolicy'
import { saveDocument, peggingState, checkDocument } from '~/data/projectActions'
import { rp, pct, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor } = useProjectRole()
const action = useProjectAction()

type DocType = PeggedDocument['docType']
const DOC_TYPES: { key: DocType; label: string }[] = [
  { key: 'PR', label: 'Purchase request' },
  { key: 'PO', label: 'Purchase order' },
  { key: 'Expense', label: 'Expense' },
  { key: 'Timesheet', label: 'Timesheet' },
]
const docType = ref<DocType>((['PR', 'PO', 'Expense', 'Timesheet'].includes(String(route.query.type)) ? route.query.type : 'PO') as DocType)
const vendor = ref('')
// Draft projects stay pickable so a purchase request can be prepared early — it saves as a draft
// and commits nothing until approval (Story 7). Firm documents to a Draft project are refused.
const nodes = computed(() => peggableNodes({ includeDraft: true }).map(n => (getProject(n.projectId)?.status === 'draft' ? { ...n, label: `${n.label} (${t('Draft — purchase request only')})` } : n)))
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
const docTypeOptions = computed(() => DOC_TYPES.map(d => ({ id: `nd-type-${d.key}`, label: t(d.label), value: d.key })))
const accountSelectOptions = computed(() => accountOptions.value.map(a => ({ value: a.code, label: t(a.name) })))
const nodeOptions = computed(() => nodes.value.map(n => ({ value: n.id, label: n.label })))
const nodePlaceholder = computed(() => (peg.value.state === 'none' || filled.value.length === 0 ? t('No project (ordinary expense)') : t('Required — pick a project node')))
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
function removeLine(i: number) {
  if (lines.value.length === 1) { lines.value[0] = { description: '', account: docType.value === 'Timesheet' ? LABOUR_ACCOUNT : '5-50300', amount: '', wpId: '' }; return }
  lines.value.splice(i, 1)
}
function save() {
  touched.value = true
  const res = saveDocument({ docType: docType.value, vendor: vendor.value || undefined, lines: filled.value, overrideReason: reason.value }, asActor.value)
  const okMsg = res.ok && 'doc' in res && res.doc ? `${res.doc.docNo} — ${badgeProps('doc', res.doc.status, t).label}` : undefined
  if (action.run(res, okMsg)) {
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
const VERDICT = computed(() => ({
  within: { status: 'within', type: 'completed', label: t('Within budget') },
  override: { status: 'override', type: 'warning', label: t('Over — override with reason') },
  escalate: { status: 'escalate', type: 'critical', label: t('Over threshold — Finance sign-off') },
  no_budget: { status: 'no_budget', type: 'announcement', label: t('Budget not set') },
  none: { status: 'none', type: 'announcement', label: '' },
}[verdict.value]))
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('New document')" :breadcrumb="presetProject ? { label: `${presetProject.code} · ${presetProject.name}`, to: `/projects/${presetProject.id}` } : undefined" />
    <div class="pm-stage">
      <div class="pm-stack pm-gap-4">
        <div class="pm-card pm-stack pm-gap-4">
          <MpFormControl id="nd-type-fc">
            <MpFormLabel>{{ t('Document type') }}</MpFormLabel>
            <MpSegmentedControl id="nd-type" name="nd-type" v-model="docType" :data="docTypeOptions" />
          </MpFormControl>
          <div class="pm-grid-2">
            <MpFormControl v-if="docType !== 'Timesheet'" id="nd-v-fc">
              <MpFormLabel>{{ t('Vendor') }}</MpFormLabel>
              <MpInput id="nd-v" v-model="vendor" />
              <MpFormHelpText>{{ t('Optional for a request') }}</MpFormHelpText>
            </MpFormControl>
            <div>
              <div class="pm-stat-label">{{ t('Budget check policy') }}</div>
              <div class="pm-body pm-mt-2">{{ mode === 'off' ? t('Off for this document type') : t('Warn + override with reason (company policy, phase 1)') }}</div>
            </div>
          </div>
          <p v-if="docType === 'Timesheet'" class="pm-caption pm-m-0">{{ t('Timesheets record non-production labour only. Production labour is recorded through a work order and absorbed into Cost of production.') }}</p>
        </div>

        <!-- Pegging state -->
        <MpBanner v-if="filled.length && peg.state === 'partial'" id="nd-partial" variant="danger">
          <MpBannerIcon />
          <MpBannerTitle>{{ peg.untagged }} {{ t('of') }} {{ filled.length }} {{ t('lines have no project') }}</MpBannerTitle>
          <MpBannerDescription>
            {{ t('If any line names a project, every line must. A partly tagged document can’t be saved — it’s the “forgot” pattern, and it looks exactly like deliberate non-project cost.') }}
            <span class="pm-row pm-gap-4 pm-mt-2">
              <MpTextlink v-if="firstNode" id="nd-tag-all" as="a" @click.prevent="tagAllWith(firstNode)">{{ t('Tag untagged lines with') }} {{ nodeLabel(firstNode) }}</MpTextlink>
              <MpTextlink id="nd-untag-all" as="a" @click.prevent="untagAll">{{ t('Remove project from all lines') }}</MpTextlink>
            </span>
          </MpBannerDescription>
        </MpBanner>
        <MpBanner v-else-if="filled.length && peg.state === 'none'" id="nd-ordinary" variant="info">
          <MpBannerIcon /><MpBannerDescription>{{ t('No line names a project — this saves as an ordinary expense and consumes no project budget.') }}</MpBannerDescription>
        </MpBanner>

        <!-- Lines -->
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead>
              <tr>
                <th class="pm-th-wide">{{ t('Description') }}</th>
                <th class="pm-th-mid">{{ t('Account') }}</th>
                <th class="pm-th-wide" data-devchange="pm-draft-project-documents">{{ t('Project') }}</th>
                <th class="pm-th-mid">{{ t('Dimensions') }}</th>
                <th class="pm-num pm-th-mid">{{ t('Amount') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, i) in lines" :key="i">
                <td><MpInput :id="`nd-desc-${i}`" v-model="l.description" :aria-label="t('Description')" /></td>
                <td><ErpFilterSelect :id="`nd-acc-${i}`" v-model="l.account" :placeholder="t('Account')" :options="accountSelectOptions" :is-clearable="false" width="200px" /></td>
                <td><ErpFilterSelect :id="`nd-node-${i}`" v-model="l.wpId" :placeholder="nodePlaceholder" :options="nodeOptions" width="320px" /></td>
                <td class="pm-wrap">
                  <span v-if="l.wpId" class="pm-row pm-gap-1">
                    <MpTag v-for="(v, key) in getProject(getWorkPackage(l.wpId)!.projectId)!.dimensions" :id="`nd-dim-${i}-${key}`" :key="key">{{ v }}</MpTag>
                  </span>
                  <span v-else class="pm-muted pm-small">—</span>
                </td>
                <td class="pm-num"><MpInput :id="`nd-amt-${i}`" v-model="l.amount" inputmode="numeric" :aria-label="t('Amount')" @blur="l.amount = parseAmount(l.amount) ? parseAmount(l.amount).toLocaleString('id-ID') : ''" /></td>
                <td>
                  <MpButton :id="`nd-remove-${i}`" variant="ghost" is-rounded :aria-label="t('Remove line')" @click="removeLine(i)" left-icon="minus-circular" />
                </td>
              </tr>
            </tbody>
            <tfoot><tr><td colspan="4"><MpButton id="nd-add-line" variant="ghost" is-rounded left-icon="add" @click="addLine">{{ t('Line') }}</MpButton></td><td class="pm-num">{{ rp(total) }}</td><td /></tr></tfoot>
          </table>
        </div>
        <p class="pm-caption pm-m-0">{{ t('One document can split across several projects. Dimensions default from each project and are reporting-only.') }}</p>

        <!-- Budget check -->
        <div v-if="checks.length" class="pm-card pm-stack">
          <div class="pm-row">
            <h3 class="pm-h3">{{ t('Budget check') }}</h3>
            <ErpStatusBadge :status="VERDICT.status" :type="VERDICT.type" :label="VERDICT.label" />
          </div>
          <div v-for="c in checks" :key="c.wpId">
            <div class="pm-small pm-strong pm-mb-2">{{ nodeLabel(c.wpId) }} · {{ t('this document') }} {{ rp(c.result.requested) }} · {{ t('threshold') }} {{ pct(c.result.threshold) }}</div>
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
            <div v-if="c.result.worst" class="pm-mt-2">
              <MpTextlink :id="`nd-add-budget-${c.wpId}`" as="a" @click.prevent="router.push(budgetLink(c.wpId, c.result.worst.overBy))">{{ t('Add budget in Budget setup') }}</MpTextlink>
            </div>
          </div>
          <MpFormControl v-if="verdict === 'override' || verdict === 'escalate'" id="nd-reason-fc" is-required :is-invalid="touched && !reason.trim()">
            <MpFormLabel>{{ t('Reason for exceeding the budget') }}</MpFormLabel>
            <MpTextarea id="nd-reason" v-model="reason" />
            <MpFormErrorMessage>{{ t('A reason is required.') }}</MpFormErrorMessage>
            <MpFormHelpText>{{ verdict === 'escalate' ? t('Above the threshold, the document is held for Finance sign-off. You’ll see it as held; Finance sees it in the Approvals inbox.') : t('At or under the threshold, your override is recorded with this reason. No overrun goes unrecorded.') }}</MpFormHelpText>
          </MpFormControl>
        </div>

        <PmActionError id="nd-error" :error="action.error.value" />
        <div class="pm-footer">
          <MpButton id="nd-cancel" variant="ghost" is-rounded @click="router.back()">{{ t('Cancel') }}</MpButton>
          <MpButton id="nd-save" variant="primary" is-rounded @click="save">{{ verdict === 'escalate' ? t('Save and send to Finance') : t('Save') }}</MpButton>
        </div>

        <!-- Recent -->
        <section class="pm-section">
          <h2 class="pm-h2 pm-mb-3">{{ t('Recent documents') }}</h2>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Date') }}</th><th>{{ t('Lines') }}</th><th class="pm-num">{{ t('Amount') }}</th><th>{{ t('Status') }}</th></tr></thead>
              <tbody>
                <tr v-for="d in peggedDocuments.slice(0, 12)" :key="d.id">
                  <td>{{ d.docNo }}<span class="pm-cell-sub">{{ d.vendor ?? d.createdBy }}</span></td>
                  <td>{{ formatDate(d.date) }}</td>
                  <td class="pm-wrap">
                    <div v-for="(l, i) in d.lines.slice(0, 3)" :key="i" class="pm-small">{{ l.description }} · {{ t(accountName(l.account)) }} · {{ l.wpId ? nodeLabel(l.wpId) : t('no project') }}</div>
                    <div v-if="d.lines.length > 3" class="pm-caption">+{{ d.lines.length - 3 }}</div>
                  </td>
                  <td class="pm-num">{{ rp(d.lines.reduce((s, l) => s + l.amount, 0)) }}</td>
                  <td>
                    <ErpStatusBadge v-bind="badgeProps('doc', d.status, t)" />
                    <span v-if="d.override" class="pm-cell-sub">{{ t('Over by') }} {{ rp(d.override.overBy) }} ({{ pct(d.override.overPct) }})</span>
                  </td>
                </tr>
                <tr v-if="!peggedDocuments.length"><td colspan="5"><div class="pm-empty-inline">{{ t('No documents yet.') }}</div></td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
