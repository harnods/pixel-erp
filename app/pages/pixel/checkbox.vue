<script setup lang="ts">
import { ref } from 'vue'
import { MpCheckbox } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Checkbox · Pixel 3 Enterprise' })
const a = ref(true); const b = ref(false); const c = ref(true)
</script>
<template>
  <div>
    <DemoHeader title="Checkbox" tag="MpCheckbox"
      lead="Toggle between checked, unchecked and indeterminate. Bind a group with v-model (array of values) or a single box with v-model:is-checked."
      :rules="['rule/checkbox-multiline-top']" />
    <DemoSection title="States"
      desc="checked, unchecked, indeterminate, disabled."
      code="<MpCheckbox id=&quot;x&quot; v-model:is-checked=&quot;v&quot;>Label</MpCheckbox>
<MpCheckbox id=&quot;y&quot; :is-indeterminate=&quot;true&quot;>Some selected</MpCheckbox>
<MpCheckbox id=&quot;z&quot; is-disabled>Disabled</MpCheckbox>">
      <MpCheckbox id="px-cb1" v-model:is-checked="a">Checked</MpCheckbox>
      <MpCheckbox id="px-cb2" v-model:is-checked="b">Unchecked</MpCheckbox>
      <MpCheckbox id="px-cb3" :is-indeterminate="true">Indeterminate</MpCheckbox>
      <MpCheckbox id="px-cb4" v-model:is-checked="c" is-disabled>Disabled</MpCheckbox>
    </DemoSection>
    <DemoSection title="With description"
      desc="Use the #description slot for a supporting line under the label. Multi-line label keeps the box top-aligned."
      :rules="['rule/checkbox-multiline-top']"
      code="<MpCheckbox id=&quot;x&quot; v-model:is-checked=&quot;v&quot;>
  Marketing promotion
  <template #description>Send offers and product announcements.</template>
</MpCheckbox>">
      <MpCheckbox id="px-cb5" v-model:is-checked="a">
        Marketing promotion
        <template #description>Send promotional offers, product announcements, and more.</template>
      </MpCheckbox>
    </DemoSection>
  </div>
</template>
