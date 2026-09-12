<script setup lang="ts">
import { ref } from 'vue'
import { MpButton, MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Modal · Pixel 3 Enterprise' })
const open = ref(false)
</script>
<template>
  <div>
    <DemoHeader title="Modal" tag="MpModal"
      lead="A blocking dialog for a short decision or focused form. Footer = ghost Cancel + pill primary. For alert/confirm, align to top (ConfirmModal)."
      :rules="['rule/modal-use-mpmodal', 'rule/modal-alert-top-align']" />
    <DemoSection title="Default"
      desc="Control with :is-open + @close. Content > Header (+CloseButton) / Body / Footer."
      :rules="['rule/modal-use-mpmodal']"
      code="<MpModal id=&quot;x&quot; :is-open=&quot;open&quot; size=&quot;md&quot; @close=&quot;open=false&quot;>
  <MpModalContent>
    <MpModalHeader>Title<MpModalCloseButton /></MpModalHeader>
    <MpModalBody>…</MpModalBody>
    <MpModalFooter>
      <MpButton variant=&quot;ghost&quot; is-rounded @click=&quot;open=false&quot;>Cancel</MpButton>
      <MpButton variant=&quot;primary&quot; is-rounded>Confirm</MpButton>
    </MpModalFooter>
  </MpModalContent>
</MpModal>">
      <MpButton variant="primary" is-rounded @click="open = true">Open modal</MpButton>
      <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="px-modal" :is-open="open" size="md" @close="open = false">
        <MpModalContent>
          <MpModalHeader>Confirm action<MpModalCloseButton /></MpModalHeader>
          <MpModalBody>This is a Pixel modal body.</MpModalBody>
          <MpModalFooter>
            <MpButton variant="ghost" is-rounded @click="open = false">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="open = false">Confirm</MpButton>
          </MpModalFooter>
        </MpModalContent>
      </MpModal>
    </DemoSection>
  </div>
</template>
