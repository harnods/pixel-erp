<script setup lang="ts">
import { ref } from 'vue'
import { MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpText } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Input group · Pixel 3 Enterprise' })
const a = ref(''); const b = ref('')
</script>
<template>
  <div>
    <DemoHeader title="Input group" tag="MpInputGroup"
      lead="Attach a left/right addon (prefix/suffix) to an input — currency, unit, protocol, etc. Use has-background for a filled addon." />
    <DemoSection title="Left addon"
      desc="Prefix such as a currency symbol."
      code="<MpInputGroup id=&quot;g&quot;>
  <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
  <MpInput id=&quot;x&quot; v-model=&quot;v&quot; />
</MpInputGroup>">
      <MpInputGroup id="px-ig1" style="max-width:20rem">
        <MpInputLeftAddon has-background><MpText weight="semiBold">Rp</MpText></MpInputLeftAddon>
        <MpInput id="px-ig1-in" v-model="a" placeholder="0" />
      </MpInputGroup>
    </DemoSection>
    <DemoSection title="Right addon"
      desc="Suffix such as a unit or percentage."
      code="<MpInputGroup id=&quot;g&quot;>
  <MpInput id=&quot;x&quot; v-model=&quot;v&quot; />
  <MpInputRightAddon has-background>%</MpInputRightAddon>
</MpInputGroup>">
      <MpInputGroup id="px-ig2" style="max-width:20rem">
        <MpInput id="px-ig2-in" v-model="b" placeholder="0" />
        <MpInputRightAddon has-background><MpText weight="semiBold">%</MpText></MpInputRightAddon>
      </MpInputGroup>
    </DemoSection>
  </div>
</template>
