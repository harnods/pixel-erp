<script setup lang="ts">
/**
 * DisabledReasonTooltip — wraps a form option (MpCheckbox / MpRadio) that may be
 * disabled, and explains WHY on hover (MpTooltip). With no `reason` it renders
 * the option untouched, so the tooltip only exists while the option is disabled.
 * Pair it with the same reason shown inline next to the option — hover alone
 * isn't discoverable (Invite / Edit user, CRM add-on spec: "Disabled options
 * show the reason on hover and inline").
 *
 * The trigger is a plain inline wrapper, not the control itself: a disabled
 * native input does not fire mouse events in every browser. One placement for every
 * option (rule/tooltip-consistent-placement).
 */
import { MpTooltip } from '@mekari/pixel3'

defineProps<{
  id: string
  /** Why the wrapped option is disabled; null/empty = enabled, no tooltip. */
  reason?: string | null
}>()
</script>

<template>
  <MpTooltip v-if="reason" :id="id" :label="reason" placement="top-start" use-portal>
    <span class="drt" :data-disabled-reason="reason"><slot /></span>
  </MpTooltip>
  <slot v-else />
</template>

<style scoped>
.drt { display: inline-flex; max-width: 100%; }
</style>
