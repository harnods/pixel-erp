<script setup lang="ts">
/**
 * ValueChangeDrawer: the one place an asset's value is changed (PRD UX6).
 *
 * rule/drawer-custom-shell: a hand-rolled Teleport overlay copied from
 * AssetFiltersDrawer, not MpDrawer. Close is the ×, Cancel or the commit
 * button only (rule/modal-drawer-close-explicit-only), so a half-entered
 * change is never lost to a stray click.
 *
 * Every figure in the preview comes from replaying the asset's event log with
 * the change added, the same replay committing runs. Nothing is recorded
 * until the commit button is pressed.
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpIcon, MpInput, MpCheckbox } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import {
  VALUE_ACTIONS, blankForm, periodOptions, previewValueChange, effectiveNote, parseRupiah,
  type ValueAction, type ValueChangeForm,
} from '~/data/assetValueChange'
import {
  recordEvent, recordImpairmentTest, recordImpairmentReversal, ledgerOf,
  canChangeValue, viewAs, actingUser, IMPAIRMENT_INDICATORS,
} from '~/data/assetStore'
import { pct } from '~/data/assetEngine'
import {
  gateChange, kindForAction, approvalNeeded, carryingPair, stakeOf, valueChangeStake, type HeldChange,
} from '~/data/assetApprovals'
import type { FixedAsset } from '~/data/fixedAssets'

const props = defineProps<{
  isOpen: boolean
  asset: FixedAsset
  action: ValueAction
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'committed', message: string, newIds: string[]): void
}>()

const { t } = useLocale()

const form = ref<ValueChangeForm>(blankForm(props.asset.id, props.action))
const tried = ref(false)
const commitError = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    form.value = blankForm(props.asset.id, props.action)
    tried.value = false
    commitError.value = ''
  },
)
watch(() => form.value.action, () => { tried.value = false; commitError.value = '' })

const actionOptions = VALUE_ACTIONS.map((a) => ({ value: a.key, label: a.label }))
const actionHint = computed(() => VALUE_ACTIONS.find((a) => a.key === form.value.action)?.hint ?? '')
const periods = periodOptions()
const methodOptions = [
  { value: 'straight-line', label: 'Straight line' },
  { value: 'reducing-balance', label: 'Reducing balance' },
]
const basisOptions = ['Fair value less costs of disposal', 'Value in use']
const indicatorOptions = IMPAIRMENT_INDICATORS

// The select emits a string; the form's typed fields take it as is.
const actionModel = computed({
  get: () => form.value.action as string,
  set: (v: string) => { form.value.action = (v || 'revise') as ValueAction },
})
const methodModel = computed({
  get: () => form.value.method as string,
  set: (v: string) => { form.value.method = (v || 'straight-line') as ValueChangeForm['method'] },
})
const basisModel = computed({
  get: () => form.value.basis as string,
  set: (v: string) => { form.value.basis = (v || 'Fair value less costs of disposal') as ValueChangeForm['basis'] },
})

const preview = computed(() => previewValueChange(
  props.asset.id, form.value,
  (id, i) => form.value.parts[i]?.name.trim() || `${props.asset.name} · part ${i + 1}`,
))
/** A field's error, shown once the commit has been tried. */
function err(field: string): string {
  return tried.value && preview.value.error?.field === field ? preview.value.error.error : ''
}

const hasTax = computed(() => !!ledgerOf(props.asset.id)?.books.tax)
const splitTotal = computed(() => form.value.parts.reduce((s, x) => s + (Number(String(x.percent).replace(',', '.')) || 0), 0))

function addPart() { form.value.parts.push({ percent: '', name: '' }) }
function removePart(i: number) { if (form.value.parts.length > 2) form.value.parts.splice(i, 1) }

const commitLabel = computed(() => ({
  correct: 'Record correction',
  revise: 'Record revision',
  improve: 'Capitalise improvement',
  split: 'Split asset',
  'dispose-part': 'Record partial disposal',
  dispose: 'Record disposal',
  impair: 'Record test',
  reverse: 'Record reversal',
}[form.value.action]))

function money(n: number | null | undefined): string {
  return n === null || n === undefined ? 'None' : formatIDR(n)
}
function gainLoss(n: number): string {
  return `${n >= 0 ? 'Gain' : 'Loss'} ${formatIDR(Math.abs(n))}`
}

function commit() {
  tried.value = true
  commitError.value = ''
  if (!canChangeValue.value) {
    commitError.value = `Viewing as ${viewAs.value}. Recording a value change needs the Owner or Accounting role; switch View as to try it.`
    return
  }
  const pv = preview.value
  if (pv.error) return
  if (pv.refusal) { commitError.value = pv.refusal; return }
  const f = form.value
  const id = props.asset.id
  // FG-7: the held change is exactly what recording now would do, so
  // approving it later goes through the same store functions.
  let change: HeldChange
  if (f.action === 'impair') {
    change = { type: 'impairment-test', input: {
      assetId: id, indicator: f.indicator, recoverable: Number(f.recoverable.replace(/\D/g, '')),
      basis: f.basis, source: f.source.trim(), date: pv.event!.date,
    } }
  } else if (f.action === 'reverse') {
    change = { type: 'impairment-reversal', input: {
      assetId: id, recoverable: Number(f.recoverable.replace(/\D/g, '')),
      basis: f.basis, source: f.source.trim(), date: pv.event!.date,
    } }
  } else {
    change = { type: 'event', event: pv.event! }
  }
  const record = (): { ok: boolean; reason?: string } => change.type === 'impairment-test'
    ? recordImpairmentTest(change.input)
    : change.type === 'impairment-reversal' ? recordImpairmentReversal(change.input) : recordEvent(id, change.event)
  if (f.action !== 'split') {
    const gated = gateChange(id, kindForAction(f.action, parseRupiah(f.proceeds) ?? 0), `${commitLabel.value} on ${id}`, change, changeStake(id, f.action, change), record)
    if (!gated.ok) { commitError.value = gated.reason; return }
    if (gated.held) {
      emit('committed', `Sent for approval as ${gated.held.id}. Nothing is recorded until it is approved.`, [])
      return
    }
    emit('committed', doneMessage(f.action, id, pv.impairment?.loss ?? 0, []), [])
    return
  }
  const r = record()
  if (!r.ok) { commitError.value = r.reason ?? 'The change could not be recorded'; return }
  const newIds = pv.children.map((c) => c.id)
  emit('committed', doneMessage(f.action, id, pv.impairment?.loss ?? 0, newIds), newIds)
}

function doneMessage(action: ValueAction, id: string, loss: number, newIds: string[]): string {
  const done: Record<ValueAction, string> = {
    correct: `Cost of ${id} corrected`,
    revise: `Estimate revised on ${id}`,
    improve: `Improvement capitalised on ${id}`,
    split: `${id} split into ${newIds.join(', ')}`,
    'dispose-part': `Part of ${id} disposed of`,
    dispose: `${id} disposed of`,
    impair: loss ? `Test recorded. ${id} written down in the accounts` : `Test recorded on ${id}. No impairment found`,
    reverse: `Impairment reversal recorded on ${id}`,
  }
  return `${done[action]} by ${actingUser.value}`
}

/** What the change puts at stake, for the approval threshold. */
function changeStake(id: string, action: ValueAction, change: HeldChange): number {
  const pair = carryingPair(id)
  if (action === 'dispose') return stakeOf(pair.accounting, pair.tax)
  if (action === 'dispose-part') return Math.round(stakeOf(pair.accounting, pair.tax) * (Number(form.value.percent.replace(',', '.')) || 0) / 100)
  if (change.type === 'impairment-test') return Math.max(0, (pair.accounting ?? 0) - change.input.recoverable)
  if (change.type === 'impairment-reversal') return Math.max(0, change.input.recoverable - (pair.accounting ?? 0))
  return valueChangeStake(id, change.event)
}

/** LR-5: tell the preparer before commit whether this goes straight to the books. */
const approvalNote = computed(() => {
  if (form.value.action === 'split' || preview.value.error || preview.value.refusal) return ''
  const f = form.value
  const kind = kindForAction(f.action, parseRupiah(f.proceeds) ?? 0)
  const ev = preview.value.event
  if (!ev) return ''
  const change: HeldChange = f.action === 'impair'
    ? { type: 'impairment-test', input: { assetId: props.asset.id, indicator: f.indicator, recoverable: Number(f.recoverable.replace(/\D/g, '')), basis: f.basis, source: f.source } }
    : f.action === 'reverse'
      ? { type: 'impairment-reversal', input: { assetId: props.asset.id, recoverable: Number(f.recoverable.replace(/\D/g, '')), basis: f.basis, source: f.source } }
      : { type: 'event', event: ev }
  const why = approvalNeeded(kind, changeStake(props.asset.id, f.action, change))
  return why ? `${why}. Committing raises an approval request; nothing is recorded until it is approved.` : ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="vcd">
      <div v-if="isOpen" class="vcd-overlay">
        <div class="vcd-panel" role="dialog" :aria-label="t('Change this asset')">
          <header class="vcd-head">
            <div>
              <div class="vcd-title">{{ t('Change this asset') }}</div>
              <div class="vcd-sub">{{ asset.id }} · {{ asset.name }}</div>
            </div>
            <MpButton class="vcd-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="vcd-body" data-tour="vc-body">
            <div class="vcd-row">
              <div class="vcd-field">
                <label class="vcd-label" for="vcd-action">{{ t('What is changing') }}</label>
                <ErpFilterSelect
                  id="vcd-action" v-model="actionModel" :placeholder="t('Choose a change')"
                  :options="actionOptions" width="100%" :is-clearable="false"
                />
                <p class="vcd-hint">{{ t(actionHint) }}</p>
              </div>
              <div class="vcd-field">
                <label class="vcd-label" for="vcd-period">{{ t('Effective period') }}</label>
                <ErpFilterSelect
                  id="vcd-period" v-model="form.period" :placeholder="t('Choose a period')"
                  :options="periods" width="100%" :is-clearable="false"
                />
                <p class="vcd-hint">{{ t(effectiveNote()) }}</p>
              </div>
            </div>

            <!-- ── Inputs for the chosen change ── -->
            <template v-if="form.action === 'correct'">
              <div class="vcd-row">
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-cost">{{ t('Correct cost (Rp)') }}</label>
                  <MpInput id="vcd-cost" v-model="form.correctedCost" :is-invalid="!!err('correctedCost')" />
                  <p v-if="err('correctedCost')" class="vcd-error">{{ t(err('correctedCost')) }}</p>
                  <p v-else class="vcd-hint">{{ t('Recorded now at') }} {{ formatIDR(ledgerOf(asset.id)!.acquisitionCost) }}</p>
                </div>
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-reason">{{ t('What the error was') }}</label>
                  <MpInput id="vcd-reason" v-model="form.reason" :is-invalid="!!err('reason')" />
                  <p v-if="err('reason')" class="vcd-error">{{ t(err('reason')) }}</p>
                </div>
              </div>
            </template>

            <template v-if="form.action === 'revise'">
              <div class="vcd-row vcd-row--3">
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-life">{{ t('Total useful life (years)') }}</label>
                  <MpInput id="vcd-life" v-model="form.lifeYears" :is-invalid="!!err('lifeYears')" />
                </div>
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-method">{{ t('Method') }}</label>
                  <ErpFilterSelect id="vcd-method" v-model="methodModel" :placeholder="t('Method')" :options="methodOptions" width="100%" :is-clearable="false" />
                </div>
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-residual">{{ t('Residual value (Rp)') }}</label>
                  <MpInput id="vcd-residual" v-model="form.residual" :is-invalid="!!err('residual')" />
                </div>
              </div>
              <p v-if="err('lifeYears') || err('residual')" class="vcd-error">{{ t(err('lifeYears') || err('residual')) }}</p>
              <p class="vcd-hint">{{ t('Total life from the in-service date. The carrying amount at the effective period is spread over what is left of it.') }}</p>
            </template>

            <template v-if="form.action === 'improve'">
              <div class="vcd-field">
                <label class="vcd-label" for="vcd-amount">{{ t('Cost of the improvement (Rp)') }}</label>
                <MpInput id="vcd-amount" v-model="form.amount" :is-invalid="!!err('amount')" />
                <p v-if="err('amount')" class="vcd-error">{{ t(err('amount')) }}</p>
              </div>
              <div class="vcd-field">
                <MpCheckbox id="vcd-captest" :is-checked="form.passesCapitalisationTest" @change="form.passesCapitalisationTest = !form.passesCapitalisationTest">
                  {{ t('It brings future economic benefit and its cost can be measured reliably') }}
                </MpCheckbox>
                <p v-if="err('passesCapitalisationTest')" class="vcd-error">{{ t(err('passesCapitalisationTest')) }}</p>
                <MpCheckbox id="vcd-extends" :is-checked="form.extendsLife" @change="form.extendsLife = !form.extendsLife">
                  {{ t('It also extends the useful life') }}
                </MpCheckbox>
              </div>
              <div v-if="form.extendsLife" class="vcd-field">
                <label class="vcd-label" for="vcd-extlife">{{ t('New total useful life (years)') }}</label>
                <MpInput id="vcd-extlife" v-model="form.extendedLifeYears" :is-invalid="!!err('extendedLifeYears')" />
                <p v-if="err('extendedLifeYears')" class="vcd-error">{{ t(err('extendedLifeYears')) }}</p>
              </div>
            </template>

            <template v-if="form.action === 'split'">
              <div class="vcd-field">
                <span class="vcd-label">{{ t('Parts') }}</span>
                <div v-for="(p, i) in form.parts" :key="i" class="vcd-part">
                  <div class="vcd-part-share">
                    <label class="vcd-sublabel" :for="`vcd-part-pct-${i}`">{{ t('Share (%)') }}</label>
                    <MpInput :id="`vcd-part-pct-${i}`" v-model="p.percent" />
                  </div>
                  <div class="vcd-part-name">
                    <label class="vcd-sublabel" :for="`vcd-part-name-${i}`">{{ t('Name') }}</label>
                    <MpInput :id="`vcd-part-name-${i}`" v-model="p.name" />
                  </div>
                  <MpButton v-if="form.parts.length > 2" variant="ghost" is-rounded :aria-label="t('Remove part')" @click="removePart(i)">
                    <MpIcon name="close" size="sm" />
                  </MpButton>
                </div>
                <div class="vcd-part-foot">
                  <MpButton variant="ghost" is-rounded left-icon="add" @click="addPart">{{ t('Add part') }}</MpButton>
                  <span class="vcd-hint">{{ t('Shares add up to') }} {{ splitTotal.toLocaleString('id-ID') }}%</span>
                </div>
                <p v-if="err('parts')" class="vcd-error">{{ t(err('parts')) }}</p>
                <p v-else class="vcd-hint">{{ t('A part with no name is named after this asset.') }}</p>
              </div>
            </template>

            <template v-if="form.action === 'dispose-part' || form.action === 'dispose'">
              <div class="vcd-row">
                <div v-if="form.action === 'dispose-part'" class="vcd-field">
                  <label class="vcd-label" for="vcd-pct">{{ t('Share disposed of (%)') }}</label>
                  <MpInput id="vcd-pct" v-model="form.percent" :is-invalid="!!err('percent')" />
                  <p v-if="err('percent')" class="vcd-error">{{ t(err('percent')) }}</p>
                </div>
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-proceeds">{{ t('Proceeds (Rp)') }}</label>
                  <MpInput id="vcd-proceeds" v-model="form.proceeds" />
                  <p class="vcd-hint">{{ t('Leave empty for a write-off with no proceeds.') }}</p>
                </div>
              </div>
            </template>

            <template v-if="form.action === 'impair' || form.action === 'reverse'">
              <div class="vcd-row">
                <div v-if="form.action === 'impair'" class="vcd-field">
                  <label class="vcd-label" for="vcd-indicator">{{ t('What prompted the test') }}</label>
                  <ErpFilterSelect id="vcd-indicator" v-model="form.indicator" :placeholder="t('Choose an indicator')" :options="indicatorOptions" width="100%" :is-clearable="false" />
                  <p v-if="err('indicator')" class="vcd-error">{{ t(err('indicator')) }}</p>
                </div>
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-recoverable">{{ t('Recoverable amount (Rp)') }}</label>
                  <MpInput id="vcd-recoverable" v-model="form.recoverable" :is-invalid="!!err('recoverable')" />
                  <p v-if="err('recoverable')" class="vcd-error">{{ t(err('recoverable')) }}</p>
                </div>
              </div>
              <div class="vcd-row">
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-basis">{{ t('Measured as') }}</label>
                  <ErpFilterSelect id="vcd-basis" v-model="basisModel" :placeholder="t('Basis')" :options="basisOptions" width="100%" :is-clearable="false" />
                </div>
                <div class="vcd-field">
                  <label class="vcd-label" for="vcd-source">{{ t('Source') }}</label>
                  <MpInput id="vcd-source" v-model="form.source" :is-invalid="!!err('source')" />
                  <p v-if="err('source')" class="vcd-error">{{ t(err('source')) }}</p>
                </div>
              </div>
            </template>

            <!-- ── Preview ── -->
            <section class="vcd-preview" data-tour="vc-preview">
              <div class="vcd-preview-title">{{ t('Preview') }}</div>

              <div v-if="preview.refusal" class="vcd-refusal">
                <MpIcon name="information" size="sm" />
                <span>{{ t(preview.refusal) }}</span>
              </div>
              <p v-else-if="preview.error && !tried" class="vcd-hint">{{ t('Complete the fields above to see the schedule before and after.') }}</p>
              <p v-else-if="preview.error" class="vcd-hint">{{ t('Fix the fields marked above to see the preview.') }}</p>

              <template v-else>
                <div v-for="w in preview.warnings" :key="w" class="vcd-warning">
                  <MpIcon name="information" size="sm" />
                  <span>{{ t(w) }}</span>
                </div>

                <!-- Impairment test outcome -->
                <div v-if="form.action === 'impair'" class="vcd-block">
                  <div class="vcd-kv"><span>{{ t('Carrying amount at the test') }}</span><span>{{ money(preview.impairment?.carrying ?? preview.books[0]?.carryingBefore) }}</span></div>
                  <div class="vcd-kv"><span>{{ t('Recoverable amount') }}</span><span>{{ money(Number(form.recoverable.replace(/\D/g, ''))) }}</span></div>
                  <div class="vcd-kv vcd-kv--result">
                    <span>{{ t('Outcome') }}</span>
                    <span>{{ preview.impairment?.loss ? `${t('Impaired')}: ${t('write-down of')} ${formatIDR(preview.impairment.loss)}` : t('No impairment. The test is kept on the asset history.') }}</span>
                  </div>
                </div>

                <!-- Reversal: uncapped, cap, and which applied -->
                <div v-if="preview.reversal" class="vcd-block">
                  <div class="vcd-kv"><span>{{ t('Carrying amount now') }}</span><span>{{ formatIDR(preview.reversal.carrying) }}</span></div>
                  <div class="vcd-kv"><span>{{ t('Recovery found by the test') }}</span><span>{{ formatIDR(preview.reversal.uncapped) }}</span></div>
                  <div class="vcd-kv"><span>{{ t('Cap: unimpaired carrying amount') }}</span><span>{{ formatIDR(preview.reversal.unimpaired) }}</span></div>
                  <div class="vcd-kv"><span>{{ t('Most that can be written back') }}</span><span>{{ formatIDR(preview.reversal.cap) }}</span></div>
                  <div class="vcd-kv vcd-kv--result">
                    <span>{{ preview.reversal.capApplied ? t('Cap applied') : t('Recovery applied in full') }}</span>
                    <span>{{ formatIDR(preview.reversal.applied) }}</span>
                  </div>
                </div>

                <!-- Split children -->
                <div v-if="preview.children.length" class="vcd-block">
                  <div class="vcd-block-title">{{ t('New assets') }}</div>
                  <table class="vcd-table">
                    <thead>
                      <tr>
                        <th class="vcd-th">{{ t('Asset') }}</th>
                        <th class="vcd-th vcd-th--num">{{ t('Share') }}</th>
                        <th class="vcd-th vcd-th--num">{{ t('Accounting book value') }}</th>
                        <th v-if="hasTax" class="vcd-th vcd-th--num">{{ t('Tax book value') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="c in preview.children" :key="c.id">
                        <td class="vcd-td">{{ c.id }}<span class="vcd-td-sub">{{ c.name }}</span></td>
                        <td class="vcd-td vcd-td--num">{{ pct(c.proportion) }}</td>
                        <td class="vcd-td vcd-td--num">{{ money(c.accounting) }}</td>
                        <td v-if="hasTax" class="vcd-td vcd-td--num">{{ money(c.tax) }}</td>
                      </tr>
                      <tr class="vcd-tr--total">
                        <td class="vcd-td">{{ t('Together') }}</td>
                        <td class="vcd-td vcd-td--num">100%</td>
                        <td class="vcd-td vcd-td--num">{{ money(preview.childTotals?.accounting) }}</td>
                        <td v-if="hasTax" class="vcd-td vcd-td--num">{{ money(preview.childTotals?.tax) }}</td>
                      </tr>
                      <tr>
                        <td class="vcd-td">{{ asset.id }} {{ t('before the split') }}</td>
                        <td class="vcd-td vcd-td--num" />
                        <td class="vcd-td vcd-td--num">{{ money(preview.childTotals?.parentAccounting) }}</td>
                        <td v-if="hasTax" class="vcd-td vcd-td--num">{{ money(preview.childTotals?.parentTax) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p class="vcd-hint">
                    {{ preview.childTotals?.accounting === preview.childTotals?.parentAccounting && preview.childTotals?.tax === preview.childTotals?.parentTax
                      ? t('Equal to the rupiah on both books.')
                      : t('The parts do not add up to the parent. The split cannot be recorded.') }}
                  </p>
                </div>

                <!-- Both books, before and after -->
                <div v-for="b in preview.books" :key="b.book" class="vcd-block">
                  <div class="vcd-block-title">
                    {{ t(b.label) }}
                    <span v-if="b.unchanged" class="vcd-tag">{{ t('Unchanged') }}</span>
                  </div>
                  <div class="vcd-compare">
                    <div class="vcd-compare-head" />
                    <div class="vcd-compare-head">{{ t('Before') }}</div>
                    <div class="vcd-compare-head">{{ t('After') }}</div>
                    <div class="vcd-compare-label">{{ t('Monthly charge from') }} {{ b.rows.find((r) => r.period === b.firstChanged)?.label }}</div>
                    <div class="vcd-compare-num">{{ money(b.chargeBefore) }}</div>
                    <div class="vcd-compare-num">{{ money(b.chargeAfter) }}</div>
                    <div class="vcd-compare-label">{{ t('Carrying amount') }}</div>
                    <div class="vcd-compare-num">{{ money(b.carryingBefore) }}</div>
                    <div class="vcd-compare-num">{{ money(b.carryingAfter) }}</div>
                    <div class="vcd-compare-label">{{ t('Cost') }}</div>
                    <div class="vcd-compare-num">{{ money(b.costBefore) }}</div>
                    <div class="vcd-compare-num">{{ b.costAfter === null ? t('Disposed') : money(b.costAfter) }}</div>
                    <div class="vcd-compare-label">{{ t('Life') }}</div>
                    <div class="vcd-compare-text">{{ b.lifeBefore }}</div>
                    <div class="vcd-compare-text">{{ b.lifeAfter }}</div>
                    <template v-if="b.disposalCharge">
                      <div class="vcd-compare-label">{{ t(`Depreciation to ${b.disposalCharge.date}`) }}</div>
                      <div class="vcd-compare-num" />
                      <div class="vcd-compare-num vcd-strong">{{ money(b.disposalCharge.charge) }}</div>
                    </template>
                    <template v-if="b.gainLoss !== undefined">
                      <div class="vcd-compare-label">{{ t('Gain or loss') }}</div>
                      <div class="vcd-compare-num" />
                      <div class="vcd-compare-num vcd-strong">{{ gainLoss(b.gainLoss) }}</div>
                    </template>
                    <template v-if="b.catchUp">
                      <div class="vcd-compare-label">{{ t('Catch-up in the effective period') }}</div>
                      <div class="vcd-compare-num" />
                      <div class="vcd-compare-num vcd-strong">{{ formatIDR(b.catchUp) }}</div>
                    </template>
                  </div>
                  <p v-if="b.note" class="vcd-hint">{{ t(b.note) }}</p>
                  <p v-if="b.disposalCharge" class="vcd-hint">
                    {{ t(`${b.disposalCharge.label} is charged up to the disposal date and nothing after it. The module uses the full-month convention, so the disposal month carries a full month's charge, which is included in the carrying amount the gain or loss is measured against.`) }}
                  </p>
                  <table class="vcd-table">
                    <thead>
                      <tr>
                        <th class="vcd-th">{{ t('Period') }}</th>
                        <th class="vcd-th vcd-th--num">{{ t('Charge before') }}</th>
                        <th class="vcd-th vcd-th--num">{{ t('Charge after') }}</th>
                        <th class="vcd-th vcd-th--num">{{ t('Carrying after') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in b.rows" :key="r.period" :class="{ 'vcd-tr--applied': r.applied, 'vcd-tr--changed': r.before !== r.after }">
                        <td class="vcd-td">{{ r.label }}<span v-if="r.applied" class="vcd-td-sub">{{ t('Before the change') }}</span></td>
                        <td class="vcd-td vcd-td--num">{{ r.before === null ? t(r.beforeAbsent ?? 'None') : formatIDR(r.before) }}</td>
                        <td class="vcd-td vcd-td--num">{{ r.after === null ? t(r.afterAbsent ?? 'None') : formatIDR(r.after) }}</td>
                        <td class="vcd-td vcd-td--num">{{ money(r.carryingAfter) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
            </section>
          </div>

          <footer class="vcd-foot">
            <p v-if="commitError" class="vcd-error vcd-foot-error">{{ t(commitError) }}</p>
            <p v-else-if="approvalNote" class="vcd-hint vcd-foot-error">{{ t(approvalNote) }}</p>
            <div class="vcd-footright">
              <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
              <MpButton is-rounded data-tour="dlg-primary" @click="commit">{{ t(commitLabel) }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 1300 matches BillsFiltersDrawer: the app header is 1100, and a drawer
   below it renders with its own header hidden behind the chrome. */
.vcd-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
/* Wider than a filter drawer: the preview sets two books side by side with
   before and after columns. */
.vcd-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 640px; max-width: 96vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default);
  overflow: hidden;
}
/* rule/drawer-header-fill: the header has a fill; the panel has no shadow. */
.vcd-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.vcd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vcd-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.vcd-close { flex: none; }

.vcd-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.vcd-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.vcd-row--3 { grid-template-columns: 1fr 1fr 1fr; }
.vcd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-5); min-width: 0; }
.vcd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vcd-sublabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vcd-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; line-height: var(--mp-line-heights-sm); }
/* rule/form-errors-inline: the error sits with the field, not in a toast. */
.vcd-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; line-height: var(--mp-line-heights-sm); }

.vcd-part { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); }
.vcd-part-share { width: 112px; flex: none; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.vcd-part-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.vcd-part-foot { display: flex; align-items: center; justify-content: space-between; }

.vcd-preview { border-top: 1px solid var(--mp-border-default); padding-top: var(--mp-spacing-5); }
.vcd-preview-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-3); }
.vcd-refusal, .vcd-warning {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-sm);
}
.vcd-refusal { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.vcd-warning { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }

.vcd-block { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
.vcd-block-title { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-2); }
.vcd-tag { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.vcd-kv { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); font-variant-numeric: tabular-nums; }
.vcd-kv span:first-child { color: var(--mp-text-secondary); }
.vcd-kv--result { border-bottom: 0; font-weight: var(--mp-font-weights-semi-bold); }
.vcd-kv--result span:first-child { color: var(--mp-text-default); }

.vcd-compare { display: grid; grid-template-columns: 1.3fr 1fr 1fr; column-gap: var(--mp-spacing-3); row-gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-3); }
.vcd-compare-head { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: right; }
.vcd-compare-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vcd-compare-num { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right; font-variant-numeric: tabular-nums; }
.vcd-compare-text { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); text-align: right; }
.vcd-strong { font-weight: var(--mp-font-weights-semi-bold); }

.vcd-table { width: 100%; border-collapse: collapse; margin-top: var(--mp-spacing-2); }
.vcd-th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); padding: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default);
}
.vcd-th--num { text-align: right; }
.vcd-td { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); padding: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); }
.vcd-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.vcd-td-sub { display: block; color: var(--mp-text-secondary); }
.vcd-tr--applied .vcd-td { color: var(--mp-text-secondary); }
.vcd-tr--changed .vcd-td { font-weight: var(--mp-font-weights-semi-bold); }
.vcd-tr--total .vcd-td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }

.vcd-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  border-top: 1px solid var(--mp-border-default);
}
.vcd-foot-error { flex: 1; }
.vcd-footright { display: flex; gap: var(--mp-spacing-2); flex: none; }

.vcd-enter-active, .vcd-leave-active { transition: opacity 0.16s ease; }
.vcd-enter-from, .vcd-leave-to { opacity: 0; }
</style>
