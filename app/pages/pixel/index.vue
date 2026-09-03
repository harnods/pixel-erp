<script setup lang="ts">
useHead({ title: 'Pixel 3 · Enterprise components — Mekari ERP' })
</script>

<template>
  <section class="pxhero">
    <p class="pxhero__eyebrow">Design system · DT 2.4 Enterprise</p>
    <h1 class="pxhero__title">Pixel 3 components</h1>
    <p class="pxhero__lede">
      Every Pixel 3 component in the DT 2.4 Enterprise theme — one page each — plus the
      ERP wrappers that override Pixel defaults. Pick a component from the sidebar. Each
      page renders the component live, links the governing <code>rule/*</code>, and shows
      the correct usage for agents. A red “render failed” card means it is wired wrong.
    </p>
  </section>
</template>

<style scoped>
.pxhero { max-width: 44rem; }
.pxhero__eyebrow {
  text-transform: uppercase; letter-spacing: 0.08em;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  margin-bottom: var(--mp-spacing-2);
}
.pxhero__title { font-size: var(--mp-font-sizes-xxl, 2rem); font-weight: var(--mp-font-weights-bold); margin-bottom: var(--mp-spacing-3); }
.pxhero__lede { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: 1.6; }
code { font-family: var(--mp-font-families-mono, monospace); font-size: 0.9em; }
</style>
