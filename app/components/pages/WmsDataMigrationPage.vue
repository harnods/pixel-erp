<!-- prod-parity: jurnal-accounting-frontend/src/modules/wms-data-migration/views/WmsDataMigrationSourcesView.vue (+ components/CoverageMeter.vue) -->
<script setup lang="ts">
/**
 * Settings → WMS data migration — the WMS → ERP conversion-balance source card:
 * status badge, Products in WMS (+ archived note), Conversion date, mapped
 * coverage bar, Sync products and Start / Continue setup / Show opening balance.
 * Seeded from the prod fixture (30 products, 01/01/2026, not started).
 */
import { MpBadge, MpButton, MpIcon, MpProgress } from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'
import { wmsMigrationSource, resyncWmsMigrationSource, type WmsMigrationStatus } from '~/data/wmsDataMigration'

const { t } = useLocale()
const router = useRouter()

const STATUS_LABEL: Record<WmsMigrationStatus, string> = {
  not_started: 'Not started', in_progress: 'In progress', draft: 'Draft', published: 'Published',
}
const STATUS_BADGE: Record<WmsMigrationStatus, 'announcement' | 'information' | 'completed'> = {
  not_started: 'announcement', in_progress: 'information', draft: 'announcement', published: 'completed',
}

const src = wmsMigrationSource
const isPublished = computed(() => src.status === 'published')
const outOfScope = computed(() => Math.max(src.productTotal - src.productCount, 0))
const percent = computed(() => src.productCount ? Math.round((src.setUp / src.productCount) * 100) : 0)
const conversionDate = computed(() => src.conversionDate
  ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(src.conversionDate))
  : '—')
const primaryLabel = computed(() => {
  if (isPublished.value) return t('Show opening balance')
  return src.setUp > 0 ? t('Continue setup') : t('Start setup')
})

const isSyncing = ref(false)
function resync() {
  isSyncing.value = true
  setTimeout(() => {
    resyncWmsMigrationSource()
    isSyncing.value = false
    successToast(t('Products synced'))
  }, 600)
}
function openSetup() {
  // The wizard always opens at step 1, the chart of accounts.
  if (src.status === 'not_started') src.status = 'in_progress'
  router.push(isPublished.value ? '/data-migration/wms-cutover/opening-balance' : '/data-migration/wms-cutover/chart-of-accounts')
}
</script>

<template>
  <div class="wdm-root">
    <p class="wdm-subtitle">
      {{ t('Import opening balances and master data from your connected systems. Set up each source below — nothing is posted to your ledger until you publish its opening balance.') }}
    </p>

    <article class="wdm-card">
      <div class="wdm-card-head">
        <div class="wdm-card-icon" aria-hidden="true">
          <MpIcon name="warehouse" size="md" color="icon.default" />
        </div>
        <div class="wdm-card-heading">
          <div class="wdm-card-title-row">
            <h2 class="wdm-card-title">{{ t(src.name) }}</h2>
            <MpBadge class="wdm-card-status" for="additionalInformation" size="md" :type="STATUS_BADGE[src.status]">
              {{ t(STATUS_LABEL[src.status]) }}
            </MpBadge>
          </div>
          <p class="wdm-card-body">{{ t('Map each WMS product to an account in your chart of accounts, then import one opening inventory value per account.') }}</p>
        </div>
      </div>

      <dl class="wdm-stats">
        <div class="wdm-stats-item">
          <dt>{{ t('Products in WMS') }}</dt>
          <dd>{{ src.productCount }}</dd>
          <dd v-if="outOfScope > 0" class="wdm-stats-note">{{ outOfScope }} {{ t('more held but not set up here (archived in WMS)') }}</dd>
        </div>
        <div class="wdm-stats-item">
          <dt>{{ t('Conversion date') }}</dt>
          <dd>{{ conversionDate }}</dd>
        </div>
      </dl>

      <div class="wdm-coverage">
        <div class="wdm-coverage-headline">
          <span>{{ src.setUp }} {{ t('of') }} {{ src.productCount }} {{ t('products mapped') }}</span>
          <span>{{ percent }}%</span>
        </div>
        <MpProgress :value="String(percent)" size="sm" color="positive" />
      </div>

      <div class="wdm-card-actions">
        <MpButton v-if="!isPublished" variant="secondary" is-rounded :is-loading="isSyncing" @click="resync">{{ t('Sync products') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="openSetup">{{ primaryLabel }}</MpButton>
      </div>
    </article>
  </div>
</template>

<style scoped>
.wdm-root { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.wdm-subtitle { margin: 0; max-width: 720px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); }
/* 720px, the source card width in prod. Surface = 1px border, never a drop-shadow. */
.wdm-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-5); max-width: 720px;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg);
  background: var(--mp-background-neutral);
}
.wdm-card-head { display: flex; align-items: flex-start; gap: var(--mp-spacing-4); }
.wdm-card-icon {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-10); height: var(--mp-sizes-10); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
}
.wdm-card-heading { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.wdm-card-title-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.wdm-card-status { flex-shrink: 0; white-space: nowrap; }
.wdm-card-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg); color: var(--mp-text-default); }
.wdm-card-body { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); }
.wdm-stats { display: flex; gap: var(--mp-spacing-8); margin: 0; }
.wdm-stats-item { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.wdm-stats-item dt { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-secondary); }
.wdm-stats-item dd { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.wdm-stats-item dd.wdm-stats-note { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); line-height: var(--mp-line-heights-sm); color: var(--mp-text-secondary); }
.wdm-coverage { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wdm-coverage-headline { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.wdm-card-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }
</style>
