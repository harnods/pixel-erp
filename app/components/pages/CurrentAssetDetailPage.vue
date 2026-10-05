<!-- prod-parity: jurnal-accounting-frontend/src/modules/assets/views/AssetShowView.vue + components/DepreciationHistoryTable.vue -->
<script setup lang="ts">
import {
  MpBadge, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CurrentAssetDisposeModal from '~/components/currentAssets/CurrentAssetDisposeModal.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  getCurrentAsset, currentAccountLabel, caAccumulatedOf, caBookValueOf, caRemainingLifeOf, caHistoryOf,
  caMethodLabel, caCanRevertDepreciation, deleteCurrentAssets, revertCurrentDepreciation,
  revertCurrentDisposal, disposeCurrentAsset, currentAssets,
} from '~/data/currentAssets'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// Read through the reactive list so apply/revert/dispose re-render the page.
const asset = computed(() => { void currentAssets.value; return getCurrentAsset(props.orderId) ?? null })
const accumulated = computed(() => (asset.value ? caAccumulatedOf(asset.value) : 0))
const bookValue = computed(() => (asset.value ? caBookValueOf(asset.value) : 0))
const remainingLife = computed(() => (asset.value ? caRemainingLifeOf(asset.value) : null))
const history = computed(() => (asset.value ? [...caHistoryOf(asset.value)].reverse() : []))
const lastApplied = computed(() => history.value.find((h) => h.kind !== 'acquisition')?.date ?? null)
const statusLabel = computed(() => asset.value?.status === 'pending' ? t('Draft') : asset.value?.status === 'disposed' ? t('Disposed') : null)

const showDispose = ref(route.query.dispose === '1')
const confirmKind = ref<'delete' | 'revert' | 'revertDepreciation' | null>(null)
const confirmOpen = computed({ get: () => !!confirmKind.value, set: (v: boolean) => { if (!v) confirmKind.value = null } })
const confirmCopy = computed(() => {
  if (confirmKind.value === 'revert') return { title: t('Revert disposal?'), description: t("This reverses the disposal entry and returns the asset to active. This can't be undone."), label: t('Revert'), danger: true }
  if (confirmKind.value === 'revertDepreciation') return { title: t('Revert depreciation?'), description: t("This reverses the applied depreciation entries for this asset. This can't be undone."), label: t('Revert'), danger: true }
  return { title: t('Delete asset?'), description: t("Are you sure you want to delete {count} asset(s)? This action can't be undone.").replace('{count}', '1'), label: t('Delete'), danger: true }
})

const actions = computed(() => {
  const a = asset.value
  if (!a) return []
  const list: { key: 'dispose' | 'revert' | 'revertDepreciation' | 'delete'; label: string }[] = []
  if (a.status === 'active') list.push({ key: 'dispose', label: t('Sell / Dispose') })
  if (a.status === 'disposed') list.push({ key: 'revert', label: t('Revert') })
  if (caCanRevertDepreciation(a)) list.push({ key: 'revertDepreciation', label: t('Revert depreciation') })
  list.push({ key: 'delete', label: t('Delete') })
  return list
})
function onAction(key: 'dispose' | 'revert' | 'revertDepreciation' | 'delete') {
  if (key === 'dispose') showDispose.value = true
  else confirmKind.value = key
}
function runConfirm() {
  const a = asset.value
  if (!a) return
  if (confirmKind.value === 'delete') {
    deleteCurrentAssets([a.id]); successToast(t('Asset deleted')); router.push('/current-assets')
  } else if (confirmKind.value === 'revert') {
    revertCurrentDisposal(a.id); successToast(t('Disposal reverted'))
  } else if (confirmKind.value === 'revertDepreciation') {
    revertCurrentDepreciation([a.id]); successToast(t('Depreciation reverted'))
  }
  confirmKind.value = null
}
function onDispose(d: Parameters<typeof disposeCurrentAsset>[1]) {
  if (!asset.value) return
  disposeCurrentAsset(asset.value.id, d)
  showDispose.value = false
  successToast(t('Asset disposed'))
  router.push({ path: '/current-assets', query: { tab: 'Disposed assets' } })
}

function goIndex() { router.push('/current-assets') }
function goEdit() { if (asset.value) router.push(`/current-assets/${asset.value.id}/edit`) }
function goDisposal() { if (asset.value) router.push(`/current-assets/${asset.value.id}/disposal`) }
function openJournal() { infoToast(t('Not in this prototype')) }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goIndex">{{ t('Fixed assets (current)') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ asset?.name ?? t('Asset not found') }}</h1>
          <MpBadge v-if="statusLabel" for="additionalInformation" :type="asset?.status === 'pending' ? 'warning' : 'announcement'" size="md">{{ statusLabel }}</MpBadge>
        </div>
      </div>
      <div v-if="asset" class="detail-bar-right">
        <button class="btn-enterprise btn-enterprise--secondary" @click="goEdit">{{ asset.status === 'pending' ? t('Record') : t('Edit') }}</button>
        <MpPopover id="ca-detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
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
              <MpPopoverListItem v-if="asset.status === 'disposed'" @click="goDisposal">{{ t('View disposal') }}</MpPopoverListItem>
              <MpPopoverListItem v-for="a in actions" :key="a.key" :class="{ 'cad-danger': a.key === 'delete' }" @click="onAction(a.key)">{{ a.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="detail-stage">
      <div v-if="!asset" class="cad-not-found">
        <img src="/illustrations/empty-folder.png" alt="" width="288" height="240" />
        <p class="cad-not-found-title">{{ t('Asset not found') }}</p>
        <p class="cad-not-found-desc">{{ t('This asset may have been deleted, or the link is incorrect.') }}</p>
      </div>

      <template v-else>
        <!-- Book value, prominent and right-aligned -->
        <section class="cad-primary">
          <ContentList :label="t('Asset no.')" :value="`${t('Fixed Assets')} #${asset.number}`" />
          <span class="detail-total-amount"><span class="detail-total-label">{{ t('Book value') }}</span> {{ formatIDR(bookValue) }}</span>
        </section>

        <!-- Asset details -->
        <section class="cad-section">
          <h2 class="cad-section-title">{{ t('Asset details') }}</h2>
          <div class="content-list-grid">
            <div class="content-list-col">
              <ContentList :label="t('Asset name')" :value="asset.name" />
              <ContentList :label="t('Asset no.')" :value="asset.number" />
              <ContentList :label="t('Assets account')">
                {{ currentAccountLabel(asset.assetAccount) }}
              </ContentList>
            </div>
            <div class="content-list-col">
              <ContentList :label="t('Acquisition date')" :value="formatDate(asset.acquisitionDate)" />
              <ContentList :label="t('Acquisition cost')" :value="formatIDR(asset.acquisitionCost)" />
              <ContentList v-if="asset.creditedAccount" :label="t('Credited account')">
                {{ currentAccountLabel(asset.creditedAccount) }}
              </ContentList>
            </div>
            <div class="content-list-col">
              <ContentList v-if="asset.tags.length" :label="t('Tags')">
                <div class="cad-chips"><span v-for="tag in asset.tags" :key="tag" class="erp-tag">{{ tag }}</span></div>
              </ContentList>
              <ContentList v-if="asset.description" :label="t('Description')" :value="asset.description" />
              <ContentList v-if="remainingLife" :label="t('Remaining useful life')" :value="remainingLife" />
            </div>
          </div>
        </section>

        <!-- Depreciation -->
        <section v-if="asset.depreciable" class="cad-section">
          <h2 class="cad-section-title">{{ t('Depreciation') }}</h2>
          <div class="content-list-grid">
            <div class="content-list-col">
              <ContentList :label="t('Depreciation method')" :value="caMethodLabel(asset.method)" />
              <ContentList :label="t('Depreciation rate (%)')" :value="asset.rate != null ? `${asset.rate}%` : '—'" />
              <ContentList :label="t('Depreciation account')">
                {{ currentAccountLabel(asset.depreciationAccount) }}
              </ContentList>
            </div>
            <div class="content-list-col">
              <ContentList :label="t('Depreciation start date')" :value="formatDate(asset.acquisitionDate)" />
              <ContentList :label="t('Accumulated depreciation')">
                <span>{{ formatIDR(accumulated) }}</span>
                <span v-if="lastApplied" class="cad-asof">{{ t('As of {date}').replace('{date}', formatDate(lastApplied)) }}</span>
              </ContentList>
            </div>
          </div>
        </section>

        <!-- Depreciation history -->
        <section class="cad-section">
          <h2 class="cad-section-title">{{ t('Depreciation history') }}</h2>
          <table class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">{{ t('Date') }}</th>
                <th class="detail-th">{{ t('Number') }}</th>
                <th class="detail-th">{{ t('Description') }}</th>
                <th class="detail-th detail-th--num">{{ t('Expense amount') }}</th>
                <th class="detail-th detail-th--num">{{ t('Accumulated') }}</th>
                <th class="detail-th detail-th--num">{{ t('Book value') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in history" :key="h.id">
                <td class="detail-td">{{ formatDate(h.date) }}</td>
                <td class="detail-td"><span class="cell-link" @click="openJournal">{{ h.number }}</span></td>
                <td class="detail-td">{{ h.description }}</td>
                <td class="detail-td detail-td--num">{{ h.expense == null ? '—' : formatIDR(h.expense) }}</td>
                <td class="detail-td detail-td--num">{{ h.accumulated == null ? '—' : formatIDR(h.accumulated) }}</td>
                <td class="detail-td detail-td--num">{{ formatIDR(h.bookValue) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </div>

    <CurrentAssetDisposeModal v-if="asset" v-model:is-open="showDispose" :asset="asset" @dispose="onDispose" />
    <ConfirmModal
      v-model:is-open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      :confirm-label="confirmCopy.label"
      :is-danger="confirmCopy.danger"
      @confirm="runConfirm"
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
.cad-primary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-label { font-weight: var(--mp-font-weights-semi-bold); }
.cad-section { display: flex; flex-direction: column; }
.cad-section-title {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 24px); color: var(--mp-text-default);
}
.content-list-grid { display: grid; grid-template-columns: minmax(0, 318px) repeat(2, minmax(0, 1fr)); gap: 0 var(--mp-spacing-6); }
.content-list-col { display: flex; flex-direction: column; }
.cad-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.cad-asof { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-danger { color: var(--mp-text-danger); }

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

.cad-not-found { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.cad-not-found-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cad-not-found-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
