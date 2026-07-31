<template>
  <div data-component="QuickSearch" data-component-group="layout" class="quick-search">
    <SearchBox variant="header" width="400px" placeholder="Search or jump to..." />
  </div>
</template>

<script setup lang="ts">
// The header search reuses the same SearchBox as the Home hero — identical
// expand-to-dropdown behaviour (normal search + AI mode). It drives the Airene
// panel through useAireneBridge (the panel lives in the routed page, below the
// header in the tree, so provide/inject can't reach it).
</script>

<style scoped>
.quick-search {
  display: flex;
  justify-content: center;
}
</style>
