<script setup lang="ts">
/**
 * VAT reconciliation setup — which accounts hold PPN Keluaran (and, once VAT
 * In is in scope, PPN Masukan). Picked by hand; never auto-detected
 * (PRD OD-001 v1.0, US-016).
 *
 * VAT In (OD-008) is a non-goal for the MVP: with VAT_IN_ENABLED off
 * (~/data/vatReconFlags) the scope choice and the PPN Masukan card are hidden
 * and scope is always VAT Out. The code below stays for OD-008.
 *
 * This replaced the old "Matching rules" page. v1.0 makes the matching model
 * deterministic and fixed (§4): exact key, exact corroboration, direction check,
 * no tolerance window, no confidence thresholds, no AI in the engine. There is
 * nothing left to tune — so the only thing the user configures is *what data
 * comes in*, and the rules the engine applies are stated rather than adjustable.
 *
 * Setup is mandatory before the index is reachable; the gate lives in
 * VatReconciliationPeriodsPage. Save is a title-bar action in [...slug].vue.
 */
import type { Ref } from 'vue'
import {
  MpIcon, MpSegmentedControl, MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage, MpInputTag,
  type DataInterface,
} from '@mekari/pixel3'
import {
  loadVatSetup, saveVatSetup, accountLabels, vatAccountOptionLabel,
  SNAPSHOT_ACCOUNT_CODES, FIRST_PERIOD_ID, periodLabelById, VAT_IN_ENABLED,
  type VatReconScope,
} from '~/data/vatReconciliation'
import { coaAccounts } from '~/data/wmsCutover'
import { successToast } from '~/utils/toasts'
import { formatDateTimeLong } from '~/utils/date'

const { t } = useLocale()

/**
 * Accounts are picked by hand, never guessed from tax codes — every company
 * numbers and names its PPN accounts differently (US-016). First visit starts
 * empty on purpose: a pre-filled account the user didn't choose is exactly the
 * silent wrong guess this replaces.
 */
const outputCodes = ref<string[]>([...(loadVatSetup()?.outputAccountCodes ?? [])])
const inputCodes = ref<string[]>([...(loadVatSetup()?.inputAccountCodes ?? [])])
const saved = ref(loadVatSetup())

/**
 * VAT Out ships first (OD-001); VAT In is OD-008 and shares this shell. Making
 * it a choice rather than a build flag means a company that has not adopted VAT
 * In never sees half a feature, and the team can demo where OD-008 lands
 * without a second codebase. "Both" adds the PPN Masukan account picker.
 *
 * While VAT_IN_ENABLED is off, "Both" is not offered (and loadVatSetup already
 * normalizes a stored `both` to `out`), so the whole choice is hidden.
 */
const scope = ref<VatReconScope>(loadVatSetup()?.scope ?? 'out')
const scopeOptions = [
  { id: 'vat-scope-out',  label: 'VAT Out only',   value: 'out'  },
  { id: 'vat-scope-both', label: 'VAT Out & VAT In', value: 'both' },
].filter((o) => VAT_IN_ENABLED || o.value !== 'both')

onMounted(() => {
  const s = loadVatSetup()
  if (s) {
    saved.value = s
    outputCodes.value = [...s.outputAccountCodes]
    inputCodes.value = [...s.inputAccountCodes]
    scope.value = s.scope
  }
})

// ── Account picker (MpInputTag speaks DataInterface[] — rule/select-multi-mpinputtag)
function toTag(code: string): DataInterface {
  const a = coaAccounts.find((x) => x.code === code)
  const text = a ? vatAccountOptionLabel(a) : code
  return { id: code, text, value: code, isInvalid: false, isReadOnly: false }
}
/**
 * Every account in the live chart — the user decides which ones hold PPN.
 * MpInputTag filters string suggestions only, so options are labels and a
 * picked tag's text is mapped back to its account code.
 */
const accountSuggestions = computed<string[]>(() => coaAccounts.map(vatAccountOptionLabel))
const outputTags = computed(() => outputCodes.value.map(toTag))
const inputTags = computed(() => inputCodes.value.map(toTag))
function codeOf(d: DataInterface): string {
  const text = String(d.text ?? d.value ?? d.id)
  return coaAccounts.find((a) => a.code === text || vatAccountOptionLabel(a) === text)?.code ?? text
}
const fromTags = (data: DataInterface[]) => [...new Set(data.map(codeOf))]

// ── Validation — inline, only after a save attempt (rule/form-errors-inline)
const submitted = ref(false)
const overlap = computed(() =>
  scope.value === 'both' ? outputCodes.value.filter((c) => inputCodes.value.includes(c)) : [])
const outputError = computed(() => {
  if (!submitted.value) return ''
  if (!outputCodes.value.length) return t('Select at least one PPN Keluaran account.')
  return ''
})
const inputError = computed(() => {
  if (!submitted.value || scope.value !== 'both') return ''
  if (!inputCodes.value.length) return t('Select at least one PPN Masukan account.')
  if (overlap.value.length) return t("An account can't be both PPN Keluaran and PPN Masukan. Remove it from one list.")
  return ''
})

function onOutputChange(data: DataInterface[]) { outputCodes.value = fromTags(data) }
function onInputChange(data: DataInterface[]) { inputCodes.value = fromTags(data) }

const sameCodes = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()

/**
 * Changing setup after a period was reconciled doesn't rewrite that period — it
 * keeps the snapshot of the accounts it ran with. Re-run is where the change
 * takes effect, and it warns first (US-016).
 */
const changedSinceSnapshot = computed(() =>
  !sameCodes(outputCodes.value, SNAPSHOT_ACCOUNT_CODES.output)
  || (scope.value === 'both' && !sameCodes(inputCodes.value, SNAPSHOT_ACCOUNT_CODES.input)))
const snapshotLabel = computed(() => scope.value === 'both'
  ? `${accountLabels(SNAPSHOT_ACCOUNT_CODES.output)}; ${accountLabels(SNAPSHOT_ACCOUNT_CODES.input)}`
  : accountLabels(SNAPSHOT_ACCOUNT_CODES.output))

const router = useRouter()

function save() {
  submitted.value = true
  if (outputError.value || inputError.value) return
  // First run creates the setup; the index it unlocks is where the user goes next
  // (US-016 AC-03). Later saves are edits and stay on the page.
  const firstRun = !loadVatSetup()
  saved.value = saveVatSetup({
    outputAccountCodes: [...outputCodes.value],
    // VAT In accounts are kept only while VAT In is in scope.
    inputAccountCodes: scope.value === 'both' ? [...inputCodes.value] : [],
    scope: scope.value,
  })
  submitted.value = false
  // rule/btn-save-toast — a save confirms with a success toast.
  successToast(t('Reconciliation setup saved'))
  if (firstRun) router.push('/vat-reconciliation')
}

// "Save changes" is a title-bar action (see [...slug].vue) — it bumps this
// counter, the same way Restore defaults used to.
const saveSignal = inject<Ref<number>>('vatSetupSave', ref(0))
watch(saveSignal, save)

/**
 * The matching model is fixed in v1.0 (§4), so the page states it rather than
 * offering controls. Each line is a rule the engine applies to every pair.
 */
const fixedRules = [
  {
    title: 'Match key',
    description: 'Sales invoice number against the faktur Referensi. Normalized first: trimmed, case-insensitive, separators ignored.',
    value: 'Exact',
  },
  {
    title: 'Corroboration',
    description: 'DPP, PPN and PPnBM must agree to the rupiah, and the buyer NPWP or NIK must match. PPnBM of 0 on both sides is not a mismatch.',
    value: 'Exact',
  },
  {
    title: 'Faktur date',
    description: 'A faktur must be dated on or after the invoice it belongs to. One dated earlier is flagged, never matched. There is no tolerance window — Coretax enforces the issuance deadline at upload.',
    value: 'Direction checked',
  },
  {
    title: 'Faktur status',
    description: 'Only Approved faktur are matched. Draft, Batal and Rejected are excluded and tagged.',
    value: 'Approved only',
  },
]
</script>

<template>
  <div class="vm-page">
    <div class="vm-main" :data-devchange="VAT_IN_ENABLED ? undefined : 'vat-recon-hide-vat-in'">
      <!-- Scope first: it decides which sides the rest of the module shows.
           Hidden while VAT In is a non-goal (VAT_IN_ENABLED): scope is VAT Out. -->
      <section v-if="VAT_IN_ENABLED" class="vm-card">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="doc" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('What to reconcile') }}</div>
            <div class="vm-card-sub">{{ t('VAT Out is sales invoices against faktur keluaran. VAT In adds purchase invoices against faktur masukan.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <MpSegmentedControl
            id="vm-seg-scope"
            name="vm-seg-scope"
            v-model="scope"
            :data="scopeOptions.map(o => ({ ...o, label: t(o.label) }))"
          />
        </div>
      </section>

      <!-- US-016 — the user picks the PPN accounts by hand (no auto-detect) -->
      <section class="vm-card" data-devchange="vat-setup-manual-accounts">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="sliders" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('PPN Keluaran accounts') }}</div>
            <div class="vm-card-sub">{{ t('Transactions posted to these accounts — sales invoices, journal entries and bank deposits — are pulled into VAT Out reconciliation.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <MpFormControl id="vm-output-accounts-fc" class="vm-account-field" :is-invalid="!!outputError">
            <MpFormLabel>{{ t('Include accounts') }}</MpFormLabel>
            <MpInputTag
              id="vm-output-accounts"
              :data="outputTags"
              :suggestions="accountSuggestions"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              :is-invalid="!!outputError"
              :placeholder="t('Select accounts')"
              @change="onOutputChange"
            />
            <MpFormErrorMessage v-if="outputError">{{ outputError }}</MpFormErrorMessage>
            <MpFormHelpText v-else>{{ t('Choose only accounts that record PPN Keluaran (VAT Out), e.g. VAT Out or PPN Keluaran. Accounts for other taxes, like PPh, pull in the wrong transactions.') }}</MpFormHelpText>
          </MpFormControl>
        </div>
      </section>

      <!-- OD-008 — VAT In shares the shell; its accounts only matter when in scope -->
      <section v-if="VAT_IN_ENABLED && scope === 'both'" class="vm-card" data-devchange="vat-setup-manual-accounts">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="sliders" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('PPN Masukan accounts') }}</div>
            <div class="vm-card-sub">{{ t('Transactions posted to these accounts — purchase invoices, journal entries and bank payments — are pulled into VAT In reconciliation.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <MpFormControl id="vm-input-accounts-fc" class="vm-account-field" :is-invalid="!!inputError">
            <MpFormLabel>{{ t('Include accounts') }}</MpFormLabel>
            <MpInputTag
              id="vm-input-accounts"
              :data="inputTags"
              :suggestions="accountSuggestions"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              :is-invalid="!!inputError"
              :placeholder="t('Select accounts')"
              @change="onInputChange"
            />
            <MpFormErrorMessage v-if="inputError">{{ inputError }}</MpFormErrorMessage>
            <MpFormHelpText v-else>{{ t('Choose only accounts that record PPN Masukan (VAT In), e.g. VAT In or PPN Masukan. Accounts for other taxes, like prepaid PPh, pull in the wrong transactions.') }}</MpFormHelpText>
          </MpFormControl>
        </div>
      </section>

      <!-- §4 — applied to every match, nothing to tune -->
      <section class="vm-card">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="calculator" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('How matching works') }}</div>
            <div class="vm-card-sub">{{ t('Applied to every pair and not configurable.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <div v-for="r in fixedRules" :key="r.title" class="vm-rule">
            <div class="vm-rule-text">
              <div class="vm-rule-title-row">
                <span class="vm-rule-title">{{ t(r.title) }}</span>
              </div>
              <div class="vm-rule-desc">{{ t(r.description) }}</div>
            </div>
            <span class="vm-fixed-value">{{ t(r.value) }}</span>
          </div>
        </div>
      </section>
    </div>

    <aside class="vm-aside">
      <div class="vm-preview">
        <div class="vm-preview-head">
          <MpIcon name="info" size="sm" color="icon.information" />
          <div class="vm-card-title">{{ t('What this affects') }}</div>
        </div>
        <div class="vm-preview-note" data-devchange="vat-recon-first-period">
          <span class="vm-preview-note-strong">{{ t('PPN Keluaran') }}:</span>
          {{ outputCodes.length ? accountLabels(outputCodes) : t('none yet') }}.
          <template v-if="scope === 'both'">
            <span class="vm-preview-note-strong">{{ t('PPN Masukan') }}:</span>
            {{ inputCodes.length ? accountLabels(inputCodes) : t('none yet') }}.
          </template>
          {{ t('Periods are reconciled from') }}
          {{ periodLabelById(FIRST_PERIOD_ID) }} {{ t('onward,') }}
          {{ scope === 'both' ? t('for both VAT Out and VAT In.') : t('for VAT Out only.') }}
        </div>
        <div v-if="changedSinceSnapshot" class="vm-preview-note vm-preview-note--warn">
          <span class="vm-preview-note-strong">{{ t('Heads up') }}:</span>
          {{ t('periods already reconciled keep the accounts they ran with') }}
          ({{ snapshotLabel }}).
          {{ t('Re-running one will use the current selection instead.') }}
        </div>
      </div>

      <!-- Same bordered surface as the card above (rule/surface-border-no-shadow);
           it shows the latest save only, so it is "Last saved", not a history. -->
      <div v-if="saved" class="vm-history" data-devchange="vat-recon-ui-review-2">
        <div class="vm-history-head">
          <MpIcon name="log" size="sm" />
          <span>{{ t('Last saved') }}</span>
        </div>
        <div class="vm-history-row is-last">
          <span class="vm-history-meta">{{ formatDateTimeLong(saved.savedAt) }}</span>
          <span class="vm-history-what">
            {{ saved.outputAccountCodes.length ? accountLabels(saved.outputAccountCodes) : t('No accounts selected') }}<template v-if="saved.scope === 'both' && saved.inputAccountCodes.length">; {{ accountLabels(saved.inputAccountCodes) }}</template>
          </span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.vm-page {
  --vr-icon-sz: 36px;
  --vr-badge-py: 1px;
  display: grid;
  grid-template-columns: minmax(0, 760px) minmax(0, 1fr);
  gap: var(--mp-spacing-6);
  align-items: start;
}
@media (max-width: 1200px) {
  .vm-page { grid-template-columns: minmax(0, 1fr); }
}

.vm-main { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-width: 0; }

/* ── Cards ── */
.vm-card {
  background: var(--mp-background-surface);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-5);
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}
.vm-card-head { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.vm-card-icon {
  width: var(--vr-icon-sz); height: var(--vr-icon-sz); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: var(--mp-text-secondary);
}
.vm-card-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vm-card-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.vm-card-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }

/* ── Attribute rule rows ── */
.vm-rule {
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
  display: flex; align-items: flex-start; gap: var(--mp-spacing-4);
}
.vm-rule-text { flex: 1; min-width: 0; }
.vm-rule-title-row {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  margin-bottom: var(--mp-spacing-1); flex-wrap: wrap;
}
.vm-rule-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vm-rule-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.vm-weight {
  padding: var(--vr-badge-py) var(--mp-spacing-2); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary);
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  white-space: nowrap;
}

/* ── Sliders ── */
.vm-slider {
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
}
.vm-slider-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-1);
}
.vm-fixed-value {
  flex: none;
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  border-radius: var(--mp-radii-full);
  background: var(--mp-colors-neutral-100);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  white-space: nowrap;
}
.vm-readout {
  padding: var(--mp-spacing-1) var(--mp-spacing-3); border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-bold);
  color: var(--mp-text-default);
  min-width: 80px; text-align: right; font-variant-numeric: tabular-nums;
  white-space: nowrap; flex-shrink: 0;
}
/* Visually-hidden label — MpSlider requires a label slot but the row above
   already names the control. */
.vm-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ── Account picker — form field width (rule/form-field-stacking) ── */
.vm-account-field { max-width: 558px; }

/* ── Toggle rows ── */
.vm-toggle-row {
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
  display: flex; align-items: center; gap: var(--mp-spacing-4);
}

/* ── Preview aside ── */
.vm-aside {
  position: sticky; top: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-width: 0;
}
.vm-preview {
  background: var(--mp-background-surface);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
}
.vm-preview-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.vm-bands { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm); overflow: hidden; }
.vm-band {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.vm-band + .vm-band { border-top: 1px solid var(--mp-border-default); }
.vm-band-range {
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  min-width: 90px; font-variant-numeric: tabular-nums;
}
.vm-band-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.vm-preview-note {
  padding: var(--mp-spacing-3); border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); line-height: 1.5;
}
.vm-preview-note--warn {
  margin-top: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md);
  background: var(--mp-colors-orange-100);
  color: var(--mp-colors-orange-800);
}
.vm-preview-note-strong { font-weight: var(--mp-font-weights-bold); }
.vm-stat { font-weight: var(--mp-font-weights-bold); }
.vm-stat--ok { color: var(--mp-colors-emerald-800); }
.vm-stat--ai { color: var(--mp-airene-bold); }
.vm-stat--bad { color: var(--mp-colors-red-800); }

/* ── Rule history ── */
.vm-history {
  background: var(--mp-background-surface); color: var(--mp-text-default);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.vm-history-head {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-bold);
}
.vm-history-row {
  display: flex; flex-direction: column;
  padding-bottom: var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
}
.vm-history-row.is-last { border-bottom: 0; padding-bottom: 0; }
.vm-history-meta { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); }
.vm-history-what { font-size: var(--mp-font-sizes-sm); }
</style>
