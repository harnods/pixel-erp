<template>
  <MpButton
    data-component="IconButton"
    data-component-group="shared"
    variant="ghost"
    :class="buttonClass"
    :aria-label="icon"
  >
    <!-- Icon color is set explicitly to `icon.inverse` (white) rather than left
         on the ghost button's default dark icon color: these buttons sit on the
         dark header (`background.header`), so the glyph must be white and STAY
         white on hover/active (only the bg fill changes). Same pattern as the
         quick-create "+" (ErpQuickCreateMenu). -->
    <MpIcon :name="icon" color="icon.inverse" />
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
    // Ghost MpButton ships a 1px border that shows as an outlined box on
    // hover/focus — the "+" trigger kills it (border: none). Match that: only the
    // translucent fill should change, never a visible border.
    border: "none",
    // Fills match the quick-create "+" trigger (ErpQuickCreateMenu) EXACTLY: a
    // subtle translucent-white veil over the dark header, NOT the Panda
    // `background.surface.bold.*` tokens — those resolve to an opaque near-white
    // (#f8f9f9) in this build, which paints a light box on the dark header and
    // washes out the white icon. Literal rgba keeps the glyph readable.
    bg: props.isActive ? "rgba(255, 255, 255, 0.2)" : undefined,
    _hover: {
      bg: props.isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.12)"
    },
    _active: {
      bg: "rgba(255, 255, 255, 0.2)"
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
