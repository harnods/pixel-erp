<script setup lang="ts">
import { ref } from 'vue'
import { MpInputTag } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Input tag · Pixel 3 Enterprise' })
const tags = ref([
  { id: 't1', text: 'ERP', value: 'ERP', isInvalid: false, isReadOnly: false },
  { id: 't2', text: 'WMS', value: 'WMS', isInvalid: false, isReadOnly: false },
])
</script>
<template>
  <div>
    <DemoHeader title="Input tag" tag="MpInputTag" override="Use this for any multi-select chip input."
      lead="Multi-select / free-entry tag field. data is DataInterface[] ({ id, text, value }) — never a plain string[]. Never hand-roll toggle chips."
      :rules="['rule/select-multi-mpinputtag']" />
    <DemoSection title="Default"
      desc="Pass data as DataInterface[]; set is-enable-create-new-tag to allow free entry."
      :rules="['rule/select-multi-mpinputtag']"
      code="const tags = ref([{ id: 't1', text: 'ERP', value: 'ERP' }])
<MpInputTag id=&quot;x&quot; :data=&quot;tags&quot; is-enable-create-new-tag @change=&quot;…&quot; />">
      <div style="width:100%; max-width:24rem"><MpInputTag id="px-it" :data="tags" :is-enable-create-new-tag="true" placeholder="Add tag" /></div>
    </DemoSection>
  </div>
</template>
