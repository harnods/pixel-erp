<template>
  <button
    data-component="IconButton"
    data-component-group="shared"
    :class="buttonClass"
  >
    <MpIcon :name="icon" color="icon.inverse" />
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
}

const props = defineProps<IconButtonProps>();

const buttonClass = computed(() =>
  css({
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
