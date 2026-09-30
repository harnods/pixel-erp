<script setup lang="ts">
/**
 * NoDeleteDialog (OD-36, FG6-AC5). No role can delete an asset: deletion
 * would take posted depreciation out of the ledger's explanation. What the
 * user wanted from a delete is offered instead, each as a real action on the
 * asset record: dispose, correct the cost, split, or reverse the latest run.
 */
import { computed } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import { fixedAssets, ledgers, postedRunFor, lastPostedPeriod } from '~/data/assetStore'
import { periodLabel } from '~/data/assetEngine'

const props = defineProps<{ assetId: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()
const router = useRouter()

const asset = computed(() => fixedAssets.value.find((a) => a.id === props.assetId) ?? null)
/** Posted periods that charged this asset: the history a delete would erase. */
const postedCharges = computed(() => {
  const l = asset.value ? ledgers.value[asset.value.id] : null
  if (!l) return 0
  return l.books.accounting.live.filter((r) => r.charge > 0 && postedRunFor(r.period)).length
})
const isGone = computed(() => asset.value?.status === 'Disposed' || asset.value?.status === 'Split')

const paths = computed(() => [
  { key: 'dispose', title: 'It was sold, scrapped or lost', body: 'Records a gain or loss on both books. The history is kept.', action: 'Dispose asset' },
  { key: 'correct', title: 'It was entered with the wrong cost', body: 'Posted periods are caught up in the next open period.', action: 'Correct cost' },
  { key: 'split', title: 'It should be several assets', body: 'Each part gets its own number. Cost and accumulated depreciation are split by ratio.', action: 'Split asset' },
  { key: 'run', title: 'A depreciation run was wrong', body: `Reverse the latest posted run${lastPostedPeriod.value ? ` (${periodLabel(lastPostedPeriod.value)})` : ''}. A reversing journal is posted and the period reopens.`, action: 'Open schedule' },
])

function go(key: string) {
  const id = asset.value!.id
  emit('close')
  if (key === 'run') router.push('/depreciation-schedule')
  else router.push({ path: `/assets/${id}`, query: { change: key } })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="asset" class="ndd-overlay" @click.self="emit('close')">
      <div class="ndd-dialog" role="dialog" :aria-label="t('Assets cannot be deleted')">
        <header class="ndd-head">
          <div class="ndd-title">{{ t('Assets cannot be deleted') }}</div>
          <MpButton variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
            <MpIcon name="close" size="sm" />
          </MpButton>
        </header>
        <div class="ndd-body">
          <p class="ndd-lead">
            <template v-if="postedCharges">{{ asset.id }} {{ asset.name }} {{ t(`has depreciation posted in ${postedCharges} ${postedCharges === 1 ? 'period' : 'periods'}.`) }}</template>
            <template v-if="!isGone">{{ t('Choose what happened instead.') }}</template>
          </p>
          <p v-if="isGone" class="ndd-lead">{{ t(`This asset is already ${asset.status.toLowerCase()}. Its record is kept for the figures it produced.`) }}</p>
          <div v-else class="ndd-paths">
            <div v-for="p in paths" :key="p.key" class="ndd-path">
              <div>
                <div class="ndd-pathtitle">{{ t(p.title) }}</div>
                <div class="ndd-pathbody">{{ t(p.body) }}</div>
              </div>
              <MpButton size="sm" variant="secondary" is-rounded @click="go(p.key)">{{ t(p.action) }}</MpButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ndd-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; display: flex; align-items: center; justify-content: center; }
.ndd-dialog { width: 560px; max-width: 94vw; background: var(--mp-background-neutral); border-radius: var(--mp-radii-md); border: 1px solid var(--mp-border-default); overflow: hidden; }
.ndd-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-4) var(--mp-spacing-3) var(--mp-spacing-6); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.ndd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ndd-body { padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-6); }
.ndd-lead { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin: 0 0 var(--mp-spacing-4); }
.ndd-paths { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ndd-path { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.ndd-pathtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ndd-pathbody { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
