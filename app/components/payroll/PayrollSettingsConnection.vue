<script setup lang="ts">
/**
 * Connection: status, the Talenta company, the last send and Disconnect. Connecting blocks
 * the old Talenta to Expense sync at once; Jurnal books from the first send after it. HR's steps sit behind
 * "How to send from Talenta". Changes take the Owner or Ultimate + LM.
 */
import { computed, ref } from 'vue'
import { MpButton, MpButtonGroup, MpInput, MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollSettingsDrawer from '~/components/payroll/PayrollSettingsDrawer.vue'
import { successToast, infoToast } from '~/utils/toasts'
import {
  payroll, connection, can, startConnection, endConnection, restartConnection,
  wib, periodLabel,
} from '~/data/payrollStore'
import { PAYROLL_COMPANY_NAME } from '~/data/payrollMaster'

const { t } = useLocale()
const c = connection
const statusType = computed(() => ({ Connected: 'completed', 'Waiting for first send': 'warning', Ended: 'announcement', 'Not connected': 'announcement' } as const)[c.value.status])
/** Ended reads as Disconnected, the same word as the button that ends it. */
const STATUS_LABEL: Record<string, string> = { Connected: 'Connected', 'Waiting for first send': 'Waiting for first send', Ended: 'Disconnected', 'Not connected': 'Not connected' }
const live = computed(() => c.value.status === 'Connected' || c.value.status === 'Waiting for first send')

/** The newest version Talenta sent. */
const lastSend = computed(() => {
  let best: { at: string; period: string } | null = null
  for (const r of payroll.runs) for (const v of r.versions) if (!best || v.receivedAt > best.at) best = { at: v.receivedAt, period: periodLabel(r.start, r.end) }
  return best
})

// ── Start / restart / end ──
const companyId = ref('')
const startError = ref('')
function onStart() {
  const id = Number(companyId.value.trim())
  if (!companyId.value.trim() || !Number.isInteger(id) || id <= 0) { startError.value = t('Enter the Talenta company ID using numbers only, for example 12345.'); return }
  const r = c.value.status === 'Ended' ? restartConnection(id) : startConnection(id)
  if (!r.ok) { startError.value = t(r.message ?? ''); return }
  startError.value = ''
  companyId.value = ''
  if (r.warning) infoToast(t(String(r.warning)))
  else successToast(t('Talenta connected'))
}
const endOpen = ref(false)
const endReason = ref('')
const endError = ref('')
function onEnd() {
  const r = endConnection(endReason.value)
  if (!r.ok) { endError.value = t(r.message ?? ''); return }
  endOpen.value = false; endReason.value = ''; endError.value = ''
  successToast(t('Talenta disconnected'))
}
const howOpen = ref(false)
</script>

<template>
  <div class="pset-stack">
    <div class="pset-card">
      <div class="pset-card__head">
        <div class="pset-card__title">{{ t('Talenta connection') }}</div>
        <div class="pset-card__actions">
          <ErpStatusBadge :status="c.status" :label="t(STATUS_LABEL[c.status] ?? c.status)" :type="statusType" />
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pset-form">
          <span class="pset-form__label">{{ t('Talenta company') }}</span>
          <span class="pset-form__value">{{ c.companyId ? `${PAYROLL_COMPANY_NAME} · ID ${c.companyId}` : t('Not linked') }}</span>

          <span class="pset-form__label">{{ t('Last sent') }}</span>
          <span class="pset-form__value">{{ lastSend ? `${wib(lastSend.at)} · ${lastSend.period}` : t('Nothing sent yet') }}</span>

          <span class="pset-form__label">{{ t('Old sync') }}</span>
          <span class="pset-form__value" data-tour="payroll-old-sync">{{ t(live ? 'Blocked since connecting. Jurnal books payroll from Talenta sends.' : 'Runs until you connect Talenta.') }}</span>
        </div>

        <!-- Start / restart -->
        <div v-if="can('connection') && !live" class="pset-form">
          <label class="pset-form__label pset-form__label--control" for="pset-company-id">{{ t('Talenta company ID') }}</label>
          <div class="pset-form__value pset-inline">
            <MpInput id="pset-company-id" v-model="companyId" :is-invalid="!!startError" @update:model-value="startError = ''" />
            <MpButton is-rounded @click="onStart">{{ t(c.status === 'Ended' ? 'Reconnect' : 'Connect') }}</MpButton>
          </div>
        </div>
        <p v-if="startError" class="pset-error">{{ startError }}</p>

        <div class="pset-bar">
          <span class="pset-link" @click="howOpen = true">{{ t('How to send from Talenta') }}</span>
          <MpButton v-if="can('connection') && live" variant="secondary" is-rounded @click="endOpen = true">{{ t('Disconnect Talenta') }}</MpButton>
        </div>
        <p v-if="!can('connection')" class="pset-hint" data-testid="pset-readonly">{{ t('Editing needs Set up access.') }}</p>
      </div>
    </div>

    <PayrollSettingsDrawer :is-open="howOpen" :title="t('How to send from Talenta')" :sub="t('Steps for your HR Superadmin in Talenta')" @close="howOpen = false">
      <ol class="pset-steps">
        <li>{{ t(c.companyId ? `In Talenta, open Settings > Integration and turn on Send to Jurnal for company ${c.companyId}.` : 'In Talenta, open Settings > Integration and turn on Send to Jurnal.') }}</li>
        <li>{{ t('Open the salary details of a finished pay period and click Send to Jurnal.') }}</li>
        <li>{{ t('Send each later period the same way once its payroll is final.') }}</li>
      </ol>
    </PayrollSettingsDrawer>

    <MpModal id="pset-end-modal" :is-open="endOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="endOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Disconnect Talenta?') }}</MpModalHeader>
        <MpModalBody>
          <div class="pset-stack">
            <p class="pset-hint">{{ t('Posted journals and settings stay. Jurnal stops accepting payroll from Talenta until you reconnect.') }}</p>
            <div class="pset-field">
              <label class="pset-label" for="pset-end-reason">{{ t('Reason') }}</label>
              <MpInput id="pset-end-reason" v-model="endReason" :is-invalid="!!endError" @update:model-value="endError = ''" />
            </div>
            <p v-if="endError" class="pset-error">{{ endError }}</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="endOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="danger" is-rounded @click="onEnd">{{ t('Disconnect Talenta') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>
