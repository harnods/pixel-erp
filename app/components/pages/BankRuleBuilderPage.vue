<!-- prod-parity: jurnal-accounting-frontend/src/modules/cash-management/bank-rules/views/BankRuleBuilderView.vue -->
<script setup lang="ts">
/**
 * Bank rule builder — create / edit / duplicate. The prod "flow canvas": a
 * dotted-grid canvas with stacked cards
 *   When there is a [Money in | Money out]
 *     → That matches [any | all]
 *   Conditions (Description / Amount groups, "or" between groups)
 *     →
 *   Outcome (account split by %, Additional settings: Contact, Memo, Auto-record)
 * and a right rail with Rule name + Apply to accounts. Save validates inline and
 * persists through ~/data/bankRules (localStorage snapshot).
 *
 * Routes: /bank-rules/new, /bank-rules/:id/edit, /bank-rules/:id/duplicate.
 * /bank-rules/new?trigger=&description=&account= prefills from Reconciliations
 * › To match › Create bank rule.
 */
import {
  MpButton, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpRadio, MpCheckbox, MpToggle,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpText,
  MpPopover, MpPopoverTrigger, MpPopoverContent, toast, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { contacts } from '~/data/contacts'
import {
  getBankRule, saveBankRule, nextBankRuleId, reconRailAccounts, MAPPING_COA,
  DESCRIPTION_OPERATORS, AMOUNT_OPERATORS, OPERATOR_LABELS, RULE_NAME_MAX_LENGTH,
  type BankRule, type BankRuleField, type BankRuleTrigger, type BankRuleMatchType, type BankRuleMemoMode,
} from '~/data'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const segs = computed(() => route.path.split('/').filter(Boolean))
const mode = computed<'create' | 'edit' | 'duplicate'>(() => segs.value[2] === 'edit' ? 'edit' : segs.value[2] === 'duplicate' ? 'duplicate' : 'create')
const source = computed(() => (mode.value === 'create' ? undefined : getBankRule(props.orderId)))
const notFound = computed(() => mode.value !== 'create' && !source.value)
const title = computed(() => mode.value === 'edit' ? t('Edit bank rule') : mode.value === 'duplicate' ? t('Duplicate bank rule') : t('New bank rule'))

// ── Form state ──
interface CondRow { key: number; operator: string; value: string }
interface CondGroup { field: BankRuleField; rows: CondRow[] }
interface SplitRow { key: number; account: string; percentage: string }

let keySeq = 0
const nk = () => ++keySeq

const name = ref('')
const applyAll = ref(false)
const applyIds = ref<string[]>([])
const trigger = ref<BankRuleTrigger>('money_out')
const matchType = ref<BankRuleMatchType>('any')
const groups = ref<CondGroup[]>([])
const splits = ref<SplitRow[]>([])
const contact = ref('')
const memoMode = ref<BankRuleMemoMode>('statement')
const memoCustom = ref('')
const autoRecord = ref(false)
const settingsOpen = ref(false)

function load() {
  const r = source.value
  if (r) {
    name.value = mode.value === 'duplicate' ? r.name.slice(0, RULE_NAME_MAX_LENGTH) : r.name
    applyAll.value = r.applyTo === 'all'
    applyIds.value = r.applyTo === 'all' ? [] : [...r.applyTo]
    trigger.value = r.trigger
    matchType.value = r.matchType
    const fields: BankRuleField[] = []
    r.conditions.forEach(c => { if (!fields.includes(c.field)) fields.push(c.field) })
    groups.value = fields.map(f => ({ field: f, rows: r.conditions.filter(c => c.field === f).map(c => ({ key: nk(), operator: c.operator, value: c.value })) }))
    splits.value = r.splits.map(s => ({ key: nk(), account: s.account, percentage: String(s.percentage) }))
    contact.value = r.contact
    memoMode.value = r.memoMode
    memoCustom.value = r.memoCustom
    autoRecord.value = r.autoRecord
    settingsOpen.value = !!r.contact || r.memoMode !== 'statement' || r.autoRecord
  } else {
    const q = route.query
    trigger.value = q.trigger === 'money_in' ? 'money_in' : 'money_out'
    applyIds.value = typeof q.account === 'string' ? [q.account] : []
    groups.value = [{ field: 'description', rows: [{ key: nk(), operator: 'contains', value: typeof q.description === 'string' ? q.description : '' }] }]
    splits.value = [{ key: nk(), account: '', percentage: '100' }]
  }
}
watch(() => route.fullPath, load, { immediate: true })

// ── Rail: accounts ──
const bankAccounts = computed(() => reconRailAccounts())
function toggleAccount(id: string) {
  applyIds.value = applyIds.value.includes(id) ? applyIds.value.filter(x => x !== id) : [...applyIds.value, id]
  applyAll.value = applyIds.value.length === bankAccounts.value.length
  errors.accounts = ''
}
function toggleAll() {
  applyAll.value = !applyAll.value
  applyIds.value = applyAll.value ? bankAccounts.value.map(a => a.id) : []
  errors.accounts = ''
}
watch(applyAll, (v) => { if (v) applyIds.value = bankAccounts.value.map(a => a.id) }, { immediate: true })

// ── Conditions ──
const FIELD_LABEL: Record<BankRuleField, string> = { description: 'Description', amount: 'Amount' }
const availableFields = computed(() => (['description', 'amount'] as BankRuleField[]).filter(f => !groups.value.some(g => g.field === f)))
const totalRows = computed(() => groups.value.reduce((n, g) => n + g.rows.length, 0))
function operatorOptions(f: BankRuleField) {
  return (f === 'description' ? DESCRIPTION_OPERATORS : AMOUNT_OPERATORS).map(o => ({ value: o, label: OPERATOR_LABELS[o]! }))
}
function addRow(g: CondGroup) { g.rows.push({ key: nk(), operator: g.field === 'description' ? 'contains' : 'eq', value: '' }); errors.conditions = '' }
function addGroup(f: BankRuleField) { groups.value.push({ field: f, rows: [{ key: nk(), operator: f === 'description' ? 'contains' : 'eq', value: '' }] }); errors.conditions = '' }
function removeRow(g: CondGroup, key: number) {
  g.rows = g.rows.filter(r => r.key !== key)
  if (g.rows.length === 0) groups.value = groups.value.filter(x => x !== g)
}
function setOperator(row: CondRow, op: string) { row.operator = op; if (op === 'is_blank') row.value = ''; delete rowErrors[row.key] }

// ── Outcome: splits ──
const splitTotal = computed(() => Math.round(splits.value.reduce((s, r) => s + (Number(r.percentage) || 0), 0) * 100) / 100)
const ACCOUNT_OPTIONS = MAPPING_COA.map(a => ({ value: a.code, label: `${a.code} ${a.name}` }))
function addSplit() { splits.value.push({ key: nk(), account: '', percentage: '' }); errors.splits = '' }
function removeSplit(key: number) { splits.value = splits.value.filter(s => s.key !== key) }
const CONTACT_OPTIONS = computed(() => contacts.map(c => c.displayName).filter(Boolean))
const MEMO_MODES: { value: BankRuleMemoMode; label: string }[] = [
  { value: 'statement', label: 'Same as statement description' },
  { value: 'later', label: 'Specify later' },
  { value: 'custom', label: 'Custom' },
]

// ── Validation ──
const errors = reactive({ name: '', accounts: '', conditions: '', splits: '', memo: '' })
const rowErrors = reactive<Record<number, string>>({})
const splitErrors = reactive<Record<number, string>>({})
const submitError = ref('')

function validate(): boolean {
  Object.assign(errors, { name: '', accounts: '', conditions: '', splits: '', memo: '' })
  Object.keys(rowErrors).forEach(k => delete rowErrors[Number(k)])
  Object.keys(splitErrors).forEach(k => delete splitErrors[Number(k)])
  if (!name.value.trim()) errors.name = t('Rule name is required.')
  else if (name.value.length > RULE_NAME_MAX_LENGTH) errors.name = `${t('Rule name must be')} ${RULE_NAME_MAX_LENGTH} ${t('characters or fewer.')}`
  if (!applyAll.value && applyIds.value.length === 0) errors.accounts = t('Select at least one bank account.')
  if (totalRows.value === 0) errors.conditions = t('Add at least one condition.')
  groups.value.forEach(g => g.rows.forEach(r => {
    if (r.operator === 'is_blank') return
    if (!r.value.trim()) rowErrors[r.key] = t('Enter a value.')
    else if (g.field === 'amount' && !(Number(r.value) > 0) && r.operator !== 'gt') rowErrors[r.key] = t('Enter an amount greater than 0.')
  }))
  splits.value.forEach(s => {
    const p = Number(s.percentage)
    if (!s.account) splitErrors[s.key] = t('Select an account.')
    else if (s.percentage === '') splitErrors[s.key] = t('Enter a percentage.')
    else if (!(p > 0 && p <= 100)) splitErrors[s.key] = t('Enter a percentage between 0 and 100.')
  })
  if (splits.value.length === 0 || splitTotal.value !== 100) errors.splits = t('Account percentages must total 100%.')
  if (memoMode.value === 'custom' && !memoCustom.value.trim()) { errors.memo = t('Enter a memo.'); settingsOpen.value = true }
  const ok = !Object.values(errors).some(Boolean) && Object.keys(rowErrors).length === 0 && Object.keys(splitErrors).length === 0
  submitError.value = ok ? '' : t('Please fix the highlighted fields before saving.')
  return ok
}

function save() {
  if (!validate()) return
  const rule: BankRule = {
    id: mode.value === 'edit' ? props.orderId : nextBankRuleId(),
    name: name.value.trim(),
    applyTo: applyAll.value ? 'all' : [...applyIds.value],
    trigger: trigger.value,
    matchType: matchType.value,
    conditions: groups.value.flatMap(g => g.rows.map(r => ({ field: g.field, operator: r.operator as BankRule['conditions'][number]['operator'], value: r.operator === 'is_blank' ? '' : r.value.trim() }))),
    splits: splits.value.map(s => ({ account: s.account, percentage: Number(s.percentage) })),
    contact: contact.value,
    memoMode: memoMode.value,
    memoCustom: memoMode.value === 'custom' ? memoCustom.value.trim() : '',
    autoRecord: autoRecord.value,
  }
  saveBankRule(rule)
  toast.notify({ variant: 'success', title: mode.value === 'edit' ? t('Bank rule updated.') : t('Bank rule created.'), maxWidth: 'max-content' })
  router.push('/bank-rules')
}

const leaveOpen = ref(false)
function goBack() { router.push('/bank-rules') }
</script>

<template>
  <div class="brb-page">
    <header class="brb-titlebar">
      <div class="brb-titlebar__left">
        <button class="brb-breadcrumb btn-enterprise" type="button" @click="goBack">{{ t('Bank rules') }}</button>
        <h1 class="brb-title">{{ notFound ? t('Bank rules') : title }}</h1>
      </div>
      <div v-if="!notFound" class="brb-titlebar__right">
        <MpPopover id="brb-leave" is-manual :is-open="leaveOpen" use-portal :is-keep-alive="false" placement="bottom-end" @close="leaveOpen = false">
          <MpPopoverTrigger>
            <MpButton variant="ghost" is-rounded @click="leaveOpen = !leaveOpen">{{ t('Cancel') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ width: '320px' })">
            <div class="brb-leave">
              <p class="brb-leave__title">{{ t('Leave without saving?') }}</p>
              <p class="brb-leave__msg">{{ t('Your changes to this bank rule will not be saved.') }}</p>
              <div class="brb-leave__actions">
                <MpButton variant="ghost" is-rounded @click="leaveOpen = false">{{ t('Keep editing') }}</MpButton>
                <MpButton variant="secondary" is-rounded @click="goBack">{{ t('Leave') }}</MpButton>
              </div>
            </div>
          </MpPopoverContent>
        </MpPopover>
        <MpButton variant="primary" is-rounded @click="save">{{ t('Save rule') }}</MpButton>
      </div>
    </header>

    <!-- Not found -->
    <div v-if="notFound" class="brb-stage brb-stage--empty">
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-full__illustration" width="288" height="240" />
        <p class="empty-full__title">{{ t('Bank rule not found') }}</p>
        <p class="empty-full__desc">{{ t('The bank rule you are looking for does not exist or has been deleted.') }}</p>
      </div>
    </div>

    <div v-else class="brb-stage">
      <p v-if="submitError" class="brb-banner" role="alert"><MpIcon name="info" size="sm" />{{ submitError }}</p>

      <div class="brb-canvas">
        <div class="brb-main">
          <!-- Trigger -->
          <section class="brb-card">
            <MpText size="body-small" class="brb-label">{{ t('When there is a') }}</MpText>
            <div class="brb-radios brb-radios--row">
              <label v-for="opt in (['money_in', 'money_out'] as BankRuleTrigger[])" :key="opt" class="brb-radio">
                <MpRadio :id="`brb-trigger-${opt}`" name="brb-trigger" :value="opt" :is-checked="trigger === opt" @change="trigger = opt" />
                <span>{{ opt === 'money_in' ? t('Money in') : t('Money out') }}</span>
              </label>
            </div>
          </section>

          <!-- Connector + joiner -->
          <div class="brb-connector">
            <span class="brb-connector__line" />
            <div class="brb-joiner">
              <MpText size="body-small">{{ t('That matches') }}</MpText>
              <ErpFilterSelect id="brb-match" :model-value="matchType" :placeholder="t('any')" :options="[{ value: 'any', label: t('any') }, { value: 'all', label: t('all') }]" :is-clearable="false" width="96px" @update:model-value="(v: string) => matchType = v as BankRuleMatchType" />
            </div>
            <span class="brb-connector__line" />
          </div>

          <!-- Conditions -->
          <section class="brb-card">
            <h3 class="brb-card__title">{{ t('Conditions') }}</h3>
            <template v-for="(g, gi) in groups" :key="g.field">
              <div v-if="gi > 0" class="brb-or"><span class="brb-or__line" /><MpText size="body-small" class="brb-muted">{{ t('or') }}</MpText><span class="brb-or__line" /></div>
              <div class="brb-group">
                <MpText size="body-small" class="brb-label">{{ t(FIELD_LABEL[g.field]) }}</MpText>
                <div v-for="r in g.rows" :key="r.key" class="brb-cond">
                  <div class="brb-cond__row">
                    <ErpFilterSelect
                      :id="`brb-op-${r.key}`" :model-value="r.operator" :placeholder="t('Operator')" :options="operatorOptions(g.field)"
                      :is-clearable="false" width="200px" @update:model-value="(v: string) => setOperator(r, v)"
                    />
                    <template v-if="r.operator !== 'is_blank'">
                      <MpInputGroup v-if="g.field === 'amount'" :id="`brb-val-group-${r.key}`" class="brb-cond__value">
                        <MpInputLeftAddon :id="`brb-val-addon-${r.key}`" has-background><MpText weight="semiBold">Rp</MpText></MpInputLeftAddon>
                        <MpInput :id="`brb-val-${r.key}`" v-model="r.value" type="number" :is-invalid="!!rowErrors[r.key]" :aria-label="t('Amount')" @update:model-value="delete rowErrors[r.key]" />
                      </MpInputGroup>
                      <MpInput v-else :id="`brb-val-${r.key}`" v-model="r.value" class="brb-cond__value" :is-invalid="!!rowErrors[r.key]" :aria-label="t('Description')" @update:model-value="delete rowErrors[r.key]" />
                    </template>
                    <span v-else class="brb-cond__value" />
                    <MpButton variant="ghost" is-rounded class="brb-remove" :aria-label="t('Remove criteria')" @click="totalRows > 1 && removeRow(g, r.key)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </div>
                  <p v-if="rowErrors[r.key]" class="brb-error" role="alert">{{ rowErrors[r.key] }}</p>
                </div>
                <div><MpButton variant="ghost" is-rounded left-icon="add" @click="addRow(g)">{{ t('Add criteria') }}</MpButton></div>
              </div>
            </template>
            <p v-if="errors.conditions" class="brb-error" role="alert">{{ errors.conditions }}</p>
            <div v-if="availableFields.length" class="brb-inline">
              <MpButton v-for="f in availableFields" :key="f" variant="ghost" is-rounded left-icon="add" @click="addGroup(f)">{{ t('Add') }} {{ t(FIELD_LABEL[f]) }}</MpButton>
            </div>
          </section>

          <div class="brb-connector"><span class="brb-connector__line brb-connector__line--full" /></div>

          <!-- Outcome -->
          <section class="brb-card">
            <h3 class="brb-card__title">{{ t('Outcome') }}</h3>
            <MpText size="body-small" class="brb-label">{{ t('Accounts') }}</MpText>
            <div v-for="s in splits" :key="s.key" class="brb-cond">
              <div class="brb-cond__row">
                <ErpFilterSelect
                  :id="`brb-split-acc-${s.key}`" :model-value="s.account" :placeholder="t('Select account')" :options="ACCOUNT_OPTIONS"
                  width="100%" class="brb-split__account" empty-text="No accounts found"
                  @update:model-value="(v: string) => { s.account = v; delete splitErrors[s.key] }"
                />
                <MpInputGroup :id="`brb-split-pct-group-${s.key}`" class="brb-split__pct">
                  <MpInput :id="`brb-split-pct-${s.key}`" v-model="s.percentage" type="number" :is-invalid="!!splitErrors[s.key]" :aria-label="t('Percentage')" @update:model-value="() => { delete splitErrors[s.key]; errors.splits = '' }" />
                  <MpInputRightAddon :id="`brb-split-pct-addon-${s.key}`" has-background>%</MpInputRightAddon>
                </MpInputGroup>
                <MpButton variant="ghost" is-rounded class="brb-remove" :aria-label="t('Remove account')" @click="splits.length > 1 && removeSplit(s.key)">
                  <MpIcon name="minus-circular" size="sm" />
                </MpButton>
              </div>
              <p v-if="splitErrors[s.key]" class="brb-error" role="alert">{{ splitErrors[s.key] }}</p>
            </div>
            <div class="brb-split__foot">
              <MpButton variant="ghost" is-rounded left-icon="add" @click="addSplit">{{ t('Add account') }}</MpButton>
              <MpText size="body-small" :class="splitTotal === 100 ? 'brb-muted' : 'brb-total--invalid'">{{ t('Total') }} {{ splitTotal }}%</MpText>
            </div>
            <p v-if="errors.splits" class="brb-error" role="alert">{{ errors.splits }}</p>

            <!-- Additional settings -->
            <div class="brb-settings">
              <MpButton variant="ghost" is-rounded :right-icon="settingsOpen ? 'chevrons-up' : 'chevrons-down'" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">{{ t('Additional settings') }}</MpButton>
              <div v-if="settingsOpen" class="brb-settings__body">
                <MpFormControl id="brb-contact">
                  <MpFormLabel>{{ t('Contact') }}</MpFormLabel>
                  <ErpFilterSelect id="brb-contact-select" v-model="contact" :placeholder="t('Select contact')" :options="CONTACT_OPTIONS" width="100%" />
                </MpFormControl>
                <MpFormControl id="brb-memo" :is-invalid="!!errors.memo">
                  <MpFormLabel>{{ t('Memo settings') }}</MpFormLabel>
                  <div class="brb-radios">
                    <label v-for="m in MEMO_MODES" :key="m.value" class="brb-radio">
                      <MpRadio :id="`brb-memo-${m.value}`" name="brb-memo" :value="m.value" :is-checked="memoMode === m.value" @change="memoMode = m.value; errors.memo = ''" />
                      <span>{{ t(m.label) }}</span>
                    </label>
                    <MpInput v-if="memoMode === 'custom'" id="brb-memo-input" v-model="memoCustom" :is-invalid="!!errors.memo" :aria-label="t('Memo')" @update:model-value="errors.memo = ''" />
                  </div>
                  <MpFormErrorMessage>{{ errors.memo }}</MpFormErrorMessage>
                </MpFormControl>
                <div class="brb-auto">
                  <label class="brb-auto__row">
                    <MpToggle id="brb-auto" :is-checked="autoRecord" :aria-label="t('Auto-record')" @update:is-checked="(v: boolean) => autoRecord = v" />
                    <MpText size="body-small">{{ t('Auto-record') }}</MpText>
                  </label>
                  <MpText size="body-small" class="brb-muted">{{ t('Automatically record and match transactions to skip manual review.') }}</MpText>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Rail -->
        <aside class="brb-rail">
          <section class="brb-card">
            <MpFormControl id="brb-name" is-required :is-invalid="!!errors.name">
              <div class="brb-name-label">
                <MpFormLabel>{{ t('Rule name') }}</MpFormLabel>
                <span class="brb-muted">{{ name.length }}/{{ RULE_NAME_MAX_LENGTH }}</span>
              </div>
              <MpInput id="brb-name-input" v-model="name" :maxlength="RULE_NAME_MAX_LENGTH" :is-invalid="!!errors.name" @update:model-value="errors.name = ''" />
              <MpFormErrorMessage>{{ errors.name }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="brb-accounts" is-required :is-invalid="!!errors.accounts">
              <MpFormLabel>{{ t('Apply to accounts') }}</MpFormLabel>
              <ul class="brb-checklist">
                <li class="brb-check" @click="toggleAll">
                  <MpCheckbox id="brb-acc-all" :is-checked="applyAll" :is-indeterminate="!applyAll && applyIds.length > 0" @click.stop="toggleAll" />
                  <span>{{ t('All accounts') }}</span>
                </li>
                <li v-for="a in bankAccounts" :key="a.id" class="brb-check" @click="toggleAccount(a.id)">
                  <MpCheckbox :id="`brb-acc-${a.id}`" :is-checked="applyIds.includes(a.id)" @click.stop="toggleAccount(a.id)" />
                  <span>{{ a.code }} {{ a.name }}</span>
                </li>
              </ul>
              <MpFormErrorMessage>{{ errors.accounts }}</MpFormErrorMessage>
            </MpFormControl>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.brb-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.brb-titlebar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); background: var(--mp-background-neutral-subtle); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: 0 var(--mp-spacing-6); }
.brb-titlebar__left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; min-width: 0; }
.brb-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }
.brb-breadcrumb { background: none; border: none; cursor: pointer; padding: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); font-family: inherit; white-space: nowrap; }
.brb-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.brb-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }

.brb-stage {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-6);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  background-color: var(--mp-background-stage);
  /* Prod flow canvas: dotted grid behind the cards. */
  background-image: radial-gradient(var(--mp-border-default) 1px, transparent 1px);
  background-size: 16px 16px;
}
.brb-stage--empty { align-items: center; justify-content: center; background-image: none; }
.brb-banner { display: flex; align-items: center; gap: var(--mp-spacing-2); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-danger, var(--mp-text-danger)); border-radius: var(--mp-radii-md); background: var(--mp-colors-background-danger); color: var(--mp-text-danger); font-size: var(--mp-font-sizes-md); }

.brb-canvas { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
.brb-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: stretch; }
.brb-rail { flex: 0 0 338px; min-width: 0; }
@media (max-width: 1279px) {
  .brb-canvas { flex-wrap: wrap; }
  .brb-rail { flex-basis: 100%; }
}

.brb-card { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-5); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); }
.brb-card__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brb-label { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brb-muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.brb-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.brb-radios--row { flex-direction: row; gap: var(--mp-spacing-6); }
.brb-radio { display: inline-flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }

.brb-connector { display: flex; flex-direction: column; align-items: center; }
.brb-connector__line { width: 1px; height: var(--mp-spacing-5, 20px); background: var(--mp-colors-border-bold); }
.brb-connector__line--full { height: var(--mp-spacing-8, 32px); }
.brb-joiner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); }

.brb-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.brb-or { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.brb-or__line { flex: 1; height: 1px; background: var(--mp-border-default); }
.brb-cond { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.brb-cond__row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.brb-cond__value { flex: 1; min-width: 0; }
.brb-remove { min-width: 0 !important; flex-shrink: 0; }
.brb-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.brb-inline { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }

.brb-split__account { flex: 1; min-width: 0; }
.brb-split__pct { flex: 0 0 120px; }
.brb-split__foot { display: flex; align-items: center; justify-content: space-between; }
.brb-total--invalid { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.brb-settings { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); align-items: flex-start; }
.brb-settings__body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); width: 100%; }
.brb-auto { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.brb-auto__row { display: inline-flex; align-items: center; gap: var(--mp-spacing-3); cursor: pointer; }

.brb-name-label { display: flex; align-items: baseline; justify-content: space-between; }
.brb-checklist { list-style: none; margin: 0; padding: var(--mp-spacing-1) 0; display: flex; flex-direction: column; max-height: 360px; overflow-y: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.brb-check { display: flex; align-items: center; gap: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; user-select: none; }
.brb-check:first-child { border-bottom: 1px solid var(--mp-border-default); }
.brb-check:hover { background: var(--mp-background-neutral-hovered); }

.brb-leave { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); }
.brb-leave__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brb-leave__msg { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.brb-leave__actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-2); }

.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; }
.empty-full__illustration { width: var(--mp-sizes-72, 288px); height: var(--mp-sizes-60, 240px); object-fit: contain; }
.empty-full__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full__desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
