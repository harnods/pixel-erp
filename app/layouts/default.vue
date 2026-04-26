<template>
  <div class="app-shell">
    <ErpHeader />
    <div class="main-container">
      <ErpSidebar />
      <div class="content-area">
        <slot />
      </div>
    </div>
  </div>
</template>

<style>
/*
 * ── Pixel Token v2.4 — Enterprise theme ─────────────────────────────────────
 *
 * Pixel's PostCSS plugin generates utility classes but does NOT inject semantic
 * CSS custom property definitions globally. We define them here so all custom
 * components (ErpHeader, ErpSidebar, ErpTablePage, etc.) can reference them.
 *
 * Values are the ENTERPRISE theme values from Token v2.4.
 * Source: https://docs.mekari.design/docs/design-token-v2-4.html
 */

:root {
  /* Background */
  --mp-background-surface-bold: #142d26;
  --mp-background-surface: #f8f9f9;
  --mp-background-stage: #ffffff;
  --mp-background-neutral: #ffffff;
  --mp-background-neutral-subtle: #f8f9f9;
  --mp-background-neutral-hovered: #f8f9f9;
  --mp-background-neutral-pressed: #ebf0f1;
  --mp-background-neutral-subtle-hovered: #ebf0f1;
  --mp-background-nav-stack-hovered: #d6f4e9;

  /* Border */
  --mp-border-default: #e3e7e9;
  --mp-border-bold: #8c9596;

  /* Text */
  --mp-text-default: #080d0e;
  --mp-text-inverse: #ffffff;
  --mp-text-secondary: #3a4749;
  --mp-text-selected: #0f6d4d;
  --mp-text-link: #165082;
  --mp-text-disabled: #8c9596;
  --mp-text-danger: #a8352d;

  /* Typography */
  --mp-fonts-body: "Inter", -apple-system, BlinkMacSystemFont, Helvetica, Arial,
    sans-serif;

  /* Radius */
  --mp-radii-md: 0.375rem;

  /* Shadow (Enterprise uses #1D1F2429 as shadow color) */
  --mp-shadows-sm: 0px 10px 15px -3px #1d1f2429, 0px 4px 6px -2px #1d1f2429;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: var(--mp-fonts-body);
  -webkit-font-smoothing: antialiased;
  background: var(--mp-background-surface-bold);
  color: var(--mp-text-default);
}

#__nuxt {
  height: 100%;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  background: var(--mp-background-neutral-subtle);
  border-left: 2px solid var(--mp-background-surface-bold);
  border-right: 2px solid var(--mp-background-surface-bold);
  border-radius: 12px 12px 0 0;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
