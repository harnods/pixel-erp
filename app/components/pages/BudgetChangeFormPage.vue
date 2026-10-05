<script setup lang="ts">
/**
 * New or draft budget change (FG-4, FG-3 funding, FG-5 saving). One form for
 * every kind: ?kind=Transfer | Funding request | Mid-year insert | Revision |
 * Saving fill | Saving draw, or ?edit=<change id> for a draft. Funding requests
 * take ?pr=<budget request id>; saving fills take ?from=<line id>; saving draws
 * take ?slice=<slice key>. Submit holds the donor's cut at once.
 */
import { MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpButton, MpRadio, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import BudgetChangeChain from '~/components/patterns/BudgetChangeChain.vue'
import { formatIDRWhole } from '~/utils/currency'
import { successToast, infoToast } from '~/utils/toasts'
import {
  budget, BUDGET_CURRENT_MONTH, actingPerson, changeById, lineById, lineClass, yearFigures, monthFigures, donorMax, lineTotal,
  suggestDonors, prById, prTotal, prLink, savingLine, savingSlices, sliceKey, sliceBalance, routeChain, validateChange,
  previewChange, saveChangeDraft, submitChangeDraft, canPrepareChange, canEditChange,
  type ChangeKind, type ChangeReceiver, type ChangeDraftInput, type SavingType,
} from '~/data/budgetStore'
import { budgetAccount, deptName, projectName } from '~/data/budgetMaster'
import {
  isChangeKind, lineName, lineOptions, ACCOUNT_OPTIONS, DEPARTMENT_OPTIONS, PROJECT_OPTIONS, NO_PROJECT, MONTH_OPTIONS,
  FUNDING_REASON_CODES, SAVING_TYPES, sliceOptions, sliceLabel, blockedRequests, fundingGap, newLineClash, parseRupiahInput,
  groupDigits, monthLabel,
} from '~/data/budgetUiChanges'

defineProps<{ orderId?: string }>()

const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

// ── Form state ─────────────────────────────────────────────────────────────
interface RecvRow { key: number; mode: 'line' | 'new'; lineId: string; account: string; dept: string; project: string; amount: number }
let rowSeq = 1
const blankRow = (mode: 'line' | 'new' = 'line'): RecvRow => ({ key: rowSeq++, mode, lineId: '', account: '', dept: '', project: NO_PROJECT, amount: 0 })

const editId = ref('')
const baseKind = ref<ChangeKind>('Transfer')
const month = ref(BUDGET_CURRENT_MONTH)
const donorLineId = ref('')
const donorAmount = ref(0)
const rows = ref<RecvRow[]>([blankRow()])
const reason = ref('')
const reasonCode = ref('')
const prId = ref('')
const savingType = ref<SavingType>('Procurement')
const sourceDoc = ref('')
const drawSlice = ref('')
const revisionLineId = ref('')
const revisionAmount = ref(0)
const loadError = ref('')

function load() {
  const edit = q('edit')
  if (edit) {
    const c = changeById(edit)
    if (!c) { loadError.value = t('This change no longer exists.'); return }
    editId.value = c.id
    baseKind.value = c.kind
    month.value = c.month
    reason.value = c.reason
    reasonCode.value = c.reasonCode ?? ''
    prId.value = c.linkedPrId ?? ''
    if (c.kind === 'Revision') {
      revisionLineId.value = c.receivers[0]?.lineId ?? ''
      revisionAmount.value = c.receivers[0]?.amount ?? 0
      return
    }
    donorLineId.value = c.donor?.lineId ?? ''
    donorAmount.value = c.donor?.amount ?? c.receivers.reduce((s, r) => s + r.amount, 0)
    if (c.saving) { savingType.value = c.saving.type; sourceDoc.value = c.saving.sourceDoc }
    if (c.kind === 'Saving draw' && c.saving) drawSlice.value = sliceKey(c.saving)
    rows.value = c.receivers.length
      ? c.receivers.map((r) => ({ key: rowSeq++, mode: r.lineId ? 'line' : 'new', lineId: r.lineId ?? '', account: r.newLine?.account ?? '', dept: r.newLine?.dept ?? '', project: r.newLine?.project ?? NO_PROJECT, amount: r.amount }))
      : [blankRow()]
    return
  }
  const k = q('kind')
  baseKind.value = isChangeKind(k) ? k : 'Transfer'
  if (baseKind.value === 'Mid-year insert') rows.value = [blankRow('new')]
  if (baseKind.value === 'Funding request') pickRequest(q('pr'))
  if (baseKind.value === 'Saving fill') donorLineId.value = lineById(q('from')) ? q('from') : ''
  if (baseKind.value === 'Saving draw') drawSlice.value = savingSlices().some((s) => s.key === q('slice')) ? q('slice') : ''
}

/** Funding request: the receiver is the blocked line; the gap is the default ask. */
function pickRequest(id: string) {
  const pr = prById(id)
  prId.value = pr ? pr.id : ''
  if (!pr) return
  const lineId = pr.block?.lineId ?? pr.lines[0]?.lineId ?? ''
  const gap = pr.block?.short ?? 0
  month.value = pr.month
  rows.value = [{ ...blankRow(), lineId }]
  donorAmount.value = gap
  donorLineId.value = lineId ? (suggestDonors(lineId, gap)[0]?.lineId ?? '') : ''
  if (!reason.value) reason.value = `Funding for ${pr.number}`
}

load()

// ── Derived kind and the change the form describes ─────────────────────────
const kind = computed<ChangeKind>(() => {
  if (baseKind.value === 'Transfer' || baseKind.value === 'Mid-year insert') return rows.value.some((r) => r.mode === 'new') ? 'Mid-year insert' : 'Transfer'
  return baseKind.value
})
const isTransferFamily = computed(() => kind.value === 'Transfer' || kind.value === 'Mid-year insert')
const slice = computed(() => savingSlices().find((s) => s.key === drawSlice.value))
const bucket = computed(() => savingLine())

const input = computed<ChangeDraftInput>(() => {
  const base = { kind: kind.value, month: month.value, reason: reason.value, reasonCode: reasonCode.value || null, linkedPrId: kind.value === 'Funding request' ? prId.value || null : null, saving: null }
  if (kind.value === 'Revision') {
    return { ...base, donor: null, receivers: [{ lineId: revisionLineId.value || null, newLine: null, amount: revisionAmount.value }] }
  }
  if (kind.value === 'Saving fill') {
    const from = lineById(donorLineId.value)
    return {
      ...base,
      donor: from ? { lineId: from.id, amount: donorAmount.value } : null,
      receivers: bucket.value ? [{ lineId: bucket.value.id, newLine: null, amount: donorAmount.value }] : [],
      saving: from ? { dept: from.dept, project: from.project, class: lineClass(from) ?? 'Opex', type: savingType.value, sourceDoc: sourceDoc.value.trim() } : null,
    }
  }
  if (kind.value === 'Saving draw') {
    const r = rows.value[0]!
    return {
      ...base,
      donor: bucket.value ? { lineId: bucket.value.id, amount: donorAmount.value } : null,
      receivers: [{ lineId: r.lineId || null, newLine: null, amount: donorAmount.value }],
      saving: slice.value ? { dept: slice.value.dept, project: slice.value.project, class: slice.value.class, type: slice.value.type, sourceDoc: '' } : null,
    }
  }
  if (kind.value === 'Funding request') {
    const r = rows.value[0]!
    return { ...base, donor: donorLineId.value ? { lineId: donorLineId.value, amount: donorAmount.value } : null, receivers: [{ lineId: r.lineId || null, newLine: null, amount: donorAmount.value }] }
  }
  return {
    ...base,
    donor: donorLineId.value ? { lineId: donorLineId.value, amount: donorAmount.value } : null,
    receivers: rows.value.map((r): ChangeReceiver => r.mode === 'new'
      ? { lineId: null, newLine: r.account && r.dept ? { account: r.account, dept: r.dept, project: r.project === NO_PROJECT ? null : r.project } : null, amount: r.amount }
      : { lineId: r.lineId || null, newLine: null, amount: r.amount }),
  }
})

const existing = computed(() => (editId.value ? changeById(editId.value) : undefined))
const preview = computed(() => { void budget.entries.length; return previewChange(input.value, existing.value) })
const errors = computed(() => validateChange(preview.value))

const access = computed(() => {
  void budget.viewAs
  if (existing.value) return canEditChange(existing.value)
  return canPrepareChange(kind.value)
})

/** The chain only routes once the donor and every receiving department are known. */
const chain = computed(() => {
  const c = preview.value
  if (c.kind === 'Revision' || c.kind === 'Saving fill' || c.kind === 'Saving draw') return routeChain(c)
  if (!c.donor || !lineById(c.donor.lineId)) return []
  if (c.receivers.some((r) => !r.lineId && !r.newLine?.dept)) return []
  return routeChain(c)
})

// ── Side panel figures ─────────────────────────────────────────────────────
const donorFig = computed(() => (donorLineId.value && lineById(donorLineId.value) ? yearFigures(donorLineId.value) : null))
const donorMost = computed(() => {
  if (kind.value === 'Saving draw') return bucket.value ? Math.min(donorMax(bucket.value.id), slice.value ? sliceBalance(slice.value.key) : 0) : 0
  return donorLineId.value ? donorMax(donorLineId.value) : 0
})
const donorOver = computed(() => donorAmount.value > donorMost.value)
const recvSum = computed(() => rows.value.reduce((s, r) => s + r.amount, 0))
const recvDiff = computed(() => donorAmount.value - recvSum.value)

function rowError(r: RecvRow): string {
  const donor = lineById(donorLineId.value)
  if (r.mode === 'new') {
    if (!r.account || !r.dept) return ''
    const clash = newLineClash({ lineId: null, newLine: { account: r.account, dept: r.dept, project: r.project === NO_PROJECT ? null : r.project }, amount: r.amount })
    if (clash) return clash
    const acct = budgetAccount(r.account)
    if (donor && acct?.class && lineClass(donor) !== acct.class) return t('Opex and Capex money cannot mix.')
    return ''
  }
  const l = lineById(r.lineId)
  if (!l) return ''
  if (l.id === donorLineId.value) return t('The receiving line cannot be the donor line.')
  const cls = kind.value === 'Saving draw' ? slice.value?.class ?? null : donor ? lineClass(donor) : null
  if (cls && lineClass(l) !== cls) return t('Opex and Capex money cannot mix.')
  return ''
}
function recvBefore(r: RecvRow): number { return r.mode === 'line' && lineById(r.lineId) ? yearFigures(r.lineId).available : 0 }
function recvAmount(r: RecvRow): number { return kind.value === 'Transfer' || kind.value === 'Mid-year insert' ? r.amount : donorAmount.value }

const revisionLine = computed(() => lineById(revisionLineId.value))
const revisionFig = computed(() => (revisionLine.value ? yearFigures(revisionLine.value.id) : null))

// Funding request
const linkedPr = computed(() => prById(prId.value))
const gapInfo = computed(() => fundingGap(prId.value || null))
const fundingDonors = computed(() => {
  const lineId = rows.value[0]?.lineId
  return lineId ? suggestDonors(lineId, gapInfo.value.gap) : []
})
const requestOptions = computed(() => {
  const person = budget.viewAs === 'Requester' ? actingPerson() : null
  return blockedRequests(person).map((p) => ({ value: p.id, label: `${p.number} · ${p.requester} · ${formatIDRWhole(p.block?.short ?? 0)} short` }))
})

// Saving fill tag (taken from the donor line)
const fillLine = computed(() => lineById(donorLineId.value))

// ── Pickers ────────────────────────────────────────────────────────────────
const allLines = computed(() => { void budget.lines.length; return lineOptions() })
const drawTargets = computed(() => lineOptions((l) => !slice.value || lineClass(l) === slice.value.class))
const slices = computed(() => sliceOptions())
const reasonOptions = FUNDING_REASON_CODES.map((r) => ({ value: r, label: t(r) }))
const savingTypeOptions = SAVING_TYPES.map((s) => ({ value: s, label: t(s) }))

function addRow(mode: 'line' | 'new') { rows.value.push(blankRow(mode)) }
function removeRow(key: number) { if (rows.value.length > 1) rows.value = rows.value.filter((r) => r.key !== key) }
/** One receiver takes the whole cut until the user splits it. */
function onDonorAmount(v: string | number) {
  const prev = donorAmount.value
  donorAmount.value = parseRupiahInput(v)
  if (isTransferFamily.value && rows.value.length === 1 && rows.value[0]!.amount === prev) rows.value[0]!.amount = donorAmount.value
}

// ── Actions ────────────────────────────────────────────────────────────────
const showErrors = ref(false)
const actionError = ref('')

const title = computed(() => {
  const n = existing.value ? `${existing.value.number} · ` : ''
  return `${n}${existing.value ? t('Edit') : t('New')} ${t(kind.value).toLowerCase()}`
})

function goBack() { router.push(editId.value ? `/budget-changes/${editId.value}` : '/budget-changes') }

function saveDraft() {
  actionError.value = ''
  const res = saveChangeDraft(input.value, editId.value || undefined)
  if (!res.ok) { actionError.value = res.reason ?? ''; return }
  successToast(t('Draft saved. Nothing is held until you submit.'))
  router.push(`/budget-changes/${res.change!.id}`)
}

function submit() {
  actionError.value = ''
  showErrors.value = true
  const res = submitChangeDraft(input.value, editId.value || undefined)
  if (!res.ok) {
    if (!access.value.ok) actionError.value = access.value.reason ?? ''
    else if (res.errors.length && !errors.value.length) actionError.value = res.errors.join(' ')
    return
  }
  successToast(`${res.change!.number} ${t('submitted')}`)
  router.push(`/budget-changes/${res.change!.id}`)
}
</script>

<template>
  <div class="bcf-page">
    <header class="bcf-bar">
      <div class="bcf-bar-left">
        <MpTextlink id="bcf-breadcrumb" as="a" class="bcf-breadcrumb" @click.prevent="router.push('/budget-changes')">{{ t('Budget changes') }}</MpTextlink>
        <div class="bcf-titlerow">
          <h1 class="bcf-title">{{ title }}</h1>
          <ErpStatusBadge status="draft" :label="t('Draft')" badge-for="additionalInformation" size="md" />
        </div>
      </div>
    </header>

    <div class="bcf-stage">
      <p v-if="loadError" class="bcf-error" role="alert">{{ loadError }}</p>
      <template v-else>
        <MpBanner v-if="!access.ok" id="bcf-access" variant="warning" align-items="center">
          <MpBannerIcon id="bcf-access-icon" />
          <MpBannerDescription>{{ access.reason }}</MpBannerDescription>
        </MpBanner>

        <div class="bcf-layout">
          <!-- ── Form ── -->
          <div class="bcf-main">
            <!-- Funding request: the blocked purchase request -->
            <section v-if="kind === 'Funding request'" class="bcf-section">
              <h2 class="bcf-h">{{ t('Purchase request') }}</h2>
              <div v-if="linkedPr" class="bcf-card">
                <div class="bcf-kv">
                  <span class="bcf-k">{{ t('Request') }}</span>
                  <a class="cell-link" @click="router.push(prLink(linkedPr))">{{ linkedPr.number }}</a>
                </div>
                <div class="bcf-kv"><span class="bcf-k">{{ t('Requester') }}</span><span>{{ linkedPr.requester }}</span></div>
                <div class="bcf-kv"><span class="bcf-k">{{ t('Request total') }}</span><span>{{ formatIDRWhole(prTotal(linkedPr)) }}</span></div>
                <div class="bcf-kv"><span class="bcf-k">{{ t('Line') }}</span><span>{{ lineName(rows[0]?.lineId) }}</span></div>
                <div class="bcf-kv"><span class="bcf-k">{{ t('Gap') }}</span><span class="bcf-danger">{{ formatIDRWhole(gapInfo.gap) }}</span></div>
                <div class="bcf-kv"><span class="bcf-k">{{ t('Status') }}</span><ErpStatusBadge :status="linkedPr.status.toLowerCase()" :label="t(linkedPr.status)" /></div>
              </div>
              <MpFormControl v-else id="bcf-pr" is-required>
                <MpFormLabel>{{ t('Blocked purchase request') }}</MpFormLabel>
                <ErpFilterSelect id="bcf-pr-select" :model-value="prId" :placeholder="t('Select request')" :options="requestOptions" width="100%" :is-clearable="false" empty-text="No blocked purchase requests" @update:model-value="pickRequest" />
              </MpFormControl>
            </section>

            <!-- Saving draw: the slice -->
            <section v-if="kind === 'Saving draw'" class="bcf-section">
              <h2 class="bcf-h">{{ t('Saving bucket slice') }}</h2>
              <MpFormControl id="bcf-slice" is-required>
                <MpFormLabel>{{ t('Slice') }}</MpFormLabel>
                <ErpFilterSelect id="bcf-slice-select" v-model="drawSlice" :placeholder="t('Select slice')" :options="slices" width="100%" :is-clearable="false" empty-text="The saving bucket is empty" />
              </MpFormControl>
            </section>

            <!-- Revision -->
            <section v-if="kind === 'Revision'" class="bcf-section">
              <h2 class="bcf-h">{{ t('Line to revise') }}</h2>
              <div class="bcf-grid">
                <MpFormControl id="bcf-rev-line" is-required class="bcf-span-2">
                  <MpFormLabel>{{ t('Budget line') }}</MpFormLabel>
                  <ErpFilterSelect id="bcf-rev-line-select" v-model="revisionLineId" :placeholder="t('Select line')" :options="allLines" width="100%" :is-clearable="false" />
                </MpFormControl>
                <MpFormControl id="bcf-rev-month" is-required>
                  <MpFormLabel>{{ t('Month') }}</MpFormLabel>
                  <ErpFilterSelect id="bcf-rev-month-select" :model-value="String(month)" :placeholder="t('Select month')" :options="MONTH_OPTIONS" width="100%" :is-clearable="false" @update:model-value="(v: string) => (month = Number(v))" />
                </MpFormControl>
                <MpFormControl id="bcf-rev-amount" is-required>
                  <MpFormLabel>{{ t('Change (use minus to cut)') }}</MpFormLabel>
                  <MpInput id="bcf-rev-amount-input" :model-value="groupDigits(revisionAmount)" inputmode="numeric" is-full-width class="bcf-num" @update:model-value="(v: string | number) => (revisionAmount = parseRupiahInput(v, true))" />
                </MpFormControl>
              </div>
            </section>

            <!-- Donor -->
            <section v-if="kind !== 'Revision'" class="bcf-section">
              <h2 class="bcf-h">{{ kind === 'Saving fill' ? t('Line that saved the money') : kind === 'Saving draw' ? t('Amount to draw') : t('From') }}</h2>
              <div class="bcf-grid">
                <MpFormControl v-if="kind !== 'Saving draw'" id="bcf-donor" is-required class="bcf-span-2">
                  <MpFormLabel>{{ t('Donor line') }}</MpFormLabel>
                  <ErpFilterSelect id="bcf-donor-select" v-model="donorLineId" :placeholder="t('Select line')" :options="allLines" width="100%" :is-clearable="false" />
                </MpFormControl>
                <MpFormControl id="bcf-donor-amount" is-required :is-invalid="donorOver && donorAmount > 0">
                  <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
                  <MpInput id="bcf-donor-amount-input" :model-value="groupDigits(donorAmount)" inputmode="numeric" is-full-width class="bcf-num" :is-invalid="donorOver && donorAmount > 0" @update:model-value="onDonorAmount" />
                  <MpFormErrorMessage v-if="donorOver && donorAmount > 0">{{ t('Most it can give') }}: {{ formatIDRWhole(donorMost) }}</MpFormErrorMessage>
                </MpFormControl>
              </div>
            </section>

            <!-- Funding request: suggested donors -->
            <section v-if="kind === 'Funding request' && rows[0]?.lineId" class="bcf-section" data-tour="funding-donors">
              <h2 class="bcf-h">{{ t('Suggested donors') }}</h2>
              <p class="bcf-hint">{{ t('Same department and class, with budget not planned for later months.') }}</p>
              <p v-if="!fundingDonors.length" class="bcf-hint">{{ t('No line in this department has free budget.') }}</p>
              <ul v-else class="bcf-picklist">
                <li v-for="d in fundingDonors" :key="d.lineId" class="bcf-pick" :class="{ 'bcf-pick--on': donorLineId === d.lineId }">
                  <label class="bcf-pick__label">
                    <MpRadio :id="`bcf-donor-${d.lineId}`" name="bcf-donor-pick" :value="d.lineId" :is-checked="donorLineId === d.lineId" @change="donorLineId = d.lineId" />
                    <span class="bcf-pick__name">{{ lineName(d.lineId) }}</span>
                  </label>
                  <span class="bcf-pick__free">{{ t('Free') }} {{ formatIDRWhole(d.free) }}</span>
                </li>
              </ul>
              <div class="bcf-grid">
                <MpFormControl id="bcf-reason-code" is-required>
                  <MpFormLabel>{{ t('Reason code') }}</MpFormLabel>
                  <ErpFilterSelect id="bcf-reason-code-select" v-model="reasonCode" :placeholder="t('Select reason')" :options="reasonOptions" width="100%" :is-clearable="false" />
                </MpFormControl>
                <div class="bcf-kv bcf-kv--stack">
                  <span class="bcf-k">{{ t('Most you can ask') }}</span>
                  <span>{{ formatIDRWhole(gapInfo.cap) }} · {{ budget.settings.fundingCapPct }}% {{ t('over the gap') }}</span>
                </div>
              </div>
            </section>

            <!-- Saving fill tag -->
            <section v-if="kind === 'Saving fill'" class="bcf-section">
              <h2 class="bcf-h">{{ t('Where the saving came from') }}</h2>
              <div class="bcf-grid">
                <MpFormControl id="bcf-saving-type" is-required>
                  <MpFormLabel>{{ t('Saving type') }}</MpFormLabel>
                  <ErpFilterSelect id="bcf-saving-type-select" :model-value="savingType" :placeholder="t('Select type')" :options="savingTypeOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => (savingType = v as SavingType)" />
                </MpFormControl>
                <MpFormControl id="bcf-source-doc" is-required>
                  <MpFormLabel>{{ t('Source document') }}</MpFormLabel>
                  <MpInput id="bcf-source-doc-input" v-model="sourceDoc" is-full-width />
                </MpFormControl>
                <div class="bcf-kv bcf-kv--stack"><span class="bcf-k">{{ t('Department') }}</span><span>{{ fillLine ? deptName(fillLine.dept) : '-' }}</span></div>
                <div class="bcf-kv bcf-kv--stack"><span class="bcf-k">{{ t('Project') }}</span><span>{{ fillLine ? projectName(fillLine.project) : '-' }}</span></div>
                <div class="bcf-kv bcf-kv--stack"><span class="bcf-k">{{ t('Class') }}</span><span>{{ fillLine ? lineClass(fillLine) ?? '-' : '-' }}</span></div>
                <div class="bcf-kv bcf-kv--stack"><span class="bcf-k">{{ t('To') }}</span><span>{{ t('Saving bucket') }}</span></div>
              </div>
            </section>

            <!-- Receivers -->
            <section v-if="isTransferFamily || kind === 'Saving draw'" class="bcf-section">
              <h2 class="bcf-h">{{ t('To') }}</h2>
              <div class="bcf-table-wrap">
                <table class="bcf-table">
                  <colgroup><col /><col class="bcf-col-amt" /><col class="bcf-col-amt" /><col class="bcf-col-amt" /><col class="bcf-col-del" /></colgroup>
                  <thead>
                    <tr>
                      <th class="bcf-th">{{ t('Receiving line') }}</th>
                      <th class="bcf-th bcf-th--num">{{ t('Amount') }}</th>
                      <th class="bcf-th bcf-th--num">{{ t('Available before') }}</th>
                      <th class="bcf-th bcf-th--num">{{ t('Available after') }}</th>
                      <th class="bcf-th" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in rows" :key="r.key">
                      <td class="bcf-td">
                        <div v-if="r.mode === 'line'" class="bcf-cell">
                          <ErpFilterSelect :id="`bcf-recv-${r.key}`" v-model="r.lineId" :placeholder="t('Select line')" :options="kind === 'Saving draw' ? drawTargets : allLines" width="100%" :is-clearable="false" />
                        </div>
                        <div v-else class="bcf-cell bcf-newline">
                          <span class="bcf-newline__tag">{{ t('New line') }}</span>
                          <ErpFilterSelect :id="`bcf-new-acc-${r.key}`" v-model="r.account" :placeholder="t('Account')" :options="ACCOUNT_OPTIONS" width="100%" :is-clearable="false" />
                          <div class="bcf-newline__pair">
                            <ErpFilterSelect :id="`bcf-new-dept-${r.key}`" v-model="r.dept" :placeholder="t('Department')" :options="DEPARTMENT_OPTIONS" width="100%" :is-clearable="false" />
                            <ErpFilterSelect :id="`bcf-new-proj-${r.key}`" v-model="r.project" :placeholder="t('Project')" :options="PROJECT_OPTIONS" width="100%" :is-clearable="false" />
                          </div>
                        </div>
                        <p v-if="rowError(r)" class="bcf-row-error">{{ rowError(r) }}</p>
                      </td>
                      <td class="bcf-td bcf-td--num">
                        <MpInput v-if="isTransferFamily" :id="`bcf-recv-amt-${r.key}`" :model-value="groupDigits(r.amount)" inputmode="numeric" is-full-width class="bcf-num" @update:model-value="(v: string | number) => (r.amount = parseRupiahInput(v))" />
                        <span v-else class="bcf-static">{{ formatIDRWhole(donorAmount) }}</span>
                      </td>
                      <td class="bcf-td bcf-td--num"><span class="bcf-static">{{ formatIDRWhole(recvBefore(r)) }}</span></td>
                      <td class="bcf-td bcf-td--num"><span class="bcf-static">{{ formatIDRWhole(recvBefore(r) + recvAmount(r)) }}</span></td>
                      <td class="bcf-td bcf-td--del">
                        <MpButton v-if="rows.length > 1" variant="ghost" left-icon="minus-circular" is-rounded :aria-label="t('Remove')" @click="removeRow(r.key)" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="isTransferFamily" class="bcf-recv-foot">
                <div class="bcf-recv-add">
                  <MpButton variant="ghost" is-rounded @click="addRow('line')">{{ t('Add receiving line') }}</MpButton>
                  <MpButton variant="ghost" is-rounded @click="addRow('new')">{{ t('Add new line') }}</MpButton>
                </div>
                <div class="bcf-recv-sum">
                  <span>{{ t('Receivers total') }} {{ formatIDRWhole(recvSum) }}</span>
                  <span v-if="recvDiff !== 0" class="bcf-danger">{{ t('Difference') }} {{ formatIDRWhole(recvDiff) }}</span>
                </div>
              </div>
            </section>

            <!-- Reason -->
            <section class="bcf-section">
              <MpFormControl id="bcf-reason" is-required>
                <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
                <MpTextarea id="bcf-reason-input" v-model="reason" :rows="3" is-full-width />
              </MpFormControl>
              <MpFormControl v-if="kind !== 'Revision' && kind !== 'Funding request'" id="bcf-month">
                <MpFormLabel>{{ t('Month') }}</MpFormLabel>
                <ErpFilterSelect id="bcf-month-select" :model-value="String(month)" :placeholder="t('Select month')" :options="MONTH_OPTIONS" width="240px" :is-clearable="false" @update:model-value="(v: string) => (month = Number(v))" />
              </MpFormControl>
            </section>

            <!-- Chain preview -->
            <BudgetChangeChain :steps="chain" preview :empty-text="t('Pick the donor and receiving lines to see who approves.')" />

            <!-- Inline errors from the rules -->
            <section v-if="showErrors && (errors.length || actionError)" class="bcf-errors" role="alert">
              <p class="bcf-errors__title">{{ t('Fix these before you submit') }}</p>
              <ul class="bcf-errors__list">
                <li v-if="actionError">{{ actionError }}</li>
                <li v-for="e in errors" :key="e">{{ e }}</li>
              </ul>
            </section>
            <p v-else-if="actionError" class="bcf-error" role="alert">{{ actionError }}</p>
          </div>

          <!-- ── Side panel ── -->
          <aside class="bcf-side" data-tour="change-donor-panel">
            <div class="bcf-side__head">
              <h2 class="bcf-h">{{ kind === 'Revision' ? t('Line') : t('Donor') }}</h2>
              <MpButton variant="ghost" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Approval context panel') }}</MpButton>
            </div>

            <template v-if="kind === 'Revision'">
              <p v-if="!revisionFig" class="bcf-hint">{{ t('Pick a line to see its figures.') }}</p>
              <dl v-else class="bcf-figs">
                <div class="bcf-fig"><dt>{{ t('Budget') }}</dt><dd>{{ formatIDRWhole(revisionFig.budget) }}</dd></div>
                <div class="bcf-fig"><dt>{{ monthLabel(month) }}</dt><dd>{{ formatIDRWhole(monthFigures(revisionLine!.id, month).budget) }}</dd></div>
                <div class="bcf-fig"><dt>{{ t('Floor') }}</dt><dd>{{ formatIDRWhole(revisionFig.floor) }}</dd></div>
                <div class="bcf-fig"><dt>{{ t('Available') }}</dt><dd>{{ formatIDRWhole(revisionFig.available) }}</dd></div>
                <div class="bcf-fig bcf-fig--total"><dt>{{ t('Budget after revision') }}</dt><dd :class="{ 'bcf-danger': lineTotal(revisionLine!) + revisionAmount < revisionFig.floor }">{{ formatIDRWhole(lineTotal(revisionLine!) + revisionAmount) }}</dd></div>
              </dl>
            </template>

            <template v-else-if="kind === 'Saving draw'">
              <p v-if="!slice" class="bcf-hint">{{ t('Pick a slice to see its balance.') }}</p>
              <dl v-else class="bcf-figs">
                <div class="bcf-fig"><dt>{{ t('Slice') }}</dt><dd class="bcf-fig__wrap">{{ sliceLabel(slice) }}</dd></div>
                <div class="bcf-fig"><dt>{{ t('Filled') }}</dt><dd>{{ formatIDRWhole(slice.filled) }}</dd></div>
                <div class="bcf-fig"><dt>{{ t('Drawn') }}</dt><dd>{{ formatIDRWhole(slice.drawn) }}</dd></div>
                <div class="bcf-fig"><dt>{{ t('Held for draws') }}</dt><dd>{{ formatIDRWhole(slice.held) }}</dd></div>
                <div class="bcf-fig bcf-fig--total"><dt>{{ t('Most it can give') }}</dt><dd>{{ formatIDRWhole(donorMost) }}</dd></div>
              </dl>
            </template>

            <template v-else>
              <p v-if="!donorFig" class="bcf-hint">{{ t('Pick the donor line to see its floor.') }}</p>
              <template v-else>
                <p class="bcf-side__line">{{ lineName(donorLineId) }}</p>
                <dl class="bcf-figs">
                  <div class="bcf-fig"><dt>{{ t('Budget') }}</dt><dd>{{ formatIDRWhole(donorFig.budget) }}</dd></div>
                  <div class="bcf-fig"><dt>{{ t('Reserved') }}</dt><dd>{{ formatIDRWhole(donorFig.reserved) }}</dd></div>
                  <div class="bcf-fig"><dt>{{ t('Committed') }}</dt><dd>{{ formatIDRWhole(donorFig.committed) }}</dd></div>
                  <div class="bcf-fig"><dt>{{ t('Actual') }}</dt><dd>{{ formatIDRWhole(donorFig.actual) }}</dd></div>
                  <div class="bcf-fig"><dt>{{ t('Held for transfers') }}</dt><dd>{{ formatIDRWhole(donorFig.held) }}</dd></div>
                  <div class="bcf-fig bcf-fig--total"><dt>{{ t('Floor') }}</dt><dd>{{ formatIDRWhole(donorFig.floor) }}</dd></div>
                  <div class="bcf-fig bcf-fig--total"><dt>{{ t('Most it can give') }}</dt><dd>{{ formatIDRWhole(donorMost) }}</dd></div>
                  <div class="bcf-fig"><dt>{{ t('Available after this change') }}</dt><dd :class="{ 'bcf-danger': donorOver }">{{ formatIDRWhole(donorFig.available - donorAmount) }}</dd></div>
                </dl>
              </template>
              <template v-if="kind === 'Funding request' && rows[0]?.lineId">
                <h3 class="bcf-h3">{{ t('Receiving line') }}</h3>
                <p class="bcf-side__line">{{ lineName(rows[0].lineId) }}</p>
                <dl class="bcf-figs">
                  <div class="bcf-fig"><dt>{{ t('Available before') }}</dt><dd>{{ formatIDRWhole(recvBefore(rows[0])) }}</dd></div>
                  <div class="bcf-fig"><dt>{{ t('Available after') }}</dt><dd>{{ formatIDRWhole(recvBefore(rows[0]) + donorAmount) }}</dd></div>
                </dl>
              </template>
            </template>
          </aside>
        </div>
      </template>
    </div>

    <footer class="bcf-footer">
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="goBack">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="saveDraft">{{ t('Save as draft') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" data-tour="change-submit" @click="submit">{{ t('Submit') }}</button>
    </footer>
  </div>
</template>

<style scoped>
.bcf-page { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
.bcf-bar { flex: none; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; }
.bcf-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.bcf-breadcrumb { align-self: flex-start; background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); }
.bcf-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.bcf-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.bcf-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }

.bcf-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.bcf-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: var(--mp-spacing-6); align-items: start; }
.bcf-main { display: flex; flex-direction: column; gap: var(--mp-spacing-6); min-width: 0; }
.bcf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bcf-h { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.bcf-h3 { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bcf-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bcf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4) var(--mp-spacing-6); }
.bcf-span-2 { grid-column: span 2; }
.bcf-num :deep(input), .bcf-num { text-align: right; }

.bcf-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-3) var(--mp-spacing-4); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-3) var(--mp-spacing-6); }
.bcf-kv { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; }
.bcf-kv--stack { justify-content: flex-end; }
.bcf-k { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bcf-danger { color: var(--mp-text-danger); }

.bcf-picklist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); }
.bcf-pick { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) var(--mp-spacing-4); }
.bcf-pick + .bcf-pick { border-top: 1px solid var(--mp-border-default); }
.bcf-pick--on { background: var(--mp-background-neutral-subtle); }
.bcf-pick__label { display: flex; align-items: center; gap: var(--mp-spacing-3); cursor: pointer; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bcf-pick__free { flex: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.bcf-table-wrap { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); overflow-x: auto; }
.bcf-table { width: 100%; min-width: 720px; table-layout: fixed; border-collapse: collapse; }
.bcf-col-amt { width: 176px; }
.bcf-col-del { width: 52px; }
.bcf-th { height: var(--mp-sizes-8, 32px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.bcf-th--num { text-align: right; }
.bcf-td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; font-size: var(--mp-font-sizes-md); }
tr:last-child > .bcf-td { border-bottom: none; }
.bcf-td--num { text-align: right; }
.bcf-td--del { text-align: center; padding-left: 0; padding-right: 0; }
.bcf-static { display: inline-block; line-height: var(--mp-sizes-9\.5, 38px); }
.bcf-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bcf-newline__tag { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.bcf-newline__pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-2); }
.bcf-row-error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.bcf-recv-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); flex-wrap: wrap; }
.bcf-recv-add { display: flex; gap: var(--mp-spacing-2); }
.bcf-recv-sum { display: flex; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.bcf-errors { border: 1px solid var(--mp-border-danger, var(--mp-border-default)); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.bcf-errors__title { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-danger); }
.bcf-errors__list { margin: 0; padding-left: var(--mp-spacing-5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bcf-error { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }

.bcf-side { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-3); position: sticky; top: 0; }
.bcf-side__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.bcf-side__line { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bcf-figs { margin: 0; display: flex; flex-direction: column; }
.bcf-fig { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-1\.5, 6px) 0; font-size: var(--mp-font-sizes-md); }
.bcf-fig dt { color: var(--mp-text-secondary); }
.bcf-fig dd { margin: 0; color: var(--mp-text-default); text-align: right; white-space: nowrap; }
.bcf-fig__wrap { white-space: normal !important; }
.bcf-fig--total { border-top: 1px solid var(--mp-border-default); font-weight: var(--mp-font-weights-semi-bold); }

.bcf-footer { flex: none; display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }
</style>
