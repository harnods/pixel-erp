<script setup lang="ts">
/**
 * CrmDealOwnerModal — reassign the Deal Owner for a single record or a bulk
 * selection (PRD Bulk owner reassignment). Confirmation shows the affected count
 * and the new owner. Built on Pixel MpModal; Cancel = ghost; errors inline.
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { CRM_OWNERS } from '~/data/crm'

const props = withDefaults(defineProps<{ open: boolean; count?: number }>(), { count: 1 })
const emit = defineEmits<{ close: []; confirm: [owner: string] }>()

const owner = ref<string>('')
const error = ref('')
watch(() => props.open, (open) => { if (open) { owner.value = ''; error.value = '' } })

const title = computed(() => (props.count > 1 ? `Change owner for ${props.count} deals` : 'Change owner'))
function confirm() {
  if (!owner.value) { error.value = 'Select a new owner.'; return }
  emit('confirm', owner.value)
}
</script>

<template>
  <MpModal id="crm-deal-owner-modal" :is-open="open" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="emit('close')">
    <MpModalContent>
      <MpModalHeader>{{ title }}</MpModalHeader>
      <MpModalBody>
        <div class="dom-field">
          <span class="dom-label">New owner</span>
          <ErpFilterSelect id="dom-owner" :model-value="owner" placeholder="Select an owner" :options="[...CRM_OWNERS]" :is-clearable="false" width="100%" @update:model-value="(v: string) => { owner = v; error = '' }" />
          <span v-if="error" class="dom-err">{{ error }}</span>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">Change owner</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.dom-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dom-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dom-err { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c9372c); }
</style>
