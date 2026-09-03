<script setup lang="ts">
import { ref } from 'vue'
import { MpButton, MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Modal · Pixel 3 Enterprise' })
const open = ref(false)
</script>
<template>
  <DemoCard title="Modal" tag="MpModal"
    override="All modals use MpModal (ghost Cancel + pill confirm)."
    :rules="['rule/modal-use-mpmodal']"
    snippet="<MpModal id=&quot;x&quot; :is-open=&quot;open&quot; size=&quot;md&quot; @close=&quot;open=false&quot;>
  <MpModalContent><MpModalHeader>…<MpModalCloseButton /></MpModalHeader>
    <MpModalBody>…</MpModalBody>
    <MpModalFooter>…</MpModalFooter></MpModalContent>
</MpModal>">
    <MpButton variant="primary" is-rounded @click="open = true">Open modal</MpButton>
    <MpModal id="px-modal" :is-open="open" size="md" @close="open = false">
      <MpModalContent>
        <MpModalHeader>Confirm action<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>This is a Pixel modal body.</MpModalBody>
        <MpModalFooter>
          <MpButton variant="ghost" is-rounded @click="open = false">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="open = false">Confirm</MpButton>
        </MpModalFooter>
      </MpModalContent>
    </MpModal>
  </DemoCard>
</template>
