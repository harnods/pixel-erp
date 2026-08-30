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
} from '@mekari/pixel3'
import {
  createEngagement, draftWeightSum, formatIdr,
  COST_ACCOUNTS, REVENUE_ACCOUNT,
  type EngagementDraft, type RecognitionMethod,
} from '~/data/projectAccounting'

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
    desc: 'The client reimburses what the job cost and pays an agreed margin on top — no percentage of progress is calculated. Consulting, audit, retainer, cost-reimbursable work. Accountants call this cost-plus.',
  },
  {
    key: 'input',
    title: 'Input by Cost',
    desc: 'The job is as far along as the money spent says it is: cost spent ÷ cost planned. Billing runs on its own schedule. The input method, cost-to-cost.',
  },
  {
    key: 'output',
    title: 'Output by Milestone',
    desc: 'Revenue arrives only when a milestone is signed off, each one weighted. Verifying one earns and bills it in a single action. The output method.',
  },
]

const isCostPlus = computed(() => draft.method === 'tm')
const isOutput = computed(() => draft.method === 'output')
const valueLabel = computed(() => (isCostPlus.value ? t('Fee estimate') : t('Contract value')))

// ── Budget plan ───────────────────────────────────────────────────────────────
const plannedRevenue = computed(() => draft.budgetLines.revenue.reduce((a, l) => a + (Number(l.amount) || 0), 0))
const plannedCost = computed(() => draft.budgetLines.cost.reduce((a, l) => a + (Number(l.amount) || 0), 0))

function addRevenueLine() { draft.budgetLines.revenue.push({ id: nextId('br'), account: '', amount: '' }) }
function addCostLine() { draft.budgetLines.cost.push({ id: nextId('bc'), account: '', amount: '' }) }

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
    toast.notify({ variant: 'error', title: t('Engagement name and client are required') })
    return
  }
  if (isOutput.value && !weightsOk.value) {
    toast.notify({
      variant: 'error',
      title: t('Milestone weights must sum to 100% before this engagement can leave Setup'),
      maxWidth: 'max-content',
    })
    return
  }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  const created = createEngagement(draft)
  isSaving.value = false
  toast.notify({ variant: 'success', title: t('Engagement created and activated') })
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
          <p class="ne-section-desc">
            {{ t('An engagement letter, SOW or sales order becomes a tracked structure. How the project earns, chosen below, decides how revenue is recognized later; the budget applies either way.') }}
          </p>

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
              <MpInput
                id="ne-client-input" v-model="draft.client" is-full-width :is-invalid="clientError"
                :placeholder="t('e.g. PT Sinar Abadi')"
                @update:model-value="clientError = false"
              />
              <MpFormErrorMessage>{{ t('You must fill in client') }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Recognition method ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('How this project earns its revenue') }}</h2>
          <p class="ne-section-desc">
            {{ t('This picks the recognition engine used for the rest of the engagement — it is a property of the contract, not a reporting preference.') }}
          </p>
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
                <MpIcon v-if="draft.method === m.key" name="checkmark-circle-solid" size="sm" />
                {{ t(m.title) }}
              </span>
              <span class="ne-method-desc">{{ t(m.desc) }}</span>
            </button>
          </div>
        </section>

        <!-- ── Commercials ── -->
        <section class="ne-section">
          <div class="ne-grid ne-grid--3">
            <MpFormControl id="ne-pm">
              <MpFormLabel>{{ t('PM / owner') }}</MpFormLabel>
              <MpInput id="ne-pm-input" v-model="draft.pm" is-full-width :placeholder="t('e.g. Made Ardika')" />
            </MpFormControl>

            <MpFormControl id="ne-value">
              <MpFormLabel>{{ valueLabel }}</MpFormLabel>
              <MpInputGroup id="ne-value-group" is-full-width>
                <MpInputLeftAddon>Rp</MpInputLeftAddon>
                <MpInput id="ne-value-input" v-model="draft.value" type="number" placeholder="0" is-full-width />
              </MpInputGroup>
            </MpFormControl>

            <MpFormControl id="ne-budget">
              <MpFormLabel>{{ t('Estimated cost / budget') }}</MpFormLabel>
              <MpInputGroup id="ne-budget-group" is-full-width>
                <MpInputLeftAddon>Rp</MpInputLeftAddon>
                <MpInput id="ne-budget-input" v-model="draft.budget" type="number" placeholder="0" is-full-width />
              </MpInputGroup>
              <p class="ne-hint">{{ t('Available on every method. Drives Budget vs. Actual on the cost rollup.') }}</p>
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
            <p class="ne-hint">
              {{ t('This is the margin the contract entitles you to. Reviewers can waive it line by line, but they cannot exceed it.') }}
            </p>
          </div>
        </section>

        <!-- ── Project budget ── -->
        <section class="ne-section">
          <h2 class="ne-section-title">{{ t('Project budget') }}</h2>
          <p class="ne-section-desc">
            {{ t('Plan projected revenue and expense per account. Once set, every later step compares it against actuals — the same budget-variance shape used in Financials, scoped to this project. Leaving it empty falls back to the single estimated cost figure above.') }}
          </p>

          <h3 class="ne-subhead">{{ t('Projected revenue') }}</h3>
          <div v-for="l in draft.budgetLines.revenue" :key="l.id" class="ne-line">
            <MpInput :id="`ne-rev-acct-${l.id}`" v-model="l.account" is-full-width :placeholder="t('Account')" />
            <MpInputGroup :id="`ne-rev-amt-group-${l.id}`" class="ne-line-amount">
              <MpInputLeftAddon>Rp</MpInputLeftAddon>
              <MpInput :id="`ne-rev-amt-${l.id}`" v-model="l.amount" type="number" placeholder="0" />
            </MpInputGroup>
          </div>
          <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm btn-enterprise--icon-before" @click="addRevenueLine">
            <MpIcon name="add" size="sm" />
            {{ t('Revenue account') }}
          </button>

          <h3 class="ne-subhead">{{ t('Projected expense') }}</h3>
          <div v-for="l in draft.budgetLines.cost" :key="l.id" class="ne-line">
            <MpInput :id="`ne-cost-acct-${l.id}`" v-model="l.account" is-full-width :placeholder="t('Account')" />
            <MpInputGroup :id="`ne-cost-amt-group-${l.id}`" class="ne-line-amount">
              <MpInputLeftAddon>Rp</MpInputLeftAddon>
              <MpInput :id="`ne-cost-amt-${l.id}`" v-model="l.amount" type="number" placeholder="0" />
            </MpInputGroup>
          </div>
          <div class="ne-line-foot">
            <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm btn-enterprise--icon-before" @click="addCostLine">
              <MpIcon name="add" size="sm" />
              {{ t('Expense account') }}
            </button>
            <p class="ne-summary">
              {{ t('Projected revenue') }} {{ formatIdr(plannedRevenue) }} ·
              {{ t('projected cost') }} {{ formatIdr(plannedCost) }} ·
              {{ t('projected margin') }} {{ formatIdr(plannedRevenue - plannedCost) }}
            </p>
          </div>
        </section>

        <!-- ── Output milestones ── -->
        <section v-if="isOutput" class="ne-section">
          <h2 class="ne-section-title">{{ t('Output milestones') }}</h2>
          <p class="ne-section-desc">
            {{ t('Weights must sum to 100%. Verifying a milestone recognizes its share of contract value and creates its invoice in one action. A single 100% milestone reproduces completed-contract behaviour.') }}
          </p>
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
                ? t('Weights sum to 100%.')
                : `${t('Weights sum to')} ${weightSum}% — ${t('must be 100% to leave Setup.')}` }}
            </p>
          </div>
        </section>

        <!-- ── Actions ── -->
        <div class="ne-actions">
          <button type="button" class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">
            {{ isSaving ? t('Saving...') : t('Save') }}
          </button>
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancel">{{ t('Cancel') }}</button>
          <p class="ne-hint ne-hint--inline">{{ t('Saving activates the engagement so costs can be tagged to it straight away.') }}</p>
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
.ne-section-desc { margin: 0 0 var(--mp-spacing-5); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 820px; }
.ne-subhead {
  margin: var(--mp-spacing-5) 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary);
}
.ne-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ne-hint--inline { margin: 0; }

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

/* ── Repeatable lines ────────────────────────────────────────────────────── */
.ne-line { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.ne-line-amount { width: 220px; flex-shrink: 0; }
.ne-line-pct { width: 120px; flex-shrink: 0; }
.ne-line-remove { flex-shrink: 0; }
.ne-line-foot { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-wrap: wrap; margin-top: var(--mp-spacing-3); }
.ne-summary { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.ne-summary--ok { color: var(--mp-text-success, #028454); }
.ne-summary--bad { color: var(--mp-text-danger, #a8352d); }

/* ── Actions ─────────────────────────────────────────────────────────────── */
.ne-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-6); flex-wrap: wrap; }
</style>
