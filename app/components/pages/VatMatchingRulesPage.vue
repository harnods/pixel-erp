<script setup lang="ts">
/**
 * VAT reconciliation setup — which Jurnal tax codes count as PPN Keluaran
 * (PRD OD-001 v1.0, US-016).
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
import { MpIcon, MpCheckbox, MpSegmentedControl } from '@mekari/pixel3'
import {
  VAT_OUT_TAX_CODES, loadVatSetup, saveVatSetup, taxCodeLabels,
  SNAPSHOT_TAX_CODE_IDS, FIRST_PERIOD_ID, periodLabelById,
  type VatReconScope,
} from '~/data/vatReconciliation'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()

const selected = ref<string[]>(loadVatSetup()?.taxCodeIds ?? [...SNAPSHOT_TAX_CODE_IDS])
const saved = ref(loadVatSetup())

/**
 * VAT Out ships first (OD-001); VAT In is OD-008 and shares this shell. Making
 * it a choice rather than a build flag means a company that has not adopted VAT
 * In never sees half a feature, and the team can demo where OD-008 lands
 * without a second codebase.
 */
const scope = ref<VatReconScope>(loadVatSetup()?.scope ?? 'out')
const scopeOptions = [
  { id: 'vat-scope-out',  label: 'VAT Out only',   value: 'out'  },
  { id: 'vat-scope-both', label: 'VAT Out & VAT In', value: 'both' },
]

onMounted(() => {
  const s = loadVatSetup()
  if (s) { saved.value = s; selected.value = [...s.taxCodeIds]; scope.value = s.scope ?? 'out' }
})

function toggle(id: string, on: boolean) {
  selected.value = on
    ? [...new Set([...selected.value, id])]
    : selected.value.filter(x => x !== id)
}

/** At least one code, or reconciliation has nothing to pull. */
const canSave = computed(() => selected.value.length > 0)

/**
 * Changing setup after a period was reconciled doesn't rewrite that period — it
 * keeps the snapshot of the codes it ran with. Re-run is where the change takes
 * effect, and it warns first (US-016).
 */
const changedSinceSnapshot = computed(() =>
  [...selected.value].sort().join() !== [...SNAPSHOT_TAX_CODE_IDS].sort().join())

function save() {
  if (!canSave.value) return
  saved.value = saveVatSetup([...selected.value], scope.value)
  infoToast(t('Reconciliation setup saved'))
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
    <div class="vm-main">
      <!-- Scope first: it decides which sides the rest of the module shows -->
      <section class="vm-card">
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

      <!-- US-016 — the one thing the user actually configures -->
      <section class="vm-card">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="sliders" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('PPN Keluaran tax codes') }}</div>
            <div class="vm-card-sub">{{ t('Sales invoices carrying these tax codes are pulled into reconciliation.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <label v-for="c in VAT_OUT_TAX_CODES" :key="c.id" class="vm-rule vm-code">
            <MpCheckbox
              :id="`vm-code-${c.id}`"
              :is-checked="selected.includes(c.id)"
              :aria-label="c.name"
              @change="(v: boolean) => toggle(c.id, v)"
            />
            <div class="vm-rule-text">
              <div class="vm-rule-title-row">
                <span class="vm-rule-title">{{ c.code }}</span>
                <span class="vm-weight">{{ c.name }}</span>
              </div>
              <div class="vm-rule-desc">{{ c.account }}</div>
            </div>
          </label>

          <div class="vm-note">
            <MpIcon name="info" size="sm" color="icon.information" class="vm-note-icon" />
            <div>
              {{ t('Journal entries and bank deposits that post to these accounts are pulled in too, even when the line carries no tax code.') }}
            </div>
          </div>
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
        <div class="vm-preview-note">
          <span class="vm-preview-note-strong">{{ t('Selected') }}:</span>
          {{ selected.length ? taxCodeLabels(selected) : t('none yet') }}.
          {{ selected.length ? '' : '' }}
          {{ t('Periods are reconciled from') }}
          {{ periodLabelById(FIRST_PERIOD_ID) }} {{ t('onward,') }}
          {{ scope === 'both' ? t('for both VAT Out and VAT In.') : t('for VAT Out only.') }}
        </div>
        <div v-if="changedSinceSnapshot" class="vm-preview-note vm-preview-note--warn">
          <span class="vm-preview-note-strong">{{ t('Heads up') }}:</span>
          {{ t('periods already reconciled keep the tax codes they ran with') }}
          ({{ taxCodeLabels(SNAPSHOT_TAX_CODE_IDS) }}).
          {{ t('Re-running one will use the current selection instead.') }}
        </div>
      </div>

      <div v-if="saved" class="vm-history">
        <div class="vm-history-head">
          <MpIcon name="log" size="sm" />
          <span>{{ t('Setup history') }}</span>
        </div>
        <div class="vm-history-row is-last">
          <span class="vm-history-meta">{{ new Date(saved.savedAt).toLocaleString('en-GB') }}</span>
          <span class="vm-history-what">{{ taxCodeLabels(saved.taxCodeIds) }}</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.vm-page {
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
  width: 36px; height: 36px; border-radius: var(--mp-radii-md);
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
  padding: 1px var(--mp-spacing-2); border-radius: var(--mp-radii-full);
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

/* ── Inline note ── */
.vm-note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3);
  background: var(--mp-airene-badge-bg); border: 1px solid var(--mp-airene-badge-border);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
}
.vm-note-icon { flex-shrink: 0; margin-top: 2px; }
.vm-note-accent { color: var(--mp-airene-bold); font-weight: var(--mp-font-weights-semi-bold); }

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
.vm-code { cursor: pointer; align-items: flex-start; gap: var(--mp-spacing-3); }
.vm-preview-note-strong { font-weight: var(--mp-font-weights-bold); }
.vm-stat { font-weight: var(--mp-font-weights-bold); }
.vm-stat--ok { color: var(--mp-colors-emerald-800); }
.vm-stat--ai { color: var(--mp-airene-bold); }
.vm-stat--bad { color: var(--mp-colors-red-800); }

/* ── Rule history ── */
.vm-history {
  background: var(--mp-background-surface-bold); color: var(--mp-text-inverse);
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
  border-bottom: 1px solid var(--mp-colors-white-alpha-100);
}
.vm-history-row.is-last { border-bottom: 0; padding-bottom: 0; }
.vm-history-meta { font-size: var(--mp-font-sizes-xs); color: var(--mp-colors-white-alpha-700); }
.vm-history-what { font-size: var(--mp-font-sizes-sm); }
</style>
