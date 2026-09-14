<script setup lang="ts">
/**
 * Settings › Replenishment — the company-wide policy behind every recommendation
 * (PRD US-004, US-011, US-010, US-012, US-015).
 *
 * Follows SettingsWarehousePage.vue's shape: a committed value plus an editable
 * draft, an explicit Edit mode, and Cancel/Save changes shown only while editing.
 *
 * Validation follows DESIGN.md: Save changes is NEVER disabled — clicking it with
 * bad input shows an inline error instead. The velocity weights carry a live total
 * so the user sees the problem before they click.
 */
import { ref, reactive, computed } from 'vue'
import { toast, css, MpIcon, MpInput, MpInputGroup, MpInputRightAddon, MpSelect, MpToggle } from '@mekari/pixel3'
import {
  getReplenishmentConfig, saveReplenishmentConfig, windowWeightsValid,
  REPL_DEFAULTS, type ReplenishmentConfig,
} from '~/data/replenishmentConfig'
import { recalculateReplenishment, invalidateReplenishmentCaches } from '~/data/replenishment'
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

const weightTotal = computed(() => draft.windows.reduce((s, w) => s + Number(w.weightPct || 0), 0))
const weightsOk = computed(() => weightTotal.value === 100)
const fsnBandsOk = computed(() => Number(draft.fsnFastPct) > Number(draft.fsnSlowPct))

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
  if (!windowWeightsValid(draft.windows.map((w) => ({ days: Number(w.days), weightPct: Number(w.weightPct) })))) {
    error.value = t('Velocity weights must total 100%, and each window must be a positive number of days.')
    return
  }
  if (!fsnBandsOk.value) {
    error.value = t('The Fast threshold must be higher than the Slow threshold.')
    return
  }
  for (const [label, value] of [
    [t('Safety days'), draft.safetyDaysGlobal],
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

  const next: ReplenishmentConfig = {
    ...draft,
    windows: draft.windows.map((w) => ({ days: Number(w.days), weightPct: Number(w.weightPct) })),
    safetyDaysGlobal: Number(draft.safetyDaysGlobal),
    coldStartMinDays: Number(draft.coldStartMinDays),
    fsnWindowDays: Number(draft.fsnWindowDays),
    fsnFastPct: Number(draft.fsnFastPct),
    fsnSlowPct: Number(draft.fsnSlowPct),
    fsnHysteresisPct: Number(draft.fsnHysteresisPct),
    fsnDwellCycles: Number(draft.fsnDwellCycles),
    volatileCvThreshold: Number(draft.volatileCvThreshold),
    fallbackLeadTimeDays: Number(draft.fallbackLeadTimeDays),
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

const BASIS_OPTIONS = [
  { id: 'shipped-outbound', name: 'Shipped outbound orders' },
  { id: 'shipped-plus-open', name: 'Shipped and open orders' },
  { id: 'manual-only', name: 'Manual demand only' },
]
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
          <span class="rs-label-text">{{ t('Demand basis') }}</span>
          <span class="rs-label-desc">{{ t('Which documents count as demand when velocity is calculated.') }}</span>
        </div>
        <div class="rs-control">
          <MpSelect
            v-if="isEditing"
            id="rs-basis"
            v-model="draft.demandBasis"
            :class="css({ width: '280px' })"
          >
            <option v-for="o in BASIS_OPTIONS" :key="o.id" :value="o.id">{{ t(o.name) }}</option>
          </MpSelect>
          <span v-else class="rs-value">
            {{ t(BASIS_OPTIONS.find(o => o.id === committed.demandBasis)?.name ?? committed.demandBasis) }}
          </span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Velocity windows') }}</span>
          <span class="rs-label-desc">{{ t('Recent demand is weighted more heavily than older demand.') }}</span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-windows">
            <div v-for="(w, i) in draft.windows" :key="i" class="rs-window-row">
              <span class="rs-window-label">{{ t('Window') }} {{ i + 1 }}</span>
              <MpInputGroup :id="`rs-window-days-${i}`">
                <MpInput :id="`rs-window-days-input-${i}`" v-model="w.days" type="number" :class="css({ width: '84px' })" />
                <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
              <MpInputGroup :id="`rs-window-weight-${i}`">
                <MpInput :id="`rs-window-weight-input-${i}`" v-model="w.weightPct" type="number" :class="css({ width: '76px' })" />
                <MpInputRightAddon>%</MpInputRightAddon>
              </MpInputGroup>
            </div>
            <p class="rs-total" :class="{ 'rs-total--bad': !weightsOk }">
              {{ t('Total') }} {{ weightTotal }}%
              <span v-if="!weightsOk"> — {{ t('weights must total 100%') }}</span>
            </p>
          </div>
          <span v-else class="rs-value">
            {{ committed.windows.map(w => `${w.days}d · ${w.weightPct}%`).join('   ') }}
          </span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Cold-start threshold') }}</span>
          <span class="rs-label-desc">
            {{ t('A product with less sales history than this cannot be given a calculated quantity.') }}
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

      <!-- ── Safety and reorder point ── -->
      <h3 class="rs-sub rs-sub--spaced">{{ t('Safety and reorder point') }}</h3>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Safety days') }}</span>
          <span class="rs-label-desc">{{ t('Extra days of cover added on top of lead time.') }}</span>
        </div>
        <div class="rs-control">
          <MpInputGroup v-if="isEditing" id="rs-safety">
            <MpInput id="rs-safety-input" v-model="draft.safetyDaysGlobal" type="number" :class="css({ width: '96px' })" />
            <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
          </MpInputGroup>
          <span v-else class="rs-value">{{ committed.safetyDaysGlobal }} {{ t('days') }}</span>
        </div>
      </div>

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Safety days by category') }}</span>
          <span class="rs-label-desc">{{ t('Overrides the company value for a whole category.') }}</span>
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
          </div>
          <span v-else class="rs-value">
            {{ categories.map(c => `${c} ${committed.safetyDaysByCategory[c] ?? committed.safetyDaysGlobal}d`).join('   ') }}
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

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Fallback lead time') }}</span>
          <span class="rs-label-desc">{{ t('Used when a product has no vendor lead time recorded.') }}</span>
        </div>
        <div class="rs-control">
          <MpInputGroup v-if="isEditing" id="rs-fallback-lead">
            <MpInput id="rs-fallback-lead-input" v-model="draft.fallbackLeadTimeDays" type="number" :class="css({ width: '96px' })" />
            <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
          </MpInputGroup>
          <span v-else class="rs-value">{{ committed.fallbackLeadTimeDays }} {{ t('days') }}</span>
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

      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Volatility threshold') }}</span>
          <span class="rs-label-desc">
            {{ t('Coefficient of variation above which demand is flagged volatile and spikes are damped.') }}
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

      <!-- ── Cold-start category demand ── -->
      <h3 class="rs-sub rs-sub--spaced">{{ t('Cold-start demand by category') }}</h3>
      <p class="rs-hint">
        {{ t('New products with too little history inherit these figures. Leave a category empty and its new products go to Needs setup instead of receiving an estimate.') }}
      </p>
      <div class="rs-field">
        <div class="rs-label">
          <span class="rs-label-text">{{ t('Expected daily demand') }}</span>
        </div>
        <div class="rs-control">
          <div v-if="isEditing" class="rs-cat-grid">
            <div v-for="cat in categories" :key="`cs-${cat}`" class="rs-cat-row">
              <span class="rs-cat-name">{{ cat }}</span>
              <MpInput
                :id="`rs-cs-input-${cat}`"
                v-model="draft.coldStartCategoryDemand[cat]"
                type="number"
                step="0.1"
                :placeholder="t('None')"
                :class="css({ width: '96px' })"
              />
            </div>
          </div>
          <span v-else class="rs-value">
            {{ categories.filter(c => committed.coldStartCategoryDemand[c] !== undefined).length
              ? categories.filter(c => committed.coldStartCategoryDemand[c] !== undefined)
                  .map(c => `${c} ${committed.coldStartCategoryDemand[c]}/day`).join('   ')
              : t('Not set — new products go to Needs setup') }}
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
.rs-control { min-width: 0; }
.rs-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.rs-windows { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rs-window-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.rs-window-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); width: 76px; }
.rs-total { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rs-total--bad { color: var(--mp-text-danger); }

.rs-cat-grid { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
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
