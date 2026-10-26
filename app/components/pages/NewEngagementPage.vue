<script setup lang="ts">
/**
 * New project — the Setup step of Project accounting.
 *
 * A contract, SOW or sales order becomes a tracked project here. The one
 * irreversible choice on this form is **how the project earns**: it picks the
 * recognition engine used for the rest of the project's life, so nothing is
 * preselected and the choice is required. The budget applies either way.
 *
 * A `detailMatch` route, so this page owns its whole layout — its own 72px title
 * bar and its own stage padding (DESIGN.md → Layout).
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpButton, MpRadio,
  MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpIcon, toast, MpTextlink,
  MpAutocomplete, MpTooltip,
} from '@mekari/pixel3'
import SelectAccessDrawer, { type AccessOption } from '~/components/patterns/SelectAccessDrawer.vue'
import {
  createEngagement, draftWeightSum, methodLabel, creationApprovalPreview, projectStatusKey,
  findEngagement, draftFromEngagement, resubmitEngagement, feeEstimateOf, formatIdr,
  COST_ACCOUNTS, REVENUE_ACCOUNT,
  type Engagement, type EngagementDraft, type RecognitionMethod,
} from '~/data/projectAccounting'
import { contactsOfType } from '~/data/contacts'
import { budget, BUDGET_YEAR, lineById, lineTitle, lineTotal, isSavingLine } from '~/data/budgetStore'
import { accessUsers, projectLeadUsers } from '~/data/accessControl'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()
const { currentUser } = useProjectViewAs()

let seq = 0
const nextId = (p: string) => `${p}${(seq += 1)}`

// ── Draft ─────────────────────────────────────────────────────────────────────
const draft = reactive<EngagementDraft>({
  name: '',
  client: '',
  pm: '',
  method: 'tm',
  value: '',
  budget: '',
  budgetLineId: '',
  team: [],
  markup: '20',
  milestones: [
    { id: 'd1', label: 'Fabrication complete', pct: '40' },
    { id: 'd2', label: 'Delivery to site', pct: '30' },
    { id: 'd3', label: 'Installation & commissioning', pct: '30' },
  ],
  budgetLines: {
    revenue: [{ id: 'br1', account: REVENUE_ACCOUNT, amount: '' }],
    cost: COST_ACCOUNTS.map((a, i) => ({ id: `bc${i}`, account: a, amount: '' })),
  },
})

// The method is irreversible, so nothing is picked until the user picks it.
// `draft.method` only receives the choice at save time.
const method = ref<RecognitionMethod | ''>('')

// ?resubmit=<id>: a rejected project comes back here pre-filled, and Save sends it
// for approval again instead of creating a second project.
const resubmitId = typeof route.query.resubmit === 'string' ? route.query.resubmit : ''
const resubmitOf = resubmitId ? findEngagement(resubmitId) : undefined
if (resubmitOf) {
  Object.assign(draft, draftFromEngagement(resubmitOf))
  method.value = resubmitOf.method
}

const METHOD_CHOICES: { key: RecognitionMethod; desc: string }[] = [
  { key: 'tm', desc: 'Revenue is each reviewed cost line plus the agreed margin.' },
  { key: 'input', desc: 'Revenue follows the share of budgeted cost spent. Invoices follow a separate billing schedule.' },
  { key: 'output', desc: 'Revenue is recognized when a weighted milestone is verified. The milestone is then ready to invoice.' },
]

function pickMethod(k: RecognitionMethod) {
  method.value = k
  methodError.value = false
}

const isCostPlus = computed(() => method.value === 'tm')
const isOutput = computed(() => method.value === 'output')
/** Percentage of completion and Milestones both run on the contract value. */
const valueRequired = computed(() => method.value === 'input' || method.value === 'output')
const valueLabel = computed(() => (isCostPlus.value ? t('Fee estimate') : t('Contract value')))
/** Cost plus margin: the fee is derived from budgeted cost and markup, never typed. */
const derivedFee = computed(() => {
  const b = draft.budget === '' ? null : Number(draft.budget) || 0
  return feeEstimateOf(b, Number(draft.markup) || 0)
})
const derivedFeeText = computed(() => (derivedFee.value === null ? '' : formatIdr(derivedFee.value)))

// ── Approval preview ──────────────────────────────────────────────────────────
// A Settings › Approval workflows rule on project creation sends the new project
// to Pending approval. Name the approvers before the user saves.
const approvalRule = computed(() => creationApprovalPreview(isCostPlus.value ? (derivedFee.value ?? 0) : (Number(draft.value) || 0)))
const approvalNames = computed(() => (approvalRule.value?.approvers ?? []).join(', '))

// ── Customer ──────────────────────────────────────────────────────────────────
// Picked from the Contacts master rather than typed, so a project always names a
// contact that exists. Stored as the display name (Engagement.client is a string).
const clientData = computed(() =>
  contactsOfType('customer')
    .filter(c => !c.archived && c.displayName)
    .map(c => ({ id: c.id, name: c.displayName })),
)

// ── Budget line ───────────────────────────────────────────────────────────────
// Saving-bucket lines are not a spendable budget, so they are left out.
const budgetLineData = computed(() =>
  budget.lines
    .filter(l => l.year === BUDGET_YEAR && !isSavingLine(l))
    .map(l => ({ id: l.id, name: lineTitle(l) })),
)

/** Picking a budget seeds the estimated cost from its annual total; still editable. */
function onBudgetLinePicked(id: string) {
  const l = lineById(id || null)
  if (l) draft.budget = String(lineTotal(l))
}

// Detours open in a new tab so a half-filled form is never lost.
function openBudgetLine(id: string) {
  if (!id) return
  window.open(`/budget-lines/${id}`, '_blank', 'noopener')
}
function openNewContact() { window.open('/customers/new', '_blank', 'noopener') }
function openNewBudget() { window.open('/budget-lines?action=new', '_blank', 'noopener') }

// ── Project assignment ────────────────────────────────────────────────────────
const pmData = computed(() => projectLeadUsers().map(u => ({ id: u.id, name: u.name })))

const teamOptions: AccessOption[] = accessUsers.map(u => ({ id: u.id, name: u.name, subtitle: u.roles.join(', ') }))
const teamIds = ref<string[]>([])
const teamDrawerOpen = ref(false)
const teamRows = computed(() => teamOptions.filter(o => teamIds.value.includes(o.id)))

function syncTeam() { draft.team = teamRows.value.map(r => r.name) }
function onTeamSaved(ids: string[]) { teamIds.value = ids; syncTeam() }
function removeMember(id: string) { teamIds.value = teamIds.value.filter(x => x !== id); syncTeam() }

// ── Milestones ────────────────────────────────────────────────────────────────
const weightSum = computed(() => draftWeightSum(draft))
const weightsOk = computed(() => weightSum.value === 100)
function addMilestone() { draft.milestones.push({ id: nextId('d'), label: '', pct: '0' }) }
function removeMilestone(id: string) {
  const i = draft.milestones.findIndex(m => m.id === id)
  if (i !== -1) draft.milestones.splice(i, 1)
}

// ── Save ──────────────────────────────────────────────────────────────────────
// No disabled action buttons for validation (DESIGN.md): Save validates on click
// and every error shows inline next to its field.
const nameError = ref(false)
const clientError = ref(false)
const methodError = ref(false)
const valueError = ref(false)
const weightsError = ref(false)
const isSaving = ref(false)

const createProject = createEngagement

async function save() {
  nameError.value = !draft.name.trim()
  clientError.value = !draft.client.trim()
  methodError.value = !method.value
  valueError.value = valueRequired.value && !(Number(draft.value) > 0)
  weightsError.value = isOutput.value && !weightsOk.value
  if (nameError.value || clientError.value || methodError.value || valueError.value || weightsError.value) return

  draft.method = method.value as RecognitionMethod
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  const created = resubmitOf
    ? resubmitEngagement(resubmitOf.id, draft, currentUser.value.name)
    : createProject(draft, currentUser.value.name)
  isSaving.value = false
  if (!created) {
    toast.notify({ variant: 'error', title: t('Only the person who submitted this project can resubmit it'), maxWidth: 'max-content' })
    return
  }
  const pending = projectStatusKey(created) === 'pending approval'
  toast.notify({
    variant: 'success',
    title: pending ? (resubmitOf ? t('Project resubmitted for approval') : t('Project submitted for approval')) : t('Project created'),
    maxWidth: 'max-content',
  })
  router.push(`/project-accounting/${created.id}`)
}

function cancel() { router.push('/project-accounting') }
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar (form variant: breadcrumb + New [entity]) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="ne-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="cancel">{{ t('Project accounting') }}</MpTextlink>
        <h1 class="detail-title">{{ resubmitOf ? t('Edit and resubmit project') : t('New project') }}</h1>
      </div>
    </header>

    <div class="detail-stage">
      <div class="ne-form">
        <!-- ── Project details ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('Project details') }}</h2>

          <div class="ne-grid ne-grid--2">
            <MpFormControl id="ne-name" is-required :is-invalid="nameError">
              <MpFormLabel>{{ t('Project name') }}</MpFormLabel>
              <MpInput
                id="ne-name-input" v-model="draft.name" is-full-width :is-invalid="nameError"
                @update:model-value="nameError = false"
              />
              <MpFormErrorMessage>{{ t('You must fill in project name') }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="ne-client" is-required :is-invalid="clientError">
              <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
              <MpAutocomplete
                id="ne-client-input" v-model="draft.client" :data="clientData"
                label-prop="name" value-prop="name" is-searchable use-portal is-full-width
                :is-invalid="clientError" :placeholder="t('Select a contact')"
                is-show-button-action
                @update:model-value="clientError = false"
                @button-action="openNewContact"
              >
                <template #buttonAction>{{ t('Add new contact') }}</template>
              </MpAutocomplete>
              <MpFormErrorMessage>{{ t('You must fill in customer') }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Recognition method ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('Revenue recognition method') }}</h2>
          <p class="ne-hint ne-hint--lead">{{ t("You can't change the method after the project is created.") }}</p>
          <MpFormControl id="ne-method" is-required :is-invalid="methodError">
            <div class="ne-methods" role="radiogroup" :aria-label="t('Revenue recognition method')">
              <div
                v-for="m in METHOD_CHOICES"
                :key="m.key"
                class="ne-method"
                :class="{ 'ne-method--picked': method === m.key, 'ne-method--invalid': methodError }"
                @click="pickMethod(m.key)"
              >
                <MpRadio
                  :id="`ne-method-${m.key}`" name="ne-method" :value="m.key"
                  :is-checked="method === m.key" @change="pickMethod(m.key)"
                >
                  <span class="ne-method-title">{{ t(methodLabel(m.key)) }}</span>
                </MpRadio>
                <span class="ne-method-desc">{{ t(m.desc) }}</span>
              </div>
            </div>
            <MpFormErrorMessage>{{ t('You must choose a revenue recognition method') }}</MpFormErrorMessage>
          </MpFormControl>
        </section>

        <!-- ── Commercials ── -->
        <section class="ne-section">
          <div class="ne-grid ne-grid--3">
            <MpFormControl v-if="isCostPlus" id="ne-value">
              <MpFormLabel>{{ valueLabel }}</MpFormLabel>
              <MpInput id="ne-value-input" :model-value="derivedFeeText" is-read-only is-full-width :placeholder="t('Enter budgeted cost')" />
              <p class="ne-hint">{{ t('Budgeted cost plus the agreed margin. A forecast, not a limit.') }}</p>
            </MpFormControl>
            <MpFormControl v-else id="ne-value" :is-required="valueRequired" :is-invalid="valueError">
              <MpFormLabel>{{ valueLabel }}</MpFormLabel>
              <MpInputGroup id="ne-value-group" is-full-width>
                <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                <MpInput
                  id="ne-value-input" v-model="draft.value" type="number" is-full-width :is-invalid="valueError"
                  @update:model-value="valueError = false"
                />
              </MpInputGroup>
              <MpFormErrorMessage>{{ t('You must fill in contract value') }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="ne-budget-line">
              <MpFormLabel>{{ t('Budget') }}</MpFormLabel>
              <MpAutocomplete
                id="ne-budget-line-input" v-model="draft.budgetLineId" :data="budgetLineData"
                label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                :placeholder="t('Select budget')"
                is-show-button-action
                @update:model-value="onBudgetLinePicked"
                @button-action="openNewBudget"
              >
                <!-- Each budget carries its own open-in-a-new-tab icon, so a budget
                     can be read without first selecting it. -->
                <template #default="{ item }">
                  <span class="ne-option">
                    <span class="ne-option-label">{{ item.name }}</span>
                    <MpButton
                      variant="ghost" is-rounded left-icon="newtab" class="ne-option-open"
                      :aria-label="`${t('View budget')}: ${item.name}`"
                      @click.stop.prevent="openBudgetLine(item.id)"
                    />
                  </span>
                </template>
                <template #buttonAction>{{ t('Add new budget') }}</template>
              </MpAutocomplete>
              <p class="ne-hint">{{ t('The budget this project draws against') }}</p>
            </MpFormControl>

            <MpFormControl id="ne-budget">
              <MpFormLabel>{{ t('Budgeted cost') }}</MpFormLabel>
              <MpInputGroup id="ne-budget-group" is-full-width>
                <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                <MpInput id="ne-budget-input" v-model="draft.budget" type="number" is-full-width />
              </MpInputGroup>
              <p class="ne-hint">{{ t('Filled from the selected budget. You can edit it.') }}</p>
            </MpFormControl>
          </div>

          <!-- Cost plus margin only: the margin the contract entitles you to. -->
          <div v-if="isCostPlus" class="ne-grid ne-grid--3 ne-grid--next">
            <MpFormControl id="ne-markup" is-required>
              <MpFormLabel>{{ t('Agreed margin on cost') }}</MpFormLabel>
              <MpInputGroup id="ne-markup-group">
                <MpInput id="ne-markup-input" v-model="draft.markup" type="number" />
                <MpInputRightAddon has-background>%</MpInputRightAddon>
              </MpInputGroup>
              <p class="ne-hint">{{ t('Charged on every reviewed cost line. Reviewers can waive it per line.') }}</p>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Project assignment ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('Project assignment') }}</h2>
          <p class="ne-hint ne-hint--lead">{{ t('Define who leads the project and who works on it.') }}</p>
          <!-- Stacked, not paired: a select sits on its own row (rule/form-select-half). -->
          <div class="ne-grid ne-grid--3 ne-assign-grid">
            <MpFormControl id="ne-pm">
              <MpFormLabel>{{ t('Project manager') }}</MpFormLabel>
              <MpAutocomplete
                id="ne-pm-input" v-model="draft.pm" :data="pmData"
                label-prop="name" value-prop="name" use-portal is-full-width
                :placeholder="t('Select project manager')"
              />
            </MpFormControl>

            <MpFormControl id="ne-team">
              <MpFormLabel>{{ t('Team members') }}</MpFormLabel>
              <div class="ne-team">
                <div v-if="teamRows.length" class="ne-sel-list">
                  <div v-for="m in teamRows" :key="m.id" class="ne-sel-row">
                    <span class="ne-sel-info">
                      <span class="ne-sel-name">{{ m.name }}</span>
                      <span v-if="m.subtitle" class="ne-sel-sub">{{ m.subtitle }}</span>
                    </span>
                    <MpTooltip :id="`ne-rm-member-${m.id}`" :label="t('Remove')" placement="top" use-portal class="ne-sel-tip">
                      <MpButton variant="ghost" is-rounded left-icon="minus-circular" :aria-label="t('Remove')" @click="removeMember(m.id)" />
                    </MpTooltip>
                  </div>
                </div>
                <MpButton variant="secondary" is-rounded left-icon="add" class="ne-add-btn" @click="teamDrawerOpen = true">
                  {{ t('Add team member') }}
                </MpButton>
              </div>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Output milestones ── -->
        <section v-if="isOutput" class="ne-section">
          <h2 class="ne-section-title">{{ t('Milestones') }}</h2>
          <div class="ne-line ne-line--head">
            <span class="ne-line-head">{{ t('Milestone name') }}</span>
            <span class="ne-line-head ne-line-pct">{{ t('Weight') }}</span>
            <span class="ne-line-remove" />
          </div>
          <div v-for="m in draft.milestones" :key="m.id" class="ne-line">
            <MpInput :id="`ne-ms-label-${m.id}`" v-model="m.label" is-full-width :aria-label="t('Milestone name')" />
            <MpInputGroup :id="`ne-ms-pct-group-${m.id}`" class="ne-line-pct">
              <MpInput :id="`ne-ms-pct-${m.id}`" v-model="m.pct" type="number" :aria-label="t('Weight')" @update:model-value="weightsError = false" />
              <MpInputRightAddon has-background>%</MpInputRightAddon>
            </MpInputGroup>
            <MpButton
              variant="ghost" is-rounded left-icon="minus-circular" class="ne-line-remove"
              :aria-label="t('Remove milestone')" @click="removeMilestone(m.id)"
            />
          </div>
          <div class="ne-line-foot">
            <MpButton variant="secondary" is-rounded left-icon="add" @click="addMilestone">{{ t('Add milestone') }}</MpButton>
            <p class="ne-summary" :class="weightsOk ? 'ne-summary--ok' : (weightsError ? 'ne-summary--bad' : '')">
              {{ weightsOk
                ? t('Weights add up to 100%')
                : t('Weights add up to {pct}%. They must add up to 100%.').replace('{pct}', String(weightSum)) }}
            </p>
          </div>
        </section>

        <!-- ── Team member picker ── -->
        <SelectAccessDrawer
          v-model:open="teamDrawerOpen"
          :title="t('Select team members')"
          :list-title="t('Users')"
          :options="teamOptions"
          :model-value="teamIds"
          :empty-title="t('No selected team members')"
          :empty-caption="t('Selected team members will appear here.')"
          @save="onTeamSaved"
        />

        <!-- ── Actions ── -->
        <p v-if="approvalRule" class="ne-approval">
          <MpIcon name="info" size="sm" />
          <span>{{ t('This project needs approval from {names} before it starts.').replace('{names}', approvalNames) }}</span>
        </p>
        <div class="ne-actions">
          <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-loading="isSaving" @click="save">{{ t('Save') }}</MpButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page shell (shared detail-page pattern) ─────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-3) var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}

/* ── Form ────────────────────────────────────────────────────────────────── */
.ne-form { max-width: 960px; }
.ne-section { padding: var(--mp-spacing-6) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ne-section:first-child { padding-top: 0; }
.ne-section-title {
  margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.ne-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ne-hint--lead { margin: 0 0 var(--mp-spacing-4); }
.ne-section-title:not(:has(+ .ne-hint--lead)) { margin-bottom: var(--mp-spacing-4); }

.ne-grid { display: grid; gap: var(--mp-spacing-4); }
.ne-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ne-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
/* Project assignment stacks: Team members sits under Project manager, and the
   PM select keeps its half width rather than stretching (rule/form-select-half). */
/* Both assignment fields sit in the first column of the 3-column grid, so each is
   one column wide and lines up with the fields above, while still stacking —
   a select keeps its own row and never stretches (rule/form-select-half). */
.ne-assign-grid > * { grid-column: 1; }

/* Surfaces are separated by a 1px border, never a drop-shadow (DESIGN.md). */
/* A grid row that follows another one needs the same gap between them. */
.ne-grid--next { margin-top: var(--mp-spacing-4); }

/* ── Method picker ───────────────────────────────────────────────────────── */
.ne-methods { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.ne-method {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1); text-align: left; cursor: pointer;
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px);
  background: var(--mp-background-neutral, #ffffff); padding: var(--mp-spacing-4);
}
.ne-method:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.ne-method--picked, .ne-method--picked:hover { border-color: var(--mp-colors-border-selected); background: var(--mp-colors-background-success); }
.ne-method--invalid { border-color: var(--mp-colors-border-danger); }
.ne-method-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
/* Indented to the radio label's left edge (16px control + 12px gap). */
.ne-method-desc { padding-left: calc(var(--mp-sizes-4) + var(--mp-spacing-3)); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }

/* ── Dropdown option with its own open-in-a-new-tab action ──────────────── */
.ne-option { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); width: 100%; min-width: 0; }
.ne-option-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ne-option-open { flex-shrink: 0; }

/* ── Selected team members (mirrors the Cash account access picker) ──────── */
.ne-sel-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px);
  margin-bottom: var(--mp-spacing-3); overflow: hidden;
}
.ne-sel-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.ne-sel-row + .ne-sel-row { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.ne-sel-info { display: flex; flex-direction: column; min-width: 0; }
.ne-sel-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ne-sel-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ne-sel-tip { flex-shrink: 0; }
.ne-team { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-3); }
.ne-team .ne-sel-list { align-self: stretch; margin-bottom: 0; }

/* ── Repeatable lines ────────────────────────────────────────────────────── */
.ne-line { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.ne-line-pct { width: calc(var(--mp-sizes-10) * 3); flex-shrink: 0; }
.ne-line--head { margin-bottom: var(--mp-spacing-1); }
.ne-line-head { flex: 1; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ne-line-head.ne-line-pct { flex: none; }
.ne-line--head .ne-line-remove { width: var(--mp-sizes-10, 40px); }
.ne-line-remove { flex-shrink: 0; }
.ne-line-foot { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-wrap: wrap; margin-top: var(--mp-spacing-3); }
.ne-summary { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.ne-summary--ok { color: var(--mp-colors-text-success); }
.ne-summary--bad { color: var(--mp-text-danger); }

/* ── Actions ─────────────────────────────────────────────────────────────── */
.ne-approval {
  display: flex; align-items: center; gap: var(--mp-spacing-2); margin: var(--mp-spacing-6) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.ne-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-6); flex-wrap: wrap; }
</style>
