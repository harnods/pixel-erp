<script setup lang="ts">
/**
 * CRM quick-add contact modal — a short create form invoked from the deal form's
 * Contact picker (the "+ New contact" / "Add '<x>' as new contact" popover action).
 * Fields: Display name, Full name (Mr/Mrs/Ms + name), Email, Mobile. Saving creates
 * a real CRM contact (crmContactPeople) and emits it so the caller can select it.
 * Closes only via × / Cancel (rule/modal-drawer-close-explicit-only).
 */
import { reactive, watch } from 'vue'
import { MpModal, MpModalOverlay, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { addCrmContactPerson, CRM_OWNERS, type CrmContactPerson } from '~/data/crm'
import { TITLE_OPTIONS } from '~/data/contacts'

const props = defineProps<{ open: boolean; initialName?: string }>()
const emit = defineEmits<{ close: []; created: [contact: CrmContactPerson] }>()
const { t } = useLocale()

const titleOptions = TITLE_OPTIONS.map(o => ({ value: o, label: o }))
const form = reactive({ displayName: '', title: TITLE_OPTIONS[0] ?? 'Mr', fullName: '', email: '', mobile: '' })
const nameError = ref(false)

// Reset + seed Display name from the search text each time the modal opens.
watch(() => props.open, (open) => {
  if (!open) return
  form.displayName = (props.initialName ?? '').trim()
  form.title = TITLE_OPTIONS[0] ?? 'Mr'
  form.fullName = ''
  form.email = ''
  form.mobile = ''
  nameError.value = false
})

function onSave() {
  if (!form.displayName.trim()) { nameError.value = true; return }
  const contact = addCrmContactPerson({
    name: form.displayName.trim(),
    fullName: `${form.title} ${form.fullName}`.trim(),
    jobTitle: '',
    email: form.email.trim(),
    phone: form.mobile.trim(),
    companyIds: [],
    owner: CRM_OWNERS[0] ?? 'You',
    emails: form.email.trim() ? [form.email.trim()] : [],
    phones: form.mobile.trim() ? [form.mobile.trim()] : [],
  }, new Date().toISOString())
  emit('created', contact)
}
</script>

<template>
  <MpModal :is-open="open" @close="emit('close')">
    <MpModalOverlay />
    <MpModalContent>
      <MpModalHeader>{{ t('New contact') }}</MpModalHeader>
      <MpModalBody>
        <div class="qc-form">
          <MpFormControl id="qc-display" is-required :is-invalid="nameError">
            <MpFormLabel>{{ t('Display name') }}</MpFormLabel>
            <MpInput id="qc-display-inp" v-model="form.displayName" is-full-width :is-invalid="nameError" :placeholder="t('Display name')" @update:model-value="nameError = false" />
            <MpFormErrorMessage>{{ t('Display name is required') }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="qc-fullname">
            <MpFormLabel>{{ t('Full name') }}</MpFormLabel>
            <div class="qc-fullname-row">
              <ErpFilterSelect id="qc-title" class="qc-title" :model-value="form.title" :options="titleOptions" :is-clearable="false" @update:model-value="(v: string) => form.title = v" />
              <MpInput id="qc-fullname-inp" v-model="form.fullName" is-full-width :placeholder="t('Full name')" />
            </div>
          </MpFormControl>

          <MpFormControl id="qc-email">
            <MpFormLabel>{{ t('Email') }}</MpFormLabel>
            <MpInput id="qc-email-inp" v-model="form.email" type="email" is-full-width />
          </MpFormControl>

          <MpFormControl id="qc-mobile">
            <MpFormLabel>{{ t('Mobile') }}</MpFormLabel>
            <MpInput id="qc-mobile-inp" v-model="form.mobile" is-full-width />
          </MpFormControl>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButton class="btn-enterprise--ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ t('Add contact') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.qc-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.qc-fullname-row { display: flex; gap: var(--mp-spacing-3); }
.qc-title { flex: 0 0 96px; }
</style>
