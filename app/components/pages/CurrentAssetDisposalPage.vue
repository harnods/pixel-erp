<!-- prod-parity: jurnal-accounting-frontend/src/modules/assets/views/AssetDisposalDetailView.vue + components/TransactionHistoryTable.vue -->
<script setup lang="ts">
import { MpBadge, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { successToast } from '~/utils/toasts'
import {
  getCurrentAsset, currentAssets, currentAccountLabel, caAccumulatedOf, caGainLossOf, caGainLossType,
  caDisposalEntryOf, revertCurrentDisposal,
} from '~/data/currentAssets'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const asset = computed(() => { void currentAssets.value; return getCurrentAsset(props.orderId) ?? null })
const disposal = computed(() => asset.value?.disposal ?? null)
const gainLoss = computed(() => (asset.value ? caGainLossOf(asset.value) : 0))
const entries = computed(() => (asset.value ? caDisposalEntryOf(asset.value) : []))

const revertOpen = ref(false)
function revert() {
  if (!asset.value) return
  revertCurrentDisposal(asset.value.id)
  successToast(t('Disposal reverted'))
  router.push(`/current-assets/${asset.value.id}`)
}
function goIndex() { router.push({ path: '/current-assets', query: { tab: 'Disposed assets' } }) }
function goAsset() { if (asset.value) router.push(`/current-assets/${asset.value.id}`) }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goIndex">{{ t('Fixed assets (current)') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ asset?.name ?? t('Asset not found') }}</h1>
          <MpBadge v-if="disposal" for="additionalInformation" type="announcement" size="md">{{ t('Disposed') }}</MpBadge>
        </div>
      </div>
      <div v-if="asset && disposal" class="detail-bar-right">
        <MpPopover id="ca-disposal-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-after">
              {{ t('Actions') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="goAsset">{{ t('View asset') }}</MpPopoverListItem>
              <MpPopoverListItem @click="revertOpen = true">{{ t('Revert') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="detail-stage">
      <div v-if="!asset || !disposal" class="cadd-not-found">
        <img src="/illustrations/empty-folder.png" alt="" width="288" height="240" />
        <p class="cadd-not-found-title">{{ t('Disposal not found') }}</p>
        <p class="cadd-not-found-desc">{{ t('This asset has not been disposed, or the link is incorrect.') }}</p>
      </div>
      <template v-else>
        <section class="cadd-section">
          <h2 class="cadd-section-title">{{ t('Asset information') }}</h2>
          <div class="cadd-info">
            <ContentList horizontal :label="t('Asset no.')" :value="`${t('Fixed Assets')} #${asset.number}`" />
            <ContentList horizontal :label="t('Disposal date')" :value="formatDate(disposal.date)" />
            <ContentList horizontal :label="t('Acquisition date')" :value="formatDate(asset.acquisitionDate)" />
            <ContentList horizontal :label="t('Acquisition cost')" :value="formatIDR(asset.acquisitionCost)" />
            <ContentList horizontal :label="t('Accumulated depreciation')" :value="formatIDR(caAccumulatedOf(asset))" />
            <ContentList horizontal :label="t('Sale price')" :value="formatIDR(disposal.salePrice)" />
            <ContentList horizontal :label="`${t('Gain / Loss')} (${t(caGainLossType(gainLoss))})`">
              <span :class="{ 'cadd-gain': gainLoss > 0, 'cadd-loss': gainLoss < 0 }">{{ formatIDR(Math.abs(gainLoss)) }}</span>
            </ContentList>
            <ContentList v-if="disposal.depositAccount" horizontal :label="t('Deposit to account')" :value="currentAccountLabel(disposal.depositAccount)" />
            <ContentList horizontal :label="t('Gain / Loss account')" :value="currentAccountLabel(disposal.gainLossAccount)" />
            <ContentList v-if="disposal.memo" horizontal :label="t('Disposal memo')" :value="disposal.memo" />
          </div>
        </section>

        <section class="cadd-section">
          <h2 class="cadd-section-title">{{ t('Entry history') }}</h2>
          <table class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">{{ t('Date') }}</th>
                <th class="detail-th">{{ t('Action') }}</th>
                <th class="detail-th">{{ t('Entry no.') }}</th>
                <th class="detail-th">{{ t('Account') }}</th>
                <th class="detail-th detail-th--num">{{ t('Debit') }}</th>
                <th class="detail-th detail-th--num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in entries" :key="e.id">
                <td class="detail-td">{{ formatDate(e.date) }}</td>
                <td class="detail-td">{{ e.action }}</td>
                <td class="detail-td">{{ e.entryNo }}</td>
                <td class="detail-td">{{ e.account }}</td>
                <td class="detail-td detail-td--num">{{ e.debit == null ? '—' : formatIDR(e.debit) }}</td>
                <td class="detail-td detail-td--num">{{ e.credit == null ? '—' : formatIDR(e.credit) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </div>

    <ConfirmModal
      v-model:is-open="revertOpen"
      :title="t('Revert disposal?')"
      :description="t('This reverses the disposal entry and returns the asset to active. This can\'t be undone.')"
      :confirm-label="t('Revert')"
      @confirm="revert"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: none; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
.cadd-section { display: flex; flex-direction: column; }
.cadd-section-title {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 24px); color: var(--mp-text-default);
}
.cadd-info { display: flex; flex-direction: column; }
.cadd-gain { color: var(--mp-colors-text-success); }
.cadd-loss { color: var(--mp-text-danger); }
.detail-items { width: 100%; border-collapse: collapse; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.cadd-not-found { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.cadd-not-found-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cadd-not-found-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
