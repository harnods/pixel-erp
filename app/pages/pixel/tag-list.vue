<script setup lang="ts">
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Tag list · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Tag list" tag="ErpTagList"
    override="Clips to 2 lines with a +N overflow — the ERP table tags renderer.">
    <ErpTagList :tags="['Jakarta', 'Priority', 'Wholesale', 'Recurring']" />
  </DemoCard>
</template>
