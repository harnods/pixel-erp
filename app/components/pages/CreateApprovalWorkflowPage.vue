<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpInput, MpInputTag, MpSelect, MpRadio, MpToggle, MpTextarea, MpText, MpButton, MpTooltip,
  MpInputGroup, MpInputLeftAddon, toast, type DataInterface,
} from '@mekari/pixel3'
import {
  getApprovalWorkflowById, addApprovalWorkflow, updateApprovalWorkflow,
  TRANSACTION_TYPE_OPTIONS, PROJECT_ACTION_OPTIONS, projects, getProjectById, findProjectByName,
  amountFieldVisible, amountFieldLabel, projectScopeFieldVisible,
  type ApprovalTransactionType, type ApprovalWorkflowInput, type ApprovalAppliesTo, type ProjectAction,
} from '~/data/approvalWorkflows'
import { users, getUserById, findUserByName } from '~/data/users'

// id from the catch-all route: 'new' → create, an existing rule id → edit.
const props = defineProps<{ orderId?: string }>()
const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')

const router = useRouter()
const { t } = useLocale()
const { projectAccountingEnabled } = useApprovalWorkflowScenario()

const NAME_MAX = 60
const DESC_MAX = 256

const name = ref('')
const description = ref('')
const appliesTo = ref<ApprovalAppliesTo>('transaction')

// Demo FAB toggle (Settings > Approval workflows) — when Project Accounting billing doesn't
// exist for this tenant, the "Applies to" condition is dropped entirely and the form behaves
// like the pre-Project-Action version (transaction type only). Force back to 'transaction' if
// the flag flips off mid-edit so a hidden 'project' selection can't be silently submitted.
watch(projectAccountingEnabled, (enabled) => {
  if (!enabled) appliesTo.value = 'transaction'
})
const transactionType = ref<ApprovalTransactionType | ''>('')
const projectAction = ref<ProjectAction | ''>('')
const projectScope = ref<'all' | 'some'>('all')
const someProjects = ref<DataInterface[]>([])
const minAmount = ref<number | null>(0)

// Field visibility/label per spec §3 — depends on appliesTo + (for Project Action) which
// action is selected. Transaction path is unchanged; each Project action shows its own set.
const showAmountField = computed(() => amountFieldVisible(appliesTo.value, projectAction.value))
const amountLabel = computed(() => t(amountFieldLabel(appliesTo.value, projectAction.value)))
const showProjectScopeField = computed(() => projectScopeFieldVisible(appliesTo.value, projectAction.value))
const createdByScope = ref<'all' | 'some'>('all')
const createdByUsers = ref<DataInterface[]>([])
const applyToDraft = ref(true)

type LevelDraft = { matchType: 'any' | 'all'; approvers: DataInterface[] }
const levels = ref<LevelDraft[]>([{ matchType: 'any', approvers: [] }])

const userSuggestions = users.map((u) => u.name)

function idsToTagData(ids: string[]): DataInterface[] {
  return ids
    .map((id) => getUserById(id)?.name)
    .filter((n): n is string => !!n)
    .map((n, i) => ({ id: `u-${i}-${n}`, text: n, value: n, isInvalid: false, isReadOnly: false }))
}
function tagDataToIds(data: DataInterface[]): string[] {
  return data
    .map((d) => findUserByName(String(d.text))?.id)
    .filter((id): id is string => !!id)
}

const projectSuggestions = projects.map((p) => p.name)

function projectIdsToTagData(ids: string[]): DataInterface[] {
  return ids
    .map((id) => getProjectById(id)?.name)
    .filter((n): n is string => !!n)
    .map((n, i) => ({ id: `p-${i}-${n}`, text: n, value: n, isInvalid: false, isReadOnly: false }))
}
function projectTagDataToIds(data: DataInterface[]): string[] {
  return data
    .map((d) => findProjectByName(String(d.text))?.id)
    .filter((id): id is string => !!id)
}

const TRANSACTION_TYPE_LABELS: Record<ApprovalTransactionType, string> = {
  'sales-invoice': t('Sales invoice'),
  'sales-order': t('Sales order'),
  'purchase-order': t('Purchase order'),
  'purchase-invoice': t('Purchase invoice'),
  'bill': t('Bill'),
  'stock-adjustment': t('Stock adjustment'),
  'warehouse-transfer': t('Warehouse transfer'),
}

const PROJECT_ACTION_LABELS: Record<ProjectAction, string> = {
  'project-creation': t('Project creation'),
  'variation-order': t('Variation order'),
  'milestone-verification': t('Milestone verification'),
}

// Edit mode — prefill the form from the existing rule.
onMounted(() => {
  if (!isEdit.value) return
  const rule = getApprovalWorkflowById(props.orderId!)
  if (!rule) return
  name.value = rule.name
  description.value = rule.description ?? ''
  appliesTo.value = rule.appliesTo
  transactionType.value = rule.transactionType
  projectAction.value = rule.projectAction
  projectScope.value = rule.projectScope
  someProjects.value = projectIdsToTagData(rule.projectIds)
  minAmount.value = rule.minAmount
  createdByScope.value = rule.createdByScope
  createdByUsers.value = idsToTagData(rule.createdByUserIds)
  applyToDraft.value = rule.applyToDraft
  levels.value = rule.levels.map((l) => ({ matchType: l.matchType, approvers: idsToTagData(l.approverIds) }))
})

function handleCreatedByChange(data: DataInterface[]) {
  createdByUsers.value = data
  if (data.length > 0) createdByError.value = false
}
function handleLevelApproversChange(idx: number, data: DataInterface[]) {
  levels.value[idx]!.approvers = data
  if (data.length > 0) levelErrors.value[idx] = false
}
function addLevel() {
  levels.value.push({ matchType: 'any', approvers: [] })
  levelErrors.value.push(false)
}
function removeLevel(idx: number) {
  if (levels.value.length <= 1) return
  levels.value.splice(idx, 1)
  levelErrors.value.splice(idx, 1)
}

function goBack() {
  router.push('/approval-workflows')
}

// Errors are only triggered from the Save action — never inline while typing
const nameError = ref('')
const transactionTypeError = ref('')
const projectActionError = ref('')
const projectsError = ref(false)
const createdByError = ref(false)
const levelErrors = ref<boolean[]>([false])
const isSaving = ref(false)

function validate(): boolean {
  nameError.value = name.value.trim() ? '' : t('You must fill in workflow name')
  if (appliesTo.value === 'transaction') {
    transactionTypeError.value = transactionType.value ? '' : t('You must select transaction type')
    projectActionError.value = ''
    createdByError.value = createdByScope.value === 'some' && createdByUsers.value.length === 0
  } else {
    // "Transaction created by" is omitted entirely for Project Action rules — nothing to validate.
    transactionTypeError.value = ''
    projectActionError.value = projectAction.value ? '' : t('You must select action type')
    createdByError.value = false
  }
  projectsError.value = showProjectScopeField.value && projectScope.value === 'some' && someProjects.value.length === 0
  levelErrors.value = levels.value.map((l) => l.approvers.length === 0)
  return !nameError.value && !transactionTypeError.value && !projectActionError.value && !projectsError.value
    && !createdByError.value && !levelErrors.value.some(Boolean)
}

async function save() {
  if (!validate()) return
  isSaving.value = true
  await new Promise((r) => setTimeout(r, 500))

  const payload: ApprovalWorkflowInput = {
    name: name.value.trim(),
    description: description.value,
    appliesTo: appliesTo.value,
    transactionType: appliesTo.value === 'transaction' ? (transactionType.value as ApprovalTransactionType) : '',
    projectAction: appliesTo.value === 'project' ? (projectAction.value as ProjectAction) : '',
    projectScope: projectScope.value,
    projectIds: showProjectScopeField.value && projectScope.value === 'some' ? projectTagDataToIds(someProjects.value) : [],
    minAmount: showAmountField.value ? minAmount.value : null,
    createdByScope: appliesTo.value === 'transaction' ? createdByScope.value : 'all',
    createdByUserIds: appliesTo.value === 'transaction' && createdByScope.value === 'some' ? tagDataToIds(createdByUsers.value) : [],
    levels: levels.value.map((l) => ({ matchType: l.matchType, approverIds: tagDataToIds(l.approvers) })),
    applyToDraft: applyToDraft.value,
  }

  if (isEdit.value) {
    updateApprovalWorkflow(props.orderId!, payload)
    toast.notify({ variant: 'success', title: t('Approval workflow changes saved'), maxWidth: 'max-content' })
  } else {
    addApprovalWorkflow(payload)
    toast.notify({ variant: 'success', title: t('Approval workflow saved'), maxWidth: 'max-content' })
  }
  isSaving.value = false
  router.push('/approval-workflows')
}
</script>

<template>
  <div class="caw-page">

    <!-- ── Page title bar (neutral-subtle bg, 72px, breadcrumb + title) ── -->
    <div class="caw-titlebar">
      <div class="caw-titlebar-left">
        <MpButton variant="link" class="caw-breadcrumb btn-enterprise" @click="goBack">{{ t('Approval workflows') }}</MpButton>
        <h1 class="caw-title">{{ isEdit ? t('Edit approval workflow') : t('New approval workflow') }}</h1>
      </div>
    </div>

    <!-- ── Stage (white, rounded tl/tr, scrollable) ── -->
    <div class="caw-stage">
      <div class="caw-form-group">

        <!-- ── Workflow name + Description (both with a character counter) ── -->
        <MpFormControl id="awf-name" is-required :is-invalid="!!nameError">
          <div class="caw-label-row">
            <MpFormLabel>{{ t('Workflow name') }}</MpFormLabel>
            <span class="caw-counter">{{ name.length }} / {{ NAME_MAX }}</span>
          </div>
          <MpInput id="awf-name-input" v-model="name" :maxlength="NAME_MAX" :placeholder="t('Example: Sales Invoice Rule 001')" is-full-width @update:model-value="nameError = ''" />
          <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="awf-description">
          <div class="caw-label-row">
            <MpFormLabel>{{ t('Description') }}</MpFormLabel>
            <span class="caw-counter">{{ description.length }} / {{ DESC_MAX }}</span>
          </div>
          <MpTextarea id="awf-description-input" v-model="description" :maxlength="DESC_MAX" :placeholder="t('Optional')" is-full-width />
        </MpFormControl>

        <div class="caw-divider" />

        <!-- ── Section: Conditions ── -->
        <div class="caw-section">
          <h2 class="caw-section-title">{{ t('Conditions') }}</h2>
          <p class="caw-section-desc">{{ t('Define transaction conditions that require approval.') }}</p>

          <div class="caw-fields">
            <!-- Only shown when the Project Accounting billing component exists for this
                 tenant (Settings > Approval workflows demo FAB) — otherwise the form behaves
                 like the pre-Project-Action version (Transaction type only, no selector). -->
            <MpFormControl v-if="projectAccountingEnabled" id="awf-applies-to">
              <MpFormLabel>{{ t('Applies to') }}</MpFormLabel>
              <div class="caw-radio-group caw-radio-group--inline">
                <MpRadio id="awf-applies-to-transaction" name="awf-applies-to" value="transaction" v-model="appliesTo">
                  {{ t('Transaction') }}
                </MpRadio>
                <MpRadio id="awf-applies-to-project" name="awf-applies-to" value="project" v-model="appliesTo">
                  {{ t('Project Action') }}
                </MpRadio>
              </div>
            </MpFormControl>

            <MpFormControl v-if="appliesTo === 'transaction'" id="awf-transaction-type" class="caw-field-half" is-required :is-invalid="!!transactionTypeError">
              <MpFormLabel>{{ t('Transaction type') }}</MpFormLabel>
              <MpSelect
                id="awf-transaction-type-input"
                :model-value="transactionType"
                :placeholder="transactionType ? undefined : t('Select transaction type')"
                is-full-width
                @change="(_e: Event, v: string) => { transactionType = v as ApprovalTransactionType; transactionTypeError = '' }"
              >
                <option v-for="opt in TRANSACTION_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ TRANSACTION_TYPE_LABELS[opt.value] }}
                </option>
              </MpSelect>
              <MpFormErrorMessage>{{ transactionTypeError }}</MpFormErrorMessage>
            </MpFormControl>

            <template v-else>
              <MpFormControl id="awf-project-action" class="caw-field-half" is-required :is-invalid="!!projectActionError">
                <MpFormLabel>{{ t('Action type') }}</MpFormLabel>
                <MpSelect
                  id="awf-project-action-input"
                  :model-value="projectAction"
                  :placeholder="projectAction ? undefined : t('Select action type')"
                  is-full-width
                  @change="(_e: Event, v: string) => { projectAction = v as ProjectAction; projectActionError = '' }"
                >
                  <option v-for="opt in PROJECT_ACTION_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ PROJECT_ACTION_LABELS[opt.value] }}
                  </option>
                </MpSelect>
                <MpFormErrorMessage>{{ projectActionError }}</MpFormErrorMessage>
              </MpFormControl>
            </template>

            <!-- Amount / Contract value / Variation delta — same control, label + presence
                 depend on appliesTo + the selected Project action. Never shown for milestone
                 verification (no amount condition for that action). -->
            <MpFormControl v-if="showAmountField" id="awf-min-amount" class="caw-field-half">
              <MpFormLabel>{{ amountLabel }}</MpFormLabel>
              <MpInputGroup id="awf-min-amount-group">
                <MpInputLeftAddon id="awf-min-amount-left-addon" has-background>
                  <MpText weight="semiBold">Rp</MpText>
                </MpInputLeftAddon>
                <MpInput
                  id="awf-min-amount-input"
                  type="number"
                  :model-value="minAmount"
                  @update:model-value="(v: string | number) => minAmount = Number(v)"
                />
              </MpInputGroup>
              <MpFormHelpText>
                {{ t('Enter the smallest value if you want to create more than one rule for the same transaction type') }}
              </MpFormHelpText>
            </MpFormControl>

            <!-- "Applies to projects" — shown for the Transaction path, and for Project Action
                 variation-order/milestone-verification; project-creation has no project yet at
                 submission time, so it's omitted entirely (not shown-disabled). -->
            <MpFormControl v-if="showProjectScopeField" id="awf-project-scope" :is-invalid="projectsError">
              <MpFormLabel>{{ t('Applies to projects') }}</MpFormLabel>
              <div class="caw-radio-group">
                <MpRadio id="awf-project-scope-all" name="awf-project-scope" value="all" v-model="projectScope">
                  {{ t('All projects') }}
                </MpRadio>
                <MpRadio id="awf-project-scope-some" name="awf-project-scope" value="some" v-model="projectScope">
                  {{ t('Some projects') }}
                </MpRadio>
              </div>

              <div v-if="projectScope === 'some'" class="caw-created-by-users">
                <MpInputTag
                  id="awf-projects-input"
                  :data="someProjects"
                  :suggestions="projectSuggestions"
                  :is-show-suggestions="true"
                  :is-enable-create-new-tag="false"
                  :is-show-icon-chevron-down="true"
                  :placeholder="t('Select project(s)')"
                  :is-invalid="projectsError"
                  @change="(data: DataInterface[]) => { someProjects = data; if (data.length > 0) projectsError = false }"
                />
                <MpFormErrorMessage v-if="projectsError">{{ t('You must select at least one project') }}</MpFormErrorMessage>
              </div>
            </MpFormControl>

            <!-- "Transaction created by" — Transaction path only; omitted entirely (not
                 shown-disabled) for every Project Action rule. -->
            <MpFormControl v-if="appliesTo === 'transaction'" id="awf-created-by" :is-invalid="createdByError">
              <MpFormLabel>{{ t('Transaction created by') }}</MpFormLabel>
              <div class="caw-radio-group">
                <MpRadio id="awf-created-by-all" name="awf-created-by" value="all" v-model="createdByScope">
                  {{ t('All users') }}
                </MpRadio>
                <MpRadio id="awf-created-by-some" name="awf-created-by" value="some" v-model="createdByScope">
                  {{ t('Some users') }}
                </MpRadio>
              </div>

              <div v-if="createdByScope === 'some'" class="caw-created-by-users">
                <MpInputTag
                  id="awf-created-by-users-input"
                  :data="createdByUsers"
                  :suggestions="userSuggestions"
                  :is-show-suggestions="true"
                  :is-enable-create-new-tag="false"
                  :is-show-icon-chevron-down="true"
                  :placeholder="t('Select users')"
                  :is-invalid="createdByError"
                  @change="handleCreatedByChange"
                />
                <MpFormErrorMessage v-if="createdByError">{{ t('You must select at least one user') }}</MpFormErrorMessage>
              </div>
            </MpFormControl>
          </div>
        </div>

        <div class="caw-divider" />

        <!-- ── Section: Approval levels ── -->
        <div class="caw-section">
          <h2 class="caw-section-title">{{ t('Approval levels') }}</h2>
          <p class="caw-section-desc">{{ t('Define approvers and how approval is given.') }}</p>

          <div class="caw-levels">
            <div v-for="(level, idx) in levels" :key="idx" class="caw-level">
              <div class="caw-level-header">
                <span class="caw-level-title">{{ t('Approval level') }} {{ idx + 1 }}</span>
                <MpTooltip v-if="levels.length > 1" :id="`awf-level-remove-tooltip-${idx}`" :label="t('Delete')">
                  <MpButton
                    variant="ghost"
                    size="sm"
                    left-icon="delete"
                    :aria-label="`${t('Remove approver level')} ${idx + 1}`"
                    @click="removeLevel(idx)"
                  />
                </MpTooltip>
              </div>

              <MpFormControl :id="`awf-level-match-${idx}`">
                <MpFormLabel>{{ t('Transaction require approval from') }}</MpFormLabel>
                <div class="caw-radio-group caw-radio-group--inline">
                  <MpRadio :id="`awf-level-match-${idx}-any`" :name="`awf-level-match-${idx}`" value="any" v-model="level.matchType">
                    {{ t('Any') }}
                  </MpRadio>
                  <MpRadio :id="`awf-level-match-${idx}-all`" :name="`awf-level-match-${idx}`" value="all" v-model="level.matchType">
                    {{ t('All') }}
                  </MpRadio>
                </div>
              </MpFormControl>

              <MpFormControl :id="`awf-level-approvers-${idx}`" is-required :is-invalid="!!levelErrors[idx]">
                <MpFormLabel>{{ t('Approver') }}</MpFormLabel>
                <MpInputTag
                  :id="`awf-level-approvers-input-${idx}`"
                  :data="level.approvers"
                  :suggestions="userSuggestions"
                  :is-show-suggestions="true"
                  :is-enable-create-new-tag="false"
                  :is-show-icon-chevron-down="true"
                  :placeholder="t('Select approver')"
                  :is-invalid="!!levelErrors[idx]"
                  @change="(data: DataInterface[]) => handleLevelApproversChange(idx, data)"
                />
                <MpFormErrorMessage v-if="levelErrors[idx]">{{ t('You must select at least one approver') }}</MpFormErrorMessage>
              </MpFormControl>
            </div>
          </div>

          <MpButton type="button" class="caw-add-level-btn btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="addLevel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('Add approver level') }}
          </MpButton>
        </div>

        <div class="caw-divider" />

        <!-- ── Section: Apply workflow ── -->
        <div class="caw-section">
          <div class="caw-toggle-row">
            <MpToggle
              id="awf-apply-to-draft"
              :is-checked="applyToDraft"
              @update:is-checked="(v: boolean) => applyToDraft = v"
            >
              {{ t('Apply this workflow to the transaction draft') }}
            </MpToggle>
          </div>
        </div>

        <!-- ── Action group ── -->
        <div class="caw-action-group">
          <div class="caw-action-right">
            <MpButton class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</MpButton>
            <MpButton class="btn-enterprise btn-enterprise--primary caw-btn-save" :is-disabled="isSaving" @click="save">
              {{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Save')) }}
            </MpButton>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Page shell ── */
.caw-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Title bar ── */
.caw-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.caw-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}
.caw-breadcrumb {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  font-family: inherit;
  white-space: nowrap;
}
.caw-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }

.caw-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.caw-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

.caw-form-group {
  width: var(--mp-sizes-containers-sm, 640px);
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5, 20px);
}

.caw-divider {
  height: var(--mp-borders-sm, 1px);
  background: var(--mp-border-default);
}

.caw-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); }
.caw-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.caw-section {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
}
.caw-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg, 18px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg);
  color: var(--mp-text-default);
}
.caw-section-desc {
  margin: calc(-1 * var(--mp-spacing-3)) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

.caw-fields {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
}
.caw-field-half { max-width: 360px; }

/* ── Radio group ── */
.caw-radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}
.caw-radio-group--inline {
  flex-direction: row;
  gap: var(--mp-spacing-5);
}
.caw-created-by-users { margin-top: var(--mp-spacing-2); }

/* ── Approval levels ── */
.caw-levels {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}
.caw-level {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  padding-bottom: var(--mp-spacing-4);
  border-bottom: 1px dashed var(--mp-border-default);
}
.caw-level:last-child { border-bottom: none; padding-bottom: 0; }

.caw-level-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.caw-level-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.caw-add-level-btn {
  align-self: flex-start;
  width: auto;
}

/* ── Apply workflow toggle ── */
.caw-toggle-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

/* ── Action group ── */
.caw-action-group {
  display: flex;
  align-items: center;
  padding: var(--mp-spacing-4) 0;
}
.caw-action-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  margin-left: auto;
}
/* Cancel/Save reuse the global .btn-enterprise / --ghost / --primary classes (erp.css) —
   only the disabled state is specific to this form. */
.caw-btn-save:disabled { opacity: 0.6; cursor: default; }
</style>
