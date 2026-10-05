<script setup lang="ts">
/**
 * "Simulate Talenta send": the prototype's stand-in for Talenta's webhooks
 * (scope fence 2). Every kind the engine knows goes through simulateSend, so the
 * inbox, the run record and the sync log react exactly as they would to a real send.
 */
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import { simulateSend, SEND_KINDS, type SendKind } from '~/data/payrollStore'
import { successToast, errorToast, infoToast } from '~/utils/toasts'

const emit = defineEmits<{ (e: 'sent', runId: string | undefined): void }>()
const { t } = useLocale()

const GROUPS: { title: string; kinds: SendKind[] }[] = [
  { title: 'Salary detail', kinds: ['regular', 'new-pay-item', 'revision', 'partial', 'separate-run', 'duplicate'] },
  { title: 'Employee events', kinds: ['transfer', 'resignation', 'created', 'deleted'] },
  { title: 'Old sync', kinds: ['old-sync'] },
]
const label = (k: SendKind) => SEND_KINDS.find((s) => s.kind === k)?.label ?? k

function send(kind: SendKind) {
  const r = simulateSend(kind)
  const msg = r.message ?? r.status
  if (r.status === 'Failed' || r.status === 'Blocked') errorToast(t(`${r.status}: ${msg}`))
  else if (r.status === 'Held' || r.status === 'Waiting for your choice') infoToast(t(`${r.status}: ${msg}`))
  else successToast(t(`${r.status}: ${msg}`))
  emit('sent', r.runId)
}
</script>

<template>
  <MpPopover id="payroll-simulate-send" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
    <MpPopoverTrigger>
      <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Simulate Talenta send') }}</MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent class="erp-dropdown-menu psim-menu">
      <template v-for="g in GROUPS" :key="g.title">
        <div class="psim-head">{{ t(g.title) }}</div>
        <MpPopoverList>
          <MpPopoverListItem v-for="k in g.kinds" :key="k" @click="send(k)">{{ t(label(k)) }}</MpPopoverListItem>
        </MpPopoverList>
      </template>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.psim-menu { min-width: 264px; }
.psim-head {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
}
</style>
