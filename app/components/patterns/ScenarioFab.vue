<script setup lang="ts">
/**
 * ScenarioFab — the prototype "scenario switcher" that sits fixed at the bottom-
 * right of every index page. A black circular FAB (settings icon) opens an
 * MpPopover listing the demo scenarios the page can render. Every index page has
 * at least two: "Default" (populated) and "Empty state". Bind the selected
 * scenario value with v-model.
 *
 * rule/index-scenario-fab — canonical; never hand-roll the fixed FAB again.
 *
 * Usage:
 *   <ScenarioFab v-model="scenario" />                 // Default + Empty state
 *   <ScenarioFab v-model="scenario" :scenarios="[...]" /> // extra scenarios
 * where each scenario is { label, value }. Defaults map Default→'data',
 * Empty state→'empty' (the shape index pages already switch on).
 *
 * Optional: `heading` labels the list, and the default slot renders extra demo
 * controls BELOW the list (e.g. quantity steppers + a footnote — see
 * UsersListPage's CRM seats scenario). With slot content the popover stays open
 * on select so those controls can be used in one go.
 */
import { useSlots } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpButton, MpIcon } from '@mekari/pixel3'

export interface Scenario { label: string; value: string }

withDefaults(defineProps<{
  modelValue: string
  scenarios?: Scenario[]
  ariaLabel?: string
  heading?: string
}>(), {
  scenarios: () => [
    { label: 'Default', value: 'data' },
    { label: 'Empty state', value: 'empty' },
  ],
  ariaLabel: 'Scenario options',
  heading: '',
})

const slots = useSlots()

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="scenario-fab-wrap">
    <MpPopover id="scenario-fab" placement="top-end" use-portal :is-keep-alive="false">
      <MpPopoverTrigger>
        <MpButton class="scenario-fab" variant="ghost" is-rounded :aria-label="ariaLabel">
          <MpIcon name="settings" size="md" />
        </MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :is-close-on-select="!slots.default" class="scenario-fab-content">
        <p v-if="heading" class="scenario-fab-heading">{{ heading }}</p>
        <MpPopoverList>
          <MpPopoverListItem
            v-for="s in scenarios"
            :key="s.value"
            :is-active="s.value === modelValue"
            @click="$emit('update:modelValue', s.value)"
          >
            {{ s.label }}
          </MpPopoverListItem>
        </MpPopoverList>
        <div v-if="slots.default" class="scenario-fab-extra"><slot /></div>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
.scenario-fab-wrap {
  position: fixed;
  right: var(--mp-spacing-6);
  bottom: var(--mp-spacing-6);
  z-index: 1000;
}
/* Circular black FAB — override the ghost MpButton into a fixed 48px inverse-fill
   pill. Always black (the prototype scenario control, not a brand action); icon
   renders white via the inverse text token. */
.scenario-fab {
  width: var(--mp-sizes-12, 48px) !important;
  height: var(--mp-sizes-12, 48px) !important;
  min-width: 0 !important;
  padding: 0 !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  background: var(--mp-background-inverse, #080d0e) !important;
  color: var(--mp-text-inverse, #ffffff) !important;
  box-shadow: var(--mp-shadows-lg); /* pixel-police-allow-shadow: floating action button needs elevation, not a surface card */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}
.scenario-fab-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.scenario-fab-extra {
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
  padding: var(--mp-spacing-3);
}
.scenario-fab:hover { transform: scale(1.05); background: var(--mp-background-inverse, #080d0e) !important; }
.scenario-fab :deep(svg) { color: var(--mp-text-inverse, #ffffff) !important; }
</style>

<!-- Unscoped: the popover content is portalled to <body>. A plain class (not a
     Panda css() call) so the viewport cap always ships, also on the dev server. -->
<style>
.scenario-fab-content {
  min-width: 220px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
</style>
