<script setup lang="ts">
import { ref } from 'vue'
import { MpSelect } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Select · Pixel 3 Enterprise' })
const v = ref('')
const options = ['Draft', 'Sent', 'Paid']
</script>
<template>
  <DemoCard title="Select (Pixel)" tag="MpSelect"
    override="Do NOT use MpSelect for filters/dropdowns — it renders the OS dropdown. Use ErpFilterSelect."
    :rules="['rule/select-erpfilterselect']">
    <MpSelect id="px-sel" v-model="v" :options="options" placeholder="Status" />
  </DemoCard>
</template>
