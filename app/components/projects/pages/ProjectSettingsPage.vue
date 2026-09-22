<script setup lang="ts">
/**
 * Project settings (PRD §5, D2, D6). Company-level budget-check policy per
 * document type — phase 1 behaves as warn + override; "block" is stored so it
 * can be switched on later without migration. The escalation threshold is
 * company-wide with a per-project override. Pegging is mandatory: no
 * Enforced/Optional setting exists. Also hosts the prototype's open-question
 * switches (OQ6, OQ10) and a demo-data reset.
 */
import {
  MpButton, MpInput, MpInputGroup, MpInputRightAddon, MpSegmentedControl, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { projects } from '~/data/projects'
import { projectPolicy, type PeggedDocType, type PolicyMode } from '~/data/projectPolicy'
import { setCompanyPolicy, setProjectThreshold } from '~/data/projectActions'
import { pct } from '~/utils/projectFormat'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const { isFinance, asActor } = useProjectRole()

const DOCS: { key: PeggedDocType; label: string }[] = [
  { key: 'PR', label: 'Purchase request' },
  { key: 'PO', label: 'Purchase order' },
  { key: 'WO', label: 'Work order' },
  { key: 'Expense', label: 'Expense' },
  { key: 'Timesheet', label: 'Timesheet' },
]
const draft = reactive({
  docPolicies: { ...projectPolicy.docPolicies } as Record<PeggedDocType, PolicyMode>,
  threshold: String(projectPolicy.companyThresholdPct),
  qtyPocOption: projectPolicy.qtyPocOption,
  reservationIssuePolicy: projectPolicy.reservationIssuePolicy,
})
const companyAction = useProjectAction()
const projectAction = useProjectAction()
const financeOnly = computed(() => t('Only Finance / Controller can change policy. Switch “View as” to Finance / Controller.'))
const policyOptions = computed(() => [
  { value: 'block', label: t('Block (stored for later)') },
  { value: 'warn', label: t('Warn + override') },
  { value: 'off', label: t('Off') },
])
const issueOptions = computed(() => [
  { id: 'ps-issue-warn', label: t('Warn'), value: 'warn' },
  { id: 'ps-issue-block', label: t('Block'), value: 'block' },
])
const qtyOptions = computed(() => [
  { id: 'ps-qty-a', label: t('A — all planned units count'), value: 'A' },
  { id: 'ps-qty-b', label: t('B — production only'), value: 'B' },
])
const thresholdNum = computed(() => Number(draft.threshold))
const thresholdError = computed(() => (Number.isNaN(thresholdNum.value) || thresholdNum.value < 5 || thresholdNum.value > 50 ? t('Enter a threshold between 5% and 50%.') : ''))
function saveCompany() {
  if (!isFinance.value) { companyAction.fail(financeOnly.value); return }
  if (thresholdError.value) return
  companyAction.clear()
  setCompanyPolicy({ companyThresholdPct: thresholdNum.value, docPolicies: draft.docPolicies, qtyPocOption: draft.qtyPocOption, reservationIssuePolicy: draft.reservationIssuePolicy }, asActor.value)
  successToast(t('Policy saved'))
}

const projDraft = reactive<Record<string, string>>(Object.fromEntries(projects.map(p => [p.id, p.escalationThresholdPct !== undefined ? String(p.escalationThresholdPct) : ''])))
function saveProject(id: string) {
  const raw = projDraft[id]?.trim() ?? ''
  const v = raw === '' ? undefined : Number(raw)
  const p = projects.find(x => x.id === id)!
  if (p.escalationThresholdPct === v) return
  if (!isFinance.value) { projectAction.fail(financeOnly.value); projDraft[id] = p.escalationThresholdPct !== undefined ? String(p.escalationThresholdPct) : ''; return }
  if (v !== undefined && (Number.isNaN(v) || v < 5 || v > 50)) { projectAction.fail(`${p.code}: ${t('Enter a threshold between 5% and 50%, or leave it empty for the company default.')}`); return }
  projectAction.clear()
  setProjectThreshold(id, v, asActor.value)
  successToast(`${p.code}: ${v === undefined ? t('uses the company threshold') : pct(v)}`)
}

const resetOpen = ref(false)
function resetDemo() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('erp-db:pm-')).forEach(k => localStorage.removeItem(k))
  } catch { /* storage blocked */ }
  window.location.reload()
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Project settings')" />
    <div class="pm-stage">
      <div class="pm-stack pm-gap-5 pm-narrow">
        <MpBanner v-if="!isFinance" id="ps-readonly" variant="info">
          <MpBannerIcon /><MpBannerDescription>{{ t('Read-only — switch “View as” to Finance / Controller to change policy.') }}</MpBannerDescription>
        </MpBanner>

        <MpBanner id="ps-pegging" variant="info">
          <MpBannerIcon />
          <MpBannerTitle>{{ t('Pegging is mandatory') }}</MpBannerTitle>
          <MpBannerDescription>{{ t('There’s no Enforced/Optional setting. If any line on a document names a project, every line must; a document with no project on any line is an ordinary expense.') }}</MpBannerDescription>
        </MpBanner>

        <section class="pm-card pm-stack">
          <h2 class="pm-h3">{{ t('Budget check policy') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Phase 1 ships warn + override with a mandatory reason for every document type. “Block” is stored now so hard block can be switched on later without migration — until then it behaves as warn.') }}</p>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Document type') }}</th><th>{{ t('Policy') }}</th><th>{{ t('Behaves as (phase 1)') }}</th></tr></thead>
              <tbody>
                <tr v-for="d in DOCS" :key="d.key">
                  <td>{{ t(d.label) }}</td>
                  <td>
                    <ErpFilterSelect :id="`ps-policy-${d.key}`" :model-value="draft.docPolicies[d.key]" :placeholder="t('Policy')" :options="policyOptions" :is-clearable="false" width="220px" @update:model-value="(v: string) => (draft.docPolicies[d.key] = v as PolicyMode)" />
                  </td>
                  <td>{{ draft.docPolicies[d.key] === 'off' ? t('No check') : t('Warn + override with reason') }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pm-grid-2">
            <MpFormControl id="ps-th-fc" :is-invalid="!!thresholdError">
              <MpFormLabel>{{ t('Escalation threshold (company)') }}</MpFormLabel>
              <MpInputGroup id="ps-th-group" class="pm-maxw-short">
                <MpInput id="ps-th" v-model="draft.threshold" inputmode="decimal" />
                <MpInputRightAddon has-background>%</MpInputRightAddon>
              </MpInputGroup>
              <MpFormErrorMessage>{{ thresholdError }}</MpFormErrorMessage>
              <MpFormHelpText v-if="!thresholdError">{{ t('At or under it the PM overrides with a reason; above it Finance must sign off. 5–50%.') }}</MpFormHelpText>
            </MpFormControl>
            <MpFormControl id="ps-issue-fc">
              <MpFormLabel>{{ t('Issuing stock reserved to another project') }}</MpFormLabel>
              <MpSegmentedControl id="ps-issue" name="ps-issue" v-model="draft.reservationIssuePolicy" :data="issueOptions" />
              <MpFormHelpText>{{ t('Open question 10 — whether enforcement at material issue is mandatory. Prototype switch.') }}</MpFormHelpText>
            </MpFormControl>
            <MpFormControl id="ps-qty-fc">
              <MpFormLabel>{{ t('Unit-measured Output × service work package') }}</MpFormLabel>
              <MpSegmentedControl id="ps-qty" name="ps-qty" v-model="draft.qtyPocOption" :data="qtyOptions" />
              <MpFormHelpText>{{ t('Open question 6. Under B, service cost still flows to WIP. Default A.') }}</MpFormHelpText>
            </MpFormControl>
          </div>
          <PmActionError id="ps-company-error" :error="companyAction.error.value" />
          <div class="pm-footer">
            <MpButton id="ps-save" variant="primary" is-rounded @click="saveCompany">{{ t('Save policy') }}</MpButton>
          </div>
        </section>

        <section class="pm-card pm-stack">
          <h2 class="pm-h3">{{ t('Escalation threshold per project') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Overrides the company threshold for one project. The policy itself can’t be overridden per project. Leave empty to use the company default.') }}</p>
          <PmActionError id="ps-project-error" :error="projectAction.error.value" />
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Project') }}</th><th>{{ t('Threshold') }}</th><th>{{ t('Effective') }}</th></tr></thead>
              <tbody>
                <tr v-for="p in projects.filter(x => x.status !== 'closed')" :key="p.id">
                  <td>{{ p.code }} · {{ p.name }}</td>
                  <td>
                    <MpInputGroup :id="`ps-proj-group-${p.id}`" class="pm-w-field">
                      <MpInput :id="`ps-proj-${p.id}`" v-model="projDraft[p.id]" inputmode="decimal" :aria-label="`${t('Threshold')} ${p.code}`" @blur="saveProject(p.id)" @keydown.enter="saveProject(p.id)" />
                      <MpInputRightAddon has-background>%</MpInputRightAddon>
                    </MpInputGroup>
                  </td>
                  <td>{{ pct(p.escalationThresholdPct ?? projectPolicy.companyThresholdPct) }}<span v-if="p.escalationThresholdPct === undefined" class="pm-cell-sub">{{ t('company default') }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="pm-card pm-stack">
          <h2 class="pm-h3">{{ t('Prototype data') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Everything you do in the Projects module is saved in this browser. Reset to return to the IPB seed data.') }}</p>
          <div><MpButton id="ps-reset" variant="secondary" is-rounded @click="resetOpen = true">{{ t('Reset Projects demo data') }}</MpButton></div>
        </section>
      </div>
    </div>
    <PmOverlay id="ps-reset-modal" :open="resetOpen" variant="modal" :title="t('Reset demo data?')" @close="resetOpen = false">
      <p class="pm-body pm-m-0">{{ t('All projects, documents, approvals and audit entries return to the seed. This can’t be undone.') }}</p>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="resetOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="danger" is-rounded @click="resetDemo">{{ t('Reset') }}</MpButton>
      </template>
    </PmOverlay>
  </div>
</template>
