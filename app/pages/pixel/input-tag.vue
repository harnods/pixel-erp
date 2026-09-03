<script setup lang="ts">
import { ref } from 'vue'
import { MpInputTag } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Input tag · Pixel 3 Enterprise' })
// data is DataInterface[] — { id, text, value }, not string[]
const tags = ref([
  { id: 't1', text: 'ERP', value: 'ERP', isInvalid: false, isReadOnly: false },
  { id: 't2', text: 'WMS', value: 'WMS', isInvalid: false, isReadOnly: false },
])
</script>
<template>
  <DemoCard title="Input tag" tag="MpInputTag"
    override="Multi-select tag input — never hand-roll chips."
    :rules="['rule/select-multi-mpinputtag']"
    snippet="// data is DataInterface[]: { id, text, value }
const tags = ref([{ id: 't1', text: 'ERP', value: 'ERP' }])
<MpInputTag id=&quot;x&quot; :data=&quot;tags&quot; is-enable-create-new-tag @change=&quot;…&quot; />">
    <MpInputTag id="px-tags" :data="tags" :is-enable-create-new-tag="true" placeholder="Add tag" />
  </DemoCard>
</template>
