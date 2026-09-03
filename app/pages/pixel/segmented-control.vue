<script setup lang="ts">
import { ref } from 'vue'
import { MpSegmentedControl } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Segmented control · Pixel 3 Enterprise' })
const a = ref('list')
</script>
<template>
  <div>
    <DemoHeader title="Segmented control" tag="MpSegmentedControl"
      lead="Switch between a few mutually-exclusive views (e.g. List / Board). For 2-3 options that are all visible at once. Use THIS for segmented switches — never a MpButtonGroup of toggle buttons." />
    <DemoSection title="Default"
      desc="data is an array of { label, value }; bind the choice with v-model."
      code="const data = [{ label: 'List', value: 'list' }, { label: 'Board', value: 'board' }]
<MpSegmentedControl id=&quot;x&quot; name=&quot;x&quot; v-model=&quot;v&quot; :data=&quot;data&quot; />">
      <MpSegmentedControl id="px-seg" name="px-seg" v-model="a" :data="[{label:'List',value:'list'},{label:'Board',value:'board'}]" />
    </DemoSection>
  </div>
</template>
