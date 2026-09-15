<script setup lang="ts">
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Tag list · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Tag list" tag="ErpTagList" override="The ERP table tags renderer — chips are real MpTag."
      lead="Renders a list of tags in a table cell using MpTag chips (gray, md), clamped to 2 lines with a 'More' overflow link. Use in table columns of kind 'tags'."
      :rules="['rule/tag-list-mptag', 'rule/tag-gray-only']" />
    <DemoSection title="Default"
      desc="Pass an array of strings; each renders as an MpTag, overflow beyond 2 lines collapses into a 'More' link."
      :rules="['rule/tag-list-mptag']"
      code="<ErpTagList :tags=&quot;['Jakarta','Priority','Wholesale','Recurring']&quot; />">
      <div style="width:100%; max-width:20rem"><ErpTagList :tags="['Jakarta','Priority','Wholesale','Recurring','VIP','Net-30']" /></div>
    </DemoSection>
  </div>
</template>
