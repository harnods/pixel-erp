<script setup lang="ts">
import { MpText } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Drawer · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Drawer" tag="(custom Teleport shell)"
    override="Do NOT use MpDrawer — it has no structural CSS here. Copy the BillsFiltersDrawer Teleport shell."
    :rules="['rule/drawer-custom-shell']"
    snippet="<!-- copy BillsFiltersDrawer.vue: Teleport > overlay > panel > header/body/footer -->">
    <MpText>See <code>docs/patterns/Drawer.md</code> — rendered via a hand-rolled Teleport panel, opened only from a Manage button.</MpText>
  </DemoCard>
</template>
