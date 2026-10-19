<script setup lang="ts">
/**
 * New expense (project-tagged) — the cost side of Project accounting.
 *
 * Tagging is PER LINE, matching multi-dimensional tagging in Jurnal, so one
 * document can split cost across several projects. Opened from a project, every
 * line (new ones too) starts tagged to it; Save warns inline before any priced
 * line posts with no project.
 *
 * Hours are optional and analytical only — the amount is what posts and what the
 * customer is charged.
 *
 * The line table copies NewExpensePage's `ex-*` markup (docs/patterns/FormTable.md).
 * This is the module's own form so the shared `NewExpensePage` is left untouched.
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpButton,
  MpBanner, MpBannerIcon, MpBannerDescription,
  MpInput, MpTextarea, MpAutocomplete, MpDatePicker, MpIcon, toast, MpTextlink,
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

/** Every line, new ones included, starts on the project the form was opened from. */
function blankLine(account: string): ExpenseDraftLine {
  return { id: nextId(), account, description: '', project: presetProject, hours: '', tax: 'No tax', amount: '' }
}
const lines = reactive<ExpenseDraftLine[]>([
  blankLine(EXPENSE_ACCOUNT_OPTIONS[0]!),
  blankLine(EXPENSE_ACCOUNT_OPTIONS[1]!),
])

const accountData = EXPENSE_ACCOUNT_OPTIONS.map(a => ({ id: a, name: a }))
const taxData = TAX_OPTIONS.map(a => ({ id: a, name: a }))
const projectData = computed(() => projectOptions().map(p => ({ id: p.id, name: p.name })))

function addLine() { lines.push(blankLine(EXPENSE_ACCOUNT_OPTIONS[0]!)) }
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
      value: remaining === null ? t('No budget') : formatIdrSigned(remaining),
      tone: remaining === null ? 'muted' : remaining < 0 ? 'adverse' : 'positive',
    },
  ]
})

// ── Save ──────────────────────────────────────────────────────────────────────
// Every error shows inline; nothing is reported by toast.
const amountError = ref(false)
const beneficiaryError = ref(false)
const isSaving = ref(false)
/** Set when Save found priced lines with no project; the next Save posts anyway. */
const untaggedWarned = ref(false)

const untaggedCount = computed(() => lines.filter(l => Number(l.amount) > 0 && !l.project).length)
const showUntaggedWarning = computed(() => untaggedWarned.value && untaggedCount.value > 0)

watch(untaggedCount, (n) => { if (n === 0) untaggedWarned.value = false })

async function save() {
  beneficiaryError.value = !beneficiary.value.trim()
  amountError.value = !lines.some(l => Number(l.amount) > 0)
  if (beneficiaryError.value || amountError.value) return
  if (untaggedCount.value > 0 && !untaggedWarned.value) {
    untaggedWarned.value = true
    return
  }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  const res = saveExpense({ beneficiary: beneficiary.value, date: toISODate(date.value), lines: [...lines] })
  isSaving.value = false

  toast.notify({
    variant: 'success',
    title: t('Expense {no} saved').replace('{no}', res.docNo),
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
      </div>
    </header>

    <div class="detail-stage">
      <!-- Live budget position for the project this document is being tagged to. -->
      <section v-if="contextStats.length" class="px-context">
        <p class="px-context-title">{{ t('Budget') }} · {{ contextProject?.name }}</p>
        <ProjectStatCards :stats="contextStats" />
      </section>

      <!-- ── Receipt autofill: one compact strip above the form, so the line
           table keeps the full stage width ── -->
      <div class="px-dropzone">
        <MpIcon name="sparkle" size="sm" class="px-dropzone-icon" />
        <div class="px-dropzone-text">
          <p class="px-dropzone-title">{{ t('Drop your receipt file here') }}</p>
          <p class="px-dropzone-desc">
            {{ t('Airene fills in the details from your receipt. File must be in PDF, PNG or JPG with a maximum of 10 MB') }}
          </p>
        </div>
      </div>

      <!-- ── Document ── -->
      <div class="px-doc">
        <div class="px-head-grid">
          <MpFormControl id="px-beneficiary" is-required :is-invalid="beneficiaryError">
            <MpFormLabel>{{ t('Beneficiary') }}</MpFormLabel>
            <MpInput
              id="px-beneficiary-input" v-model="beneficiary" is-full-width :is-invalid="beneficiaryError"
              @update:model-value="beneficiaryError = false"
            />
            <MpFormErrorMessage>{{ t('You must fill in beneficiary') }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="px-date">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <MpDatePicker id="px-date-input" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>

          <MpFormControl id="px-no">
            <MpFormLabel>{{ t('Transaction number') }}</MpFormLabel>
            <MpInput id="px-no-input" :model-value="t('Auto')" is-full-width is-disabled />
          </MpFormControl>

          <MpFormControl id="px-ref">
            <MpFormLabel>{{ t('Reference number') }}</MpFormLabel>
            <MpInput id="px-ref-input" v-model="reference" is-full-width />
          </MpFormControl>
        </div>

        <MpBanner v-if="showUntaggedWarning" id="px-untagged-banner" variant="warning" align-items="center" class="px-banner">
          <MpBannerIcon id="px-untagged-banner-icon" />
          <MpBannerDescription>
            {{ (untaggedCount === 1
              ? t('1 line has no project, so its cost will not count toward any project. Pick a project, or save again to post it without one.')
              : t('{n} lines have no project, so their cost will not count toward any project. Pick a project, or save again to post them without one.').replace('{n}', String(untaggedCount))) }}
          </MpBannerDescription>
        </MpBanner>

        <!-- ── Lines (NewExpensePage ex-* markup) ── -->
        <div class="ex-table-section">
          <table class="ex-table px-lines">
            <colgroup>
              <col class="px-col-account" />
              <col class="px-col-desc" />
              <col class="px-col-amount" />
              <col class="px-col-project" />
              <col class="px-col-hours" />
              <col class="px-col-tax" />
              <col class="px-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="ex-th">{{ t('Account') }}</th>
                <th class="ex-th">{{ t('Description') }}</th>
                <th class="ex-th ex-th--num">{{ t('Amount') }}</th>
                <th class="ex-th">{{ t('Project') }}</th>
                <th class="ex-th ex-th--num">{{ t('Hours') }}</th>
                <th class="ex-th">{{ t('Tax') }}</th>
                <th class="ex-th ex-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lines" :key="l.id" class="ex-tr">
                <td class="ex-td ex-td--input ex-td--border" :title="l.account">
                  <MpAutocomplete
                    :id="`px-acct-${l.id}`" v-model="l.account" :data="accountData"
                    label-prop="name" value-prop="id" use-portal is-full-width
                  />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpInput :id="`px-desc-${l.id}`" v-model="l.description" is-full-width :aria-label="t('Description')" />
                </td>
                <td class="ex-td ex-td--input ex-td--border ex-td--amount" :class="{ 'ex-td--error': amountError && !(Number(l.amount) > 0) }">
                  <div class="ex-amount-cell">
                    <span class="ex-amount-prefix">Rp</span>
                    <MpInput
                      :id="`px-amt-${l.id}`" v-model="l.amount" type="number" is-full-width class="ex-amount-input"
                      :aria-label="t('Amount')" @update:model-value="amountError = false"
                    />
                  </div>
                </td>
                <td class="ex-td ex-td--input ex-td--border" :class="{ 'px-td--warn': showUntaggedWarning && Number(l.amount) > 0 && !l.project }">
                  <MpAutocomplete
                    :id="`px-proj-${l.id}`" v-model="l.project" :data="projectData"
                    label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                    :placeholder="t('No project')"
                  />
                </td>
                <td class="ex-td ex-td--input ex-td--border" :title="rateNote(l)">
                  <MpInput :id="`px-hours-${l.id}`" v-model="l.hours" type="number" is-full-width class="px-num-input" :aria-label="t('Hours')" />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpAutocomplete
                    :id="`px-tax-${l.id}`" v-model="l.tax" :data="taxData"
                    label-prop="name" value-prop="id" use-portal is-full-width
                  />
                </td>
                <td class="ex-td ex-td--del">
                  <div class="ex-cell-center">
                    <MpButton class="ex-del-btn" is-rounded :aria-label="t('Remove line')" @click="removeLine(l.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="amountError" class="px-error">{{ t('Enter an amount on at least one line') }}</p>

        <div class="px-foot">
          <div class="px-foot-left">
            <MpButton variant="secondary" is-rounded left-icon="add" @click="addLine">{{ t('Add line') }}</MpButton>
            <MpFormControl id="px-memo" class="px-memo">
              <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
              <MpTextarea id="px-memo-input" v-model="memo" is-full-width />
              <p class="px-hint">{{ t('Only visible to you and your team') }}</p>
            </MpFormControl>
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

        <div class="px-actions">
          <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-loading="isSaving" @click="save">
            {{ showUntaggedWarning ? t('Save anyway') : t('Save') }}
          </MpButton>
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
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

/* ── Budget context strip ─────────────────────────────────────────────────── */
.px-context {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-4);
}
.px-context-title {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
}

/* ── Receipt autofill strip ───────────────────────────────────────────────── */
.px-dropzone {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  border: 1px dashed var(--mp-border-bold); border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.px-dropzone-icon { flex-shrink: 0; color: var(--mp-text-secondary); }
.px-dropzone-text { min-width: 0; }
.px-dropzone-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.px-dropzone-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.px-doc { min-width: 0; }
.px-head-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-5); }
.px-banner { margin-bottom: var(--mp-spacing-4); }

/* ── Line table: NewExpensePage ex-* markup (FormTable.md) ───────────────── */
.ex-table-section { border-bottom: 1px solid var(--mp-border-default); }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
/* Fits a 1280 stage without scrolling: Description takes what is left. */
.px-col-account { width: 224px; }
.px-col-amount { width: 168px; }
.px-col-project { width: 192px; }
.px-col-hours { width: 80px; }
.px-col-tax { width: 112px; }
.px-col-del { width: var(--mp-sizes-11, 44px); }
.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ex-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.ex-th--del { padding: 0; }
.ex-td {
  height: var(--mp-sizes-10, 40px); padding: 0; vertical-align: top;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.ex-tr:last-child .ex-td { border-bottom: none; }
.ex-td--input { position: relative; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10, 40px);
  box-shadow: inset 0 0 0 2px var(--mp-colors-border-focused); pointer-events: none; /* pixel-police-allow-shadow: focus ring, not a surface lift */
}
.ex-td--border { border-right: 1px solid var(--mp-border-default); }
/* Pixel inputs carry an intrinsic min width; let them shrink to the column. */
.ex-td--input :deep(.mp-input__root), .ex-td--input :deep(input) { min-width: 0; width: 100%; }
.ex-td--del { text-align: center; }
.ex-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-10, 40px); }
.ex-td--error { background: var(--mp-colors-background-danger); }
.px-td--warn { background: var(--mp-colors-background-warning); }
.ex-td--error :deep([class*='autocomplete']), .ex-td--error :deep([class*='input']),
.px-td--warn :deep([class*='autocomplete']), .px-td--warn :deep([class*='input']) { background: transparent; }
.ex-td--amount { position: relative; }
.ex-amount-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ex-amount-cell :deep(.mp-input__root) { flex: 1; min-width: 0; height: var(--mp-sizes-10, 40px); }
.ex-amount-cell :deep(input), :deep(input.px-num-input) { text-align: right; font-variant-numeric: tabular-nums; }
.ex-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-secondary);
}
.ex-del-btn:hover { color: var(--mp-text-danger); }
.px-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

/* ── Foot ─────────────────────────────────────────────────────────────────── */
.px-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); margin-top: var(--mp-spacing-3); flex-wrap: wrap; }
.px-foot-left { flex: 1; min-width: 280px; display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-5); }
.px-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.px-totals { min-width: 260px; }
.px-total-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-1\.5, 6px) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); }
.px-total-row--grand { border-bottom: none; padding-top: var(--mp-spacing-2\.5, 10px); font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); }
.px-total-key { color: var(--mp-text-secondary); }
.px-num { font-variant-numeric: tabular-nums; }

.px-memo { display: block; align-self: stretch; max-width: 640px; }
.px-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-6); }
</style>
