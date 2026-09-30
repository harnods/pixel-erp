<script setup lang="ts">
/**
 * Asset approvals (FG-7, OD-30 and OD-31).
 *
 * Every card here is a real request raised by an asset event while its
 * approval switch was on in Asset settings, or because it was above the
 * value threshold. Approving applies the held change through the engine, so
 * the register, schedule and asset history move at once. Sending back
 * cancels it and nothing reaches the books.
 *
 * Authorisation attaches to the decision, not to the asset: a count session
 * that writes off several assets raises one request carrying every item and
 * the total. The person who raised a request cannot decide it (FG7-AC3).
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import { actingUser, viewAs, canSeeFinancials } from '~/data/assetStore'
import {
  approvalRequests, awaitingRequests, approveRequest, sendBackRequest, requestTotal, decisionRefusal,
  approvalSettings, KIND_LABEL, type ApprovalRequest,
} from '~/data/assetApprovals'

const { t } = useLocale()
const router = useRouter()

/** Awaiting first: a queue is read top-down, and decided items are reference. */
const ordered = computed(() => [
  ...approvalRequests.value.filter((r) => r.status === 'awaiting'),
  ...approvalRequests.value.filter((r) => r.status !== 'awaiting'),
])

const notes = ref<Record<string, string>>({})
const errors = ref<Record<string, string>>({})
// A refusal names who was acting; switching View as makes it stale.
watch(viewAs, () => { errors.value = {} })
const anyOn = computed(() => approvalSettings.value.disposal || approvalSettings.value.writeOff || approvalSettings.value.valueChange || approvalSettings.value.threshold !== null)

function approve(r: ApprovalRequest) {
  errors.value = { ...errors.value, [r.id]: '' }
  const res = approveRequest(r.id, notes.value[r.id] ?? '')
  if (!res.ok) { errors.value = { ...errors.value, [r.id]: res.reason }; return }
  successToast(t(`${r.id} approved`))
  // SIM-4: a count's approval lands back on the count report it closes.
  if (r.sessionId) router.push(`/custody-and-counts?session=${r.sessionId}`)
}
function sendBack(r: ApprovalRequest) {
  errors.value = { ...errors.value, [r.id]: '' }
  const res = sendBackRequest(r.id, notes.value[r.id] ?? '')
  if (!res.ok) { errors.value = { ...errors.value, [r.id]: res.reason }; return }
  infoToast(t(`${r.id} sent back to ${r.raisedBy}`))
}

function selfRaised(r: ApprovalRequest): boolean { return r.status === 'awaiting' && r.raisedBy === actingUser.value }

const statusLabel: Record<string, string> = { awaiting: 'Awaiting approval', approved: 'Approved', 'sent-back': 'Sent back' }
</script>

<template>
  <div class="ap">
    <header class="ap__head">
      <p class="ap__sub">
        {{ awaitingRequests.length }}
        {{ t(awaitingRequests.length === 1 ? 'request awaiting approval' : 'requests awaiting approval') }}
      </p>
      <MpButton variant="secondary" is-rounded @click="router.push('/asset-settings')">{{ t('Approval rules') }}</MpButton>
    </header>

    <div v-if="!approvalRequests.length" class="ap__done">
      <MpIcon name="info" size="md" />
      <div>
        <div class="ap__donetitle">{{ t('No approval requests') }}</div>
        <div class="ap__donetext">
          {{ anyOn
            ? t('Approval requests will appear here.')
            : t('Approval is off for all asset events. Turn it on in Approval rules.') }}
        </div>
      </div>
    </div>
    <div v-else-if="!awaitingRequests.length" class="ap__done ap__done--ok">
      <MpIcon name="check" size="md" />
      <div>
        <div class="ap__donetitle">{{ t('No requests awaiting approval') }}</div>
      </div>
    </div>

    <div
      v-for="r in ordered" :key="r.id"
      class="ap__card" :class="{ 'ap__card--decided': r.status !== 'awaiting' }"
      :data-tour="`appr-${r.id.slice(-3)}`"
    >
      <div class="ap__cardtop">
        <div class="ap__what">
          <span class="ap__id">{{ r.id }} · {{ t(KIND_LABEL[r.kind]) }}</span>
          <span class="ap__title2">{{ r.title }}</span>
        </div>
        <span class="ap__status" :class="`ap__status--${r.status}`">{{ t(statusLabel[r.status] ?? r.status) }}</span>
      </div>

      <div class="ap__detail">
        <div class="ap__reason">{{ r.reason }}</div>
        <table class="ap__items">
          <thead>
            <tr>
              <th class="ap__th">{{ t('Asset') }}</th>
              <th class="ap__th">{{ t('Change') }}</th>
              <th v-if="canSeeFinancials" class="ap__th ap__th--num">{{ t('Accounting book value') }}</th>
              <th v-if="canSeeFinancials" class="ap__th ap__th--num">{{ t('Tax book value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in r.items" :key="it.assetId">
              <td class="ap__td"><span class="ap__assetlink" @click="router.push(`/assets/${it.assetId}`)">{{ it.assetId }}</span> {{ it.assetName }}</td>
              <td class="ap__td">{{ it.label }}<span v-if="it.applied" class="ap__applied"> · {{ t('Recorded') }}</span></td>
              <td v-if="canSeeFinancials" class="ap__td ap__td--num">{{ it.accounting === null ? t('None') : formatIDRWhole(it.accounting) }}</td>
              <td v-if="canSeeFinancials" class="ap__td ap__td--num">{{ it.tax === null ? t('No tax book') : formatIDRWhole(it.tax) }}</td>
            </tr>
            <tr v-if="canSeeFinancials && r.items.length > 1" class="ap__total">
              <td class="ap__td" colspan="2">{{ t('Total') }} · {{ r.items.length }} {{ t('assets') }}</td>
              <td class="ap__td ap__td--num">{{ formatIDRWhole(requestTotal(r).accounting) }}</td>
              <td class="ap__td ap__td--num">{{ formatIDRWhole(requestTotal(r).tax) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ap__meta">
        <span>{{ t('Requested by') }} <strong>{{ r.raisedBy }}</strong> · {{ r.raisedOn }}</span>
        <span v-if="r.sessionId" class="ap__assetlink" @click="router.push(`/custody-and-counts?session=${r.sessionId}`)">{{ t('Count') }} {{ r.sessionId }}</span>
        <span v-if="r.decidedBy">
          {{ t(r.status === 'approved' ? 'Approved by' : 'Sent back by') }} <strong>{{ r.decidedBy }}</strong> · {{ r.decidedOn }}<template v-if="r.note"> · “{{ r.note }}”</template>
        </span>
      </div>

      <template v-if="r.status === 'awaiting'">
        <div class="ap__note">
          <label class="ap__label" :for="`ap-note-${r.id}`">{{ t('Note (required to send back)') }}</label>
          <MpInput :id="`ap-note-${r.id}`" v-model="notes[r.id]" />
        </div>
        <p v-if="errors[r.id]" class="ap__error">{{ t(errors[r.id]!) }}</p>
        <p v-else-if="selfRaised(r)" class="ap__hint">{{ t(decisionRefusal(r) ?? '') }}</p>
        <div class="ap__actions">
          <MpButton variant="secondary" is-rounded @click="sendBack(r)">{{ t('Send back') }}</MpButton>
          <MpButton data-tour="appr-approve" is-rounded @click="approve(r)">{{ t('Approve') }}</MpButton>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ap { max-width: 960px; }
.ap__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.ap__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.ap__done {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md); color: var(--mp-text-default);
}
.ap__done--ok { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }
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
.ap__status--awaiting { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }
.ap__status--approved { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }
.ap__status--sent-back { background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); }

.ap__detail { margin-top: var(--mp-spacing-3); padding: var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md); }
.ap__reason { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-2); }
.ap__items { width: 100%; border-collapse: collapse; }
.ap__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); padding: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); }
.ap__th--num { text-align: right; }
.ap__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); }
.ap__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ap__total .ap__td { font-weight: var(--mp-font-weights-semi-bold); border-bottom: 0; }
.ap__applied { color: var(--mp-colors-text-success); }

.ap__meta { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-3); }
.ap__meta strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.ap__assetlink { color: var(--mp-text-link); cursor: pointer; }
.ap__assetlink:hover { text-decoration: underline; }
.ap__note { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
.ap__label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ap__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: var(--mp-spacing-2) 0 0; }
.ap__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: var(--mp-spacing-2) 0 0; }
.ap__actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
</style>
