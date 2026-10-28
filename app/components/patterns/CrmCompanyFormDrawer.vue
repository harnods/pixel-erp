<script setup lang="ts">
/**
 * CrmCompanyFormDrawer — quick-add a company inline from the contact form.
 * Custom Teleport overlay shell (rule/drawer-custom-shell); as a form drawer it
 * ignores overlay clicks — close only via ×, Cancel, or Save. Wraps the SAME
 * <CrmCompanyForm> as the New-company page, minus the "Contact person" picker
 * (the contact being created is the association). Emits `created` with the new
 * company so the caller can select it.
 */
import { ref } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import CrmCompanyForm from '~/components/patterns/CrmCompanyForm.vue'
import { type CrmCompany } from '~/data/crm'

const props = defineProps<{ isOpen: boolean; initialName?: string; showContactSelect?: boolean }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'created', v: CrmCompany): void
}>()

const { t } = useLocale()
const formRef = ref<InstanceType<typeof CrmCompanyForm> | null>(null)

function close() { emit('update:isOpen', false) }
function save() {
  const created = formRef.value?.submit()
  if (!created) return
  emit('created', created)
  emit('update:isOpen', false)
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="t('New company')" width="600px" @close="close">
    <template #body>
      <!-- key on isOpen so the form remounts fresh (and re-reads initialName) each open -->
      <CrmCompanyForm :key="String(isOpen)" ref="formRef" :show-contact-select="showContactSelect" :initial-name="initialName" />
    </template>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
</style>
