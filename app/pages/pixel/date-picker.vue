<script setup lang="ts">
import { ref } from 'vue'
import { MpDatePicker } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Date picker · Pixel 3 Enterprise' })
const a = ref('')
</script>
<template>
  <div>
    <DemoHeader title="Date picker" tag="MpDatePicker"
      lead="Pick a date. ERP standard display format is DD/MM/YYYY with value-type=&quot;format&quot;."
      :rules="['rule/format-date']" />
    <DemoSection title="Default"
      desc="Always set format=&quot;DD/MM/YYYY&quot; and value-type=&quot;format&quot; for ERP consistency."
      :rules="['rule/format-date']"
      code="<MpDatePicker id=&quot;x&quot; v-model=&quot;v&quot; format=&quot;DD/MM/YYYY&quot; value-type=&quot;format&quot; />">
      <MpDatePicker id="px-dp" v-model="a" format="DD/MM/YYYY" value-type="format" placeholder="DD/MM/YYYY" />
    </DemoSection>
  </div>
</template>
