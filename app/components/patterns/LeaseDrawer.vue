<script setup lang="ts">
/**
 * LeaseDrawer: record a lease (OD-37) or modify one (OD-39).
 *
 * rule/drawer-custom-shell: the same hand-rolled overlay as NewAssetDrawer.
 * Validated on submit, errors at the field. The figures shown before commit
 * (initial liability, right-of-use cost, remeasurement) come from the same
 * functions the commit uses, so what is approved is what is recorded.
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpCheckbox, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import { parseRupiah } from '~/data/assetValueChange'
import { assetBranches } from '~/data/fixedAssets'
import { periodLabel, addPeriods, periodOfDate, type Period } from '~/data/assetEngine'
import { earliestEffectivePeriod } from '~/data/assetStore'
import {
  createLease, previewModification, modifyLease, blankModification, findLease, leaseSchedule, presentValue,
  validateLease, SHORT_TERM_MONTHS, type LeaseExemption, type LeaseContract,
} from '~/data/assetLeases'

const props = defineProps<{ isOpen: boolean; mode: 'create' | 'modify'; leaseId?: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done', message: string, leaseId: string): void
}>()

const { t } = useLocale()

// ── Create ──────────────────────────────────────────────────────────────────
const blank = () => ({
  name: '', underlying: '', branch: '', startDate: '', termMonths: '', payment: '', rate: '9', options: '',
  exempt: false, exemption: 'short-term' as LeaseExemption,
})
const f = ref(blank())
const errors = ref<Record<string, string>>({})

const exemptionOptions = [
  { value: 'short-term', label: `Short-term · ${SHORT_TERM_MONTHS} months or less` },
  { value: 'low-value', label: 'Low-value underlying asset' },
]

function toInput() {
  const v = f.value
  return {
    name: v.name, underlying: v.underlying, branch: v.branch, startDate: v.startDate,
    termMonths: Number(v.termMonths), monthlyPayment: parseRupiah(v.payment) ?? 0,
    annualRatePct: Number(String(v.rate).replace(',', '.')), options: v.options,
    exemption: v.exempt ? v.exemption : null,
  }
}

/** What the lease will recognise, before it is recorded. */
const createPreview = computed(() => {
  const i = toInput()
  const e = validateLease(i)
  if (e.termMonths || e.monthlyPayment || e.annualRatePct || e.startDate) return null
  const pv = presentValue(i.monthlyPayment, i.termMonths, i.annualRatePct / 100)
  const start = periodOfDate(i.startDate.trim())
  return {
    exempt: !!i.exemption,
    liability: pv,
    monthlyRou: Math.round(pv / i.termMonths),
    firstInterest: Math.round(pv * (i.annualRatePct / 100 / 12)),
    total: i.monthlyPayment * i.termMonths,
    end: periodLabel(addPeriods(start, i.termMonths - 1)),
  }
})

// ── Modify ──────────────────────────────────────────────────────────────────
const lease = computed<LeaseContract | undefined>(() => (props.leaseId ? findLease(props.leaseId) : undefined))
const m = ref({ period: '' as Period, extraMonths: '12', payment: '', rate: '', reason: '' })

const periodOptions = computed(() => {
  const l = lease.value
  if (!l) return []
  const s = leaseSchedule(l)
  const out: { value: string; label: string }[] = []
  for (let p = earliestEffectivePeriod.value, i = 0; i < 24; i++, p = addPeriods(p, 1)) {
    if (p > s.endPeriod) break
    if (p >= s.startPeriod) out.push({ value: p, label: periodLabel(p) })
  }
  return out
})

function toMod() {
  return {
    period: m.value.period,
    extraMonths: Number(m.value.extraMonths),
    payment: parseRupiah(m.value.payment) ?? 0,
    annualRatePct: Number(String(m.value.rate).replace(',', '.')),
    reason: m.value.reason,
  }
}
const modPreview = computed(() => (props.leaseId && m.value.period ? previewModification(props.leaseId, toMod()) : null))

watch(() => [props.isOpen, props.mode, props.leaseId], () => {
  if (!props.isOpen) return
  errors.value = {}
  if (props.mode === 'create') { f.value = blank(); return }
  const l = lease.value
  if (!l) return
  const b = blankModification(l)
  m.value = { period: b.period, extraMonths: String(b.extraMonths), payment: new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(b.payment), rate: String(b.annualRatePct), reason: '' }
}, { immediate: true })

function submit() {
  errors.value = {}
  if (props.mode === 'create') {
    const r = createLease(toInput())
    if (!r.ok) { errors.value = r.errors; return }
    const l = r.lease
    emit('done', l.rouAssetId
      ? `${l.id} recorded · right-of-use asset ${l.rouAssetId} added to the register at ${formatIDR(leaseSchedule(l).initialLiability)}`
      : `${l.id} recorded as ${l.exemption} · no right-of-use asset, payments are expensed`, l.id)
    return
  }
  if (!props.leaseId) return
  const pv = modPreview.value
  if (!pv || !pv.ok) { errors.value = { ...(pv?.errors ?? {}), ...(pv?.refusal ? { form: pv.refusal } : {}) }; return }
  if (!m.value.reason.trim()) { errors.value = { reason: 'Say what changed in the contract' }; return }
  const r = modifyLease(props.leaseId, toMod())
  if (!r.ok) { errors.value = { form: r.reason }; return }
  emit('done', `Lease remeasured · ${pv.rou?.id ?? 'right-of-use asset'} ${pv.adjustment >= 0 ? 'increased' : 'reduced'} by ${formatIDR(Math.abs(pv.adjustment))} over ${pv.remainingMonths} months`, props.leaseId)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ld">
      <div v-if="isOpen" class="ld-overlay">
        <div class="ld-panel" role="dialog" :aria-label="t(mode === 'create' ? 'New lease' : 'Modify lease')">
          <header class="ld-head">
            <span class="ld-title">{{ mode === 'create' ? t('New lease') : `${t('Modify lease')} ${lease?.id ?? ''}` }}</span>
            <MpButton class="ld-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <!-- ── Create ── -->
          <div v-if="mode === 'create'" class="ld-body">
            <div class="ld-field">
              <label class="ld-label" for="ld-name">{{ t('Lease name') }}</label>
              <MpInput id="ld-name" v-model="f.name" :is-invalid="!!errors.name" />
              <p v-if="errors.name" class="ld-error">{{ t(errors.name) }}</p>
            </div>
            <div class="ld-row">
              <div class="ld-field">
                <label class="ld-label" for="ld-underlying">{{ t('Underlying asset') }}</label>
                <MpInput id="ld-underlying" v-model="f.underlying" :placeholder="t('What is leased')" />
              </div>
              <div class="ld-field">
                <label class="ld-label" for="ld-branch">{{ t('Branch') }}</label>
                <ErpFilterSelect id="ld-branch" v-model="f.branch" :placeholder="t('Choose a branch')" :options="assetBranches" width="100%" :is-clearable="false" />
                <p v-if="errors.branch" class="ld-error">{{ t(errors.branch) }}</p>
              </div>
            </div>
            <div class="ld-row ld-row--3">
              <div class="ld-field">
                <label class="ld-label" for="ld-start">{{ t('Commencement date') }}</label>
                <MpInput id="ld-start" v-model="f.startDate" placeholder="dd/mm/yyyy" :is-invalid="!!errors.startDate" />
                <p v-if="errors.startDate" class="ld-error">{{ t(errors.startDate) }}</p>
              </div>
              <div class="ld-field">
                <label class="ld-label" for="ld-term">{{ t('Term (months)') }}</label>
                <MpInput id="ld-term" v-model="f.termMonths" :is-invalid="!!errors.termMonths" />
                <p v-if="errors.termMonths" class="ld-error">{{ t(errors.termMonths) }}</p>
              </div>
              <div class="ld-field">
                <label class="ld-label" for="ld-rate">{{ t('Discount rate (% a year)') }}</label>
                <MpInput id="ld-rate" v-model="f.rate" :is-invalid="!!errors.annualRatePct" />
                <p v-if="errors.annualRatePct" class="ld-error">{{ t(errors.annualRatePct) }}</p>
              </div>
            </div>
            <div class="ld-field">
              <label class="ld-label" for="ld-payment">{{ t('Monthly payment') }}</label>
              <MpInput id="ld-payment" v-model="f.payment" :is-invalid="!!errors.monthlyPayment" />
              <p v-if="errors.monthlyPayment" class="ld-error">{{ t(errors.monthlyPayment) }}</p>
              <p v-else class="ld-hint">{{ t('Paid at the end of each month. The rate is the incremental borrowing rate if the lease states none.') }}</p>
            </div>
            <div class="ld-field">
              <label class="ld-label" for="ld-options">{{ t('Extension or termination options') }}</label>
              <MpInput id="ld-options" v-model="f.options" :placeholder="t('None')" />
            </div>
            <div class="ld-field">
              <MpCheckbox id="ld-exempt" :is-checked="f.exempt" @change="f.exempt = !f.exempt">
                {{ t('Exempt: short-term or low-value') }}
              </MpCheckbox>
              <ErpFilterSelect v-if="f.exempt" id="ld-exemption" v-model="f.exemption" :placeholder="t('Exemption')" :options="exemptionOptions" width="100%" :is-clearable="false" />
              <p v-if="errors.exemption" class="ld-error">{{ t(errors.exemption) }}</p>
              <p v-else class="ld-hint">{{ t('An exempt lease has no right-of-use asset and no liability. Its payments are expensed as they fall due.') }}</p>
            </div>

            <div class="ld-preview">
              <div class="ld-preview-title">{{ t('What this lease recognises') }}</div>
              <template v-if="createPreview">
                <template v-if="createPreview.exempt">
                  <p class="ld-line">{{ t('No right-of-use asset and no liability.') }}</p>
                  <p class="ld-line">{{ t('Expensed') }} {{ formatIDR(toInput().monthlyPayment) }} {{ t('a month, to') }} {{ createPreview.end }}.</p>
                </template>
                <template v-else>
                  <div class="ld-kv"><span>{{ t('Lease liability at commencement') }}</span><strong>{{ formatIDR(createPreview.liability) }}</strong></div>
                  <div class="ld-kv"><span>{{ t('Right-of-use asset cost') }}</span><strong>{{ formatIDR(createPreview.liability) }}</strong></div>
                  <div class="ld-kv"><span>{{ t('Depreciation, straight line over the term') }}</span><strong>{{ formatIDR(createPreview.monthlyRou) }} / {{ t('month') }}</strong></div>
                  <div class="ld-kv"><span>{{ t('First month interest') }}</span><strong>{{ formatIDR(createPreview.firstInterest) }}</strong></div>
                  <div class="ld-kv"><span>{{ t('Payments over the term, the tax deduction') }}</span><strong>{{ formatIDR(createPreview.total) }}</strong></div>
                  <p class="ld-hint">{{ t(`Ends ${createPreview.end}. The asset joins the register and depreciates in every run from its first month.`) }}</p>
                </template>
              </template>
              <p v-else class="ld-hint">{{ t('Enter the commencement date, term, payment and rate to see the figures.') }}</p>
            </div>
          </div>

          <!-- ── Modify ── -->
          <div v-else class="ld-body">
            <template v-if="lease">
              <p class="ld-hint ld-lead">
                {{ lease.name }} · {{ t('currently') }} {{ leaseSchedule(lease).current.termMonths }} {{ t('months at') }}
                {{ formatIDR(leaseSchedule(lease).current.payment) }} · {{ t('ends') }} {{ periodLabel(leaseSchedule(lease).endPeriod) }}
              </p>
              <div class="ld-row">
                <div class="ld-field">
                  <label class="ld-label" for="ld-mod-period">{{ t('Effective from') }}</label>
                  <ErpFilterSelect id="ld-mod-period" v-model="m.period" :placeholder="t('Choose a period')" :options="periodOptions" width="100%" :is-clearable="false" />
                  <p v-if="errors.period" class="ld-error">{{ t(errors.period) }}</p>
                </div>
                <div class="ld-field">
                  <label class="ld-label" for="ld-mod-extra">{{ t('Change in term (months)') }}</label>
                  <MpInput id="ld-mod-extra" v-model="m.extraMonths" :is-invalid="!!errors.extraMonths" />
                  <p v-if="errors.extraMonths" class="ld-error">{{ t(errors.extraMonths) }}</p>
                  <p v-else class="ld-hint">{{ t('Negative shortens it.') }}</p>
                </div>
              </div>
              <div class="ld-row">
                <div class="ld-field">
                  <label class="ld-label" for="ld-mod-payment">{{ t('Revised monthly payment') }}</label>
                  <MpInput id="ld-mod-payment" v-model="m.payment" :is-invalid="!!errors.payment" />
                  <p v-if="errors.payment" class="ld-error">{{ t(errors.payment) }}</p>
                </div>
                <div class="ld-field">
                  <label class="ld-label" for="ld-mod-rate">{{ t('Revised discount rate (%)') }}</label>
                  <MpInput id="ld-mod-rate" v-model="m.rate" :is-invalid="!!errors.annualRatePct" />
                  <p v-if="errors.annualRatePct" class="ld-error">{{ t(errors.annualRatePct) }}</p>
                </div>
              </div>
              <div class="ld-field">
                <label class="ld-label" for="ld-mod-reason">{{ t('What changed in the contract') }}</label>
                <MpInput id="ld-mod-reason" v-model="m.reason" :placeholder="t('e.g. Addendum 2 signed, twelve-month extension')" :is-invalid="!!errors.reason" />
                <p v-if="errors.reason" class="ld-error">{{ t(errors.reason) }}</p>
              </div>

              <div class="ld-preview">
                <div class="ld-preview-title">{{ t('Remeasurement') }}</div>
                <template v-if="modPreview && !Object.keys(modPreview.errors).length && !modPreview.refusal">
                  <div class="ld-kv"><span>{{ t('Liability before') }}</span><strong>{{ formatIDR(modPreview.liabilityBefore) }}</strong></div>
                  <div class="ld-kv"><span>{{ t('Liability remeasured') }}</span><strong>{{ formatIDR(modPreview.liabilityAfter) }}</strong></div>
                  <div class="ld-kv"><span>{{ t('Right-of-use asset adjusted by the same amount') }}</span><strong>{{ modPreview.adjustment >= 0 ? '+' : '−' }}{{ formatIDR(Math.abs(modPreview.adjustment)) }}</strong></div>
                  <template v-if="modPreview.rou">
                    <div class="ld-kv"><span>{{ t(`${modPreview.rou.id} depreciation from ${periodLabel(m.period)}`) }}</span><strong>{{ formatIDR(modPreview.rou.chargeBefore ?? 0) }} → {{ formatIDR(modPreview.rou.chargeAfter ?? 0) }}</strong></div>
                  </template>
                  <p class="ld-hint">
                    {{ t(`Remaining ${modPreview.remainingMonths} months, ending ${modPreview.newEnd ? periodLabel(modPreview.newEnd) : ''}. No gain or loss. Nothing posted before ${periodLabel(m.period)} moves.`) }}
                  </p>
                </template>
                <p v-else-if="modPreview?.refusal" class="ld-error">{{ t(modPreview.refusal) }}</p>
                <p v-else class="ld-hint">{{ t('Complete the changes to see the remeasurement.') }}</p>
              </div>
            </template>
          </div>

          <footer class="ld-foot">
            <p v-if="errors.form" class="ld-error ld-foot-error">{{ t(errors.form) }}</p>
            <div class="ld-footright">
              <MpButton variant="secondary" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
              <MpButton is-rounded data-tour="dlg-primary" @click="submit">{{ t(mode === 'create' ? 'Record lease' : 'Remeasure') }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ld-overlay { position: fixed; inset: 0; background: var(--mp-background-overlay); z-index: 1300; }
.ld-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 560px; max-width: 96vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default); overflow: hidden;
}
.ld-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.ld-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ld-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.ld-lead { margin-bottom: var(--mp-spacing-4); }
.ld-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.ld-row--3 { grid-template-columns: 1fr 1fr 1fr; }
.ld-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-5); min-width: 0; }
.ld-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ld-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; line-height: var(--mp-line-heights-sm); }
.ld-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); margin: 0; line-height: var(--mp-line-heights-sm); }
.ld-preview { border-top: 1px solid var(--mp-border-default); padding-top: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ld-preview-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ld-kv { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.ld-kv strong { font-weight: var(--mp-font-weights-semi-bold); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ld-line { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); margin: 0; }
.ld-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none; border-top: 1px solid var(--mp-border-default);
}
.ld-foot-error { flex: 1; }
.ld-footright { display: flex; gap: var(--mp-spacing-2); flex: none; }
.ld-enter-active, .ld-leave-active { transition: opacity 0.16s ease; }
.ld-enter-from, .ld-leave-to { opacity: 0; }
</style>
