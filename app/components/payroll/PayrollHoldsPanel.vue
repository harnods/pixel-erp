<script setup lang="ts">
/**
 * "To fix before posting": each item with its fix inline. A send stops only for a pay item with
 * no account, an account the journal can't use, a partial send, the same-run-or-separate choice,
 * or the first send's company check. Staff in a group nobody set up no longer stop the run: their
 * cost posts to the Everyone else account and shows as a 'no-group' warning (PayrollRunWarnings). A group with no
 * value for an added dimension doesn't stop it either: 'no-dimension-value' warning. Every save re-checks held runs, so a fix
 * usually clears the item by itself; "Check again" re-checks the run on demand.
 */
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  payroll, can, runById, runHolds, rupiah, accountLabel, payrollAccount, mappingFor, suggestMapping, setPayItemAccount,
  useChartAccount, payItemType, isCostItem, confirmSource, sourceSummary,
  chooseRevision, chooseSeparateRun, decidePartial, releaseRun, versionOf,
  type Hold,
} from '~/data/payrollStore'
import type { PaySection } from '~/data/payrollMaster'
import { accountChoices, type AccountOption, FOLLOW_GROUPS, setCostAccount } from '~/data/payrollUiSettings'
import { successToast, infoToast } from '~/utils/toasts'
import { sectionLabel } from '~/data/payrollUiRunCopy'
import PayrollReadOnlyNote from '~/components/payroll/PayrollReadOnlyNote.vue'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()
const router = useRouter()

const run = computed(() => runById(props.runId))
const holds = computed(() => (run.value ? runHolds(run.value) : []))

const TITLES: Record<string, string> = {
  'confirm-source': 'Confirm this is your company', choice: 'Talenta sent this period again', partial: 'Looks like part of the run',
  'unmapped-item': 'Pay items with no account',
  'two-parties': 'Two parties on one payable account', 'archived-account': 'Account is archived',
}
const SETTINGS_FIX = ['two-parties', 'archived-account']

// ── Shared ────────────────────────────────────────────────────────────────
const accountOptions = computed(() => payroll.accounts.filter((a) => !a.archived).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })))
function release() {
  const r = releaseRun(props.runId)
  if (r.ok) successToast(t('All fixed. The draft journal is built.'))
  else infoToast(t(r.message ?? 'Some items still need a fix.'))
}

// ── Unmapped pay items ────────────────────────────────────────────────────
// Same one-account pick as Settings > Pay items: the type comes from Talenta. A cost item starts on
// "Use group account" (each staff's group account, else Everyone else), so one Save clears
// the hold; it can be pinned to one account instead. A deduction or tax item credits its account.
interface ItemForm { account: string; error: string }
const itemForms = reactive<Record<string, ItemForm>>({})
function itemForm(it: { key: string; name: string; section: PaySection }): ItemForm {
  if (!itemForms[it.key]) {
    const m = mappingFor(it.name, it.section)
    const s = suggestMapping(it.name, it.section)
    const cost = isCost(it)
    itemForms[it.key] = { account: cost ? FOLLOW_GROUPS : (m?.credit ?? s?.credit) ?? '', error: '' }
  }
  return itemForms[it.key]!
}
/** True for an allowance (not tax) or a benefit: its cost follows the groups unless pinned. */
function isCost(it: { name: string; section: PaySection }): boolean {
  const m = mappingFor(it.name, it.section)
  if (m) return isCostItem(m)
  return it.section !== 'deduction' && suggestMapping(it.name, it.section)?.role !== 'Tax'
}
const costOptions = computed(() => [
  { value: FOLLOW_GROUPS, label: t('Use group account'), name: '', type: 'expense' as const },
  ...accountChoices(['expense', 'cogs']).map((o) => ({ ...o, group: t('Use default account') })),
])
const balanceOptions = computed(() => accountChoices(['liability', 'asset']))
const liabilityOptions = computed(() => accountChoices(['liability']))
function optionsFor(it: { name: string; section: PaySection }): AccountOption[] {
  const m = mappingFor(it.name, it.section)
  if (isCost(it)) return costOptions.value
  return m && payItemType(m) === 'tax' ? liabilityOptions.value : balanceOptions.value
}
function saveItem(it: { key: string; name: string; section: PaySection }) {
  const f = itemForm(it)
  if (!f.account) { f.error = 'Pick an account, then save.'; return }
  const follow = f.account === FOLLOW_GROUPS
  const o = optionsFor(it).find((x) => x.value === f.account)
  if (o && !follow && !payrollAccount(o.value)) useChartAccount({ code: o.value, name: o.name, type: o.type })
  const r = isCost(it) ? setCostAccount(it.key, follow ? null : f.account) : setPayItemAccount(it.key, f.account)
  if (!r.ok) { f.error = r.message ?? 'Not saved. Pick another account.'; return }
  f.error = ''
  successToast(t(follow ? `${it.name} now posts to each group's expense account` : `${it.name} now posts to ${accountLabel(f.account)}`))
}

// ── Source, choice, partial ───────────────────────────────────────────────
const summary = computed(() => sourceSummary(props.runId))
function doConfirmSource() {
  const r = confirmSource()
  if (r.ok) successToast(t('Company confirmed'))
  else infoToast(t(r.message ?? 'Not confirmed. Try again.'))
}
function versionInState(state: string) { return run.value?.versions.find((v) => v.state === state) }
const sep = reactive({ open: false, type: 'THR', name: '', reason: '', error: '' })
function pickRevision() {
  const v = versionInState('waiting-choice')
  if (!v) return
  const r = chooseRevision(props.runId, v.no)
  if (r.ok) successToast(t(r.partial ? `v${v.no} looks like part of the run` : `v${v.no} saved as a new version of this run`))
  else infoToast(t(r.message ?? 'Not saved. Try again.'))
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

const safeId = (k: string) => k.replace(/[^a-zA-Z0-9-]/g, '-')
const d = (h: Hold) => h.details as Record<string, any>
const latestPosted = computed(() => (run.value ? versionOf(run.value, run.value.ledgerVersion) : undefined))
</script>

<template>
  <div v-if="run && holds.length" class="ph" data-tour="payroll-holds">
    <div class="ph__head">
      <div>
        <div class="ph__title">{{ t('To fix before posting') }} ({{ holds.length }})</div>
        <div class="ph__sub">{{ t('Jurnal builds the journal once these are fixed.') }}</div>
      </div>
      <MpButton variant="secondary" is-rounded @click="release">{{ t('Check again') }}</MpButton>
    </div>

    <div v-for="(h, i) in holds" :key="`${h.code}-${i}`" class="ph__hold" :data-hold="h.code">
      <div class="ph__holdhead">
        <MpIcon name="warning-circular" size="sm" class="ph__icon" />
        <div class="ph__holdtext">
          <div class="ph__holdtitle">{{ i + 1 }}. {{ t(TITLES[h.code] ?? h.code) }}</div>
          <div class="ph__msg">{{ h.message }}</div>
        </div>
      </div>

      <!-- Confirm source (first send) -->
      <div v-if="h.code === 'confirm-source'" class="ph__fix">
        <dl v-if="summary" class="ph__facts">
          <div><dt>{{ t('Organizations') }}</dt><dd>{{ summary.organizations.join(', ') }}</dd></div>
          <div><dt>{{ t('Branches') }}</dt><dd>{{ summary.branches.join(', ') }}</dd></div>
          <div v-if="can('headcount')"><dt>{{ t('Headcount') }}</dt><dd>{{ summary.headcount }}</dd></div>
          <div><dt>{{ t('Take-home pay') }}</dt><dd>{{ rupiah(summary.takeHome) }}</dd></div>
        </dl>
        <MpButton v-if="can('connection')" is-rounded @click="doConfirmSource">{{ t('Confirm company') }}</MpButton>
        <PayrollReadOnlyNote v-else :text="t('Waiting for the Owner or a user with LM to confirm the company.')" />
      </div>

      <!-- Same run again or separate run -->
      <div v-else-if="h.code === 'choice'" class="ph__fix">
        <p class="ph__hint">{{ t('Staff also in the posted run') }}: {{ d(h).overlapPct }}%<template v-if="latestPosted"> · {{ t('posted') }} v{{ latestPosted.no }}</template></p>
        <div class="ph__row">
          <MpButton is-rounded @click="pickRevision">{{ t('Use as a new version') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="sep.open = !sep.open">{{ t('Make a separate run') }}</MpButton>
        </div>
        <div v-if="sep.open" class="ph__form">
          <div class="ph__field">
            <label class="ph__label" for="ph-sep-type">{{ t('Run type') }}</label>
            <ErpFilterSelect id="ph-sep-type" v-model="sep.type" :placeholder="t('Run type')" :options="['THR', 'Bonus', 'Off-cycle']" :is-clearable="false" width="200px" />
          </div>
          <div class="ph__field">
            <label class="ph__label" for="ph-sep-name">{{ t('Name') }}</label>
            <MpInput id="ph-sep-name" v-model="sep.name" />
          </div>
          <div class="ph__field">
            <label class="ph__label" for="ph-sep-reason">{{ t('Reason') }}</label>
            <MpInput id="ph-sep-reason" v-model="sep.reason" :is-invalid="!!sep.error" />
            <p v-if="sep.error" class="ph__error">{{ t(sep.error) }}</p>
          </div>
          <div class="ph__row">
            <MpButton variant="ghost" is-rounded @click="sep.open = false">{{ t('Cancel') }}</MpButton>
            <MpButton is-rounded @click="saveSeparate">{{ t('Save separate run') }}</MpButton>
          </div>
        </div>
      </div>

      <!-- Partial send -->
      <div v-else-if="h.code === 'partial'" class="ph__fix">
        <dl class="ph__facts">
          <div><dt>{{ t('Staff') }}</dt><dd>{{ d(h).after }} {{ t('of') }} {{ d(h).before }}</dd></div>
          <div><dt>{{ t('Take-home pay') }}</dt><dd>{{ rupiah(d(h).thpAfter) }} {{ t('of') }} {{ rupiah(d(h).thpBefore) }}</dd></div>
          <div v-if="d(h).missing?.length"><dt>{{ t('Missing groups') }}</dt><dd>{{ d(h).missing.join('; ') }}</dd></div>
        </dl>
        <div class="ph__field">
          <label class="ph__label" for="ph-partial-reason">{{ t('Reason') }}</label>
          <MpInput id="ph-partial-reason" v-model="partial.reason" :is-invalid="!!partial.error" />
          <p v-if="partial.error" class="ph__error">{{ t(partial.error) }}</p>
        </div>
        <div class="ph__row">
          <MpButton is-rounded @click="decide('replace')">{{ t('Use it as the full run') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="decide('reject')">{{ t('Reject') }}</MpButton>
        </div>
      </div>

      <!-- Unmapped pay items -->
      <div v-else-if="h.code === 'unmapped-item'" class="ph__fix">
        <table class="ph__table">
          <!-- Type and accounts sit in the form row under each item: as three columns beside the
               figures they cut their own values short at 1280. -->
          <colgroup><col><col style="width: 180px"><col style="width: 96px"></colgroup>
          <thead>
            <tr>
              <th class="ph__th">{{ t('Pay item') }}</th>
              <th class="ph__th ph__th--num">{{ t('Amount') }}</th>
              <th class="ph__th ph__th--num">{{ t('Staff') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="it in d(h).items" :key="it.key">
              <tr>
                <td class="ph__td">
                  <div class="ph__strong">{{ it.name }}</div>
                  <div class="ph__muted">{{ t(sectionLabel(it.section)) }}</div>
                </td>
                <td class="ph__td ph__td--num">{{ rupiah(it.amount) }}</td>
                <td class="ph__td ph__td--num">{{ it.employees }}</td>
              </tr>
              <tr>
                <td class="ph__td ph__td--sub" colspan="3">
                  <div class="ph__grid ph__grid--one">
                    <div class="ph__field">
                      <label class="ph__label" :for="`ph-acct-${safeId(it.key)}`">{{ t('Account') }}</label>
                      <ErpFilterSelect :id="`ph-acct-${safeId(it.key)}`" v-model="itemForm(it).account" :placeholder="t('Select account')" :options="optionsFor(it)" width="100%" />
                    </div>
                  </div>
                  <div class="ph__row ph__row--end">
                    <p v-if="itemForm(it).error" class="ph__error">{{ t(itemForm(it).error) }}</p>
                    <MpButton is-rounded @click="saveItem(it)">{{ t('Save account') }}</MpButton>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <MpButton variant="secondary" is-rounded @click="router.push({ path: '/payroll-settings', query: { section: 'pay-items' } })">{{ t('Open pay items') }}</MpButton>
      </div>

      <!-- Build checks fixed in settings -->
      <div v-else-if="SETTINGS_FIX.includes(h.code)" class="ph__fix">
        <p v-if="h.code === 'archived-account' && payrollAccount(d(h).account)" class="ph__hint">{{ accountLabel(d(h).account) }}</p>
        <MpButton variant="secondary" is-rounded @click="router.push({ path: '/payroll-settings', query: { section: 'pay-items' } })">{{ t('Open pay items') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ph { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); }
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
.ph__table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ph__table :deep(.efs) { display: block; width: 100%; min-width: 0; }
.ph__table :deep(.efs-trigger) { width: 100%; }
.ph__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ph__th.ph__th--num, .ph__td--num { text-align: right; font-variant-numeric: tabular-nums; }
.ph__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
.ph__grid :deep(.efs) { display: block; width: 100%; min-width: 0; }
.ph__grid--one { grid-template-columns: minmax(0, 420px); }
.ph__td { padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; }
.ph__td--sub { border-bottom: 1px solid var(--mp-border-default); }
</style>
