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
    height: "36px",
    width: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    rounded: "lg",
    bg: props.isActive ? "#265C58" : undefined,
    _hover: {
      bg: props.isActive ? "#265C58" : "#265C5880"
    },
    _active: {
      bg: "#265C58"
    },
    _focusVisible: {
      outline: "2px solid #B1DF6B",
      outlineOffset: "2px"
    }
  })
);
</script>
