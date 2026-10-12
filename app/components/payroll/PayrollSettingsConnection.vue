<script setup lang="ts">
/**
 * Connection (TS-01): which Talenta company feeds the books, the last send,
 * rejected sends, the HR steps, the first send's source confirmation and the
 * other-entity question. Start, end and restart take the Owner or Ultimate + LM.
 */
import { computed, ref } from 'vue'
import { MpButton, MpButtonGroup, MpInput, MpCheckbox, MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { successToast, infoToast } from '~/utils/toasts'
import {
  payroll, connection, can, startConnection, endConnection, restartConnection, confirmSource, sourceSummary,
  answerOtherEntities, markOtherEntity, runs, runHolds, runStatus, draftOf, wib, rupiah, periodLabel, today, syncLog,
} from '~/data/payrollStore'
import { PAYROLL_COMPANY_NAME } from '~/data/payrollMaster'
import { groupSummary, staffByValue, valuesSeen } from '~/data/payrollUiSettings'

const { t } = useLocale()
const router = useRouter()

const c = connection
const statusType = computed(() => ({ Connected: 'completed', 'Waiting for first send': 'warning', Ended: 'announcement', 'Not connected': 'announcement' } as const)[c.value.status])

/** The newest version Talenta sent, for the "last send" line. */
const lastSend = computed(() => {
  let best: { at: string; period: string; staff: number } | null = null
  for (const r of payroll.runs) for (const v of r.versions) if (!best || v.receivedAt > best.at) best = { at: v.receivedAt, period: periodLabel(r.start, r.end), staff: new Set(v.payload.items.map((e) => e.employee.user_id)).size }
  return best
})
const lastRejected = computed(() => c.value.rejected[c.value.rejected.length - 1] ?? null)
const silentDays = computed(() => {
  if (!c.value.lastAcceptedAt || c.value.status !== 'Connected') return 0
  return Math.floor((Date.parse(today()) - Date.parse(c.value.lastAcceptedAt.slice(0, 10))) / 86_400_000)
})
const blockedCalls = computed(() => payroll.oldSync.filter((o) => o.outcome === 'Blocked'))

// ── First send: confirm source ──
const sourceRun = computed(() => runs.value.find((r) => runHolds(r).some((h) => h.code === 'confirm-source')) ?? null)
const firstRun = computed(() => [...payroll.runs].sort((a, b) => a.versions[0]!.receivedAt.localeCompare(b.versions[0]!.receivedAt))[0] ?? null)
const summaryRun = computed(() => sourceRun.value ?? firstRun.value)
const summary = computed(() => (summaryRun.value ? sourceSummary(summaryRun.value.id) : null))
const otherEntityGroups = computed(() => payroll.settings.otherEntity.map((x) => ({ ...x, ...groupSummary(x.field, x.value) })))
const otherEntityTotal = computed(() => otherEntityGroups.value.reduce((s, g) => ({ staff: s.staff + g.staff, amount: s.amount + g.amount }), { staff: 0, amount: 0 }))

function onConfirmSource() {
  const r = confirmSource()
  if (!r.ok) { sourceError.value = r.message ?? ''; return }
  sourceError.value = ''
  successToast(t('Source confirmed. Held sends are checked again.'))
}
const sourceError = ref('')

// ── Start / end / restart (Owner, Ultimate + LM) ──
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
  else successToast(t(c.value.status === 'Connected' ? 'Connection restarted' : 'Connection started. Waiting for the first send.'))
}

const endOpen = ref(false)
const endReason = ref('')
const endError = ref('')
const openDrafts = computed(() => payroll.runs.filter((r) => draftOf(r) && runStatus(r) === 'Ready to post').length)
function onEnd() {
  const r = endConnection(endReason.value)
  if (!r.ok) { endError.value = t(r.message ?? ''); return }
  endOpen.value = false; endReason.value = ''; endError.value = ''
  successToast(t('Connection ended. Runs, mappings and journals stay as they are.'))
}

// ── Other legal entities ──
const oeError = ref('')
function answer(yes: boolean) {
  const r = answerOtherEntities(yes)
  if (!r.ok) { oeError.value = t(r.message ?? ''); return }
  oeError.value = ''
}
const orgs = computed(() => valuesSeen('organization_name'))
const branches = computed(() => valuesSeen('branch'))
const orgStaff = computed(() => staffByValue('organization_name'))
const branchStaff = computed(() => staffByValue('branch'))
function isOther(field: 'organization_name' | 'branch', value: string) { return payroll.settings.otherEntity.some((x) => x.field === field && x.value === value) }
function toggleOther(field: 'organization_name' | 'branch', value: string) {
  const r = markOtherEntity(field, value, !isOther(field, value))
  if (!r.ok) { oeError.value = t(r.message ?? ''); return }
  oeError.value = ''
}
const connectionLog = computed(() => syncLog.value.filter((l) => l.type === 'Connection').slice(0, 5))
</script>

<template>
  <div class="pset-stack">
    <!-- Status -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Payroll connection') }}</div>
          <div class="pset-card__sub">{{ t(`Talenta sends salary details to ${PAYROLL_COMPANY_NAME}`) }}</div>
        </div>
        <div class="pset-card__actions">
          <ErpStatusBadge :status="c.status" :label="t(c.status)" :type="statusType" />
          <MpButton v-if="can('connection') && (c.status === 'Connected' || c.status === 'Waiting for first send')" variant="secondary" is-rounded @click="endOpen = true">{{ t('End connection') }}</MpButton>
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pset-kv">
          <span class="pset-kv__k">{{ t('Talenta company ID') }}</span>
          <span class="pset-kv__v">{{ c.companyId ?? t('Not linked') }}</span>
          <template v-if="c.startedBy">
            <span class="pset-kv__k">{{ t('Connected since') }}</span>
            <span class="pset-kv__v">{{ wib(c.startedAt!) }} · {{ c.startedBy }}</span>
          </template>
          <template v-if="c.sourceConfirmedBy">
            <span class="pset-kv__k">{{ t('Source confirmed') }}</span>
            <span class="pset-kv__v">{{ wib(c.sourceConfirmedAt!) }} · {{ c.sourceConfirmedBy }}</span>
          </template>
          <span class="pset-kv__k">{{ t('Last accepted send') }}</span>
          <span class="pset-kv__v">
            <template v-if="c.lastAcceptedAt">{{ wib(c.lastAcceptedAt) }}<template v-if="lastSend"> · {{ lastSend.period }} · {{ lastSend.staff }} {{ t('employees') }}</template></template>
            <template v-else>{{ t('No send yet') }}</template>
          </span>
          <span class="pset-kv__k">{{ t('Sends received') }}</span>
          <span class="pset-kv__v">{{ c.sends }}</span>
          <span class="pset-kv__k">{{ t('Old-sync payroll calls blocked') }}</span>
          <span class="pset-kv__v">{{ blockedCalls.length }}</span>
          <template v-if="c.status === 'Ended' && c.endedReason">
            <span class="pset-kv__k">{{ t('Ended because') }}</span>
            <span class="pset-kv__v">{{ c.endedReason }}</span>
          </template>
        </div>
        <div v-if="lastRejected" class="pset-note pset-note--danger">
          <span>{{ t('Last send rejected') }} · {{ wib(lastRejected.at) }} · {{ t(lastRejected.reason) }}<template v-if="c.rejected.length > 1"> · {{ c.rejected.length }} {{ t('rejected sends') }}</template></span>
          <span class="pset-link" @click="router.push({ path: '/payroll-inbox', query: { view: 'log' } })">{{ t('Open sync log') }}</span>
        </div>
        <div v-if="silentDays > 40" class="pset-note pset-note--warn">{{ t(`No send from Talenta for ${silentDays} days. Ask HR whether payroll ran.`) }}</div>
      </div>
    </div>

    <!-- Start / restart (Owner, Ultimate + LM) -->
    <div v-if="can('connection') && (c.status === 'Not connected' || c.status === 'Ended')" class="pset-card">
      <div class="pset-card__head">
        <div class="pset-card__title">{{ t(c.status === 'Ended' ? 'Restart the connection' : 'Start the connection') }}</div>
      </div>
      <div class="pset-card__body">
        <div class="pset-row">
          <div class="pset-field">
            <label class="pset-label" for="pset-company-id">{{ t('Talenta company ID') }}</label>
            <MpInput id="pset-company-id" v-model="companyId" :is-invalid="!!startError" @update:model-value="startError = ''" />
          </div>
          <MpButton is-rounded @click="onStart">{{ t(c.status === 'Ended' ? 'Restart connection' : 'Start connection') }}</MpButton>
        </div>
        <p v-if="startError" class="pset-error">{{ startError }}</p>
        <p v-if="c.status === 'Ended'" class="pset-hint">{{ t('Pay item and group mappings from the earlier connection apply again.') }}</p>
      </div>
    </div>

    <!-- HR steps -->
    <div v-if="c.status !== 'Not connected'" class="pset-card">
      <div class="pset-card__head">
        <div class="pset-card__title">{{ t('Steps for the HR Superadmin in Talenta') }}</div>
      </div>
      <div class="pset-card__body">
        <ol class="pset-steps">
          <li>{{ t(`Open Settings, Integration and turn on the salary detail webhook for company ${c.companyId}.`) }}</li>
          <li>{{ t('Open the salary detail page of a completed period and click Send to Jurnal.') }}</li>
          <li>{{ t('Send every later period from the same page after payroll is final.') }}</li>
        </ol>
      </div>
    </div>

    <!-- First send: confirm source -->
    <div v-if="summary" class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t(sourceRun ? 'Confirm source' : 'First send') }}</div>
          <div class="pset-card__sub">{{ periodLabel(summaryRun!.start, summaryRun!.end) }}</div>
        </div>
        <ErpStatusBadge v-if="sourceRun" status="pending" :label="t('Waiting for the Owner')" />
        <ErpStatusBadge v-else status="completed" :label="t('Confirmed')" />
      </div>
      <div class="pset-card__body">
        <div class="pset-kv">
          <span class="pset-kv__k">{{ t('Organizations') }}</span>
          <span class="pset-kv__v">{{ summary.organizations.join(', ') }}</span>
          <span class="pset-kv__k">{{ t('Branches') }}</span>
          <span class="pset-kv__v">{{ summary.branches.join(', ') }}</span>
          <span class="pset-kv__k">{{ t('Headcount') }}</span>
          <span class="pset-kv__v">{{ summary.headcount }}</span>
          <span class="pset-kv__k">{{ t('Take-home pay total') }}</span>
          <span class="pset-kv__v">{{ rupiah(summary.takeHome) }}</span>
          <span class="pset-kv__k">{{ t('Other entity groups') }}</span>
          <span class="pset-kv__v">
            <template v-if="otherEntityGroups.length">{{ otherEntityGroups.map((g) => g.value).join(', ') }} · {{ otherEntityTotal.staff }} {{ t('staff') }}, {{ rupiah(otherEntityTotal.amount) }}</template>
            <template v-else>{{ t('None') }}</template>
          </span>
        </div>
        <p v-if="sourceRun && !can('connection')" class="pset-hint">{{ t('No draft builds until the Owner confirms this source.') }}</p>
        <div v-if="sourceRun && can('connection')" class="pset-bar">
          <span class="pset-hint">{{ t('No draft builds until you confirm these are the books of this company.') }}</span>
          <MpButton is-rounded @click="onConfirmSource">{{ t('Confirm source') }}</MpButton>
        </div>
        <p v-if="sourceError" class="pset-error">{{ sourceError }}</p>
      </div>
    </div>

    <!-- Other legal entities (FG1-AC2) -->
    <div v-if="c.status !== 'Not connected'" class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Other legal entities') }}</div>
          <div class="pset-card__sub">{{ t('Does this Talenta company hold staff of other legal entities?') }}</div>
        </div>
        <div class="pset-card__actions">
          <span class="pset-muted">{{ c.otherEntitiesAnswer === null ? t('Not answered') : c.otherEntitiesAnswer ? t('Yes') : t('No') }}</span>
          <template v-if="can('connection')">
            <MpButton v-if="c.otherEntitiesAnswer !== true" size="sm" variant="secondary" is-rounded @click="answer(true)">{{ t('Yes') }}</MpButton>
            <MpButton v-if="c.otherEntitiesAnswer !== false" size="sm" variant="secondary" is-rounded @click="answer(false)">{{ t('No') }}</MpButton>
          </template>
        </div>
      </div>
      <div v-if="c.otherEntitiesAnswer" class="pset-card__body">
        <p class="pset-hint">{{ t('Staff in a marked group are left out of the journal and listed as Other entity on each run.') }}</p>
        <table class="pset-table">
          <thead>
            <tr>
              <th class="pset-th">{{ t('Group') }}</th>
              <th class="pset-th">{{ t('Field') }}</th>
              <th class="pset-th pset-th--num">{{ t('Staff in last run') }}</th>
              <th class="pset-th">{{ t('Other entity') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in [...orgs.map((v) => ({ field: 'organization_name' as const, value: v, staff: orgStaff[v] ?? 0 })), ...branches.map((v) => ({ field: 'branch' as const, value: v, staff: branchStaff[v] ?? 0 }))]" :key="`${g.field}-${g.value}`">
              <td class="pset-td">{{ g.value }}</td>
              <td class="pset-td">{{ t(g.field === 'organization_name' ? 'Organization' : 'Branch') }}</td>
              <td class="pset-td pset-td--num">{{ g.staff }}</td>
              <td class="pset-td">
                <MpCheckbox v-if="can('connection')" :id="`pset-oe-${g.field}-${g.value.replace(/\s+/g, '-')}`" :is-checked="isOther(g.field, g.value)" @change="toggleOther(g.field, g.value)" />
                <span v-else>{{ isOther(g.field, g.value) ? t('Yes') : t('No') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="otherEntityGroups.length" class="pset-hint">{{ t('Other entity') }}: {{ otherEntityTotal.staff }} {{ t('staff') }}, {{ rupiah(otherEntityTotal.amount) }}</p>
      </div>
      <div v-if="oeError" class="pset-card__body"><p class="pset-error">{{ oeError }}</p></div>
    </div>

    <!-- Connection history -->
    <div v-if="connectionLog.length" class="pset-card">
      <div class="pset-card__head"><div class="pset-card__title">{{ t('Connection history') }}</div></div>
      <table class="pset-table">
        <tbody>
          <tr v-for="l in connectionLog" :key="l.id">
            <td class="pset-td pset-td--num">{{ wib(l.at) }}</td>
            <td class="pset-td">{{ t(l.reason) }}<span class="pset-line">{{ t(l.nextStep) }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- End connection: a destructive action confirms in a modal (rule/btn-danger-confirm). -->
    <MpModal id="pset-end-modal" :is-open="endOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="endOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t(`End the connection to Talenta company ${c.companyId}?`) }}</MpModalHeader>
        <MpModalBody>
          <div class="pset-stack">
            <p class="pset-hint">{{ t('Ending deletes nothing. Posted journals, mappings and rules stay readable, and new sends are rejected.') }}</p>
            <div v-if="openDrafts" class="pset-note pset-note--warn">{{ t(`${openDrafts} draft${openDrafts > 1 ? 's are' : ' is'} ready to post. They stay postable after the connection ends.`) }}</div>
            <div class="pset-field">
              <label class="pset-label" for="pset-end-reason">{{ t('Reason') }}</label>
              <MpInput id="pset-end-reason" v-model="endReason" :is-invalid="!!endError" @update:model-value="endError = ''" />
              <span class="pset-muted">{{ endReason.trim().length }} / 200 · {{ t('at least 10 characters') }}</span>
            </div>
            <p v-if="endError" class="pset-error">{{ endError }}</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="endOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="danger" is-rounded @click="onEnd">{{ t('End connection') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>
