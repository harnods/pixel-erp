<script setup lang="ts">
/**
 * ErpIconSegmented — the icon-only segmented control (e.g. table view / board view).
 *
 * MpSegmentedControl renders each icon with variant="outline" and exposes no
 * per-item variant, so it can't fill the active icon. This wrapper reuses the exact
 * `.mp-segmented-control__*` class names — so the pill shape + active slate fill from
 * erp.css (rule/segmented-control-pill) apply unchanged — and additionally renders the
 * ACTIVE segment's icon with MpIcon variant="fill", matching the sidebar's active-nav
 * fill behaviour. Icon-only; for text segments use MpSegmentedControl.
 */
import { MpIcon } from '@mekari/pixel3'

interface Option { value: string; icon: string; label?: string }
const props = defineProps<{
  id: string
  modelValue: string
  options: Option[]
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div class="mp-segmented-control__root" role="radiogroup">
    <label
      v-for="opt in options" :key="opt.value"
      class="mp-segmented-control__item"
    >
      <input
        class="mp-segmented-control__hidden"
        type="radio"
        :name="id"
        :value="opt.value"
        :checked="opt.value === modelValue"
        :aria-label="opt.label ?? opt.value"
        @change="emit('update:modelValue', opt.value)"
      >
      <span class="mp-segmented-control__control">
        <MpIcon :name="(opt.icon as any)" size="sm" :variant="opt.value === modelValue ? 'fill' : 'outline'" />
      </span>
    </label>
  </div>
</template>
