<script setup lang="ts">
import ContentList from '~/components/patterns/ContentList.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Content list · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Content list" tag="ContentList" override="Detail-page key/value renderer."
      lead="Renders a key/value pair — a 12px secondary label over a 14px value. Use for every field on a detail/summary page."
      :rules="['rule/detail-contentlist']" />
    <DemoSection title="Default"
      desc="label + value; use the default slot for rich values (badges, links)."
      :rules="['rule/detail-contentlist']"
      code="<ContentList label=&quot;Vendor&quot; value=&quot;PT Maju Jaya&quot; />
<ContentList label=&quot;Due date&quot; value=&quot;23/06/2026&quot; />">
      <div style="width:100%; max-width:24rem">
        <ContentList label="Vendor" value="PT Maju Jaya" />
        <ContentList label="Due date" value="23/06/2026" />
      </div>
    </DemoSection>
  </div>
</template>
