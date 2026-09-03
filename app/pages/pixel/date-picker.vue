<script setup lang="ts">
import { ref } from 'vue'
import { MpDatePicker } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Date picker · Pixel 3 Enterprise' })
const v = ref('')
</script>
<template>
  <DemoCard title="Date picker" tag="MpDatePicker"
    :rules="['rule/format-date']"
    snippet="<MpDatePicker id=&quot;x&quot; v-model=&quot;v&quot; format=&quot;DD/MM/YYYY&quot; value-type=&quot;format&quot; />">
    <MpDatePicker id="px-date" v-model="v" format="DD/MM/YYYY" value-type="format" placeholder="DD/MM/YYYY" />
  </DemoCard>
</template>
