<script setup lang="ts">
/**
 * "Simulate Talenta send": the prototype's stand-in for Talenta's salary detail
 * webhook (scope fence 2), the only Talenta webhook Jurnal reads. Every kind in SEND_KINDS goes through simulateSend, so the
 * inbox, the run record and the sync log react exactly as they would to a real send.
 */
import { computed } from 'vue'
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import { simulateSend, SEND_KINDS, type SendKind } from '~/data/payrollStore'
import { successToast, errorToast, infoToast } from '~/utils/toasts'

const emit = defineEmits<{ (e: 'sent', runId: string | undefined): void }>()
const { t } = useLocale()

/** Every kind the engine knows (SEND_KINDS), each once: salary detail sends, then the old sync call. */
const LABELS: Record<SendKind, string> = {
  'regular': 'Regular run, next period',
  'new-pay-item': 'Run with a new pay item',
  'revision': 'Revision of the last posted run',
  'missing-component': 'Run with a missing component (PPH 21 Paid)',
  'partial': 'Partial re-send (one branch)',
  'separate-run': 'THR run for a posted period',
  'duplicate': 'Byte-identical duplicate',
  'old-sync': 'Old-sync Expense call',
}
const GROUPS = computed(() => [
  { title: 'Salary detail', kinds: SEND_KINDS.map((s) => s.kind).filter((k) => k !== 'old-sync') },
  { title: 'Old sync', kinds: SEND_KINDS.map((s) => s.kind).filter((k) => k === 'old-sync') },
])
const label = (k: SendKind) => LABELS[k] ?? SEND_KINDS.find((s) => s.kind === k)?.label ?? k

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
          <MpPopoverListItem v-for="k in g.kinds" :key="k" :data-kind="k" @click="send(k)">{{ t(label(k)) }}</MpPopoverListItem>
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
