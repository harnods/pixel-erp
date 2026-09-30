<script setup lang="ts">
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'ERP button · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="ERP button" tag=".btn-enterprise" deprecated
      lead="DEPRECATED — do not use for new work. The hand-rolled .btn-enterprise class (~1446 legacy call sites). Use Pixel <MpButton> instead (its secondary is already overridden to match). Existing usages are migrated when a file is next touched; this page is kept only to maintain that legacy code."
      :rules="['rule/btn-mpbutton-standard', 'rule/btn-secondary-black', 'rule/btn-cancel-ghost']" />
    <DemoSection title="Variants"
      desc="primary / secondary (black label + dark border) / ghost (regular weight) / danger."
      code="<button class=&quot;btn-enterprise btn-enterprise--primary&quot;>Save</button>
<button class=&quot;btn-enterprise btn-enterprise--secondary&quot;>Import</button>
<button class=&quot;btn-enterprise btn-enterprise--ghost&quot;>Cancel</button>
<button class=&quot;btn-enterprise btn-enterprise--danger&quot;>Delete</button>">
      <button class="btn-enterprise btn-enterprise--primary">Primary</button>
      <button class="btn-enterprise btn-enterprise--secondary">Secondary</button>
      <button class="btn-enterprise btn-enterprise--ghost">Cancel</button>
      <button class="btn-enterprise btn-enterprise--danger">Delete</button>
    </DemoSection>
    <DemoSection title="Sizes"
      desc="Default, sm and xs for progressively denser rows/bulk bars."
      code="<button class=&quot;btn-enterprise btn-enterprise--secondary&quot;>Default</button>
<button class=&quot;btn-enterprise btn-enterprise--secondary btn-enterprise--sm&quot;>Small</button>
<button class=&quot;btn-enterprise btn-enterprise--secondary btn-enterprise--xs&quot;>XS</button>">
      <button class="btn-enterprise btn-enterprise--secondary">Default</button>
      <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm">Small</button>
      <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--xs">XS</button>
    </DemoSection>
  </div>
</template>
