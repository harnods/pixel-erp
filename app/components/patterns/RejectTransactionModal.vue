<script setup lang="ts">
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpTextarea, MpButton,
} from '@mekari/pixel3'

const props = defineProps<{
  isOpen: boolean
  docType: string
  /** Overrides the default "Reject {docType}?" title (e.g. bulk "Reject 3 requests?"). */
  title?: string
  /** Optional consequence sentence above the reason field. */
  description?: string
}>()

const emit = defineEmits<{
  close: []
  reject: [reason: string]
}>()

const MAX_CHARS = 256
const reason = ref('')
const touched = ref(false)

const charCount = computed(() => reason.value.length)
const isInvalid = computed(() => touched.value && reason.value.trim() === '')

const { t } = useLocale()
const title = computed(() => props.title ?? `Reject ${props.docType.toLowerCase()}?`)

function handleReject() {
  touched.value = true
  if (reason.value.trim() === '') return
  emit('reject', reason.value.trim())
}

function handleClose() {
  emit('close')
}

watch(() => props.isOpen, (open) => {
  if (!open) {
    reason.value = ''
    touched.value = false
  }
})
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="reject-transaction-modal"
    :is-open="isOpen"
    size="sm"
    :is-keep-alive="false"
    @close="handleClose"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ title }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p v-if="description" class="rtm-description">{{ description }}</p>
        <div class="rtm-field">
          <div class="rtm-label-row">
            <label class="rtm-label" for="reject-reason">
              {{ t('Reasons for rejection') }}<span class="rtm-required">*</span>
            </label>
            <span class="rtm-count">{{ charCount }} / {{ MAX_CHARS }}</span>
          </div>
          <MpTextarea
            id="reject-reason"
            v-model="reason"
            :maxlength="MAX_CHARS"
            :rows="4"
            is-full-width
            :is-invalid="isInvalid"
            placeholder=""
          />
          <p v-if="isInvalid" class="rtm-error">{{ t('This field is required.') }}</p>
          <p v-else class="rtm-helper">{{ t('Notes will be visible to your team.') }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="rtm-actions">
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="handleClose">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--danger" @click="handleReject">{{ t('Reject') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rtm-description {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.rtm-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.rtm-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
}

.rtm-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md, 20px);
}

.rtm-required {
  color: var(--mp-text-danger, #a8352d);
  margin-left: 2px;
}

.rtm-count {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}

.rtm-helper {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}

.rtm-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-danger, #a8352d);
  line-height: var(--mp-line-heights-sm, 16px);
}

.rtm-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  width: 100%;
}
</style>
