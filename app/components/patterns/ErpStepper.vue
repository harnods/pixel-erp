<script setup lang="ts">
/**
 * ErpStepper — a horizontal guided-setup progress header.
 *
 * Shared across the WMS→ERP cutover screens (Chart of accounts · Map products ·
 * Opening balance) so all three read one source of truth for progress. The
 * numbered-badge + check vocabulary is lifted from the existing in-page steppers
 * (ImportWarehousesPage `.iw-step-badge`, HomePage `.setup-step__check`) so it
 * stays visually consistent — this just lays them out horizontally with a
 * connector and adds done/active/upcoming states.
 *
 * A done step (or the current one) is clickable to jump back; upcoming steps are
 * inert until reached (you can't skip ahead of an incomplete step).
 */
import { MpIcon } from '@mekari/pixel3'

interface Step {
  key: string
  label: string
}

const props = defineProps<{
  steps: Step[]
  /** Key of the step currently open. */
  current: string
  /** Keys of the steps that are complete. */
  done: string[]
}>()

const emit = defineEmits<{ (e: 'select', key: string): void }>()

function stateOf(key: string): 'done' | 'active' | 'upcoming' {
  if (key === props.current) return 'active'
  return props.done.includes(key) ? 'done' : 'upcoming'
}

/** Navigable = already completed, or the step you're on. */
function canSelect(key: string): boolean {
  return props.done.includes(key) || key === props.current
}

function onSelect(key: string) {
  if (canSelect(key) && key !== props.current) emit('select', key)
}
</script>

<template>
  <nav class="erp-stepper" aria-label="Setup progress">
    <template v-for="(s, i) in steps" :key="s.key">
      <button
        type="button"
        class="erp-stepper__step"
        :class="[`erp-stepper__step--${stateOf(s.key)}`, { 'erp-stepper__step--clickable': canSelect(s.key) }]"
        :disabled="!canSelect(s.key)"
        :aria-current="s.key === current ? 'step' : undefined"
        @click="onSelect(s.key)"
      >
        <span class="erp-stepper__badge">
          <MpIcon v-if="stateOf(s.key) === 'done'" name="check" size="sm" color="icon.inverse.static" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="erp-stepper__label">{{ s.label }}</span>
      </button>

      <span
        v-if="i < steps.length - 1"
        class="erp-stepper__line"
        :class="{ 'erp-stepper__line--done': done.includes(s.key) }"
        aria-hidden="true"
      />
    </template>
  </nav>
</template>

<style scoped>
.erp-stepper {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  flex-wrap: wrap;
}

.erp-stepper__step {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  margin: 0;
  background: transparent;
  border: 0;
  border-radius: var(--mp-radii-md, 6px);
  font-family: var(--mp-fonts-label, "Inter"), sans-serif;
  text-align: left;
}
.erp-stepper__step--clickable {
  cursor: pointer;
}
.erp-stepper__step--clickable:hover {
  background: var(--mp-background-neutral-hovered, #f0f2f2);
}

/* Badge — 24px circle, mirrors .iw-step-badge / .setup-step__check. */
.erp-stepper__badge {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--mp-radii-full, 999px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--mp-font-sizes-sm, 12px);
  line-height: var(--mp-line-heights-sm, 16px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  font-variant-numeric: tabular-nums;
  background: var(--mp-background-neutral-subtle, #f0f2f2);
  color: var(--mp-text-secondary, #3a4749);
}

.erp-stepper__label {
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary, #3a4749);
  white-space: nowrap;
}

/* Active — dark badge, bold default-colour label. */
.erp-stepper__step--active .erp-stepper__badge {
  background: var(--mp-background-brand-bold, #12b886);
  color: var(--mp-text-inverse-static, #ffffff);
}
.erp-stepper__step--active .erp-stepper__label {
  color: var(--mp-text-default, #080d0e);
  font-weight: var(--mp-font-weights-semi-bold, 600);
}

/* Done — positive badge with the check; label reads as default. */
.erp-stepper__step--done .erp-stepper__badge {
  background: var(--mp-background-positive-bold, #2fa36b);
  color: var(--mp-text-inverse-static, #ffffff);
}
/* Force the check glyph white — MpIcon otherwise keeps its own default colour. */
.erp-stepper__step--done .erp-stepper__badge :deep(svg) {
  color: var(--mp-text-inverse-static, #ffffff);
}
.erp-stepper__step--done .erp-stepper__label {
  color: var(--mp-text-default, #080d0e);
}

/* Connector line between badges. */
.erp-stepper__line {
  flex: 1 1 24px;
  min-width: 16px;
  max-width: 48px;
  height: var(--mp-border-width-md, 2px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-border-default, #e3e7e9);
}
.erp-stepper__line--done {
  background: var(--mp-background-positive-bold, #2fa36b);
}
</style>
