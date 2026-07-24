<template>
  <button
    data-component="IconButton"
    data-component-group="shared"
    :class="buttonClass"
  >
    <MpIcon :name="icon" color="icon.inverse" />
    <template v-if="showBadge">
      <span class="icon-button__badge-ping" aria-hidden="true" />
      <span class="icon-button__badge" aria-hidden="true" />
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { css, MpIcon, type IconName } from "@mekari/pixel3";

/**
 * Props for IconButton component
 */
interface IconButtonProps {
  /** Icon name from the Pixel3 icon set */
  icon: IconName;
  /** Visual active/pressed state. Changes background color when true */
  isActive?: boolean;
  /** Small red dot in the top-right corner — signals unread/pending items */
  showBadge?: boolean;
}

const props = defineProps<IconButtonProps>();

const buttonClass = computed(() =>
  css({
    position: "relative",
    height: "9",
    width: "9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    rounded: "lg",
    bg: props.isActive ? "background.surface.bold.pressed" : undefined,
    _hover: {
      bg: props.isActive ? "background.surface.bold.pressed" : "background.surface.bold.hovered"
    },
    _active: {
      bg: "background.surface.bold.pressed"
    },
    _focusVisible: {
      outline: "2px solid token(colors.focus)",
      outlineOffset: "2px"
    }
  })
);
</script>

<style scoped>
/* Matches Jurnal's header notification dot: small red circle with a border
   matching the surrounding surface, so it reads as a cutout rather than a
   flat overlay. A second identically-positioned circle pulses outward and
   fades behind it (Jurnal's "ping" ring) to draw the eye on load. */
.icon-button__badge,
.icon-button__badge-ping {
  position: absolute;
  top: 5px;
  right: 7px;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: var(--mp-colors-red-500, #ef4444);
  border: 2px solid var(--mp-colors-background-header, #142d26);
  pointer-events: none;
}

.icon-button__badge-ping {
  animation: icon-button-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes icon-button-ping {
  75%,
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}
</style>
