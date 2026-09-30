<script setup lang="ts">
import ContentList from '~/components/patterns/ContentList.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Content list · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Content list" tag="ContentList" override="Detail-page key/value renderer."
      lead="Renders a key/value pair. Two layouts: VERTICAL (label 12px secondary stacked over a 14px value) and HORIZONTAL (label left, min 184px + 24px gap, value fills the rest). Use for every field on a detail/summary page."
      :rules="['rule/detail-contentlist', 'rule/content-list-horizontal']" />

    <DemoSection title="Vertical (default)"
      desc="label + value stacked; use the default slot for rich values (badges, links). 8px top/bottom, no gap between label and value."
      :rules="['rule/detail-contentlist']"
      code="<ContentList label=&quot;Vendor&quot; value=&quot;PT Maju Jaya&quot; />
<ContentList label=&quot;Due date&quot; value=&quot;23/06/2026&quot; />">
      <div style="width:100%; max-width:24rem">
        <ContentList label="Vendor" value="PT Maju Jaya" />
        <ContentList label="Due date" value="23/06/2026" />
      </div>
    </DemoSection>

    <DemoSection title="Horizontal — label left / value right"
      desc="Add the `horizontal` prop: label sits left at min 184px, then a 24px gap, then the value fills the remaining width. Same 8px top/bottom padding. Use on detail pages where key/value read as aligned rows."
      :rules="['rule/content-list-horizontal']"
      code="<ContentList horizontal label=&quot;Vendor&quot;    value=&quot;PT Maju Jaya&quot; />
<ContentList horizontal label=&quot;Invoice number&quot; value=&quot;INV-2026-0187&quot; />
<ContentList horizontal label=&quot;Due date&quot;  value=&quot;23/06/2026&quot; />">
      <div style="width:100%; max-width:34rem">
        <ContentList horizontal label="Vendor" value="PT Maju Jaya" />
        <ContentList horizontal label="Invoice number" value="INV-2026-0187" />
        <ContentList horizontal label="Due date" value="23/06/2026" />
      </div>
    </DemoSection>
  </div>
</template>
