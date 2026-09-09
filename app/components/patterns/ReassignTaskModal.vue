<script setup lang="ts">
/**
 * "Change assignee" — hand a warehouse task to someone else.
 *
 * The escape hatch for a task still held by someone who has lost access to the
 * company: the work is sitting there, nobody is coming back for it, and a warehouse
 * manager needs to clear it without waiting. That's why the current holder is named
 * even when they've left — "Unassigned" alone doesn't tell the manager whose queue
 * this was stuck in.
 *
 * Candidates are the warehouse's own operators, not every user in the company: a
 * task can only be done by someone on that floor. Whoever holds it now is excluded —
 * picking them again isn't a handover.
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpAutocomplete,
} from '@mekari/pixel3'
import { getWarehouseOperators } from '~/data/warehouseTeam'
import { isActiveUserName } from '~/data/users'

const props = defineProps<{
  open: boolean
  /** Task number, shown so the manager can see which task they're handing over. */
  taskNo: string
  /** Who holds it now — may be someone who has already left the company. */
  currentAssignee: string
  /** Candidates come from this warehouse's team. */
  warehouseId: string
}>()
const emit = defineEmits<{
  'update:open': [boolean]
  /** The chosen person. The page performs the write, so each task type keeps its
   *  own rules (and its own toast) rather than this modal knowing about five stores. */
  'reassign': [assignee: string]
}>()

const { t } = useLocale()

const assignee = ref('')
const error = ref('')

/** The warehouse's operators, minus whoever holds the task now. */
const options = computed(() =>
  getWarehouseOperators(props.warehouseId)
    .map((m) => m.name)
    .filter((name) => name !== props.currentAssignee)
    .map((name) => ({ label: name, value: name })),
)

// The holder has left the company, so their name no longer resolves to a user.
// Say that plainly — it's the whole reason this dialog exists.
const holderLeft = computed(() => !!props.currentAssignee && !isActiveUserName(props.currentAssignee))

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  assignee.value = ''
  error.value = ''
})

function close() {
  emit('update:open', false)
}

function save() {
  if (!assignee.value) {
    error.value = t('Select an assignee')
    return
  }
  emit('reassign', assignee.value)
  close()
}
</script>

<template>
  <MpModal
    id="wms-reassign-task" :is-open="open" size="sm"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Change assignee') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="rtm-intro">
          {{ t('Task') }} <strong>{{ props.taskNo }}</strong>
          <template v-if="props.currentAssignee">
            — {{ t('currently assigned to') }} <strong>{{ props.currentAssignee }}</strong>
          </template>
        </p>
        <p v-if="holderLeft" class="rtm-note">
          {{ t('This person no longer has access to the company. Reassign the task to keep it moving.') }}
        </p>

        <MpFormControl :is-invalid="!!error">
          <MpFormLabel for="rtm-assignee" is-required>{{ t('New assignee') }}</MpFormLabel>
          <MpAutocomplete
            id="rtm-assignee"
            v-model="assignee"
            :data="options"
            label-prop="label"
            value-prop="value"
            is-searchable use-portal is-full-width
            :placeholder="t('Select assignee')"
            @update:model-value="error = ''"
          />
          <MpFormErrorMessage v-if="error">{{ error }}</MpFormErrorMessage>
        </MpFormControl>
        <p v-if="!options.length" class="rtm-note">
          {{ t('No other operator is on this warehouse team yet.') }}
        </p>
      </MpModalBody>
      <MpModalFooter>
        <div class="rtm-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!options.length" @click="save">{{ t('Save') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rtm-intro {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  margin-bottom: var(--mp-spacing-3);
}
.rtm-note {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  margin-top: var(--mp-spacing-2);
}
.rtm-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  width: 100%;
}
</style>
