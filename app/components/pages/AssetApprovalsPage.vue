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
import { MpButton, MpIcon } from '@mekari/pixel3'
import { infoToast, successToast } from '~/utils/toasts'
import {
  approvalStatus, decideApproval, awaitingApprovals, decidedApprovals,
} from '~/data/fixedAssetSession'

const { t } = useLocale()
const router = useRouter()

/** Awaiting first: a queue is read top-down, and decided items are reference. */
const ordered = computed(() => [...awaitingApprovals.value, ...decidedApprovals.value])

function approve(id: string, what: string) {
  decideApproval(id, 'approved')
  successToast(t(`${what} approved`))
}
function sendBack(id: string, what: string) {
  decideApproval(id, 'sent-back')
  infoToast(t(`${what} sent back to the requester`))
}

/** The asset a request is about, so a reviewer can look before deciding. */
function assetIdIn(text: string): string | null {
  const m = String(text).match(/FA-\d{4}/)
  return m ? m[0] : null
}
function openAsset(id: string) { router.push(`/assets/${id}`) }

const statusLabel: Record<string, string> = {
  awaiting: 'Awaiting you',
  approved: 'Approved',
  'sent-back': 'Sent back',
}
</script>

<template>
  <div class="ap">
    <header class="ap__head">
      <p class="ap__sub">
        {{ awaitingApprovals.length }}
        {{ t(awaitingApprovals.length === 1 ? 'decision awaiting you' : 'decisions awaiting you') }}
        · {{ t('disposal, write-off and value change') }}
      </p>
    </header>

    <div v-if="!awaitingApprovals.length" class="ap__done">
      <MpIcon name="check-circle" size="md" />
      <div>
        <div class="ap__donetitle">{{ t('Nothing is waiting for a decision') }}</div>
        <div class="ap__donetext">
          {{ t('Every request has been decided. Decided requests stay below, because the record of what was approved is the point of having approvals.') }}
        </div>
      </div>
    </div>

    <div
      v-for="a in ordered" :key="String(a.id)"
      class="ap__card"
      :class="{ 'ap__card--decided': approvalStatus(String(a.id)) !== 'awaiting' }"
    >
      <div class="ap__cardtop">
        <div class="ap__what">
          <span class="ap__id">{{ a.id }}</span>
          <span class="ap__title2">{{ a.what }}</span>
        </div>
        <span class="ap__status" :class="`ap__status--${approvalStatus(String(a.id))}`">
          {{ t(statusLabel[approvalStatus(String(a.id))]) }}
        </span>
      </div>

      <div class="ap__detail">{{ a.detail }}</div>

      <div class="ap__meta">
        <span>{{ t('Raised by') }} <strong>{{ a.raisedBy }}</strong></span>
        <span>{{ a.raisedOn }}</span>
        <span
          v-if="assetIdIn(String(a.what))"
          class="ap__assetlink"
          @click="openAsset(assetIdIn(String(a.what))!)"
        >{{ t('View asset') }}</span>
      </div>

      <div v-if="approvalStatus(String(a.id)) === 'awaiting'" class="ap__actions">
        <MpButton variant="secondary" is-rounded @click="sendBack(String(a.id), String(a.what))">
          {{ t('Send back') }}
        </MpButton>
        <MpButton is-rounded @click="approve(String(a.id), String(a.what))">{{ t('Approve') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ap { max-width: 880px; }
.ap__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.ap__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.ap__done {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  background: var(--mp-background-success-subtle); border-radius: var(--mp-radii-md);
  color: var(--mp-text-success);
}
.ap__donetitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.ap__donetext { font-size: var(--mp-font-sizes-sm); margin-top: var(--mp-spacing-1); }

.ap__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
/* A decided request is reference, not work. Toned down, never hidden. */
.ap__card--decided { background: var(--mp-background-neutral-subtle); }

.ap__cardtop { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.ap__what { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ap__id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.ap__title2 { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ap__status { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); white-space: nowrap; flex: none; }
.ap__status--awaiting { background: var(--mp-background-warning-subtle); color: var(--mp-text-warning); }
.ap__status--approved { background: var(--mp-background-success-subtle); color: var(--mp-text-success); }
.ap__status--sent-back { background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); }

.ap__detail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin-top: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md); }
.ap__meta { display: flex; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-3); }
.ap__meta strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.ap__assetlink { color: var(--mp-text-link); cursor: pointer; }
.ap__assetlink:hover { text-decoration: underline; }
.ap__actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
</style>
