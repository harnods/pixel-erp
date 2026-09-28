<script setup lang="ts">
/**
 * Matching rules — how the reconciliation engine decides what to auto-match,
 * suggest, or flag.
 *
 * Settings on the left, a live "how the engine will behave" preview on the right
 * that recomputes from the current threshold values, so the user can see the
 * effect of a slider before saving. Save / Restore defaults are title-bar actions
 * in [...slug].vue.
 */
import type { Ref } from 'vue'
import { MpIcon, MpToggle, MpSlider, MpSegmentedControl } from '@mekari/pixel3'
import { MATCH_META } from '~/data/vatReconciliation'

const { t } = useLocale()

interface Rules {
  npwp: string
  invoiceRef: string
  party: string
  dateWindow: number
  dppTolerance: number
  ppnTolerance: number
  autoMatchThreshold: number
  suggestThreshold: number
  aiSuggestions: boolean
  autoApprove: boolean
}

const DEFAULTS: Rules = {
  npwp: 'exact',
  invoiceRef: 'fuzzy',
  party: 'fuzzy',
  dateWindow: 3,
  dppTolerance: 0,
  ppnTolerance: 100,
  autoMatchThreshold: 95,
  suggestThreshold: 70,
  aiSuggestions: true,
  autoApprove: false,
}

const rules = reactive<Rules>({ ...DEFAULTS })

// "Restore defaults" is a title-bar action (see [...slug].vue) — it bumps this
// injected counter rather than reaching into the page.
const resetSignal = inject<Ref<number>>('matchingRulesReset', ref(0))
watch(resetSignal, () => Object.assign(rules, DEFAULTS))

/**
 * `options` is shaped for MpSegmentedControl's `data` prop ({ id, label, value }),
 * so the control renders itself instead of us hand-rolling a pill group.
 */
const attributeRules = [
  {
    key: 'npwp' as const,
    title: 'NPWP (tax ID)',
    description: 'The taxpayer identification number on both records.',
    weight: 'High',
    options: [
      { id: 'npwp-exact', label: 'Exact match', value: 'exact' },
      { id: 'npwp-ignore', label: 'Ignore', value: 'ignore' },
    ],
  },
  {
    key: 'invoiceRef' as const,
    title: 'Invoice / faktur reference',
    description: 'Compare the ERP reference against the Coretax faktur number.',
    weight: 'Medium',
    options: [
      { id: 'ref-exact', label: 'Exact', value: 'exact' },
      { id: 'ref-fuzzy', label: 'Fuzzy', value: 'fuzzy' },
      { id: 'ref-ignore', label: 'Ignore', value: 'ignore' },
    ],
  },
  {
    key: 'party' as const,
    title: 'Party name',
    description: 'Customer or vendor display name.',
    weight: 'Low',
    options: [
      { id: 'party-exact', label: 'Exact', value: 'exact' },
      { id: 'party-fuzzy', label: 'Fuzzy', value: 'fuzzy' },
      { id: 'party-ignore', label: 'Ignore', value: 'ignore' },
    ],
  },
]

/** Sliders are MpSlider; these describe the three tolerance/threshold groups. */
const toleranceSliders = [
  { key: 'dateWindow' as const, title: 'Date window', description: 'Maximum days between the ERP date and the Coretax date.', min: 0, max: 14, step: 1, suffix: 'days' as const },
  { key: 'dppTolerance' as const, title: 'DPP tolerance', description: 'Acceptable difference in the taxable base amount.', min: 0, max: 10000, step: 100, suffix: 'rp' as const },
  { key: 'ppnTolerance' as const, title: 'PPN tolerance', description: 'Acceptable difference in the tax amount.', min: 0, max: 5000, step: 50, suffix: 'rp' as const },
]

const thresholdSliders = [
  { key: 'autoMatchThreshold' as const, title: 'Auto-match threshold', description: 'Above this confidence the pair is matched without review.', min: 71, max: 100, step: 1, suffix: 'pct' as const },
  { key: 'suggestThreshold' as const, title: 'Suggested match threshold', description: 'Above this confidence the pair appears as a suggestion to review.', min: 50, max: 95, step: 1, suffix: 'pct' as const },
]

/** Formats a slider's current value for the read-out box beside it. */
function readout(value: number, suffix: 'days' | 'rp' | 'pct'): string {
  if (suffix === 'rp') return `Rp${value.toLocaleString('id-ID')}`
  if (suffix === 'pct') return `${value}%`
  return `${value} ${value === 1 ? t('day') : t('days')}`
}

/**
 * Confidence bands, derived so they always agree with the two thresholds. Colours
 * come from MATCH_META so this preview can't drift from the workspace rows it
 * predicts (auto-matched → matched, suggested → the Airene AI treatment, …).
 */
const bands = computed(() => [
  { band: `${rules.autoMatchThreshold}–100%`, label: t('Auto-matched'), meta: MATCH_META.matched },
  { band: `${rules.suggestThreshold}–${rules.autoMatchThreshold - 1}%`, label: t('Suggested match'), meta: MATCH_META.suggested },
  { band: `0–${rules.suggestThreshold - 1}%`, label: t('Discrepancy or unmatched'), meta: MATCH_META['erp-only'] },
])

const ruleHistory = [
  { time: '21 May 2026', user: 'Rizal Candra', what: 'Lowered PPN tolerance to Rp100' },
  { time: '14 May 2026', user: 'Rizal Candra', what: 'Enabled AI explanations' },
  { time: '01 Apr 2026', user: 'Andini Sari', what: 'Initial setup' },
]

/**
 * Keep the suggest threshold strictly below the auto-match threshold — the bands
 * are rendered from the gap between them, and an inverted pair would print a
 * nonsense range like "95–69%".
 */
watch(() => rules.autoMatchThreshold, (v) => {
  if (rules.suggestThreshold >= v) rules.suggestThreshold = v - 1
})
watch(() => rules.suggestThreshold, (v) => {
  if (v >= rules.autoMatchThreshold) rules.autoMatchThreshold = Math.min(100, v + 1)
})
</script>

<template>
  <div class="vm-page">
    <!-- Settings column -->
    <div class="vm-main">
      <!-- Matching attributes -->
      <section class="vm-card">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="sliders" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('Matching attributes') }}</div>
            <div class="vm-card-sub">{{ t('Pick which fields the engine compares, and how strictly.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <div v-for="attr in attributeRules" :key="attr.key" class="vm-rule">
            <div class="vm-rule-text">
              <div class="vm-rule-title-row">
                <span class="vm-rule-title">{{ t(attr.title) }}</span>
                <span class="vm-weight">{{ t('Weight') }} · {{ t(attr.weight) }}</span>
              </div>
              <div class="vm-rule-desc">{{ t(attr.description) }}</div>
            </div>
            <MpSegmentedControl
              :id="`vm-seg-${attr.key}`"
              :name="`vm-seg-${attr.key}`"
              v-model="rules[attr.key]"
              :data="attr.options.map(o => ({ ...o, label: t(o.label) }))"
            />
          </div>
        </div>
      </section>

      <!-- Tolerances -->
      <section class="vm-card">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="calculator" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('Tolerances') }}</div>
            <div class="vm-card-sub">{{ t('How much drift can be ignored before the engine flags a discrepancy.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <div v-for="s in toleranceSliders" :key="s.key" class="vm-slider">
            <div class="vm-slider-head">
              <div>
                <div class="vm-rule-title">{{ t(s.title) }}</div>
                <div class="vm-rule-desc">{{ t(s.description) }}</div>
              </div>
              <div class="vm-readout">{{ readout(rules[s.key], s.suffix) }}</div>
            </div>
            <MpSlider
              :id="`vm-slider-${s.key}`"
              :value="rules[s.key]"
              :min="s.min"
              :max="s.max"
              :step="s.step"
              :aria-label="t(s.title)"
              @change="(v: number | number[]) => rules[s.key] = Number(v)"
            >
              <template #label><span class="vm-sr-only">{{ t(s.title) }}</span></template>
              <template #value><span /></template>
              <template #min>{{ readout(s.min, s.suffix) }}</template>
              <template #max>{{ readout(s.max, s.suffix) }}</template>
            </MpSlider>
          </div>
        </div>
      </section>

      <!-- Confidence thresholds -->
      <section class="vm-card">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="chart-line" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('Confidence thresholds') }}</div>
            <div class="vm-card-sub">{{ t('The engine scores every match. These thresholds decide what happens next.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <div v-for="s in thresholdSliders" :key="s.key" class="vm-slider">
            <div class="vm-slider-head">
              <div>
                <div class="vm-rule-title">{{ t(s.title) }}</div>
                <div class="vm-rule-desc">{{ t(s.description) }}</div>
              </div>
              <div class="vm-readout">{{ readout(rules[s.key], s.suffix) }}</div>
            </div>
            <MpSlider
              :id="`vm-slider-${s.key}`"
              :value="rules[s.key]"
              :min="s.min"
              :max="s.max"
              :step="s.step"
              :aria-label="t(s.title)"
              @change="(v: number | number[]) => rules[s.key] = Number(v)"
            >
              <template #label><span class="vm-sr-only">{{ t(s.title) }}</span></template>
              <template #value><span /></template>
              <template #min>{{ readout(s.min, s.suffix) }}</template>
              <template #max>{{ readout(s.max, s.suffix) }}</template>
            </MpSlider>
          </div>

          <div class="vm-note">
            <!-- MpIcon ignores CSS `color`, so the tint comes from the prop.
                 There is no Airene icon token; information is the nearest. -->
            <MpIcon name="magic" size="sm" color="icon.information" class="vm-note-icon" />
            <div>
              {{ t('Pairs scoring below') }} {{ rules.suggestThreshold }}%
              {{ t('are flagged as discrepancies or unmatched, depending on which fields differ.') }}
              <span class="vm-note-accent">{{ t('AI explanations') }}</span>
              {{ t('tell users why each suggestion was made.') }}
            </div>
          </div>
        </div>
      </section>

      <!-- Automation -->
      <section class="vm-card">
        <header class="vm-card-head">
          <div class="vm-card-icon"><MpIcon name="magic" size="md" /></div>
          <div>
            <div class="vm-card-title">{{ t('Automation') }}</div>
            <div class="vm-card-sub">{{ t('What the engine does on its own when it finds a high-confidence match.') }}</div>
          </div>
        </header>
        <div class="vm-card-body">
          <div class="vm-toggle-row">
            <div class="vm-rule-text">
              <div class="vm-rule-title">{{ t('Use AI to explain suggestions') }}</div>
              <div class="vm-rule-desc">{{ t('Show plain-language reasoning next to each suggested match and discrepancy.') }}</div>
            </div>
            <MpToggle v-model:is-checked="rules.aiSuggestions" :aria-label="t('Use AI to explain suggestions')" />
          </div>
          <div class="vm-toggle-row">
            <div class="vm-rule-text">
              <div class="vm-rule-title">{{ t('Auto-approve high-confidence matches') }}</div>
              <div class="vm-rule-desc">{{ t('Pairs above the auto-match threshold are accepted with no manual review. You can still unmatch them later.') }}</div>
            </div>
            <MpToggle v-model:is-checked="rules.autoApprove" :aria-label="t('Auto-approve high-confidence matches')" />
          </div>
        </div>
      </section>
    </div>

    <!-- Preview column -->
    <aside class="vm-aside">
      <div class="vm-preview">
        <div class="vm-preview-head">
          <MpIcon name="info" size="sm" color="icon.information" />
          <div class="vm-card-title">{{ t('How the engine will behave') }}</div>
        </div>
        <div class="vm-bands">
          <div
            v-for="b in bands"
            :key="b.label"
            class="vm-band"
            :style="{ background: b.meta.bg }"
          >
            <span class="vm-band-range" :style="{ color: b.meta.fg }">{{ b.band }}</span>
            <span class="vm-band-label">{{ b.label }}</span>
          </div>
        </div>
        <div class="vm-preview-note">
          <span class="vm-preview-note-strong">{{ t('Current period preview') }}:</span>
          {{ t('with these rules, the last 248 invoices would have been') }}
          <span class="vm-stat vm-stat--ok">221 {{ t('auto-matched') }}</span>,
          <span class="vm-stat vm-stat--ai">18 {{ t('suggestions') }}</span>,
          {{ t('and') }}
          <span class="vm-stat vm-stat--bad">9 {{ t('flagged') }}</span>.
        </div>
      </div>

      <div class="vm-history">
        <div class="vm-history-head">
          <MpIcon name="log" size="sm" />
          <span>{{ t('Rule history') }}</span>
        </div>
        <div v-for="(h, i) in ruleHistory" :key="i" class="vm-history-row" :class="{ 'is-last': i === ruleHistory.length - 1 }">
          <span class="vm-history-meta">{{ h.time }} · {{ h.user }}</span>
          <span class="vm-history-what">{{ h.what }}</span>
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
