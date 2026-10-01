<template>
  <MpButton
    data-component="IconButton"
    data-component-group="shared"
    variant="ghost"
    :left-icon="icon"
    :class="buttonClass"
    :aria-label="icon"
  >
    <template v-if="showBadge">
      <span :class="badgePingClass" aria-hidden="true" />
      <span :class="badgeClass" aria-hidden="true" />
    </template>
  </MpButton>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { css, MpButton, MpIcon, type IconName } from "@mekari/pixel3";

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

const badgeClass = computed(() =>
  css({
    position: "absolute",
    top: "5px",
    right: "7px",
    width: "3",
    height: "3",
    rounded: "full",
    bg: "red.500",
    border: "2px solid var(--mp-colors-background-header)",
    pointerEvents: "none",
  })
);

const badgePingClass = computed(() =>
  css({
    position: "absolute",
    top: "5px",
    right: "7px",
    width: "3",
    height: "3",
    rounded: "full",
    bg: "teal.300",
    borderColor: "transparent",
    pointerEvents: "none",
    animation: "icon-button-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
  })
);
</script>

<style scoped>
/* @keyframes cannot be defined via css() — kept in a style block */
@keyframes icon-button-ping {
  75%,
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}
</style>
