<template>
  <div data-component="QuickSearch" data-component-group="layout">
    <button :class="buttonStyles">
      <div :class="contentStyles">
        <MpIcon name="search" color="icon.inverse" />
        <MpText color="text.inverse">Search or jump to...</MpText>
      </div>

      <MpBadge for="tableStatus" :class="badgeStyles">⌘K</MpBadge>
    </button>
  </div>
</template>

<script setup lang="ts">
import { css, MpIcon, MpText, MpBadge } from "@mekari/pixel3";

const buttonStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  w: "400px",
  px: "3",
  py: "2",
  rounded: "full",
  cursor: "pointer",
  bg: "background.header.menu.hovered",
  _hover: {
    bg: "background.header.menu.hovered"
  },
  _focusVisible: {
    outline: "2px solid token(colors.lime.300)",
    outlineOffset: "2px"
  }
});

const contentStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  opacity: "0.5"
});

const badgeStyles = css({
  bg: "nav.parent !important",
  color: "text.inverse !important",
  opacity: "0.5"
});
</script>
