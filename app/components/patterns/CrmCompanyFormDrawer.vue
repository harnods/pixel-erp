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
  <Teleport to="body">
    <Transition name="ccd">
      <div v-if="isOpen" class="ccd-overlay">
        <div class="ccd-panel" role="dialog" :aria-label="t('New company')">
          <header class="ccd-header">
            <span class="ccd-title">{{ t('New company') }}</span>
            <MpButton class="ccd-close" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="ccd-body">
            <!-- key on isOpen so the form remounts fresh (and re-reads initialName) each open -->
            <CrmCompanyForm :key="String(isOpen)" ref="formRef" :show-contact-select="showContactSelect" :initial-name="initialName" />
          </div>

          <footer class="ccd-footer">
            <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ccd-enter-active, .ccd-leave-active { transition: background-color 250ms ease; }
.ccd-enter-from, .ccd-leave-to { background-color: transparent; }
.ccd-enter-active .ccd-panel { transition: transform 350ms ease-out; }
.ccd-leave-active .ccd-panel { transition: transform 250ms ease-in; }
.ccd-enter-from .ccd-panel, .ccd-leave-to .ccd-panel { transform: translateX(calc(100% + 12px)); }

.ccd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.ccd-panel { margin: var(--mp-spacing-3); width: min(600px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.ccd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ccd-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ccd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.ccd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.ccd-body { flex: 1; overflow-y: auto; overflow-x: hidden; padding: var(--mp-spacing-5); }
.ccd-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-5); background: var(--mp-background-stage, #ffffff); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
</style>
