<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter,
  MpInput, MpInputTag, MpTextarea, MpCheckbox, MpButton, MpTextlink, MpIcon,
  type DataInterface,
} from '@mekari/pixel3'
import type jsPDF from 'jspdf'
import { useLocale } from '~/composables/useLocale'

const props = withDefaults(defineProps<{
  open: boolean
  doc?: jsPDF | null
  title?: string
  defaultTo?: string[]
  subject?: string
  body?: string
  senderEmail?: string
  attachmentName?: string
  attachmentSizeKB?: number
}>(), {
  doc: null,
  title: 'Document',
  defaultTo: () => [],
  subject: '',
  body: '',
  senderEmail: '',
  attachmentName: '',
  attachmentSizeKB: 0,
})

const emit = defineEmits<{
  close: []
  send: [payload: {
    to: string[]
    cc: string[]
    bcc: string[]
    subject: string
    body: string
    attach: boolean
    sendCopy: boolean
  }]
}>()

const { t } = useLocale()

// ── Tag-list state — MpInputTag speaks DataInterface[] (rule/select-multi-mpinputtag). ──
function toTagData(values: string[]): DataInterface[] {
  return values.map((v, i) => ({ text: v, id: `${i}-${v}`, value: v, isInvalid: false, isReadOnly: false }))
}
function tagValues(data: DataInterface[]): string[] {
  return data.map(d => String(d.value))
}

const to = ref<DataInterface[]>([])
const cc = ref<DataInterface[]>([])
const bcc = ref<DataInterface[]>([])
const subject = ref('')
const body = ref('')
const attach = ref(true)
const sendCopy = ref(true)
const showCc = ref(false)
const showBcc = ref(false)
const attachVisible = ref(true)

function onToChange(data: DataInterface[]) { to.value = data }
function onCcChange(data: DataInterface[]) { cc.value = data }
function onBccChange(data: DataInterface[]) { bcc.value = data }

const recipientCount = computed(() => to.value.length + cc.value.length + bcc.value.length)

const attachmentSizeLabel = computed(() => `${props.attachmentSizeKB.toFixed(1)} KB`)

// Reset every field from props each time the modal opens (rule: modal resets on open).
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  to.value = toTagData(props.defaultTo)
  cc.value = []
  bcc.value = []
  subject.value = props.subject
  body.value = props.body
  attach.value = true
  sendCopy.value = true
  showCc.value = false
  showBcc.value = false
  attachVisible.value = true
})

// ── PDF preview — blob URL scales past what a data: URI can render in an <iframe>. ──
const previewUrl = ref('')
let currentBlobUrl: string | null = null
function revokeCurrent() {
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null }
}
watch(() => props.doc, (doc) => {
  revokeCurrent()
  previewUrl.value = doc ? (currentBlobUrl = URL.createObjectURL(doc.output('blob'))) : ''
}, { immediate: true })
onUnmounted(revokeCurrent)

function onSend() {
  emit('send', {
    to: tagValues(to.value),
    cc: tagValues(cc.value),
    bcc: tagValues(bcc.value),
    subject: subject.value,
    body: body.value,
    attach: attach.value && attachVisible.value,
    sendCopy: sendCopy.value,
  })
  emit('close')
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="share-via-email-modal" :is-open="open" size="xl" :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Share via email') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="sve-body">
          <!-- LEFT: email form -->
          <div class="sve-form">
            <div class="sve-field">
              <label class="sve-label" for="sve-to">{{ t('To') }} *</label>
              <MpInputTag id="sve-to" :data="to" @change="onToChange" />
              <div class="sve-links">
                <MpTextlink v-if="!showCc" id="sve-add-cc" as="a" href="#" @click.prevent="showCc = true">{{ t('Add Cc') }}</MpTextlink>
                <MpTextlink v-if="!showBcc" id="sve-add-bcc" as="a" href="#" @click.prevent="showBcc = true">{{ t('Add Bcc') }}</MpTextlink>
              </div>
            </div>

            <div v-if="showCc" class="sve-field">
              <label class="sve-label" for="sve-cc">{{ t('Cc') }}</label>
              <MpInputTag id="sve-cc" :data="cc" @change="onCcChange" />
            </div>

            <div v-if="showBcc" class="sve-field">
              <label class="sve-label" for="sve-bcc">{{ t('Bcc') }}</label>
              <MpInputTag id="sve-bcc" :data="bcc" @change="onBccChange" />
            </div>

            <div class="sve-field">
              <label class="sve-label" for="sve-subject">{{ t('Subject') }} *</label>
              <MpInput id="sve-subject" v-model="subject" is-full-width />
            </div>

            <div class="sve-field">
              <label class="sve-label" for="sve-message">{{ t('Body') }} *</label>
              <MpTextarea id="sve-message" v-model="body" :rows="8" is-full-width />
            </div>

            <div class="sve-field">
              <MpCheckbox id="sve-attach" :is-checked="attach" @change="attach = !attach">{{ t('Attach file(s)') }}</MpCheckbox>
              <div v-if="attachVisible" class="sve-attachment">
                <MpIcon name="pdf" size="sm" />
                <span class="sve-attachment-name">{{ attachmentName }}</span>
                <span class="sve-attachment-size">{{ attachmentSizeLabel }}</span>
                <MpButton variant="ghost" is-rounded aria-label="Remove attachment" @click="attachVisible = false">
                  <MpIcon name="close" size="sm" />
                </MpButton>
              </div>
            </div>

            <div class="sve-field">
              <MpCheckbox id="sve-copy" :is-checked="sendCopy" @change="sendCopy = !sendCopy">{{ t('Send me a copy') }}</MpCheckbox>
              <span class="sve-sender">{{ senderEmail }}</span>
            </div>
          </div>

          <!-- RIGHT: single-column PDF preview (NO thumbnail rail) -->
          <div class="sve-preview">
            <div class="sve-preview-bar">
              <MpIcon name="burger" size="sm" class="sve-preview-burger" />
              <span class="sve-preview-title">{{ title }}</span>
            </div>
            <iframe v-if="previewUrl" :src="previewUrl" class="sve-preview-frame" title="PDF preview" />
            <div v-else class="sve-preview-frame sve-preview-blank" />
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="sve-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="onSend">{{ t('Send email') }} ({{ recipientCount }})</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.sve-body {
  display: flex;
  align-items: stretch;
  gap: var(--mp-spacing-4, 16px);
}
.sve-form {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 64vh;
  max-height: 64vh;
  overflow-y: auto;
  padding: var(--mp-spacing-1, 4px);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4, 16px);
}
.sve-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1, 4px);
}
.sve-label {
  font-size: var(--mp-font-sizes-sm, 14px);
  font-weight: var(--mp-font-weights-semibold, 600);
  color: var(--mp-text-default);
}
.sve-links {
  display: flex;
  gap: var(--mp-spacing-3, 12px);
  margin-top: var(--mp-spacing-1, 4px);
}
.sve-attachment {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  margin-top: var(--mp-spacing-1, 4px);
  color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm, 14px);
}
.sve-attachment-name {
  color: var(--mp-text-default);
}
.sve-attachment-size {
  color: var(--mp-text-subtle, #67707b);
  margin-inline-start: auto;
}
.sve-sender {
  margin-top: var(--mp-spacing-1, 4px);
  color: var(--mp-text-subtle, #67707b);
  font-size: var(--mp-font-sizes-sm, 14px);
}
.sve-preview {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 64vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md, 8px);
  overflow: hidden;
}
.sve-preview-bar {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px);
  background: var(--mp-background-inverse, #080d0e);
  color: var(--mp-colors-white, #ffffff);
}
.sve-preview-burger {
  color: var(--mp-colors-white, #ffffff);
}
.sve-preview-title {
  font-size: var(--mp-font-sizes-sm, 14px);
  font-weight: var(--mp-font-weights-semibold, 600);
  color: var(--mp-colors-white, #ffffff);
}
.sve-preview-frame {
  display: block;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 420px;
  border: 0;
}
.sve-preview-blank {
  background: var(--mp-colors-white, #ffffff);
}
.sve-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  width: 100%;
}
</style>
