<template>
  <!--
    Layout is scoped CSS (not Pixel css()/atomic utilities) on purpose: this lives
    in the always-visible header, and Panda's generated atomic CSS can go stale in
    dev after heavy HMR, which would collapse the flex row (icon/text/kbd stack
    vertically). Scoped styles are compiled per-component and can't drop. We still
    use MpIcon/MpText/MpBadge for tokens + typography.
  -->
  <div data-component="QuickSearch" data-component-group="layout">
    <button type="button" class="quick-search">
      <span class="quick-search__content">
        <MpIcon name="search" color="icon.inverse" />
        <MpText color="text.inverse">Search or jump to...</MpText>
      </span>
      <MpBadge for="tableStatus" class="quick-search__kbd">⌘K</MpBadge>
    </button>
  </div>
</template>

<script setup lang="ts">
import { MpIcon, MpText, MpBadge } from "@mekari/pixel3";
</script>

<style scoped>
.quick-search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 400px; /* fixed — matches production (was css w:"400px"); do not change */
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 0;
  border-radius: var(--mp-radii-full, 999px);
  background: var(
    --mp-colors-background-header-menu-hovered,
    rgba(255, 255, 255, 0.08)
  );
  cursor: pointer;
}

.quick-search:focus-visible {
  /* Neutral slate focus (Color/Gray/Slate400) — consistent with all ERP fields */
  outline: 2px solid #8c9596;
  outline-offset: 2px;
}

.quick-search__content {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  opacity: 0.5;
}

/* ⌘K hint — subtle dark pill, white text, on the dark header */
.quick-search__kbd {
  opacity: 0.5;
  background: rgba(0, 0, 0, 0.25) !important;
  color: var(--mp-colors-text-inverse, #fff) !important;
}
</style>
