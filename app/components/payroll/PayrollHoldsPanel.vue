<script setup lang="ts">
/**
 * Holds on a run, in the check order the engine runs them (LR-5), each with its
 * fix inline (OD-03, OD-04, TN-01, TN-02, TN-08, LR-10). Saved mappings and tags
 * re-check every held run at once, so a fix usually clears the hold by itself;
 * "Release run" re-checks the whole run on demand.
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  payroll, can, runById, runHolds, rupiah, accountLabel, payrollAccount, mappingFor, suggestMapping, setPayItemMapping,
  mapGroup, createPayrollTag, acceptFieldValue, setCostCenterCategory, setFieldPolicy, confirmSource, sourceSummary,
  chooseRevision, chooseSeparateRun, decidePartial, releaseRun, releaseWithGap, releaseTaxHold, totalGaps, versionOf,
  tagsLabel, PAY_ROLES, type Hold, type PayRole, type Tags,
} from '~/data/payrollStore'
import { FALLBACK_TAG, type PaySection, type TagDimension, type PayableParty } from '~/data/payrollMaster'
import { hrMessage } from '~/data/payrollUiIntake'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()
const router = useRouter()

const run = computed(() => runById(props.runId))
const holds = computed(() => (run.value ? runHolds(run.value) : []))
const periodText = computed(() => (run.value ? `${run.value.start} to ${run.value.end}` : ''))

const TITLES: Record<string, string> = {
  'confirm-source': 'Confirm the source', choice: 'Revision or separate run', partial: 'Looks partial',
  'duplicate-employee': 'Duplicate employee rows', 'unmapped-item': 'Pay items with no account', 'unmapped-group': 'Groups with no dimension',
  'new-field-value': 'New values in rule fields', 'empty-field': 'Empty grouping fields', 'total-gap': "Lines differ from Talenta's totals",
  'hutang-gaji': 'Salaries payable differs from take-home pay', 'two-parties': 'Two parties on one payable', rounding: 'Rounding over the limit',
  'tax-rule': 'PPh 21 differs from the tax rule', 'negative-payable': 'Payable below Rp0', 'archived-account': 'Archived account',
}
const SETTINGS_FIX = ['hutang-gaji', 'two-parties', 'negative-payable', 'archived-account', 'rounding']

// ── Shared ────────────────────────────────────────────────────────────────
const accountOptions = computed(() => payroll.accounts.filter((a) => !a.archived).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })))
const roleOptions = PAY_ROLES.map((r) => ({ value: r, label: r }))
function copyHr(ids: string[]) {
  navigator.clipboard?.writeText(hrMessage(ids, periodText.value)).catch(() => {})
  successToast(t('Message for HR copied'))
}
const released = ref('')
function release() {
  const r = releaseRun(props.runId)
  if (r.ok) successToast(t('Run released. Draft built'))
  else infoToast(t(`Still held: ${r.message ?? ''}`))
}

// ── Unmapped pay items ────────────────────────────────────────────────────
interface ItemForm { role: string; debit: string; credit: string; reason: string; error: string; needsOverride: string[] }
const itemForms = reactive<Record<string, ItemForm>>({})
function itemForm(it: { key: string; name: string; section: PaySection }): ItemForm {
  if (!itemForms[it.key]) {
    const m = mappingFor(it.name, it.section)
    const s = suggestMapping(it.name, it.section)
    itemForms[it.key] = { role: m?.role ?? s?.role ?? '', debit: m?.debit ?? s?.debit ?? '', credit: m?.credit ?? s?.credit ?? '', reason: '', error: '', needsOverride: [] }
  }
  return itemForms[it.key]!
}
const STAFF_ROLES: PayRole[] = ['Earning', 'THR', 'Severance', 'Reimbursement']
function saveItem(it: { key: string; name: string; section: PaySection }) {
  const f = itemForm(it)
  if (!f.role || !f.debit || !f.credit) { f.error = 'Pick a role, a debit account and a credit account.'; return }
  const sugg = suggestMapping(it.name, it.section)
  const party: PayableParty | null = STAFF_ROLES.includes(f.role as PayRole) ? 'Staff' : (sugg?.party ?? mappingFor(it.name, it.section)?.party ?? null)
  const r = setPayItemMapping(it.key, { role: f.role as PayRole, debit: f.debit, credit: f.credit, party }, f.reason || undefined)
  if (!r.ok) {
    f.error = r.message ?? ''
    f.needsOverride = (r.needsOverride as string[] | undefined) ?? []
    return
  }
  f.error = ''; f.needsOverride = []
  successToast(t(`${it.name} mapped`))
}

// ── Groups ────────────────────────────────────────────────────────────────
const groupPick = reactive<Record<string, string>>({})
const groupError = reactive<Record<string, string>>({})
const dimOf = (field: string): TagDimension => (field === 'branch_name' ? 'Branch' : 'Organization')
function tagOptions(field: string, value: string) {
  const dim = dimOf(field)
  const opts = payroll.tags.filter((tg) => tg.dimension === dim && tg.name !== FALLBACK_TAG).map((tg) => ({ value: tg.name, label: tg.name }))
  if (can('settings.edit') && !opts.some((o) => o.value === value)) opts.push({ value: `new:${value}`, label: `${t('Create dimension value')} "${value}"` })
  return opts
}
function saveGroup(g: { field: string; value: string }) {
  const k = `${g.field}|${g.value}`
  let tag = groupPick[k] ?? ''
  if (!tag) { groupError[k] = 'Pick a dimension value.'; return }
  if (tag.startsWith('new:')) {
    tag = tag.slice(4)
    const c = createPayrollTag(dimOf(g.field), tag)
    if (!c.ok) { groupError[k] = c.message ?? ''; return }
  }
  const r = mapGroup(dimOf(g.field), g.value, tag, { fromHold: true })
  if (!r.ok) { groupError[k] = r.message ?? ''; return }
  groupError[k] = ''
  successToast(t(`${g.value} mapped to ${tag}`))
}

// ── New field values ──────────────────────────────────────────────────────
const ccPick = reactive<Record<string, string>>({})
function acceptValue(v: { field: string; value: string }) {
  const r = v.field === 'cost_center_name'
    ? setCostCenterCategory(v.value, (ccPick[v.value] || 'In-direct') as 'Direct' | 'In-direct')
    : acceptFieldValue(v.field, v.value)
  if (r.ok) successToast(t(`${v.value} accepted`))
  else infoToast(t(r.message ?? ''))
}
function skipEmpty(field: string) {
  const r = setFieldPolicy(field as 'organization_name' | 'branch_name' | 'cost_center_name', 'skip')
  if (r.ok) successToast(t('Empty values are skipped from now on'))
}

// ── Source, choice, partial ───────────────────────────────────────────────
const summary = computed(() => sourceSummary(props.runId))
function doConfirmSource() {
  const r = confirmSource()
  if (r.ok) successToast(t('Source confirmed'))
  else infoToast(t(r.message ?? ''))
}
function versionInState(state: string) { return run.value?.versions.find((v) => v.state === state) }
const sep = reactive({ open: false, type: 'THR', name: '', reason: '', error: '' })
function pickRevision() {
  const v = versionInState('waiting-choice')
  if (!v) return
  const r = chooseRevision(props.runId, v.no)
  if (r.ok) successToast(t(r.partial ? `v${v.no} looks partial` : `v${v.no} is a revision of the posted run`))
  else infoToast(t(r.message ?? ''))
}
function saveSeparate() {
  const v = versionInState('waiting-choice')
  if (!v) return
  const r = chooseSeparateRun(props.runId, v.no, { type: sep.type as 'THR' | 'Bonus' | 'Off-cycle', name: sep.name, reason: sep.reason })
  if (!r.ok) { sep.error = r.message ?? ''; return }
  sep.open = false
  successToast(t('Separate run saved'))
  if (r.runId) router.push(`/payroll-runs/${r.runId as string}`)
}
const partial = reactive({ reason: '', error: '' })
function decide(decision: 'replace' | 'reject') {
  const v = versionInState('partial')
  if (!v) return
  const r = decidePartial(props.runId, v.no, decision, partial.reason || undefined)
  if (!r.ok) { partial.error = r.message ?? ''; return }
  partial.error = ''
  successToast(t(decision === 'replace' ? `v${v.no} replaces the full run` : `v${v.no} rejected`))
}

// ── Total gap ─────────────────────────────────────────────────────────────
const gaps = computed(() => (run.value ? totalGaps(props.runId) : null))
const gapByGroup = computed(() => {
  const m = new Map<string, { group: string; section: string; amount: number; staff: number; known: boolean }>()
  for (const r of gaps.value?.rows ?? []) {
    const k = `${r.group}|${r.section}|${r.known}`
    const x = m.get(k) ?? { group: r.group, section: r.section, amount: 0, staff: 0, known: r.known }
    x.amount += Math.abs(r.cents) / 100; x.staff++; m.set(k, x)
  }
  return [...m.values()].map((x) => ({ ...x, amount: Math.round(x.amount) }))
})
const gapForm = reactive({ target: 'suspense', reason: '', attachment: '', error: '' })
const gapTargets = computed(() => [
  { value: 'suspense', label: `${t('Payroll suspense')} (${accountLabel(payroll.settings.suspenseAccount)})` },
  ...payroll.accounts.filter((a) => a.type === 'liability' && a.party && a.party !== 'Staff' && a.code !== payroll.settings.suspenseAccount && !a.archived)
    .map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })),
])
const canGap = computed(() => can('gap.release') || payroll.viewAs === 'Jurnal Owner')
function releaseGap() {
  const r = releaseWithGap(props.runId, { target: gapForm.target, reason: gapForm.reason, attachment: gapForm.attachment })
  if (!r.ok) { gapForm.error = r.message ?? ''; return }
  gapForm.error = ''
  successToast(t('Released with gap'))
}

// ── Tax rule ──────────────────────────────────────────────────────────────
const tax = reactive({ reason: '', error: '' })
function releaseTax() {
  const r = releaseTaxHold(props.runId, tax.reason)
  if (!r.ok) { tax.error = r.message ?? ''; return }
  tax.error = ''
  successToast(t('Tax hold released'))
}

const safeId = (k: string) => k.replace(/[^a-zA-Z0-9-]/g, '-')
const d = (h: Hold) => h.details as Record<string, any>
const tagsOf = (x: unknown) => tagsLabel(x as Tags)
const latestPosted = computed(() => (run.value ? versionOf(run.value, run.value.ledgerVersion) : undefined))
</script>

<template>
  <div v-if="run && holds.length" class="ph" data-tour="payroll-holds">
    <div class="ph__head">
      <div>
        <div class="ph__title">{{ t('Holds') }} ({{ holds.length }})</div>
        <div class="ph__sub">{{ t('Nothing posts until every hold is fixed. Checks run in this order.') }}</div>
      </div>
      <MpButton v-if="can('run.release')" variant="secondary" is-rounded @click="release">{{ t('Release run') }}</MpButton>
    </div>

    <div v-for="(h, i) in holds" :key="`${h.code}-${i}`" class="ph__hold" :data-hold="h.code">
      <div class="ph__holdhead">
        <MpIcon name="warning-circular" size="sm" class="ph__icon" />
        <div class="ph__holdtext">
          <div class="ph__holdtitle">{{ i + 1 }}. {{ t(TITLES[h.code] ?? h.code) }}</div>
          <div class="ph__msg">{{ h.message }}</div>
        </div>
      </div>

      <!-- Confirm source (TS-01, first send) -->
      <div v-if="h.code === 'confirm-source'" class="ph__fix">
        <dl v-if="summary" class="ph__facts">
          <div><dt>{{ t('Organizations') }}</dt><dd>{{ summary.organizations.join(', ') }}</dd></div>
          <div><dt>{{ t('Branches') }}</dt><dd>{{ summary.branches.join(', ') }}</dd></div>
          <div><dt>{{ t('Headcount') }}</dt><dd>{{ summary.headcount }}</dd></div>
          <div><dt>{{ t('Take-home pay') }}</dt><dd>{{ rupiah(summary.takeHome) }}</dd></div>
        </dl>
        <MpButton v-if="can('source.confirm')" is-rounded @click="doConfirmSource">{{ t('Confirm source') }}</MpButton>
        <p v-else class="ph__hint">{{ t('Waiting for the Jurnal Owner to confirm the source.') }}</p>
      </div>

      <!-- Revision or separate run (TN-02) -->
      <div v-else-if="h.code === 'choice'" class="ph__fix">
        <p class="ph__hint">{{ t('Staff of the posted run in this send') }}: {{ d(h).overlapPct }}%<template v-if="latestPosted"> · {{ t('posted') }} v{{ latestPosted.no }}</template></p>
        <div v-if="can('run.choose')" class="ph__row">
          <MpButton is-rounded @click="pickRevision">{{ t('Revision of the posted run') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="sep.open = !sep.open">{{ t('Separate run') }}</MpButton>
        </div>
        <p v-else class="ph__hint">{{ t('Waiting for the Accountant to choose.') }}</p>
        <div v-if="sep.open && can('run.choose')" class="ph__form">
          <div class="ph__field">
            <label class="ph__label" for="ph-sep-type">{{ t('Run type') }}</label>
            <ErpFilterSelect id="ph-sep-type" v-model="sep.type" :placeholder="t('Run type')" :options="['THR', 'Bonus', 'Off-cycle']" :is-clearable="false" width="200px" />
          </div>
          <div class="ph__field">
            <label class="ph__label" for="ph-sep-name">{{ t('Name, unique in the period') }}</label>
            <MpInput id="ph-sep-name" v-model="sep.name" />
          </div>
          <div class="ph__field">
            <label class="ph__label" for="ph-sep-reason">{{ t('Reason') }}</label>
            <MpInput id="ph-sep-reason" v-model="sep.reason" :is-invalid="!!sep.error" />
            <p v-if="sep.error" class="ph__error">{{ t(sep.error) }}</p>
          </div>
          <div class="ph__row">
            <MpButton variant="ghost" is-rounded @click="sep.open = false">{{ t('Cancel') }}</MpButton>
            <MpButton is-rounded @click="saveSeparate">{{ t('Save as separate run') }}</MpButton>
          </div>
        </div>
      </div>

      <!-- Partial send (TN-01) -->
      <div v-else-if="h.code === 'partial'" class="ph__fix">
        <dl class="ph__facts">
          <div><dt>{{ t('Staff') }}</dt><dd>{{ d(h).after }} {{ t('of') }} {{ d(h).before }}</dd></div>
          <div><dt>{{ t('Take-home pay') }}</dt><dd>{{ rupiah(d(h).thpAfter) }} {{ t('of') }} {{ rupiah(d(h).thpBefore) }}</dd></div>
          <div v-if="d(h).missing?.length"><dt>{{ t('Missing groups') }}</dt><dd>{{ d(h).missing.join(', ') }}</dd></div>
        </dl>
        <template v-if="can('run.partial')">
          <div class="ph__field">
            <label class="ph__label" for="ph-partial-reason">{{ t('Reason') }}</label>
            <MpInput id="ph-partial-reason" v-model="partial.reason" :is-invalid="!!partial.error" />
            <p v-if="partial.error" class="ph__error">{{ t(partial.error) }}</p>
          </div>
          <div class="ph__row">
            <MpButton is-rounded @click="decide('replace')">{{ t('Replace the full run') }}</MpButton>
            <MpButton variant="secondary" is-rounded @click="decide('reject')">{{ t('Reject') }}</MpButton>
          </div>
        </template>
        <p v-else class="ph__hint">{{ t('Waiting for the Accountant to decide.') }}</p>
      </div>

      <!-- Duplicate employee rows (TN-26) -->
      <div v-else-if="h.code === 'duplicate-employee'" class="ph__fix">
        <p class="ph__hint">{{ t('HR re-sends the run without the repeated rows.') }}</p>
        <MpButton variant="secondary" is-rounded @click="copyHr(d(h).ids)">{{ t('Copy message for HR') }}</MpButton>
      </div>

      <!-- Unmapped pay items (OD-03) -->
      <div v-else-if="h.code === 'unmapped-item'" class="ph__fix">
        <table class="ph__table">
          <thead>
            <tr>
              <th class="ph__th">{{ t('Pay item') }}</th>
              <th class="ph__th ph__th--num">{{ t('Amount') }}</th>
              <th class="ph__th ph__th--num">{{ t('Staff') }}</th>
              <th v-if="can('settings.edit')" class="ph__th">{{ t('Role') }}</th>
              <th v-if="can('settings.edit')" class="ph__th">{{ t('Debit') }}</th>
              <th v-if="can('settings.edit')" class="ph__th">{{ t('Credit') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="it in d(h).items" :key="it.key">
              <tr>
                <td class="ph__td">
                  <div class="ph__strong">{{ it.name }}</div>
                  <div class="ph__muted">{{ t(it.section) }} · {{ t(it.reason) }}</div>
                </td>
                <td class="ph__td ph__td--num">{{ rupiah(it.amount) }}</td>
                <td class="ph__td ph__td--num">{{ it.employees }}</td>
                <template v-if="can('settings.edit')">
                  <td class="ph__td"><ErpFilterSelect :id="`ph-role-${safeId(it.key)}`" v-model="itemForm(it).role" :placeholder="t('Role')" :options="roleOptions" width="180px" /></td>
                  <td class="ph__td"><ErpFilterSelect :id="`ph-dr-${safeId(it.key)}`" v-model="itemForm(it).debit" :placeholder="t('Account')" :options="accountOptions" width="220px" /></td>
                  <td class="ph__td"><ErpFilterSelect :id="`ph-cr-${safeId(it.key)}`" v-model="itemForm(it).credit" :placeholder="t('Account')" :options="accountOptions" width="220px" /></td>
                </template>
              </tr>
              <tr v-if="can('settings.edit')">
                <td class="ph__td ph__td--sub" colspan="6">
                  <div v-if="itemForm(it).needsOverride.length" class="ph__field">
                    <label class="ph__label" :for="`ph-ovr-${safeId(it.key)}`">{{ t('Override reason') }}</label>
                    <div class="ph__muted">{{ itemForm(it).needsOverride.join(' ') }}</div>
                    <MpInput :id="`ph-ovr-${safeId(it.key)}`" v-model="itemForm(it).reason" />
                  </div>
                  <div class="ph__row ph__row--end">
                    <p v-if="itemForm(it).error" class="ph__error">{{ t(itemForm(it).error) }}</p>
                    <MpButton is-rounded @click="saveItem(it)">{{ t('Save mapping') }}</MpButton>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <p v-if="!can('settings.edit')" class="ph__hint">{{ t('The Accountant maps these items.') }}</p>
      </div>

      <!-- Groups with no dimension (OD-08, TN-13: never the fallback dimension value from here) -->
      <div v-else-if="h.code === 'unmapped-group'" class="ph__fix">
        <div v-for="g in d(h).groups" :key="`${g.field}|${g.value}`" class="ph__line">
          <div class="ph__linetext">
            <span class="ph__strong">{{ g.value }}</span>
            <span class="ph__muted"> · {{ t(dimOf(g.field)) }} · {{ g.staff }} {{ t('employees') }}</span>
          </div>
          <template v-if="can('run.release')">
            <ErpFilterSelect :id="`ph-tag-${safeId(g.field + '-' + g.value)}`" v-model="groupPick[`${g.field}|${g.value}`]" :placeholder="t('Dimension value')" :options="tagOptions(g.field, g.value)" width="220px" />
            <MpButton variant="secondary" is-rounded @click="saveGroup(g)">{{ t('Map group') }}</MpButton>
          </template>
          <p v-if="groupError[`${g.field}|${g.value}`]" class="ph__error">{{ t(groupError[`${g.field}|${g.value}`]!) }}</p>
        </div>
      </div>

      <!-- New values in fields the rules read -->
      <div v-else-if="h.code === 'new-field-value'" class="ph__fix">
        <div v-for="v in d(h).values" :key="`${v.field}|${v.value}`" class="ph__line">
          <div class="ph__linetext">
            <span class="ph__strong">{{ v.value }}</span>
            <span class="ph__muted"> · {{ v.field }} · {{ v.staff }} {{ t('employees') }}</span>
          </div>
          <template v-if="v.field === 'cost_center_name' ? can('settings.edit') : can('run.release')">
            <ErpFilterSelect v-if="v.field === 'cost_center_name'" :id="`ph-cc-${safeId(v.value)}`" v-model="ccPick[v.value]" :placeholder="t('Category')" :options="['Direct', 'In-direct']" width="160px" />
            <MpButton variant="secondary" is-rounded @click="acceptValue(v)">{{ t('Accept value') }}</MpButton>
          </template>
        </div>
      </div>

      <!-- Empty grouping fields -->
      <div v-else-if="h.code === 'empty-field'" class="ph__fix">
        <div v-for="(n, field) in d(h).fields" :key="field" class="ph__line">
          <div class="ph__linetext"><span class="ph__strong">{{ field }}</span><span class="ph__muted"> · {{ n }} {{ t('employees') }}</span></div>
          <MpButton v-if="can('fieldPolicy.edit')" variant="secondary" is-rounded @click="skipEmpty(String(field))">{{ t('Skip empty values') }}</MpButton>
        </div>
        <p class="ph__hint">{{ t('HR fills the field in Talenta and re-sends, or the Finance Manager sets empty values to skip.') }}</p>
      </div>

      <!-- Total check (OD-04, TN-08) -->
      <div v-else-if="h.code === 'total-gap' && gaps" class="ph__fix">
        <dl class="ph__facts">
          <div v-for="(amt, sec) in d(h).bySection" :key="sec"><dt>{{ t(`${sec}s`) }}</dt><dd>{{ rupiah(Number(amt)) }}</dd></div>
          <div v-if="gaps.knownTotal"><dt>{{ t('Matches known gap') }}</dt><dd>{{ rupiah(gaps.knownTotal / 100) }}</dd></div>
          <div v-if="gaps.knownTotal"><dt>{{ t('New gap') }}</dt><dd>{{ rupiah(gaps.newTotal / 100) }}</dd></div>
        </dl>
        <table class="ph__table">
          <thead>
            <tr>
              <th class="ph__th">{{ t('Group') }}</th>
              <th class="ph__th">{{ t('Section') }}</th>
              <th class="ph__th ph__th--num">{{ t('Staff') }}</th>
              <th class="ph__th ph__th--num">{{ t('Gap') }}</th>
              <th class="ph__th">{{ t('Kind') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in gapByGroup" :key="`${g.group}${g.section}${g.known}`">
              <td class="ph__td">{{ g.group }}</td>
              <td class="ph__td">{{ t(g.section) }}</td>
              <td class="ph__td ph__td--num">{{ g.staff }}</td>
              <td class="ph__td ph__td--num">{{ rupiah(g.amount) }}</td>
              <td class="ph__td">{{ g.known ? t('Matches known gap') : t('New gap') }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="can('payByEmployee.view')" class="ph__hint">
          {{ t('By employee') }}: {{ gaps.rows.map((r) => `${r.employee_id} ${rupiah(r.cents / 100)}`).join(', ') }}
        </p>
        <div class="ph__row">
          <MpButton variant="secondary" is-rounded @click="copyHr([...new Set(gaps.rows.filter((r) => !r.known).map((r) => r.employee_id))])">{{ t('Copy message for HR') }}</MpButton>
        </div>
        <div v-if="canGap" class="ph__form">
          <div class="ph__formtitle">{{ t('Release with gap') }}</div>
          <div class="ph__field">
            <label class="ph__label" for="ph-gap-target">{{ t('Post the gap to') }}</label>
            <ErpFilterSelect id="ph-gap-target" v-model="gapForm.target" :placeholder="t('Account')" :options="gapTargets" :is-clearable="false" width="100%" />
          </div>
          <div class="ph__field">
            <label class="ph__label" for="ph-gap-reason">{{ t('Reason') }}</label>
            <MpInput id="ph-gap-reason" v-model="gapForm.reason" />
          </div>
          <div class="ph__field">
            <label class="ph__label" for="ph-gap-att">{{ t("HR's confirmation (file or email reference)") }}</label>
            <MpInput id="ph-gap-att" v-model="gapForm.attachment" :is-invalid="!!gapForm.error" />
            <p v-if="gapForm.error" class="ph__error">{{ t(gapForm.error) }}</p>
          </div>
          <div class="ph__row"><MpButton is-rounded @click="releaseGap">{{ t('Release with gap') }}</MpButton></div>
        </div>
        <p v-else class="ph__hint">{{ t('Ask HR to correct the totals, or the Finance Manager releases with gap.') }}</p>
      </div>

      <!-- One PPh 21 rule (LR-10) -->
      <div v-else-if="h.code === 'tax-rule'" class="ph__fix">
        <dl class="ph__facts">
          <div><dt>{{ t('PPh 21 lines') }}</dt><dd>{{ rupiah(d(h).ledger) }}</dd></div>
          <div><dt>{{ t('PPh 21 rule') }}</dt><dd>{{ rupiah(d(h).expected) }}</dd></div>
          <div><dt>{{ t('Difference') }}</dt><dd>{{ rupiah(Math.abs(d(h).ledger - d(h).expected)) }}</dd></div>
        </dl>
        <template v-if="can('tax.release')">
          <div class="ph__field">
            <label class="ph__label" for="ph-tax-reason">{{ t('Reason') }}</label>
            <MpInput id="ph-tax-reason" v-model="tax.reason" :is-invalid="!!tax.error" />
            <p v-if="tax.error" class="ph__error">{{ t(tax.error) }}</p>
          </div>
          <div class="ph__row"><MpButton is-rounded @click="releaseTax">{{ t('Release tax hold') }}</MpButton></div>
        </template>
        <p v-else class="ph__hint">{{ t('Tax Staff or the Finance Manager releases this hold with a reason.') }}</p>
      </div>

      <!-- Build checks fixed in settings -->
      <div v-else-if="SETTINGS_FIX.includes(h.code)" class="ph__fix">
        <table v-if="h.code === 'rounding' && d(h).top" class="ph__table">
          <thead><tr><th class="ph__th">{{ t('Largest lines') }}</th><th class="ph__th ph__th--num">{{ t('Amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="(l, li) in d(h).top" :key="li">
              <td class="ph__td">{{ accountLabel(l.account) }}<span v-if="tagsOf(l.tags)" class="ph__muted"> | {{ tagsOf(l.tags) }}</span></td>
              <td class="ph__td ph__td--num">{{ rupiah(l.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="h.code === 'archived-account' && payrollAccount(d(h).account)" class="ph__hint">{{ accountLabel(d(h).account) }}</p>
        <MpButton variant="secondary" is-rounded @click="router.push('/payroll-settings')">{{ t('Open payroll settings') }}</MpButton>
      </div>
    </div>
    <span v-if="released" class="ph__muted">{{ released }}</span>
  </div>
</template>

<style scoped>
.ph { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); margin-bottom: var(--mp-spacing-5); }
.ph__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.ph__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ph__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ph__hold { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ph__hold:last-child { border-bottom: 0; }
.ph__holdhead { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.ph__icon { color: var(--mp-text-danger); flex: none; margin-top: var(--mp-spacing-0\.5); }
.ph__holdtext { min-width: 0; }
.ph__holdtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ph__msg { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); overflow-wrap: anywhere; }
.ph__fix { margin: var(--mp-spacing-3) 0 0 var(--mp-spacing-8); display: flex; flex-direction: column; gap: var(--mp-spacing-3); align-items: flex-start; }
.ph__facts { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-6); margin: 0; }
.ph__facts dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ph__facts dd { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ph__row { display: flex; gap: var(--mp-spacing-2); align-items: center; flex-wrap: wrap; }
.ph__row--end { justify-content: flex-end; width: 100%; }
.ph__form { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: 100%; max-width: 520px; padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.ph__formtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ph__field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); width: 100%; }
.ph__label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ph__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; overflow-wrap: anywhere; }
.ph__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; }
.ph__muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ph__strong { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ph__line { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.ph__linetext { min-width: 240px; }
.ph__table { width: 100%; border-collapse: collapse; }
.ph__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
}
.ph__th--num, .ph__td--num { text-align: right; font-variant-numeric: tabular-nums; }
.ph__td { padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; }
.ph__td--sub { border-bottom: 1px solid var(--mp-border-default); }
</style>
