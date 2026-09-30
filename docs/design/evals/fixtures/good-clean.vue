<!-- expect: none -->
<template>
  <div class="wrap">
    <ErpFilterSelect v-model="status" :options="opts" clearable />
    <MpButton variant="ghost" is-rounded>Cancel</MpButton>
    <MpButton variant="primary" is-rounded>Save changes</MpButton>
    <button class="btn-enterprise btn-enterprise--secondary">Import</button>
  </div>
</template>
<style scoped>
.wrap {
  padding: var(--mp-spacing-4);
  color: var(--mp-text-default);
  border: 1px solid var(--mp-border-subtle);
}
.wrap:focus-within {
  box-shadow: inset 0 0 0 2px var(--mp-border-bold);
}
</style>
