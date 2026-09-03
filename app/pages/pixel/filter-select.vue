<script setup lang="ts">
import { ref } from 'vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Filter select · Pixel 3 Enterprise' })
const v = ref('')
const options = ['Draft', 'Sent', 'Paid']
</script>
<template>
  <DemoCard title="Filter select" tag="ErpFilterSelect"
    override="The correct dropdown for the ERP — an MpPopover menu, clearable, on-system."
    :rules="['rule/select-erpfilterselect']"
    snippet="<ErpFilterSelect id=&quot;x&quot; v-model=&quot;v&quot; placeholder=&quot;Status&quot; :options=&quot;['Draft','Sent','Paid']&quot; />">
    <ErpFilterSelect id="px-fsel" v-model="v" placeholder="Status" :options="options" />
  </DemoCard>
</template>
