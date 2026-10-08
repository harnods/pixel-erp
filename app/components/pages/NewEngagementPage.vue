<script setup lang="ts">
/**
 * New engagement — the Setup step of Project accounting.
 *
 * An engagement letter, SOW or sales order becomes a tracked structure here. The
 * one irreversible choice on this form is **how the project earns**: it picks the
 * recognition engine used for the rest of the engagement's life. The budget applies
 * either way.
 *
 * A `detailMatch` route, so this page owns its whole layout — its own 72px title
 * bar and its own stage padding (DESIGN.md → Layout).
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpIcon, toast, MpTextlink,
  MpAutocomplete, MpTooltip,
} from '@mekari/pixel3'
import SelectAccessDrawer, { type AccessOption } from '~/components/patterns/SelectAccessDrawer.vue'
import {
  createEngagement, draftWeightSum,
  COST_ACCOUNTS, REVENUE_ACCOUNT,
  type EngagementDraft, type RecognitionMethod,
} from '~/data/projectAccounting'
import { contactsOfType } from '~/data/contacts'
import { budget, BUDGET_YEAR, lineById, lineTitle, lineTotal, isSavingLine } from '~/data/budgetStore'
import { accessUsers, projectLeadUsers } from '~/data/accessControl'

const router = useRouter()
const { t } = useLocale()

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

const METHOD_CHOICES: { key: RecognitionMethod; title: string; desc: string }[] = [
  {
    key: 'tm',
    title: 'Input by Simplified Cost',
    desc: 'Revenue is each reviewed cost line plus the agreed margin.',
  },
  {
    key: 'input',
    title: 'Input by Cost',
    desc: 'Revenue follows the share of budgeted cost spent. Invoices follow a separate billing schedule.',
  },
  {
    key: 'output',
    title: 'Output by Milestone',
    desc: 'Revenue is recognised when a weighted milestone is verified. The milestone is then ready to invoice.',
  },
]

const isCostPlus = computed(() => draft.method === 'tm')
const isOutput = computed(() => draft.method === 'output')
const valueLabel = computed(() => (isCostPlus.value ? t('Fee estimate') : t('Contract value')))

// ── Client ────────────────────────────────────────────────────────────────────
// Picked from the Contacts master rather than typed, so an engagement always
// names a contact that exists. Stored as the display name (Engagement.client is
// a string), which keeps the seeded engagements readable as-is.
const clientData = computed(() =>
  contactsOfType('customer')
    .filter(c => !c.archived && c.displayName)
    .map(c => ({ id: c.id, name: c.displayName })),
)

// ── Budget line ───────────────────────────────────────────────────────────────
// The Accounting > Budgets line this engagement draws against. Saving-bucket
// lines are not a spendable budget, so they are left out of the picker.
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

// Everything below leaves this page in a new tab (window.open — the pattern
// ErpDimensionsInfoPopover and DimensionFormDrawer already use), so a
// half-filled Setup form is never lost to a detour.

/** Read one budget without selecting it first. */
function openBudgetLine(id: string) {
  if (!id) return
  window.open(`/budget-lines/${id}`, '_blank', 'noopener')
}

/** Create a contact the Client list does not have yet. */
function openNewContact() { window.open('/customers/new', '_blank', 'noopener') }

/** Create a budget line. `action=new` opens the Add drawer on arrival. */
function openNewBudget() { window.open('/budget-lines?action=new', '_blank', 'noopener') }

// ── Project assignment ────────────────────────────────────────────────────────
// Only Owner / Ultimate / Project Manager can lead a project; a team member is
// anyone. Membership is recorded here — what each member may SEE is governed by
// their own role permissions, which this prototype does not yet gate on.
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
// No disabled action buttons for validation (DESIGN.md) — the button stays
// clickable and validates on click.
const nameError = ref(false)
const clientError = ref(false)
const isSaving = ref(false)

async function save() {
  nameError.value = !draft.name.trim()
  clientError.value = !draft.client.trim()
  if (nameError.value || clientError.value) {
    toast.notify({ variant: 'error', title: t('Fill in engagement name and client') })
    return
  }
  if (isOutput.value && !weightsOk.value) {
    toast.notify({
      variant: 'error',
      title: t('Milestone weights must add up to 100%'),
      maxWidth: 'max-content',
    })
    return
  }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  const created = createEngagement(draft)
  isSaving.value = false
  toast.notify({ variant: 'success', title: t('Engagement created') })
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
        <h1 class="detail-title">{{ t('New engagement') }}</h1>
      </div>
    </header>

    <div class="detail-stage">
      <div class="ne-form">
        <!-- ── Engagement details ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('Engagement details') }}</h2>

          <div class="ne-grid ne-grid--2">
            <MpFormControl id="ne-name" is-required :is-invalid="nameError">
              <MpFormLabel>{{ t('Engagement name') }}</MpFormLabel>
              <MpInput
                id="ne-name-input" v-model="draft.name" is-full-width :is-invalid="nameError"
                :placeholder="t('e.g. Cikarang Warehouse Construction')"
                @update:model-value="nameError = false"
              />
              <MpFormErrorMessage>{{ t('You must fill in engagement name') }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="ne-client" is-required :is-invalid="clientError">
              <MpFormLabel>{{ t('Client') }}</MpFormLabel>
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
              <MpFormErrorMessage>{{ t('You must fill in client') }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Recognition method ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('Revenue recognition method') }}</h2>
          <p class="ne-hint ne-hint--lead">{{ t('The method cannot be changed after the engagement is created') }}</p>
          <div class="ne-methods">
            <button
              v-for="m in METHOD_CHOICES"
              :key="m.key"
              type="button"
              class="ne-method"
              :class="{ 'ne-method--picked': draft.method === m.key }"
              :aria-pressed="draft.method === m.key"
              @click="draft.method = m.key"
            >
              <span class="ne-method-title">
                <MpIcon v-if="draft.method === m.key" name="check" size="sm" />
                {{ t(m.title) }}
              </span>
              <span class="ne-method-desc">{{ t(m.desc) }}</span>
            </button>
          </div>
        </section>

        <!-- ── Commercials ── -->
        <section class="ne-section">
          <div class="ne-grid ne-grid--3">
            <MpFormControl id="ne-value">
              <MpFormLabel>{{ valueLabel }}</MpFormLabel>
              <MpInputGroup id="ne-value-group" is-full-width>
                <MpInputLeftAddon>Rp</MpInputLeftAddon>
                <MpInput id="ne-value-input" v-model="draft.value" type="number" placeholder="0" is-full-width />
              </MpInputGroup>
            </MpFormControl>

            <MpFormControl id="ne-budget-line">
              <MpFormLabel>{{ t('Budget') }}</MpFormLabel>
              <MpAutocomplete
                id="ne-budget-line-input" v-model="draft.budgetLineId" :data="budgetLineData"
                label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                :placeholder="t('Select a budget')"
                is-show-button-action
                @update:model-value="onBudgetLinePicked"
                @button-action="openNewBudget"
              >
                <!-- Each budget carries its own open-in-a-new-tab icon, so a budget
                     can be read without first selecting it. -->
                <template #default="{ item }">
                  <span class="ne-option">
                    <span class="ne-option-label">{{ item.name }}</span>
                    <button
                      type="button"
                      class="btn-enterprise btn-enterprise--plain ne-option-open"
                      :aria-label="`${t('Open budget in a new tab')}: ${item.name}`"
                      @click.stop.prevent="openBudgetLine(item.id)"
                    >
                      <MpIcon name="newtab" size="sm" />
                    </button>
                  </span>
                </template>
                <template #buttonAction>{{ t('Add new budget') }}</template>
              </MpAutocomplete>
              <p class="ne-hint">{{ t('The budget line this engagement draws against') }}</p>
            </MpFormControl>

            <MpFormControl id="ne-budget">
              <MpFormLabel>{{ t('Budgeted cost') }}</MpFormLabel>
              <MpInputGroup id="ne-budget-group" is-full-width>
                <MpInputLeftAddon>Rp</MpInputLeftAddon>
                <MpInput id="ne-budget-input" v-model="draft.budget" type="number" placeholder="0" is-full-width />
              </MpInputGroup>
              <p class="ne-hint">{{ t('Filled from the selected budget. Editable') }}</p>
            </MpFormControl>
          </div>

          <!-- Cost-plus only: the margin the contract entitles you to. -->
          <div v-if="isCostPlus" class="ne-box ne-box--narrow">
            <MpFormControl id="ne-markup" is-required>
              <MpFormLabel>{{ t('Agreed margin on cost') }}</MpFormLabel>
              <MpInputGroup id="ne-markup-group">
                <MpInput id="ne-markup-input" v-model="draft.markup" type="number" placeholder="20" />
                <MpInputRightAddon>%</MpInputRightAddon>
              </MpInputGroup>
            </MpFormControl>
            <p class="ne-hint">{{ t('Maximum margin charged on a cost line. Reviewers can waive it per line') }}</p>
          </div>
        </section>

        <!-- ── Project assignment ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('Project assignment') }}</h2>
          <p class="ne-hint ne-hint--lead">{{ t('Who leads the project, and who works on it') }}</p>
          <div class="ne-grid ne-grid--2">
            <MpFormControl id="ne-pm">
              <MpFormLabel>{{ t('Project manager') }}</MpFormLabel>
              <MpAutocomplete
                id="ne-pm-input" v-model="draft.pm" :data="pmData"
                label-prop="name" value-prop="name" use-portal is-full-width
                :placeholder="t('Select a project manager')"
              />
              <p class="ne-hint">{{ t('Users with the Owner, Ultimate or Project Manager role') }}</p>
            </MpFormControl>

            <MpFormControl id="ne-team">
              <MpFormLabel>{{ t('Team member') }}</MpFormLabel>
              <div v-if="teamRows.length" class="ne-sel-list">
                <div v-for="m in teamRows" :key="m.id" class="ne-sel-row">
                  <span class="ne-sel-info">
                    <span class="ne-sel-name">{{ m.name }}</span>
                    <span v-if="m.subtitle" class="ne-sel-sub">{{ m.subtitle }}</span>
                  </span>
                  <MpTooltip :id="`ne-rm-member-${m.id}`" :label="t('Remove')" placement="top" use-portal class="ne-sel-tip">
                    <button class="btn-enterprise btn-enterprise--plain ne-sel-remove" type="button" :aria-label="t('Remove')" @click="removeMember(m.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </MpTooltip>
                </div>
              </div>
              <button
                type="button"
                class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm ne-add-btn"
                @click="teamDrawerOpen = true"
              >
                {{ t('Add team member') }}
              </button>
              <p class="ne-hint">{{ t('What each member can see follows their own role permissions') }}</p>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Output milestones ── -->
        <section v-if="isOutput" class="ne-section">
          <h2 class="ne-section-title">{{ t('Milestones') }}</h2>
          <div v-for="m in draft.milestones" :key="m.id" class="ne-line">
            <MpInput :id="`ne-ms-label-${m.id}`" v-model="m.label" is-full-width :placeholder="t('Milestone name')" />
            <MpInputGroup :id="`ne-ms-pct-group-${m.id}`" class="ne-line-pct">
              <MpInput :id="`ne-ms-pct-${m.id}`" v-model="m.pct" type="number" placeholder="0" />
              <MpInputRightAddon>%</MpInputRightAddon>
            </MpInputGroup>
            <button
              type="button"
              class="btn-enterprise btn-enterprise--plain ne-line-remove"
              :aria-label="t('Remove milestone')"
              @click="removeMilestone(m.id)"
            >
              <MpIcon name="minus-circular" size="sm" />
            </button>
          </div>
          <div class="ne-line-foot">
            <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm btn-enterprise--icon-before" @click="addMilestone">
              <MpIcon name="add" size="sm" />
              {{ t('Add milestone') }}
            </button>
            <p class="ne-summary" :class="weightsOk ? 'ne-summary--ok' : 'ne-summary--bad'">
              {{ weightsOk
                ? t('Weights add up to 100%')
                : `${t('Weights add up to')} ${weightSum}%. ${t('They must add up to 100%')}` }}
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
        <div class="ne-actions">
          <button type="button" class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">
            {{ isSaving ? t('Saving...') : t('Save') }}
          </button>
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancel">{{ t('Cancel') }}</button>
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
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6);
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
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}

/* ── Form ────────────────────────────────────────────────────────────────── */
.ne-form { max-width: 960px; }
.ne-section { padding: var(--mp-spacing-6) 0; border-bottom: 1px dashed var(--mp-border-default); }
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

/* Surfaces are separated by a 1px border, never a drop-shadow (DESIGN.md). */
.ne-box {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-4); margin-top: var(--mp-spacing-4);
}
.ne-box--narrow { max-width: 520px; }

/* ── Method picker ───────────────────────────────────────────────────────── */
.ne-methods { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.ne-method {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1); text-align: left; cursor: pointer;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  background: var(--mp-background-neutral); padding: var(--mp-spacing-4);
}
.ne-method:hover { background: var(--mp-background-neutral-hovered); }
.ne-method--picked { border-color: var(--mp-border-selected, #029861); background: var(--mp-background-selected, #e8f4ef); }
.ne-method-title {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ne-method-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }

/* ── Dropdown option with its own open-in-a-new-tab action ──────────────── */
.ne-option { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); width: 100%; min-width: 0; }
.ne-option-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ne-option-open { flex-shrink: 0; padding: var(--mp-spacing-1); min-width: 0; }
.ne-option-open:hover { color: var(--mp-text-link); }

/* ── Selected team members (mirrors the Cash account access picker) ──────── */
.ne-sel-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  margin-bottom: var(--mp-spacing-3); overflow: hidden;
}
.ne-sel-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.ne-sel-row + .ne-sel-row { border-top: 1px solid var(--mp-border-default); }
.ne-sel-info { display: flex; flex-direction: column; min-width: 0; }
.ne-sel-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ne-sel-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ne-sel-tip { flex-shrink: 0; }
.ne-sel-remove { flex-shrink: 0; padding: var(--mp-spacing-1); min-width: 0; }
.ne-add-btn { align-self: flex-start; }

/* ── Repeatable lines ────────────────────────────────────────────────────── */
.ne-line { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.ne-line-pct { width: 120px; flex-shrink: 0; }
.ne-line-remove { flex-shrink: 0; }
.ne-line-foot { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-wrap: wrap; margin-top: var(--mp-spacing-3); }
.ne-summary { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.ne-summary--ok { color: var(--mp-text-success, #028454); }
.ne-summary--bad { color: var(--mp-text-danger, #a8352d); }

/* ── Actions ─────────────────────────────────────────────────────────────── */
.ne-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-6); flex-wrap: wrap; }
</style>
