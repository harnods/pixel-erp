<script setup lang="ts">
/**
 * Track routing — Work order detail → Track routing. Built from the Figma
 * reference (Production Management › Track routing) using the ERP detail-page
 * shell. A three-column board of the work order's routing steps: Start process
 * and Finish each ask for the actual date, Cancel moves a step one column back.
 *
 * Changes stay in a local draft until Save, which persists them to the work order
 * and returns to its detail page, where the primary action reflects the progress.
 */
import { ref, computed, watch } from 'vue'
import {
  MpBadge, MpButton, MpDatePicker, MpFormControl, MpFormErrorMessage, MpFormLabel,
  MpModal, MpModalBody, MpModalCloseButton, MpModalContent, MpModalFooter, MpModalHeader, MpModalOverlay,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatDate } from '~/utils/date'
import { workOrders, persistWorkOrders, type WorkOrderRoutingProgress } from '~/data/workOrders'
import { billOfMaterials } from '~/data/billOfMaterials'
import {
  canTrackRouting, isWithinWindow, routingEndWindow, routingStartWindow, routingStepsFor, undoRoutingStep,
  type RoutingStepStatus, type WorkOrderRoutingStep,
} from '~/data/workOrderRouting'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const wo = computed(() => workOrders.find(w => w.id === props.orderId))
const bom = computed(() => wo.value ? billOfMaterials.find(b => b.id === wo.value!.bomId) : undefined)
const woLabel = computed(() => wo.value ? `${t('Work order')} #${wo.value.number.split('-').pop()}` : '')

function goList() { router.push('/work-orders') }
function goDetail() { router.push(`/work-orders/${props.orderId}`) }

// ── Draft ────────────────────────────────────────────────────────────────────
const draft = ref<Record<string, WorkOrderRoutingProgress>>({})
watch(() => wo.value?.id, () => {
  draft.value = JSON.parse(JSON.stringify(wo.value?.routingProgress ?? {}))
}, { immediate: true })

const steps = computed(() => wo.value ? routingStepsFor(wo.value, bom.value, draft.value) : [])

const COLUMNS: { status: RoutingStepStatus; label: string }[] = [
  { status: 'not started', label: 'Not started' },
  { status: 'in progress', label: 'In progress' },
  { status: 'completed', label: 'Completed' },
]
const stepsIn = (status: RoutingStepStatus) => steps.value.filter(s => s.status === status)

function cancelAll() { draft.value = {} }
function undoStep(step: WorkOrderRoutingStep) { undoRoutingStep(draft.value, step.index) }
function save() {
  if (!wo.value) return
  wo.value.routingProgress = JSON.parse(JSON.stringify(draft.value))
  persistWorkOrders()
  toast.notify({ variant: 'success', title: t('Routing saved') })
  goDetail()
}

// ── Actual date modal (start and finish share it) ────────────────────────────
const dateModal = ref<{ mode: 'start' | 'finish'; step: WorkOrderRoutingStep } | null>(null)
const dateValue = ref('') // DD/MM/YYYY
const dateError = ref('')
const dateWindow = computed(() => {
  if (!dateModal.value || !wo.value) return null
  return dateModal.value.mode === 'start' ? routingStartWindow(wo.value) : routingEndWindow(dateModal.value.step)
})
const dateHint = computed(() => dateModal.value?.mode === 'start'
  ? t('You can only select dates from the work order start date until today.')
  : t('You can only select dates from the process start date until today.'))

function openDateModal(mode: 'start' | 'finish', step: WorkOrderRoutingStep) {
  dateModal.value = { mode, step }
  dateValue.value = ''
  dateError.value = ''
}
function closeDateModal() { dateModal.value = null }

function pad(n: number) { return String(n).padStart(2, '0') }
function isDateDisabled(date: Date): boolean {
  if (!dateWindow.value) return false
  return !isWithinWindow(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, dateWindow.value)
}
function confirmDate() {
  if (!dateModal.value || !dateWindow.value) return
  const m = dateValue.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) { dateError.value = t('Select a date.'); return }
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  if (!isWithinWindow(iso, dateWindow.value)) { dateError.value = dateHint.value; return }
  const { mode, step } = dateModal.value
  draft.value[step.index] = mode === 'start' ? { startDate: iso } : { startDate: step.startDate, endDate: iso }
  closeDateModal()
}

// ── Long descriptions collapse to three lines ────────────────────────────────
const DESCRIPTION_CLAMP = 120
const expanded = ref<Record<number, boolean>>({})
</script>

<template>
  <div v-if="wo" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="tr-breadcrumb">
          <button class="detail-breadcrumb" @click="goList">{{ t('Work orders') }}</button>
          <span class="tr-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goDetail">{{ woLabel }}</button>
        </nav>
        <h1 class="detail-title">{{ t('Track routing') }}</h1>
      </div>
      <div v-if="canTrackRouting(wo) && steps.length" class="tr-actions" data-devchange="wo-track-routing-page">
        <MpButton variant="secondary" is-rounded @click="cancelAll">{{ t('Cancel all processes') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <!-- Work order not trackable, or its BOM has no routing -->
      <div v-if="!canTrackRouting(wo) || !steps.length" class="tr-empty">
        <img src="/illustrations/empty-folder.png" alt="" width="288" height="240" />
        <p class="tr-empty-title">{{ canTrackRouting(wo) ? t('No routing to track') : t('Routing tracking is not available') }}</p>
        <p class="tr-empty-desc">
          {{ canTrackRouting(wo)
            ? t('This work order\'s bill of materials has no routing.')
            : t('Routing can only be tracked on a started work order with Track routing set to Yes.') }}
        </p>
        <MpButton variant="secondary" is-rounded @click="goDetail">{{ t('Back to work order') }}</MpButton>
      </div>

      <template v-else>
        <h2 class="tr-subject">{{ wo.number }} | {{ t('Work order') }} {{ wo.bomName }}</h2>
        <p class="tr-plan">{{ t('Production plan dates') }}: {{ formatDate(wo.planStartDate) }} - {{ formatDate(wo.planEndDate) }}</p>

        <div class="tr-board">
          <section v-for="col in COLUMNS" :key="col.status" class="tr-column">
            <header class="tr-column-head" :class="`tr-column-head--${col.status.replace(' ', '-')}`">
              <span class="tr-column-title">{{ t(col.label) }}</span>
              <MpBadge for="additionalInformation" type="announcement">{{ stepsIn(col.status).length }}</MpBadge>
            </header>
            <div class="tr-column-body">
              <article v-for="step in stepsIn(col.status)" :key="step.index" class="tr-card">
                <h3 class="tr-card-title">{{ step.process }}</h3>
                <div class="tr-card-body">
                  <ContentList :label="t('Plan dates')" :value="`${formatDate(step.planStart)} - ${formatDate(step.planEnd)}`" />
                  <div class="tr-card-dates">
                    <ContentList :label="t('Start date')" :value="step.startDate ? formatDate(step.startDate) : '—'" />
                    <ContentList :label="t('End date')" :value="step.endDate ? formatDate(step.endDate) : '—'" />
                  </div>
                  <ContentList :label="t('Description')">
                    <span
                      class="tr-card-desc"
                      :class="{ 'tr-card-desc--clamped': step.description.length > DESCRIPTION_CLAMP && !expanded[step.index] }"
                    >{{ step.description || '—' }}</span>
                    <button
                      v-if="step.description.length > DESCRIPTION_CLAMP"
                      class="tr-card-more"
                      @click="expanded[step.index] = !expanded[step.index]"
                    >{{ expanded[step.index] ? t('Show less') : t('Show more') }}</button>
                  </ContentList>
                </div>
                <footer class="tr-card-actions">
                  <MpButton v-if="step.status !== 'not started'" variant="ghost" is-rounded @click="undoStep(step)">{{ t('Cancel') }}</MpButton>
                  <MpButton v-if="step.status === 'not started'" variant="secondary" is-rounded class="tr-card-action-end" @click="openDateModal('start', step)">{{ t('Start process') }}</MpButton>
                  <MpButton v-if="step.status === 'in progress'" variant="secondary" is-rounded class="tr-card-action-end" @click="openDateModal('finish', step)">{{ t('Finish') }}</MpButton>
                </footer>
              </article>
            </div>
          </section>
        </div>
      </template>
    </div>

    <MpModal
      id="tr-date-modal" :is-open="!!dateModal" size="md" :is-keep-alive="false"
      :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="closeDateModal"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ dateModal?.mode === 'start' ? t('Start process') : t('Confirm process completion') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <ContentList horizontal :label="t('Process')" :value="dateModal?.step.process" />
          <MpFormControl id="tr-date" is-required :is-invalid="!!dateError" class="tr-date-field">
            <MpFormLabel>{{ dateModal?.mode === 'start' ? t('Actual start date') : t('Actual end date') }}</MpFormLabel>
            <MpDatePicker
              id="tr-date-picker" v-model="dateValue" format="DD/MM/YYYY" value-type="format"
              :placeholder="t('Select date')" use-portal :disabled-date="isDateDisabled"
              @update:model-value="dateError = ''"
            />
            <MpFormErrorMessage v-if="dateError">{{ dateError }}</MpFormErrorMessage>
            <p v-else class="tr-date-hint">{{ dateHint }}</p>
          </MpFormControl>
        </MpModalBody>
        <MpModalFooter>
          <div class="tr-modal-footer">
            <MpButton variant="ghost" is-rounded @click="closeDateModal">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="confirmDate">{{ dateModal?.mode === 'start' ? t('Start') : t('Finish process') }}</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <!-- Not found -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">{{ t('Work orders') }}</button>
        <h1 class="detail-title">{{ t('Work order not found') }}</h1>
      </div>
    </header>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}

.tr-breadcrumb { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.tr-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.tr-actions { display: flex; gap: var(--mp-spacing-2); flex-shrink: 0; }

.tr-subject { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tr-plan { margin: var(--mp-spacing-1) 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Board ── */
.tr-board { flex: 1 0 auto; display: grid; grid-template-columns: repeat(3, minmax(280px, 1fr)); gap: var(--mp-spacing-1); overflow-x: auto; }
.tr-column { display: flex; flex-direction: column; min-width: 0; border-radius: var(--mp-radii-md); background: var(--mp-background-neutral-subtle); }
.tr-column-head {
  display: flex; align-items: center; justify-content: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2); border-radius: var(--mp-radii-md) var(--mp-radii-md) 0 0;
}
.tr-column-head--not-started { background: var(--mp-background-information-subtle, #eaf1fb); }
.tr-column-head--in-progress { background: var(--mp-background-warning-subtle, #fef6e7); }
.tr-column-head--completed { background: var(--mp-background-success-subtle, #e7f5ef); }
.tr-column-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tr-column-body { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1); }

/* ── Card ── */
.tr-card { background: var(--mp-background-stage); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.tr-card-title {
  margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.tr-card-body { padding: var(--mp-spacing-1) var(--mp-spacing-3); }
.tr-card-dates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.tr-card-desc { display: block; white-space: pre-line; }
.tr-card-desc--clamped { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.tr-card-more { display: block; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.tr-card-more:hover { text-decoration: underline; text-underline-offset: 2px; }
.tr-card-actions { display: flex; align-items: center; padding: 0 var(--mp-spacing-3) var(--mp-spacing-3); }
.tr-card-action-end { margin-left: auto; }

/* ── Date modal ── */
.tr-date-field { margin-top: var(--mp-spacing-3); }
.tr-date-field :deep(.mp-datepicker__root) { width: 100%; }
.tr-date-hint { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.tr-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* ── Empty ── */
.tr-empty { margin: auto; display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); text-align: center; }
.tr-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tr-empty-desc { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
