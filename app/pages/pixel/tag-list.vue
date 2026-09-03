<script setup lang="ts">
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Tag list · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Tag list" tag="ErpTagList" override="The ERP table tags renderer."
      lead="Renders a list of tags in a table cell, clamped to 2 lines with a +N overflow indicator. Use in table columns of kind 'tags'." />
    <DemoSection title="Default"
      desc="Pass an array of strings; overflow beyond 2 lines collapses into +N."
      code="<ErpTagList :tags=&quot;['Jakarta','Priority','Wholesale','Recurring']&quot; />">
      <div style="width:100%; max-width:20rem"><ErpTagList :tags="['Jakarta','Priority','Wholesale','Recurring','VIP','Net-30']" /></div>
    </DemoSection>
  </div>
</template>
