<script setup lang="ts">
/**
 * Groups and rules (TS-04, OD-08): organization and branch to tag maps with
 * staff counts, cost center categories, allocation rules in priority order
 * above the fixed fallback, per-value fallback confirmations and the
 * empty-field policies. A rule's account applies only to the roles it lists;
 * rules tag expense lines only.
 */
import { computed, reactive, ref } from 'vue'
import { MpButton, MpIcon, MpInput, MpCheckbox, MpTextarea } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollSettingsDrawer from '~/components/payroll/PayrollSettingsDrawer.vue'
import { successToast, infoToast } from '~/utils/toasts'
import {
  payroll, can, mapGroup, createPayrollTag, saveRule, deleteRule, moveRule, sendToFallback, setFieldPolicy,
  setCostCenterCategory, accountLabel, rupiah, wib, PAY_ROLES, type AllocationRule, type PayRole, type RuleCondition,
} from '~/data/payrollStore'
import { TALENTA_FIELDS, FALLBACK_TAG, GROUPING_FIELDS, type TagDimension, type TalentaField, type GroupingField } from '~/data/payrollMaster'
import { staffByValue, valuesSeen, rulePreview, latestRegularRun, type RuleDraft } from '~/data/payrollUiSettings'
import { periodLabel } from '~/data/payrollStore'

const { t } = useLocale()
const s = computed(() => payroll.settings)
const fieldLabel = (f: string) => TALENTA_FIELDS.find((x) => x.field === f)?.label ?? f
const notInPrototype = () => infoToast(t('Not in this prototype'))
const lastRun = computed(() => latestRegularRun())

// ── Group to tag maps (TS-04) ──
const DIMS: { dim: TagDimension; field: 'organization_name' | 'branch_name'; label: string }[] = [
  { dim: 'Organization', field: 'organization_name', label: 'Organizations' },
  { dim: 'Branch', field: 'branch_name', label: 'Branches' },
]
const staff = computed(() => ({ organization_name: staffByValue('organization_name'), branch_name: staffByValue('branch_name'), cost_center_name: staffByValue('cost_center_name') }))
function groupRows(dim: TagDimension, field: 'organization_name' | 'branch_name') {
  const values = new Set([...valuesSeen(field), ...Object.keys(s.value.groupMaps[dim])])
  return [...values].sort().map((value) => ({
    value, staff: staff.value[field][value] ?? 0, tag: s.value.groupMaps[dim][value] ?? null,
    fallback: s.value.fallback.some((f) => f.field === field && f.value === value),
    tagExists: payroll.tags.some((x) => x.dimension === dim && x.name === value),
  }))
}
const tagOptions = (dim: TagDimension) => payroll.tags.filter((x) => x.dimension === dim && x.name !== FALLBACK_TAG).map((x) => ({ value: x.name, label: x.name }))
const mapErrors = reactive<Record<string, string>>({})
function onMap(dim: TagDimension, value: string, tag: string) {
  const r = mapGroup(dim, value, tag)
  mapErrors[`${dim}|${value}`] = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t(`${value} maps to tag ${tag}`))
}
function createAndMap(dim: TagDimension, value: string) {
  const r = createPayrollTag(dim, value)
  if (!r.ok) { mapErrors[`${dim}|${value}`] = t(r.message ?? ''); return }
  onMap(dim, value, value)
}
const missingCount = (dim: TagDimension, field: 'organization_name' | 'branch_name') => groupRows(dim, field).filter((g) => !g.tag && !g.fallback).length
function createAllMissing(dim: TagDimension, field: 'organization_name' | 'branch_name') {
  for (const g of groupRows(dim, field).filter((x) => !x.tag && !x.fallback)) createAndMap(dim, g.value)
}

// ── Cost center categories (OD08-US05) ──
const costCenters = computed(() => valuesSeen('cost_center_name').map((name) => ({ name, staff: staff.value.cost_center_name[name] ?? 0, cat: s.value.costCenterCategory[name] ?? null })))
const noCategory = computed(() => costCenters.value.filter((c) => !c.cat).length)
const catOptions = [{ value: 'Direct', label: 'Direct' }, { value: 'In-direct', label: 'In-direct' }]
function onCat(name: string, cat: string) {
  const r = setCostCenterCategory(name, cat as 'Direct' | 'In-direct')
  if (r.ok) successToast(t(`${name} set to ${cat}`))
}

// ── Rules (OD-08) ──
const rules = computed(() => s.value.rules)
const previews = computed(() => Object.fromEntries(rules.value.map((r) => [r.id, rulePreview(r)])))
const condLabel = (c: RuleCondition) => `${fieldLabel(c.field)} ${c.op === 'is' ? 'is' : 'is not'} ${c.values.join(' or ')}`
const outputLabel = (r: AllocationRule) => [r.account ? accountLabel(r.account) : null, r.tags ? Object.entries(r.tags).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') : null].filter(Boolean).join(' · ')
function onMove(id: string, dir: -1 | 1) {
  const r = moveRule(id, dir)
  if (r.ok) successToast(t('Rule order saved. Drafts rebuild before posting.'))
}
function onToggle(r: AllocationRule) {
  const res = saveRule({ ...r, active: !r.active })
  if (res.ok) successToast(t(r.active ? `${r.name} turned off` : `${r.name} turned on`))
}
const deleteId = ref<string | null>(null)
function onDelete() {
  if (!deleteId.value) return
  const name = rules.value.find((r) => r.id === deleteId.value)?.name
  const r = deleteRule(deleteId.value)
  deleteId.value = null
  if (r.ok) successToast(t(`${name} deleted`))
}

// Rule editor drawer
const editOpen = ref(false)
const ed = reactive<{ id?: string; name: string; conditions: RuleCondition[]; roles: PayRole[]; account: string; orgTag: string; branchTag: string; active: boolean }>({ name: '', conditions: [], roles: [], account: '', orgTag: '', branchTag: '', active: true })
const edError = ref('')
function openRule(r?: AllocationRule) {
  Object.assign(ed, r
    ? { id: r.id, name: r.name, conditions: r.conditions.map((c) => ({ ...c, values: [...c.values] })), roles: [...r.roles], account: r.account ?? '', orgTag: r.tags?.Organization ?? '', branchTag: r.tags?.Branch ?? '', active: r.active }
    : { id: undefined, name: '', conditions: [{ field: 'organization_name', op: 'is', values: [] }], roles: ['Earning', 'Employer contribution'], account: '', orgTag: '', branchTag: '', active: true })
  edError.value = ''
  editOpen.value = true
}
const fieldOptions = TALENTA_FIELDS.map((f) => ({ value: f.field, label: f.label }))
const opOptions = [{ value: 'is', label: 'is any of' }, { value: 'is not', label: 'is none of' }]
const costAccountOptions = computed(() => [{ value: '', label: 'Use mapped account' }, ...payroll.accounts.filter((a) => (a.type === 'expense' || a.type === 'cogs') && !a.archived).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))])
const ruleTagOptions = (dim: TagDimension) => [{ value: '', label: 'Keep mapped tag' }, ...payroll.tags.filter((x) => x.dimension === dim).map((x) => ({ value: x.name, label: x.name }))]
function addCondition() { if (ed.conditions.length < 5) ed.conditions.push({ field: 'job_level', op: 'is', values: [] }) }
function toggleValue(c: RuleCondition, v: string) { const i = c.values.indexOf(v); if (i >= 0) c.values.splice(i, 1); else c.values.push(v) }
function toggleRole(r: PayRole) { const i = ed.roles.indexOf(r); if (i >= 0) ed.roles.splice(i, 1); else ed.roles.push(r) }
const edDraft = computed<RuleDraft>(() => ({ id: ed.id, conditions: ed.conditions.filter((c) => c.values.length), roles: ed.roles, active: ed.active }))
const edPreview = computed(() => rulePreview(edDraft.value))
function onSaveRule() {
  if (ed.conditions.some((c) => !c.values.length)) { edError.value = t('Pick at least one value for each condition, or remove it.'); return }
  const tags = ed.orgTag || ed.branchTag ? { ...(ed.orgTag ? { Organization: ed.orgTag } : {}), ...(ed.branchTag ? { Branch: ed.branchTag } : {}) } : null
  const r = saveRule({ id: ed.id, name: ed.name, conditions: ed.conditions, roles: ed.roles, account: ed.account || null, tags, active: ed.active })
  if (!r.ok) { edError.value = t(r.message ?? ''); return }
  editOpen.value = false
  successToast(t(`Rule ${ed.name.trim()} saved. Drafts rebuild before posting.`))
}

// ── Fallback (OD08-US04) and field policies (OD08-US06) ──
const fbOpen = ref(false)
const fb = reactive({ field: 'organization_name', value: '', reason: '' })
const fbError = ref('')
const fbFieldOptions = [{ value: 'organization_name', label: 'Organization' }, { value: 'branch_name', label: 'Branch' }]
const fbValueOptions = computed(() => {
  const dim: TagDimension = fb.field === 'organization_name' ? 'Organization' : 'Branch'
  return valuesSeen(fb.field).filter((v) => !s.value.groupMaps[dim][v] && !s.value.fallback.some((f) => f.field === fb.field && f.value === v)).map((v) => ({ value: v, label: v }))
})
function onFallback() {
  if (!fb.value) { fbError.value = t('Pick a value.'); return }
  const r = sendToFallback(fb.field, fb.value, fb.reason)
  if (!r.ok) { fbError.value = t(r.message ?? ''); return }
  fbOpen.value = false
  successToast(t(`${fb.value} goes to the ${FALLBACK_TAG} tag`))
}
const POLICY_FIELDS: { field: GroupingField; label: string }[] = GROUPING_FIELDS.map((f) => ({ field: f, label: fieldLabel(f) }))
const policyOptions = [{ value: 'hold', label: 'Hold the run' }, { value: 'skip', label: 'Skip rules that test this field' }]
function onPolicy(field: GroupingField, v: string) {
  const r = setFieldPolicy(field, v as 'hold' | 'skip')
  if (r.ok) successToast(t('Empty-field policy saved'))
}
</script>

<template>
  <div class="pset-stack">
    <!-- Organization and branch maps -->
    <div v-for="d in DIMS" :key="d.dim" class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t(d.label) }}</div>
          <div class="pset-card__sub">{{ t(`Each Talenta ${d.dim.toLowerCase()} maps to one tag in the ${d.dim} dimension. Expense lines carry it; payable lines carry no group tag.`) }}</div>
        </div>
        <div class="pset-card__actions">
          <MpButton v-if="can('settings.edit') && missingCount(d.dim, d.field)" variant="secondary" is-rounded @click="createAllMissing(d.dim, d.field)">{{ t(`Create ${missingCount(d.dim, d.field)} missing tag${missingCount(d.dim, d.field) > 1 ? 's' : ''}`) }}</MpButton>
        </div>
      </div>
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th">{{ t(d.dim) }}</th>
            <th class="pset-th pset-th--num">{{ t('Staff in last run') }}</th>
            <th class="pset-th">{{ t('Tag') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in groupRows(d.dim, d.field)" :key="g.value">
            <td class="pset-td">{{ g.value }}</td>
            <td class="pset-td pset-td--num">{{ g.staff }}</td>
            <td class="pset-td">
              <template v-if="g.fallback && !g.tag">
                <ErpStatusBadge status="draft" :label="t(`Fallback: ${FALLBACK_TAG}`)" type="announcement" />
              </template>
              <template v-else-if="can('settings.edit')">
                <div class="pset-chips">
                  <ErpFilterSelect :id="`pset-map-${d.dim}-${g.value.replace(/\s+/g, '-')}`" :model-value="g.tag ?? ''" :placeholder="t('No tag')" :options="tagOptions(d.dim)" width="220px" :is-clearable="false" @update:model-value="(v: string) => onMap(d.dim, g.value, v)" />
                  <MpButton v-if="!g.tag && !g.tagExists" size="sm" variant="secondary" is-rounded @click="createAndMap(d.dim, g.value)">{{ t(`Create tag ${g.value}`) }}</MpButton>
                </div>
              </template>
              <span v-else>{{ g.tag ?? t('No tag') }}</span>
              <span v-if="mapErrors[`${d.dim}|${g.value}`]" class="pset-line pset-danger">{{ mapErrors[`${d.dim}|${g.value}`] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Allocation rules -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Allocation rules') }}</div>
          <div class="pset-card__sub">{{ t('The first matching rule sets the account and tags for the roles it lists. Rules tag expense lines only.') }}<template v-if="lastRun"> {{ t(`Matches counted on the ${periodLabel(lastRun.start, lastRun.end)} send.`) }}</template></div>
        </div>
        <div class="pset-card__actions">
          <MpButton v-if="can('settings.edit')" variant="secondary" is-rounded @click="notInPrototype">{{ t('Percentage split') }}</MpButton>
          <MpButton v-if="can('settings.edit')" is-rounded left-icon="add" @click="openRule()">{{ t('New rule') }}</MpButton>
        </div>
      </div>
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th pset-th--num">#</th>
            <th class="pset-th">{{ t('Rule') }}</th>
            <th class="pset-th">{{ t('Sets') }}</th>
            <th class="pset-th">{{ t('Roles') }}</th>
            <th class="pset-th pset-th--num">{{ t('Matches') }}</th>
            <th class="pset-th" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rules" :key="r.id">
            <td class="pset-td pset-td--num">{{ i + 1 }}</td>
            <td class="pset-td">
              <span class="pset-td--strong" :class="{ 'pset-link': true }" @click="openRule(r)">{{ r.name }}</span>
              <span v-for="(c, ci) in r.conditions" :key="ci" class="pset-line">{{ ci ? t('and') + ' ' : '' }}{{ t(condLabel(c)) }}</span>
              <span v-if="!r.active" class="pset-line">{{ t('Off') }}</span>
              <span v-if="previews[r.id]?.shadowed" class="pset-line pset-warn">{{ t('Earlier rules already set the outputs for every employee this rule matches. It never applies.') }}</span>
            </td>
            <td class="pset-td">{{ outputLabel(r) }}</td>
            <td class="pset-td">{{ r.roles.join(', ') }}</td>
            <td class="pset-td pset-td--num">
              {{ t(`${previews[r.id]?.employees ?? 0} employees`) }}
              <span class="pset-line">{{ rupiah(previews[r.id]?.amount ?? 0) }}</span>
            </td>
            <td class="pset-td pset-td--act">
              <div v-if="can('settings.edit')" class="pset-chips pset-ruleacts">
                <MpButton size="sm" variant="secondary" is-rounded :aria-label="t('Move up')" @click="i > 0 && onMove(r.id, -1)"><MpIcon name="arrows-up" size="sm" /></MpButton>
                <MpButton size="sm" variant="secondary" is-rounded :aria-label="t('Move down')" @click="i < rules.length - 1 && onMove(r.id, 1)"><MpIcon name="arrows-down" size="sm" /></MpButton>
                <MpButton size="sm" variant="secondary" is-rounded @click="onToggle(r)">{{ t(r.active ? 'Turn off' : 'Turn on') }}</MpButton>
                <MpButton size="sm" variant="secondary" is-rounded @click="deleteId = r.id">{{ t('Delete') }}</MpButton>
              </div>
            </td>
          </tr>
          <tr class="pset-tr--total">
            <td class="pset-td pset-td--num" />
            <td class="pset-td">{{ t('Fallback') }}<span class="pset-line">{{ t('Any employee no rule matches') }}</span></td>
            <td class="pset-td">{{ t('Mapped account') }} · {{ t('Organization and branch maps') }}</td>
            <td class="pset-td">{{ t('All roles') }}</td>
            <td class="pset-td pset-td--num" />
            <td class="pset-td" />
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Cost center categories -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Cost center categories') }}</div>
          <div class="pset-card__sub">{{ t('Talenta sends only the cost center name. Set Direct or In-direct here so rules on cost center category can match.') }}</div>
        </div>
        <span v-if="noCategory" class="pset-warn pset-muted">{{ t(`${noCategory} cost center${noCategory > 1 ? 's have' : ' has'} no category`) }}</span>
      </div>
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th">{{ t('Cost center') }}</th>
            <th class="pset-th pset-th--num">{{ t('Staff in last run') }}</th>
            <th class="pset-th">{{ t('Category') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in costCenters" :key="c.name">
            <td class="pset-td">{{ c.name }}</td>
            <td class="pset-td pset-td--num">{{ c.staff }}</td>
            <td class="pset-td">
              <ErpFilterSelect v-if="can('settings.edit')" :id="`pset-cc-${c.name.replace(/\s+/g, '-')}`" :model-value="c.cat ?? ''" :placeholder="t('No category')" :options="catOptions" width="180px" :is-clearable="false" @update:model-value="(v: string) => onCat(c.name, v)" />
              <span v-else>{{ c.cat ?? t('No category') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Fallback confirmations -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Values sent to the fallback tag') }}</div>
          <div class="pset-card__sub">{{ t(`Each value takes a one-time confirmation with a reason before it posts to ${FALLBACK_TAG}.`) }}</div>
        </div>
        <MpButton v-if="can('settings.edit')" variant="secondary" is-rounded @click="fbOpen = true; fb.value = ''; fb.reason = ''; fbError = ''">{{ t('Send a value to fallback') }}</MpButton>
      </div>
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th">{{ t('Value') }}</th>
            <th class="pset-th">{{ t('Reason') }}</th>
            <th class="pset-th">{{ t('Confirmed') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!s.fallback.length"><td class="pset-td pset-muted" colspan="3">{{ t('No value goes to the fallback tag.') }}</td></tr>
          <tr v-for="f in s.fallback" :key="`${f.field}|${f.value}`">
            <td class="pset-td">{{ f.value }}<span class="pset-line">{{ t(fieldLabel(f.field)) }}</span></td>
            <td class="pset-td">{{ f.reason }}</td>
            <td class="pset-td">{{ f.by }}<span class="pset-line">{{ wib(f.at) }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty field policies -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Employees with an empty grouping field') }}</div>
          <div class="pset-card__sub">{{ t('Holding the run is the default. Skipping takes the Finance Manager.') }}</div>
        </div>
      </div>
      <table class="pset-table">
        <tbody>
          <tr v-for="p in POLICY_FIELDS" :key="p.field">
            <td class="pset-td">{{ t(p.label) }}</td>
            <td class="pset-td">
              <ErpFilterSelect v-if="can('fieldPolicy.edit')" :id="`pset-policy-${p.field}`" :model-value="s.fieldPolicies[p.field]" :placeholder="t('Policy')" :options="policyOptions" width="280px" :is-clearable="false" @update:model-value="(v: string) => onPolicy(p.field, v)" />
              <span v-else>{{ t(policyOptions.find((o) => o.value === s.fieldPolicies[p.field])!.label) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Rule editor -->
    <PayrollSettingsDrawer :is-open="editOpen" :title="ed.id ? t('Edit rule') : t('New rule')" :sub="ed.id ? ed.name : ''" wide @close="editOpen = false">
      <div class="pset-field">
        <label class="pset-label" for="pset-rule-name">{{ t('Rule name') }}</label>
        <MpInput id="pset-rule-name" v-model="ed.name" @update:model-value="edError = ''" />
      </div>
      <div class="pset-field">
        <span class="pset-label">{{ t('Employees match when') }}</span>
        <div v-for="(c, ci) in ed.conditions" :key="ci" class="pset-condbox">
          <div class="pset-cond">
            <ErpFilterSelect :id="`pset-cond-field-${ci}`" :model-value="c.field" :placeholder="t('Field')" :options="fieldOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => { c.field = v as TalentaField; c.values = [] }" />
            <ErpFilterSelect :id="`pset-cond-op-${ci}`" :model-value="c.op" :placeholder="t('Test')" :options="opOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => c.op = v as 'is' | 'is not'" />
            <span class="pset-muted">{{ c.values.length ? c.values.join(', ') : t('Pick values below') }}</span>
            <MpButton size="sm" variant="secondary" is-rounded :aria-label="t('Remove condition')" @click="ed.conditions.splice(ci, 1)"><MpIcon name="minus" size="sm" /></MpButton>
          </div>
          <div class="pset-chips">
            <MpCheckbox v-for="v in valuesSeen(c.field)" :id="`pset-cond-${ci}-${v.replace(/\s+/g, '-')}`" :key="v" :is-checked="c.values.includes(v)" @change="toggleValue(c, v)">{{ v }}</MpCheckbox>
          </div>
        </div>
        <div>
          <MpButton v-if="ed.conditions.length < 5" size="sm" variant="secondary" is-rounded @click="addCondition">{{ t('Add condition') }}</MpButton>
          <span v-else class="pset-muted">{{ t('A rule tests up to 5 fields.') }}</span>
        </div>
      </div>
      <div class="pset-field">
        <span class="pset-label">{{ t('Applies to roles') }}</span>
        <div class="pset-chips">
          <MpCheckbox v-for="r in PAY_ROLES" :id="`pset-rule-role-${r.replace(/\s+/g, '-')}`" :key="r" :is-checked="ed.roles.includes(r)" @change="toggleRole(r)">{{ t(r) }}</MpCheckbox>
        </div>
        <span class="pset-muted">{{ t('Other roles keep their mapped accounts. With none ticked, Earning and Employer contribution apply.') }}</span>
      </div>
      <div class="pset-row">
        <div class="pset-field">
          <span class="pset-label">{{ t('Expense account') }}</span>
          <ErpFilterSelect id="pset-rule-account" v-model="ed.account" :placeholder="t('Use mapped account')" :options="costAccountOptions" width="100%" :is-clearable="false" />
        </div>
        <div class="pset-field">
          <span class="pset-label">{{ t('Organization tag') }}</span>
          <ErpFilterSelect id="pset-rule-org" v-model="ed.orgTag" :placeholder="t('Keep mapped tag')" :options="ruleTagOptions('Organization')" width="100%" :is-clearable="false" />
        </div>
        <div class="pset-field">
          <span class="pset-label">{{ t('Branch tag') }}</span>
          <ErpFilterSelect id="pset-rule-branch" v-model="ed.branchTag" :placeholder="t('Keep mapped tag')" :options="ruleTagOptions('Branch')" width="100%" :is-clearable="false" />
        </div>
      </div>
      <div class="pset-note" :class="{ 'pset-note--warn': edPreview.shadowed }">
        <span v-if="!edDraft.conditions.length">{{ t('Pick a value to see who this rule matches.') }}</span>
        <span v-else-if="edPreview.shadowed">{{ t(`Matches ${edPreview.employees} employees, ${rupiah(edPreview.amount)}. Earlier rules already set the outputs for all of them, so this rule never applies. Move it up or narrow the earlier rule.`) }}</span>
        <span v-else>{{ t(`Matches ${edPreview.employees} employees, ${rupiah(edPreview.amount)}`) }}<template v-if="edPreview.runLabel"> · {{ edPreview.runLabel }}</template><template v-if="edPreview.wins < edPreview.employees"> · {{ t(`${edPreview.employees - edPreview.wins} already taken by an earlier rule`) }}</template></span>
      </div>
      <p v-if="edError" class="pset-error">{{ edError }}</p>
      <template v-if="can('settings.edit')" #footer>
        <MpButton variant="ghost" is-rounded @click="editOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="onSaveRule">{{ t('Save rule') }}</MpButton>
      </template>
    </PayrollSettingsDrawer>

    <!-- Delete rule -->
    <PayrollSettingsDrawer :is-open="!!deleteId" :title="t('Delete rule')" :sub="rules.find((r) => r.id === deleteId)?.name ?? ''" @close="deleteId = null">
      <p class="pset-hint">{{ t('Posted journals keep the rule in their settings snapshot. Drafts rebuild without it before posting.') }}</p>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="deleteId = null">{{ t('Cancel') }}</MpButton>
        <MpButton variant="danger" is-rounded @click="onDelete">{{ t('Delete rule') }}</MpButton>
      </template>
    </PayrollSettingsDrawer>

    <!-- Send a value to fallback -->
    <PayrollSettingsDrawer :is-open="fbOpen" :title="t('Send a value to fallback')" @close="fbOpen = false">
      <div class="pset-field">
        <span class="pset-label">{{ t('Field') }}</span>
        <ErpFilterSelect id="pset-fb-field" v-model="fb.field" :placeholder="t('Field')" :options="fbFieldOptions" width="100%" :is-clearable="false" @update:model-value="fb.value = ''" />
      </div>
      <div class="pset-field">
        <span class="pset-label">{{ t('Value') }}</span>
        <ErpFilterSelect id="pset-fb-value" v-model="fb.value" :placeholder="t('Value with no tag')" :options="fbValueOptions" width="100%" :is-clearable="false" empty-text="Every value has a tag" />
      </div>
      <div class="pset-field">
        <label class="pset-label" for="pset-fb-reason">{{ t('Reason') }}</label>
        <MpTextarea id="pset-fb-reason" v-model="fb.reason" is-full-width />
      </div>
      <p v-if="fbError" class="pset-error">{{ fbError }}</p>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="fbOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="onFallback">{{ t('Confirm fallback') }}</MpButton>
      </template>
    </PayrollSettingsDrawer>
  </div>
</template>

<style scoped>
.pset-ruleacts { justify-content: flex-end; flex-wrap: nowrap; }
.pset-condbox { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
</style>
