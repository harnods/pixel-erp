<script setup lang="ts">
/**
 * Asset approvals.
 *
 * Authorisation attaches to the decision, not to the asset. A count session
 * that finds two hundred missing assets is one decision; presenting it as two
 * hundred approvals turns a control into a formality and records a review that
 * did not happen.
 *
 * Approval is configurable per event and defaults to off. A single-finance-person
 * SMB and a regulated bank have opposite needs, and a switch serves both where a
 * fixed answer serves one.
 */
import { computed } from 'vue'
import { MpButton } from '@mekari/pixel3'
import { infoToast, successToast } from '~/utils/toasts'
import { approvalRows } from '~/data/fixedAssetScreens'

const { t } = useLocale()

const awaiting = computed(() => approvalRows.filter((a) => String(a.status).startsWith('Awaiting')))

function decide(id: string, approve: boolean) {
  if (approve) successToast(t(`${id} approved.`))
  else infoToast(t(`${id} sent back.`))
}
</script>

<template>
  <div class="ap">
    <header class="ap__head">
      <p class="ap__sub">
        {{ awaiting.length }} {{ t(awaiting.length === 1 ? 'decision awaiting you' : 'decisions awaiting you') }}
        · {{ t('disposal, write-off and value change') }}
      </p>
    </header>

    <div v-if="!approvalRows.length" class="ap__empty">
      {{ t('Nothing is waiting for a decision.') }}
    </div>

    <div v-for="a in approvalRows" :key="String(a.id)" class="ap__card">
      <div class="ap__cardtop">
        <div class="ap__what">
          <span class="ap__id">{{ a.id }}</span>
          <span class="ap__title2">{{ a.what }}</span>
        </div>
        <span class="ap__status">{{ a.status }}</span>
      </div>

      <div class="ap__detail">{{ a.detail }}</div>

      <div class="ap__meta">
        <span>{{ t('Raised by') }} <strong>{{ a.raisedBy }}</strong></span>
        <span>{{ a.raisedOn }}</span>
      </div>

      <div class="ap__actions">
        <MpButton size="sm" variant="secondary" @click="decide(String(a.id), false)">{{ t('Send back') }}</MpButton>
        <MpButton size="sm" @click="decide(String(a.id), true)">{{ t('Approve') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ap { padding: 4px 0 32px; max-width: 880px; }
.ap__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; min-height: 32px; }
.ap__title { font-size: 18px; font-weight: 600; color: #1e2e2b; margin: 0; }
.ap__sub { font-size: 13px; color: #758195; margin: 0; max-width: 720px; }

.ap__empty { border: 1px dashed #e2e7ed; border-radius: 10px; padding: 40px; text-align: center; color: #758195; font-size: 14px; }

.ap__card { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; padding: 16px; margin-bottom: 12px; }
.ap__cardtop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ap__what { display: flex; flex-direction: column; gap: 2px; }
.ap__id { font-size: 11px; color: #758195; font-variant-numeric: tabular-nums; }
.ap__title2 { font-size: 14px; font-weight: 600; color: #1e2e2b; }
.ap__status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #fdf9c4; color: #7a5700; white-space: nowrap; flex: none; }

.ap__detail { font-size: 13px; color: #3a4749; margin-top: 10px; padding: 10px 12px; background: #f8fafb; border-radius: 8px; }
.ap__meta { display: flex; gap: 16px; font-size: 12px; color: #758195; margin-top: 10px; }
.ap__meta strong { color: #3a4749; font-weight: 600; }
.ap__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
