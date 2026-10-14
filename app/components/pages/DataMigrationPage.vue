<script setup lang="ts">
/**
 * Settings → Data migration — the landing for bringing legacy data into the ledger.
 *
 * Replaces step 1 of the WMS→Jurnal cutover prototype ("Connect WMS to Jurnal").
 * This is a `pageRegistry` page: it renders INSIDE the shared `.stage`, which
 * already supplies the white surface + 24px padding — so the root adds none.
 * See DESIGN.md → Layout → Stage.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { MpProgress, MpIcon, MpButton } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  CUTOVER_TOTAL_PRODUCTS,
  cutoverSetUpCount,
  cutoverState,
  furthestCutoverStep,
  pendingMovementCount,
  pendingProductCount,
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

// Story 9 / FR12 — new WMS products discovered after go-live queue their
// journal entries until routed. Surfaced here so it is not a hidden backlog.
const pendingProducts = computed(() => pendingProductCount())
const heldEntries = computed(() => pendingMovementCount())

function openCutover() {
  // Resume at the earliest step still incomplete (Chart of accounts → Map
  // products → Opening balance).
  router.push(`/data-migration/wms-cutover/${furthestCutoverStep()}`)
}
function openPending() {
  router.push('/data-migration/wms-cutover/pending')
}
</script>

<template>
  <div class="dm-root">
    <p class="dm-intro">
      {{ t('Import opening balances and master data from your connected systems. Set up each source below — nothing is posted to your ledger until you publish its opening balance.') }}
    </p>

    <!-- No migration source outside the upgrade storyline. -->
    <p v-if="!isUpgradeScenario" class="dm-empty">
      {{ t('No data migration in progress. Connected systems that need setup will appear here.') }}
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
        <MpButton type="button" class="btn-enterprise btn-enterprise--primary" @click="openCutover">
          {{ isStarted ? t('Continue setup') : t('Start setup') }}
        </MpButton>
      </div>
    </section>

    <!-- Post-go-live backlog — only when there is one -->
    <section v-if="isUpgradeScenario && pendingProducts" class="dm-card dm-card--pending">
      <div class="dm-card-head">
        <div class="dm-card-icon" aria-hidden="true">
          <MpIcon name="warning-triangle" size="md" color="icon.warning" />
        </div>
        <div class="dm-card-heading">
          <h2 class="dm-card-title">{{ t('Products pending setup') }}</h2>
          <p class="dm-pending-count">{{ pendingProducts }} {{ t('products need an account') }}</p>
          <p class="dm-card-desc">
            {{ pendingProducts }} {{ t("new WMS products aren't mapped to an inventory account yet, so") }}
            {{ heldEntries }} {{ t("journal entries can't be posted. Warehouse operations aren't affected.") }}
          </p>
        </div>
      </div>
      <div class="dm-card-actions">
        <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" @click="openPending">
          {{ t('Review products') }}
        </MpButton>
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

.dm-empty {
  margin: 0;
  max-width: 720px;
  padding: var(--mp-spacing-6);
  border: 1px dashed var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  text-align: center;
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

/* Pending-count summary line — semibold, default text, above the explanatory desc. */
.dm-pending-count {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
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
</style>
