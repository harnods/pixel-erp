<!-- prod-parity-aligned: quickbook/app/views/data_migrations/index.html.haml -->
<script setup lang="ts">
/**
 * Settings → Data migration — the landing for bringing legacy data into the ledger.
 *
 * Replaces step 1 of the WMS→Jurnal cutover prototype ("Connect WMS to Jurnal").
 * This is a `pageRegistry` page: it renders INSIDE the shared `.stage`, which
 * already supplies the white surface + 24px padding — so the root adds none.
 * See DESIGN.md → Layout → Stage.
 */
import { computed, ref } from 'vue'
import { infoToast } from '~/utils/toasts'
import { useRouter } from 'vue-router'
import { MpProgress, MpIcon } from '@mekari/pixel3'
import { loadCreated, saveCreated } from '~/data/persist'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  CUTOVER_TOTAL_PRODUCTS,
  cutoverSetUpCount,
  cutoverState,
  furthestCutoverStep,
} from '~/data/wmsCutover'

const { t } = useLocale()
const router = useRouter()

// The WMS→ERP cutover is the "WMS upgrade to ERP" storyline (Scenario menu).
const { migrationScenario } = useMigrationScenario()
const isUpgradeScenario = computed(() => migrationScenario.value === 'WMS upgrade to ERP')

const setUpCount = computed(() => cutoverSetUpCount())
const percent = computed(() => Math.round((setUpCount.value / CUTOVER_TOTAL_PRODUCTS) * 100))

const isStarted = computed(() => setUpCount.value > 0)
const status = computed(() => (isStarted.value ? 'in progress' : 'not started'))

const conversionDate = computed(() =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(cutoverState.conversionDate)),
)

// ── Migration center (prod: quickbook data_migrations#index) ──
// Three numbered groups of steps + a summary card. A step's checkpoint turns
// green once the user has opened it; checkpoints survive a reload.
type MigrationStepId = 'company' | 'accounts' | 'products' | 'contacts' | 'sales' | 'purchases' | 'expenses'
interface MigrationStep { id: MigrationStepId; icon: string; label: string; to: string }
interface MigrationGroup { no: number; title: string; desc: string; steps: MigrationStep[] }

const CHECKPOINT_KEY = 'data-migration-checkpoints'
const checkpoints = ref<MigrationStepId[]>(loadCreated<MigrationStepId>(CHECKPOINT_KEY))

const groupsLeft: MigrationGroup[] = [
  {
    no: 1, title: t('Company setting'), desc: t('Start using Jurnal by filling the company data'),
    steps: [{ id: 'company', icon: 'company', label: t('Complete the company data'), to: '/company-profile' }],
  },
  {
    no: 2, title: t('Data master'), desc: t('Prepare your database for daily operations'),
    steps: [
      { id: 'accounts', icon: 'bank', label: t('Set up chart of account and conversion balance'), to: '/chart-of-accounts' },
      { id: 'products', icon: 'products', label: t('Import product'), to: '/export-and-import' },
      { id: 'contacts', icon: 'contact', label: t('Import contact'), to: '/export-and-import' },
    ],
  },
]
const groupsRight: MigrationGroup[] = [
  {
    no: 3, title: t('Transaction'), desc: t('Make sure all your transaction data is complete in Jurnal'),
    steps: [
      { id: 'sales', icon: 'sales', label: t('Import sales'), to: '/export-and-import' },
      { id: 'purchases', icon: 'wallet', label: t('Import purchases'), to: '/export-and-import' },
      { id: 'expenses', icon: 'expense', label: t('Import expenses'), to: '/export-and-import' },
    ],
  },
]
const allSteps = [...groupsLeft, ...groupsRight].flatMap(g => g.steps)
const allChecked = computed(() => allSteps.every(st => checkpoints.value.includes(st.id)))
const noneChecked = computed(() => checkpoints.value.length === 0)
const nextStep = computed(() => allSteps.find(st => !checkpoints.value.includes(st.id)))

function openStep(step: MigrationStep) {
  if (!checkpoints.value.includes(step.id)) {
    checkpoints.value = [...checkpoints.value, step.id]
    saveCreated(CHECKPOINT_KEY, checkpoints.value)
  }
  router.push(step.to)
}
function startOrContinue() { if (nextStep.value) openStep(nextStep.value) }
function seeSummary() { infoToast(t('Not in this prototype')) }

function openCutover() {
  // Resume at the earliest step still incomplete (Chart of accounts → Map
  // products → Opening balance).
  router.push(`/data-migration/wms-cutover/${furthestCutoverStep()}`)
}
</script>

<template>
  <div class="dm-root">
    <!-- ── Migration center (prod: data_migrations/_home) ── -->
    <section class="dm-home">
      <div class="dm-home-heading">
        <h2 class="dm-home-title">{{ t('Welcome to the Migration Center!') }}</h2>
        <p class="dm-home-note">{{ t('Get ease in transferring your data') }}</p>
      </div>
      <div class="dm-banner">
        <MpIcon name="upload" size="md" color="icon.default" aria-hidden="true" />
        <div class="dm-banner-text">
          <p class="dm-banner-title">{{ t('Why migrate your data to the Jurnal?') }}</p>
          <p class="dm-banner-desc">{{ t('To monitor your transactions statistic, compare reports with the previous period, and you can do bookkeeping easier in Jurnal.') }}</p>
        </div>
        <button v-if="allChecked" type="button" class="btn-enterprise btn-enterprise--primary" disabled>{{ t('Finish') }}</button>
        <button v-else type="button" class="btn-enterprise btn-enterprise--primary" @click="startOrContinue">
          {{ noneChecked ? t('Start now') : t('Continue') }}
        </button>
      </div>

      <div class="dm-columns">
        <div v-for="(col, ci) in [groupsLeft, groupsRight]" :key="ci" class="dm-column">
          <div v-for="group in col" :key="group.no" class="dm-group">
            <div class="dm-group-head">
              <span class="dm-group-no">{{ group.no }}</span>
              <div>
                <p class="dm-group-title">{{ group.title }}</p>
                <p class="dm-group-desc">{{ group.desc }}</p>
              </div>
            </div>
            <div class="dm-steps">
              <div
                v-for="step in group.steps" :key="step.id" class="dm-step" role="button" tabindex="0"
                @click="openStep(step)" @keydown.enter="openStep(step)"
              >
                <MpIcon :name="step.icon" size="md" color="icon.default" aria-hidden="true" />
                <span class="dm-step-label">{{ step.label }}</span>
                <MpIcon
                  name="done"
                  size="md"
                  :class="checkpoints.includes(step.id) ? 'dm-check dm-check--done' : 'dm-check'"
                  :aria-label="checkpoints.includes(step.id) ? t('Done') : t('Not done')"
                />
              </div>
            </div>
          </div>
          <div v-if="ci === 1" class="dm-summary">
            <MpIcon name="doc" size="md" color="icon.default" aria-hidden="true" />
            <div class="dm-banner-text">
              <p class="dm-group-title">{{ t('Summary of your migration data!') }}</p>
              <p class="dm-group-desc">{{ t('Summary of data that you have entered') }}</p>
            </div>
            <button type="button" class="btn-enterprise btn-enterprise--secondary" :disabled="noneChecked" @click="seeSummary">{{ t('See summary') }}</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Local-only: connected-system migration sources (WMS upgrade storyline). -->
    <p v-if="isUpgradeScenario" class="dm-intro">
      {{ t('Import opening balances and master data from your connected systems. Set up each source below — nothing is posted to your ledger until you publish its opening balance.') }}
    </p>

    <!-- ── Source: WMS → ERP (upgrade storyline only) ── -->
    <section v-if="isUpgradeScenario" class="dm-card">
      <div class="dm-card-head">
        <div class="dm-card-icon" aria-hidden="true">
          <MpIcon name="warehouse" size="md" color="icon.default" />
        </div>
        <div class="dm-card-heading">
          <div class="dm-card-title-row">
            <h2 class="dm-card-title">{{ t('WMS inventory and costing') }}</h2>
            <ErpStatusBadge :status="status" badge-for="additionalInformation" size="md" />
          </div>
          <p class="dm-card-desc">
            {{ t('Map each WMS product to an account in your chart of accounts, then import one opening inventory value per account.') }}
          </p>
        </div>
      </div>

      <dl class="dm-meta">
        <div class="dm-meta-item">
          <dt class="dm-meta-label">{{ t('Products in WMS') }}</dt>
          <dd class="dm-meta-value">{{ CUTOVER_TOTAL_PRODUCTS }}</dd>
        </div>
        <div class="dm-meta-item">
          <dt class="dm-meta-label">{{ t('Conversion date') }}</dt>
          <dd class="dm-meta-value">{{ conversionDate }}</dd>
        </div>
      </dl>

      <div class="dm-progress">
        <div class="dm-progress-row">
          <span class="dm-progress-text">
            {{ setUpCount }} {{ t('of') }} {{ CUTOVER_TOTAL_PRODUCTS }} {{ t('products mapped') }}
          </span>
          <span class="dm-progress-pct">{{ percent }}%</span>
        </div>
        <MpProgress :value="String(percent)" size="sm" color="positive" />
      </div>

      <div class="dm-card-actions">
        <button type="button" class="btn-enterprise btn-enterprise--primary" @click="openCutover">
          {{ isStarted ? t('Continue setup') : t('Start setup') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dm-root {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}

.dm-intro {
  margin: 0;
  max-width: 720px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}


/* Card = 1px border, never a drop-shadow (DESIGN.md → Surfaces & cards). */
.dm-card {
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-5);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
}

.dm-card-head {
  display: flex;
  gap: var(--mp-spacing-4);
  align-items: flex-start;
}

.dm-card-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-10, 40px);
  height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
}

.dm-card-heading {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  min-width: 0;
}

.dm-card-title-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  flex-wrap: wrap;
}

.dm-card-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg);
  color: var(--mp-text-default);
}

.dm-card-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

.dm-meta {
  display: flex;
  gap: var(--mp-spacing-8);
  margin: 0;
}

.dm-meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.dm-meta-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.dm-meta-value {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  font-variant-numeric: tabular-nums;
}

.dm-progress {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}

.dm-progress-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
}

.dm-progress-text,
.dm-progress-pct {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
}

.dm-card-actions {
  display: flex;
  justify-content: flex-end;
}

/* ── Migration center ── */
.dm-home { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.dm-home-heading { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dm-home-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg); color: var(--mp-text-default); }
.dm-home-note { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.dm-banner, .dm-summary {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg);
}
.dm-banner-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dm-banner-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dm-banner-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.dm-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--mp-spacing-6); }
.dm-column { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.dm-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.dm-group-head { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.dm-group-no {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.dm-group-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dm-group-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.dm-steps { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg); overflow: hidden; }
.dm-step {
  display: flex; align-items: center; gap: var(--mp-spacing-3); width: 100%;
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: none; border: 0; text-align: left; cursor: pointer;
  font: inherit; color: var(--mp-text-default);
}
.dm-step + .dm-step { border-top: 1px solid var(--mp-border-default); }
.dm-step:hover { background: var(--mp-background-neutral-subtle); }
.dm-step-label { flex: 1; font-size: var(--mp-font-sizes-md); }
.dm-check { color: var(--mp-colors-icon-default); opacity: 0.35; }
.dm-check--done { color: var(--mp-colors-text-success); opacity: 1; }
</style>
