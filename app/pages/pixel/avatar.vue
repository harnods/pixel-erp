<script setup lang="ts">
import { MpAvatar, MpAvatarGroup } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Avatar · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Avatar" tag="MpAvatar / MpAvatarGroup">
    <MpAvatar name="Rizal Candra" size="md" variant-color="green" />
    <MpAvatarGroup :max="3">
      <MpAvatar name="Ana" size="md" variant-color="green" />
      <MpAvatar name="Budi" size="md" variant-color="green" />
      <MpAvatar name="Cici" size="md" variant-color="green" />
      <MpAvatar name="Dedi" size="md" variant-color="green" />
    </MpAvatarGroup>
  </DemoCard>
</template>
