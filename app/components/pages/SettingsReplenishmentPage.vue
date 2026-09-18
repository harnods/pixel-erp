<script setup lang="ts">
/**
 * Settings › Replenishment — the company-wide policy behind every recommendation
 * (PRD US-004, US-011, US-010, US-012, US-015).
 *
 * Follows SettingsWarehousePage.vue's shape: a committed value plus an editable
 * draft, an explicit Edit mode, and Cancel/Save changes shown only while editing.
 *
 * Validation follows DESIGN.md: Save changes is NEVER disabled — clicking it with
 * bad input shows an inline error instead.
 */
import { ref, reactive, computed } from 'vue'
import { toast, css, MpIcon, MpInput, MpInputGroup, MpInputRightAddon, MpSelect, MpToggle } from '@mekari/pixel3'
import {
  getReplenishmentConfig, saveReplenishmentConfig,
  REPL_DEFAULTS, type ReplenishmentConfig,
} from '~/data/replenishmentConfig'
import { recalculateReplenishment, invalidateReplenishmentCaches } from '~/data/replenishment'
import { safetyDaysOverrideCount } from '~/data/replenishmentSettings'
import { CATALOG } from '~/data/catalog'

const { t } = useLocale()
const { activeScenario } = useScenario()

/** No RBAC plumbing in the prototype — the ERP scenario stands in for an admin.
 *  Everything else renders read-only, which is US-004 AC-03's visible surface. */
const canEdit = computed(() => activeScenario.value === 'ERP')

/** Deep copy that is safe on a reactive proxy — the structured-clone algorithm
 *  throws on one. The config is plain JSON data, so a round-trip is exact. */
function cloneConfig(cfg: ReplenishmentConfig): ReplenishmentConfig {
  return JSON.parse(JSON.stringify(cfg)) as ReplenishmentConfig
}

const committed = ref<ReplenishmentConfig>(getReplenishmentConfig())
const draft = reactive<ReplenishmentConfig>(cloneConfig(getReplenishmentConfig()))
const isEditing = ref(false)
const error = ref('')

const categories = [...new Set(CATALOG.map((c) => c.category))].sort()

const fsnBandsOk = computed(() => Number(draft.fsnFastPct) > Number(draft.fsnSlowPct))

/** How many SKU/warehouse rows override safety days — so editing the company
 *  default and seeing nothing move is explained (the override wins, D14). */
const safetyOverrides = computed(() => {
  void committed.value // recompute after a save
  return safetyDaysOverrideCount()
})

function startEdit() {
  Object.assign(draft, cloneConfig(committed.value))
  error.value = ''
  isEditing.value = true
}

function cancel() {
  Object.assign(draft, cloneConfig(committed.value))
  error.value = ''
  isEditing.value = false
}

function save() {
  // Validate on click, never by disabling the button.
  if (!fsnBandsOk.value) {
    error.value = t('The Fast threshold must be higher than the Slow threshold.')
    return
  }
  for (const [label, value] of [
    [t('Safety days default'), draft.safetyDaysGlobal],
    [t('Order coverage'), draft.coverageDaysGlobal],
    [t('Default lead time'), draft.fallbackLeadTimeDays],
    [t('Ignore gaps over'), draft.leadTimeOutlierCapDays],
    [t('Cold-start threshold'), draft.coldStartMinDays],
    [t('Classification window'), draft.fsnWindowDays],
    [t('Hysteresis band'), draft.fsnHysteresisPct],
    [t('Dwell cycles'), draft.fsnDwellCycles],
  ] as const) {
    if (Number(value) < 0 || Number.isNaN(Number(value))) {
      error.value = `${label} ${t('must be 0 or more')}`
      return
    }
  }

  if (Number(draft.lookbackDays) <= 0 || Number.isNaN(Number(draft.lookbackDays))) {
    error.value = t('The lookback window must be at least 1 day.')
    return
  }

  const next: ReplenishmentConfig = {
    ...draft,
    safetyDaysGlobal: Number(draft.safetyDaysGlobal),
    lookbackDays: Number(draft.lookbackDays),
    coverageDaysGlobal: Number(draft.coverageDaysGlobal),
    coldStartMinDays: Number(draft.coldStartMinDays),
    fsnWindowDays: Number(draft.fsnWindowDays),
    fsnFastPct: Number(draft.fsnFastPct),
    fsnSlowPct: Number(draft.fsnSlowPct),
    fsnHysteresisPct: Number(draft.fsnHysteresisPct),
    fsnDwellCycles: Number(draft.fsnDwellCycles),
    volatileCvThreshold: Number(draft.volatileCvThreshold),
    fallbackLeadTimeDays: Number(draft.fallbackLeadTimeDays),
    leadTimeSampleCount: Math.max(1, Number(draft.leadTimeSampleCount)),
    leadTimeMinSamples: Math.max(1, Number(draft.leadTimeMinSamples)),
    leadTimeOutlierCapDays: Number(draft.leadTimeOutlierCapDays),
    coverageDaysByCategory: Object.fromEntries(
      Object.entries(draft.coverageDaysByCategory)
        .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
        .map(([k, v]) => [k, Math.max(0, Number(v))]),
    ),
    leadTimeByCategory: Object.fromEntries(
      Object.entries(draft.leadTimeByCategory)
        .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
        .map(([k, v]) => [k, Number(v)]),
    ),
  }

  saveReplenishmentConfig(next)
  committed.value = next
  isEditing.value = false
  error.value = ''

  // Settings only bite on the next recalculation, so run one now rather than
  // leaving the worklist showing numbers from the old policy.
  invalidateReplenishmentCaches()
  recalculateReplenishment('all')
  toast.notify({
    variant: 'success',
    title: t('Replenishment settings saved.'),
    description: t('The worklist has been recalculated.'),
    maxWidth: 'max-content',
  })
}

function resetToDefaults() {
  Object.assign(draft, cloneConfig(REPL_DEFAULTS))
  error.value = ''
}

const BOUNDARY_OPTIONS = [
  { id: 'inclusive', name: 'Reorder at or below the reorder point' },
  { id: 'exclusive', name: 'Reorder only below the reorder point' },
]
</script>

<template>
  <div class="rs-page">
    <!-- ── Demand ── -->
    <section class="rs-section">
      <header class="rs-head">
        <div>
          <h2 class="rs-title">{{ t('Replenishment settings') }}</h2>
          <p class="rs-desc">
            {{ t('Set how demand, lead time and safety stock drive reorder points across every warehouse.') }}
          </p>
        </div>
        <div class="rs-head-actions">
          <template v-if="!canEdit">
            <span class="rs-viewonly">{{ t('View only') }}</span>
          </template>
          <button
            v-else-if="!isEditing"
            class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
            type="button"
            @click="startEdit"
          >
            <MpIcon name="edit" size="md" /> {{ t('Edit') }}
          </button>
        </div>
      </header>
      <p v-if="!canEdit" class="rs-hint">{{ t('Only an admin can change replenishment settings.') }}</p>

      <h3 class="rs-sub">{{ t('Demand') }}</h3>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Lookback window') }}</span>
          <span class="rs-label-desc">{{ t('How far back sales are averaged to get demand per day.') }}</span>
        </div>
        <div class="rs-control">
          <MpInputGroup v-if="isEditing" id="rs-lookback">
            <MpInput id="rs-lookback-input" v-model="draft.lookbackDays" type="number" :class="css({ width: '96px' })" />
            <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
          </MpInputGroup>
          <span v-else class="rs-value">{{ committed.lookbackDays }} {{ t('days') }}</span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Volatility threshold') }}</span>
          <span class="rs-label-desc">
            {{ t('When a product\'s day-to-day sales vary more than this (coefficient of variation), it is tagged "Volatile" in the worklist\'s Demand signal column and its spikes are damped in the average. Raise it to flag fewer products.') }}
          </span>
        </div>
        <div class="rs-control">
          <MpInput
            v-if="isEditing"
            id="rs-cv"
            v-model="draft.volatileCvThreshold"
            type="number"
            step="0.1"
            :class="css({ width: '96px' })"
          />
          <span v-else class="rs-value">{{ committed.volatileCvThreshold }}</span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Cold-start threshold') }}</span>
          <span class="rs-label-desc">
            {{ t('Days after a product\'s first sale during which it counts as a launch: it is tagged "Provisional" in the worklist and its order is held to the reorder point (no extra coverage). After this it graduates to the normal average automatically.') }}
          </span>
        </div>
        <div class="rs-control">
          <MpInputGroup v-if="isEditing" id="rs-coldstart">
            <MpInput id="rs-coldstart-input" v-model="draft.coldStartMinDays" type="number" :class="css({ width: '96px' })" />
            <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
          </MpInputGroup>
          <span v-else class="rs-value">{{ committed.coldStartMinDays }} {{ t('days') }}</span>
        </div>
      </div>

      <!-- ── Safety days ── -->
      <h3 class="rs-sub rs-sub--spaced">{{ t('Safety days') }}</h3>

      <!--
        One list per policy, with the company fallback as its LAST ROW.
        These were four fields: a company value and a by-category grid for each.
        Splitting them made the fallback a separate concept you had to hold in
        your head — and left an honest question unanswerable at a glance ("does
        the company figure ever actually apply?"). As the row after the named
        categories, it answers itself: it is what anything not listed above uses.
      -->
      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Safety days default') }}</span>
          <span class="rs-label-desc">{{ t('Extra days of cover on top of the vendor lead time. Leave a category blank and it uses Other categories.') }}</span>
          <span v-if="safetyOverrides > 0" class="rs-label-note">
            {{ safetyOverrides }} {{ t('warehouse/product overrides — those keep their own value when you change this') }}
          </span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-cat-grid">
            <div v-for="cat in categories" :key="cat" class="rs-cat-row">
              <span class="rs-cat-name">{{ cat }}</span>
              <MpInputGroup :id="`rs-cat-${cat}`">
                <MpInput
                  :id="`rs-cat-input-${cat}`"
                  v-model="draft.safetyDaysByCategory[cat]"
                  type="number"
                  :placeholder="String(draft.safetyDaysGlobal)"
                  :class="css({ width: '84px' })"
                />
                <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
            <div class="rs-cat-row rs-cat-row--fallback">
              <span class="rs-cat-name">{{ t('Other categories') }}</span>
              <MpInputGroup id="rs-safety">
                <MpInput id="rs-safety-input" v-model="draft.safetyDaysGlobal" type="number" :class="css({ width: '84px' })" />
                <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
          </div>
          <span v-else class="rs-value">
            {{ categories.map(c => `${c} ${committed.safetyDaysByCategory[c] ?? committed.safetyDaysGlobal}d`).join('   ') }}
            &nbsp;·&nbsp; {{ t('Other categories') }} {{ committed.safetyDaysGlobal }}d
          </span>
        </div>
      </div>

      <!--
        There is deliberately NO "min. stock default" field (D16/D17). Min stock
        is a DERIVED OUTPUT — demand × (lead + safety) — never a typed-in default.
        A default here would reintroduce manual reorder points and silently fight
        the engine. Cold-start SKUs are handled by the demand SEED below, not by a
        seeded min stock.
      -->

      <!-- ── Reorder point & coverage ──
        Order coverage sizes each order; the boundary decides whether a product
        exactly at its reorder point is due. Both belong to the reorder-point
        decision, separate from the safety-days buffer above. -->
      <h3 class="rs-sub rs-sub--spaced">{{ t('Reorder point & coverage') }}</h3>
      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Order coverage') }}</span>
          <span class="rs-label-desc">{{ t('How many days of demand each order should cover. Sizes the quantity — it never decides whether a product is due. Leave a category blank and it uses Other categories.') }}</span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-cat-grid">
            <div v-for="cat in categories" :key="cat" class="rs-cat-row">
              <span class="rs-cat-name">{{ cat }}</span>
              <MpInputGroup :id="`rs-coverage-cat-${cat}`">
                <MpInput
                  :id="`rs-coverage-cat-input-${cat}`"
                  v-model="draft.coverageDaysByCategory[cat]"
                  type="number"
                  :placeholder="String(draft.coverageDaysGlobal)"
                  :class="css({ width: '84px' })"
                />
                <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
            <div class="rs-cat-row rs-cat-row--fallback">
              <span class="rs-cat-name">{{ t('Other categories') }}</span>
              <MpInputGroup id="rs-coverage">
                <MpInput id="rs-coverage-input" v-model="draft.coverageDaysGlobal" type="number" :class="css({ width: '84px' })" />
                <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
          </div>
          <span v-else class="rs-value">
            {{ categories.map(c => `${c} ${committed.coverageDaysByCategory[c] ?? committed.coverageDaysGlobal}d`).join('   ') }}
            &nbsp;·&nbsp; {{ t('Other categories') }} {{ committed.coverageDaysGlobal }}d
          </span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Reorder-point boundary') }}</span>
          <span class="rs-label-desc">
            {{ t('Whether a product sitting exactly at its reorder point appears in the worklist.') }}
          </span>
        </div>
        <div class="rs-control">
          <MpSelect v-if="isEditing" id="rs-boundary" v-model="draft.reorderBoundary" :class="css({ width: '320px' })">
            <option v-for="o in BOUNDARY_OPTIONS" :key="o.id" :value="o.id">{{ t(o.name) }}</option>
          </MpSelect>
          <span v-else class="rs-value">
            {{ t(BOUNDARY_OPTIONS.find(o => o.id === committed.reorderBoundary)?.name ?? committed.reorderBoundary) }}
          </span>
        </div>
      </div>

      <!-- ── Lead time (US-001) ── -->
      <h3 id="lead-time" class="rs-sub rs-sub--spaced">{{ t('Lead time') }}</h3>
      <p class="rs-hint">
        {{ t('Lead time is measured from each vendor\'s delivered purchase orders. These settings only apply when there is not enough history to measure, in this order: the vendor\'s own average, then the default below.') }}
      </p>

      <!--
        Same merge as safety days and min. stock above: the company fallback is
        the LAST ROW of the category list, not a field of its own. With all six
        categories filled it can never fire, so as a separate field it read as a
        live setting that does nothing; as the row after the named categories it
        reads as what it is — what anything not listed above would use.
      -->
      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Default lead time') }}</span>
          <span class="rs-label-desc">{{ t('Used for a product whose vendor has no delivered orders yet, or which has no preferred vendor at all. Leave a category blank and it uses Other categories.') }}</span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-cat-grid">
            <div v-for="cat in categories" :key="cat" class="rs-cat-row">
              <span class="rs-cat-name">{{ cat }}</span>
              <MpInputGroup :id="`rs-lead-cat-${cat}`">
                <MpInput
                  :id="`rs-lead-cat-input-${cat}`"
                  v-model="draft.leadTimeByCategory[cat]"
                  type="number"
                  :placeholder="String(draft.fallbackLeadTimeDays)"
                  :class="css({ width: '84px' })"
                />
                <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
            <div class="rs-cat-row rs-cat-row--fallback">
              <span class="rs-cat-name">{{ t('Other categories') }}</span>
              <MpInputGroup id="rs-fallback-lead">
                <MpInput id="rs-fallback-lead-input" v-model="draft.fallbackLeadTimeDays" type="number" :class="css({ width: '84px' })" />
                <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
          </div>
          <span v-else class="rs-value">
            {{ categories.map(c => `${c} ${committed.leadTimeByCategory[c] ?? committed.fallbackLeadTimeDays}d`).join('   ') }}
            &nbsp;&middot;&nbsp; {{ t('Other categories') }} {{ committed.fallbackLeadTimeDays }}d
          </span>
        </div>
      </div>

      <!--
        The two numbers are one range: a measured lead time averages the most
        recent receipts, and needs a minimum before it's trusted. Kept as one
        field — as separate fields "average 5" and "minimum 2" read as a
        contradiction, when they are just the max and min of the same sample.
      -->
      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Receipts to average') }}</span>
          <span class="rs-label-desc">{{ t('A measured lead time averages a vendor product\'s most recent delivered orders — at most the maximum, and at least the minimum before it\'s trusted. Fewer than the minimum falls back to the default lead time above; extra orders beyond the maximum are ignored.') }}</span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-cat-grid">
            <div class="rs-cat-row">
              <span class="rs-cat-name">{{ t('At least (to trust)') }}</span>
              <MpInputGroup id="rs-lead-min">
                <MpInput id="rs-lead-min-input" v-model="draft.leadTimeMinSamples" type="number" :class="css({ width: '84px' })" />
                <MpInputRightAddon>{{ t('receipts') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
            <div class="rs-cat-row">
              <span class="rs-cat-name">{{ t('At most (recency cap)') }}</span>
              <MpInputGroup id="rs-lead-samples">
                <MpInput id="rs-lead-samples-input" v-model="draft.leadTimeSampleCount" type="number" :class="css({ width: '84px' })" />
                <MpInputRightAddon>{{ t('receipts') }}</MpInputRightAddon>
              </MpInputGroup>
            </div>
          </div>
          <span v-else class="rs-value">
            {{ t('The last') }} {{ committed.leadTimeMinSamples }}–{{ committed.leadTimeSampleCount }} {{ t('receipts') }}
            <span class="rs-value-sub">· {{ t('below') }} {{ committed.leadTimeMinSamples }} {{ t('uses the default lead time') }}</span>
          </span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Ignore gaps over') }}</span>
          <span class="rs-label-desc">{{ t('A gap between a purchase order and its receipt longer than this is dropped as an outlier, so one abnormal delivery cannot distort the average.') }}</span>
        </div>
        <div class="rs-control">
          <MpInputGroup v-if="isEditing" id="rs-lead-cap">
            <MpInput id="rs-lead-cap-input" v-model="draft.leadTimeOutlierCapDays" type="number" :class="css({ width: '96px' })" />
            <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
          </MpInputGroup>
          <span v-else class="rs-value">{{ committed.leadTimeOutlierCapDays }} {{ t('days') }}</span>
        </div>
      </div>

      <!-- ── FSN ── -->
      <h3 class="rs-sub rs-sub--spaced">{{ t('Movement classification (FSN)') }}</h3>
      <p class="rs-hint">
        {{ t('Hysteresis and dwell stop products flipping class from one recalculation to the next.') }}
      </p>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Classification window') }}</span>
          <span class="rs-label-desc">{{ t('How much history the classification looks at.') }}</span>
        </div>
        <div class="rs-control">
          <MpInputGroup v-if="isEditing" id="rs-fsn-window">
            <MpInput id="rs-fsn-window-input" v-model="draft.fsnWindowDays" type="number" :class="css({ width: '96px' })" />
            <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
          </MpInputGroup>
          <span v-else class="rs-value">{{ committed.fsnWindowDays }} {{ t('days') }}</span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Class thresholds') }}</span>
          <span class="rs-label-desc">
            {{ t('Share of days with movement. Fast at or above the first, Slow at or above the second, Non-moving below it.') }}
          </span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-window-row">
            <MpInputGroup id="rs-fast">
              <MpInput id="rs-fast-input" v-model="draft.fsnFastPct" type="number" :class="css({ width: '84px' })" />
              <MpInputRightAddon>% {{ t('Fast') }}</MpInputRightAddon>
            </MpInputGroup>
            <MpInputGroup id="rs-slow">
              <MpInput id="rs-slow-input" v-model="draft.fsnSlowPct" type="number" :class="css({ width: '84px' })" />
              <MpInputRightAddon>% {{ t('Slow') }}</MpInputRightAddon>
            </MpInputGroup>
            <span v-if="!fsnBandsOk" class="rs-total rs-total--bad">
              {{ t('Fast must be higher than Slow') }}
            </span>
          </div>
          <span v-else class="rs-value">
            {{ t('Fast') }} ≥ {{ committed.fsnFastPct }}% · {{ t('Slow') }} ≥ {{ committed.fsnSlowPct }}%
          </span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Hysteresis and dwell') }}</span>
          <span class="rs-label-desc">
            {{ t('A product must move past a threshold by the band, and hold for this many recalculations, before its class changes.') }}
          </span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-window-row">
            <MpInputGroup id="rs-band">
              <MpInput id="rs-band-input" v-model="draft.fsnHysteresisPct" type="number" :class="css({ width: '84px' })" />
              <MpInputRightAddon>% {{ t('band') }}</MpInputRightAddon>
            </MpInputGroup>
            <MpInputGroup id="rs-dwell">
              <MpInput id="rs-dwell-input" v-model="draft.fsnDwellCycles" type="number" :class="css({ width: '84px' })" />
              <MpInputRightAddon>{{ t('cycles') }}</MpInputRightAddon>
            </MpInputGroup>
          </div>
          <span v-else class="rs-value">
            ±{{ committed.fsnHysteresisPct }}% · {{ committed.fsnDwellCycles }} {{ t('cycles') }}
          </span>
        </div>
      </div>


      <!-- ── Automation ── -->
      <h3 class="rs-sub rs-sub--spaced">{{ t('Automation') }}</h3>
      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Recalculate on a schedule') }}</span>
          <span class="rs-label-desc">
            {{ t('Not available in this prototype — use Recalculate on the worklist.') }}
          </span>
        </div>
        <div class="rs-control">
          <MpToggle id="rs-schedule" :model-value="false" is-disabled />
        </div>
      </div>
    </section>

    <!-- ── Action bar — only while editing ── -->
    <div v-if="isEditing" class="rs-actions">
      <span v-if="error" class="rs-error">{{ error }}</span>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="resetToDefaults">
        {{ t('Reset to defaults') }}
      </button>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="cancel">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save changes') }}</button>
    </div>
  </div>
</template>

<style scoped>
/* This is a pageRegistry page, so the shared .stage wrapper already supplies the
   white surface and its 24px padding — the root must not re-pad (DESIGN.md). */
.rs-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); max-width: 900px; }

.rs-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.rs-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rs-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.rs-head-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.rs-viewonly {
  display: inline-flex; align-items: center;
  padding: 2px var(--mp-spacing-2);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

.rs-sub {
  margin-top: var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rs-sub--spaced {
  padding-top: var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.rs-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.rs-field {
  display: grid; grid-template-columns: 320px 1fr;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) 0;
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  align-items: start;
}
.rs-label { display: flex; flex-direction: column; }
.rs-label-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rs-label-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rs-label-note {
  display: block;
  margin-top: 2px;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-warning, #9a6700);
}
.rs-control { min-width: 0; }
.rs-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rs-value-sub { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }

.rs-windows { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rs-window-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.rs-window-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); width: 76px; }
.rs-total { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rs-total--bad { color: var(--mp-text-danger); }

.rs-cat-grid { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rs-cat-row--fallback {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--mp-border-subdued, #e5e7eb);
}
.rs-cat-row--fallback .rs-cat-name { font-style: normal; color: var(--mp-text-subdued, #6b7280); }

.rs-cat-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rs-cat-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); width: 160px; }

.rs-actions {
  position: sticky; bottom: 0;
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) 0;
  background: var(--mp-background-stage, #fff);
  border-top: 1px solid var(--mp-border-default);
}
.rs-error { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
