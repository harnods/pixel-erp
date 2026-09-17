<script setup lang="ts">
useHead({ title: 'For AI agents · Pixel 3 Enterprise' })
</script>
<template>
  <div class="pxagents">
    <h1 class="pxpagetitle">For AI agents</h1>
    <p>
      Build UI from the rules, not from priors. Invoke the <code>pixel-erp-design</code>
      skill or read <code>docs/design/RULES.md</code>. Resolve conflicts highest-wins:
    </p>
    <pre class="pxcode"><code>1. Explicit user goal
2. docs/design/RULES.md   (rule/*)   &#8592; beats any mockup
3. docs/patterns/*
4. Adjacent shipped page
5. General taste          &#8592; lowest</code></pre>
    <p>
      Each component page carries its governing <code>rule/*</code> and a correct-usage
      snippet (expand “For AI agents”). A red card = that component is rendered wrong.
    </p>
  </div>
</template>
<style scoped>
.pxpagetitle { font-size: var(--mp-font-sizes-xl, 1.5rem); font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-4); }
.pxagents { max-width: 44rem; }
.pxagents p { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: 1.6; margin-bottom: var(--mp-spacing-3); }
.pxcode {
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  border: 1px solid var(--mp-border-subtle, #e5e7e7);
  border-radius: var(--mp-radii-md, 8px);
  padding: var(--mp-spacing-4);
  overflow-x: auto;
  margin-bottom: var(--mp-spacing-3);
}
.pxcode code { font-family: var(--mp-font-families-mono, monospace); white-space: pre; font-size: var(--mp-font-sizes-sm); line-height: 1.6; }
code { font-family: var(--mp-font-families-mono, monospace); font-size: 0.9em; }
</style>
