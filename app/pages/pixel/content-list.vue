<script setup lang="ts">
import ContentList from '~/components/patterns/ContentList.vue'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Content list · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Content list" tag="ContentList"
    override="Key/value pairs on detail pages — 12px secondary label over a 14px value."
    :rules="['rule/detail-contentlist']"
    snippet="<ContentList label=&quot;Vendor&quot; value=&quot;PT Maju&quot; />">
    <ContentList label="Vendor" value="PT Maju Jaya" />
    <ContentList label="Due date" value="23/06/2026" />
  </DemoCard>
</template>
