<script setup lang="ts">
import { MpAvatar, MpAvatarGroup } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Avatar · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Avatar" tag="MpAvatar"
      lead="Shows a profile image, initials, or fallback icon. In the ERP the avatar is ALWAYS a circle, the DEFAULT size is lg, and the only other size used is xl. Never sm/md, never the square variant. Falls back to initials from `name` when `src` is missing."
      :rules="['rule/avatar-lg-xl-circle']" />

    <DemoSection title="Size — lg (default) & xl only"
      desc="lg is the default (lists, tables, headers); xl only for large profile headers. Don't use sm or md."
      :rules="['rule/avatar-lg-xl-circle']"
      code="<MpAvatar name=&quot;Dirman&quot; />           <!-- lg, the default -->
<MpAvatar name=&quot;Dirman&quot; size=&quot;xl&quot; />  <!-- xl, profile header only -->">
      <MpAvatar name="Dirman" variant-color="teal" />
      <MpAvatar name="Dirman" size="xl" variant-color="teal" />
    </DemoSection>

    <DemoSection title="Colour"
      desc="variant-color sets the initials background: gray, sky, teal, violet, amber, rose, stone, lime, pink. Always circle."
      :rules="['rule/avatar-lg-xl-circle']"
      code="<MpAvatar name=&quot;Ana&quot; variant-color=&quot;sky&quot; />
<MpAvatar name=&quot;Budi&quot; variant-color=&quot;violet&quot; />">
      <MpAvatar name="Sky" variant-color="sky" />
      <MpAvatar name="Violet" variant-color="violet" />
      <MpAvatar name="Amber" variant-color="amber" />
      <MpAvatar name="Teal" variant-color="teal" />
    </DemoSection>

    <DemoSection title="Group"
      desc="MpAvatarGroup with max collapses the rest into +N. Same lg circle avatars."
      code="<MpAvatarGroup :max=&quot;3&quot;>
  <MpAvatar name=&quot;A&quot; /><MpAvatar name=&quot;B&quot; /><MpAvatar name=&quot;C&quot; /><MpAvatar name=&quot;D&quot; />
</MpAvatarGroup>">
      <MpAvatarGroup :max="3">
        <MpAvatar name="Ana" variant-color="teal" />
        <MpAvatar name="Budi" variant-color="sky" />
        <MpAvatar name="Cici" variant-color="violet" />
        <MpAvatar name="Dedi" variant-color="amber" />
      </MpAvatarGroup>
    </DemoSection>
  </div>
</template>
