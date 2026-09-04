<script setup lang="ts">
/**
 * New expense (project-tagged) — the cost side of Project accounting.
 *
 * The point of this form is the **Project** column: tagging is PER LINE, matching
 * multi-dimensional tagging in Jurnal, so one document can split cost across several
 * projects and a line with no project posts normally with no project association.
 *
 * Hours are optional and analytical only — the amount is what posts and what the
 * client is charged. Filling them in is what lets the project report rate variance
 * later.
 *
 * This is the module's own form so the shared `NewExpensePage` (Expenses › Bills)
 * is left untouched.
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpAutocomplete, MpDatePicker, MpIcon, toast, MpTextlink,
} from '@mekari/pixel3'
import ProjectStatCards, { type ProjectStat } from '~/components/patterns/ProjectStatCards.vue'
import {
  saveExpense, projectOptions, findEngagement, actualCost,
  EXPENSE_ACCOUNT_OPTIONS, TAX_OPTIONS, TODAY, formatIdr, formatIdrSigned,
  type ExpenseDraftLine,
} from '~/data/projectAccounting'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

let seq = 0
const nextId = () => `l${(seq += 1)}`

const presetProject = String(route.query.project ?? '')

// MpDatePicker works in the display format (DESIGN.md → dd/mm/yyyy); the data
// layer stores ISO. Convert at the boundary, both ways.
function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }

// ── Draft ─────────────────────────────────────────────────────────────────────
const beneficiary = ref('')
const date = ref(toDisplayDate(TODAY))
const reference = ref('')
const memo = ref('')
const lines = reactive<ExpenseDraftLine[]>([
  { id: nextId(), account: EXPENSE_ACCOUNT_OPTIONS[0]!, description: '', project: presetProject, hours: '', tax: 'No tax', amount: '' },
  { id: nextId(), account: EXPENSE_ACCOUNT_OPTIONS[1]!, description: '', project: '', hours: '', tax: 'No tax', amount: '' },
])

const accountData = EXPENSE_ACCOUNT_OPTIONS.map(a => ({ id: a, name: a }))
const taxData = TAX_OPTIONS.map(a => ({ id: a, name: a }))
const projectData = computed(() => projectOptions().map(p => ({ id: p.id, name: p.name })))

function addLine() {
  lines.push({ id: nextId(), account: EXPENSE_ACCOUNT_OPTIONS[0]!, description: '', project: '', hours: '', tax: 'No tax', amount: '' })
}
function removeLine(id: string) {
  const i = lines.findIndex(l => l.id === id)
  if (i !== -1) lines.splice(i, 1)
}

const subtotal = computed(() => lines.reduce((a, l) => a + (Number(l.amount) || 0), 0))

function rateNote(l: ExpenseDraftLine): string {
  const h = Number(l.hours)
  const amt = Number(l.amount)
  return h > 0 && amt > 0 ? `${formatIdr(Math.round(amt / h))}/h` : ''
}

// ── Budget context strip ──────────────────────────────────────────────────────
// Only one document is ever on screen, so this follows the first tagged line.
const contextProject = computed(() => {
  const id = lines.find(l => l.project)?.project
  return id ? findEngagement(id) : undefined
})

const contextStats = computed<ProjectStat[]>(() => {
  const e = contextProject.value
  if (!e) return []
  const spent = actualCost(e)
  const thisDoc = lines.filter(l => l.project === e.id).reduce((a, l) => a + (Number(l.amount) || 0), 0)
  const remaining = e.budget === null ? null : e.budget - spent - thisDoc
  return [
    { key: 'budget', label: t('Budgeted cost'), value: e.budget === null ? t('Not set') : formatIdr(e.budget), tone: e.budget === null ? 'muted' : 'default' },
    { key: 'spent', label: t('Cost incurred'), value: formatIdr(spent) },
    { key: 'doc', label: t('This expense'), value: formatIdr(thisDoc) },
    {
      key: 'left',
      label: t('Remaining after saving'),
      value: remaining === null ? '—' : formatIdrSigned(remaining),
      tone: remaining !== null && remaining < 0 ? 'adverse' : 'positive',
    },
  ]
})

// ── Save ──────────────────────────────────────────────────────────────────────
const amountError = ref(false)
const beneficiaryError = ref(false)
const isSaving = ref(false)

async function save() {
  beneficiaryError.value = !beneficiary.value.trim()
  amountError.value = !lines.some(l => Number(l.amount) > 0)
  if (beneficiaryError.value || amountError.value) {
    toast.notify({
      variant: 'error',
      title: amountError.value ? t('Add at least one line with an amount') : t('Beneficiary is required'),
    })
    return
  }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  const res = saveExpense({ beneficiary: beneficiary.value, date: toISODate(date.value), lines: [...lines] })
  isSaving.value = false

  toast.notify({
    variant: 'success',
    title: `${res.docNo} ${t('saved')}. ${res.taggedIds.length} ${t('line(s) tagged to a project')}${res.untagged ? `, ${res.untagged} ${t('posted with no project association')}` : ''}.`,
    maxWidth: 'max-content',
  })
  if (res.taggedIds.length) router.push({ path: `/project-accounting/${res.taggedIds[0]}`, query: { tab: 'execution' } })
  else router.push('/project-accounting')
}

function cancel() {
  if (presetProject) router.push(`/project-accounting/${presetProject}`)
  else router.push('/project-accounting')
}
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar (form variant) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="px-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="cancel">{{ t('Project accounting') }}</MpTextlink>
        <h1 class="detail-title">{{ t('New expense') }}</h1>
        <p class="detail-subtitle">{{ t('Project is tagged per line item') }}</p>
      </div>
    </header>

    <div class="detail-stage">
      <!-- Live budget position for the project this document is being tagged to. -->
      <section v-if="contextStats.length" class="px-context">
        <p class="px-context-title">{{ t('Project budget') }} · {{ contextProject?.name }}</p>
        <ProjectStatCards :stats="contextStats" />
      </section>

      <div class="px-layout">
        <!-- ── Autofill ── -->
        <aside class="px-autofill">
          <p class="px-autofill-title">
            <MpIcon name="sparkle" size="sm" />
            {{ t('Autofill fields') }}
          </p>
          <div class="px-dropzone">
            <p class="px-dropzone-title">{{ t('Drop your receipt file here') }}</p>
            <p class="px-dropzone-desc">
              {{ t('Airene will read your file and fill in the details automatically. Supported formats: PDF, PNG, JPG. Maximum file size: 10 MB.') }}
            </p>
          </div>
        </aside>

        <!-- ── Document ── -->
        <div class="px-doc">
          <div class="px-head-grid">
            <MpFormControl id="px-beneficiary" is-required :is-invalid="beneficiaryError">
              <MpFormLabel>{{ t('Beneficiary') }}</MpFormLabel>
              <MpInput
                id="px-beneficiary-input" v-model="beneficiary" is-full-width :is-invalid="beneficiaryError"
                :placeholder="t('Vendor name')" @update:model-value="beneficiaryError = false"
              />
              <MpFormErrorMessage>{{ t('You must fill in beneficiary') }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="px-date">
              <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
              <MpDatePicker id="px-date-input" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal />
            </MpFormControl>

            <MpFormControl id="px-no">
              <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
              <MpInput id="px-no-input" :model-value="t('Auto')" is-full-width is-disabled />
            </MpFormControl>

            <MpFormControl id="px-ref">
              <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
              <MpInput id="px-ref-input" v-model="reference" is-full-width />
            </MpFormControl>
          </div>

          <!-- ── Lines ── -->
          <div class="px-table-scroll">
            <table class="px-table">
              <thead>
                <tr>
                  <th class="px-th">{{ t('Account') }}</th>
                  <th class="px-th">{{ t('Description') }}</th>
                  <th class="px-th px-th--project">{{ t('Project') }}</th>
                  <th class="px-th px-th--project px-th--num">{{ t('Hours') }}</th>
                  <th class="px-th">{{ t('Tax') }}</th>
                  <th class="px-th px-th--num">{{ t('Amount') }}</th>
                  <th class="px-th" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in lines" :key="l.id">
                  <td class="px-td">
                    <MpAutocomplete
                      :id="`px-acct-${l.id}`" v-model="l.account" :data="accountData"
                      label-prop="name" value-prop="id" use-portal is-full-width
                    />
                  </td>
                  <td class="px-td">
                    <MpInput :id="`px-desc-${l.id}`" v-model="l.description" is-full-width :placeholder="t('Description')" />
                  </td>
                  <td class="px-td px-td--project">
                    <MpAutocomplete
                      :id="`px-proj-${l.id}`" v-model="l.project" :data="projectData"
                      label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                      :placeholder="t('No project')"
                    />
                  </td>
                  <td class="px-td px-td--project px-td--num">
                    <MpInput :id="`px-hours-${l.id}`" v-model="l.hours" type="number" placeholder="—" is-full-width />
                    <p v-if="rateNote(l)" class="px-rate">{{ rateNote(l) }}</p>
                  </td>
                  <td class="px-td">
                    <MpAutocomplete
                      :id="`px-tax-${l.id}`" v-model="l.tax" :data="taxData"
                      label-prop="name" value-prop="id" use-portal is-full-width
                    />
                  </td>
                  <td class="px-td px-td--num">
                    <MpInputGroup :id="`px-amt-group-${l.id}`" is-full-width>
                      <MpInputLeftAddon>Rp</MpInputLeftAddon>
                      <MpInput :id="`px-amt-${l.id}`" v-model="l.amount" type="number" placeholder="0" is-full-width />
                    </MpInputGroup>
                  </td>
                  <td class="px-td px-td--del">
                    <button
                      type="button" class="btn-enterprise btn-enterprise--plain"
                      :aria-label="t('Remove line')" @click="removeLine(l.id)"
                    >
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="px-foot">
            <div class="px-foot-left">
              <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm btn-enterprise--icon-before" @click="addLine">
                <MpIcon name="add" size="sm" />
                {{ t('Add line') }}
              </button>
              <p class="px-hint">
                {{ t('Hours are optional and analytical only — the amount is what posts and what the client is charged. Project is tagged per line, matching multi-dimensional tagging in Jurnal — one transaction can split cost across several projects. A line with no project posts normally with no project association.') }}
              </p>
            </div>
            <div class="px-totals">
              <div class="px-total-row">
                <span class="px-total-key">{{ t('Subtotal') }}</span>
                <b class="px-num">{{ formatIdr(subtotal) }}</b>
              </div>
              <div class="px-total-row px-total-row--grand">
                <span>{{ t('Total') }}</span>
                <span class="px-num">{{ formatIdr(subtotal) }}</span>
              </div>
            </div>
          </div>

          <MpFormControl id="px-memo" class="px-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="px-memo-input" v-model="memo" is-full-width />
            <p class="px-hint">{{ t('Only visible to you and your team.') }}</p>
          </MpFormControl>

          <div class="px-actions">
            <button type="button" class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">
              {{ isSaving ? t('Saving...') : t('Save') }}
            </button>
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancel">{{ t('Cancel') }}</button>
          </div>
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
.detail-subtitle { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

/* ── Budget context strip ─────────────────────────────────────────────────── */
.px-context {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-4);
}
.px-context-title {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary);
}

/* ── Layout ───────────────────────────────────────────────────────────────── */
.px-layout {
  display: grid; grid-template-columns: 340px minmax(0, 1fr);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); overflow: hidden;
}
.px-autofill { border-right: 1px solid var(--mp-border-default); padding: var(--mp-spacing-5); background: var(--mp-background-neutral-subtle); }
.px-autofill-title {
  display: flex; align-items: center; gap: var(--mp-spacing-2); margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.px-dropzone {
  border: 1px dashed var(--mp-border-bold); border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-10, 40px) var(--mp-spacing-5); text-align: center;
}
.px-dropzone-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.px-dropzone-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-lg, 20px); }

.px-doc { padding: var(--mp-spacing-5) var(--mp-spacing-6); min-width: 0; }
.px-head-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-5); }

/* ── Line table ───────────────────────────────────────────────────────────── */
.px-table-scroll { overflow-x: auto; }
.px-table { width: 100%; border-collapse: collapse; min-width: 980px; }
.px-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
}
/* The two columns this form exists for get a tint so they read as one group. */
.px-th--project { background: var(--mp-background-success-subtle, #e8f4ef); color: var(--mp-text-default); }
.px-th--num { text-align: right; }
.px-td {
  padding: var(--mp-spacing-2); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default);
}
.px-td--project { background: var(--mp-background-success-subtle, #f5fbf8); }
.px-td--num { text-align: right; }
.px-td--del { width: var(--mp-sizes-12, 48px); text-align: right; }
.px-rate { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); text-align: right; }

/* ── Foot ─────────────────────────────────────────────────────────────────── */
.px-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); margin-top: var(--mp-spacing-4); flex-wrap: wrap; }
.px-foot-left { flex: 1; min-width: 280px; }
.px-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 520px; }
.px-totals { min-width: 260px; }
.px-total-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-1\.5, 6px) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); }
.px-total-row--grand { border-bottom: none; padding-top: var(--mp-spacing-2\.5, 10px); font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); }
.px-total-key { color: var(--mp-text-secondary); }
.px-num { font-variant-numeric: tabular-nums; }

.px-memo { display: block; margin-top: var(--mp-spacing-5); max-width: 640px; }
.px-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-6); }
</style>
