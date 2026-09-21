<script setup lang="ts">
/**
 * Project settings (PRD §5, D2, D6). Company-level budget-check policy per
 * document type — phase 1 behaves as warn + override; "block" is stored so it
 * can be switched on later without migration. The escalation threshold is
 * company-wide with a per-project override. Pegging is mandatory: no
 * Enforced/Optional setting exists. Also hosts the prototype's open-question
 * switches (OQ6, OQ10) and a demo-data reset.
 */
import PmTitleBar from '../PmTitleBar.vue'
import PmOverlay from '../PmOverlay.vue'
import { projects } from '~/data/projects'
import { projectPolicy, type PeggedDocType, type PolicyMode } from '~/data/projectPolicy'
import { setCompanyPolicy, setProjectThreshold } from '~/data/projectActions'
import { pct } from '~/utils/projectFormat'
import { toast } from '@mekari/pixel3'

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
const thresholdNum = computed(() => Number(draft.threshold))
const thresholdError = computed(() => (Number.isNaN(thresholdNum.value) || thresholdNum.value < 5 || thresholdNum.value > 50 ? t('Enter a threshold between 5% and 50%.') : ''))
function saveCompany() {
  if (thresholdError.value) return
  setCompanyPolicy({ companyThresholdPct: thresholdNum.value, docPolicies: draft.docPolicies, qtyPocOption: draft.qtyPocOption, reservationIssuePolicy: draft.reservationIssuePolicy }, asActor.value)
  toast.notify({ variant: 'success', title: t('Policy saved') })
}

const projDraft = reactive<Record<string, string>>(Object.fromEntries(projects.map(p => [p.id, p.escalationThresholdPct !== undefined ? String(p.escalationThresholdPct) : ''])))
function saveProject(id: string) {
  const raw = projDraft[id]?.trim() ?? ''
  const v = raw === '' ? undefined : Number(raw)
  if (v !== undefined && (Number.isNaN(v) || v < 5 || v > 50)) { toast.notify({ variant: 'error', title: t('Enter a threshold between 5% and 50%, or leave it empty for the company default.') }); return }
  const p = projects.find(x => x.id === id)!
  if (p.escalationThresholdPct === v) return
  setProjectThreshold(id, v, asActor.value)
  toast.notify({ variant: 'success', title: `${p.code}: ${v === undefined ? t('uses the company threshold') : pct(v)}` })
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
    <PmTitleBar :title="t('Project settings')" :subtitle="t('Company-level rules for every project. Only Finance / Controller can change them.')" />
    <div class="pm-stage">
      <div class="pm-stack" style="gap: 20px; max-width: 960px">
        <div v-if="!isFinance" class="pm-banner pm-banner--neutral"><div class="pm-banner-body">{{ t('Read-only — switch “View as” to Finance / Controller to change policy.') }}</div></div>

        <div class="pm-banner pm-banner--info">
          <div class="pm-banner-body">
            <div class="pm-banner-title">{{ t('Pegging is mandatory') }}</div>
            {{ t('There’s no Enforced/Optional setting. If any line on a document names a project, every line must; a document with no project on any line is an ordinary expense.') }}
          </div>
        </div>

        <section class="pm-card">
          <h2 class="pm-h3">{{ t('Budget check policy') }}</h2>
          <p class="pm-desc" style="margin-bottom: 12px">{{ t('Phase 1 ships warn + override with a mandatory reason for every document type. “Block” is stored now so hard block can be switched on later without migration — until then it behaves as warn.') }}</p>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Document type') }}</th><th>{{ t('Policy') }}</th><th>{{ t('Behaves as (phase 1)') }}</th></tr></thead>
              <tbody>
                <tr v-for="d in DOCS" :key="d.key">
                  <td>{{ t(d.label) }}</td>
                  <td>
                    <select v-model="draft.docPolicies[d.key]" class="pm-select pm-input--sm" style="width: 220px" :disabled="!isFinance">
                      <option value="block">{{ t('Block (stored for later)') }}</option>
                      <option value="warn">{{ t('Warn + override') }}</option>
                      <option value="off">{{ t('Off') }}</option>
                    </select>
                  </td>
                  <td>{{ draft.docPolicies[d.key] === 'off' ? t('No check') : t('Warn + override with reason') }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pm-grid-2" style="margin-top: 16px">
            <div class="pm-field">
              <label class="pm-label" for="ps-th">{{ t('Escalation threshold (company)') }}</label>
              <div class="pm-input-group" style="max-width: 160px"><input id="ps-th" v-model="draft.threshold" class="pm-input pm-input--num" inputmode="decimal" :disabled="!isFinance" :aria-invalid="!!thresholdError" /><span class="pm-addon">%</span></div>
              <span v-if="thresholdError" class="pm-error">{{ thresholdError }}</span>
              <span v-else class="pm-help">{{ t('At or under it the PM overrides with a reason; above it Finance must sign off. 5–50%.') }}</span>
            </div>
            <div class="pm-field">
              <span class="pm-label">{{ t('Issuing stock reserved to another project') }}</span>
              <div class="pm-seg">
                <button type="button" :disabled="!isFinance" :class="{ 'pm-seg--active': draft.reservationIssuePolicy === 'warn' }" @click="draft.reservationIssuePolicy = 'warn'">{{ t('Warn') }}</button>
                <button type="button" :disabled="!isFinance" :class="{ 'pm-seg--active': draft.reservationIssuePolicy === 'block' }" @click="draft.reservationIssuePolicy = 'block'">{{ t('Block') }}</button>
              </div>
              <span class="pm-help">{{ t('Open question 10 — whether enforcement at material issue is mandatory. Prototype switch.') }}</span>
            </div>
            <div class="pm-field">
              <span class="pm-label">{{ t('Unit-measured Output × service work package') }}</span>
              <div class="pm-seg">
                <button type="button" :disabled="!isFinance" :class="{ 'pm-seg--active': draft.qtyPocOption === 'A' }" @click="draft.qtyPocOption = 'A'">{{ t('A — all planned units count') }}</button>
                <button type="button" :disabled="!isFinance" :class="{ 'pm-seg--active': draft.qtyPocOption === 'B' }" @click="draft.qtyPocOption = 'B'">{{ t('B — production only') }}</button>
              </div>
              <span class="pm-help">{{ t('Open question 6. Under B, service cost still flows to WIP. Default A.') }}</span>
            </div>
          </div>
          <div class="pm-form-footer"><button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!isFinance" @click="saveCompany">{{ t('Save policy') }}</button></div>
        </section>

        <section class="pm-card">
          <h2 class="pm-h3">{{ t('Escalation threshold per project') }}</h2>
          <p class="pm-desc" style="margin-bottom: 12px">{{ t('Overrides the company threshold for one project. The policy itself can’t be overridden per project.') }}</p>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Project') }}</th><th>{{ t('Threshold') }}</th><th>{{ t('Effective') }}</th></tr></thead>
              <tbody>
                <tr v-for="p in projects.filter(x => x.status !== 'closed')" :key="p.id">
                  <td>{{ p.code }} · {{ p.name }}</td>
                  <td>
                    <div class="pm-input-group" style="width: 150px">
                      <input v-model="projDraft[p.id]" class="pm-input pm-input--sm pm-input--num" inputmode="decimal" :placeholder="t('Default')" :disabled="!isFinance" @blur="saveProject(p.id)" @keydown.enter="saveProject(p.id)" />
                      <span class="pm-addon">%</span>
                    </div>
                  </td>
                  <td>{{ pct(p.escalationThresholdPct ?? projectPolicy.companyThresholdPct) }}<span v-if="p.escalationThresholdPct === undefined" class="pm-cell-sub">{{ t('company default') }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="pm-card">
          <h2 class="pm-h3">{{ t('Prototype data') }}</h2>
          <p class="pm-desc" style="margin-bottom: 12px">{{ t('Everything you do in the Projects module is saved in this browser. Reset to return to the IPB seed data.') }}</p>
          <button class="btn-enterprise btn-enterprise--danger" type="button" @click="resetOpen = true">{{ t('Reset Projects demo data') }}</button>
        </section>
      </div>
    </div>
    <PmOverlay :open="resetOpen" variant="modal" :title="t('Reset demo data?')" @close="resetOpen = false">
      <p class="pm-desc" style="margin: 0">{{ t('All projects, documents, approvals and audit entries return to the seed. This can’t be undone.') }}</p>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="resetOpen = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--danger" type="button" @click="resetDemo">{{ t('Reset') }}</button>
      </template>
    </PmOverlay>
  </div>
</template>
