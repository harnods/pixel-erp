<script setup lang="ts">
import { MpSkeleton } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Skeleton · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Skeleton" tag="MpSkeleton"
      lead="Placeholder blocks shown while content loads — preserves layout, no spinner over blank space. In the ERP a skeleton is SOLID and STATIC (no shimmer gradient, no animation) and shows exactly 3 rows/bars. In tables this is automatic via ErpTablePage :loading; the raw component needs duration='0s' + the flatten class."
      :rules="['rule/skeleton-solid-static', 'rule/skeleton-3-rows']" />

    <DemoSection title="Loading rows — solid, static, 3 bars"
      desc="The ERP look: no gradient, no animation, exactly 3 bars. Each MpSkeleton gets duration='0s' and a class that sets background-image:none + background-color var(--mp-border-default) + animation:none."
      :rules="['rule/skeleton-solid-static', 'rule/skeleton-3-rows']"
      code="<!-- ErpTablePage does this for you: -->
<ErpTablePage :loading=&quot;isFirstLoad&quot; ... />

<!-- Raw MpSkeleton (solid + static) — .erp-skeleton / .cw-skeleton do this: -->
<MpSkeleton class=&quot;erp-skeleton&quot; width=&quot;60%&quot; height=&quot;14px&quot; rounded=&quot;sm&quot; duration=&quot;0s&quot; />
<MpSkeleton class=&quot;erp-skeleton&quot; width=&quot;90%&quot; height=&quot;14px&quot; rounded=&quot;sm&quot; duration=&quot;0s&quot; />
<MpSkeleton class=&quot;erp-skeleton&quot; width=&quot;75%&quot; height=&quot;14px&quot; rounded=&quot;sm&quot; duration=&quot;0s&quot; />

/* the flatten class */
.erp-skeleton {
  background-image: none !important;
  background-color: var(--mp-border-default) !important;
  animation: none !important;
}">
      <div style="width:100%; display:flex; flex-direction:column; gap:8px">
        <MpSkeleton class="pk-skel" width="60%" height="14px" rounded="sm" duration="0s" />
        <MpSkeleton class="pk-skel" width="90%" height="14px" rounded="sm" duration="0s" />
        <MpSkeleton class="pk-skel" width="75%" height="14px" rounded="sm" duration="0s" />
      </div>
    </DemoSection>

    <DemoSection title="Don't — Pixel default (animated shimmer gradient)"
      desc="Off-standard for the ERP: the raw MpSkeleton default animates a shimmer gradient. Never ship this — flatten it per rule/skeleton-solid-static."
      :rules="['rule/skeleton-solid-static']"
      code="<!-- ✗ animated gradient — not the ERP look -->
<MpSkeleton width=&quot;60%&quot; height=&quot;14px&quot; rounded=&quot;sm&quot; />">
      <div style="width:100%; display:flex; flex-direction:column; gap:8px">
        <MpSkeleton width="60%" height="14px" rounded="sm" />
        <MpSkeleton width="90%" height="14px" rounded="sm" />
        <MpSkeleton width="75%" height="14px" rounded="sm" />
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
/* Match the real ERP skeleton — solid fill, no shimmer gradient, no animation.
   Use the fully-qualified --mp-colors-* token (+ hex fallback): the short alias
   --mp-border-default resolves EMPTY in scoped CSS, which made the bar transparent. */
.pk-skel, .pk-skel :deep(*) {
  background-image: none !important;
  background-color: var(--mp-colors-border-default, #dcdfe4) !important;
  animation: none !important;
}
</style>
