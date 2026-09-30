<!-- expect: rule/select-erpfilterselect rule/drawer-custom-shell rule/token-no-raw-html -->
<template>
  <div>
    <MpSelect v-model="status" :options="opts" />
    <select v-model="type"><option>A</option></select>
    <MpDrawer :open="open">Filters</MpDrawer>
  </div>
</template>
