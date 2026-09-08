<script setup lang="ts">
/**
 * CrmDealStageModal — change a deal's Stage (single record or bulk selection),
 * enforcing the PRD Stage rules in the UI:
 *  • → Lost requires a Lost Reason (captured here, stored in transition history).
 *  • → Won shows the irreversible-change warning.
 *  • A preset/locked target (kanban drop) skips the picker.
 * The store (moveDealStage / bulkChangeStage) is the source of truth for terminal
 * Won + Lost-reopen validation; this modal only gathers input + confirmation.
 *
 * Built on Pixel MpModal (rule/all-modals-mpmodal). Footer Cancel = ghost
 * (rule/btn-cancel-ghost); errors render inline (rule/form-errors-inline).
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton, MpButtonGroup, MpIcon,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { DEAL_STAGES, type DealStage } from '~/data/crm'

const props = withDefaults(defineProps<{
  open: boolean
  /** How many deals this affects (1 for a single record, N for bulk). */
  count?: number
  /** Fix the target stage (kanban drop) — hides the picker. */
  presetStage?: DealStage | null
  /** Restrict the picker options (e.g. reopen → ongoing only). */
  allowedStages?: DealStage[]
}>(), { count: 1, presetStage: null })

const emit = defineEmits<{ close: []; confirm: [payload: { stage: DealStage; lostReason?: string }] }>()

const stage = ref<DealStage>('Open Lead')
const lostReason = ref('')
const error = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  stage.value = props.presetStage ?? props.allowedStages?.[0] ?? 'Open Lead'
  lostReason.value = ''
  error.value = ''
})

const options = computed<DealStage[]>(() => props.allowedStages ?? [...DEAL_STAGES])
const isLost = computed(() => stage.value === 'Lost')
const isWon = computed(() => stage.value === 'Won')
const title = computed(() => (props.count > 1 ? `Change stage for ${props.count} deals` : 'Change stage'))

function confirm() {
  if (isLost.value && !lostReason.value.trim()) { error.value = 'A Lost reason is required.'; return }
  emit('confirm', { stage: stage.value, lostReason: isLost.value ? lostReason.value.trim() : undefined })
}
</script>

<template>
  <MpModal id="crm-deal-stage-modal" :is-open="open" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="emit('close')">
    <MpModalContent>
      <MpModalHeader>{{ title }}</MpModalHeader>
      <MpModalBody>
        <div class="dsm-body">
          <div v-if="!presetStage" class="dsm-field">
            <span class="dsm-label">Stage</span>
            <ErpFilterSelect id="dsm-stage" :model-value="stage" placeholder="Select stage" :options="options" :is-clearable="false" width="100%" @update:model-value="(v: string) => { stage = v as DealStage; error = '' }" />
          </div>
          <p v-else class="dsm-preset">Move {{ count > 1 ? `${count} deals` : 'this deal' }} to <strong>{{ presetStage }}</strong>.</p>

          <div v-if="isWon" class="dsm-banner dsm-banner--warn">
            <MpIcon name="info" size="md" variant="fill" />
            <span>Won is a terminal stage. Once a deal is Won it cannot be moved to another stage.</span>
          </div>

          <div v-if="isLost" class="dsm-field">
            <span class="dsm-label">Lost reason</span>
            <textarea v-model="lostReason" class="dsm-textarea" rows="3" @input="error = ''" />
            <span v-if="error" class="dsm-err">{{ error }}</span>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ isWon ? 'Mark as Won' : 'Change stage' }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.dsm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.dsm-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dsm-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dsm-preset { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.dsm-textarea { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; resize: vertical; min-height: 72px; line-height: var(--mp-line-heights-md); font-family: inherit; }
.dsm-textarea:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: 0 0 0 3px var(--mp-background-neutral-hovered, rgba(140, 149, 150, 0.24)); }
.dsm-err { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c9372c); }
.dsm-banner { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); background: var(--mp-background-warning-subtle, #fef6e7); border: 1px solid var(--mp-border-warning, #f5c26b); color: var(--mp-text-warning, #b54708); }
</style>
