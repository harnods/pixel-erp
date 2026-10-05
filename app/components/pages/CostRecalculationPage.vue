<!-- prod-parity: jurnal-frontend-app/src/pages/other-lists/calculation-on-background/index.vue (+ components/recalculation-guide, recalculation-schedule, failure-banner) -->
<script setup lang="ts">
/**
 * Other lists → Cost recalculation (prod "Inventory value recalculation").
 * Action guide + Automatic recalculation schedule toggle, the latest
 * recalculation (Status · Triggering transaction · Triggering transaction date),
 * Recalculate button with the attempt-limit confirmation, and the Log table.
 */
import {
  MpButton, MpButtonGroup, MpIcon, MpToggle, MpTooltip, MpProgress, MpBanner, MpBannerIcon, MpBannerDescription,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, MpText,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatDate, formatDateTime } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import { recalcState, type RecalcLog, type RecalcStatus } from '~/data/otherLists'

const { t } = useLocale()

const RECALC_INTERVAL_HOURS = 3
type BadgeType = 'completed' | 'warning' | 'critical' | 'information'
const STATUS: Record<RecalcStatus, { label: string; type: BadgeType }> = {
  idle: { label: 'Awaiting recalculation', type: 'warning' },
  progress: { label: 'In progress', type: 'warning' },
  done: { label: 'Completed', type: 'completed' },
  fail: { label: 'Failed', type: 'critical' },
}

const latest = computed<RecalcLog | undefined>(() => recalcState.logs[0])
const isRecalculating = computed(() => latest.value?.status === 'progress')
const showFailure = computed(() => recalcState.logs.slice(0, 2).some((l) => l.status === 'fail'))
function triggerLabel(l: RecalcLog) { return l.trigger ?? t('Deleted transaction') }

// ── Schedule toggle (activate / deactivate confirmation) ──
const scheduleModal = ref<'activate' | 'deactivate' | null>(null)
function onToggle() { scheduleModal.value = recalcState.scheduleActive ? 'deactivate' : 'activate' }
function confirmSchedule() {
  recalcState.scheduleActive = scheduleModal.value === 'activate'
  successToast(recalcState.scheduleActive ? t('Automatic scheduler activated') : t('Automatic scheduler deactivated'))
  scheduleModal.value = null
}

// ── Recalculate (attempt-limit confirmation → progress → completed) ──
const confirmOpen = ref(false)
const progress = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
function recalculate() { confirmOpen.value = true }
function runRecalculation() {
  confirmOpen.value = false
  const l = latest.value
  if (!l) return
  l.status = 'progress'
  l.recalculateDate = new Date().toISOString()
  l.auto = false
  l.by = { name: 'Rizal Candra', email: 'rizal.candra@centralperk.co.id' }
  progress.value = 0
  timer = setInterval(() => {
    progress.value = Math.min(100, progress.value + 25)
    if (progress.value >= 100 && timer) {
      clearInterval(timer); timer = null
      l.status = 'done'
      successToast(t('Inventory value recalculated'))
    }
  }, 700)
}
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
function reload() { infoToast(t('Reload to view the latest status.')) }

// ── Log table ──
const rows = computed(() => recalcState.logs)
const { currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<RecalcLog>(rows, { perPage: 25 })
const columns: TableColumn[] = [
  { key: 'recalculateDate', label: t('Calculation date'), kind: 'date' },
  { key: 'by', label: t('Updated by'), kind: 'name' },
  { key: 'trigger', label: t('Triggering transaction'), kind: 'number' },
  { key: 'triggerDate', label: t('Triggering transaction date') },
  { key: 'status', label: t('Status'), kind: 'status' },
]
</script>

<template>
  <div class="cr-root">
    <MpBanner v-if="showFailure" id="cr-failure" variant="warning" class="cr-banner">
      <MpBannerIcon id="cr-failure-icon" />
      <MpBannerDescription>
        {{ t('Failed to perform recalculation. Please try again in a few moments or contact support team through live chat if this issue persists.') }}
        <MpButton variant="textLink" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Open live chat') }}</MpButton>
      </MpBannerDescription>
    </MpBanner>

    <section class="cr-head">
      <div class="cr-guide">
        <p class="cr-guide-title">{{ t('Action') }}</p>
        <p class="cr-guide-text">
          {{ t('The') }} <strong>{{ t('awaiting recalculation') }}</strong> {{ t('status shows that data related to inventory value needs an update.') }}
          {{ t('Otherwise, the') }} <strong>{{ t('completed') }}</strong> {{ t('status means all data are actual.') }}
          <a class="cr-link" @click="infoToast(t('Not in this prototype'))">{{ t('Learn more') }}</a>
        </p>
      </div>

      <div class="cr-schedule">
        <div class="cr-schedule-left">
          <MpIcon name="schedule" size="md" />
          <div>
            <p class="cr-schedule-title">{{ t('Automatic recalculation schedule') }}</p>
            <p class="cr-schedule-sub">{{ recalcState.scheduleActive ? `${t('Every day at')} ${recalcState.scheduleTime}` : t('Inactive') }}</p>
          </div>
        </div>
        <MpToggle id="cr-schedule-toggle" :is-checked="recalcState.scheduleActive" :aria-label="t('Automatic recalculation schedule')" @click.prevent="onToggle" />
      </div>
    </section>

    <section class="cr-latest">
      <ContentList horizontal :label="t('Status')">
        <ErpStatusBadge v-if="latest" :status="latest.status" :label="t(STATUS[latest.status].label)" :type="STATUS[latest.status].type" />
        <span v-else>-</span>
      </ContentList>
      <div class="cr-row">
        <span class="cr-row-label cr-label-tip">
          {{ t('Triggering transaction') }}
          <MpTooltip id="cr-trigger-tip" :label="t('The transaction with data changes affecting inventory value. All related transactions created after this one are included in the recalculation.')" placement="bottom" use-portal>
            <span class="cr-tip-icon" tabindex="0" :aria-label="t('Triggering transaction')"><MpIcon name="info" size="sm" /></span>
          </MpTooltip>
        </span>
        <div class="cr-row-value">{{ latest ? triggerLabel(latest) : '-' }}</div>
      </div>
      <ContentList horizontal :label="t('Triggering transaction date')" :value="latest ? formatDate(latest.triggerDate) : '-'" />
    </section>

    <div v-if="isRecalculating" class="cr-progress">
      <MpProgress :value="String(progress)" size="sm" color="positive" />
      <p class="cr-progress-text">
        {{ t('Reload to view the latest status.') }}
        <MpButton variant="textLink" is-rounded @click="reload">{{ t('Reload') }}</MpButton>
      </p>
    </div>
    <div v-else-if="latest?.status === 'idle'">
      <MpButton variant="primary" is-rounded @click="recalculate">{{ t('Recalculate') }}</MpButton>
    </div>

    <hr class="cr-divider" />

    <section class="cr-log">
      <h2 class="cr-log-title">{{ t('Log') }}</h2>
      <ErpTablePage
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        bulk-label="log"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort-change="setSort"
      >
        <template #cell-recalculateDate="{ row }">
          {{ (row as unknown as RecalcLog).status === 'idle' ? '-' : formatDateTime((row as unknown as RecalcLog).recalculateDate) }}
        </template>
        <template #cell-by="{ row }">
          <span v-if="(row as unknown as RecalcLog).status === 'idle'">-</span>
          <span v-else-if="(row as unknown as RecalcLog).auto">{{ t('System (automatic)') }}</span>
          <div v-else class="cr-user">
            <span class="cell-text">{{ (row as unknown as RecalcLog).by?.name }}</span>
            <span class="cr-user-email cell-text">{{ (row as unknown as RecalcLog).by?.email }}</span>
          </div>
        </template>
        <template #cell-trigger="{ row }">{{ triggerLabel(row as unknown as RecalcLog) }}</template>
        <template #cell-triggerDate="{ value }">{{ formatDate(value as string) }}</template>
        <template #cell-status="{ row }">
          <ErpStatusBadge :status="(row as unknown as RecalcLog).status" :label="t(STATUS[(row as unknown as RecalcLog).status].label)" :type="STATUS[(row as unknown as RecalcLog).status].type" />
        </template>
        <template #empty>
          <div class="empty-full">
            <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
            <p class="empty-full-title">{{ t('No log yet') }}</p>
            <p class="empty-full-desc">{{ t('Logs of inventory value recalculation will appear here.') }}</p>
          </div>
        </template>
      </ErpTablePage>
    </section>
  </div>

  <MpModal id="cr-attempt-limit" :is-open="confirmOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="confirmOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Confirmation of inventory value recalculation') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <MpText>{{ t('Recalculation can be performed every') }} {{ RECALC_INTERVAL_HOURS }} {{ t('hours. Ensure that any created, edited, or deleted transactions meet your needs.') }}</MpText>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="confirmOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="runRecalculation">{{ t('Confirm') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <MpModal id="cr-schedule-modal" :is-open="scheduleModal !== null" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="scheduleModal = null">
    <MpModalContent>
      <MpModalHeader>{{ scheduleModal === 'activate' ? t('Activate automatic scheduler?') : t('Deactivate automatic scheduler?') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <MpText v-if="scheduleModal === 'activate'">
          {{ t('Our system will automatically recalculate your inventory value every day at') }} {{ recalcState.scheduleTime }} {{ t('(GMT+7) only when the data are not actual.') }}
        </MpText>
        <MpText v-else>
          {{ t('You need to trigger recalculation by clicking the') }} <strong>{{ t('Recalculate') }}</strong> {{ t('button on this page whenever you receive information about data that are not actual.') }}
        </MpText>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="scheduleModal = null">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirmSchedule">{{ scheduleModal === 'activate' ? t('Activate') : t('Deactivate') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cr-root { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cr-banner { flex: none; }
.cr-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); }
.cr-guide { max-width: 576px; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cr-guide-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cr-guide-text { margin: 0; color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }
.cr-guide-text strong { font-weight: var(--mp-font-weights-semi-bold); }
.cr-link { color: var(--mp-text-link); cursor: pointer; }
.cr-link:hover { text-decoration: underline; }
.cr-schedule {
  flex: none; width: 377px; display: flex; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.cr-schedule-left { display: flex; gap: var(--mp-spacing-3); color: var(--mp-colors-icon-default); }
.cr-schedule-title { margin: 0; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cr-schedule-sub { margin: 0; color: var(--mp-text-secondary); }
.cr-latest { display: flex; flex-direction: column; }
.cr-row { display: flex; align-items: baseline; gap: var(--mp-spacing-6, 24px); padding: var(--mp-spacing-2) 0; }
.cr-row-label { flex: 0 0 184px; min-width: 184px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-secondary); }
.cr-row-value { flex: 1 1 auto; min-width: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); }
.cr-label-tip { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.cr-tip-icon { display: inline-flex; color: var(--mp-colors-icon-default); cursor: help; }
.cr-progress { width: 612px; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cr-progress-text { margin: 0; color: var(--mp-text-secondary); display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cr-divider { margin: var(--mp-spacing-1) 0; border: none; border-top: 1px solid var(--mp-border-default); }
.cr-log { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cr-log-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cr-user { display: flex; flex-direction: column; min-width: 0; }
.cr-user-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
