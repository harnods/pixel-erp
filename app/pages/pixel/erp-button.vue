<script setup lang="ts">
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'ERP button · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="ERP button" tag=".btn-enterprise"
    override="Prefer the ERP button classes: secondary = black text + bold border; ghost = regular weight; always pill."
    :rules="['rule/btn-secondary-black', 'rule/btn-ghost-regular', 'rule/btn-cancel-ghost']"
    snippet="<button class=&quot;btn-enterprise btn-enterprise--primary&quot;>Save</button>
<button class=&quot;btn-enterprise btn-enterprise--secondary&quot;>Import</button>
<button class=&quot;btn-enterprise btn-enterprise--ghost&quot;>Cancel</button>
<button class=&quot;btn-enterprise btn-enterprise--danger&quot;>Delete</button>">
    <button class="btn-enterprise btn-enterprise--primary">Primary</button>
    <button class="btn-enterprise btn-enterprise--secondary">Secondary</button>
    <button class="btn-enterprise btn-enterprise--ghost">Cancel</button>
    <button class="btn-enterprise btn-enterprise--danger">Delete</button>
  </DemoCard>
</template>
