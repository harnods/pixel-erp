<script setup lang="ts">
/*
 * Complete shipment — was a modal on Shipment details, now a full page form
 * (same shell/behaviour as New shipment / Handover to courier). Records the
 * proof-of-delivery details and posts the shipment (stock deducted, reservation
 * consumed) via completeShipment.
 */
import { ref, computed } from 'vue'
import {
  MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpTextarea, MpDatePicker, MpIcon, toast,
} from '@mekari/pixel3'
import { getShipment, completeShipment } from '~/data/deliveryTasks'

const props = defineProps<{ orderId: string }>() // orderId = shipment seq
const router = useRouter()

const shipment = computed(() => getShipment(props.orderId))

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

const receivedDate = ref(todayDisplay)
const receivedBy = ref('')
const receivedByError = ref('')
const note = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])
const isSaving = ref(false)

function onFileChange(ev: Event) {
  const files = (ev.target as HTMLInputElement).files
  for (const f of Array.from(files ?? [])) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

function goBack() { router.push(`/outbound-delivery/shipment/${props.orderId}`) }

async function handleSave() {
  const s = shipment.value
  if (!s) return
  // A canceled delivery must be acknowledged (detached) first — guards direct URL
  // access; the Shipment details button already blocks this path.
  if (s.needsCancelAck) {
    toast.notify({ variant: 'error', title: 'Acknowledge the canceled order before completing this shipment', maxWidth: 'max-content' })
    goBack()
    return
  }
  if (!receivedBy.value.trim()) { receivedByError.value = 'You must fill in received by'; return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  completeShipment(s.shipmentSeq, {
    receivedDate: toISODate(receivedDate.value),
    receivedBy: receivedBy.value.trim(),
    note: note.value.trim() || undefined,
    proofFile: attachedFiles.value[0]?.name,
  })
  toast.notify({ variant: 'success', title: 'Shipment completed', maxWidth: 'max-content' })
  goBack()
}
</script>

<template>
  <div v-if="shipment" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goBack">{{ shipment.shipmentNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Complete shipment</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <div class="cs-form">
        <MpFormControl id="cs-received-date" is-required class="cs-field">
          <MpFormLabel>Date received</MpFormLabel>
          <div class="cs-datepicker">
            <MpDatePicker id="cs-received-date-dp" v-model="receivedDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>

        <MpFormControl id="cs-received-by" is-required :is-invalid="!!receivedByError" class="cs-field">
          <MpFormLabel>Received by</MpFormLabel>
          <MpInput
            id="cs-received-by-input" v-model="receivedBy" placeholder="Recipient name" is-full-width
            @update:model-value="receivedByError = ''"
          />
          <MpFormErrorMessage>{{ receivedByError }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="cs-note" class="cs-field">
          <MpFormLabel>Note</MpFormLabel>
          <MpTextarea id="cs-note-textarea" v-model="note" is-full-width :rows="3" />
        </MpFormControl>

        <MpFormControl id="cs-attachment" class="cs-field">
          <MpFormLabel>Attachment</MpFormLabel>
          <div class="cs-attachment">
            <input ref="fileInput" type="file" accept=".pdf,.jpg,.jpeg,.png" class="cs-file-hidden" @change="onFileChange" />
            <div class="cs-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">Choose file</MpButton>
              <span class="cs-attach-or">or drag and drop here</span>
            </div>
            <ul v-if="attachedFiles.length" class="cs-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="cs-file-item">
                <span class="cs-file-name">{{ f.name }}</span>
                <button class="cs-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="close" size="xs" /></button>
              </li>
            </ul>
          </div>
        </MpFormControl>
      </div>
    </div>

    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Complete shipment' }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell (mirrors New shipment / Handover) ───────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}

/* ── Form ───────────────────────────────────────────────────────────────────── */
.cs-form { max-width: 558px; }
.cs-field { margin-bottom: var(--mp-spacing-4); }
.cs-datepicker :deep(.mp-date-picker) { width: 100%; }
.cs-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cs-file-hidden { display: none; }
.cs-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cs-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cs-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.cs-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.cs-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.cs-file-remove:hover { color: var(--mp-text-default); }
</style>
