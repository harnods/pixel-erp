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
        <MpButton variant="secondary" is-rounded @click="decide(String(a.id), false)">{{ t('Send back') }}</MpButton>
        <MpButton is-rounded @click="decide(String(a.id), true)">{{ t('Approve') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ap { max-width: 880px; }
.ap__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.ap__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.ap__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.ap__empty { border: 1px dashed var(--mp-border-default); border-radius: var(--mp-radii-md); padding: var(--mp-spacing-10); text-align: center; color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md); }

.ap__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
.ap__cardtop { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.ap__what { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ap__id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.ap__title2 { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ap__status { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); background: var(--mp-background-warning-subtle); color: var(--mp-text-warning); white-space: nowrap; flex: none; }

.ap__detail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin-top: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md); }
.ap__meta { display: flex; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-3); }
.ap__meta strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.ap__actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
</style>
