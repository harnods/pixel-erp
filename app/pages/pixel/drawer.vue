<script setup lang="ts">
import { MpText } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Drawer · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Drawer" tag="(custom Teleport shell)" override="Do NOT use MpDrawer."
      lead="A side panel for filters or contextual detail. MpDrawer has no structural CSS in this build (header/footer detach) — copy the hand-rolled BillsFiltersDrawer Teleport shell. Open only via a Manage button."
      :rules="['rule/drawer-custom-shell', 'rule/drawer-header-fill', 'rule/drawer-open-via-manage']" />
    <DemoSection title="Pattern"
      desc="Teleport > overlay (fixed inset, flex end) > panel (margin 12px, radius, column) > header (bg fill) / body (scroll) / footer (ghost Cancel + primary)."
      :rules="['rule/drawer-custom-shell']"
      code="<Teleport to=&quot;body&quot;><Transition name=&quot;x&quot;>
  <div v-if=&quot;open&quot; class=&quot;x-overlay&quot;>
    <div class=&quot;x-panel&quot; role=&quot;dialog&quot;>
      <header class=&quot;x-header&quot;>…</header>
      <div class=&quot;x-body&quot;>…</div>
      <footer class=&quot;x-footer&quot;>ghost Cancel + primary</footer>
    </div>
  </div>
</Transition></Teleport>">
      <MpText>See <code>docs/patterns/Drawer.md</code> and <code>BillsFiltersDrawer.vue</code> for the canonical shell.</MpText>
    </DemoSection>
  </div>
</template>
