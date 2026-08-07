<script setup lang="ts">
/**
 * UnclassifiedReviewPage — "Other documents" (Figma 4712:75758).
 *
 * The terminal case of the review queue: OCR couldn't tell what the file is, so
 * there's no form to fill — just the three things you can do with a document
 * that doesn't belong to any transaction. Chrome comes from FileReviewShell.
 */
import { ref, computed, watch } from 'vue'
import {
  MpRadio, MpAutocomplete, MpFormControl, MpFormLabel, MpFormErrorMessage, toast,
  MpIcon, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import FileReviewShell from '~/components/patterns/FileReviewShell.vue'
import { useReviewQueue } from '~/composables/useReviewQueue'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const { queue, index, backLabel, queueBase, goBack, removeFromQueue, goToNext } = useReviewQueue(() => props.orderId)
const isLastFile = computed(() => index.value === queue.value.length - 1)

// ── Scenario state (dev FAB) ─────────────────────────────────────────────────
type Scenario = 'default' | 'unreadable'
const scenario = ref<Scenario>('default')
const scenarios: { value: Scenario; label: string }[] = [
  { value: 'default',    label: t('Unclassified') },
  { value: 'unreadable', label: t('Error - file unreadable') },
]

type Action = 'attach' | 'file_manager' | 'delete'
const ACTIONS: { value: Action; label: string }[] = [
  { value: 'attach',       label: t('Add as an attachment to other documents') },
  { value: 'file_manager', label: t('Save to file manager') },
  { value: 'delete',       label: t('Delete') },
]
const action = ref<Action | ''>('')

const file = computed(() => queue.value.find((rf) => rf.id === props.orderId) ?? queue.value[0])

/** Attaching needs a host document — the other files in this review run, since
 *  those are the transactions this one could belong to. */
const documentId = ref('')
const documentError = ref(false)
const documentOptions = computed(() =>
  queue.value
    .filter((rf) => rf.id !== props.orderId && rf.classification !== 'unclassified')
    .map((rf) => ({ id: rf.id, name: rf.file })),
)
// Switching away from "attach" drops the half-made choice rather than keeping it
// primed for a later re-select.
watch(action, (a) => {
  if (a !== 'attach') { documentId.value = ''; documentError.value = false }
})

/** Every action ends the same way — the file leaves the queue and we move on.
 *  None of the three destinations (attachments, file manager, trash) exist as
 *  surfaces yet, so the outcome is reported by toast only. */
function handleSave() {
  if (!action.value) return
  // Attaching is the one action that needs a target before it can go anywhere.
  if (action.value === 'attach' && !documentId.value) { documentError.value = true; return }
  const label = ACTIONS.find((a) => a.value === action.value)!.label
  const next = goToNext()
  removeFromQueue(props.orderId)
  toast.notify({ variant: 'success', title: label, rootProps: { class: 'toast-enterprise' } })
  next()
}
</script>

<template>
  <FileReviewShell
    :queue="queue" :file-id="props.orderId"
    :back-label="backLabel" :queue-base="queueBase"
    :is-unreadable="scenario === 'unreadable'"
    :preview-images="['/illustrations/ocr/other-document.png']"
    @back="goBack"
  >
    <div class="uc-body">
      <h2 class="br-section-title">{{ t('Other documents') }}</h2>
      <p class="uc-desc">{{ t("This document couldn't be classified. Select one action to continue.") }}</p>

      <div class="uc-actions">
        <div v-for="a in ACTIONS" :key="a.value" class="uc-action-group">
          <label class="uc-action">
            <MpRadio
              :id="`uc-action-${a.value}`"
              name="uc-action"
              :value="a.value"
              :is-checked="action === a.value"
              @change="action = a.value"
            />
            <span>{{ a.label }}</span>
          </label>

          <!-- Which document to attach to — the rest of this review run -->
          <MpFormControl
            v-if="a.value === 'attach' && action === 'attach'"
            id="uc-document" class="uc-action-field" is-required :is-invalid="documentError"
          >
            <MpFormLabel>{{ t('Document') }}</MpFormLabel>
            <MpAutocomplete
              id="uc-document-ac" v-model="documentId" :data="documentOptions"
              label-prop="name" value-prop="id" is-searchable use-portal is-full-width
              :placeholder="t('Select document')"
              :is-invalid="documentError"
              @update:model-value="documentError = false"
            />
            <MpFormErrorMessage>{{ t('You must select document') }}</MpFormErrorMessage>
          </MpFormControl>
        </div>
      </div>
    </div>

    <footer class="ex-footer">
      <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--secondary" @click="goToNext()()">{{ t('Skip without saving') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" :disabled="!action" @click="handleSave">{{ isLastFile ? t('Save') : t('Save & next') }}</button>
    </footer>

    <template #overlays>
      <!-- ── Demo scenario FAB — same component as the other review pages ── -->
      <MpPopover id="uc-demo-fab" is-close-on-select use-portal placement="top-end">
        <MpPopoverTrigger>
          <MpButton class="demo-fab" :aria-label="t('Change scenario state')">
            <MpIcon name="sliders" size="md" color="icon.inverse" />
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
          <p class="demo-fab-heading">{{ t('Scenario state') }}</p>
          <MpPopoverList>
            <MpPopoverListItem
              v-for="s in scenarios" :key="s.value"
              :is-active="s.value === scenario" @click="scenario = s.value"
            >{{ s.label }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>
  </FileReviewShell>
</template>

<style scoped>
.uc-body { display: flex; flex-direction: column; }
/* Same section-title treatment the other review pages use for "Expense",
   "Invoice", "Payment Receipt". */
.br-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl); color: var(--mp-text-default);
}
.uc-desc {
  margin: var(--mp-spacing-1) 0 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
}
.uc-actions { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-4); }
.uc-action-group { display: flex; flex-direction: column; }
/* No gap — MpRadio renders its own 12px control-to-label gap internally */
.uc-action {
  display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
/* Indented to line up under the radio's label, past the 16px control + 12px gap */
.uc-action-field {
  width: var(--ex-field-width, 318px);
  margin: var(--mp-spacing-2) 0 var(--mp-spacing-2) var(--mp-spacing-8, 32px);
}

.ex-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding-top: var(--mp-spacing-6); padding-bottom: var(--mp-spacing-6);
}
.ex-footer .btn-enterprise:disabled {
  background: var(--mp-background-disabled, #f0f1f3);
  border-color: var(--mp-background-disabled, #f0f1f3);
  color: var(--mp-text-disabled, #9aa4b2);
  cursor: not-allowed;
}

/* ── Demo scenario FAB — mirrors the other review pages' .demo-fab ────────── */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  padding: 0 !important; min-width: 0 !important;
  display: inline-flex !important; align-items: center; justify-content: center;
  border: none !important; border-radius: var(--mp-radii-full, 999px) !important;
  background: var(--mp-background-inverse) !important; color: var(--mp-text-inverse);
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2); /* pixel-police-allow-shadow: floating FAB trigger */
}
.demo-fab:hover { opacity: 0.9; background: var(--mp-background-inverse) !important; }
.demo-fab-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
</style>
