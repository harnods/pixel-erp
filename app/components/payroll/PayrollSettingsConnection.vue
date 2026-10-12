<script setup lang="ts">
/**
 * Connection: status, the Talenta company, the last send, the month Jurnal starts booking
 * (the old Talenta to Expense sync is blocked from it) and Disconnect. HR's steps sit behind
 * "How to send from Talenta". Changes take the Owner or Ultimate + LM.
 */
import { computed, ref } from 'vue'
import { MpButton, MpButtonGroup, MpInput, MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollSettingsDrawer from '~/components/payroll/PayrollSettingsDrawer.vue'
import { successToast, infoToast } from '~/utils/toasts'
import {
  payroll, connection, can, startConnection, endConnection, restartConnection, setStartMonth,
  wib, periodLabel, monthLabel, nextMonthOf, today,
} from '~/data/payrollStore'
import { PAYROLL_COMPANY_NAME } from '~/data/payrollMaster'

const { t } = useLocale()
const c = connection
const statusType = computed(() => ({ Connected: 'completed', 'Waiting for first send': 'warning', Ended: 'announcement', 'Not connected': 'announcement' } as const)[c.value.status])
const live = computed(() => c.value.status === 'Connected' || c.value.status === 'Waiting for first send')

/** The newest version Talenta sent. */
const lastSend = computed(() => {
  let best: { at: string; period: string } | null = null
  for (const r of payroll.runs) for (const v of r.versions) if (!best || v.receivedAt > best.at) best = { at: v.receivedAt, period: periodLabel(r.start, r.end) }
  return best
})

// ── Start booking from ──
const startMonth = computed(() => payroll.settings.cutover.firstLive ?? '')
const monthOptions = computed(() => {
  const first = [...payroll.runs.map((r) => r.month), today().slice(0, 7)].sort()[0]!
  let last = today().slice(0, 7)
  for (let i = 0; i < 3; i++) last = nextMonthOf(last)
  const out: { value: string; label: string }[] = []
  for (let m = first; m <= last; m = nextMonthOf(m)) out.push({ value: m, label: monthLabel(m) })
  return out
})
const monthError = ref('')
function onMonth(m: string) {
  if (!m || m === startMonth.value) return
  const r = setStartMonth(m)
  monthError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t(`Jurnal books payroll from ${monthLabel(m)}`))
}

// ── Start / restart / end ──
const companyId = ref('')
const startError = ref('')
function onStart() {
  const id = Number(companyId.value.trim())
  if (!companyId.value.trim() || !Number.isInteger(id) || id <= 0) { startError.value = t('Enter the Talenta company ID, numbers only.'); return }
  const r = c.value.status === 'Ended' ? restartConnection(id) : startConnection(id)
  if (!r.ok) { startError.value = t(r.message ?? ''); return }
  startError.value = ''
  companyId.value = ''
  if (r.warning) infoToast(t(String(r.warning)))
  else successToast(t('Connected'))
}
const endOpen = ref(false)
const endReason = ref('')
const endError = ref('')
function onEnd() {
  const r = endConnection(endReason.value)
  if (!r.ok) { endError.value = t(r.message ?? ''); return }
  endOpen.value = false; endReason.value = ''; endError.value = ''
  successToast(t('Disconnected'))
}
const howOpen = ref(false)
</script>

<template>
  <div class="pset-stack">
    <div class="pset-card">
      <div class="pset-card__head">
        <div class="pset-card__title">{{ t('Talenta connection') }}</div>
        <div class="pset-card__actions">
          <ErpStatusBadge :status="c.status" :label="t(c.status)" :type="statusType" />
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pset-form">
          <span class="pset-form__label">{{ t('Talenta company') }}</span>
          <span class="pset-form__value">{{ c.companyId ? `${PAYROLL_COMPANY_NAME} · ID ${c.companyId}` : t('Not linked') }}</span>

          <span class="pset-form__label">{{ t('Last send') }}</span>
          <span class="pset-form__value">{{ lastSend ? `${wib(lastSend.at)} · ${lastSend.period}` : t('No send yet') }}</span>

          <label class="pset-form__label pset-form__label--control" for="pset-start-month">{{ t('Start booking from') }}</label>
          <div class="pset-form__value" data-tour="payroll-old-sync">
            <ErpFilterSelect v-if="can('connection')" id="pset-start-month" :model-value="startMonth" :placeholder="t('Pick a month')" :options="monthOptions" width="200px" :is-clearable="false" @update:model-value="onMonth" />
            <span v-else>{{ startMonth ? monthLabel(startMonth) : t('Not set') }}</span>
            <span class="pset-line">{{ t('From this month the old Talenta to Expense sync is blocked, so nothing is booked twice.') }}</span>
            <span v-if="monthError" class="pset-line pset-danger">{{ monthError }}</span>
          </div>
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
          <MpButton v-if="can('connection') && live" variant="secondary" is-rounded @click="endOpen = true">{{ t('Disconnect') }}</MpButton>
        </div>
      </div>
    </div>

    <PayrollSettingsDrawer :is-open="howOpen" :title="t('How to send from Talenta')" :sub="t('For the HR Superadmin')" @close="howOpen = false">
      <ol class="pset-steps">
        <li>{{ t(`In Talenta, open Settings, Integration and turn on the salary detail webhook for company ${c.companyId ?? ''}.`) }}</li>
        <li>{{ t('Open the salary detail page of a final period and click Send to Jurnal.') }}</li>
        <li>{{ t('Send every later period the same way once payroll is final.') }}</li>
      </ol>
    </PayrollSettingsDrawer>

    <MpModal id="pset-end-modal" :is-open="endOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="endOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Disconnect Talenta?') }}</MpModalHeader>
        <MpModalBody>
          <div class="pset-stack">
            <p class="pset-hint">{{ t('Posted journals and mappings stay. New sends are rejected.') }}</p>
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
            <MpButton variant="danger" is-rounded @click="onEnd">{{ t('Disconnect') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>
