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
 * VatReconciliationPeriodsPage. Cancel + Save sit at the end of the form.
 */
import {
  MpSegmentedControl, MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage, MpInputTag,
  MpButton, MpButtonGroup, MpIcon,
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

// Cancel leaves without saving (rule/form-actions-always-present: both always shown).
function cancel() { router.push('/vat-reconciliation') }

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
    description: 'A faktur must be dated on or after the invoice it belongs to. One dated earlier is flagged, never matched. There is no tolerance window because Coretax enforces the issuance deadline at upload.',
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
  <!-- Settings-page layout (SettingsInventoryPage): titled sections with a
       description, separated by dividers; notices are side cards; the save stamp
       is the standard "Last updated by … on …" line. -->
  <div class="vm-page" data-devchange="vat-recon-setup-patterns">
    <div class="vm-main" :data-devchange="VAT_IN_ENABLED ? undefined : 'vat-recon-hide-vat-in'">
      <!-- Scope first: it decides which sides the rest of the module shows.
           Hidden while VAT In is a non-goal (VAT_IN_ENABLED): scope is VAT Out. -->
      <section v-if="VAT_IN_ENABLED" class="vm-section">
        <div class="vm-section-meta">
          <h2 class="vm-section-title">{{ t('What to reconcile') }}</h2>
          <p class="vm-section-desc">{{ t('VAT Out is sales invoices against faktur keluaran. VAT In adds purchase invoices against faktur masukan.') }}</p>
        </div>
        <MpSegmentedControl
          id="vm-seg-scope"
          name="vm-seg-scope"
          v-model="scope"
          :data="scopeOptions.map(o => ({ ...o, label: t(o.label) }))"
        />
      </section>

      <!-- US-016 — the user picks the PPN accounts by hand (no auto-detect) -->
      <section class="vm-section" data-devchange="vat-setup-manual-accounts">
        <div class="vm-section-meta">
          <h2 class="vm-section-title">{{ t('PPN Keluaran accounts') }}</h2>
          <p class="vm-section-desc">{{ t('Transactions posted to these accounts, such as sales invoices, journal entries, and bank deposits, are included in VAT Out reconciliation.') }}</p>
        </div>
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
          <MpFormHelpText v-else>{{ t('Select only accounts that record PPN Keluaran (VAT Out), e.g. VAT Out or PPN Keluaran. Accounts for other taxes, like PPh, include the wrong transactions') }}</MpFormHelpText>
        </MpFormControl>
      </section>

      <!-- OD-008 — VAT In shares the shell; its accounts only matter when in scope -->
      <section v-if="VAT_IN_ENABLED && scope === 'both'" class="vm-section" data-devchange="vat-setup-manual-accounts">
        <div class="vm-section-meta">
          <h2 class="vm-section-title">{{ t('PPN Masukan accounts') }}</h2>
          <p class="vm-section-desc">{{ t('Transactions posted to these accounts, such as purchase invoices, journal entries, and bank payments, are included in VAT In reconciliation.') }}</p>
        </div>
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
          <MpFormHelpText v-else>{{ t('Select only accounts that record PPN Masukan (VAT In), e.g. VAT In or PPN Masukan. Accounts for other taxes, like prepaid PPh, include the wrong transactions') }}</MpFormHelpText>
        </MpFormControl>
      </section>

      <!-- §4 — applied to every match, nothing to tune. Each row: "Title: value",
           then the description. -->
      <section class="vm-section">
        <div class="vm-section-meta">
          <h2 class="vm-section-title">{{ t('How matching works') }}</h2>
          <p class="vm-section-desc">{{ t('Applied to every pair and not configurable.') }}</p>
        </div>
        <div class="vm-rules">
          <!-- "Match key: Exact" on one line; the description spans the form width. -->
          <div v-for="r in fixedRules" :key="r.title" class="vm-rule" data-devchange="vat-recon-setup-rule-rows">
            <span class="vm-rule-title">{{ t(r.title) }}: {{ t(r.value) }}</span>
            <span class="vm-rule-desc">{{ t(r.description) }}</span>
          </div>
        </div>
      </section>

      <!-- Standard last-updated string (uxw: "Last updated by {Name} on {Date}, {Time}"). -->
      <p v-if="saved" class="vm-last-updated" data-devchange="vat-recon-ui-review-2" data-test-id="vm-last-updated">
        {{ t('Last updated by') }} {{ saved.savedBy }} {{ t('on') }} {{ formatDateTimeLong(saved.savedAt) }}
      </p>

      <!-- Form footer: Cancel (ghost) + Save (primary), right-aligned at the end
           of the form (rule/btn-responsive-footer, rule/form-actions-always-present). -->
      <MpButtonGroup class="erp-action-footer vm-footer" data-devchange="vat-recon-setup-footer">
        <MpButton variant="ghost" is-rounded class="btn-enterprise btn-enterprise--ghost" @click="cancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded class="btn-enterprise btn-enterprise--primary" data-test-id="vm-save" @click="save">
          <!-- Create vs edit (rule/form-edit-save-changes): first run creates. -->
          {{ saved ? t('Save changes') : t('Save') }}
        </MpButton>
      </MpButtonGroup>

    </div>

    <!-- Right of the form: what the setup affects (bordered cards, rule/surface-border-no-shadow). -->
    <aside class="vm-aside" data-devchange="vat-recon-setup-footer">
      <section class="vm-side-card" data-devchange="vat-recon-first-period" data-test-id="vm-affects">
        <div class="vm-side-head">
          <MpIcon name="info" size="sm" color="icon.information" />
          <h3 class="vm-side-title">{{ t('What this affects') }}</h3>
        </div>
        <p class="vm-side-body">
          <strong>{{ t('PPN Keluaran') }}:</strong>
          {{ outputCodes.length ? accountLabels(outputCodes) : t('none yet') }}.
          <template v-if="scope === 'both'">
            <strong>{{ t('PPN Masukan') }}:</strong>
            {{ inputCodes.length ? accountLabels(inputCodes) : t('none yet') }}.
          </template>
          {{ t('Periods are reconciled from') }}
          {{ periodLabelById(FIRST_PERIOD_ID) }} {{ t('onward,') }}
          {{ scope === 'both' ? t('for both VAT Out and VAT In.') : t('for VAT Out only.') }}
        </p>
      </section>
      <section v-if="changedSinceSnapshot" class="vm-side-card" data-test-id="vm-heads-up">
        <div class="vm-side-head">
          <MpIcon name="warning" size="sm" color="icon.warning" />
          <h3 class="vm-side-title">{{ t('Heads up') }}</h3>
        </div>
        <p class="vm-side-body">
          {{ t('Periods already reconciled keep the accounts they ran with') }} ({{ snapshotLabel }}).
          {{ t('Reconciling one again uses the current selection instead.') }}
        </p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
/* Form left (sections at form width, rule/form-field-stacking), cards right. */
.vm-page {
  --vm-form-max: 760px;
  display: grid;
  grid-template-columns: minmax(0, var(--vm-form-max)) minmax(0, 1fr);
  gap: var(--mp-spacing-10);
  align-items: start;
}
@media (max-width: 1200px) { .vm-page { grid-template-columns: minmax(0, 1fr); } }
.vm-main { display: flex; flex-direction: column; gap: var(--mp-spacing-6); min-width: 0; }

/* ── Sections (SettingsInventoryPage) ── */
.vm-section {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding-top: var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default);
}
/* The first section starts the form — no divider above it. */
.vm-section:first-of-type { padding-top: 0; border-top: 0; }
.vm-section-meta { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
/* H3 role: lg / semibold (rule/type-scale, rule/type-heading-semibold). */
.vm-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* Section description is body text: 14px regular (rule/type-14-default). */
.vm-section-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Account picker — spans the form width (user request, 2026-11-09:
   overrides the 558px default of rule/form-field-stacking for this page). ── */
.vm-account-field { width: 100%; }

/* ── Fixed rules — "Title: value" then the description, divided ── */
.vm-rules { display: flex; flex-direction: column; }
.vm-rule {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-3) 0;
}
.vm-rule + .vm-rule { border-top: 1px solid var(--mp-border-default); }
.vm-rule-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vm-rule-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Footer ── */
.vm-footer { padding-top: var(--mp-spacing-6); border-top: 1px solid var(--mp-border-default); }

/* ── Side cards (bordered, flat) ── */
.vm-aside { position: sticky; top: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-width: 0; }
.vm-side-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-surface);
}
.vm-side-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.vm-side-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vm-side-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Last updated — caption ── */
.vm-last-updated { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
