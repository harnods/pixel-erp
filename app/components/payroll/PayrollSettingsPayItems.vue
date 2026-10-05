<script setup lang="ts">
/**
 * Pay items (TS-02, OD-05, OD-06): one row per pay item matched on name and
 * section, with its role, debit and credit, Jurnal's suggestion, the last-run
 * amount and a preview of the posting. Guardrail blocks stop a save; other
 * breaches save with an override reason of 20 to 500 characters.
 */
import { computed, reactive, ref } from 'vue'
import { MpButton, MpInput, MpTextarea } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollSettingsDrawer from '~/components/payroll/PayrollSettingsDrawer.vue'
import { successToast, infoToast } from '~/utils/toasts'
import {
  payroll, can, suggestMapping, validateMapping, setPayItemMapping, addPayItem, confirmAllSuggestions, replaceAccount,
  accountLabel, accountName, rupiah, wib, PAY_ROLES, type PayItemMapping, type PayRole,
} from '~/data/payrollStore'
import { PAYABLE_PARTIES, type PayableParty, type PaySection } from '~/data/payrollMaster'
import { lastRunFigures, isCostAccount } from '~/data/payrollUiSettings'

const emit = defineEmits<{ (e: 'go', key: 'accounts'): void }>()
const { t } = useLocale()

const SECTION_LABEL: Record<PaySection, string> = { allowance: 'Allowance', deduction: 'Deduction', benefit: 'Benefit' }
const BULK_SKIP: PayRole[] = ['Loan', 'Reimbursement', 'THR', 'Severance', 'Advance offset', 'Tax']
const figures = computed(() => lastRunFigures())

type RowState = 'Mapped' | 'Override' | 'Needs a role' | 'No account'
function stateOf(m: PayItemMapping): RowState {
  if (!m.role || !m.roleConfirmed) return 'Needs a role'
  if (!m.debit || !m.credit) return 'No account'
  return m.override ? 'Override' : 'Mapped'
}
const STATE_TYPE: Record<RowState, 'completed' | 'warning' | 'critical' | 'information'> = { Mapped: 'completed', Override: 'information', 'Needs a role': 'critical', 'No account': 'critical' }

const sectionFilter = ref('all')
const stateFilter = ref('all')
const sectionOptions = [{ value: 'all', label: 'All sections' }, ...(['allowance', 'deduction', 'benefit'] as PaySection[]).map((x) => ({ value: x, label: SECTION_LABEL[x] }))]
const stateOptions = [{ value: 'all', label: 'All states' }, { value: 'open', label: 'Needs a decision' }, { value: 'mapped', label: 'Mapped' }, { value: 'override', label: 'Override' }]
const SECTION_ORDER: PaySection[] = ['allowance', 'deduction', 'benefit']
const rows = computed(() => payroll.settings.mapping
  .filter((m) => sectionFilter.value === 'all' || m.section === sectionFilter.value)
  .filter((m) => {
    const st = stateOf(m)
    if (stateFilter.value === 'open') return st === 'Needs a role' || st === 'No account'
    if (stateFilter.value === 'mapped') return st === 'Mapped'
    if (stateFilter.value === 'override') return st === 'Override'
    return true
  })
  .slice().sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.name.localeCompare(b.name)))
const openCount = computed(() => payroll.settings.mapping.filter((m) => { const st = stateOf(m); return st === 'Needs a role' || st === 'No account' }).length)
const filtered = computed(() => sectionFilter.value !== 'all' || stateFilter.value !== 'all')

/** Suggestion chip for a row that still needs a decision; never over a mapped row. */
function suggestionFor(m: PayItemMapping) {
  if (stateOf(m) === 'Mapped' || stateOf(m) === 'Override') return null
  return suggestMapping(m.name, m.section)
}
const rowErrors = reactive<Record<string, string>>({})
function accept(m: PayItemMapping) {
  const s = suggestMapping(m.name, m.section)
  if (!s) return
  const r = setPayItemMapping(m.key, s)
  if (!r.ok) { rowErrors[m.key] = t(r.message ?? ''); return }
  rowErrors[m.key] = ''
  successToast(t(`${m.name} mapped`))
}
function onConfirmAll() {
  const r = confirmAllSuggestions()
  if (!r.ok) { infoToast(t(r.message ?? '')); return }
  successToast(t(`${r.mapped} pay item${r.mapped === 1 ? '' : 's'} mapped. ${r.skipped} left for you to decide.`))
}

// ── Edit drawer ──
const editKey = ref<string | null>(null)
const editRow = computed(() => payroll.settings.mapping.find((m) => m.key === editKey.value) ?? null)
const ed = reactive({ role: '', debit: '', credit: '', party: 'none', accrue: 'no', reason: '' })
const edError = ref('')
function openEdit(m: PayItemMapping) {
  editKey.value = m.key
  Object.assign(ed, { role: m.role ?? '', debit: m.debit ?? '', credit: m.credit ?? '', party: m.party ?? 'none', accrue: m.accrue ? 'yes' : 'no', reason: m.override?.reason ?? '' })
  edError.value = ''
}
function useSuggestion() {
  const m = editRow.value
  const s = m && suggestMapping(m.name, m.section)
  if (!s) return
  Object.assign(ed, { role: s.role ?? '', debit: s.debit ?? '', credit: s.credit ?? '', party: s.party ?? 'none' })
}
const roleOptions = PAY_ROLES.map((r) => ({ value: r, label: r }))
const accountOptions = computed(() => payroll.accounts.filter((a) => !a.archived && a.type !== 'cash').map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })))
const partyOptions = [{ value: 'none', label: 'No party' }, ...PAYABLE_PARTIES.map((p) => ({ value: p, label: p }))]
const draftRow = computed(() => editRow.value && ({
  ...editRow.value,
  role: (ed.role || null) as PayRole | null, debit: ed.debit || null, credit: ed.credit || null,
  party: ed.party === 'none' ? null : (ed.party as PayableParty),
}))
const check = computed(() => (draftRow.value ? validateMapping(draftRow.value) : { blocks: [], overridable: [] }))
const asksAccrual = computed(() => ed.role === 'THR' || ed.role === 'Severance')
/** Posting preview with the last-run amount (FG1-AC6). */
const preview = computed(() => {
  const m = editRow.value
  if (!m || !ed.debit || !ed.credit) return null
  const f = figures.value[m.key]
  const amount = f?.amount ?? 0
  const hg = payroll.settings.hutangGaji
  return {
    amount, staff: f?.staff ?? 0, runLabel: f?.runLabel ?? null,
    lines: [{ side: 'Dr', account: ed.debit, amount }, { side: 'Cr', account: ed.credit, amount }],
    hutangGajiUntouched: ed.debit !== hg && ed.credit !== hg,
    hg,
  }
})
function save() {
  const m = editRow.value
  if (!m) return
  if (!ed.role) { edError.value = t('Pick a role.'); return }
  if (!ed.debit || !ed.credit) { edError.value = t('Pick a debit and a credit account.'); return }
  const patch = { role: ed.role as PayRole, debit: ed.debit, credit: ed.credit, party: ed.party === 'none' ? null : (ed.party as PayableParty), ...(asksAccrual.value ? { accrue: ed.accrue === 'yes' } : {}) }
  const r = setPayItemMapping(m.key, patch, check.value.overridable.length ? ed.reason : undefined)
  if (!r.ok) { edError.value = t(r.message ?? ''); return }
  editKey.value = null
  successToast(t(check.value.overridable.length ? `${m.name} saved with an override` : `${m.name} saved`))
}

// ── New pay item ──
const addOpen = ref(false)
const add = reactive({ name: '', section: 'allowance' as PaySection })
const addError = ref('')
const sectionPick = (['allowance', 'deduction', 'benefit'] as PaySection[]).map((x) => ({ value: x, label: SECTION_LABEL[x] }))
function onAdd() {
  const r = addPayItem(add.name, add.section)
  if (!r.ok) { addError.value = t(r.message ?? ''); return }
  addOpen.value = false
  const row = payroll.settings.mapping.find((m) => m.key === r.key)
  successToast(t(`${add.name.trim()} added. Set its role and accounts.`))
  if (row) openEdit(row)
}

// ── Replace account ──
const replOpen = ref(false)
const repl = reactive({ from: '', to: '' })
const replError = ref('')
const usedAccounts = computed(() => [...new Set(payroll.settings.mapping.flatMap((m) => [m.debit, m.credit]).filter((x): x is string => !!x))].sort().map((c) => ({ value: c, label: accountLabel(c) })))
const replRows = computed(() => payroll.settings.mapping.filter((m) => repl.from && (m.debit === repl.from || m.credit === repl.from)).length)
function onReplace() {
  if (!repl.from || !repl.to) { replError.value = t('Pick both accounts.'); return }
  if (repl.from === repl.to) { replError.value = t('Pick a different account.'); return }
  const r = replaceAccount(repl.from, repl.to)
  if (!r.ok) { replError.value = t(r.message ?? ''); return }
  replOpen.value = false
  successToast(t(`${accountName(repl.from)} replaced on ${r.rows} row${r.rows === 1 ? '' : 's'}`))
}

const notInPrototype = () => infoToast(t('Not in this prototype'))
</script>

<template>
  <div class="pset-stack">
    <div class="pset-bar">
      <div class="pset-bar__left">
        <ErpFilterSelect id="pset-pi-section" v-model="sectionFilter" :placeholder="t('Section')" :options="sectionOptions" :is-clearable="false" />
        <ErpFilterSelect id="pset-pi-state" v-model="stateFilter" :placeholder="t('State')" :options="stateOptions" :is-clearable="false" />
        <MpButton v-if="filtered" variant="ghost" is-rounded @click="sectionFilter = 'all'; stateFilter = 'all'">{{ t('Clear filters') }}</MpButton>
      </div>
      <div class="pset-bar__right">
        <template v-if="can('settings.edit')">
          <MpButton variant="secondary" is-rounded @click="onConfirmAll">{{ t('Confirm all suggestions') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="replOpen = true; repl.from = ''; repl.to = ''; replError = ''">{{ t('Replace account') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Submit for approval') }}</MpButton>
        </template>
        <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Export overrides') }}</MpButton>
        <MpButton v-if="can('settings.edit')" is-rounded left-icon="add" @click="addOpen = true; add.name = ''; addError = ''">{{ t('New pay item') }}</MpButton>
      </div>
    </div>

    <div v-if="openCount" class="pset-note pset-note--warn">
      {{ t(`${openCount} pay item${openCount > 1 ? 's need' : ' needs'} a decision. A run holds until every item in it has a confirmed role and both accounts.`) }}
    </div>

    <div class="pset-card">
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th">{{ t('Pay item') }}</th>
            <th class="pset-th">{{ t('Role') }}</th>
            <th class="pset-th">{{ t('Debit') }}</th>
            <th class="pset-th">{{ t('Credit') }}</th>
            <th class="pset-th pset-th--num">{{ t('Last run') }}</th>
            <th class="pset-th">{{ t('State') }}</th>
            <th class="pset-th" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length"><td class="pset-td pset-muted" colspan="7">{{ t('No pay items match the filters.') }}</td></tr>
          <tr v-for="m in rows" :key="m.key">
            <td class="pset-td">
              <span class="pset-td--strong pset-link" @click="openEdit(m)">{{ m.name }}</span>
              <span class="pset-line">{{ t(SECTION_LABEL[m.section]) }}<template v-if="m.addedBy === 'Jurnal'"> · {{ t('Added in Jurnal') }}</template><template v-if="m.party"> · {{ m.party }}</template></span>
              <div v-if="suggestionFor(m)" class="pset-chips pset-sugg">
                <ErpStatusBadge status="recommended" :label="t(`Suggested: ${suggestionFor(m)!.role}, Dr ${suggestionFor(m)!.debit}, Cr ${suggestionFor(m)!.credit}`)" type="information" />
                <span v-if="can('settings.edit')" class="pset-link pset-muted" @click="accept(m)">{{ t('Accept') }}</span>
                <span v-if="BULK_SKIP.includes(suggestionFor(m)!.role!)" class="pset-muted">{{ t('Confirm all skips this role') }}</span>
              </div>
              <span v-else-if="stateOf(m) === 'Needs a role' || stateOf(m) === 'No account'" class="pset-line">{{ t('No suggestion') }}</span>
              <span v-if="rowErrors[m.key]" class="pset-line pset-danger">{{ rowErrors[m.key] }}</span>
            </td>
            <td class="pset-td">{{ m.role && m.roleConfirmed ? t(m.role) : '' }}</td>
            <td class="pset-td">{{ accountLabel(m.debit) }}</td>
            <td class="pset-td">{{ accountLabel(m.credit) }}</td>
            <td class="pset-td pset-td--num">
              <template v-if="figures[m.key]">{{ rupiah(figures[m.key]!.amount) }}<span class="pset-line">{{ figures[m.key]!.staff }} {{ t('employees') }} · {{ figures[m.key]!.runLabel }}</span></template>
              <span v-else class="pset-muted">{{ t('Not sent yet') }}</span>
            </td>
            <td class="pset-td">
              <ErpStatusBadge :status="stateOf(m)" :label="t(stateOf(m))" :type="STATE_TYPE[stateOf(m)]" />
            </td>
            <td class="pset-td pset-td--act">
              <MpButton size="sm" variant="secondary" is-rounded @click="openEdit(m)">{{ t(can('settings.edit') ? 'Edit' : 'View') }}</MpButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Edit one pay item -->
    <PayrollSettingsDrawer :is-open="!!editRow" :title="editRow?.name ?? ''" :sub="editRow ? t(SECTION_LABEL[editRow.section]) : ''" wide @close="editKey = null">
      <template v-if="editRow">
        <div v-if="suggestMapping(editRow.name, editRow.section) && can('settings.edit')" class="pset-note">
          <span>{{ t(`Suggestion: ${suggestMapping(editRow.name, editRow.section)!.role}, Dr ${accountLabel(suggestMapping(editRow.name, editRow.section)!.debit)}, Cr ${accountLabel(suggestMapping(editRow.name, editRow.section)!.credit)}`) }}</span>
          <MpButton size="sm" variant="secondary" is-rounded @click="useSuggestion">{{ t('Use suggestion') }}</MpButton>
        </div>
        <div class="pset-row">
          <div class="pset-field">
            <span class="pset-label">{{ t('Role') }}</span>
            <ErpFilterSelect v-if="can('settings.edit')" id="pset-ed-role" v-model="ed.role" :placeholder="t('Pick a role')" :options="roleOptions" width="100%" :is-clearable="false" @update:model-value="edError = ''" />
            <span v-else>{{ editRow.role ?? '' }}</span>
          </div>
          <div class="pset-field">
            <span class="pset-label">{{ t('Owed to') }}</span>
            <ErpFilterSelect v-if="can('settings.edit')" id="pset-ed-party" v-model="ed.party" :placeholder="t('Party')" :options="partyOptions" width="100%" :is-clearable="false" />
            <span v-else>{{ editRow.party ?? t('No party') }}</span>
          </div>
        </div>
        <div class="pset-row">
          <div class="pset-field">
            <span class="pset-label">{{ t('Debit') }}</span>
            <ErpFilterSelect v-if="can('settings.edit')" id="pset-ed-debit" v-model="ed.debit" :placeholder="t('Account')" :options="accountOptions" width="100%" :is-clearable="false" @update:model-value="edError = ''" />
            <span v-else>{{ accountLabel(editRow.debit) }}</span>
          </div>
          <div class="pset-field">
            <span class="pset-label">{{ t('Credit') }}</span>
            <ErpFilterSelect v-if="can('settings.edit')" id="pset-ed-credit" v-model="ed.credit" :placeholder="t('Account')" :options="accountOptions" width="100%" :is-clearable="false" @update:model-value="edError = ''" />
            <span v-else>{{ accountLabel(editRow.credit) }}</span>
          </div>
        </div>
        <div v-if="asksAccrual && can('settings.edit')" class="pset-field">
          <span class="pset-label">{{ t('Do you accrue this?') }}</span>
          <ErpFilterSelect id="pset-ed-accrue" v-model="ed.accrue" :placeholder="t('Accrue')" :options="[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes, debit the accrued liability' }]" width="100%" :is-clearable="false" />
        </div>

        <!-- Guardrails (OD-06) -->
        <div v-for="b in check.blocks" :key="b" class="pset-note pset-note--danger">{{ t(b) }}</div>
        <template v-if="!check.blocks.length && check.overridable.length">
          <div v-for="o in check.overridable" :key="o" class="pset-note pset-note--warn">{{ t(o) }}</div>
          <div v-if="can('settings.override')" class="pset-field">
            <label class="pset-label" for="pset-ed-reason">{{ t('Override reason') }}</label>
            <MpTextarea id="pset-ed-reason" v-model="ed.reason" is-full-width />
            <span class="pset-muted">{{ ed.reason.trim().length }} / 500 · {{ t('at least 20 characters') }}</span>
          </div>
        </template>
        <div v-if="editRow.override" class="pset-note">{{ t(`Override on record: ${editRow.override.reason}`) }} · {{ editRow.override.by }} · {{ wib(editRow.override.at) }}</div>

        <!-- Posting preview with the last-run amount -->
        <div v-if="preview" class="pset-preview">
          <div class="pset-preview__head">{{ preview.runLabel ? t(`Posting preview, last run ${preview.runLabel}, ${preview.staff} employees`) : t('Posting preview. Not sent by Talenta yet.') }}</div>
          <table class="pset-table">
            <tbody>
              <tr v-for="l in preview.lines" :key="l.side">
                <td class="pset-td">{{ l.side }} {{ accountLabel(l.account) }}<span v-if="l.side === 'Dr' && isCostAccount(l.account)" class="pset-line">{{ t('Tags from the organization and branch maps, or a rule') }}</span></td>
                <td class="pset-td pset-td--num">{{ rupiah(l.amount) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="ed.role === 'Employer contribution' && preview.hutangGajiUntouched" class="pset-preview__head">{{ t(`${accountName(preview.hg)} does not change.`) }}</div>
        </div>
        <p v-if="edError" class="pset-error">{{ edError }}</p>
      </template>
      <template v-if="can('settings.edit')" #footer>
        <MpButton variant="ghost" is-rounded @click="editKey = null">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="save">{{ t(check.overridable.length && !check.blocks.length ? 'Save with override' : 'Save') }}</MpButton>
      </template>
    </PayrollSettingsDrawer>

    <!-- New pay item -->
    <PayrollSettingsDrawer :is-open="addOpen" :title="t('New pay item')" @close="addOpen = false">
      <p class="pset-hint">{{ t('Add an item before Talenta sends it. Jurnal matches on the name and section, spaces trimmed and case ignored.') }}</p>
      <div class="pset-field">
        <label class="pset-label" for="pset-add-name">{{ t('Name as Talenta shows it') }}</label>
        <MpInput id="pset-add-name" v-model="add.name" :is-invalid="!!addError" @update:model-value="addError = ''" />
      </div>
      <div class="pset-field">
        <span class="pset-label">{{ t('Section') }}</span>
        <ErpFilterSelect id="pset-add-section" v-model="add.section" :placeholder="t('Section')" :options="sectionPick" width="100%" :is-clearable="false" />
      </div>
      <p v-if="addError" class="pset-error">{{ addError }}</p>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="addOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="onAdd">{{ t('Add pay item') }}</MpButton>
      </template>
    </PayrollSettingsDrawer>

    <!-- Replace account across rows -->
    <PayrollSettingsDrawer :is-open="replOpen" :title="t('Replace account')" @close="replOpen = false">
      <div class="pset-field">
        <span class="pset-label">{{ t('Replace') }}</span>
        <ErpFilterSelect id="pset-repl-from" v-model="repl.from" :placeholder="t('Account in use')" :options="usedAccounts" width="100%" :is-clearable="false" @update:model-value="replError = ''" />
      </div>
      <div class="pset-field">
        <span class="pset-label">{{ t('With') }}</span>
        <ErpFilterSelect id="pset-repl-to" v-model="repl.to" :placeholder="t('Account')" :options="accountOptions" width="100%" :is-clearable="false" @update:model-value="replError = ''" />
      </div>
      <p v-if="repl.from" class="pset-hint">{{ t(`${replRows} pay item row${replRows === 1 ? '' : 's'} use this account. Posted runs keep their own accounts.`) }}</p>
      <p v-if="replError" class="pset-error">{{ replError }}</p>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="replOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="onReplace">{{ t('Replace') }}</MpButton>
      </template>
    </PayrollSettingsDrawer>
  </div>
</template>

<style scoped>
.pset-sugg { margin-top: var(--mp-spacing-2); align-items: center; }
</style>
